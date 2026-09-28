import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { concept, contentRevision, curriculumItem, learner, recap } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runCourseExport } from "../src/commands/course";
import { runExport } from "../src/commands/export";
import { runImportCommand } from "../src/commands/index-command";
import { runEnqueue } from "../src/commands/job";
import { renderType } from "../src/content/export";
import { exportCourse, importCourse, readStamp } from "../src/content/courses";
import { flip } from "../src/content/flip";
import { databaseIdentity } from "../src/content/import-root";
import { archiveItem, purgeItem } from "../src/content/items";
import { noteRevision, readNoteRows, writeNoteRow } from "../src/content/note-rows";
import type { NoteFields } from "../src/content/notes";
import { exportHash, readTypeFiles } from "../src/content/layout";
import { recordExport } from "../src/content/ownership";
import { type By, renameTopic } from "../src/content/topics";
import { type CatalogDatabase, connect, type Connection } from "../src/db";
import { conceptsIndexer } from "../src/index/concepts";
import { tagsIndexer } from "../src/index/tags";
import { topicsIndexer } from "../src/index/topics";
import { writeSource } from "../src/index/writer";
import { checkoutConcept, commitConcept } from "../src/learn/checkout";
import { bindCatalog, MovedBaseError, updateConcept } from "../src/learn/files";
import { applyMigrations } from "../src/migrations";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";
import { storedBlob } from "./stored-blob";

/**
 * Lost updates (docs/CONTENT-MIGRATION.md, phase 1 fixes S2, S3 and S10): a
 * writer that reads, then writes what it read with a change, must not undo a
 * write that landed in between. Every case here puts that write on a second
 * connection, at the exact moment between the read and the write, and checks
 * it survives: the first writer is refused, or reads again and reapplies.
 * Each of these passed the other writer's change straight over before the fix.
 */

const reachable = await probe();

const by: By = { author: "local", authorKind: "person", reason: "a test" };

