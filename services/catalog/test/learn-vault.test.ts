import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import fsPromises from "node:fs/promises";

import { concept, contentRevision, session, sessionLogEntry } from "@gnosia/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { openBlobStore } from "../src/content/blob";
import { putDiagram } from "../src/content/diagrams";
import { flip } from "../src/content/flip";
import { commitNoteText } from "../src/content/note-rows";
import { databaseIdentity } from "../src/content/import-root";
import { conceptsIndexer } from "../src/index/concepts";
import { diagramsIndexer } from "../src/index/diagrams";
import { sessionsIndexer } from "../src/index/sessions";
import { tagsIndexer } from "../src/index/tags";
import { topicsIndexer } from "../src/index/topics";
import { writeSource } from "../src/index/writer";
import { pullVault, pushVault } from "../src/learn/vault";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";

import { inTransaction, setRevisionId } from "../src/db";
/**
 * `learn vault pull|push` (phase 2 of docs/CONTENT-MIGRATION.md, edge case
 * 4): a fixture imported into a scratch database with concepts and sessions
 * flipped for real, and every vault in its own temp folder. The cases are the
 * plan's done-when for the vault, plus the ones that decide whether an edit
 * nobody pushed can be lost.
 */

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(HERE, "..", "src", "learn", "cli.ts");
const reachable = await probe();

const LOG =
  "---\ntitle: Old\ndate: 2026-01-01T00:00:00.000Z\ngoal: alpha\ntype: learning-session\n---\n\n# Old\n\n> Live log.\n- [[alpha]] once\n\n";

interface PullReport {
  vault: string;
  notes: number;
  logs: number;
  assets: number;
  written: string[];
  unchanged: string[];
  modified: { path: string; incoming: string | null; note?: string }[];
  removed: string[];
  problems: string[];
}
interface PushReport {
  vault: string;
  pushed: { path: string; id: string; revision: number }[];
  refused: { path: string; reason: string; conflict?: string }[];
  unchanged: string[];
}
interface Manifest {
  database: string;
  files: Record<
    string,
    { kind: string; id: string; base: number | null; hash: string | null; pending?: { path: string; base?: number | null; hash?: string } }
  >;
}

/** A minimal tldraw document stamped with topic `alpha`, as `canvas new` writes one. */
function diagramDocument(): string {
  return JSON.stringify({
    tldrawFileFormatVersion: 1,
    schema: { schemaVersion: 2 },
    records: [
      { typeName: "shape", id: "shape:s0", type: "geo", x: 0, y: 0, props: { w: 100, h: 50 } },
      {
        typeName: "document",
        id: "document:document",
        gridSize: 10,
        name: "",
        meta: { tldrawkc: { kc: 1, topic: "alpha", title: "Alpha map", concepts: ["alpha"], created: "2026-09-28T00:00:00.000Z" } },
      },
      { typeName: "page", id: "page:page", name: "Page 1", index: "a1", meta: {} },
    ],
  });
}

