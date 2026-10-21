import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { concept, contentRevision, sessionLogEntry } from "@gnosia/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { renderType } from "../src/content/export";
import { flip } from "../src/content/flip";
import { databaseIdentity } from "../src/content/import-root";
import { conceptsIndexer } from "../src/index/concepts";
import { coursesIndexer } from "../src/index/courses";
import { tagsIndexer } from "../src/index/tags";
import { sessionsIndexer } from "../src/index/sessions";
import { topicsIndexer } from "../src/index/topics";
import { writeSource } from "../src/index/writer";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * The `learn` CLI once the database owns the notes and the logs (Track C of
 * docs/CONTENT-MIGRATION.md): the same commands, writing rows through the
 * seam, and not one byte under `learn/` changing.
 *
 * A fixture tree is imported into a scratch database and both types are
 * flipped for real (parity, the write guards armed), so a write that went
 * around the seam would be refused by the database, not just by review.
 */

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(HERE, "..", "src", "learn", "cli.ts");
const reachable = await probe();

const OLD_LOG =
  "---\ntitle: Old\ndate: 2026-01-01T00:00:00.000Z\ngoal: alpha\ntype: learning-session\n---\n\n# Old\n\n> Live log.\n- [[alpha]] once\n\n";

/** Every file under `dir` with the sha256 of its bytes, for "nothing changed". */
async function tree(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    out[path.relative(dir, file)] = createHash("sha256").update(await readFile(file)).digest("hex");
  }
  return out;
}

