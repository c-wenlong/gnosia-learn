import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { asset, collection, collectionItem, contentRevision, curriculumItem, curriculumItemAsset } from "@self-learn/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseCourse, VIDEO_ASSET_PREFIXES } from "@self-learn/content";

import { doctor, formatDoctor } from "../src/commands/doctor";
import { runExport } from "../src/commands/export";
import { runImportCommand } from "../src/commands/index-command";
import { runStatus } from "../src/commands/status";
import { CourseWriteError, exportCourse, importCourse } from "../src/content/courses";
import { setTriggers, WRITE_GUARDS, writeGuardName } from "../src/content/rules";
import { readCourses } from "../src/content/readers/courses";
import { readSnapshots } from "../src/content/snapshot";
import { VIDEO_PREFIX } from "../src/content/videos";
import { ASSET_PREFIX } from "../src/index/source";
import { applyMigrations } from "../src/migrations";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { createScratchDatabase, probe, sqlstate, type Scratch } from "./scratch-database";

/**
 * Phase 2 of docs/proposals/module-learning-path.md: a reading names the
 * lessons it goes with (`lessons:`, stored as `curriculum_item_asset`), and a
 * module and a lesson list videos by asset id (`videos:`, stored as data on
 * the row that owns the list). The links are the courses source's and `course
 * import`'s, part of each item's revision snapshot, and survive an export and
 * an import unchanged. A listed video is a reference: nothing resolves it at
 * import, so a course naming a manimkc video imports into a catalog that has
 * never seen manimkc.
 *
 * Every file written is under the OS temp directory.
 */

const reachable = await probe();

const VIDEO = "manimkc:out/testing/week-01/week_01_asymptotics.mp4";

/** Written the way the database exports it, so the file is its own export, byte for byte. */
const COURSE = [
  "id: zz3000",
  "slug: zz3000",
  "code: ZZ3000",
  "title: Lessons and readings",
  "credits: 4",
  "order: 1",
  "inferred: false",
  "tags: [testing]",
  "modules:",
  "  - id: zz3000-m1",
  "    slug: m1",
  "    title: Module one",
  "    order: 1",
  "    topic: alpha",
  "    videos:",
  `      - ${VIDEO}`,
  "    topics:",
  "      - id: zz3000-m1-t1",
  "        title: First lesson",
  "        concepts:",
  "          - base",
  "        subtopics: []",
  "      - id: zz3000-m1-t2",
  "        title: Second lesson",
  "        concepts:",
  "          - derived",
  "        subtopics:",
  "          - A subtopic",
  "        videos:",
  "          - video:a-studio-video",
  "      - id: zz3000-m1-t3",
  "        title: Third lesson",
  "        concepts:",
  "          - third",
  "        subtopics: []",
  "    resources:",
  "      - id: zz3000-m1-r1",
  "        title: A book for the week",
  "        url: https://example.com/book",
  "        type: book",
  "        lessons: [zz3000-m1-t1, zz3000-m1-t2]",
  "      - id: zz3000-m1-r2",
  "        title: A problem to solve",
  "        url: https://example.com/problem",
  "        type: practice",
  "        lessons: [zz3000-m1-t2]",
  "      - id: zz3000-m1-r3",
  "        title: Module material",
  "        url: https://example.com/module",
  "        type: docs",
  "  - id: zz3000-m2",
  "    slug: m2",
  "    title: Module two",
  "    order: 2",
  "    topic: beta",
  "    topics:",
  "      - id: zz3000-m2-t1",
  "        title: Only lesson",
  "        concepts:",
  "          - other",
  "        subtopics: []",
  "    resources: []",
  "capstone: Build something.",
  "",
].join("\n");

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

describe("a listed video's prefixes", () => {
  it("are the video tools' asset prefixes and a studio video's, the ones the catalog mints", () => {
    expect([...VIDEO_ASSET_PREFIXES].sort()).toEqual(
      [ASSET_PREFIX.manimkc, ASSET_PREFIX.remotionkc, ASSET_PREFIX.revideokc, VIDEO_PREFIX].sort(),
    );
  });
});

