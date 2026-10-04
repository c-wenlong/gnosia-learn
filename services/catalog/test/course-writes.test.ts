import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { asset, collection, contentRevision, curriculumItem, learner, progress, recap } from "@self-learn/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runExport } from "../src/commands/export";
import { runFlip } from "../src/commands/flip";
import { runImportCommand } from "../src/commands/index-command";
import { runParity } from "../src/commands/parity";
import { CourseWriteError, exportCourse, importCourse } from "../src/content/courses";
import { archiveItem, purgeItem, restoreItem } from "../src/content/items";
import { type CatalogDatabase, connect } from "../src/db";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { migratedScratchDatabase, probe, type Scratch, sqlstate } from "./scratch-database";

/**
 * Track B's writers (docs/CONTENT-MIGRATION.md): `catalog course import`,
 * `course export` and `item archive|restore|purge`, on a small fixture tree
 * imported into a scratch database.
 *
 * The rule under test above all is D12 and edge case 13: a course edit that
 * drops an item archives it, and the learner's tick and recap on it stay. A
 * purge is the only way an item goes, it refuses while learner rows name the
 * item, and with the flag it keeps them in its revision, from which restore
 * brings everything back.
 *
 * Every file written is under the OS temp directory: the fixture is the tree
 * the courses were imported from, so the write-through (D17) lands there.
 */

const reachable = await probe();

