import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { COMMONS_OWNER, concept, contentRevision, LOCAL_LEARNER_ID, topic, topicRelation } from "@self-learn/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { flip } from "../src/content/flip";
import { databaseIdentity } from "../src/content/import-root";
import { conceptsIndexer } from "../src/index/concepts";
import { tagsIndexer } from "../src/index/tags";
import { topicsIndexer } from "../src/index/topics";
import { writeSource } from "../src/index/writer";
import { applyMigrations } from "../src/migrations";
import { ensureLearner } from "../src/state";
import { makeFixture, note, tagsYaml, type Fixture } from "./fixture-tree";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * `catalog topic ls --owner` and `catalog topic add --owner`: the studio runner
 * reads the vocabulary, and files a topic the planner proposed, as the owner
 * it serves (`STUDIO_OWNER`). Before the flag, `ls` handed the planner, the
 * studio's cache and `/api/vocabulary` every owner's topics and the concepts
 * filed under them, and `add` wrote the topic as `local`.
 *
 * Four topics, one per owner: the studio's (`mine`), another owner's
 * (`theirs`), the commons' (`shared`) and `local`'s (`locals`). The commons'
 * topic carries an edge to `theirs` and two notes filed under it, one the
 * studio's and one the other owner's, so a listing scoped at the row but not
 * at the edge, or at the topic but not at its concepts, fails here too.
 */

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(HERE, "..", "src", "cli.ts");
const reachable = await probe();

const STUDIO = "studio";
const OTHER = "rival";

const TOPICS = [
  { slug: "mine", title: "Studio owners topic", owner: STUDIO },
  { slug: "theirs", title: "Another owners secret topic", owner: OTHER },
  { slug: "shared", title: "Commons topic", owner: COMMONS_OWNER },
  { slug: "locals", title: "Local owners topic", owner: LOCAL_LEARNER_ID },
] as const;

const NOTES = [
  { slug: "my-note", topic: "shared", owner: STUDIO },
  { slug: "their-note", topic: "shared", owner: OTHER },
] as const;

interface Listing {
  slug: string;
  title: string;
  relations: { kind: string; to: string }[];
  incoming: { kind: string; from: string }[];
  maps: { concepts: string[] };
}