describe.skipIf(!reachable.ok)("readings on lessons and listed videos", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let edits: string;
  let restore: () => void;

  const courseFile = () => path.join(fixture.root, "content/courses/zz3000.yaml");
  const links = async () =>
    (
      await scratch.db
        .select({ item: curriculumItemAsset.curriculumItemId, asset: curriculumItemAsset.assetId, position: curriculumItemAsset.position })
        .from(curriculumItemAsset)
        .orderBy(curriculumItemAsset.assetId, curriculumItemAsset.position)
    ).map((l) => `${l.asset} ${l.item} ${l.position}`);
  const revisionsAfter = async (id: number) =>
    (
      await scratch.db
        .select({ type: contentRevision.entityType, id: contentRevision.entityId })
        .from(contentRevision)
        .where(gt(contentRevision.id, id))
    ).map((r) => `${r.type} ${r.id}`);
  const lastRevision = async () =>
    (await scratch.db.select({ n: sql<number>`coalesce(max(id), 0)::int` }).from(contentRevision))[0]?.n ?? 0;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([
        { slug: "alpha", courses: ["zz3000-m1"], concepts: ["base", "derived", "third"] },
        { slug: "beta", courses: ["zz3000-m2"], concepts: ["other"] },
      ]),
    );
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write("content/courses/zz3000.yaml", COURSE);
    for (const id of ["base", "derived", "third", "other"]) {
      await fixture.write(`learn/concepts/testing/${id}.md`, note({ id }));
    }
    edits = await mkdtemp(path.join(tmpdir(), "catalog-lesson-edits-"));
    restore = pointAt(scratch.name);
    // No manimkc checkout at all: the listed video is a reference, not a row.
    await runImportCommand({ dir: fixture.root });
    await runExport({ out: fixture.root, only: ["topics", "tags", "courses"] });
  }, 60_000);

  afterAll(async () => {
    restore?.();
    await scratch?.drop();
    await fixture?.cleanup();
    if (edits !== undefined) await rm(edits, { recursive: true, force: true });
  });

  it("imports a course naming a manimkc video into a catalog with no manimkc source", async () => {
    expect(await links()).toEqual([
      "link:zz3000-m1-r1 zz3000-m1-t1 1",
      "link:zz3000-m1-r1 zz3000-m1-t2 2",
      "link:zz3000-m1-r2 zz3000-m1-t2 1",
    ]);
    const [module] = await scratch.db.select().from(collection).where(eq(collection.id, "zz3000-m1"));
    expect(module?.metadata).toEqual({ videos: [VIDEO] });
    const [other] = await scratch.db.select().from(collection).where(eq(collection.id, "zz3000-m2"));
    expect(other?.metadata).toEqual({});
    const items = await scratch.db.select({ id: curriculumItem.id, videos: curriculumItem.videos }).from(curriculumItem);
    expect(Object.fromEntries(items.map((i) => [i.id, i.videos]))).toEqual({
      "zz3000-m1-t1": [],
      "zz3000-m1-t2": ["video:a-studio-video"],
      "zz3000-m1-t3": [],
      "zz3000-m2-t1": [],
    });
    expect(await scratch.db.select().from(asset).where(eq(asset.id, VIDEO))).toEqual([]);
    const [practice] = await scratch.db.select().from(asset).where(eq(asset.id, "link:zz3000-m1-r2"));
    expect(practice?.resourceType).toBe("practice");
  });

  it("has the doctor name each listed video that resolves to no video, and each module on a shared topic listing none, counting neither", async () => {
    const before = await doctor(scratch.db, "scratch");
    expect(before.danglingVideos).toEqual([
      { course: "zz3000", module: "zz3000-m1", item: null, id: VIDEO },
      { course: "zz3000", module: "zz3000-m1", item: "zz3000-m1-t2", id: "video:a-studio-video" },
    ]);
    expect(before.sharedTopicWithoutVideos).toEqual([]);
    // A third module on alpha: m1 lists videos, so only the new one is named.
    await scratch.db.insert(collection).values({ id: "zz3000-m3", kind: "module", slug: "m3", title: "Module three", parentId: "zz3000", position: 3 });
    await scratch.db.insert(collectionItem).values({ collectionId: "zz3000-m3", position: 0, topicSlug: "alpha" });
    try {
      const shared = await doctor(scratch.db, "scratch");
      expect(shared.sharedTopicWithoutVideos).toEqual([{ course: "zz3000", module: "zz3000-m3", topic: "alpha" }]);
      // The empty module is one module-has-item violator; the two reports add nothing.
      const beyondRules = (r: typeof before) => r.violations - r.rules.reduce((n, rule) => n + rule.violators, 0);
      expect(beyondRules(shared)).toBe(beyondRules(before));
      expect(before.danglingVideos.length).toBeGreaterThan(0);
      const text = formatDoctor(shared);
      expect(text).toContain(`zz3000     zz3000-m1 lists ${VIDEO}, which is no video in the catalog`);
      expect(text).toContain("zz3000     zz3000-m1-t2 (zz3000-m1) lists video:a-studio-video");
      expect(text).toContain("zz3000     zz3000-m3 on alpha");
    } finally {
      await scratch.db.delete(collectionItem).where(eq(collectionItem.collectionId, "zz3000-m3"));
      await scratch.db.delete(collection).where(eq(collection.id, "zz3000-m3"));
    }
  });

  it("keeps the links in each item's snapshot, and leaves both keys out of an item with neither", async () => {
    const reads = await readSnapshots(scratch.db, "curriculum_item", ["zz3000-m1-t2", "zz3000-m1-t3"]);
    const placed = reads.get("zz3000-m1-t2")?.snapshot;
    expect(placed?.entity["videos"]).toEqual(["video:a-studio-video"]);
    expect(placed?.links["curriculum_item_asset"]).toEqual([
      { asset_id: "link:zz3000-m1-r1", position: 2 },
      { asset_id: "link:zz3000-m1-r2", position: 1 },
    ]);
    // An item written before 0022 snapshots exactly as it did, so the first
    // import after the migration appends no revision for it.
    const bare = reads.get("zz3000-m1-t3")?.snapshot;
    expect(Object.keys(bare?.entity ?? {})).not.toContain("videos");
    expect(Object.keys(bare?.links ?? {})).not.toContain("curriculum_item_asset");
  });

  it("reads back from the rows as the file reader reads the file, key for key", async () => {
    const [fromRows] = await readCourses(scratch.db);
    expect(JSON.stringify(fromRows)).toBe(JSON.stringify(parseCourse(COURSE, "zz3000.yaml")));
  });

  it("exports the course back byte for byte, and importing that appends nothing", async () => {
    expect((await exportCourse(scratch.db, "zz3000")).yaml).toBe(COURSE);
    expect(await readFile(courseFile(), "utf8")).toBe(COURSE);
    const before = await lastRevision();
    const again = await runImportCommand({ dir: fixture.root });
    expect(again.sources.flatMap((s) => Object.keys(s.revisions))).toEqual([]);
    const imported = await importCourse(scratch.db, { file: courseFile(), reason: "unchanged" });
    expect(imported.revisions).toBe(0);
    expect(await lastRevision()).toBe(before);
  });

  it("writes a link-only change through course import as one revision, of the item it moves", async () => {
    const before = await lastRevision();
    const text = COURSE.replace("        lessons: [zz3000-m1-t2]\n", "        lessons: [zz3000-m1-t2, zz3000-m1-t3]\n");
    const file = path.join(edits, "add-lesson.yaml");
    await writeFile(file, text);
    const result = await importCourse(scratch.db, { file, reason: "the problem goes with lesson three too" });
    expect(result.changes.filter((c) => c.op !== null)).toEqual([
      { type: "curriculum_item", id: "zz3000-m1-t3", op: "update", revisionId: expect.any(Number) },
    ]);
    expect(await revisionsAfter(before)).toEqual(["curriculum_item zz3000-m1-t3"]);
    expect(await links()).toContain("link:zz3000-m1-r2 zz3000-m1-t3 2");
    // The tree the course came from is kept in step.
    expect(await readFile(courseFile(), "utf8")).toBe(text);
  });

  it("prunes, on a courses run, a lesson link the file dropped, with a revision of each item it left", async () => {
    const before = await lastRevision();
    const text = (await readFile(courseFile(), "utf8")).replace("        lessons: [zz3000-m1-t1, zz3000-m1-t2]\n", "");
    await writeFile(courseFile(), text);
    const result = await runImportCommand({ dir: fixture.root });
    const courses = result.sources.find((s) => s.source === "courses");
    expect(courses?.revisions).toEqual({ curriculum_item: 2 });
    expect((await revisionsAfter(before)).sort()).toEqual(["curriculum_item zz3000-m1-t1", "curriculum_item zz3000-m1-t2"]);
    expect((await links()).filter((l) => l.startsWith("link:zz3000-m1-r1 "))).toEqual([]);
    expect((await exportCourse(scratch.db, "zz3000")).yaml).toBe(text);
  });

  it("refuses a dry run whose lessons name another module's item or no item, naming each", async () => {
    const bad = COURSE.replace("        lessons: [zz3000-m1-t2]\n", "        lessons: [zz3000-m2-t1, zz3000-m1-t9]\n");
    const file = path.join(edits, "bad-lessons.yaml");
    await writeFile(file, bad);
    const before = await lastRevision();
    const refusal = importCourse(scratch.db, { file, reason: "bad", dryRun: true });
    await expect(refusal).rejects.toBeInstanceOf(CourseWriteError);
    await expect(importCourse(scratch.db, { file, reason: "bad", dryRun: true })).rejects.toThrow(
      /lessons names "zz3000-m2-t1", an item of module "zz3000-m2", not of module "zz3000-m1"[\s\S]*lessons names "zz3000-m1-t9", which is not an item of module "zz3000-m1"/,
    );
    await writeFile(file, COURSE.replace(`    videos:\n      - ${VIDEO}\n`, `    videos:\n      - video:a-studio-video\n`));
    await expect(importCourse(scratch.db, { file, reason: "bad", dryRun: true })).rejects.toThrow(
      /module "zz3000-m1" lists video "video:a-studio-video" twice: on the module and on item "zz3000-m1-t2"/,
    );
    expect(await lastRevision()).toBe(before);
  });

  it("drops an item's reading links when course import archives it", async () => {
    const text = (await readFile(courseFile(), "utf8"))
      .replace(/      - id: zz3000-m1-t3\n[\s\S]*?(?=    resources:)/, "")
      .replace("        lessons: [zz3000-m1-t2, zz3000-m1-t3]\n", "        lessons: [zz3000-m1-t2]\n");
    const file = path.join(edits, "drop-t3.yaml");
    await writeFile(file, text);
    const result = await importCourse(scratch.db, { file, reason: "drop lesson three" });
    expect(result.archived.items).toEqual(["zz3000-m1-t3"]);
    expect((await links()).filter((l) => l.includes("zz3000-m1-t3"))).toEqual([]);
    expect((await exportCourse(scratch.db, "zz3000")).yaml).toBe(text);
  });

  it("says, per course, how many of its readings are placed on a lesson", async () => {
    const status = await runStatus();
    // Lesson three was archived above, so three live items. r1 lost its
    // lessons above; r2 keeps lesson two; r3 never had any.
    expect(status.coverage.find((c) => c.course === "zz3000")).toEqual({
      course: "zz3000",
      items: 3,
      withConcepts: 3,
      readings: 3,
      readingsOnLessons: 1,
    });
  });

  it("guards the link table like every course table: listed under courses, refused raw when armed", async () => {
    expect(WRITE_GUARDS.courses).toContain("curriculum_item_asset");
    const guard = [["curriculum_item_asset", writeGuardName("curriculum_item_asset")]] as const;
    await setTriggers(scratch.db, guard, true);
    try {
      const raw = scratch.db
        .insert(curriculumItemAsset)
        .values({ curriculumItemId: "zz3000-m1-t1", assetId: "link:zz3000-m1-r3", position: 1 });
      await expect(raw).rejects.toSatisfy((e) => sqlstate(e) === "42501");
    } finally {
      await setTriggers(scratch.db, guard, false);
    }
    // Disarmed again, a raw write goes through, and is taken straight back.
    await scratch.db
      .insert(curriculumItemAsset)
      .values({ curriculumItemId: "zz3000-m1-t1", assetId: "link:zz3000-m1-r3", position: 1 });
    await scratch.db
      .delete(curriculumItemAsset)
      .where(and(eq(curriculumItemAsset.curriculumItemId, "zz3000-m1-t1"), eq(curriculumItemAsset.assetId, "link:zz3000-m1-r3")));
  });
});
