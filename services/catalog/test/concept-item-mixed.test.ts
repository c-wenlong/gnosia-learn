import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { concept } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { renderType } from "../src/content/export";
import { flip } from "../src/content/flip";
import { exportHash, readTypeFiles } from "../src/content/layout";
import { recordExport } from "../src/content/ownership";
import { conceptsIndexer } from "../src/index/concepts";
import { coursesIndexer } from "../src/index/courses";
import { runIndex } from "../src/index/run";
import { sessionsIndexer } from "../src/index/sessions";
import { tagsIndexer } from "../src/index/tags";
import { topicsIndexer } from "../src/index/topics";
import { writeSource } from "../src/index/writer";
import { applyMigrations } from "../src/migrations";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * `learn concept add --item` with the two types it touches owned by different
 * sides (S1 of the phase 1 review, docs/CONTENT-MIGRATION.md).
 *
 * The listing used to pick its path by the owner of `concepts`. With courses
 * on rows and concepts on files that took the files path: the note was
 * written, the course YAML was text-edited, no `concept_curriculum_item` row
 * was written, and every later `catalog index` refused the course file as a
 * hand-edited export. The listing now goes through `course import` whenever
 * either side is rows, and both mixed states are held here to the same end
 * state: the link is a row, the course file is the database's export, and the
 * next index goes through.
 */

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(HERE, "..", "src", "learn", "cli.ts");
const reachable = await probe();

const COURSE = [
  "id: xx1000", "slug: xx1000", "code: XX1000", "title: A test course", "credits: 4", "order: 1",
  "inferred: false", "tags: [testing]", "modules:", "  - id: xx1000-m1", "    slug: m1",
  "    title: Module one", "    order: 1", "    topic: alpha", "    topics:", "      - id: xx1000-m1-t1",
  "        title: First item", "        subtopics: []", "    resources: []", "capstone: Build something", "",
].join("\n");

interface Mixed {
  scratch: Scratch;
  fixture: Fixture;
  learn: (...args: string[]) => Promise<{ stdout: string; stderr: string }>;
}

/** A fixture imported source by source, then `owned` flipped with its export recorded, as on flip day. */
async function mixed(owned: "courses" | "concepts"): Promise<Mixed> {
  const scratch = await createScratchDatabase();
  await applyMigrations(scratch.db);
  const fixture = await makeFixture();
  await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["alpha"], courses: ["xx1000-m1"] }]));
  await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
  await fixture.write("content/courses/xx1000.yaml", COURSE);
  await fixture.write("learn/concepts/fixtures/alpha.md", note({ id: "alpha", title: "Alpha", summary: "The first one." }));
  const context = await fixture.context({ knownConcepts: async () => new Set(["alpha"]) });
  for (const indexer of [topicsIndexer, tagsIndexer, conceptsIndexer, coursesIndexer, sessionsIndexer]) {
    const { rows, logs } = await indexer.read(context);
    await writeSource(scratch.db, indexer, rows, [], indexer.root(context), { logs, metadata: { root: fixture.root } });
  }
  // The vocabulary as the rows write it, since `--topic` writes it through.
  for (const file of await renderType(scratch.db, "topics")) {
    await writeFile(path.join(fixture.root, file.path), file.bytes);
  }
  const types = owned === "concepts" ? (["concepts", "sessions"] as const) : (["courses"] as const);
  for (const type of types) {
    await flip(scratch.db, { type, readers: new Set(types) });
    await recordExport(scratch.db, type, exportHash(await readTypeFiles(fixture.root, type)));
  }
  const learn = (...args: string[]) =>
    execFileAsync(process.execPath, ["--import", "tsx", ENTRY, ...args], {
      env: { ...process.env, LEARN_ROOT: fixture.root, DATABASE_URL: scratch.url },
    });
  return { scratch, fixture, learn };
}

async function linked(scratch: Scratch): Promise<string[]> {
  const { rows } = await scratch.db.execute<{ concept_slug: string }>(
    sql`select concept_slug from concept_curriculum_item where curriculum_item_id = 'xx1000-m1-t1' order by concept_slug`,
  );
  return rows.map((r) => r.concept_slug);
}

