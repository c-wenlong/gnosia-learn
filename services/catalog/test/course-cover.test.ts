import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fsStore } from "@self-learn/blob";
import { blobObject, collection, contentRevision, COURSE_COVER_MAX_BYTES, learner } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditBlobs } from "../src/content/blob-audit";
import { openBlobStore } from "../src/content/blob";
import { setCourseCover } from "../src/content/course-cover";
import { CourseWriteError, exportCourse, importCourse, stampCourse } from "../src/content/courses";
import { renderType } from "../src/content/export";
import { parity } from "../src/content/parity";
import { readSnapshots } from "../src/content/snapshot";
import { runIndex } from "../src/index/run";
import { applyMigrations } from "../src/migrations";
import { createScratchDatabase, probe, type Scratch, SQLSTATE, sqlstate } from "./scratch-database";
import { SEED } from "./seed";
import { storedBlob } from "./stored-blob";

/**
 * Course covers (migration 0015): the cover photo is a blob, the course row
 * names its key in `cover_blob_key`, and its credit is `metadata.coverCredit`.
 *
 * Three things are pinned here. The schema's own rules (only a course has a
 * cover, a cover always has its credit, the key names a stored object). The
 * one writer, `catalog course cover`: set, the same again, replace, clear, and
 * every refusal storing nothing. And the round trip: the export writes the
 * image beside the course file and the import stores it back under the same
 * key, while `course import` carries a cover over and refuses a file that
 * would change it.
 *
 * Every database is a scratch one, and each has a blob store of its own under
 * the OS temp directory (a store belongs to the database that first wrote it,
 * `content/blob-owner.ts`). The seed is copied before anything writes near it.
 */

const reachable = await probe();

const COVER = path.join(SEED, "content", "courses", "cp4284.cover.webp");
const CREDIT = {
  photographer: "Brecht Corbeel (@brechtcorbeel)",
  source: "https://unsplash.com/photos/a-glowing-cpu-on-a-circuit-board-with-illuminated-traces-iyyP3vPPWpk",
  licence: "Unsplash License",
};
const REASON = "a test of course covers";
const NO_MANIMKC = path.join(tmpdir(), "catalog-test-no-manimkc");
const SOURCES = ["topics", "tags", "concepts", "courses"] as const;

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("a stand-in png body")]);

/** Point the blob store at a directory of this database's own, until the returned function puts it back. */
function ownStore(name: string): { root: string; restore: () => void } {
  const saved = process.env["SELF_LEARN_HOME"];
  const home = path.join(tmpdir(), `self-learn-home-${name}`);
  process.env["SELF_LEARN_HOME"] = home;
  return {
    root: path.join(home, "blobs"),
    restore: () => {
      if (saved === undefined) delete process.env["SELF_LEARN_HOME"];
      else process.env["SELF_LEARN_HOME"] = saved;
      void rm(home, { recursive: true, force: true });
    },
  };
}

/** The seed with the cp4284 cover taken out, so the command is what sets it. */
async function seedWithoutCover(): Promise<string> {
  const tree = await mkdtemp(path.join(tmpdir(), "course-cover-tree-"));
  await cp(SEED, tree, { recursive: true });
  const yaml = path.join(tree, "content", "courses", "cp4284.yaml");
  const text = await readFile(yaml, "utf8");
  await writeFile(yaml, text.replace(/^cover:\n(?: {2}.*\n)+/m, ""), "utf8");
  await rm(path.join(tree, "content", "courses", "cp4284.cover.webp"));
  return tree;
}

