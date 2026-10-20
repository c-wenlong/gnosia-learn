import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  catalogInstance,
  collection,
  concept,
  conceptCurriculumItem,
  contentRevision,
  curriculumItem,
  learner,
  LOCAL_LEARNER_ID,
  preference,
  progress,
  recap,
  topic,
} from "@self-learn/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { doctor } from "../src/commands/doctor";
import { formatHistory } from "../src/commands/revisions";
import { diffRevisions, diffSnapshots, history, lineDiff } from "../src/content/history";
import type { Snapshot } from "../src/content/snapshot";
import {
  COMPLETENESS_RULES,
  setTriggers,
  triggerStates,
  WRITE_GUARDED_TABLES,
  writeGuardName,
} from "../src/content/rules";
import { lockTypes } from "../src/content/revisions";
import { ContentWriteError, writeContent, writeContents, type WriteContentInput } from "../src/content/write";
import { connect, inTransaction } from "../src/db";
import { DEFAULT_DATABASE_PATH } from "../src/env";
import type { Indexer, SourceRows } from "../src/index/source";
import { writeSource } from "../src/index/writer";
import { BLOB_CONTRACT_MIGRATION, blobContractDistance, describeDistance } from "../src/content/blob-contract";
import { applyMigrations, migrateHolding, migrationStatus } from "../src/migrations";
import { partialMigrations } from "./partial-migrations";
import {
  createScratchDatabase,
  migratedScratchDatabase,
  probe,
  type Scratch,
  sqlMessage,
  sqlstate,
} from "./scratch-database";

/**
 * Phase 0 of docs/CONTENT-MIGRATION.md: the expand migration (0.2) and the
 * write seam (0.3).
 *
 * Every trigger here is exercised on a scratch database rather than reasoned
 * about: the append-only pair, the write guard armed on one table, the three
 * completeness rules armed together, and the copy guard. They are created
 * disabled (all but append-only and the copy guard), so each test that arms
 * one disarms it again or owns its database.
 */

const reachable = await probe();

const SQLSTATE = {
  checkViolation: "23514",
  restrictViolation: "23001",
  foreignKeyViolation: "23503",
  insufficientPrivilege: "42501",
  readOnly: "25006",
} as const;

/** The first migration tag after 0009, whatever number it took at merge. */
const THROUGH_0009 = 10;

function topicWrite(
  slug: string,
  title: string,
  base: number | null,
  extra: Partial<WriteContentInput> = {},
): WriteContentInput {
  return {
    type: "topic",
    id: slug,
    next: { row: { slug, title, domain: "testing" } },
    base,
    author: "local",
    authorKind: "person",
    reason: `set ${slug} to ${title}`,
    owner: "local",
    ...extra,
  };
}

function tagWrite(id: string, label: string, base: number | null): WriteContentInput {
  return {
    owner: "local",
    type: "tag",
    id,
    next: { row: { id, label } },
    base,
    author: "local",
    authorKind: "person",
    reason: `set ${id} to ${label}`,
  };
}

