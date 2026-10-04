import { execFile } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { conceptCurriculumItem, contentSource, sessionLogEntry, topic } from "@self-learn/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runImportCommand } from "../src/commands/index-command";
import { flip } from "../src/content/flip";
import { addTopic } from "../src/content/topics";
import { REPO_ROOT, SERVICE_ROOT } from "../src/env";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { SEED } from "./seed";

/**
 * The repository after phase 3's cut-over: no `content/`, no `learn/`, and a
 * database that owns every type. What a fresh clone with only `seed/` does,
 * and what the owner's checkout does after the cut-over PR merges.
 *
 * The `learn` CLI runs with no `LEARN_ROOT`, as it does outside the tests, so
 * any path that still treated the repository as its knowledge base (a folder
 * made on every command, a note read from disk, a course file edited in the
 * tree) would show up as `content/` or `learn/` reappearing, which
 * `vitest.setup.ts` also refuses. A write writes rows and no file: the tree
 * the types were imported from, a copy of the seed, is not touched either.
 */

const reachable = await probe();
const execFileAsync = promisify(execFile);
const LEARN = path.join(SERVICE_ROOT, "src", "learn", "cli.ts");
const FLIP_ORDER = ["topics", "tags", "concepts", "sessions", "courses", "diagrams"] as const;

describe.skipIf(!reachable.ok)("after the cut-over", () => {
  let scratch: Scratch;
  let tree: string;
  let noManimkc: string;
  const saved: Record<string, string | undefined> = {};

  function learn(...args: string[]) {
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: scratch.url, MANIMKC_ROOT: noManimkc };
    delete env["LEARN_ROOT"];
    return execFileAsync(process.execPath, ["--import", "tsx", LEARN, ...args], { env, cwd: REPO_ROOT });
  }

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    // A copy of the seed, so the import root recorded is a tree this suite owns.
    tree = await mkdtemp(path.join(tmpdir(), "catalog-after-cutover-"));
    await cp(path.join(SEED, "content"), path.join(tree, "content"), { recursive: true });
    await cp(path.join(SEED, "learn"), path.join(tree, "learn"), { recursive: true });
    noManimkc = await mkdtemp(path.join(tmpdir(), "catalog-after-cutover-no-manimkc-"));
    for (const key of ["DATABASE_URL", "MANIMKC_ROOT"]) saved[key] = process.env[key];
    process.env["DATABASE_URL"] = scratch.url;
    process.env["MANIMKC_ROOT"] = noManimkc;
    await runImportCommand({ dir: tree });
    for (const type of FLIP_ORDER) await flip(scratch.db, { type });
    // The tree the flips were checked against goes, as content/ and learn/ go
    // from the repository: nothing may need it from here on.
    await rm(tree, { recursive: true, force: true });
  }, 120_000);

  afterAll(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await scratch?.drop();
    for (const dir of [tree, noManimkc]) if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  });

  it("owns every type", async () => {
    const rows = await scratch.db.select().from(contentSource);
    expect(rows.filter((r) => r.source === "db").map((r) => r.type).sort()).toEqual([...FLIP_ORDER].sort());
  });

  it("runs a learn session from rows, with no knowledge base on disk", async () => {
    const status = JSON.parse((await learn("status", "--json")).stdout) as { stats: { total: number } };
    expect(status.stats.total).toBe(11);
    const init = await learn("init");
    expect(init.stdout).toContain("rows in the catalog");

    const started = JSON.parse((await learn("session", "start", "--id", "2026-09-28-cutover", "--topic", "cut-over", "--json")).stdout);
    expect(started).toEqual({ id: "2026-09-28-cutover", path: null });
    await learn("session", "log", "--id", "2026-09-28-cutover", "--text", "Probe: what is a dot product?");
    const entries = await scratch.db.select().from(sessionLogEntry).where(eq(sessionLogEntry.sessionId, "2026-09-28-cutover"));
    expect(entries.map((e) => e.markdown).join("\n")).toContain("what is a dot product?");

    const shown = JSON.parse((await learn("concept", "show", "dot-product", "--json")).stdout) as { body: string };
    expect(shown.body).toContain("#");

    expect(existsSync(path.join(REPO_ROOT, "learn"))).toBe(false);
    expect(existsSync(path.join(REPO_ROOT, "content"))).toBe(false);
  }, 60_000);

  it("adds a note and lists it on a course row through the course writer, writing no file", async () => {
    const added = JSON.parse(
      (await learn("concept", "add", "--title", "Layer norm", "--domain", "transformers", "--item", "cp4284-m1-t2", "--json")).stdout,
    );
    expect(added).toMatchObject({
      id: "layer-norm",
      topic: "transformer-architecture-and-training",
      item: "cp4284-m1-t2",
      indexed: true,
    });
    const links = await scratch.db
      .select({ concept: conceptCurriculumItem.conceptSlug })
      .from(conceptCurriculumItem)
      .where(eq(conceptCurriculumItem.curriculumItemId, "cp4284-m1-t2"));
    expect(links.map((l) => l.concept)).toEqual(["layer-norm"]);
    expect(existsSync(tree)).toBe(false);
    expect(existsSync(path.join(REPO_ROOT, "content"))).toBe(false);
  }, 60_000);

  it("writes a topic as a row, with nothing to keep in step", async () => {
    const added = await addTopic(
      scratch.db,
      { slug: "layer-normalisation", title: "Layer normalisation", domain: "transformers" },
      { author: "local", authorKind: "person", reason: "after the cut-over" },
    );
    expect(added.exported).toEqual([]);
    expect(await scratch.db.select({ slug: topic.slug }).from(topic).where(eq(topic.slug, "layer-normalisation"))).toHaveLength(1);
    expect(existsSync(tree)).toBe(false);
  });

  it("imports the repository as nothing to read for the six types, and says so", async () => {
    // What `catalog import` with no directory runs: the repository.
    const result = await runImportCommand({ dir: REPO_ROOT });
    const skipped = new Map(result.skipped.map((s) => [s.source, s.reason]));
    for (const type of FLIP_ORDER) expect(skipped.get(type), type).toMatch(/holds no .* to read/);
    expect(result.totals.deleted).toBe(0);
  });

  it("still refuses a tree missing a type's files while some type is on files", async () => {
    // Before every type is flipped, trees are kept in step with the rows
    // (D17), so an export with a type's files gone is one cut short, and
    // refused by name as it always was.
    await scratch.db.update(contentSource).set({ source: "files" }).where(eq(contentSource.type, "sessions"));
    try {
      await expect(runImportCommand({ dir: REPO_ROOT, only: ["tags"] })).rejects.toThrow(/content\/tags\.yaml \(deleted\)/);
    } finally {
      await scratch.db.update(contentSource).set({ source: "db" }).where(eq(contentSource.type, "sessions"));
    }
  });

  it("refuses a learn read on a type the database does not own, rather than reading an empty folder", async () => {
    await scratch.db.update(contentSource).set({ source: "files" }).where(eq(contentSource.type, "concepts"));
    try {
      const refused = await learn("concept", "list", "--json").then(
        () => "",
        (error: { stderr: string }) => error.stderr,
      );
      expect(refused).toMatch(/does not own concepts .* no files for them since the cut-over/);
      expect(existsSync(path.join(REPO_ROOT, "learn"))).toBe(false);
    } finally {
      await scratch.db.update(contentSource).set({ source: "db" }).where(eq(contentSource.type, "concepts"));
    }
  }, 30_000);
});
