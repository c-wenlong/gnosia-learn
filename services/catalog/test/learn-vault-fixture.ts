import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { concept, contentRevision } from "@gnosia/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect } from "vitest";

import { flip } from "../src/content/flip";
import { databaseIdentity } from "../src/content/import-root";
import { conceptsIndexer } from "../src/index/concepts";
import { diagramsIndexer } from "../src/index/diagrams";
import { sessionsIndexer } from "../src/index/sessions";
import { tagsIndexer } from "../src/index/tags";
import { topicsIndexer } from "../src/index/topics";
import { writeSource } from "../src/index/writer";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { migratedScratchDatabase, type Scratch } from "./scratch-database";

/**
 * `learn vault pull|push` (phase 2 of docs/CONTENT-MIGRATION.md, edge case
 * 4): a fixture imported into a scratch database with concepts and sessions
 * flipped for real, and every vault in its own temp folder. The cases are the
 * plan's done-when for the vault, plus the ones that decide whether an edit
 * nobody pushed can be lost.
 *
 * The suites are split by subject so vitest runs them side by side:
 * `learn-vault.test.ts` (pull and push), `learn-vault-conflicts.test.ts`
 * (an edit meeting a newer version), `learn-vault-links.test.ts` (what the
 * vault refuses to read or write through), `learn-vault-placement.test.ts`
 * (where a vault may be, which database and whose notes) and
 * `learn-vault-diagrams.test.ts` (the SVGs under `assets/`). Each file
 * imports the fixture into its own scratch database once, with `learnVault`,
 * and every test pulls into a vault of its own.
 */

export const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENTRY = path.resolve(HERE, "..", "src", "learn", "cli.ts");


export const LOG =
  "---\ntitle: Old\ndate: 2026-01-01T00:00:00.000Z\ngoal: alpha\ntype: learning-session\n---\n\n# Old\n\n> Live log.\n- [[alpha]] once\n\n";

export interface PullReport {
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
export interface PushReport {
  vault: string;
  pushed: { path: string; id: string; revision: number }[];
  refused: { path: string; reason: string; conflict?: string }[];
  unchanged: string[];
}
export interface Manifest {
  database: string;
  files: Record<
    string,
    { kind: string; id: string; base: number | null; hash: string | null; pending?: { path: string; base?: number | null; hash?: string } }
  >;
}

/** A minimal tldraw document stamped with topic `alpha`, as `canvas new` writes one. */
export function diagramDocument(): string {
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

export interface LearnVault {
  /** The file's scratch database, once its `beforeAll` has run. */
  readonly scratch: Scratch;
  readonly fixture: Fixture;
  learn(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }>;
  pull(vault: string): Promise<PullReport>;
  push(vault: string, ...args: string[]): Promise<PushReport & { code: number }>;
  newVault(): Promise<string>;
  read(vault: string, rel: string): Promise<string>;
  exists(vault: string, rel: string): Promise<boolean>;
  manifest(vault: string): Promise<Manifest>;
  /** Content revisions, of one concept or of everything. */
  revisions(slug?: string): Promise<number>;
  body(slug: string): Promise<string | null | undefined>;
}

/**
 * The fixture imported into one test file's scratch database, concepts and
 * sessions flipped, with its hooks registered in the calling `describe`, and
 * the helpers every case reads its vault with.
 */
export function learnVault(): LearnVault {
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

  return {
    get scratch() {
      return scratch;
    },
    get fixture() {
      return fixture;
    },
    learn,
    pull,
    push,
    newVault,
    read,
    exists,
    manifest,
    revisions,
    body,
  };
}