/** SQLite exposes no waiting-connection list; `begin immediate` waits its busy timeout instead. */
async function waitingOnLock(_db: Scratch["db"], _pid: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

/** A stand-in for the courses indexer, owning what it owns. */
const coursesIndexer: Indexer = {
  source: "courses",
  owns: ["collection", "curriculumItem", "collectionItem", "curriculumItemTopic", "conceptCurriculumItem"],
  assetPrefix: "link:",
  root: () => "content/courses",
  read: async () => ({ rows: {} }),
};

/** One course, one module, the given items, each with the given concepts. */
function courseRows(items: Record<string, string[]>): SourceRows {
  return {
    collection: [
      { id: "zz1000", kind: "course", slug: "zz1000", title: "ZZ", parentId: null, position: 1, metadata: {} },
      { id: "zz1000-m1", kind: "module", slug: "m1", title: "M1", parentId: "zz1000", position: 1, metadata: {} },
    ],
    collectionItem: [{ collectionId: "zz1000-m1", position: 0, topicSlug: "alpha", conceptSlug: null, assetId: null }],
    curriculumItem: Object.keys(items).map((id, index) => ({
      id,
      collectionId: "zz1000-m1",
      position: index + 1,
      title: id,
      subtopics: [],
    })),
    curriculumItemTopic: Object.keys(items).map((id) => ({ curriculumItemId: id, topicSlug: "alpha" })),
    conceptCurriculumItem: Object.entries(items).flatMap(([id, concepts]) =>
      concepts.map((slug, index) => ({ conceptSlug: slug, curriculumItemId: id, position: index + 1 })),
    ),
  };
}

describe.skipIf(!reachable.ok)("the expand migration", () => {
  it("applies to an empty database: the seed rows, the extension, every trigger in its state", async () => {
    const scratch = await createScratchDatabase();
    try {
      await applyMigrations(scratch.db);

      expect(await scratch.db.select({ id: learner.id }).from(learner)).toEqual([{ id: LOCAL_LEARNER_ID }]);
      const [instance] = await scratch.db.select().from(catalogInstance);
      expect(instance?.role).toBe("primary");
      const ext = await scratch.db.execute<{ n: number }>(
        sql`select similarity('catalog', 'catalog') as n`,
      );
      expect(ext.rows[0]?.n).toBe(1);

      // Every trigger the registry names exists, and is disabled.
      const named = [
        ...COMPLETENESS_RULES.flatMap((rule) => rule.triggers.map(([, trigger]) => trigger)),
        ...WRITE_GUARDED_TABLES.map(writeGuardName),
      ];
      const states = await triggerStates(scratch.db, named);
      expect([...states.keys()].sort()).toEqual([...new Set(named)].sort());
      expect([...states.values()].every((enabled) => !enabled)).toBe(true);

      // The two new append-only tables are guarded from the start, and every
      // table but `catalog_instance` carries the copy guard, enabled.
      const { rows } = await scratch.db.execute<{ table: string; trigger: string }>(sql`
        select tbl_name as "table", name as trigger from sqlite_master where type = 'trigger'`);
      const enabled = new Set(rows.map((r) => r.trigger));
      for (const name of [
        "content_revision_no_update",
        "content_revision_no_delete",
        "session_log_entry_no_update",
        "session_log_entry_no_delete",
      ]) {
        expect(enabled.has(name), name).toBe(true);
      }
      const tables = await scratch.db.execute<{ name: string }>(
        sql`select name from sqlite_master where type = 'table'`,
      );
      for (const { name } of tables.rows) {
        // Not catalog tables of ours: SQLite's own, the migrator's journal,
        // and the deferred-rule arming table carry no copy guard.
        if (name === "catalog_instance" || name === "catalog_armed_rule" || name.startsWith("sqlite_") || name.startsWith("__drizzle")) continue;
        // One Postgres guard is three SQLite triggers, one per event.
        expect(enabled.has(`${name}_copy_guard_ins`), `${name}_copy_guard_ins`).toBe(true);
      }
    } finally {
      await scratch.drop();
    }
  }, 60_000);

  // Postgres staged this: migrations before owner_id left a database with
  // content but no learner, and the expand migration backfilled both. The
  // consolidated SQLite schema creates learner, owner_id and every table at
  // once — `delete from learner` hits topic.owner_id's foreign key — so the
  // only "indexed but never studied" database left is a Postgres one, which
  // scripts/pg-to-sqlite.mjs and its port-time seeding own instead.
  it.skip("seeds the learner before owner_id, so a database indexed but never studied migrates", async () => {
    const scratch = await createScratchDatabase();
    try {
      await applyMigrations(scratch.db, { folder: await partialMigrations(THROUGH_0009) });
      // Indexed but never studied: content rows and no learner. Every state
      // write creates the row on first use, so a catalog that was only ever
      // indexed has none.
      await scratch.db.execute(
        sql`insert into topic (slug, title, domain) values ('alpha', 'Alpha', 'one'), ('beta', 'Beta', 'one')`,
      );
      await scratch.db.execute(sql`delete from learner`);
      expect((await scratch.db.execute(sql`select 1 from learner`)).rows).toHaveLength(0);

      await applyMigrations(scratch.db);

      const status = await migrationStatus(scratch.db);
      expect(status.pending).toEqual([]);
      expect(await scratch.db.select({ id: learner.id }).from(learner)).toEqual([{ id: LOCAL_LEARNER_ID }]);
      const owners = await scratch.db.select({ slug: topic.slug, owner: topic.ownerId }).from(topic).orderBy(asc(topic.slug));
      expect(owners).toEqual([
        { slug: "alpha", owner: LOCAL_LEARNER_ID },
        { slug: "beta", owner: LOCAL_LEARNER_ID },
      ]);
    } finally {
      await scratch.drop();
    }
  }, 60_000);

  it("applies to a copy of the local self_learn database", async (ctx) => {
    // The owner's real data, read only as a file to copy. Absent (CI), empty,
    // or just never migrated: each skips with the reason. Nothing here writes
    // the owner's file; every check and write is on the copy.
    const source = DEFAULT_DATABASE_PATH;
    if (!existsSync(source)) ctx.skip(`no ${source} to copy`);
    const scratch = await createScratchDatabase();
    try {
      copyFileSync(source, scratch.url);
      const copy = connect({ url: scratch.url, copyOk: true });
      try {
        // A file with no catalog in it is not a local self_learn to migrate a
        // copy of: there is nothing for the migration to carry over, and the
        // counts below would have no table to read.
        const catalog = await copy.db.execute<{ name: string | null }>(
          sql`select name from sqlite_master where type = 'table' and name = 'topic'`,
        );
        if (catalog.rows[0]?.name == null) {
          ctx.skip("self_learn holds no catalog (no topic table): it was never migrated, as on CI");
        }
        const before = await copy.db.execute<{ n: number }>(sql`select count(*) as n from topic`);
        // The SQLite journal is consolidated: a copy whose `__drizzle_migrations`
        // does not already match it cannot be partially brought forward the
        // way Postgres migrations could — that case belongs to the port script.
        if ((await migrationStatus(copy.db)).pending.length > 0) {
          ctx.skip("the copy's migration journal is not this checkout's consolidated SQLite one");
        }
        // Holding the contract migration (0013) back while the owner's
        // videos are not uploaded: its guard would otherwise roll the whole
        // run back. Everything before it applies either way.
        // Registered here as it was until the cut-over, so a copy of a
        // database that has not applied it yet still migrates.
        const held = await migrateHolding(copy.db, {
          contracts: { [BLOB_CONTRACT_MIGRATION]: async (db) => describeDistance(await blobContractDistance(db)) },
        });
        const status = await migrationStatus(copy.db);
        expect(status.pending).toEqual(held.map((h) => h.tag));
        expect(held.map((h) => h.tag)).toEqual(held.length === 0 ? [] : ["0013_asset_blob_contract"]);
        const after = await copy.db.execute<{ n: number; owned: number }>(
          sql`select count(*) as n, count(*) filter (where owner_id = 'local') as owned from topic`,
        );
        expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
        expect(after.rows[0]?.owned).toBe(after.rows[0]?.n);
        const learners = await copy.db.execute(sql`select 1 from learner where id = 'local'`);
        expect(learners.rows).toHaveLength(1);
        const report = await doctor(copy.db, "copy");
        expect(report.ok).toBe(true);
      } finally {
        await copy.close();
      }
    } finally {
      await scratch.drop();
    }
  }, 120_000);
});



describe.skipIf(!reachable.ok)("the write seam", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await scratch.db.insert(topic).values({ slug: "alpha", title: "Alpha", domain: "one" });
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("creates, then updates, chaining each revision to the one before", async () => {
    const created = await writeContent(scratch.db, topicWrite("seam-one", "First", null));
    expect(created.changed).toBe(true);
    expect(created.op).toBe("create");
    expect(created.seq).toBe(1);
    expect(created.hash).toMatch(/^[0-9a-f]{64}$/);

    const updated = await writeContent(scratch.db, topicWrite("seam-one", "Second", created.revisionId));
    expect(updated.op).toBe("update");
    expect(updated.seq).toBe(2);

    const revisions = await history(scratch.db, "topic", "seam-one");
    expect(revisions.map((r) => [r.seq, r.op, r.previousId])).toEqual([
      [1, "create", null],
      [2, "update", created.revisionId],
    ]);
    expect(revisions[1]?.reason).toBe("set seam-one to Second");
    expect(revisions[1]?.author).toBe("local");

    const diff = await diffRevisions(scratch.db, updated.revisionId);
    expect(diff.from?.id).toBe(created.revisionId);
    expect(diff.changes).toEqual([
      { path: "entity.title", kind: "changed", before: "First", after: "Second" },
    ]);
  });

  it("refuses a write whose base is not the latest revision, and changes nothing (edge case 16)", async () => {
    const first = await writeContent(scratch.db, topicWrite("seam-race", "A", null));
    const second = await writeContent(scratch.db, topicWrite("seam-race", "B", first.revisionId));

    // A second writer that started from the first revision.
    const late = writeContent(scratch.db, topicWrite("seam-race", "C", first.revisionId));
    await expect(late).rejects.toBeInstanceOf(ContentWriteError);
    await expect(late).rejects.toThrow(`revision ${second.revisionId}`);

    // And one that thinks the topic does not exist yet.
    await expect(writeContent(scratch.db, topicWrite("seam-race", "D", null))).rejects.toThrow(
      /has moved on/,
    );

    const [row] = await scratch.db.select().from(topic).where(eq(topic.slug, "seam-race"));
    expect(row?.title).toBe("B");
    expect(await history(scratch.db, "topic", "seam-race")).toHaveLength(2);
  });

  it("refuses an empty reason, whitespace included, and writes nothing", async () => {
    for (const reason of ["", "   "]) {
      await expect(
        writeContent(scratch.db, topicWrite("seam-noreason", "X", null, { reason })),
      ).rejects.toMatchObject({ code: "empty-reason" });
    }
    expect(await scratch.db.select().from(topic).where(eq(topic.slug, "seam-noreason"))).toEqual([]);
  });

  it("appends nothing, and touches nothing, for a write that leaves the entity as it was", async () => {
    const first = await writeContent(scratch.db, topicWrite("seam-same", "Same", null));
    const [before] = await scratch.db.select().from(topic).where(eq(topic.slug, "seam-same"));
    const again = await writeContent(scratch.db, topicWrite("seam-same", "Same", first.revisionId));
    expect(again.changed).toBe(false);
    expect(again.op).toBeNull();
    expect(again.revisionId).toBe(first.revisionId);
    expect(await history(scratch.db, "topic", "seam-same")).toHaveLength(1);
    // The savepoint was rolled back: not even `updated_at` moved.
    const [after] = await scratch.db.select().from(topic).where(eq(topic.slug, "seam-same"));
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
  });

  it("makes a seam write wait for an import of the same type, so the two cannot pick one seq", async () => {
    const first = await writeContent(scratch.db, topicWrite("seam-lock", "One", null));
    const importer = connect({ url: scratch.url, connectionTimeoutMillis: 1_000 });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    try {
      // An import transaction holding the topic type lock, as writeSource does
      // before its first write.
      const importing = inTransaction(importer.db, async (tx) => {
        await lockTypes(tx, ["topic"]);
        locked();
        await held;
      });
      await lockTaken;
      let done = false;
      const writing = writeContent(scratch.db, topicWrite("seam-lock", "Two", first.revisionId)).then(
        (result) => {
          done = true;
          return result;
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(done).toBe(false);
      release();
      await importing;
      const result = await writing;
      expect(result.seq).toBe(2);
    } finally {
      release();
      await importer.close();
    }
  });

  it("composes inside an outer transaction: both writes commit with it, or neither does", async () => {
    await inTransaction(scratch.db, async (tx) => {
      await writeContent(tx, topicWrite("outer-a", "A", null));
      await writeContent(tx, topicWrite("outer-b", "B", null));
    });
    expect((await history(scratch.db, "topic", "outer-a")).map((r) => r.op)).toEqual(["create"]);
    expect((await history(scratch.db, "topic", "outer-b")).map((r) => r.op)).toEqual(["create"]);

    await expect(
      inTransaction(scratch.db, async (tx) => {
        await writeContent(tx, topicWrite("outer-c", "C", null));
        throw new Error("the caller changed its mind");
      }),
    ).rejects.toThrow(/changed its mind/);
    expect(await scratch.db.select().from(topic).where(eq(topic.slug, "outer-c"))).toEqual([]);
    expect(await history(scratch.db, "topic", "outer-c")).toEqual([]);
  });

  it("writes several entities in one transaction, in the order given, each with its own revision", async () => {
    const results = await writeContents(scratch.db, [
      topicWrite("multi-z", "Z", null),
      tagWrite("multi-tag", "Tag", null),
      topicWrite("multi-a", "A", null),
    ]);
    expect(results.map((r) => [r.type, r.id, r.op, r.seq])).toEqual([
      ["topic", "multi-z", "create", 1],
      ["tag", "multi-tag", "create", 1],
      ["topic", "multi-a", "create", 1],
    ]);
    // In the order given, not the lock order: the revision ids say which ran first.
    expect(results[0]!.revisionId).toBeLessThan(results[1]!.revisionId);
    expect(results[1]!.revisionId).toBeLessThan(results[2]!.revisionId);
  });

  it("rolls every write back when one of them is refused", async () => {
    const first = await writeContent(scratch.db, topicWrite("multi-stale", "One", null));
    await writeContent(scratch.db, topicWrite("multi-stale", "Two", first.revisionId));
    await expect(
      writeContents(scratch.db, [
        topicWrite("multi-fresh", "Fresh", null),
        topicWrite("multi-stale", "Three", first.revisionId),
      ]),
    ).rejects.toMatchObject({ code: "stale-base" });
    expect(await scratch.db.select().from(topic).where(eq(topic.slug, "multi-fresh"))).toEqual([]);
    const [row] = await scratch.db.select().from(topic).where(eq(topic.slug, "multi-stale"));
    expect(row?.title).toBe("Two");
    await expect(
      writeContents(scratch.db, [topicWrite("multi-twice", "A", null), topicWrite("multi-twice", "B", null)]),
    ).rejects.toThrow(/named twice/);
  });

  it("deadlocks when two writeContent calls in one transaction lock out of order, which is why writeContents exists", async () => {
    // The shape the review found: a writer holding `topic` that then wants
    // `tag`, against an import that takes `tag` and then wants `topic`.
    const writer = connect({ url: scratch.url });
    const importer = connect({ url: scratch.url, connectionTimeoutMillis: 1_000 });
    let wrote!: () => void;
    const topicHeld = new Promise<void>((resolve) => {
      wrote = resolve;
    });
    let go!: () => void;
    const importWaiting = new Promise<void>((resolve) => {
      go = resolve;
    });
    try {
      const naive = inTransaction(writer.db, async (tx) => {
        await writeContent(tx, topicWrite("dl-topic", "T", null));
        wrote();
        await importWaiting;
        await writeContent(tx, tagWrite("dl-tag", "T", null));
      });
      await topicHeld;
      const importing = inTransaction(importer.db, async (tx) => {
        const { rows } = await tx.execute<{ pid: number }>(sql`select 0 as pid`);
        const pid = rows[0]!.pid;
        const locking = lockTypes(tx, ["tag", "topic"]);
        await waitingOnLock(scratch.db, pid);
        await locking;
      });
      // SQLite takes the file lock at `begin immediate`, so the importer's
      // body may never run; the naive writer's release cannot wait on it.
      void importing.catch(() => {}).finally(() => go());
      const outcomes = await Promise.allSettled([naive, importing]);
      // Postgres detected the row-lock cycle (40P01); SQLite serialises the
      // whole file, so the second `begin immediate` waits out its timeout and
      // the answer is SQLITE_BUSY, mapped to pg's lock_not_available.
      const deadlocked = outcomes.filter((o) => o.status === "rejected" && sqlstate(o.reason) === "55P03");
      expect(deadlocked).toHaveLength(1);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    } finally {
      go();
      await writer.close();
      await importer.close();
    }
  }, 30_000);

  it("never deadlocks writeContents against another composite writer or an import, whatever order they name things in", async () => {
    // By construction every one of them takes its locks in (type, id) order
    // (revisions.ts, "The lock order"); this runs them against each other.
    const connections = Array.from({ length: 3 }, () => connect({ url: scratch.url }));
    try {
      const bases = new Map<string, number | null>();
      const write = async (db: Scratch["db"], order: string[], round: number) => {
        const inputs = order.map((name) => {
          const [type, id] = name.split(":") as ["topic" | "tag", string];
          const base = bases.get(name) ?? null;
          return type === "topic" ? topicWrite(id, `r${round}`, base) : tagWrite(id, `r${round}`, base);
        });
        for (;;) {
          try {
            return await writeContents(db, inputs);
          } catch (error) {
            // Losing a race for the same entity is a stale base, never a deadlock.
            if (!(error instanceof ContentWriteError && error.code === "stale-base")) throw error;
            for (const input of inputs) {
              input.base = (await history(scratch.db, input.type, input.id)).at(-1)?.id ?? null;
            }
          }
        }
      };
      for (let round = 0; round < 6; round += 1) {
        const [a, b, c] = connections;
        const results = await Promise.all([
          write(a!.db, ["topic:mix-1", "tag:mix-1", "topic:mix-2"], round),
          write(b!.db, ["tag:mix-1", "topic:mix-2", "topic:mix-1"], round),
          inTransaction(c!.db, async (tx) => {
            await lockTypes(tx, ["topic", "tag"]);
            await new Promise((resolve) => setTimeout(resolve, 20));
          }),
        ]);
        for (const result of results.slice(0, 2) as Awaited<ReturnType<typeof writeContents>>[]) {
          for (const r of result) bases.set(`${r.type}:${r.id}`, r.revisionId);
        }
      }
    } finally {
      for (const connection of connections) await connection.close();
    }
  }, 60_000);

  it("puts owned links in the snapshot, so a link-only change is a revision of the parent", async () => {
    const note = (slug: string, body: string) => ({
      slug,
      title: slug,
      topicSlug: "alpha",
      path: `learn/concepts/one/${slug}.md`,
      body,
    });
    const base = await writeContent(scratch.db, {
      owner: "local",
      type: "concept",
      id: "seam-base",
      next: { row: note("seam-base", "base") },
      base: null,
      author: "local",
      authorKind: "person",
      reason: "a prerequisite to point at",
    });
    expect(base.changed).toBe(true);

    const first = await writeContent(scratch.db, {
      owner: "local",
      type: "concept",
      id: "seam-note",
      next: {
        row: note("seam-note", "# Title\n\nOne line.\nTwo line.\n"),
        links: { concept_prerequisite: [{ prerequisiteSlug: "seam-base", kind: "requires", position: 1 }] },
      },
      base: null,
      author: "diagram-maker",
      authorKind: "agent",
      reason: "draft the note",
    });
    expect(first.snapshot.links["concept_prerequisite"]).toEqual([
      { kind: "requires", position: 1, prerequisite_slug: "seam-base" },
    ]);

    // Only the link changes: requires becomes assumes.
    const second = await writeContent(scratch.db, {
      owner: "local",
      type: "concept",
      id: "seam-note",
      next: {
        row: note("seam-note", "# Title\n\nOne line.\nTwo line.\n"),
        links: { concept_prerequisite: [{ prerequisiteSlug: "seam-base", kind: "assumes", position: 1 }] },
      },
      base: first.revisionId,
      author: "local",
      authorKind: "person",
      reason: "it is only assumed",
    });
    expect(second.changed).toBe(true);
    const linkDiff = await diffRevisions(scratch.db, second.revisionId);
    expect(linkDiff.changes.map((c) => [c.path, c.kind])).toEqual([
      ["links.concept_prerequisite", "removed"],
      ["links.concept_prerequisite", "added"],
    ]);

    // A body edit gets a line diff.
    const third = await writeContent(scratch.db, {
      owner: "local",
      type: "concept",
      id: "seam-note",
      next: { row: note("seam-note", "# Title\n\nOne line.\nTwo lines.\n") },
      base: second.revisionId,
      author: "local",
      authorKind: "person",
      reason: "fix a typo",
    });
    const bodyDiff = await diffRevisions(scratch.db, third.revisionId);
    expect(bodyDiff.changes).toHaveLength(1);
    expect(bodyDiff.changes[0]?.path).toBe("entity.body");
    expect(bodyDiff.changes[0]?.lines?.filter((l) => l.op !== " ")).toEqual([
      { op: "-", text: "Two line." },
      { op: "+", text: "Two lines." },
    ]);
    // Links left out of `next` are kept, not cleared.
    expect(third.snapshot.links["concept_prerequisite"]).toHaveLength(1);
  });

  it("keeps revisions append-only", async () => {
    await writeContent(scratch.db, topicWrite("seam-history", "H", null));
    const update = scratch.db
      .update(contentRevision)
      .set({ reason: "rewritten" })
      .where(eq(contentRevision.entityId, "seam-history"));
    await expect(update).rejects.toSatisfy((e) => sqlstate(e) === SQLSTATE.restrictViolation);
    const remove = scratch.db.delete(contentRevision).where(eq(contentRevision.entityId, "seam-history"));
    await expect(remove).rejects.toSatisfy((e) => sqlstate(e) === SQLSTATE.restrictViolation);
  });

  it("with the write guard armed, refuses a raw write and lets the seam through", async () => {
    await setTriggers(scratch.db, [["topic", writeGuardName("topic")]], true);
    try {
      const raw = scratch.db.insert(topic).values({ slug: "seam-raw", title: "Raw", domain: "one" });
      await expect(raw).rejects.toSatisfy((e) => sqlstate(e) === SQLSTATE.insufficientPrivilege);
      await expect(
        scratch.db.update(topic).set({ title: "Changed" }).where(eq(topic.slug, "alpha")),
      ).rejects.toSatisfy((e) => /content write seam/.test(sqlMessage(e)));

      const through = await writeContent(scratch.db, topicWrite("seam-guarded", "Guarded", null));
      expect(through.changed).toBe(true);
      // The setting is transaction-local: the next raw write on the same pooled
      // connection is refused again.
      await expect(
        scratch.db.insert(topic).values({ slug: "seam-raw-2", title: "Raw", domain: "one" }),
      ).rejects.toSatisfy((e) => sqlstate(e) === SQLSTATE.insufficientPrivilege);
    } finally {
      await setTriggers(scratch.db, [["topic", writeGuardName("topic")]], false);
    }
  });
});

describe.skipIf(!reachable.ok)("import revisions and the archive rule", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await scratch.db.insert(topic).values({ slug: "alpha", title: "Alpha", domain: "one" });
    await scratch.db.insert(concept).values([
      { slug: "c-one", title: "One", topicSlug: "alpha", path: "learn/concepts/one/c-one.md" },
      { slug: "c-two", title: "Two", topicSlug: "alpha", path: "learn/concepts/one/c-two.md" },
    ]);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  const index = (rows: SourceRows) =>
    writeSource(scratch.db, coursesIndexer, rows, [], "content/courses", { author: "import:test" });

  const revisionsOf = (type: string, id: string) =>
    scratch.db
      .select()
      .from(contentRevision)
      .where(and(eq(contentRevision.entityType, type), eq(contentRevision.entityId, id)))
      .orderBy(asc(contentRevision.seq));

  it("writes one import revision per entity, then none on an unchanged re-index", async () => {
    const first = await index(courseRows({ "zz1000-m1-t1": ["c-one"], "zz1000-m1-t2": ["c-two"] }));
    expect(first.revisions).toEqual({ collection: 2, curriculum_item: 2 });
    const [rev] = await revisionsOf("curriculum_item", "zz1000-m1-t1");
    expect(rev?.op).toBe("import");
    expect(rev?.authorKind).toBe("import");
    expect(rev?.author).toBe("import:test");

    const second = await index(courseRows({ "zz1000-m1-t1": ["c-one"], "zz1000-m1-t2": ["c-two"] }));
    expect(second.revisions).toEqual({});
    expect(second.archivedKeys).toEqual([]);
  });

  it("writes a parent revision for a link-only change, and only for that parent", async () => {
    const result = await index(
      courseRows({ "zz1000-m1-t1": ["c-one", "c-two"], "zz1000-m1-t2": ["c-two"] }),
    );
    expect(result.revisions).toEqual({ curriculum_item: 1 });
    const revisions = await revisionsOf("curriculum_item", "zz1000-m1-t1");
    expect(revisions).toHaveLength(2);
    const diff = diffSnapshots(
      revisions[0]!.snapshot as never,
      revisions[1]!.snapshot as never,
    );
    expect(diff).toEqual([
      {
        path: "links.concept_curriculum_item",
        kind: "added",
        after: { concept_slug: "c-two", position: 2 },
      },
    ]);
  });

  it("archives a dropped item that a learner ticked, and keeps the row, the tick and the recap", async () => {
    await scratch.db.insert(progress).values({
      learnerId: LOCAL_LEARNER_ID,
      curriculumItemId: "zz1000-m1-t2",
      completedAt: new Date(),
      note: "done",
    });
    await scratch.db.insert(recap).values({
      learnerId: LOCAL_LEARNER_ID,
      curriculumItemId: "zz1000-m1-t2",
      summary: "what I learnt",
      source: "manual",
    });

    // The course file drops t2.
    const dropped = await index(courseRows({ "zz1000-m1-t1": ["c-one", "c-two"] }));
    expect(dropped.archivedKeys).toEqual(["curriculum_item zz1000-m1-t2"]);
    expect(dropped.deleted["curriculum_item"]).toBeUndefined();
    expect(dropped.revisions).toEqual({ curriculum_item: 1 });

    const [row] = await scratch.db.select().from(curriculumItem).where(eq(curriculumItem.id, "zz1000-m1-t2"));
    expect(row?.archivedAt).toBeInstanceOf(Date);
    expect(await scratch.db.select().from(progress)).toHaveLength(1);
    expect(await scratch.db.select().from(recap)).toHaveLength(1);
    const [archive] = (await revisionsOf("curriculum_item", "zz1000-m1-t2")).slice(-1);
    expect(archive?.op).toBe("archive");

    // A raw delete is refused by the foreign key, not left to a cascade.
    await expect(
      scratch.db.delete(curriculumItem).where(eq(curriculumItem.id, "zz1000-m1-t2")),
    ).rejects.toSatisfy((e) => sqlstate(e) === SQLSTATE.foreignKeyViolation);

    // The file lists it again: it comes back, with a restore revision.
    const restored = await index(courseRows({ "zz1000-m1-t1": ["c-one", "c-two"], "zz1000-m1-t2": ["c-two"] }));
    expect(restored.archivedKeys).toEqual([]);
    const [back] = await scratch.db.select().from(curriculumItem).where(eq(curriculumItem.id, "zz1000-m1-t2"));
    expect(back?.archivedAt).toBeNull();
    const [restore] = (await revisionsOf("curriculum_item", "zz1000-m1-t2")).slice(-1);
    expect(restore?.op).toBe("restore");
  });

  it("records a pruned entity's last state as a delete, and its return as a new revision", async () => {
    const notes: Indexer = {
      source: "concepts",
      owns: ["concept", "conceptPrerequisite"],
      assetPrefix: "note:",
      root: () => "learn/concepts",
      read: async () => ({ rows: {} }),
    };
    const note = { slug: "c-gone", title: "Gone", topicSlug: "alpha", path: "learn/concepts/one/c-gone.md" };
    const keep = [
      { slug: "c-one", title: "One", topicSlug: "alpha", path: "learn/concepts/one/c-one.md" },
      { slug: "c-two", title: "Two", topicSlug: "alpha", path: "learn/concepts/one/c-two.md" },
    ];
    // c-gone requires c-one: an owned link, which the writer clears before it
    // prunes, and which the delete revision must still record.
    const requires = [{ conceptSlug: "c-gone", prerequisiteSlug: "c-one", kind: "requires", position: 1 }];
    const write = (concepts: typeof keep, withLink: boolean) =>
      writeSource(
        scratch.db,
        notes,
        { concept: concepts, conceptPrerequisite: withLink ? requires : [] },
        [],
        "learn/concepts",
        { author: "import:test" },
      );

    await write([...keep, note], true);
    const pruned = await write(keep, false);
    expect(pruned.deletedKeys).toEqual(["concept c-gone"]);
    expect(pruned.revisions).toEqual({ concept: 1 });
    const afterDelete = await revisionsOf("concept", "c-gone");
    expect(afterDelete.map((r) => r.op)).toEqual(["import", "delete"]);
    // The delete holds the state it was deleted in, links included.
    expect(afterDelete[1]?.snapshotHash).toBe(afterDelete[0]?.snapshotHash);
    expect((afterDelete[1]?.snapshot as Snapshot).links["concept_prerequisite"]).toEqual([
      { kind: "requires", position: 1, prerequisite_slug: "c-one" },
    ]);
    const diff = await diffRevisions(scratch.db, afterDelete[1]!.id);
    expect(diff.changes.every((c) => c.kind === "removed")).toBe(true);
    expect(diff.changes.map((c) => c.path)).toEqual(
      expect.arrayContaining(["entity.title", "links.concept_prerequisite"]),
    );

    // Back, identical to before: still a revision, since the last one says it
    // was gone, and its diff is every field arriving rather than nothing.
    const back = await write([...keep, note], true);
    expect(back.revisions).toEqual({ concept: 1 });
    const all = await revisionsOf("concept", "c-gone");
    expect(all.map((r) => r.op)).toEqual(["import", "delete", "import"]);
    const returned = await diffRevisions(scratch.db, all[2]!.id);
    expect(returned.changes.length).toBeGreaterThan(0);
    expect(returned.changes.every((c) => c.kind === "added")).toBe(true);
  });

  it("archives a dropped module rather than deleting it, and frees its slug for a successor", async () => {
    const rows = courseRows({ "zz1000-m1-t1": ["c-one"] });
    rows.collection = [
      rows.collection![0]!,
      { id: "zz1000-m2", kind: "module", slug: "m1", title: "M1 again", parentId: "zz1000", position: 1, metadata: {} },
    ];
    rows.collectionItem = [{ collectionId: "zz1000-m2", position: 0, topicSlug: "alpha", conceptSlug: null, assetId: null }];
    rows.curriculumItem = [
      { id: "zz1000-m2-t1", collectionId: "zz1000-m2", position: 1, title: "t", subtopics: [] },
    ];
    rows.curriculumItemTopic = [{ curriculumItemId: "zz1000-m2-t1", topicSlug: "alpha" }];
    rows.conceptCurriculumItem = [{ conceptSlug: "c-one", curriculumItemId: "zz1000-m2-t1", position: 1 }];

    const result = await index(rows);
    expect(result.archivedKeys).toEqual(
      expect.arrayContaining(["collection zz1000-m1", "curriculum_item zz1000-m1-t1"]),
    );
    const modules = await scratch.db
      .select({ id: collection.id, archived: collection.archivedAt })
      .from(collection)
      .where(eq(collection.parentId, "zz1000"))
      .orderBy(asc(collection.id));
    expect(modules.map((m) => [m.id, m.archived !== null])).toEqual([
      ["zz1000-m1", true],
      ["zz1000-m2", false],
    ]);
  });
});

describe.skipIf(!reachable.ok)("the completeness rules, armed", () => {
  let scratch: Scratch;
  const allTriggers = COMPLETENESS_RULES.flatMap((rule) => rule.triggers);

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await scratch.db.insert(topic).values([
      { slug: "alpha", title: "Alpha", domain: "one" },
      { slug: "beta", title: "Beta", domain: "one" },
    ]);
    await scratch.db.insert(concept).values([
      { slug: "c-one", title: "One", topicSlug: "alpha", path: "learn/concepts/one/c-one.md" },
      { slug: "c-other", title: "Other", topicSlug: "beta", path: "learn/concepts/one/c-other.md" },
    ]);
    // A complete course, written while the rules are off.
    await writeSource(scratch.db, coursesIndexer, courseRows({ "zz1000-m1-t1": ["c-one"] }), [], "content/courses");
    await setTriggers(scratch.db, allTriggers, true);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("names every trigger as armed in the doctor, with no violators", async () => {
    const report = await doctor(scratch.db, "scratch");
    expect(report.rules.map((r) => [r.name, r.state, r.violators])).toEqual([
      ["module-has-item", "armed", 0],
      ["item-has-concept", "armed", 0],
      ["item-concept-in-module-topic", "armed", 0],
      ["course-order-respects-requires", "armed", 0],
    ]);
    expect(report.ok).toBe(true);
  });

  it("refuses a module with no items, at commit rather than at the insert", async () => {
    const tx = inTransaction(scratch.db, async (t) => {
      await t.insert(collection).values({
        id: "zz1000-m9",
        kind: "module",
        slug: "m9",
        title: "Empty",
        parentId: "zz1000",
      });
      // Deferred: the insert itself succeeded, and a module whose items arrive
      // later in the same transaction would pass.
      return "inserted";
    });
    await expect(tx).rejects.toSatisfy(
      (e) => sqlstate(e) === SQLSTATE.checkViolation && /module "zz1000-m9" has no curriculum items/.test(sqlMessage(e)),
    );
    expect(await scratch.db.select().from(collection).where(eq(collection.id, "zz1000-m9"))).toEqual([]);
  });

  it("accepts a module whose item and concept arrive in the same transaction", async () => {
    await inTransaction(scratch.db, async (t) => {
      await t.insert(collection).values({ id: "zz1000-m8", kind: "module", slug: "m8", title: "Ok", parentId: "zz1000" });
      await t.execute(sql`insert into collection_item (collection_id, topic_slug) values ('zz1000-m8', 'alpha')`);
      await t.insert(curriculumItem).values({ id: "zz1000-m8-t1", collectionId: "zz1000-m8", title: "t" });
      await t.insert(conceptCurriculumItem).values({ conceptSlug: "c-one", curriculumItemId: "zz1000-m8-t1" });
    });
    expect(await scratch.db.select().from(curriculumItem).where(eq(curriculumItem.id, "zz1000-m8-t1"))).toHaveLength(1);
  });

  it("refuses deleting an item's last concept link", async () => {
    // An armed rule is checked at commit: a bare write is its own commit, so
    // the check lives where Postgres's deferred trigger did — inTransaction.
    const remove = inTransaction(scratch.db, (t) =>
      t.delete(conceptCurriculumItem).where(eq(conceptCurriculumItem.curriculumItemId, "zz1000-m1-t1")),
    );
    await expect(remove).rejects.toSatisfy(
      (e) => sqlstate(e) === SQLSTATE.checkViolation && /"zz1000-m1-t1" names no concept/.test(sqlMessage(e)),
    );
    expect(
      await scratch.db.select().from(conceptCurriculumItem).where(eq(conceptCurriculumItem.curriculumItemId, "zz1000-m1-t1")),
    ).toHaveLength(1);
  });

  it("refuses a concept filed under a different topic from the item's module", async () => {
    const link = inTransaction(scratch.db, (t) =>
      t.insert(conceptCurriculumItem).values({ conceptSlug: "c-other", curriculumItemId: "zz1000-m1-t1" }),
    );
    await expect(link).rejects.toSatisfy(
      (e) => sqlstate(e) === SQLSTATE.checkViolation && /not filed under its module's topic/.test(sqlMessage(e)),
    );
    // And moving a linked concept to another topic, from the concept's side.
    const move = inTransaction(scratch.db, (t) => t.update(concept).set({ topicSlug: "beta" }).where(eq(concept.slug, "c-one")));
    await expect(move).rejects.toSatisfy((e) => sqlstate(e) === SQLSTATE.checkViolation);
  });

  it("lets the indexer rewrite a whole course in one transaction, archiving what it dropped", async () => {
    // The writer clears every link and writes them back, and archives the
    // module the file no longer lists together with its item: never a
    // violation at commit, which is the only moment a deferred rule looks.
    const again = await writeSource(
      scratch.db,
      coursesIndexer,
      courseRows({ "zz1000-m1-t1": ["c-one"] }),
      [],
      "content/courses",
    );
    expect(again.archivedKeys).toEqual(["collection zz1000-m8", "curriculum_item zz1000-m8-t1"]);
    const report = await doctor(scratch.db, "scratch");
    expect(report.rules.every((r) => r.violators === 0)).toBe(true);
  });
});

describe.skipIf(!reachable.ok)("the copy guard", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("refuses every write on a copy, names the primary, and lets a copy-ok connection through", async () => {
    await scratch.db.update(catalogInstance).set({ role: "copy", primaryHost: "primary.example.test" });
    try {
      const write = scratch.db.insert(preference).values({ learnerId: LOCAL_LEARNER_ID, key: "k", value: 1 });
      await expect(write).rejects.toSatisfy(
        (e) => sqlstate(e) === SQLSTATE.readOnly && /primary\.example\.test/.test(sqlMessage(e)),
      );
      await expect(writeContent(scratch.db, topicWrite("copy-topic", "T", null))).rejects.toSatisfy(
        (e) => sqlstate(e) === SQLSTATE.readOnly,
      );
      // Reads are fine.
      expect(await scratch.db.select().from(topic)).toEqual([]);

      const allowed = connect({ url: scratch.url, copyOk: true });
      try {
        await allowed.db.insert(preference).values({ learnerId: LOCAL_LEARNER_ID, key: "k", value: 1 });
        expect(await allowed.db.select().from(preference)).toHaveLength(1);
      } finally {
        await allowed.close();
      }
    } finally {
      // `catalog_instance` itself is never guarded, so a copy can be promoted.
      await scratch.db.update(catalogInstance).set({ role: "primary", primaryHost: null });
    }
    await scratch.db.insert(preference).values({ learnerId: LOCAL_LEARNER_ID, key: "k2", value: 2 });
  });

});