async function courseFileIsExport(m: Mixed): Promise<void> {
  const [exported] = (await renderType(m.scratch.db, "courses")).filter((f) => f.path === "content/courses/xx1000.yaml");
  expect(await readFile(path.join(m.fixture.root, "content/courses/xx1000.yaml"), "utf8")).toBe(
    exported?.bytes.toString("utf8"),
  );
}

describe.skipIf(!reachable.ok)("concept add --item with courses on rows and concepts on files", () => {
  let m: Mixed;

  beforeAll(async () => {
    m = await mixed("courses");
  }, 60_000);

  afterAll(async () => {
    await m?.scratch.drop();
    await m?.fixture.cleanup();
  });

  it("links the note through course import, writes the note file, and leaves an index that goes through", async () => {
    const { stdout } = await m.learn(
      "concept", "add", "--title", "Beta", "--domain", "fixtures", "--item", "xx1000-m1-t1", "--json",
    );
    expect(JSON.parse(stdout)).toMatchObject({ id: "beta", topic: "alpha", item: "xx1000-m1-t1", indexed: true });
    // Concepts are on files, so the note is a file.
    expect(await readFile(path.join(m.fixture.root, "learn/concepts/fixtures/beta.md"), "utf8")).toContain("id: beta");
    const [row] = await m.scratch.db.select().from(concept).where(eq(concept.slug, "beta"));
    expect(row?.topicSlug).toBe("alpha");
    // The link is a row, and the course file is the rows' export, listing included.
    expect(await linked(m.scratch)).toEqual(["beta"]);
    expect(await readFile(path.join(m.fixture.root, "content/courses/xx1000.yaml"), "utf8")).toMatch(/concepts:\n\s+- beta\n/);
    await courseFileIsExport(m);
    // Before the fix this refused content/courses/xx1000.yaml as an edited export.
    const run = await runIndex(m.scratch.db, { repoRoot: m.fixture.root, only: ["concepts", "courses"] });
    expect(run.skipped.map((s) => s.source)).toContain("courses");
    expect(await linked(m.scratch)).toEqual(["beta"]);
  });
});

describe.skipIf(!reachable.ok)("concept add --item with concepts on rows and courses on files", () => {
  let m: Mixed;

  beforeAll(async () => {
    m = await mixed("concepts");
  }, 60_000);

  afterAll(async () => {
    await m?.scratch.drop();
    await m?.fixture.cleanup();
  });

  it("links the note through course import, writes no note file, and leaves an index that changes nothing", async () => {
    const { stdout } = await m.learn(
      "concept", "add", "--title", "Gamma", "--domain", "fixtures", "--item", "xx1000-m1-t1", "--json",
    );
    expect(JSON.parse(stdout)).toMatchObject({ id: "gamma", topic: "alpha", item: "xx1000-m1-t1", indexed: true });
    await expect(readFile(path.join(m.fixture.root, "learn/concepts/fixtures/gamma.md"), "utf8")).rejects.toThrow();
    expect(await linked(m.scratch)).toEqual(["gamma"]);
    await courseFileIsExport(m);
    // Courses are read from the file, which already says what the rows say.
    const run = await runIndex(m.scratch.db, { repoRoot: m.fixture.root, only: ["courses"] });
    const courses = run.sources.find((s) => s.source === "courses");
    expect(courses?.revisions ?? {}).toEqual({});
    expect(await linked(m.scratch)).toEqual(["gamma"]);
  });

  // Not `--item`, but the same review's output fix, and this database owns
  // sessions: `path` keeps its key and is null, since no file was written.
  it("names no log file from session start or session log once the database owns sessions", async () => {
    const started = JSON.parse((await m.learn("session", "start", "--id", "s-rows", "--topic", "Rows", "--json")).stdout);
    expect(started).toEqual({ id: "s-rows", path: null });
    const logged = JSON.parse((await m.learn("session", "log", "--id", "s-rows", "--text", "An entry.", "--json")).stdout);
    expect(logged).toEqual({ path: null });
    await expect(readFile(path.join(m.fixture.root, "learn/sessions/s-rows.md"), "utf8")).rejects.toThrow();
  });
});
