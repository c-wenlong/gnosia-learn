import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { concept, contentRevision } from "@self-learn/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { flip } from "../src/content/flip";
import { databaseIdentity } from "../src/content/import-root";
import { conceptsIndexer } from "../src/index/concepts";
import { sessionsIndexer } from "../src/index/sessions";
import { tagsIndexer } from "../src/index/tags";
import { topicsIndexer } from "../src/index/topics";
import { writeSource } from "../src/index/writer";
import { applyMigrations } from "../src/migrations";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

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
  files: Record<string, { kind: string; id: string; base: number | null; hash: string | null; pending?: { path: string } }>;
}

describe.skipIf(!reachable.ok)("learn vault", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  const vaults: string[] = [];

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
    const dir = await mkdtemp(path.join(tmpdir(), "self-learn-vault-"));
    vaults.push(dir);
    return dir;
  }
  const read = (vault: string, rel: string) => readFile(path.join(vault, rel), "utf8");
  const exists = (vault: string, rel: string) => readFile(path.join(vault, rel)).then(() => true, () => false);
  const manifest = async (vault: string) => JSON.parse(await read(vault, ".vault.json")) as Manifest;
  const revisions = async (slug?: string) =>
    (
      await scratch.db
        .select({ n: sql<number>`count(*)::int` })
        .from(contentRevision)
        .where(
          slug === undefined
            ? undefined
            : and(eq(contentRevision.entityType, "concept"), eq(contentRevision.entityId, slug)),
        )
    )[0]?.n ?? 0;
  const body = async (slug: string) => (await scratch.db.select().from(concept).where(eq(concept.slug, slug)))[0]?.body;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
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
    for (const indexer of [topicsIndexer, tagsIndexer, conceptsIndexer, sessionsIndexer]) {
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
    expect((await read(vault, "README.md")).split("\n").filter((line) => line !== "" && !line.startsWith("#"))).toHaveLength(5);
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
    const result = await learn("vault", "pull", "--out", vault);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/resolves outside the vault/);
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

  it("refuses a vault inside the repository", async () => {
    const result = await learn("vault", "pull", "--out", path.join(HERE, "..", "..", "..", "learn", "vault"));
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/A vault lives outside the repository/);
  }, 60_000);

  it("refuses a push into another database, before writing anything", async () => {
    const vault = await newVault();
    await pull(vault);
    const recorded = await manifest(vault);
    await writeFile(
      path.join(vault, ".vault.json"),
      JSON.stringify({ ...recorded, database: "self_learn:1" }, null, 2),
    );
    const rel = "concepts/fixtures/alpha.md";
    await writeFile(path.join(vault, rel), `${await read(vault, rel)}\nfrom elsewhere\n`);
    const before = await revisions();
    const result = await learn("vault", "push", "--out", vault);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/was pulled from the database self_learn:1/);
    expect(await revisions()).toBe(before);
    // A pull adopts this database, keeps the edit, and puts this database's version beside it.
    const pulled = await pull(vault);
    expect(pulled.modified).toEqual([{ path: rel, incoming: "concepts/fixtures/alpha.incoming.md" }]);
    expect((await manifest(vault)).database).toBe(await databaseIdentity(scratch.db));
    const entries = await readdir(path.join(vault, "concepts/fixtures"));
    expect(entries).toContain("alpha.incoming.md");
  }, 60_000);
});

describe.skipIf(!reachable.ok)("learn vault before the flip", () => {
  it("refuses while the database does not own the notes and logs", async () => {
    const scratch = await createScratchDatabase();
    const fixture = await makeFixture();
    const vault = await mkdtemp(path.join(tmpdir(), "self-learn-vault-"));
    try {
      await applyMigrations(scratch.db);
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
