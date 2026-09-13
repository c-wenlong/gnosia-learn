import {
  asset,
  assetTopic,
  concept,
  conceptPrerequisite,
  indexRun,
  learner,
  LOCAL_LEARNER_ID,
  mastery,
  mirror,
  topic,
} from "@self-learn/schema";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { IndexError } from "../src/index/errors";
import type { Indexer, SourceRows } from "../src/index/source";
import { writeSource } from "../src/index/writer";
import { applyMigrations } from "../src/migrations";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * The writer on its own: rows in, database changed, no files.
 *
 * The three things worth proving here are the three that would be silent bugs.
 * A row the source stopped producing has to go. A row it still produces has to
 * be updated, not deleted and reinserted, because the state tables cascade off
 * it. And one source's prune must not touch another's assets.
 */

const reachable = await probe();

/** A stand-in source that produces whatever the test hands it. */
function fakeIndexer(overrides: Partial<Indexer> = {}): Indexer {
  return {
    source: "concepts",
    owns: ["concept", "conceptPrerequisite"],
    assetPrefix: "note:",
    root: () => "learn/concepts",
    read: async () => ({ rows: {} }),
    ...overrides,
  };
}

describe.skipIf(!reachable.ok)("writer", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    // Content only. The learner row is seeded once and outlives every case, so
    // the "does a reindex destroy mastery" test has something to destroy.
    await scratch.db.delete(mastery);
    await scratch.db.delete(mirror);
    await scratch.db.delete(assetTopic);
    await scratch.db.delete(conceptPrerequisite);
    await scratch.db.delete(asset);
    await scratch.db.delete(concept);
    await scratch.db.delete(topic);
    await scratch.db.delete(indexRun);
    await scratch.db
      .insert(learner)
      .values({ id: LOCAL_LEARNER_ID, displayName: "test" })
      .onConflictDoNothing();
    await scratch.db.insert(topic).values({ slug: "alpha", title: "Alpha", domain: "one" });
  });

  const write = (rows: SourceRows, indexer = fakeIndexer()) =>
    writeSource(scratch.db, indexer, rows, [], "learn/concepts");

  it("inserts, then prunes what the source stopped producing", async () => {
    await write({
      concept: [
        { slug: "a", title: "A", topicSlug: "alpha", path: "learn/concepts/x/a.md" },
        { slug: "b", title: "B", topicSlug: "alpha", path: "learn/concepts/x/b.md" },
      ],
    });
    expect(await scratch.db.select().from(concept)).toHaveLength(2);

    const second = await write({
      concept: [{ slug: "a", title: "A", topicSlug: "alpha", path: "learn/concepts/x/a.md" }],
    });

    const remaining = await scratch.db.select().from(concept);
    expect(remaining.map((r) => r.slug)).toEqual(["a"]);
    expect(second.deleted["concept"]).toBe(1);
    // The prune names what it removed, because the removal cascades.
    expect(second.deletedKeys).toEqual(["concept b"]);
  });

  it("updates a changed row rather than replacing it, so learner state survives", async () => {
    await write({
      concept: [
        { slug: "a", title: "A", summary: "first", topicSlug: "alpha", path: "learn/concepts/x/a.md" },
      ],
    });
    const before = (await scratch.db.select().from(concept).where(eq(concept.slug, "a")))[0];

    await scratch.db.insert(mastery).values({
      learnerId: LOCAL_LEARNER_ID,
      conceptSlug: "a",
      pL: 0.75,
      observations: 4,
      correct: 3,
    });

    await write({
      concept: [
        { slug: "a", title: "A", summary: "second", topicSlug: "alpha", path: "learn/concepts/x/a.md" },
      ],
    });

    const after = (await scratch.db.select().from(concept).where(eq(concept.slug, "a")))[0];
    expect(after?.summary).toBe("second");
    // Same row: created_at is when the catalog first saw it, and re-indexing is
    // not a new sighting.
    expect(after?.createdAt.getTime()).toBe(before?.createdAt.getTime());
    // And the belief built from four observations is still there.
    const belief = await scratch.db.select().from(mastery).where(eq(mastery.conceptSlug, "a"));
    expect(belief).toHaveLength(1);
    expect(belief[0]?.pL).toBe(0.75);
  });

  it("clears a column the source stopped supplying", async () => {
    await write({
      concept: [
        { slug: "a", title: "A", summary: "had one", topicSlug: "alpha", path: "learn/concepts/x/a.md" },
      ],
    });
    await write({
      concept: [{ slug: "a", title: "A", topicSlug: "alpha", path: "learn/concepts/x/a.md" }],
    });
    const row = (await scratch.db.select().from(concept).where(eq(concept.slug, "a")))[0];
    expect(row?.summary).toBeNull();
  });

  it("replaces link rows, so a link the source dropped disappears", async () => {
    const rows = (prerequisites: string[]): SourceRows => ({
      concept: [
        { slug: "a", title: "A", topicSlug: "alpha", path: "learn/concepts/x/a.md" },
        { slug: "b", title: "B", topicSlug: "alpha", path: "learn/concepts/x/b.md" },
      ],
      conceptPrerequisite: prerequisites.map((p) => ({
        conceptSlug: "a",
        prerequisiteSlug: p,
        kind: "requires",
      })),
    });

    await write(rows(["b"]));
    expect(await scratch.db.select().from(conceptPrerequisite)).toHaveLength(1);

    const second = await write(rows([]));
    expect(await scratch.db.select().from(conceptPrerequisite)).toHaveLength(0);
    expect(second.deleted["concept_prerequisite"]).toBe(1);
  });

  it("reports no deletion when a run rewrites the same links", async () => {
    const rows: SourceRows = {
      concept: [
        { slug: "a", title: "A", topicSlug: "alpha", path: "learn/concepts/x/a.md" },
        { slug: "b", title: "B", topicSlug: "alpha", path: "learn/concepts/x/b.md" },
      ],
      conceptPrerequisite: [{ conceptSlug: "a", prerequisiteSlug: "b", kind: "requires" }],
    };
    await write(rows);
    const second = await write(rows);
    // Churn is not loss. Reporting the delete-and-reinsert as a deletion would
    // make every run look destructive.
    expect(second.deleted["concept_prerequisite"]).toBeUndefined();
    expect(second.totalDeleted).toBe(0);
  });

  it("prunes only its own assets, never another source's", async () => {
    const notes = fakeIndexer();
    const diagrams = fakeIndexer({
      source: "diagrams",
      owns: [],
      assetPrefix: "diagram:",
      root: () => "learn/assets",
    });

    await writeSource(
      scratch.db,
      notes,
      {
        concept: [{ slug: "a", title: "A", topicSlug: "alpha", path: "learn/concepts/x/a.md" }],
        asset: [
          {
            id: "note:learn/concepts/x/a.md",
            kind: "note",
            path: "learn/concepts/x/a.md",
            sourceRepo: "self-learn",
          },
        ],
      },
      [],
      "learn/concepts",
    );

    // The diagrams source produces nothing at all. Its prune must still leave
    // the note asset alone.
    await writeSource(scratch.db, diagrams, {}, [], "learn/assets");

    const remaining = await scratch.db.select().from(asset);
    expect(remaining.map((r) => r.id)).toEqual(["note:learn/concepts/x/a.md"]);
  });

  it("refuses an asset id outside the source's namespace", async () => {
    await expect(
      write({
        asset: [
          { id: "manimkc:out/x.mp4", kind: "video", path: "out/x.mp4", sourceRepo: "manimkc" },
        ],
      }),
    ).rejects.toThrow(IndexError);
  });

  describe("mirror rows", () => {
    /** The source that writes them owns no tables and mints no asset ids. */
    const mirrors = fakeIndexer({
      source: "mirrors",
      owns: [],
      assetPrefix: undefined,
      root: () => "/checkout/manimkc",
    });

    const video = {
      id: "manimkc:out/a/one.mp4",
      kind: "video" as const,
      path: "out/a/one.mp4",
      sourceRepo: "manimkc" as const,
    };

    const row = (destination: string, status: string, at: string) => ({
      assetId: video.id,
      destination,
      root: `/mnt/${destination}`,
      status,
      compared: "sha256",
      bytes: 10,
      mtime: new Date(at),
      checkedAt: new Date(at),
    });

    beforeEach(async () => {
      await scratch.db.insert(asset).values(video);
    });

    const audit = (destinations: string[], rows: ReturnType<typeof row>[]) =>
      writeSource(scratch.db, mirrors, { mirror: rows }, [], "/checkout/manimkc", {
        scope: { mirrorDestinations: destinations },
        metadata: { destinations },
      });

    it("leaves an unaudited destination's rows exactly where they were", async () => {
      await audit(
        ["drive", "seafile"],
        [row("drive", "present", "2026-09-01T00:00:00Z"), row("seafile", "stale", "2026-09-01T00:00:00Z")],
      );

      // The next run cannot reach Seafile. Clearing its row would turn "I did
      // not look" into "there is nothing there".
      await audit(["drive"], [row("drive", "stale", "2026-09-13T00:00:00Z")]);

      const rows = await scratch.db.select().from(mirror).orderBy(asc(mirror.destination));
      expect(rows.map((r) => [r.destination, r.status, r.checkedAt.toISOString()])).toEqual([
        ["drive", "stale", "2026-09-13T00:00:00.000Z"],
        ["seafile", "stale", "2026-09-01T00:00:00.000Z"],
      ]);
    });

    it("drops a file the audited destination stopped reporting", async () => {
      const other = { ...video, id: "manimkc:out/a/two.mp4", path: "out/a/two.mp4" };
      await scratch.db.insert(asset).values(other);
      await audit(
        ["drive"],
        [
          row("drive", "present", "2026-09-01T00:00:00Z"),
          { ...row("drive", "present", "2026-09-01T00:00:00Z"), assetId: other.id },
        ],
      );
      expect(await scratch.db.select().from(mirror)).toHaveLength(2);

      await audit(["drive"], [row("drive", "present", "2026-09-13T00:00:00Z")]);
      const rows = await scratch.db.select().from(mirror);
      expect(rows.map((r) => r.assetId)).toEqual([video.id]);
    });

    it("refuses a row for a destination the run did not declare it audited", async () => {
      // Such a row would be inserted once and then never cleared again, because
      // the delete is scoped by destination and nothing would ever name it.
      await expect(audit(["drive"], [row("seafile", "present", "2026-09-13T00:00:00Z")])).rejects.toThrow(
        /did not declare it audited/,
      );
    });

    it("keeps what the run saw on index_run.metadata", async () => {
      await audit(["drive"], [row("drive", "present", "2026-09-13T00:00:00Z")]);
      const run = (
        await scratch.db.select().from(indexRun).where(eq(indexRun.source, "mirrors"))
      )[0];
      expect(run?.metadata).toEqual({ destinations: ["drive"] });
    });
  });

  it("records the run, and overwrites it on the next one", async () => {
    await write({ concept: [] });
    const first = (await scratch.db.select().from(indexRun))[0];
    expect(first?.source).toBe("concepts");
    expect(first?.sourceRoot).toBe("learn/concepts");

    await write({
      concept: [{ slug: "a", title: "A", topicSlug: "alpha", path: "learn/concepts/x/a.md" }],
    });
    const runs = await scratch.db.select().from(indexRun);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.written).toBe(1);
    expect(runs[0]?.counts).toEqual({ concept: 1 });
    expect(runs[0]?.finishedAt.getTime()).toBeGreaterThanOrEqual(runs[0]!.startedAt.getTime());
  });
});