describe.skipIf(!reachable.ok)("learn CLI on rows", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let before: Record<string, string>;

  async function learn(...args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(process.execPath, ["--import", "tsx", ENTRY, ...args], {
      env: { ...process.env, LEARN_ROOT: fixture.root, DATABASE_URL: scratch.url },
    });
  }
  async function json<T = unknown>(...args: string[]): Promise<T> {
    return JSON.parse((await learn(...args, "--json")).stdout) as T;
  }
  async function refused(...args: string[]): Promise<string> {
    return learn(...args).then(
      () => "",
      (error: { stderr: string }) => error.stderr,
    );
  }
  const row = async (slug: string) => (await scratch.db.select().from(concept).where(eq(concept.slug, slug)))[0];
  const entries = (id: string) =>
    scratch.db
      .select({ markdown: sessionLogEntry.markdown })
      .from(sessionLogEntry)
      .where(eq(sessionLogEntry.sessionId, id))
      .orderBy(asc(sessionLogEntry.seq));

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["alpha", "beta", "gamma"], courses: ["xx1000-m1"] }]));
    await fixture.write("learn/concepts/fixtures/alpha.md", note({ id: "alpha", title: "Alpha", summary: "The first one." }));
    await fixture.write("learn/concepts/fixtures/beta.md", note({ id: "beta", title: "Beta", requires: ["alpha"] }));
    await fixture.write("learn/concepts/fixtures/gamma.md", note({ id: "gamma", title: "Gamma", requires: ["beta"] }));
    await fixture.write("learn/sessions/2026-01-01-old.md", OLD_LOG);
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write(
      "content/courses/xx1000.yaml",
      [
        "id: xx1000", "slug: xx1000", "code: XX1000", "title: A test course", "credits: 4", "order: 1",
        "inferred: false", "tags: [testing]", "modules:", "  - id: xx1000-m1", "    slug: m1",
        "    title: Module one", "    order: 1", "    topic: alpha", "    topics:", "      - id: xx1000-m1-t1",
        "        title: First item", "        subtopics: []", "    resources: []", "capstone: Build something", "",
      ].join("\n"),
    );

    // Imported the way `catalog index` would, source by source, then flipped.
    const context = await fixture.context({ knownConcepts: async () => new Set(["alpha", "beta", "gamma"]) });
    const database = await databaseIdentity(scratch.db);
    for (const indexer of [topicsIndexer, tagsIndexer, conceptsIndexer, coursesIndexer, sessionsIndexer]) {
      const { rows, logs } = await indexer.read(context);
      await writeSource(scratch.db, indexer, rows, [], indexer.root(context), {
        logs,
        metadata: { root: fixture.root, database },
      });
    }
    // The vocabulary as the database would write it: a new note's topic is
    // written through to content/topics.yaml (D17), which refuses a file
    // that is not the rows' own export.
    for (const file of await renderType(scratch.db, "topics")) {
      await writeFile(path.join(fixture.root, file.path), file.bytes);
    }
    const readers = new Set(["concepts", "sessions"] as const);
    await flip(scratch.db, { type: "concepts", readers });
    await flip(scratch.db, { type: "sessions", readers });
    // The flip records the files under learn/ as the database's export, so
    // an import of courses then skips the notes and logs instead of refusing
    // them.
    before = await tree(path.join(fixture.root, "learn"));
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    await fixture?.cleanup();
  });

  it("answers the pinned status shape from the rows", async () => {
    expect(await json("status")).toEqual({
      stats: { total: 3, mastered: 0, learning: 0, untouched: 3 },
      due: 0,
      frontier: [{ id: "alpha", title: "Alpha", pL: 0.25, requires: [] }],
      sessions: 1,
    });
  });

  it("adds a note as rows, filed under its topic, with a revision that says why", async () => {
    const added = await json("concept", "add", "--title", "Delta", "--topic", "alpha", "--domain", "fixtures", "--requires", "gamma");
    expect(added).toEqual({ id: "delta", path: "learn/concepts/fixtures/delta.md", topic: "alpha", item: null, indexed: true });
    const delta = await row("delta");
    expect(delta).toMatchObject({ topicSlug: "alpha", domain: "fixtures", title: "Delta", path: "learn/concepts/fixtures/delta.md" });
    expect(delta?.body).toContain("## Why it matters");
    expect(delta?.topicPosition).toBeGreaterThan((await row("gamma"))?.topicPosition ?? 0);
    const [revision] = await scratch.db
      .select()
      .from(contentRevision)
      .where(and(eq(contentRevision.entityType, "concept"), eq(contentRevision.entityId, "delta")));
    expect(revision).toMatchObject({ op: "create", authorKind: "person", reason: "learn concept add delta --topic alpha" });
    expect((await json<{ id: string }[]>("concept", "list")).map((c) => c.id)).toEqual(["alpha", "beta", "delta", "gamma"]);
    // Its topic's maps.concepts in content/topics.yaml, rewritten from the rows.
    expect(await readFile(path.join(fixture.root, "content", "topics.yaml"), "utf8")).toContain(
      "concepts: [alpha, beta, gamma, delta]",
    );
  });

  it("refuses a listing before writing anything when the course file holds an edit not imported", async () => {
    const course = path.join(fixture.root, "content/courses/xx1000.yaml");
    const original = await readFile(course, "utf8");
    const revisions = async () =>
      (await scratch.db.execute<{ n: number }>(sql`select count(*) as n from content_revision`)).rows[0]?.n;
    const before = await revisions();
    await writeFile(course, original.replace("title: First item", "title: An edited item"));
    try {
      expect(await refused("concept", "add", "--title", "Zeta", "--domain", "fixtures", "--item", "xx1000-m1-t1")).toMatch(
        /nothing was written: content\/courses\/xx1000\.yaml holds edits the database has not imported \(curriculum_item xx1000-m1-t1\)/,
      );
      expect(await row("zeta")).toBeUndefined();
      // The check is a dry run: it appends no revision.
      expect(await revisions()).toBe(before);
      // And a note that already exists is refused before the check is asked.
      expect(await refused("concept", "add", "--title", "Gamma", "--item", "xx1000-m1-t1")).toMatch(/already exists/);
    } finally {
      await writeFile(course, original);
    }
  });

  it("refuses a listing before writing anything when another course file is not what the database holds", async () => {
    const stray = "content/courses/yy2000.yaml";
    await fixture.write(
      stray,
      [
        "id: yy2000", "slug: yy2000", "code: YY2000", "title: Another course", "credits: 4", "order: 2",
        "inferred: false", "tags: [testing]", "modules:", "  - id: yy2000-m1", "    slug: m1",
        "    title: Module one", "    order: 1", "    topic: alpha", "    topics:", "      - id: yy2000-m1-t1",
        "        title: First item", "        subtopics: []", "    resources: []", "capstone: Build something", "",
      ].join("\n"),
    );
    try {
      expect(await refused("concept", "add", "--title", "Eta", "--domain", "fixtures", "--item", "xx1000-m1-t1")).toMatch(
        /nothing was written: .*yy2000\.yaml/s,
      );
      expect(await row("eta")).toBeUndefined();
    } finally {
      await rm(path.join(fixture.root, stray));
    }
  });

  it("lists a new note on a course row through course import, which links it and writes the file back", async () => {
    const added = await json("concept", "add", "--title", "Epsilon", "--domain", "fixtures", "--item", "xx1000-m1-t1");
    expect(added).toMatchObject({ id: "epsilon", topic: "alpha", item: "xx1000-m1-t1", indexed: true });
    const { rows } = await scratch.db.execute<{ concept_slug: string }>(
      sql`select concept_slug from concept_curriculum_item where curriculum_item_id = 'xx1000-m1-t1'`,
    );
    expect(rows.map((r) => r.concept_slug)).toEqual(["epsilon"]);
    const [revision] = await scratch.db
      .select()
      .from(contentRevision)
      .where(and(eq(contentRevision.entityType, "curriculum_item"), eq(contentRevision.entityId, "xx1000-m1-t1")))
      .orderBy(desc(contentRevision.id))
      .limit(1);
    expect(revision).toMatchObject({ reason: "learn concept add epsilon --item xx1000-m1-t1" });
    // The course file is the database's export again, listing included.
    const [exported] = (await renderType(scratch.db, "courses")).filter((f) => f.path === "content/courses/xx1000.yaml");
    expect(await readFile(path.join(fixture.root, "content/courses/xx1000.yaml"), "utf8")).toBe(exported?.bytes.toString("utf8"));
  });

  it("refuses a new note with no topic, and a move to another folder", async () => {
    expect(await refused("concept", "add", "--title", "Loose", "--domain", "fixtures")).toMatch(/a new note needs a topic/);
    expect(await row("loose")).toBeUndefined();
    expect(await refused("concept", "edit", "gamma", "--domain", "elsewhere")).toMatch(/moving a note to another folder is not supported/);
  });

  it("edits fields, stores checks in the body, and replaces a body in one step", async () => {
    await learn("concept", "edit", "gamma", "--summary", "Third.");
    expect((await row("gamma"))?.summary).toBe("Third.");

    await learn("check", "add", "--concept", "gamma", "--question", "What is gamma?", "--answer", "The third.");
    expect(await json<unknown[]>("check", "list", "--concept", "gamma")).toHaveLength(1);
    expect((await row("gamma"))?.body).toContain("```check\nq: What is gamma?");

    const bodyFile = path.join(fixture.root, "body.md");
    await writeFile(bodyFile, "# Gamma\n\nRewritten in one step.\n", "utf8");
    expect(await refused("concept", "edit", "gamma", "--body-file", bodyFile)).toMatch(/requires --reason/);
    await learn("concept", "edit", "gamma", "--body-file", bodyFile, "--reason", "rewrite the body");
    expect((await row("gamma"))?.body).toBe("# Gamma\n\nRewritten in one step.\n");
    expect((await row("gamma"))?.summary).toBe("Third.");
  });

  it("checks a note out, commits the edit as a revision, and refuses a commit whose base moved", async () => {
    const checkout = await json<{ id: string; path: string; revision: number }>("concept", "checkout", "beta");
    expect(checkout.path).toBe(path.join(fixture.root, "work", "concepts", "beta.md"));
    expect(typeof checkout.revision).toBe("number");
    const text = await readFile(checkout.path, "utf8");
    expect(text).toContain("id: beta");

    await writeFile(checkout.path, text.replace("# Beta", "# Beta\n\nWhat the session wrote."), "utf8");
    expect(await refused("concept", "commit", "beta")).toMatch(/requires --reason/);
    const committed = await json<{ revision: number; changed: boolean }>("concept", "commit", "beta", "--reason", "close the session");
    expect(committed.changed).toBe(true);
    expect(committed.revision).toBeGreaterThan(checkout.revision);
    expect((await row("beta"))?.body).toContain("What the session wrote.");

    // Someone else writes the note; the copy's base is now stale.
    await learn("concept", "edit", "beta", "--summary", "Moved on.");
    await writeFile(checkout.path, (await readFile(checkout.path, "utf8")).replace("What the session wrote.", "A late edit."), "utf8");
    expect(await refused("concept", "commit", "beta", "--reason", "too late")).toMatch(/has moved on: .*nothing was merged/s);
    expect((await row("beta"))?.body).not.toContain("A late edit.");
    expect((await row("beta"))?.summary).toBe("Moved on.");
  });

  it("runs a session into log entries: start, observe with --session, log, close", async () => {
    await learn("session", "start", "--id", "s1", "--topic", "Alpha drill", "--goal", "alpha");
    expect(await entries("s1")).toHaveLength(1);
    // Starting it again does not write a second header.
    await learn("session", "start", "--id", "s1", "--topic", "Alpha drill", "--goal", "alpha");
    expect(await entries("s1")).toHaveLength(1);

    const observed = await json<{ logged: boolean }>(
      "observe", "--concept", "alpha", "--correct", "true", "--session", "s1", "--question", "What is alpha?",
    );
    expect(observed.logged).toBe(true);
    expect(await entries("s1")).toHaveLength(2);

    await learn("session", "log", "--id", "s1", "--text", "A note in passing.");
    await learn("session", "close", "--id", "s1");
    const log = await entries("s1");
    expect(log).toHaveLength(4);
    expect(log[0]?.markdown).toMatch(/^---\ntitle: Alpha drill\n/);
    expect(log[2]?.markdown).toBe("A note in passing.\n\n");
    expect(log[3]?.markdown).toMatch(/^## Close\n/);

    // The close linked the note it touched back to the session, as a revision from that session.
    expect((await row("alpha"))?.body).toContain("- [[s1]]");
    const { rows } = await scratch.db.execute<{ session_id: string | null }>(
      sql`select session_id from content_revision where entity_type = 'concept' and entity_id = 'alpha' order by seq desc limit 1`,
    );
    expect(rows[0]?.session_id).toBe("s1");
    expect(await json<string[]>("session", "list")).toEqual(expect.arrayContaining(["2026-01-01-old.md", "s1.md"]));

    // The log is an asset that covers what it named.
    const { rows: covers } = await scratch.db.execute<{ concept_slug: string }>(
      sql`select concept_slug from asset_concept where asset_id = 'session:learn/sessions/s1.md' order by concept_slug`,
    );
    expect(covers.map((c) => c.concept_slug)).toEqual(["alpha"]);
  });

  it("writes one header when two starts race for a new log", async () => {
    await Promise.all([
      learn("session", "start", "--id", "s2", "--topic", "Race"),
      learn("session", "start", "--id", "s2", "--topic", "Race"),
      learn("session", "start", "--id", "s2", "--topic", "Race"),
    ]);
    expect(await entries("s2")).toHaveLength(1);
  });

  it("prints the map and indexes nothing", async () => {
    expect((await learn("map")).stdout).toContain("# Knowledge Map");
    expect((await learn("index")).stdout).toMatch(/The database owns the notes; nothing to index/);
  });

  it("left every file under learn/ exactly as it was", async () => {
    expect(await tree(path.join(fixture.root, "learn"))).toEqual(before);
    const [latest] = await scratch.db
      .select({ reason: contentRevision.reason })
      .from(contentRevision)
      .orderBy(desc(contentRevision.id))
      .limit(1);
    expect(latest?.reason).toBeTruthy();
  });
});