describe.skipIf(!reachable.ok)("catalog course cover", () => {
  let scratch: Scratch;
  let tree: string;
  let files: string;
  let store: ReturnType<typeof ownStore>;
  const webp = async () => readFile(COVER);

  const revisions = async () =>
    (await scratch.db.execute<{ n: number }>(sql`select count(*)::int as n from content_revision`)).rows[0]?.n ?? 0;
  const blobs = async () => (await scratch.db.select({ key: blobObject.key }).from(blobObject)).map((r) => r.key).sort();
  const course = async (id = "cp4284") => {
    const [row] = await scratch.db.select().from(collection).where(eq(collection.id, id));
    return row;
  };
  const cover = (file: string, extra: Partial<typeof CREDIT> = {}) => ({ file, ...CREDIT, ...extra });

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    store = ownStore(scratch.name);
    await applyMigrations(scratch.db);
    tree = await seedWithoutCover();
    files = await mkdtemp(path.join(tmpdir(), "course-cover-files-"));
    await runIndex(scratch.db, { repoRoot: tree, only: [...SOURCES], manimkcRoot: NO_MANIMKC });
  }, 120_000);

  afterAll(async () => {
    await scratch?.drop();
    store?.restore();
    if (tree !== undefined) await rm(tree, { recursive: true, force: true });
    if (files !== undefined) await rm(files, { recursive: true, force: true });
  });

  describe("the schema", () => {
    const refused = async (statement: ReturnType<typeof sql>, code: string, constraint: string) => {
      let error: unknown;
      try {
        await scratch.db.execute(statement);
      } catch (caught) {
        error = caught;
      }
      expect(sqlstate(error)).toBe(code);
      expect(String((error as { cause?: { constraint?: unknown } })?.cause?.constraint)).toBe(constraint);
    };
    const credit = sql`jsonb_build_object('coverCredit', jsonb_build_object('photographer', 'p', 'source', 'https://x.test', 'licence', 'l'))`;

    it("lets only a course carry a cover", async () => {
      const key = await storedBlob(scratch.db, "a module's photo", "webp");
      await refused(
        sql`update collection set cover_blob_key = ${key}, metadata = metadata || ${credit} where id = 'cp4284-m1'`,
        SQLSTATE.checkViolation,
        "collection_cover_course_check",
      );
    });

    it("holds a cover and its credit together", async () => {
      const key = await storedBlob(scratch.db, "a photo with no credit", "webp");
      await refused(sql`update collection set cover_blob_key = ${key} where id = 'cp4284'`, SQLSTATE.checkViolation, "collection_cover_credit_check");
      await refused(
        sql`update collection set metadata = metadata || ${credit} where id = 'cp4284'`,
        SQLSTATE.checkViolation,
        "collection_cover_credit_check",
      );
    });

    it("names only a stored object, and keeps that object while it does", async () => {
      await refused(
        sql`update collection set cover_blob_key = ${`local/${"0".repeat(64)}.webp`}, metadata = metadata || ${credit} where id = 'cp4284'`,
        SQLSTATE.foreignKeyViolation,
        "collection_cover_blob_key_blob_object_key_fk",
      );
      const key = await storedBlob(scratch.db, "a photo held on to", "webp");
      await scratch.db.execute(sql`update collection set cover_blob_key = ${key}, metadata = metadata || ${credit} where id = 'cp4284'`);
      await refused(sql`delete from blob_object where key = ${key}`, SQLSTATE.foreignKeyViolation, "collection_cover_blob_key_blob_object_key_fk");
      await scratch.db.execute(
        sql`update collection set cover_blob_key = null, metadata = metadata - 'coverCredit' where id = 'cp4284'`,
      );
    });

    it("snapshots a course without a cover as it did before 0015", async () => {
      const read = await readSnapshots(scratch.db, "collection", ["cp4284", "cp4284-m1"]);
      for (const id of ["cp4284", "cp4284-m1"]) {
        expect(Object.keys(read.get(id)?.snapshot.entity ?? {}), id).not.toContain("cover_blob_key");
      }
      // And the rows the import wrote hash as their revisions do: nothing to write.
      const latest = await scratch.db.execute<{ hash: string }>(
        sql`select snapshot_hash as hash from content_revision where entity_type = 'collection' and entity_id = 'cp4284' order by seq desc limit 1`,
      );
      expect(read.get("cp4284")?.hash).toBe(latest.rows[0]?.hash);
    });
  });

  it("sets a cover: the image in the store first, then one revision naming its key and credit", async () => {
    const before = await revisions();
    const bytes = await webp();
    const result = await setCourseCover(scratch.db, { course: "cp4284", set: cover(COVER), reason: REASON });
    const key = `local/${sha256(bytes)}.webp`;
    expect(result).toMatchObject({ action: "set", changed: true, uploaded: true, op: "update", previous: null });
    expect(result.cover).toMatchObject({ key, bytes: bytes.length, mime: "image/webp", credit: CREDIT });
    expect(await revisions()).toBe(before + 1);

    const row = await course();
    expect(row?.coverBlobKey).toBe(key);
    expect((row?.metadata as { coverCredit?: unknown }).coverCredit).toEqual(CREDIT);
    const [blob] = await scratch.db.select().from(blobObject).where(eq(blobObject.key, key));
    expect(blob).toMatchObject({ state: "present", mime: "image/webp", bytes: bytes.length, ownerId: "local" });
    expect((await fsStore(store.root).stat(key))?.bytes).toBe(bytes.length);

    // Courses are still on files here, so the tree they came from is kept in
    // step (D17): it now reads exactly as the seed does, cover and all.
    expect(result.writeThrough.written.map((w) => w.path).sort()).toEqual([
      "content/courses/cp4284.cover.webp",
      "content/courses/cp4284.yaml",
    ]);
    expect(await readFile(path.join(tree, "content/courses/cp4284.yaml"), "utf8")).toBe(
      await readFile(path.join(SEED, "content/courses/cp4284.yaml"), "utf8"),
    );
    expect((await readFile(path.join(tree, "content/courses/cp4284.cover.webp"))).equals(bytes)).toBe(true);
  });

  it("changes nothing when set to the same image and credit again", async () => {
    const before = await revisions();
    const result = await setCourseCover(scratch.db, { course: "cp4284", set: cover(COVER), reason: "again" });
    expect(result).toMatchObject({ changed: false, uploaded: false, op: null });
    expect(result.previous?.key).toBe(result.cover?.key);
    expect(await revisions()).toBe(before);
    // A dry run says the same, and stores nothing new.
    const dry = await setCourseCover(scratch.db, { course: "cp4284", set: cover(COVER), reason: "again", dryRun: true });
    expect(dry).toMatchObject({ dryRun: true, changed: false, revisionId: null });
  });

  it("carries the cover through course export and import, and refuses a file that drops, edits or swaps it", async () => {
    const exported = await exportCourse(scratch.db, "cp4284");
    expect(exported.yaml).toContain(`cover:\n  file: cp4284.cover.webp\n  photographer: ${CREDIT.photographer}\n`);
    const file = path.join(files, "cp4284.yaml");
    const write = (text: string) => writeFile(file, stampCourse(text, exported.base), "utf8");
    const before = await revisions();

    await write(exported.yaml);
    expect((await importCourse(scratch.db, { file, reason: REASON })).revisions).toBe(0);
    expect((await course())?.coverBlobKey).toBe(`local/${sha256(await webp())}.webp`);

    await write(exported.yaml.replace(/^cover:\n(?: {2}.*\n)+/m, ""));
    await expect(importCourse(scratch.db, { file, reason: REASON })).rejects.toThrow(/has no cover:.*does not remove a cover/);

    await write(exported.yaml.replace(CREDIT.photographer, "Someone Else"));
    await expect(importCourse(scratch.db, { file, reason: REASON })).rejects.toThrow(/photographer is "Brecht Corbeel/);

    // The image beside the file, under the name it gives: the stored bytes pass, others do not.
    await write(exported.yaml);
    await writeFile(path.join(files, "cp4284.cover.webp"), await webp());
    expect((await importCourse(scratch.db, { file, reason: REASON })).revisions).toBe(0);
    await writeFile(path.join(files, "cp4284.cover.webp"), Buffer.concat([await webp(), Buffer.from("x")]));
    await expect(importCourse(scratch.db, { file, reason: REASON })).rejects.toThrow(/is not the stored image/);
    await rm(path.join(files, "cp4284.cover.webp"));

    expect(await revisions()).toBe(before);
    expect((await course())?.coverBlobKey).toBe(`local/${sha256(await webp())}.webp`);
  });

  it("replaces it with a PNG: a new key, the export's image changes type, and the old bytes stay stored", async () => {
    const old = (await course())?.coverBlobKey as string;
    const png = path.join(files, "new.png");
    await writeFile(png, PNG);
    const result = await setCourseCover(scratch.db, { course: "cp4284", set: cover(png), reason: REASON });
    const key = `local/${sha256(PNG)}.png`;
    expect(result).toMatchObject({ changed: true, uploaded: true, previous: { key: old } });
    expect((await course())?.coverBlobKey).toBe(key);
    expect(result.writeThrough.written.map((w) => w.path).sort()).toEqual([
      "content/courses/cp4284.cover.png",
      "content/courses/cp4284.yaml",
    ]);
    expect(result.writeThrough.removed.map((w) => w.path)).toEqual(["content/courses/cp4284.cover.webp"]);
    expect(await readFile(path.join(tree, "content/courses/cp4284.yaml"), "utf8")).toContain("file: cp4284.cover.png");

    // The audit counts the cover as referenced, and the replaced one as bytes nothing points at.
    const audit = await auditBlobs(scratch.db, openBlobStore());
    const kinds = new Map(audit.findings.map((f) => [f.key, f.kind]));
    expect(kinds.get(key)).toBeUndefined();
    expect(kinds.get(old)).toBe("unreferenced");
  });

  it("clears it: neither key nor credit on the row, no cover file, and the blob stays for the old revision", async () => {
    const before = await blobs();
    const result = await setCourseCover(scratch.db, { course: "cp4284", clear: true, reason: REASON });
    expect(result).toMatchObject({ action: "clear", changed: true, cover: null, op: "update" });
    const row = await course();
    expect(row?.coverBlobKey).toBeNull();
    expect(Object.keys(row?.metadata as object)).not.toContain("coverCredit");
    expect(await blobs()).toEqual(before);
    expect(result.writeThrough.removed.map((w) => w.path)).toEqual(["content/courses/cp4284.cover.png"]);
    await expect(stat(path.join(tree, "content/courses/cp4284.cover.png"))).rejects.toThrow();

    const again = await setCourseCover(scratch.db, { course: "cp4284", clear: true, reason: REASON });
    expect(again).toMatchObject({ changed: false, op: null });
  });

  it("refuses, before storing anything, a file that is no cover image and a course it cannot write", async () => {
    await scratch.db.insert(learner).values({ id: "other" }).onConflictDoNothing();
    await scratch.db.insert(collection).values({
      id: "zz0001",
      kind: "course",
      slug: "zz0001",
      title: "Someone else's course",
      position: 90,
      metadata: { code: "ZZ0001" },
      ownerId: "other",
    });
    await scratch.db.update(collection).set({ archivedAt: new Date() }).where(eq(collection.id, "zz0001"));
    await scratch.db.insert(collection).values({
      id: "zz0002",
      kind: "course",
      slug: "zz0002",
      title: "Someone else's live course",
      position: 91,
      metadata: { code: "ZZ0002" },
      ownerId: "other",
    });
    const write = async (name: string, bytes: Buffer | string) => {
      const file = path.join(files, name);
      await writeFile(file, bytes);
      return file;
    };
    const stored = await blobs();
    const objects = async () => {
      const out: string[] = [];
      for await (const object of fsStore(store.root).list("")) out.push(object.key);
      return out.sort();
    };
    const listed = await objects();
    const revs = await revisions();
    const refuse = async (options: Parameters<typeof setCourseCover>[1], pattern: RegExp) => {
      const error = await setCourseCover(scratch.db, options).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error, String(pattern)).toBeInstanceOf(CourseWriteError);
      expect((error as Error).message).toMatch(pattern);
    };

    const png = await write("fine.png", PNG);
    await refuse({ course: "cp4284", set: cover(await write("words.webp", "hello, not a picture")), reason: REASON }, /not a WebP, JPEG or PNG/);
    await refuse({ course: "cp4284", set: cover(await write("drawing.svg", "<svg xmlns='http://www.w3.org/2000/svg'/>")), reason: REASON }, /not a WebP, JPEG or PNG/);
    await refuse({ course: "cp4284", set: cover(await write("empty.png", "")), reason: REASON }, /empty/);
    await refuse(
      { course: "cp4284", set: cover(await write("huge.png", Buffer.concat([PNG, Buffer.alloc(COURSE_COVER_MAX_BYTES)]))), reason: REASON },
      /over the \d+-byte cap/,
    );
    await refuse({ course: "cp4284", set: cover(path.join(files, "missing.webp")), reason: REASON }, /no such file/);
    await refuse({ course: "cp4284", set: cover(png, { source: "unsplash.com/photo" }), reason: REASON }, /must be an http\(s\) URL/);
    await refuse({ course: "cp4284", set: cover(png, { photographer: " " }), reason: REASON }, /needs --photographer/);
    await refuse({ course: "cp4284", set: cover(png), reason: " " }, /needs a --reason/);
    await refuse({ course: "zz9999", set: cover(png), reason: REASON }, /no course "zz9999"/);
    await refuse({ course: "cp4284-m1", set: cover(png), reason: REASON }, /is a module, not a course/);
    await refuse({ course: "zz0001", set: cover(png), reason: REASON, owner: "other" }, /is archived/);
    await refuse({ course: "zz0002", set: cover(png), reason: REASON }, /belongs to other, and this command is for local/);
    await refuse({ course: "zz0002", clear: true, reason: REASON }, /belongs to other/);
    await refuse({ course: "cp4284", set: cover(png), reason: REASON, owner: "other" }, /belongs to local, and this command is for other/);

    expect(await blobs()).toEqual(stored);
    expect(await objects()).toEqual(listed);
    expect(await revisions()).toBe(revs);
    const revisionsOfOthers = await scratch.db
      .select({ id: contentRevision.id })
      .from(contentRevision)
      .where(eq(contentRevision.entityId, "zz0002"));
    expect(revisionsOfOthers).toEqual([]);
  });
});