function pointAt(name: string): () => void {
  const saved = { url: process.env["DATABASE_URL"], manimkc: process.env["MANIMKC_ROOT"] };
  const url = new URL(process.env["DATABASE_URL"] ?? "postgres://localhost:5432/self_learn");
  url.pathname = `/${name}`;
  process.env["DATABASE_URL"] = url.toString();
  process.env["MANIMKC_ROOT"] = path.join(tmpdir(), "catalog-test-no-manimkc");
  return () => {
    for (const [key, value] of [["DATABASE_URL", saved.url], ["MANIMKC_ROOT", saved.manimkc]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

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
  "        subtopics:",
  "          - A reading",
  "    resources:",
  "      - id: xx1000-m1-r1",
  "        title: A link",
  "        url: https://example.com/one",
  "        type: docs",
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
  "tags: [later]",
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

async function tree(): Promise<Fixture> {
  const fixture = await makeFixture();
  await fixture.write(
    "content/topics.yaml",
    topicsYaml([
      { slug: "alpha", courses: ["xx1000-m1", "yy2000-m1"], concepts: ["base", "derived"] },
      { slug: "beta", courses: ["xx1000-m2"], concepts: ["other"] },
      { slug: "gamma" },
    ]),
  );
  await fixture.write("content/tags.yaml", tagsYaml(["testing", "later"]));
  await fixture.write("content/courses/xx1000.yaml", COURSE_X);
  await fixture.write("content/courses/yy2000.yaml", COURSE_Y);
  await fixture.write("learn/concepts/testing/base.md", note({ id: "base" }));
  await fixture.write("learn/concepts/testing/derived.md", note({ id: "derived", requires: ["base"] }));
  await fixture.write("learn/concepts/testing/other.md", note({ id: "other" }));
  await fixture.write("learn/concepts/testing/stray.md", note({ id: "stray" }));
  return fixture;
}

async function revisionTotal(scratch: Scratch): Promise<number> {
  const [row] = await scratch.db.select({ n: sql<number>`count(*)::int` }).from(contentRevision);
  return row?.n ?? 0;
}

const reason = "a test edit";

describe.skipIf(!reachable.ok)("catalog course import, export and the item verbs", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let edits: string;
  let restore: () => void;

  const courseFile = () => path.join(fixture.root, "content/courses/xx1000.yaml");
  /**
   * Two writes at once on two connections. One pool is one connection (the
   * CLI's `max: 1`), which would run them one after the other and prove
   * nothing about a race.
   */
  const racing = async <T>(
    start: (one: CatalogDatabase, two: CatalogDatabase) => Promise<T>[],
  ): Promise<PromiseSettledResult<T>[]> => {
    const one = connect({ url: scratch.url });
    const two = connect({ url: scratch.url });
    try {
      return await Promise.allSettled(start(one.db, two.db));
    } finally {
      await one.close();
      await two.close();
    }
  };
  /** Write an edited copy of the course outside the tree and return its path. */
  const edited = async (name: string, text: string) => {
    const file = path.join(edits, name);
    await writeFile(file, text);
    return file;
  };

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    fixture = await tree();
    // `stray` is filed under gamma, which no module uses: the note for the
    // wrong-topic refusal below.
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([
        { slug: "alpha", courses: ["xx1000-m1", "yy2000-m1"], concepts: ["base", "derived"] },
        { slug: "beta", courses: ["xx1000-m2"], concepts: ["other"] },
        { slug: "gamma", concepts: ["stray"] },
      ]),
    );
    edits = await mkdtemp(path.join(tmpdir(), "catalog-course-edits-"));
    restore = pointAt(scratch.name);
    await runImportCommand({ dir: fixture.root });
    // The fixture's YAML is hand-written; the write-through keeps files in
    // step only from the database's own export of them, so start from that.
    await runExport({ out: fixture.root, only: ["topics", "tags", "courses"] });
  }, 60_000);

  afterAll(async () => {
    restore?.();
    await scratch?.drop();
    await fixture?.cleanup();
    if (edits !== undefined) await rm(edits, { recursive: true, force: true });
  });

  it("exports one course as the file it was imported from", async () => {
    const result = await exportCourse(scratch.db, "xx1000");
    expect(result.path).toBe("content/courses/xx1000.yaml");
    expect(result.yaml).toBe(await readFile(courseFile(), "utf8"));
    await expect(exportCourse(scratch.db, "xx1000-m1")).rejects.toThrow(/no course "xx1000-m1".*is a module/);
  });

  it("appends nothing for an unchanged file, and writes no file", async () => {
    const before = await revisionTotal(scratch);
    const result = await importCourse(scratch.db, { file: courseFile(), reason });
    expect(result.revisions).toBe(0);
    expect(result.changes.every((c) => c.op === null)).toBe(true);
    expect(result.writeThrough.written).toEqual([]);
    expect(await revisionTotal(scratch)).toBe(before);
  });

  it("writes one revision per changed entity with the reason, and keeps the tree in step", async () => {
    const text = COURSE_X.replace("        title: First item\n", "        title: First item, renamed\n");
    const file = await edited("rename.yaml", text);
    const result = await importCourse(scratch.db, { file, reason: "rename the first item" });
    expect(result.changes.filter((c) => c.op !== null)).toEqual([
      { type: "curriculum_item", id: "xx1000-m1-t1", op: "update", revisionId: expect.any(Number) },
    ]);
    const [revision] = await scratch.db
      .select()
      .from(contentRevision)
      .where(eq(contentRevision.entityId, "xx1000-m1-t1"))
      .orderBy(sql`${contentRevision.seq} desc`)
      .limit(1);
    expect(revision).toMatchObject({ op: "update", authorKind: "person", author: "local", reason: "rename the first item" });
    // The tree the courses came from now says the same, byte for byte.
    expect(await readFile(courseFile(), "utf8")).toBe(text);
    expect(result.writeThrough.written.map((w) => w.path)).toEqual(["content/courses/xx1000.yaml"]);
    // So an import of the tree changes nothing, and parity is clean.
    const reimport = await runImportCommand({ dir: fixture.root });
    expect(reimport.sources.flatMap((s) => Object.keys(s.revisions))).toEqual([]);
    expect((await runParity({ dir: fixture.root })).clean).toBe(true);
  }, 60_000);

  it("archives an item the file drops, keeps the learner's tick and recap, and reports it", async () => {
    await scratch.db.insert(learner).values({ id: "local" }).onConflictDoNothing();
    await scratch.db.insert(progress).values({ learnerId: "local", curriculumItemId: "xx1000-m1-t2", completedAt: new Date(), note: "done" });
    await scratch.db.insert(recap).values({ learnerId: "local", curriculumItemId: "xx1000-m1-t2", summary: "what I learnt", source: "agent" });

    const dropped = (await readFile(courseFile(), "utf8")).replace(
      /      - id: xx1000-m1-t2\n[\s\S]*?(?=    resources:)/,
      "",
    );
    await writeFile(courseFile(), dropped);
    const result = await importCourse(scratch.db, { file: courseFile(), reason: "drop the second item" });
    expect(result.archived).toEqual({ modules: [], items: ["xx1000-m1-t2"] });
    expect(result.changes.find((c) => c.id === "xx1000-m1-t2")?.op).toBe("archive");

    const [item] = await scratch.db.select().from(curriculumItem).where(eq(curriculumItem.id, "xx1000-m1-t2"));
    expect(item?.archivedAt).not.toBeNull();
    expect(await scratch.db.select().from(progress).where(eq(progress.curriculumItemId, "xx1000-m1-t2"))).toHaveLength(1);
    expect(await scratch.db.select().from(recap).where(eq(recap.curriculumItemId, "xx1000-m1-t2"))).toHaveLength(1);
    // Off the course path: the export leaves it out.
    expect((await exportCourse(scratch.db, "xx1000")).yaml).not.toContain("xx1000-m1-t2");
  });

  it("restores an archived item a later file lists again, with its concepts", async () => {
    const back = await edited("back.yaml", COURSE_X.replace("        title: First item\n", "        title: First item, renamed\n"));
    const result = await importCourse(scratch.db, { file: back, reason: "bring the second item back" });
    expect(result.restored.items).toEqual(["xx1000-m1-t2"]);
    expect(result.changes.find((c) => c.id === "xx1000-m1-t2")?.op).toBe("restore");
    expect((await exportCourse(scratch.db, "xx1000")).yaml).toContain("          - derived");
  });

  it("refuses references the catalog does not hold, naming each, and writes nothing", async () => {
    const before = await revisionTotal(scratch);
    const bad = COURSE_X.replace("          - base\n", "          - base\n          - missing-note\n          - stray\n")
      .replace("  - id: xx1000-m2\n", "  - id: yy2000-m1\n")
      .replace("tags: [testing]", "tags: [testing, nope]")
      .replace("order: 1\ninferred", "order: 2\ninferred");
    const file = await edited("bad.yaml", bad);
    const refusal = importCourse(scratch.db, { file, reason });
    await expect(refusal).rejects.toBeInstanceOf(CourseWriteError);
    await expect(importCourse(scratch.db, { file, reason })).rejects.toThrow(
      new RegExp(
        [
          'order 2 is already course "yy2000"',
          'module id "yy2000-m1" is already a module of "yy2000"',
          'tag "nope" is not a tag',
          'lists concept "missing-note", which is not a live concept note',
          'lists concept "stray", which is filed under topic "gamma", not its module\'s topic "alpha"',
        ].join("[\\s\\S]*"),
      ),
    );
    expect(await revisionTotal(scratch)).toBe(before);
  });

  it("refuses an item id another course holds", async () => {
    const file = await edited("steal.yaml", COURSE_X.replace("xx1000-m2-t1", "yy2000-m1-t1"));
    await expect(importCourse(scratch.db, { file, reason })).rejects.toThrow(
      /item id "yy2000-m1-t1" already belongs to course "yy2000"/,
    );
  });

  it("holds course slugs unique among live courses as a constraint, and refuses one by name", async () => {
    const file = await edited("slug.yaml", COURSE_X.replace("slug: xx1000", "slug: yy2000"));
    await expect(importCourse(scratch.db, { file, reason })).rejects.toThrow(/slug "yy2000" is already course "yy2000"'s/);
    // And the database says the same without the writer.
    const error = await scratch.db
      .insert(collection)
      .values({ id: "zz3000", kind: "course", slug: "yy2000", title: "Clash", position: 9 })
      .then(() => null, (e: unknown) => e);
    expect(sqlstate(error)).toBe("23505");
  });

  it("commits nothing on a dry run, and writes no file", async () => {
    const before = await revisionTotal(scratch);
    const onDisk = await readFile(courseFile(), "utf8");
    const file = await edited("dry.yaml", onDisk.replace("Module two", "Module two, retitled"));
    const result = await importCourse(scratch.db, { file, reason, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.changes.filter((c) => c.op !== null).map((c) => [c.id, c.revisionId])).toEqual([["xx1000-m2", null]]);
    expect(await revisionTotal(scratch)).toBe(before);
    expect(await readFile(courseFile(), "utf8")).toBe(onDisk);
  });

  it("refuses to overwrite a course file holding edits the database never imported", async () => {
    const onDisk = await readFile(courseFile(), "utf8");
    await writeFile(courseFile(), onDisk.replace("Build something.", "Build something, edited by hand."));
    try {
      const before = await revisionTotal(scratch);
      const file = await edited("other-edit.yaml", onDisk.replace("Module two", "Module two, retitled"));
      await expect(importCourse(scratch.db, { file, reason })).rejects.toThrow(
        /content\/courses\/\*\.yaml under .* is not what the database holds: content\/courses\/xx1000\.yaml differ/,
      );
      expect(await revisionTotal(scratch)).toBe(before);
    } finally {
      await writeFile(courseFile(), onDisk);
    }
  });

  it("archives a dropped module with its items, deletes a link nothing lists, and rewrites maps.courses", async () => {
    const withoutM2 = (await readFile(courseFile(), "utf8"))
      .replace(/  - id: xx1000-m2\n[\s\S]*?(?=capstone:)/, "")
      .replace(/    resources:\n      - id: xx1000-m1-r1\n[\s\S]*?type: docs\n/, "    resources: []\n");
    await writeFile(courseFile(), withoutM2);
    const result = await importCourse(scratch.db, { file: courseFile(), reason: "drop module two and the link" });
    expect(result.archived).toEqual({ modules: ["xx1000-m2"], items: ["xx1000-m2-t1"] });
    expect(result.deletedLinks).toEqual(["link:xx1000-m1-r1"]);
    expect(await scratch.db.select().from(asset).where(eq(asset.id, "link:xx1000-m1-r1"))).toEqual([]);
    const [deletion] = await scratch.db
      .select()
      .from(contentRevision)
      .where(and(eq(contentRevision.entityType, "asset"), eq(contentRevision.entityId, "link:xx1000-m1-r1")))
      .orderBy(sql`${contentRevision.seq} desc`)
      .limit(1);
    expect(deletion?.op).toBe("delete");
    // The vocabulary lists a topic's live modules, so beta's list is empty now.
    const topics = await readFile(path.join(fixture.root, "content/topics.yaml"), "utf8");
    // The course file is the one imported, already what the rows now say;
    // the vocabulary is rewritten from the rows.
    expect(result.writeThrough.written.map((w) => w.path)).toEqual(["content/topics.yaml"]);
    expect(await readFile(courseFile(), "utf8")).toBe((await exportCourse(scratch.db, "xx1000")).yaml);
    expect(topics).toMatch(/slug: beta[\s\S]*?courses: \[\]/);
    const reimport = await runImportCommand({ dir: fixture.root });
    expect(reimport.sources.flatMap((s) => Object.keys(s.revisions))).toEqual([]);
  }, 60_000);

  it("refuses to archive a module's last live item, also when two archives race for the last two", async () => {
    const both = await racing((one, two) => [
      archiveItem(one, { id: "yy2000-m1-t1", reason: "race one" }),
      archiveItem(two, { id: "yy2000-m1-t2", reason: "race two" }),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const refused = both.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(String(refused?.reason)).toMatch(/last live item of module "yy2000-m1"/);
    const archived = both.findIndex((r) => r.status === "fulfilled") === 0 ? "yy2000-m1-t1" : "yy2000-m1-t2";
    await restoreItem(scratch.db, { id: archived, reason: "undo the race" });
    const live = await scratch.db
      .select({ id: curriculumItem.id })
      .from(curriculumItem)
      .where(and(eq(curriculumItem.collectionId, "yy2000-m1"), isNull(curriculumItem.archivedAt)));
    expect(live).toHaveLength(2);
  });

  it("gives a purged item back the concepts the indexer had already cleared, from its last live revision", async () => {
    const file = path.join(fixture.root, "content/courses/yy2000.yaml");
    const original = await readFile(file, "utf8");
    // Archived by `catalog index`, which replaces the item's links whole and so drops them.
    await writeFile(file, original.replace(/      - id: yy2000-m1-t2\n[\s\S]*?(?=    resources:)/, ""));
    await runImportCommand({ dir: fixture.root });
    const [row] = await scratch.db.select().from(curriculumItem).where(eq(curriculumItem.id, "yy2000-m1-t2"));
    expect(row?.archivedAt).not.toBeNull();
    await purgeItem(scratch.db, { id: "yy2000-m1-t2", reason: "purge an indexer-archived item" });
    const back = await restoreItem(scratch.db, { id: "yy2000-m1-t2", reason: "and bring it back" });
    expect(back.detail).toContain("concept derived");
    expect(await readFile(file, "utf8")).toBe(original);
  }, 60_000);

  it("refuses a course code that is not one safe file name", async () => {
    for (const code of ["../../outside", "XX/1000", "..", ".hidden"]) {
      const file = await edited("code.yaml", COURSE_X.replace("code: XX1000", `code: "${code}"`));
      await expect(importCourse(scratch.db, { file, reason })).rejects.toThrow(/it is the course's file name/);
    }
  });

  it("lets only one of two racing imports take the same order", async () => {
    const newCourse = (id: string) => COURSE_Y.replaceAll("yy2000", id).replace("order: 2", "order: 7");
    const a = await edited("race-a.yaml", newCourse("aa3000").replace("code: YY2000", "code: AA3000"));
    const b = await edited("race-b.yaml", newCourse("bb4000").replace("code: YY2000", "code: BB4000"));
    const both = await racing((one, two) => [
      importCourse(one, { file: a, reason: "race a" }),
      importCourse(two, { file: b, reason: "race b" }),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const refused = both.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(String(refused?.reason)).toMatch(/order 7 is already course/);
  });

  it("archives and restores one item by its verbs, each one revision", async () => {
    const archived = await archiveItem(scratch.db, { id: "xx1000-m1-t1", reason: "not now" });
    expect(archived.op).toBe("archive");
    expect(await readFile(courseFile(), "utf8")).not.toContain("xx1000-m1-t1");
    const restored = await restoreItem(scratch.db, { id: "xx1000-m1-t1", reason: "back again" });
    expect(restored.op).toBe("restore");
    expect(restored.detail).toContain("concept base");
    expect(await readFile(courseFile(), "utf8")).toContain("xx1000-m1-t1");
  });

  it("refuses to purge a live item, and an archived one with learner rows unless told", async () => {
    await expect(purgeItem(scratch.db, { id: "xx1000-m1-t2", reason })).rejects.toThrow(/is live. Archive it first/);
    await archiveItem(scratch.db, { id: "xx1000-m1-t2", reason: "about to purge" });
    await expect(purgeItem(scratch.db, { id: "xx1000-m1-t2", reason })).rejects.toThrow(
      /carries learner data: 1 progress row\(s\) and 1 recap row\(s\), for local/,
    );
    expect(await scratch.db.select().from(curriculumItem).where(eq(curriculumItem.id, "xx1000-m1-t2"))).toHaveLength(1);
  });

  it("purges with --with-learner-data into the revision, and restore brings all of it back", async () => {
    const purged = await purgeItem(scratch.db, { id: "xx1000-m1-t2", reason: "gone for good", withLearnerData: true });
    expect(purged.op).toBe("delete");
    expect(await scratch.db.select().from(curriculumItem).where(eq(curriculumItem.id, "xx1000-m1-t2"))).toEqual([]);
    expect(await scratch.db.select().from(progress).where(eq(progress.curriculumItemId, "xx1000-m1-t2"))).toEqual([]);
    const [revision] = await scratch.db.select().from(contentRevision).where(eq(contentRevision.id, purged.revisionId));
    const links = (revision?.snapshot as { links: Record<string, Record<string, unknown>[]> }).links;
    expect(links["progress"]).toEqual([expect.objectContaining({ learner_id: "local", note: "done" })]);
    expect(links["recap"]).toEqual([expect.objectContaining({ learner_id: "local", summary: "what I learnt" })]);
    expect(links["concept_curriculum_item"]).toEqual([expect.objectContaining({ concept_slug: "derived" })]);

    const back = await restoreItem(scratch.db, { id: "xx1000-m1-t2", reason: "undo the purge" });
    expect(back.op).toBe("restore");
    const [tick] = await scratch.db.select().from(progress).where(eq(progress.curriculumItemId, "xx1000-m1-t2"));
    expect(tick).toMatchObject({ learnerId: "local", note: "done" });
    const [kept] = await scratch.db.select().from(recap).where(eq(recap.curriculumItemId, "xx1000-m1-t2"));
    expect(kept).toMatchObject({ summary: "what I learnt", source: "agent" });
    expect((await exportCourse(scratch.db, "xx1000")).yaml).toMatch(/xx1000-m1-t2[\s\S]*- derived/);
  });

  it("writes through the seam once courses are flipped, and the tree stays the database's own export", async () => {
    await runExport({ out: fixture.root, only: ["courses", "topics", "tags"] });
    await runImportCommand({ dir: fixture.root });
    await runFlip({ type: "courses", readers: new Set(["courses"]) });
    const text = (await readFile(courseFile(), "utf8")).replace("Build something.", "Build something bigger.");
    const file = await edited("flipped.yaml", text);
    const result = await importCourse(scratch.db, { file, reason: "after the flip" });
    expect(result.changes.find((c) => c.id === "xx1000")?.op).toBe("update");
    expect(result.writeThrough.recorded).toContain("courses");
    // The import of the tree now skips courses as the database's own export.
    const reimport = await runImportCommand({ dir: fixture.root });
    expect(reimport.skipped).toContainEqual({ source: "courses", reason: expect.stringMatching(/its own last export/) });
    // A raw write is refused by the armed guard; the seam's went through.
    const error = await scratch.db
      .update(curriculumItem)
      .set({ title: "raw" })
      .where(eq(curriculumItem.id, "xx1000-m1-t1"))
      .then(() => null, (e: unknown) => e);
    expect(sqlstate(error)).toBe("42501");
  }, 60_000);
});