describe.skipIf(!reachable.ok)("catalog topic ls and add --owner", () => {
  let scratch: Scratch;
  let fixture: Fixture;

  function catalog(args: string[]) {
    return execFileAsync(process.execPath, ["--import", "tsx", ENTRY, ...args], {
      env: { ...process.env, DATABASE_URL: scratch.url, MANIMKC_ROOT: "/nonexistent" },
    });
  }
  async function json(args: string[]): Promise<Record<string, unknown>> {
    return JSON.parse((await catalog([...args, "--json"])).stdout) as Record<string, unknown>;
  }
  async function ls(...flags: string[]): Promise<Listing[]> {
    return (await json(["topic", "ls", ...flags])).topics as Listing[];
  }
  async function refused(args: string[]): Promise<string> {
    return catalog(args).then(
      (result) => {
        throw new Error(`expected a refusal, got: ${result.stdout}`);
      },
      // With --json the refusal is the printed object's `error`; without, stderr.
      (error: { stderr: string; stdout: string }) => {
        try {
          return String((JSON.parse(error.stdout) as { error?: unknown }).error);
        } catch {
          return error.stderr;
        }
      },
    );
  }
  async function ownerOf(slug: string): Promise<string | undefined> {
    const [row] = await scratch.db.select({ ownerId: topic.ownerId }).from(topic).where(eq(topic.slug, slug));
    return row?.ownerId;
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    fixture = await makeFixture();
    const lines = ["topics:"];
    for (const t of TOPICS) {
      lines.push(`  - slug: ${t.slug}`, `    title: ${t.title}`, "    domain: testing", "    aliases: []");
      if (t.slug === "shared") lines.push("    relations:", "      - {kind: broader, to: theirs}");
      lines.push(
        "    maps:",
        "      manimkc: []",
        "      courses: []",
        `      concepts: [${NOTES.filter((n) => n.topic === t.slug).map((n) => n.slug).join(", ")}]`,
      );
    }
    await fixture.write("content/topics.yaml", `${lines.join("\n")}\n`);
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    for (const n of NOTES) {
      await fixture.write(`learn/concepts/fixtures/${n.slug}.md`, note({ id: n.slug, title: n.slug }));
    }
    const context = await fixture.context({ knownConcepts: async () => new Set(NOTES.map((n) => n.slug)) });
    const database = await databaseIdentity(scratch.db);
    for (const indexer of [topicsIndexer, tagsIndexer, conceptsIndexer]) {
      const { rows, logs } = await indexer.read(context);
      await writeSource(scratch.db, indexer, rows, [], indexer.root(context), { logs, metadata: { root: fixture.root, database } });
    }
    // Each row to its owner, before the flip arms the write guards. A
    // relation is its topic's (D24).
    for (const owner of [STUDIO, OTHER, COMMONS_OWNER]) await ensureLearner(scratch.db, owner);
    for (const t of TOPICS) {
      await scratch.db.update(topic).set({ ownerId: t.owner }).where(eq(topic.slug, t.slug));
      await scratch.db.update(topicRelation).set({ ownerId: t.owner }).where(eq(topicRelation.fromSlug, t.slug));
    }
    for (const n of NOTES) await scratch.db.update(concept).set({ ownerId: n.owner }).where(eq(concept.slug, n.slug));
    await flip(scratch.db, { type: "topics", readers: new Set(["topics"] as const) });
    // The tree's topics.yaml as the rows render it, byte for byte, so a
    // write-through finds the file in step (the hand-written one is only
    // equal in meaning).
    await catalog(["export", "--only", "topics", "--out", fixture.root]);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    await fixture?.cleanup();
  });

  describe("ls", () => {
    it("lists the owner's topics and the commons', and never another owner's, local's included", async () => {
      const listed = await ls("--owner", STUDIO);
      expect(listed.map((t) => t.slug).sort()).toEqual(["mine", "shared"]);
    });

    it("drops what hangs off a readable topic but belongs to someone else: an edge, a concept", async () => {
      const shared = (await ls("--owner", STUDIO)).find((t) => t.slug === "shared");
      expect(shared?.relations).toEqual([]);
      expect(shared?.maps.concepts).toEqual(["my-note"]);
      const everything = JSON.stringify(await json(["topic", "ls", "--owner", STUDIO]));
      for (const leak of ["theirs", "their-note", "Another owners secret topic", "locals"]) {
        expect(everything).not.toContain(leak);
      }
    });

    it("is every owner's without --owner, as the operator's listing always was, in the same shape", async () => {
      const all = await ls();
      expect(all.map((t) => t.slug).sort()).toEqual(["locals", "mine", "shared", "theirs"]);
      expect(all.find((t) => t.slug === "shared")?.relations).toEqual([{ kind: "broader", to: "theirs" }]);
      const scoped = await json(["topic", "ls", "--owner", STUDIO]);
      expect(Object.keys(scoped).sort()).toEqual(Object.keys(await json(["topic", "ls"])).sort());
      const [one] = await ls("--owner", STUDIO);
      expect(Object.keys(one ?? {}).sort()).toEqual(Object.keys(all[0] ?? {}).sort());
    });
  });

  describe("add", () => {
    it("writes the topic, and its revision, as the owner named", async () => {
      await json([
        "topic", "add", "--slug", "studio-new", "--title", "A studio topic", "--domain", "testing",
        "--relate", "broader:shared", "--reason", "a test", "--author", STUDIO, "--owner", STUDIO,
      ]);
      expect(await ownerOf("studio-new")).toBe(STUDIO);
      const revisions = await scratch.db
        .select({ ownerId: contentRevision.ownerId })
        .from(contentRevision)
        .where(and(eq(contentRevision.entityType, "topic"), eq(contentRevision.entityId, "studio-new")));
      expect(revisions.map((r) => r.ownerId)).toEqual([STUDIO]);
      expect((await ls("--owner", STUDIO)).map((t) => t.slug)).toContain("studio-new");
      expect((await ls("--owner", OTHER)).map((t) => t.slug)).not.toContain("studio-new");
    });

    it("writes as local without --owner, as it always has", async () => {
      await json(["topic", "add", "--slug", "local-new", "--title", "A local topic", "--domain", "testing", "--reason", "a test"]);
      expect(await ownerOf("local-new")).toBe(LOCAL_LEARNER_ID);
    });

    it("cannot relate a topic to another owner's, and says so as if it were missing", async () => {
      const stderr = await refused([
        "topic", "add", "--slug", "studio-edge", "--title", "Edge", "--domain", "testing",
        "--relate", "broader:theirs", "--reason", "a test", "--owner", STUDIO, "--json",
      ]);
      expect(stderr).toContain('no related topic "theirs"');
      expect(await ownerOf("studio-edge")).toBeUndefined();
    });

    it("checks a dry run against what the owner may read: no near match, no title clash, no title named", async () => {
      // Another owner's title is free to this one, and never offered as a near match.
      const dry = await json([
        "topic", "add", "--slug", "secret-copy", "--title", "Another owners secret topic", "--domain", "testing",
        "--dry-run", "--owner", STUDIO,
      ]);
      expect(dry.nearMatches).toEqual([]);
      expect(dry.newDomain).toBe(false);
      // A readable topic's title still clashes.
      const clash = await refused([
        "topic", "add", "--slug", "commons-copy", "--title", "Commons topic", "--domain", "testing",
        "--dry-run", "--owner", STUDIO, "--json",
      ]);
      expect(clash).toContain('topic "shared" already has the title');
      // A slug another owner holds cannot be taken (ids are global), and the refusal names nothing of theirs.
      const taken = await refused([
        "topic", "add", "--slug", "theirs", "--title", "Mine now", "--domain", "testing", "--dry-run", "--owner", STUDIO, "--json",
      ]);
      expect(taken).toContain('the slug "theirs" is taken by a topic you cannot read');
      expect(taken).not.toContain("secret");
      expect(taken).not.toContain(OTHER);
    });
  });

  it("refuses an empty owner, and --owner on a verb that would ignore it", async () => {
    expect(await refused(["topic", "ls", "--owner", " "])).toContain("--owner cannot be empty");
    for (const args of [
      ["topic", "edit", "mine", "--title", "Renamed", "--reason", "a test"],
      ["topic", "archive", "mine", "--reason", "a test"],
      ["tag", "add", "--id", "x", "--label", "X", "--description", "x", "--reason", "a test"],
    ]) {
      expect(await refused([...args, "--owner", STUDIO])).toContain("--owner goes with topic add and topic ls only");
    }
    expect((await scratch.db.select({ title: topic.title }).from(topic).where(eq(topic.slug, "mine")))[0]?.title).toBe(
      "Studio owners topic",
    );
  });
});