describe.skipIf(!reachable.ok)("learn vault", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  const vaults: string[] = [];
  const savedHome = process.env["GNOSIA_HOME"];

  function learn(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    return execFileAsync(process.execPath, ["--import", "tsx", ENTRY, ...args], {
      env: { ...process.env, LEARN_ROOT: fixture.root, DATABASE_URL: scratch.url },
    }).then(
      ({ stdout, stderr }) => ({ stdout, stderr, code: 0 }),
      (error: { stdout: string; stderr: string; code: number }) => ({
        stdout: error.stdout,
        stderr: error.stderr,
        code: error.code,
      }),
    );
  }
  async function pull(vault: string): Promise<PullReport> {
    const result = await learn("vault", "pull", "--out", vault, "--json");
    expect(result.stderr).toBe("");
    return JSON.parse(result.stdout) as PullReport;
  }
  async function push(vault: string, ...args: string[]): Promise<PushReport & { code: number }> {
    const result = await learn("vault", "push", "--out", vault, "--json", ...args);
    return { ...(JSON.parse(result.stdout) as PushReport), code: result.code };
  }
  async function newVault(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "gnosia-vault-"));
    vaults.push(dir);
    return dir;
  }
  const read = (vault: string, rel: string) => readFile(path.join(vault, rel), "utf8");
  const exists = (vault: string, rel: string) => readFile(path.join(vault, rel)).then(() => true, () => false);
  const manifest = async (vault: string) => JSON.parse(await read(vault, ".vault.json")) as Manifest;
  const revisions = async (slug?: string) =>
    (
      await scratch.db
        .select({ n: sql<number>`count(*)` })
        .from(contentRevision)
        .where(
          slug === undefined
            ? undefined
            : and(eq(contentRevision.entityType, "concept"), eq(contentRevision.entityId, slug)),
        )
    )[0]?.n ?? 0;
  const body = async (slug: string) => (await scratch.db.select().from(concept).where(eq(concept.slug, slug)))[0]?.body;

  beforeAll(async () => {
    // The blob store the SVGs are pulled from, for this process and the CLI it runs.
    process.env["GNOSIA_HOME"] = await newVault();
    scratch = await migratedScratchDatabase();
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["alpha", "beta", "gamma", "delta"] }]));
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write("learn/concepts/fixtures/alpha.md", note({ id: "alpha", title: "Alpha", summary: "The first one." }));
    await fixture.write("learn/concepts/fixtures/beta.md", note({ id: "beta", title: "Beta", requires: ["alpha"], body: "# Beta\n\nSee [[alpha]]." }));
    await fixture.write("learn/concepts/fixtures/gamma.md", note({ id: "gamma", title: "Gamma", requires: ["beta"] }));
    await fixture.write("learn/concepts/other/delta.md", note({ id: "delta", title: "Delta" }));
    await fixture.write("learn/sessions/2026-01-01-old.md", LOG);

    const context = await fixture.context({ knownConcepts: async () => new Set(["alpha", "beta", "gamma", "delta"]) });
    const database = await databaseIdentity(scratch.db);
    // Diagrams too, though the tree holds none: a diagram put writes through
    // to the tree diagrams were last imported from, so one test can add one.
    for (const indexer of [topicsIndexer, tagsIndexer, conceptsIndexer, sessionsIndexer, diagramsIndexer]) {
      const { rows, logs } = await indexer.read(context);
      await writeSource(scratch.db, indexer, rows, [], indexer.root(context), {
        logs,
        metadata: { root: fixture.root, database },
      });
    }
    const readers = new Set(["concepts", "sessions"] as const);
    await flip(scratch.db, { type: "concepts", readers });
    await flip(scratch.db, { type: "sessions", readers });
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    await fixture?.cleanup();
    for (const vault of vaults) await rm(vault, { recursive: true, force: true });
    if (savedHome === undefined) delete process.env["GNOSIA_HOME"];
    else process.env["GNOSIA_HOME"] = savedHome;
  });

  it("pulls into an empty folder and pushes nothing back when nothing was edited", async () => {
    const vault = await newVault();
    const before = await revisions();
    const pulled = await pull(vault);
    expect(pulled).toMatchObject({ notes: 4, logs: 1, unchanged: [], modified: [], removed: [], problems: [] });
    expect(pulled.written.sort()).toEqual([
      "concepts/fixtures/alpha.md",
      "concepts/fixtures/beta.md",
      "concepts/fixtures/gamma.md",
      "concepts/other/delta.md",
      "sessions/2026-01-01-old.md",
    ]);
    // Each file is what its row renders, wikilinks as the note wrote them.
    expect(await read(vault, "concepts/fixtures/beta.md")).toBe(
      note({ id: "beta", title: "Beta", requires: ["alpha"], body: "# Beta\n\nSee [[alpha]]." }),
    );
    expect(await read(vault, "sessions/2026-01-01-old.md")).toBe(LOG);
    expect((await read(vault, "README.md")).split("\n").filter((line) => line !== "" && !line.startsWith("#"))).toHaveLength(6);
    expect(await exists(vault, ".obsidian")).toBe(false);
    const recorded = await manifest(vault);
    expect(recorded.files["concepts/fixtures/beta.md"]).toMatchObject({ kind: "note", id: "beta" });
    expect(recorded.files["concepts/fixtures/beta.md"]?.base).toEqual(expect.any(Number));
    expect(recorded.files["sessions/2026-01-01-old.md"]).toMatchObject({ kind: "log", base: 1 });

    const pushed = await push(vault);
    expect(pushed).toMatchObject({ pushed: [], refused: [], code: 0 });
    expect(pushed.unchanged).toHaveLength(5);
    expect(await revisions()).toBe(before);
    // A second pull finds everything as it left it.
    expect((await pull(vault)).unchanged).toHaveLength(5);
    expect(await revisions()).toBe(before);
  }, 60_000);

  it("pushes one edited note as one revision, and nothing the second time", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/fixtures/alpha.md";
    const edited = (await read(vault, rel)).replace("# Alpha", "# Alpha\n\nWritten in Obsidian.");
    await writeFile(path.join(vault, rel), edited);
    const before = await revisions("alpha");

    const pushed = await push(vault, "--reason", "an edit from the vault");
    expect(pushed).toMatchObject({ refused: [], code: 0 });
    expect(pushed.pushed.map((file) => file.path)).toEqual([rel]);
    expect(await revisions("alpha")).toBe(before + 1);
    expect(await body("alpha")).toContain("Written in Obsidian.");
    const [revision] = await scratch.db
      .select()
      .from(contentRevision)
      .where(eq(contentRevision.id, pushed.pushed[0]?.revision ?? -1));
    expect(revision).toMatchObject({ entityType: "concept", entityId: "alpha", reason: "an edit from the vault", authorKind: "person" });
    expect((await manifest(vault)).files[rel]?.base).toBe(pushed.pushed[0]?.revision);

    expect((await push(vault)).pushed).toEqual([]);
    expect(await revisions("alpha")).toBe(before + 1);
  }, 60_000);

  it("refuses a note edited on both sides, leaves a .conflict copy, and pushes once it is settled", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/fixtures/gamma.md";
    const mine = (await read(vault, rel)).replace("# Gamma", "# Gamma\n\nMy side.");
    await writeFile(path.join(vault, rel), mine);
    expect((await learn("concept", "edit", "gamma", "--summary", "Their side.")).code).toBe(0);
    const before = await revisions("gamma");

    const refused = await push(vault);
    expect(refused.code).toBe(1);
    expect(refused.pushed).toEqual([]);
    expect(refused.refused).toEqual([
      expect.objectContaining({ path: rel, conflict: "concepts/fixtures/gamma.conflict.md", reason: expect.stringMatching(/changed in the database/) }),
    ]);
    expect(await read(vault, rel)).toBe(mine);
    expect(await read(vault, "concepts/fixtures/gamma.conflict.md")).toContain("summary: Their side.");
    expect(await revisions("gamma")).toBe(before);
    // A pull finds the same version beside it and leaves the copy under the name push gave it.
    expect((await pull(vault)).modified).toEqual([{ path: rel, incoming: "concepts/fixtures/gamma.conflict.md" }]);
    expect(await exists(vault, "concepts/fixtures/gamma.incoming.md")).toBe(false);
    // Pushing again while the copy is there is refused the same way, and writes nothing.
    expect((await push(vault)).refused[0]?.reason).toMatch(/gamma\.conflict\.md is the database's newer version/);

    // Merged by hand, the copy deleted: the note is based on the copy's version now.
    await writeFile(path.join(vault, rel), mine.replace("title: Gamma", "title: Gamma\nsummary: Their side."));
    await rm(path.join(vault, "concepts/fixtures/gamma.conflict.md"));
    const settled = await push(vault);
    expect(settled).toMatchObject({ refused: [], code: 0 });
    expect(settled.pushed.map((file) => file.path)).toEqual([rel]);
    expect(await revisions("gamma")).toBe(before + 1);
    const [row] = await scratch.db.select().from(concept).where(eq(concept.slug, "gamma"));
    expect(row).toMatchObject({ summary: "Their side." });
    expect(row?.body).toContain("My side.");
  }, 60_000);

  it("refuses an edited session log by name, and takes it back once it matches again", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "sessions/2026-01-01-old.md";
    await writeFile(path.join(vault, rel), LOG.replace("once", "twice"));
    const before = await revisions();

    const refused = await push(vault);
    expect(refused.code).toBe(1);
    expect(refused.refused).toEqual([
      { path: rel, reason: expect.stringMatching(/^sessions\/2026-01-01-old\.md is a session log, which is a record of what happened.*a correction belongs in the note it touched/) },
    ]);
    expect(await revisions()).toBe(before);

    // Deleting the copy and pulling puts the database's back.
    await rm(path.join(vault, rel));
    expect((await pull(vault)).written).toEqual([rel]);
    expect(await read(vault, rel)).toBe(LOG);
    expect((await push(vault)).refused).toEqual([]);
  }, 60_000);

  it("never overwrites an edit on pull: the database's newer version lands beside it as .incoming", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/other/delta.md";
    const mine = (await read(vault, rel)).replace("# Delta", "# Delta\n\nNot pushed yet.");
    await writeFile(path.join(vault, rel), mine);

    // The database has not moved: the edit is listed, and no copy is written.
    const quiet = await pull(vault);
    expect(quiet.modified).toEqual([{ path: rel, incoming: null }]);
    expect(await exists(vault, "concepts/other/delta.incoming.md")).toBe(false);

    expect((await learn("concept", "edit", "delta", "--title", "Delta, renamed")).code).toBe(0);
    const moved = await pull(vault);
    expect(moved.modified).toEqual([{ path: rel, incoming: "concepts/other/delta.incoming.md" }]);
    expect(await read(vault, rel)).toBe(mine);
    expect(await read(vault, "concepts/other/delta.incoming.md")).toContain("title: Delta, renamed");

    // A person who merges into the copy instead of the note keeps that too.
    const merging = `${await read(vault, "concepts/other/delta.incoming.md")}\nhalf merged\n`;
    await writeFile(path.join(vault, "concepts/other/delta.incoming.md"), merging);
    expect((await learn("concept", "edit", "delta", "--title", "Delta, again")).code).toBe(0);
    const held = await pull(vault);
    expect(held.modified[0]).toMatchObject({ path: rel, incoming: null, note: expect.stringMatching(/holds edits of its own/) });
    expect(await read(vault, "concepts/other/delta.incoming.md")).toBe(merging);
    expect(await read(vault, rel)).toBe(mine);

    // And push refuses the note while that copy is unsettled.
    const refused = await push(vault);
    expect(refused.refused.map((file) => file.path)).toEqual([rel]);
    expect(await read(vault, rel)).toBe(mine);
  }, 60_000);

  it("keeps a file that was there before any pull, and refuses what it cannot place", async () => {
    const vault = await newVault();
    const rel = "concepts/fixtures/beta.md";
    await writeFile(path.join(vault, "stray.md"), "not ours\n");
    await mkdir(path.join(vault, "concepts/fixtures"), { recursive: true });
    await writeFile(path.join(vault, rel), "my own beta\n");
    await writeFile(path.join(vault, "concepts/fixtures/epsilon.md"), "a note the database has never seen\n");

    const pulled = await pull(vault);
    expect(pulled.modified).toEqual([{ path: rel, incoming: "concepts/fixtures/beta.incoming.md" }]);
    expect(await read(vault, rel)).toBe("my own beta\n");
    expect(await read(vault, "stray.md")).toBe("not ours\n");

    const pushed = await push(vault);
    expect(pushed.refused.map((file) => file.path)).toEqual([rel, "concepts/fixtures/epsilon.md"]);
    expect(pushed.refused[1]?.reason).toMatch(/learn concept add --topic/);
  }, 60_000);

  it("keeps a .conflict copy a person merged into, record and all, when the database moves again", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/fixtures/alpha.md";
    await writeFile(path.join(vault, rel), `${await read(vault, rel)}\nmine\n`);
    expect((await learn("concept", "edit", "alpha", "--summary", "First move.")).code).toBe(0);
    expect((await push(vault)).refused[0]?.conflict).toBe("concepts/fixtures/alpha.conflict.md");
    const merging = `${await read(vault, "concepts/fixtures/alpha.conflict.md")}\nmerging here\n`;
    await writeFile(path.join(vault, "concepts/fixtures/alpha.conflict.md"), merging);
    expect((await learn("concept", "edit", "alpha", "--summary", "Second move.")).code).toBe(0);

    const pulled = await pull(vault);
    expect(pulled.modified).toEqual([expect.objectContaining({ path: rel, incoming: null, note: expect.stringMatching(/holds edits of its own/) })]);
    expect(await read(vault, "concepts/fixtures/alpha.conflict.md")).toBe(merging);
    expect(await exists(vault, "concepts/fixtures/alpha.incoming.md")).toBe(false);
    expect((await manifest(vault)).files[rel]?.pending?.path).toBe("concepts/fixtures/alpha.conflict.md");
  }, 60_000);

  it("refuses a manifest naming a path outside the vault, and touches nothing", async () => {
    const vault = await newVault();
    const outside = await newVault();
    await pull(vault);
    await writeFile(path.join(outside, "victim.md"), "not the vault's\n");
    const recorded = await manifest(vault);
    const hash = recorded.files["concepts/fixtures/alpha.md"]?.hash ?? null;
    recorded.files[`../${path.basename(outside)}/victim.md`] = { kind: "note", id: "gone", base: 1, hash };
    await writeFile(path.join(vault, ".vault.json"), JSON.stringify(recorded, null, 2));
    for (const verb of ["pull", "push"]) {
      const result = await learn("vault", verb, "--out", vault);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/names paths pull never writes/);
    }
    expect(await read(outside, "victim.md")).toBe("not the vault's\n");
  }, 60_000);

  it("refuses to write through a folder linked out of the vault", async () => {
    const vault = await newVault();
    const elsewhere = await newVault();
    await symlink(elsewhere, path.join(vault, "concepts"));
    const result = await learn("vault", "pull", "--out", vault, "--json");
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout) as PullReport;
    expect(report.problems).toHaveLength(4);
    for (const problem of report.problems) expect(problem).toMatch(/resolves outside the vault/);
    expect(await readdir(elsewhere)).toEqual([]);
  }, 60_000);

  it("never reads a note through a link, so nothing outside the vault is pushed", async () => {
    const vault = await newVault();
    const outside = await newVault();
    await pull(vault);
    const rel = "concepts/fixtures/beta.md";
    const target = path.join(outside, "beta.md");
    await writeFile(target, (await read(vault, rel)).replace("See [[alpha]].", "Bytes from outside the vault."));
    await rm(path.join(vault, rel));
    await symlink(target, path.join(vault, rel));
    const before = await revisions();

    const pushed = await push(vault);
    expect(pushed.code).toBe(1);
    expect(pushed.refused).toEqual([{ path: rel, reason: expect.stringMatching(/is not a plain file/) }]);
    expect(await revisions()).toBe(before);
    expect(await body("beta")).not.toContain("Bytes from outside");

    const pulled = await learn("vault", "pull", "--out", vault, "--json");
    expect(pulled.code).toBe(1);
    expect((JSON.parse(pulled.stdout) as PullReport).problems).toEqual([expect.stringMatching(/beta\.md is not a plain file/)]);
    expect((await lstat(path.join(vault, rel))).isSymbolicLink()).toBe(true);
    expect(await readFile(target, "utf8")).toContain("Bytes from outside the vault.");
  }, 60_000);

  it("never reads a note through a linked folder, and refuses anything named like a note", async () => {
    const vault = await newVault();
    const outside = await newVault();
    await pull(vault);
    const folder = path.join(vault, "concepts/other");
    await writeFile(
      path.join(outside, "delta.md"),
      (await read(vault, "concepts/other/delta.md")).replace("# Delta", "# Delta\n\nBytes from outside."),
    );
    await rm(folder, { recursive: true });
    await symlink(outside, folder);
    await mkdir(path.join(vault, "concepts/fixtures/folder.md"));
    const before = await revisions();

    const pushed = await push(vault);
    expect(pushed.refused).toEqual([
      { path: "concepts/other/delta.md", reason: expect.stringMatching(/resolves outside the vault/) },
      { path: "concepts/fixtures/folder.md", reason: expect.stringMatching(/is not a note in the database/) },
    ]);
    expect(await revisions()).toBe(before);
    const pulled = await learn("vault", "pull", "--out", vault, "--json");
    expect(pulled.code).toBe(1);
    expect((JSON.parse(pulled.stdout) as PullReport).problems).toEqual([expect.stringMatching(/delta\.md is in a folder that resolves outside the vault/)]);
    expect(await readdir(outside)).toEqual(["delta.md"]);
  }, 60_000);

  it("removes nothing on a pull that meets a stale file it cannot read", async () => {
    const vault = await newVault();
    const outside = await newVault();
    await pull(vault);
    const recorded = await manifest(vault);
    // Two files the database does not have, as a pull that recorded them would leave them.
    const plain = "concepts/fixtures/zzz-gone.md";
    const linked = "concepts/fixtures/aaa-gone.md";
    await writeFile(path.join(vault, plain), "gone\n");
    await writeFile(path.join(outside, "target.md"), "gone\n");
    await symlink(path.join(outside, "target.md"), path.join(vault, linked));
    const hash = createHash("sha256").update("gone\n").digest("hex");
    recorded.files[plain] = { kind: "note", id: "zzz-gone", base: 1, hash };
    recorded.files[linked] = { kind: "note", id: "aaa-gone", base: 1, hash };
    await writeFile(path.join(vault, ".vault.json"), JSON.stringify(recorded, null, 2));

    const pulled = await learn("vault", "pull", "--out", vault, "--json");
    expect(pulled.code).toBe(1);
    const report = JSON.parse(pulled.stdout) as PullReport;
    expect(report.removed).toEqual([]);
    expect(report.problems).toEqual([expect.stringMatching(/aaa-gone\.md is not a plain file/)]);
    expect(await read(vault, plain)).toBe("gone\n");
  }, 60_000);

  it("reports a README that is not a plain file, before removing anything", async () => {
    const vault = await newVault();
    await pull(vault);
    await rm(path.join(vault, "README.md"));
    await mkdir(path.join(vault, "README.md"));
    const stale = "concepts/fixtures/gone.md";
    await writeFile(path.join(vault, stale), "gone\n");
    const recorded = await manifest(vault);
    recorded.files[stale] = { kind: "note", id: "gone", base: 1, hash: createHash("sha256").update("gone\n").digest("hex") };
    await writeFile(path.join(vault, ".vault.json"), JSON.stringify(recorded, null, 2));
    const pulled = await learn("vault", "pull", "--out", vault, "--json");
    expect(pulled.code).toBe(1);
    const report = JSON.parse(pulled.stdout) as PullReport;
    expect(report.problems).toEqual([expect.stringMatching(/README\.md is not a plain file/)]);
    expect(report.removed).toEqual([]);
    expect(await read(vault, stale)).toBe("gone\n");
  }, 60_000);

  it("refuses a vault inside the repository", async () => {
    const result = await learn("vault", "pull", "--out", path.join(HERE, "..", "..", "..", "learn", "vault"));
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/A vault lives outside every checkout/);
  }, 60_000);

  it("refuses a push into another database, before writing anything", async () => {
    const vault = await newVault();
    await pull(vault);
    const recorded = await manifest(vault);
    await writeFile(
      path.join(vault, ".vault.json"),
      JSON.stringify({ ...recorded, database: "gnosia:1" }, null, 2),
    );
    const rel = "concepts/fixtures/alpha.md";
    await writeFile(path.join(vault, rel), `${await read(vault, rel)}\nfrom elsewhere\n`);
    const before = await revisions();
    const result = await learn("vault", "push", "--out", vault);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/was pulled from the database gnosia:1/);
    expect(await revisions()).toBe(before);
    // A pull adopts this database, keeps the edit, and puts this database's version beside it.
    const pulled = await pull(vault);
    expect(pulled.modified).toEqual([{ path: rel, incoming: "concepts/fixtures/alpha.incoming.md" }]);
    expect((await manifest(vault)).database).toBe(await databaseIdentity(scratch.db));
    const entries = await readdir(path.join(vault, "concepts/fixtures"));
    expect(entries).toContain("alpha.incoming.md");
  }, 60_000);
  it("keeps an edited file of a note the database no longer has, and removes an unedited one", async () => {
    const vault = await newVault();
    await pull(vault);
    const recorded = await manifest(vault);
    const hash = createHash("sha256").update("gone\n").digest("hex");
    const unedited = "concepts/fixtures/gone-clean.md";
    const edited = "concepts/fixtures/gone-edited.md";
    await writeFile(path.join(vault, unedited), "gone\n");
    await writeFile(path.join(vault, edited), "gone, and then edited here\n");
    recorded.files[unedited] = { kind: "note", id: "gone-clean", base: 1, hash };
    recorded.files[edited] = { kind: "note", id: "gone-edited", base: 1, hash };
    await writeFile(path.join(vault, ".vault.json"), JSON.stringify(recorded, null, 2));

    const pulled = await pull(vault);
    expect(pulled.removed).toEqual([unedited]);
    expect(pulled.modified).toEqual([
      { path: edited, incoming: null, note: expect.stringMatching(/no longer has this note; your copy is kept/) },
    ]);
    expect(await exists(vault, unedited)).toBe(false);
    expect(await read(vault, edited)).toBe("gone, and then edited here\n");
  }, 60_000);

  it("reports a stale file's side copy that is a link before removing anything, and keeps the manifest", async () => {
    const vault = await newVault();
    const outside = await newVault();
    await pull(vault);
    const recorded = await manifest(vault);
    const hash = createHash("sha256").update("gone\n").digest("hex");
    // One stale file removed cleanly, and one whose side copy is a link.
    const clean = "concepts/fixtures/aaa-gone.md";
    const linked = "concepts/fixtures/zzz-gone.md";
    await writeFile(path.join(vault, clean), "gone\n");
    await writeFile(path.join(vault, linked), "gone\n");
    await writeFile(path.join(outside, "target.md"), "not the vault's\n");
    await symlink(path.join(outside, "target.md"), path.join(vault, "concepts/fixtures/zzz-gone.incoming.md"));
    recorded.files[clean] = { kind: "note", id: "aaa-gone", base: 1, hash };
    recorded.files[linked] = {
      kind: "note",
      id: "zzz-gone",
      base: 1,
      hash,
      pending: { path: "concepts/fixtures/zzz-gone.incoming.md", base: 1, hash },
    };
    await writeFile(path.join(vault, ".vault.json"), JSON.stringify(recorded, null, 2));

    const result = await learn("vault", "pull", "--out", vault, "--json");
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout) as PullReport;
    expect(report.problems).toEqual([expect.stringMatching(/zzz-gone\.incoming\.md is not a plain file/)]);
    expect(report.removed).toEqual([]);
    expect(await read(vault, clean)).toBe("gone\n");
    expect(await read(outside, "target.md")).toBe("not the vault's\n");
    const after = await manifest(vault);
    expect(Object.keys(after.files)).toEqual(expect.arrayContaining([clean, linked]));
  }, 60_000);

  it("never overwrites a save that lands while a pull is replacing the file", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/fixtures/beta.md";
    const target = path.join(vault, rel);
    expect((await learn("concept", "edit", "beta", "--summary", "Moved while the vault was closed.")).code).toBe(0);
    const saved = `${await read(vault, rel)}\nsaved in Obsidian mid-pull\n`;

    // The save lands the moment the pull first writes anything for this file:
    // after any check it made, before its new text is in place.
    const writeFileOriginal = fsPromises.writeFile;
    let fired = false;
    const spy = vi.spyOn(fsPromises, "writeFile").mockImplementation(async (file, data, options) => {
      const name = typeof file === "string" ? file : "";
      if (!fired && path.dirname(name) === path.dirname(target) && (name === target || path.basename(name).startsWith(".beta.md."))) {
        fired = true;
        await writeFileOriginal(target, saved);
      }
      return writeFileOriginal(file, data, options);
    });
    let report;
    try {
      report = await pullVault(scratch.db, { dir: vault });
    } finally {
      spy.mockRestore();
    }
    expect(fired).toBe(true);
    expect(await read(vault, rel)).toBe(saved);
    expect(report.written).not.toContain(rel);
    expect(report.modified).toEqual([{ path: rel, incoming: null, note: "changed while the pull ran; pull again" }]);
  }, 60_000);

  it("records each commit as it lands, so a push stopped halfway knows what it already wrote", async () => {
    const vault = await newVault();
    await pull(vault);
    const first = "concepts/fixtures/alpha.md";
    const second = "concepts/fixtures/beta.md";
    const firstText = `${await read(vault, first)}\nfirst of two\n`;
    await writeFile(path.join(vault, first), firstText);
    await writeFile(path.join(vault, second), `${await read(vault, second)}\nsecond of two\n`);

    // The second note cannot be read, which stops the push after the first commit.
    const openOriginal = fsPromises.open;
    const spy = vi.spyOn(fsPromises, "open").mockImplementation(async (file, flags, mode) => {
      if (file === path.join(vault, second)) throw Object.assign(new Error("EIO: the disk went away"), { code: "EIO" });
      return openOriginal(file, flags, mode);
    });
    try {
      await expect(pushVault(scratch.db, { dir: vault })).rejects.toThrow("the disk went away");
    } finally {
      spy.mockRestore();
    }
    const [latest] = await scratch.db
      .select({ id: contentRevision.id })
      .from(contentRevision)
      .where(and(eq(contentRevision.entityType, "concept"), eq(contentRevision.entityId, "alpha")))
      .orderBy(sql`${contentRevision.id} desc`)
      .limit(1);
    expect((await manifest(vault)).files[first]).toMatchObject({
      base: latest?.id,
      hash: createHash("sha256").update(firstText).digest("hex"),
    });

    const again = await push(vault);
    expect(again).toMatchObject({ refused: [], code: 0 });
    expect(again.pushed.map((file) => file.path)).toEqual([second]);
    expect(again.unchanged).toContain(first);
  }, 60_000);

  it("takes a note the database already holds as this very file for its own commit, not a conflict", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/other/delta.md";
    const text = `${await read(vault, rel)}\ncommitted, then the push stopped\n`;
    await writeFile(path.join(vault, rel), text);
    // A push that committed this and stopped before writing .vault.json.
    const base = (await manifest(vault)).files[rel]?.base ?? null;
    const written = await commitNoteText(scratch.db, "delta", text, { base, reason: "the push that stopped" });

    const pushed = await push(vault);
    expect(pushed).toMatchObject({ pushed: [], refused: [], code: 0 });
    expect(pushed.unchanged).toContain(rel);
    expect(await exists(vault, "concepts/other/delta.conflict.md")).toBe(false);
    expect((await manifest(vault)).files[rel]?.base).toBe(written.revision);
  }, 60_000);

  it("refuses a note whose frontmatter fence is damaged, by file, and writes nothing", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/fixtures/gamma.md";
    const damaged = (await read(vault, rel)).replace(/^---\n/, "--\n");
    await writeFile(path.join(vault, rel), damaged);
    const before = await revisions("gamma");

    const pushed = await push(vault);
    expect(pushed.code).toBe(1);
    expect(pushed.refused).toEqual([
      { path: rel, reason: expect.stringMatching(/gamma\.md has no frontmatter that parses/) },
    ]);
    expect(pushed.refused[0]?.reason).toContain(path.join(vault, rel));
    expect(await revisions("gamma")).toBe(before);

    // A broken closing fence runs the block on to a later --- in the body,
    // which would drop everything before it: refused by the line it met.
    const runOn = (await read(vault, rel))
      .replace(/^--\n/, "---\n")
      .replace(/\n---\n/, "\n--\n")
      .concat("\n---\n\nafter a rule\n");
    await writeFile(path.join(vault, rel), runOn);
    expect((await push(vault)).refused[0]?.reason).toMatch(/is not a key: line: its closing --- is probably damaged/);
    expect(await revisions("gamma")).toBe(before);
    // A comment line is named as one, and refused, since no column keeps it.
    await writeFile(path.join(vault, rel), `---\nid: gamma\n# a note to myself\ntitle: Gamma\n---\n\n# Gamma\n`);
    expect((await push(vault)).refused[0]?.reason).toMatch(/"# a note to myself" in its frontmatter\. A comment there has no column/);
    expect(await revisions("gamma")).toBe(before);
    await writeFile(path.join(vault, rel), damaged);

    // Frontmatter with no id: is refused the same way.
    await writeFile(path.join(vault, rel), (await read(vault, rel)).replace(/^--\n/, "---\n").replace(/^id: .*\n/m, ""));
    expect((await push(vault)).refused[0]?.reason).toMatch(/has frontmatter with no id:/);
    expect(await revisions("gamma")).toBe(before);
  }, 60_000);

  it("names a kept edit for what it is, rather than as a new note", async () => {
    const vault = await newVault();
    await pull(vault);
    const kept = "concepts/fixtures/alpha.kept-1700000000000.md";
    await writeFile(path.join(vault, kept), "an edit saved while a pull moved alpha.md\n");
    const pushed = await push(vault);
    expect(pushed.refused).toEqual([
      { path: kept, reason: expect.stringMatching(/is an edit saved to concepts\/fixtures\/alpha\.md while a vault command/) },
    ]);
  }, 60_000);

  it("refuses a vault inside another checkout of this repository", async () => {
    const other = await newVault();
    await writeFile(path.join(other, "package.json"), JSON.stringify({ name: "gnosia", private: true }));
    const result = await learn("vault", "pull", "--out", path.join(other, "learn", "vault"));
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/is inside .*, a checkout of this repository/);
    expect(await readdir(other)).toEqual(["package.json"]);
  }, 60_000);

  it("pulls each diagram's SVG into assets/, read-only, and push leaves it alone", async () => {
    const work = await newVault();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>alpha</title></svg>';
    await writeFile(path.join(work, "alpha-map.tldr"), diagramDocument());
    await writeFile(path.join(work, "alpha-map.svg"), svg);
    await putDiagram(scratch.db, openBlobStore(), {
      slug: "alpha-map",
      tldr: path.join(work, "alpha-map.tldr"),
      svg: path.join(work, "alpha-map.svg"),
      reason: "a diagram for the vault test",
      author: "local",
      authorKind: "person",
    });

    const vault = await newVault();
    const pulled = await pull(vault);
    expect(pulled).toMatchObject({ assets: 1, problems: [] });
    expect(pulled.written).toContain("assets/alpha-map.svg");
    expect(await read(vault, "assets/alpha-map.svg")).toBe(svg);
    expect((await manifest(vault)).files["assets/alpha-map.svg"]).toMatchObject({ kind: "asset", id: "alpha-map" });
    expect((await pull(vault)).unchanged).toContain("assets/alpha-map.svg");

    // Edited here: never pushed, never overwritten, and said so.
    await writeFile(path.join(vault, "assets/alpha-map.svg"), `${svg}\n<!-- mine -->\n`);
    const pushed = await push(vault);
    expect(pushed).toMatchObject({ pushed: [], refused: [], code: 0 });
    expect(pushed.unchanged).not.toContain("assets/alpha-map.svg");
    const again = await pull(vault);
    expect(again.modified).toEqual([
      { path: "assets/alpha-map.svg", incoming: null, note: expect.stringMatching(/read-only in the vault/) },
    ]);
    expect(await read(vault, "assets/alpha-map.svg")).toBe(`${svg}\n<!-- mine -->\n`);
    // Deleted, it comes back from the store.
    await rm(path.join(vault, "assets/alpha-map.svg"));
    expect((await pull(vault)).written).toEqual(["assets/alpha-map.svg"]);

    // A new SVG in the database, and two saves racing the pull that replaces
    // the old one: one lands just before the pull moves the file aside, one
    // just after. Both are kept; the second where it was saved.
    const newer = svg.replace("<title>alpha</title>", "<title>alpha, redrawn</title>");
    await writeFile(path.join(work, "alpha-map.svg"), newer);
    await writeFile(path.join(work, "alpha-map.tldr"), diagramDocument().replace("Alpha map", "Alpha map, redrawn"));
    await putDiagram(scratch.db, openBlobStore(), {
      slug: "alpha-map",
      tldr: path.join(work, "alpha-map.tldr"),
      svg: path.join(work, "alpha-map.svg"),
      reason: "redrawn",
      author: "local",
      authorKind: "person",
    });
    const target = path.join(vault, "assets/alpha-map.svg");
    const renameOriginal = fsPromises.rename;
    const spy = vi.spyOn(fsPromises, "rename").mockImplementation(async (from, to) => {
      if (from !== target) return renameOriginal(from, to);
      await fsPromises.writeFile(target, "<svg>first save</svg>");
      await renameOriginal(from, to);
      await fsPromises.writeFile(target, "<svg>second save</svg>");
    });
    try {
      await pullVault(scratch.db, { dir: vault });
    } finally {
      spy.mockRestore();
    }
    expect(await read(vault, "assets/alpha-map.svg")).toBe("<svg>second save</svg>");
    const kept = (await readdir(path.join(vault, "assets"))).filter((name) => /^alpha-map\.kept-\d+\.svg$/.test(name));
    expect(kept).toHaveLength(1);
    expect(await read(vault, `assets/${kept[0]}`)).toBe("<svg>first save</svg>");
  }, 60_000);

  it("removes an unedited SVG whose diagram is gone, judged by its bytes", async () => {
    const vault = await newVault();
    await pull(vault);
    // Not valid UTF-8, as an SVG's bytes need not be.
    const bytes = Buffer.from([0x3c, 0x73, 0x76, 0x67, 0xff, 0xfe, 0x3e]);
    await writeFile(path.join(vault, "assets/old-diagram.svg"), bytes);
    const recorded = await manifest(vault);
    recorded.files["assets/old-diagram.svg"] = {
      kind: "asset",
      id: "old-diagram",
      base: null,
      hash: createHash("sha256").update(bytes).digest("hex"),
    };
    await writeFile(path.join(vault, ".vault.json"), JSON.stringify(recorded, null, 2));
    expect((await pull(vault)).removed).toEqual(["assets/old-diagram.svg"]);
    expect(await exists(vault, "assets/old-diagram.svg")).toBe(false);
  }, 60_000);

  // Last: a session log cannot be deleted, so this one stays in the database.
  it("leaves out a log whose id would read as a side copy, and the manifest stays readable", async () => {
    await scratch.db.insert(session).values({ id: "z.incoming", kind: "tutor", learnerId: "local" });
    await scratch.db.insert(sessionLogEntry).values({ sessionId: "z.incoming", seq: 1, markdown: "# z\n" });
    const vault = await newVault();
    for (let run = 0; run < 2; run += 1) {
      const result = await learn("vault", "pull", "--out", vault, "--json");
      expect(result.stderr).toBe("");
      const report = JSON.parse(result.stdout) as PullReport;
      expect(report.problems).toEqual([expect.stringMatching(/"z\.incoming" would be named like a copy the vault writes/)]);
    }
    expect(await exists(vault, "sessions/z.incoming.md")).toBe(false);
    expect((await manifest(vault)).files["sessions/z.incoming.md"]).toBeUndefined();
  }, 60_000);

  it("pulls none of another owner's notes, logs or diagrams (phase 4)", async () => {
    const other = "other";
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><title>theirs</title></svg>';
    const sha = createHash("sha256").update(svg).digest("hex");
    const key = `${other}/${sha}.svg`;
    await mkdir(path.join(process.env["GNOSIA_HOME"] as string, "blobs", other), { recursive: true });
    await writeFile(path.join(process.env["GNOSIA_HOME"] as string, "blobs", key), svg);
    // Another owner's rows, written around the seam as the review's seed was:
    // the write guards of the flipped types let a named repair through.
    const guarded = (write: (tx: typeof scratch.db) => Promise<void>) =>
      inTransaction(scratch.db, async (tx) => {
        setRevisionId(tx, 'test-seed');
        await write(tx);
      });
    await guarded(async (tx) => {
      await tx.execute(sql`insert into learner (id) values (${other}) on conflict do nothing`);
      await tx.execute(sql`
        insert into concept (slug, title, topic_slug, path, body, owner_id)
        values ('theirs', 'Theirs', 'alpha', 'learn/concepts/fixtures/theirs.md', ${"# Theirs\n"}, ${other})`);
      await tx.insert(session).values({ id: "their-log", kind: "tutor", learnerId: other, state: "closed" });
      await tx.insert(sessionLogEntry).values({ sessionId: "their-log", seq: 1, markdown: "# theirs\n" });
      await tx.execute(sql`
        insert into blob_object (key, owner_id, sha256, bytes, mime, provider, state, confirmed_at)
        values (${key}, ${other}, ${sha}, ${Buffer.byteLength(svg)}, 'image/svg+xml', 'fs', 'present', cast(unixepoch('subsec') * 1000 as integer))`);
      await tx.execute(sql`
        insert into diagram (slug, owner_id, topic_slug, document, document_hash, svg_blob_key, svg_document_hash)
        values ('their-diagram', ${other}, 'alpha', '{"records":[]}', ${"d".repeat(64)}, ${key}, ${"d".repeat(64)})`);
    });
    // Left in place: a session log is append-only, and this is the suite's last case.
    const vault = await newVault();
    const pulled = await pull(vault);
    // An earlier case left a log the vault declines; nothing of theirs is named.
    expect(pulled.problems.filter((problem) => /theirs|their-/.test(problem))).toEqual([]);
    expect(pulled.written.filter((rel) => /theirs|their-log|their-diagram/.test(rel))).toEqual([]);
    expect(await exists(vault, "concepts/fixtures/theirs.md")).toBe(false);
    expect(await exists(vault, "sessions/their-log.md")).toBe(false);
    expect(await exists(vault, "assets/their-diagram.svg")).toBe(false);
  }, 60_000);
});

describe.skipIf(!reachable.ok)("learn vault before the flip", () => {
  it("refuses while the database does not own the notes and logs", async () => {
    const scratch = await migratedScratchDatabase();
    const fixture = await makeFixture();
    const vault = await mkdtemp(path.join(tmpdir(), "gnosia-vault-"));
    try {
      const result = await execFileAsync(process.execPath, ["--import", "tsx", ENTRY, "vault", "pull", "--out", vault], {
        env: { ...process.env, LEARN_ROOT: fixture.root, DATABASE_URL: scratch.url },
      }).then(
        () => ({ code: 0, stderr: "" }),
        (error: { code: number; stderr: string }) => error,
      );
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/does not own concepts or sessions yet/);
      expect(await readdir(vault)).toEqual([]);
    } finally {
      await scratch.drop();
      await fixture.cleanup();
      await rm(vault, { recursive: true, force: true });
    }
  }, 60_000);
});