function pointAt(name: string): () => void {
  const saved = { url: process.env["DATABASE_URL"], manimkc: process.env["MANIMKC_ROOT"], learn: process.env["LEARN_ROOT"] };
  const url = new URL(process.env["DATABASE_URL"] ?? "postgres://localhost:5432/self_learn");
  url.pathname = `/${name}`;
  process.env["DATABASE_URL"] = url.toString();
  process.env["MANIMKC_ROOT"] = path.join(tmpdir(), "catalog-test-no-manimkc");
  return () => {
    for (const [key, value] of [
      ["DATABASE_URL", saved.url],
      ["MANIMKC_ROOT", saved.manimkc],
      ["LEARN_ROOT", saved.learn],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

/** The backend behind a one-connection pool, so a test can watch it wait. */
async function pidOf(db: CatalogDatabase): Promise<number> {
  const { rows } = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  return Number(rows[0]?.pid);
}

/** Resolves once `pid` is waiting on a lock of any kind, so two transactions can be ordered exactly. */
async function waiting(db: CatalogDatabase, pid: number): Promise<void> {
  for (let i = 0; i < 400; i += 1) {
    const { rows } = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_locks where pid = ${pid} and not granted`,
    );
    if ((rows[0]?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`backend ${pid} never waited on a lock`);
}

describe.skipIf(!reachable.ok)("a note is written against the revision it was read at", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let one: Connection;
  let two: Connection;
  let restore: () => void;

  /** A commit of `slug` from somewhere else, on the second connection, based correctly on what is there. */
  async function commitElsewhere(slug: string, edit: (fields: NoteFields) => NoteFields): Promise<void> {
    const [row] = await readNoteRows(two.db, [slug]);
    if (row === undefined) throw new Error(`no ${slug}`);
    const fields: NoteFields = {
      slug,
      title: row.title,
      summary: row.summary,
      requires: row.requires,
      assumes: row.assumes,
      tags: row.tags,
      sources: row.sources,
      created: row.created,
      body: row.body ?? "",
    };
    await writeNoteRow(two.db, { fields: edit(fields), base: await noteRevision(two.db, slug), reason: "a commit from elsewhere" });
  }
  const row = async (slug: string) => (await scratch.db.select().from(concept).where(eq(concept.slug, slug)))[0];

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["alpha", "beta", "gamma"] }]));
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write("learn/concepts/fixtures/alpha.md", note({ id: "alpha", title: "Alpha", summary: "The first one." }));
    await fixture.write("learn/concepts/fixtures/beta.md", note({ id: "beta", title: "Beta", body: "# Beta\n\nThe body." }));
    await fixture.write("learn/concepts/fixtures/gamma.md", note({ id: "gamma", title: "Gamma", summary: "The third." }));
    const context = await fixture.context({ knownConcepts: async () => new Set(["alpha", "beta", "gamma"]) });
    const database = await databaseIdentity(scratch.db);
    for (const indexer of [topicsIndexer, tagsIndexer, conceptsIndexer]) {
      const { rows, logs } = await indexer.read(context);
      await writeSource(scratch.db, indexer, rows, [], indexer.root(context), { logs, metadata: { root: fixture.root, database } });
    }
    for (const file of await renderType(scratch.db, "topics")) await writeFile(path.join(fixture.root, file.path), file.bytes);
    await flip(scratch.db, { type: "concepts", readers: new Set(["concepts"]) });
    await recordExport(scratch.db, "concepts", exportHash(await readTypeFiles(fixture.root, "concepts")));

    restore = pointAt(scratch.name);
    process.env["LEARN_ROOT"] = fixture.root;
    one = connect({ url: scratch.url });
    two = connect({ url: scratch.url });
    bindCatalog(async () => one.db);
  }, 60_000);

  afterAll(async () => {
    bindCatalog(null);
    await one?.close();
    await two?.close();
    restore?.();
    await scratch?.drop();
    await fixture?.cleanup();
  });

  it("refuses an edit when a commit lands between its read and its write, and keeps that commit", async () => {
    let fired = false;
    const edit = updateConcept(
      "alpha",
      async (read) => {
        if (!fired) {
          fired = true;
          await commitElsewhere("alpha", (f) => ({ ...f, summary: "Changed elsewhere." }));
        }
        // What `learn concept edit --title` writes: the note as read, one field replaced.
        return { ...read, title: "Alpha, edited here" };
      },
      { reason: "learn concept edit alpha: title" },
    );
    await expect(edit).rejects.toBeInstanceOf(MovedBaseError);
    await expect(edit).rejects.toThrow(/has moved on: this write started from revision \d+, and the latest is revision \d+/);
    expect(await row("alpha")).toMatchObject({ title: "Alpha", summary: "Changed elsewhere." });
  });

  it("reads again and reapplies an append (check add, session close), so both writes stand", async () => {
    let calls = 0;
    const result = await updateConcept(
      "beta",
      async (read) => {
        calls += 1;
        if (calls === 1) await commitElsewhere("beta", (f) => ({ ...f, body: `${f.body.trimEnd()}\n\nWritten elsewhere.\n` }));
        return { ...read, body: `${read.body.trimEnd()}\n\nAppended here.\n` };
      },
      { reason: "learn check add beta", attempts: 3 },
    );
    expect(calls).toBe(2);
    expect(result?.written?.changed).toBe(true);
    const body = (await row("beta"))?.body ?? "";
    expect(body).toContain("Written elsewhere.");
    expect(body).toContain("Appended here.");
  });

  it("bases a checkout's next commit on the revision its commit wrote, not on a read after it", async () => {
    // The commit from elsewhere lands right after this checkout's commit: in
    // the old code, between the commit and the re-read that set the next base.
    let calls = 0;
    let armedAt = -1;
    let fired = false;
    const fire = async () => {
      if (fired) return;
      fired = true;
      await commitElsewhere("gamma", (f) => ({ ...f, summary: "Moved elsewhere." }));
    };
    bindCatalog(async () => {
      calls += 1;
      if (calls === armedAt) await fire();
      return one.db;
    });
    try {
      const checkout = await checkoutConcept("gamma");
      await writeFile(checkout.path, (await readFile(checkout.path, "utf8")).replace("title: Gamma", "title: Gamma, once"));
      armedAt = calls + 2;
      const first = await commitConcept("gamma", { reason: "first commit" });
      expect(first.changed).toBe(true);
      await fire();

      await writeFile(checkout.path, (await readFile(checkout.path, "utf8")).replace("title: Gamma, once", "title: Gamma, twice"));
      await expect(commitConcept("gamma", { reason: "second commit" })).rejects.toBeInstanceOf(MovedBaseError);
      expect(await row("gamma")).toMatchObject({ title: "Gamma, once", summary: "Moved elsewhere." });
    } finally {
      bindCatalog(async () => one.db);
    }
  });
});

const COURSE_X = [
  "id: xx1000",
  "slug: xx1000",
  "code: XX1000",
  "title: A test course",
  "credits: 4",
  "order: 1",
  "inferred: false",
  "tags: [testing]",
  "modules:",
  "  - id: xx1000-m1",
  "    slug: m1",
  "    title: Module one",
  "    order: 1",
  "    topic: alpha",
  "    topics:",
  "      - id: xx1000-m1-t1",
  "        title: First item",
  "        concepts:",
  "          - base",
  "        subtopics: []",
  "      - id: xx1000-m1-t2",
  "        title: Second item",
  "        concepts:",
  "          - derived",
  "        subtopics: []",
  "    resources: []",
  "  - id: xx1000-m2",
  "    slug: m2",
  "    title: Module two",
  "    order: 2",
  "    topic: beta",
  "    topics:",
  "      - id: xx1000-m2-t1",
  "        title: Only item",
  "        concepts:",
  "          - other",
  "        subtopics: []",
  "    resources: []",
  "capstone: Build something.",
  "",
].join("\n");

const COURSE_Y = [
  "id: yy2000",
  "slug: yy2000",
  "code: YY2000",
  "title: Another course",
  "credits: 4",
  "order: 2",
  "inferred: true",
  "tags: [testing]",
  "modules:",
  "  - id: yy2000-m1",
  "    slug: m1",
  "    title: Its module",
  "    order: 1",
  "    topic: alpha",
  "    topics:",
  "      - id: yy2000-m1-t1",
  "        title: Its item",
  "        concepts:",
  "          - base",
  "        subtopics: []",
  "      - id: yy2000-m1-t2",
  "        title: Its second item",
  "        concepts:",
  "          - derived",
  "        subtopics: []",
  "    resources: []",
  "capstone: Something else.",
  "",
].join("\n");

describe.skipIf(!reachable.ok)("course files, item purges and topic renames against a concurrent write", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let edits: string;
  let restore: () => void;
  let two: Connection;

  const courseFile = () => path.join(fixture.root, "content/courses/xx1000.yaml");

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([
        { slug: "alpha", courses: ["xx1000-m1", "yy2000-m1"], concepts: ["base", "derived"] },
        { slug: "beta", courses: ["xx1000-m2"], concepts: ["other"] },
        { slug: "gamma", concepts: ["stray"] },
      ]),
    );
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write("content/courses/xx1000.yaml", COURSE_X);
    await fixture.write("content/courses/yy2000.yaml", COURSE_Y);
    for (const id of ["base", "derived", "other", "stray"]) {
      await fixture.write(`learn/concepts/testing/${id}.md`, note({ id }));
    }
    edits = await mkdtemp(path.join(tmpdir(), "catalog-lost-updates-"));
    restore = pointAt(scratch.name);
    await runImportCommand({ dir: fixture.root });
    await runExport({ out: fixture.root, only: ["topics", "tags", "courses"] });
    two = connect({ url: scratch.url });
  }, 60_000);

  afterAll(async () => {
    await two?.close();
    restore?.();
    await scratch?.drop();
    await fixture?.cleanup();
    if (edits !== undefined) await rm(edits, { recursive: true, force: true });
  });

  it("stamps an exported course with its base, and refuses to import it once the course moved on", async () => {
    const out = path.join(edits, "xx1000.yaml");
    const exported = await runCourseExport({ id: "xx1000", out });
    const text = await readFile(out, "utf8");
    expect(exported.base).toEqual(expect.any(Number));
    expect(text.split("\n")[0]).toMatch(new RegExp(`^# base-revision: ${exported.base} \\(catalog course export`));
    expect(readStamp(text)).toBe(exported.base);
    expect(text.slice(text.indexOf("\n") + 1)).toBe((await exportCourse(scratch.db, "xx1000")).yaml);

    // Meanwhile, from somewhere else: an item is archived.
    await archiveItem(two.db, { id: "xx1000-m1-t2", reason: "archived elsewhere" });

    await writeFile(out, text.replace("title: Module two", "title: Module two, retitled"));
    const before = (await scratch.db.select({ n: sql<number>`count(*)::int` }).from(contentRevision))[0]?.n;
    await expect(importCourse(scratch.db, { file: out, reason: "retitle module two" })).rejects.toThrow(
      new RegExp(
        `was exported at revision ${exported.base}, and course "xx1000" has moved on since: ` +
          `curriculum_item xx1000-m1-t2 \\(revision \\d+\\)\\. Importing it would undo that[\\s\\S]*--force-base`,
      ),
    );
    // Refused whole, under the locks: the archive stands and nothing was written.
    const [item] = await scratch.db.select().from(curriculumItem).where(eq(curriculumItem.id, "xx1000-m1-t2"));
    expect(item?.archivedAt).not.toBeNull();
    expect((await scratch.db.select({ n: sql<number>`count(*)::int` }).from(contentRevision))[0]?.n).toBe(before);
    // A dry run is refused the same way, since it is the same check.
    await expect(importCourse(scratch.db, { file: out, reason: "retitle", dryRun: true })).rejects.toThrow(/has moved on since/);

    // --force-base imports the file as it stands, which undoes the archive, and says so.
    const forced = await importCourse(scratch.db, { file: out, reason: "retitle module two, undoing the archive", forceBase: true });
    expect(forced.restored.items).toEqual(["xx1000-m1-t2"]);
    // The file's stamp moved on with the import, so the next edit of it is not stale.
    const after = await readFile(out, "utf8");
    expect(readStamp(after)).toBe(forced.base);
    await writeFile(out, after.replace("title: Module two, retitled", "title: Module two, again"));
    const again = await importCourse(scratch.db, { file: out, reason: "retitle it again" });
    expect(again.changes.filter((c) => c.op !== null).map((c) => c.id)).toEqual(["xx1000-m2"]);
  }, 60_000);

  it("writes the course's own file in the tree without a stamp, since the write-through compares it byte for byte", async () => {
    const exported = await runCourseExport({ id: "xx1000", out: courseFile() });
    const onDisk = await readFile(courseFile(), "utf8");
    expect(readStamp(onDisk)).toBeUndefined();
    expect(onDisk).toBe((await exportCourse(scratch.db, "xx1000")).yaml);
    expect(exported.yaml).toBe(onDisk);
    // A link to the tree's file is the tree's file: the write follows it.
    const link = path.join(edits, "link-to-tree.yaml");
    await symlink(courseFile(), link);
    await runCourseExport({ id: "xx1000", out: link });
    expect(readStamp(await readFile(courseFile(), "utf8"))).toBeUndefined();
    // And printed, it is stamped: stdout is how a file ends up anywhere.
    expect(readStamp((await runCourseExport({ id: "xx1000" })).yaml)).toEqual(expect.any(Number));
  });

  it("purges an item with the learner row a tick committed mid-purge, never deleting it unrecorded", async () => {
    const id = "yy2000-m1-t2";
    await archiveItem(scratch.db, { id, reason: "about to purge" });
    await scratch.db.insert(learner).values({ id: "local" }).onConflictDoNothing();
    await scratch.db.insert(recap).values({ learnerId: "local", curriculumItemId: id, summary: "a recap", source: "agent" });

    // A learner ticks the item while the purge runs: the tick's transaction
    // has inserted its row and holds the recap, so the purge has to wait for
    // it somewhere.
    const b = new pg.Client({ connectionString: scratch.url });
    await b.connect();
    const a = connect({ url: scratch.url });
    try {
      await b.query("begin");
      await b.query(
        `insert into progress (learner_id, curriculum_item_id, completed_at, note) values ('local', $1, now(), 'ticked mid-purge')`,
        [id],
      );
      await b.query("select 1 from recap where curriculum_item_id = $1 for update", [id]);
      const pid = await pidOf(a.db);
      const purging = purgeItem(a.db, { id, reason: "gone", withLearnerData: true });
      await waiting(scratch.db, pid);
      await b.query("commit");
      const purged = await purging;

      const [revision] = await scratch.db.select().from(contentRevision).where(eq(contentRevision.id, purged.revisionId));
      const links = (revision?.snapshot as { links: Record<string, Record<string, unknown>[]> }).links;
      // The tick is in the revision, so `item restore` can put it back.
      expect(links["progress"]).toEqual([expect.objectContaining({ learner_id: "local", note: "ticked mid-purge" })]);
      expect(links["recap"]).toEqual([expect.objectContaining({ summary: "a recap" })]);
      expect(purged.detail).toContain("progress of local");
    } finally {
      await b.end();
      await a.close();
    }
  }, 60_000);

  it("refuses a rename while a studio job is drawing or awaiting review under the old slug", async () => {
    const job = await runEnqueue({
      brief: { topic: "beta", target: "learn/assets/beta-picture.tldr", idempotencyKey: "lost-updates", brief: { topic: "beta" } },
      repoRoot: fixture.root,
    });
    try {
      for (const state of ["running", "awaiting_review"]) {
        await scratch.db.execute(sql`update job set state = ${state} where id = ${job.job.id}`);
        await expect(renameTopic(scratch.db, { from: "beta", to: "betamax" }, by)).rejects.toThrow(
          new RegExp(`1 studio job\\(s\\) are drawing or awaiting review under "beta": ${job.job.id} \\(${state}\\)`),
        );
      }
      expect((await scratch.db.execute(sql`select 1 from topic where slug = 'beta'`)).rows).toHaveLength(1);
    } finally {
      await scratch.db.execute(sql`update job set state = 'cancelled' where id = ${job.job.id}`);
    }
  });

  it("includes the course files when a module joined the topic after the rename looked, and lists stale SVGs", async () => {
    // A diagram SVG filed under gamma: renaming the topic leaves its stamp stale.
    const svg = await storedBlob(scratch.db, "gamma-map", "svg");
    await scratch.db.execute(sql`
      insert into asset (id, kind, path, content_hash, bytes, title, source_repo, blob_key)
      values ('diagram:learn/assets/gamma-map.svg', 'diagram_svg', 'learn/assets/gamma-map.svg', 'x', 1, 'A map', 'self-learn', ${svg})`);
    await scratch.db.execute(sql`insert into asset_topic (asset_id, topic_slug) values ('diagram:learn/assets/gamma-map.svg', 'gamma')`);

    // The course import that moves module two under gamma, holding its export
    // locks while it waits on the identity lock a third connection holds.
    const moved = (await readFile(courseFile(), "utf8"))
      .replace("    topic: beta\n", "    topic: gamma\n")
      .replace("          - other\n", "          - stray\n");
    const file = path.join(edits, "moved.yaml");
    await writeFile(file, moved);
    const three = new pg.Client({ connectionString: scratch.url });
    await three.connect();
    const one = connect({ url: scratch.url });
    try {
      await three.query("begin");
      await three.query("select pg_advisory_xact_lock(hashtextextended('catalog:course-identity', 0))");
      const importPid = await pidOf(two.db);
      const importing = importCourse(two.db, { file, reason: "move module two under gamma" });
      await waiting(scratch.db, importPid);

      // No module is under gamma yet, so the rename's first guess is topics
      // alone; it then waits on the export lock the import holds.
      const renamePid = await pidOf(one.db);
      const renaming = renameTopic(one.db, { from: "gamma", to: "delta" }, { ...by, reason: "a clearer slug" });
      await waiting(scratch.db, renamePid);
      await three.query("commit");
      await importing;
      const result = await renaming;

      expect(result.exported.map((e) => e.type).sort()).toEqual(["courses", "topics"]);
      expect(await readFile(courseFile(), "utf8")).toContain("    topic: delta\n");
      expect(await readFile(courseFile(), "utf8")).not.toContain("topic: gamma");
      expect(result.staleSvgs).toEqual(["learn/assets/gamma-map.svg"]);
    } finally {
      await three.end();
      await one.close();
    }
  }, 60_000);
});