describe.skipIf(!reachable.ok)("course covers through export and import", () => {
  let first: Scratch;
  let second: Scratch;
  let out: string;
  let bad: string;
  let restore: () => void = () => {};
  const key = async () => `local/${sha256(await readFile(COVER))}.webp`;
  const coverOf = async (db: Scratch) =>
    (await db.db.select({ key: collection.coverBlobKey, metadata: collection.metadata }).from(collection).where(eq(collection.id, "cp4284")))[0];

  beforeAll(async () => {
    first = await createScratchDatabase();
    second = await createScratchDatabase();
    await applyMigrations(first.db);
    await applyMigrations(second.db);
    out = await mkdtemp(path.join(tmpdir(), "course-cover-export-"));
    bad = await mkdtemp(path.join(tmpdir(), "course-cover-bad-"));
  }, 120_000);

  afterAll(async () => {
    restore();
    await first?.drop();
    await second?.drop();
    for (const dir of [out, bad]) if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  });

  it("imports the seed's cover as a blob, exports it back byte for byte, and imports that under the same key", async () => {
    const one = ownStore(first.name);
    restore = one.restore;
    await runIndex(first.db, { repoRoot: SEED, only: [...SOURCES], manimkcRoot: NO_MANIMKC });
    expect(await coverOf(first)).toEqual({ key: await key(), metadata: expect.objectContaining({ coverCredit: CREDIT }) });
    expect((await fsStore(one.root).stat(await key()))?.bytes).toBe((await readFile(COVER)).length);

    const rendered = await renderType(first.db, "courses");
    expect(rendered.map((f) => f.path)).toEqual(["content/courses/cp4284.cover.webp", "content/courses/cp4284.yaml"]);
    // The courses as the database exports them, beside the seed's own
    // vocabulary and notes, which the import checks the courses against.
    await mkdir(path.join(out, "content/courses"), { recursive: true });
    for (const file of rendered) {
      expect(file.bytes.equals(await readFile(path.join(SEED, file.path))), file.path).toBe(true);
      await writeFile(path.join(out, file.path), file.bytes);
    }
    for (const other of ["content/topics.yaml", "content/tags.yaml", "learn/concepts"]) {
      await cp(path.join(SEED, other), path.join(out, other), { recursive: true });
    }
    expect((await parity(first.db, SEED, ["courses"])).clean).toBe(true);
    one.restore();

    const two = ownStore(second.name);
    restore = two.restore;
    await runIndex(second.db, { repoRoot: out, only: [...SOURCES], manimkcRoot: NO_MANIMKC });
    expect(await coverOf(second)).toEqual(await coverOf(first));
    expect((await fsStore(two.root).stat(await key()))?.bytes).toBe((await readFile(COVER)).length);
    expect((await parity(second.db, out, ["courses"])).clean).toBe(true);
  });

  it("refuses a tree whose cover is missing, is not an image, or is not the type its name says, writing nothing", async () => {
    await cp(out, bad, { recursive: true });
    const image = path.join(bad, "content/courses/cp4284.cover.webp");
    const before = await second.db.execute(sql`select count(*)::int as n from content_revision`);
    const refused = async (pattern: RegExp) => {
      await expect(runIndex(second.db, { repoRoot: bad, only: [...SOURCES], manimkcRoot: NO_MANIMKC })).rejects.toThrow(pattern);
    };

    await rm(image);
    await refused(/cp4284\.yaml: its cover cannot be stored: content\/courses\/cp4284\.cover\.webp: no such file/);
    await writeFile(image, "a text file where a photo should be");
    await refused(/not a WebP, JPEG or PNG/);
    await writeFile(image, PNG);
    await refused(/holds a PNG image; name it cp4284\.cover\.png/);

    expect((await second.db.execute(sql`select count(*)::int as n from content_revision`)).rows).toEqual(before.rows);
    expect((await coverOf(second))?.key).toBe(await key());
  });
});