describe("catalog history's byline", () => {
  const revision = (authorKind: string, author: string) =>
    ({ id: 1, seq: 1, op: "import", createdAt: "2026-09-28T00:00:00.000Z", authorKind, author, reason: "r", jobId: null, sessionId: null }) as never;

  it("prints an import's author once, and a person's with its kind", () => {
    const text = formatHistory({
      database: "x",
      type: "topic",
      id: "alpha",
      revisions: [revision("import", "import:abc123"), revision("person", "local")],
    });
    expect(text).toContain("  import:abc123\n");
    expect(text).not.toContain("import:import:");
    expect(text).toContain("  person:local\n");
  });
});

describe("diffs, without a database", () => {
  it("diffs a line at a time", () => {
    expect(lineDiff("a\nb\nc", "a\nx\nc")).toEqual([
      { op: " ", text: "a" },
      { op: "-", text: "b" },
      { op: "+", text: "x" },
      { op: " ", text: "c" },
    ]);
  });

  it("recurses into nested objects and treats a new entity as all additions", () => {
    const after = { entity: { slug: "x", metadata: { tags: ["a"], code: "X" } }, links: { l: [{ a: 1 }] } };
    expect(diffSnapshots(null, after).map((c) => [c.path, c.kind])).toEqual([
      ["entity.metadata", "added"],
      ["entity.slug", "added"],
      ["links.l", "added"],
    ]);
    const changed = { entity: { slug: "x", metadata: { tags: ["a", "b"], code: "X" } }, links: { l: [{ a: 1 }] } };
    expect(diffSnapshots(after, changed)).toEqual([
      { path: "entity.metadata.tags", kind: "changed", before: ["a"], after: ["a", "b"] },
    ]);
  });
});
