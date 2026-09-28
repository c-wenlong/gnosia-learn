import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { REPO_ROOT } from "../src/env";
import { applyMigrations } from "../src/migrations";
import { partialMigrations } from "./partial-migrations";
import { manimkcStandIn, seedWithManimkc } from "./manimkc-standin";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * `scripts/flip-rehearsal.mjs`, the flip-day procedure that phase 3 runs
 * against the owner's database, run end to end against a copy.
 *
 * The template is what the owner's database is today: migrated to 0009,
 * never flipped, and holding a video row whose bytes were never uploaded, so
 * the first migrate has to hold the contract migration (0013) back and the
 * last one applies it. The tree is the seed with one manimkc topic folder mapped,
 * and the manimkc CLI a stand-in reporting one rendered video and its
 * transcript, so the two uploads have something to store and the second has
 * nothing left to. No ffmpeg (`FFMPEG_PATH` names none), so posters are
 * skipped and said so. The script copies the template, runs every step, and
 * drops the copy; the template is read and nothing else.
 *
 * The `--real` switch is tested only for its refusals. It runs flip day
 * against the owner's database in place, and nothing here may. Its two
 * safeguards run in a rehearsal too, so they are tested here on the copy: the
 * backup (its printed restore run as printed, then read back) and the import into a
 * throwaway copy that refuses a tree which would remove rows.
 */

const reachable = await probe();

const SCRIPT = path.join(REPO_ROOT, "scripts", "flip-rehearsal.mjs");

interface Ran {
  code: number | null;
  stdout: string;
  stderr: string;
}

function rehearse(args: string[], env: NodeJS.ProcessEnv = {}): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

interface Step {
  name: string;
  ok: boolean;
  gist: string;
  warning: string | null;
  result: Record<string, unknown> & { [key: string]: unknown };
}

interface Report {
  mode: string;
  ok: boolean;
  tree: string;
  copy: { name: string; method: string; kept: boolean; dropped: boolean };
  backup: { path: string; bytes: number; tables: number; restore: string; restoreArgv: string[][] } | null;
  steps: Step[];
  warnings: number;
}

const url = (name: string) => {
  const at = new URL(process.env["DATABASE_URL"] ?? "postgres://localhost:5432/self_learn");
  at.pathname = `/${name}`;
  return at.toString();
};

/** `createdb -T` needs the template to have no other session. */
async function aloneOn(database: string): Promise<void> {
  const admin = new pg.Client({ connectionString: url("postgres") });
  await admin.connect();
  try {
    await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()", [
      database,
    ]);
  } finally {
    await admin.end();
  }
}

const PG_BIN = process.env["PG_BIN"] ?? "/opt/homebrew/opt/postgresql@17/bin";
const execFileAsync = promisify(execFile);

/** The connection details the client tools read, from the DATABASE_URL the scratch databases use. */
function pgToolEnv(): NodeJS.ProcessEnv {
  const at = new URL(process.env["DATABASE_URL"] ?? "postgres://localhost:5432/self_learn");
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (at.hostname !== "") env["PGHOST"] = decodeURIComponent(at.hostname);
  if (at.port !== "") env["PGPORT"] = at.port;
  if (at.username !== "") env["PGUSER"] = decodeURIComponent(at.username);
  if (at.password !== "") env["PGPASSWORD"] = decodeURIComponent(at.password);
  return env;
}

async function databasesLike(pattern: string): Promise<string[]> {
  const admin = new pg.Client({ connectionString: url("postgres") });
  await admin.connect();
  try {
    const found = await admin.query<{ datname: string }>("select datname from pg_database where datname like $1", [pattern]);
    return found.rows.map((r) => r.datname);
  } finally {
    await admin.end();
  }
}

describe("scripts/flip-rehearsal.mjs --real refuses", () => {
  it("without --database", async () => {
    const ran = await rehearse(["--real"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--real needs --database <name>");
  });

  it("without --checkout", async () => {
    const ran = await rehearse(["--real", "--database", "self_learn_no_such_database"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--real needs --checkout <dir>");
  });

  it("when --checkout is not the checkout the script is in", async () => {
    // A worktree or a clone of the script would import a tree without the
    // owner's untracked files and prune their rows.
    const elsewhere = await mkdtemp(path.join(tmpdir(), "flip-rehearsal-elsewhere-"));
    try {
      const ran = await rehearse(["--real", "--database", "self_learn_no_such_database", "--checkout", elsewhere]);
      expect(ran.code).toBe(2);
      expect(ran.stderr).toContain("is not the checkout this script is in");
      expect(ran.stdout).toBe("");
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it("with a rehearsal's own options", async () => {
    const ran = await rehearse(["--real", "--database", "self_learn", "--keep"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--keep belong to a rehearsal");
  });

  it("without a terminal to type the name on, before it touches anything", async () => {
    // stdin is not a TTY here, as for any agent or script: there is no --yes.
    const ran = await rehearse(["--real", "--database", "self_learn_no_such_database", "--checkout", REPO_ROOT]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("typed on a terminal");
    expect(ran.stdout).toBe("");
  });

  it("--database without --real", async () => {
    const ran = await rehearse(["--database", "self_learn"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--database goes with --real");
  });

  it("--checkout without --real", async () => {
    const ran = await rehearse(["--checkout", REPO_ROOT]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--checkout goes with --real");
  });
});

describe.skipIf(!reachable.ok)("scripts/flip-rehearsal.mjs on a copy", () => {
  let template: Scratch;
  let work: string;
  let tree: string;
  let manimkc: string;

  beforeAll(async () => {
    template = await createScratchDatabase();
    // Where the owner's database is: at 0009, never flipped, no content rows.
    await applyMigrations(template.db, { folder: await partialMigrations(10) });
    // The render an earlier `catalog index` recorded, as the owner's rows do.
    await template.db.execute(
      sql`insert into asset (id, kind, path, source_repo) values ('manimkc:out/demo/one/one.mp4', 'video', 'out/demo/one/one.mp4', 'manimkc')`,
    );

    work = await mkdtemp(path.join(tmpdir(), "catalog-flip-rehearsal-"));
    tree = path.join(work, "tree");
    await seedWithManimkc(tree);
    // A manimkc checkout whose data root holds one render and its transcript.
    manimkc = path.join(work, "manimkc");
    await manimkcStandIn(manimkc, randomBytes(4096));

    await aloneOn(template.name);
  }, 60_000);

  afterAll(async () => {
    await template?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  it("runs every flip-day step on a copy of the template, and its backup restores the template as it was", async () => {
    const name = `${template.name}_rehearsal`;
    // --keep, so the backup is still there to restore; the test drops what it kept.
    const ran = await rehearse(["--from", template.name, "--name", name, "--tree-from", tree, "--keep", "--json"], {
      MANIMKC_ROOT: manimkc,
      FFMPEG_PATH: "none",
    });
    const report = JSON.parse(ran.stdout) as Report;
    try {
      const failed = report.steps.find((s) => !s.ok);
      expect(failed?.gist ?? null, `${failed?.name}: ${ran.stderr}`).toBeNull();
      expect(ran.code).toBe(0);
      expect(report.ok).toBe(true);
      expect(report.copy).toMatchObject({ name, method: "createdb -T", kept: true, dropped: false });

      // The procedure, in the plan's order.
      expect(report.steps.map((s) => s.name)).toEqual([
        "back up the database",
        "migrate",
        "doctor",
        "import into a throwaway copy",
        "import the tree",
        "parity",
        "flip topics",
        "flip tags",
        "export topics, tags",
        "flip concepts",
        "flip sessions",
        "export concepts, sessions",
        "flip courses",
        "export courses",
        "flip diagrams",
        "export diagrams",
        "import the tree again",
        "parity again",
        "asset upload",
        "asset upload again",
        "blob audit",
        "doctor again",
        "migrate the contract",
      ]);
      const step = (stepName: string) => report.steps.find((s) => s.name === stepName)?.result ?? {};

      expect(step("migrate")["applied"]).toEqual([
        "0010_content_expand",
        "0011_content_export_positions",
        "0012_concept_topic_not_null",
      ]);
      // Held, not attempted: its guard would have raised and rolled all four back.
      expect(step("migrate")["held"]).toEqual([
        { tag: "0013_asset_blob_contract", reason: expect.stringMatching(/^1 asset\(s\) of a stored kind have no blob/) },
      ]);
      expect(step("doctor")["blobContract"]).toEqual({
        inForce: false,
        unstored: [{ id: "manimkc:out/demo/one/one.mp4", kind: "video" }],
        unkeyed: [],
      });
      expect(step("import into a throwaway copy")["totals"]).toMatchObject({ deleted: 0 });
      expect(step("import the tree")["totals"]).toMatchObject({ deleted: 0 });
      // Courses flip without --strict: two seed items name no concept.
      expect(step("flip courses")["rulesArmed"]).toEqual([]);
      const skipped = (step("import the tree again")["skipped"] as { source: string }[]).map((s) => s.source).sort();
      expect(skipped).toEqual(["concepts", "courses", "diagrams", "sessions", "tags", "topics"]);
      expect(step("asset upload")).toMatchObject({ uploaded: 2, rowsWritten: 2, refused: 0 });
      // No ffmpeg: posters are skipped, and that is a warning, not a failure.
      expect(step("asset upload")["postersSkipped"]).toMatch(/ffmpeg was not found/);
      expect(report.steps.find((s) => s.name === "asset upload")?.warning).toMatch(/^no posters were made: ffmpeg was not found/);
      expect(report.warnings).toBe(1);
      expect(step("asset upload again")).toMatchObject({ uploaded: 0, rowsWritten: 0, refused: 0 });
      // The seed's diagram SVG, which the import stored, and the two uploads.
      expect(step("blob audit")).toMatchObject({ rows: 3, objects: 3, outstanding: 0 });
      expect(step("doctor again")["blobContract"]).toEqual({ inForce: false, unstored: [], unkeyed: [] });
      expect(step("migrate the contract")).toMatchObject({
        applied: ["0013_asset_blob_contract"],
        head: "0013_asset_blob_contract",
        held: [],
      });

      // The backup is the copy as it was before step 1, and restores as it.
      expect(report.backup).toMatchObject({ path: expect.stringMatching(new RegExp(`${name}-preflip-\\d{8}T\\d{6}Z\\.dump$`)) });
      expect(report.backup?.bytes).toBeGreaterThan(0);
      // The printed restore names the server and user on every command, since
      // the tools never read DATABASE_URL; and run as printed, with only the
      // password left in the environment, it puts the flipped copy back as it
      // was before step 1. That is the owner's way back from a failed --real.
      const server = new URL(url(name));
      const flags = [
        ...(server.hostname === "" ? [] : ["-h", decodeURIComponent(server.hostname)]),
        ...(server.port === "" ? [] : ["-p", server.port]),
        ...(server.username === "" ? [] : ["-U", decodeURIComponent(server.username)]),
      ];
      // Checked on the argument lists, which the printed line is the quoted
      // join of; running the line below is what checks the quoting.
      const commands = report.backup?.restoreArgv ?? [];
      expect(commands.map((argv) => path.basename(argv[0] ?? ""))).toEqual(["dropdb", "createdb", "pg_restore"]);
      for (const argv of commands) expect(argv.slice(1, 1 + flags.length), argv.join(" ")).toEqual(flags);
      expect(commands[2]?.slice(-3)).toEqual(["-d", name, report.backup?.path]);
      const onlyPassword = pgToolEnv();
      for (const key of ["PGHOST", "PGPORT", "PGUSER", "PGDATABASE"]) delete onlyPassword[key];
      await execFileAsync("/bin/sh", ["-c", report.backup?.restore ?? "false"], { env: onlyPassword });
      const back = new pg.Client({ connectionString: url(name) });
      await back.connect();
      try {
        const counts = await back.query<{ migrations: number; assets: number; topics: number }>(
          `select (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
                  (select count(*)::int from asset) as assets,
                  (select count(*)::int from topic) as topics`,
        );
        expect(counts.rows[0]).toEqual({ migrations: 10, assets: 1, topics: 0 });
      } finally {
        await back.end();
      }

      // The throwaway copy is gone, and the template is as it was: at 0009, no content.
      expect(await databasesLike("self_learn_preflight_%")).toEqual([]);
      const topics = await template.db.execute<{ n: number }>(sql`select count(*)::int as n from topic`);
      expect(topics.rows[0]?.n).toBe(0);
      const assets = await template.db.execute<{ n: number }>(sql`select count(*)::int as n from asset`);
      expect(assets.rows[0]?.n).toBe(1);
      const applied = await template.db.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
      expect(applied.rows[0]?.n).toBe(10);
    } finally {
      const env = pgToolEnv();
      await execFileAsync(path.join(PG_BIN, "dropdb"), ["--if-exists", "--force", name], { env });
      await rm(path.dirname(report.tree), { recursive: true, force: true });
    }
  }, 240_000);
});

describe.skipIf(!reachable.ok)("scripts/flip-rehearsal.mjs on a tree that would remove rows", () => {
  let template: Scratch;
  let work: string;
  let tree: string;
  let manimkc: string;

  beforeAll(async () => {
    template = await createScratchDatabase();
    await applyMigrations(template.db, { folder: await partialMigrations(10) });
    // Two renders recorded, and a manimkc checkout that reports only one:
    // the import would remove the other, as a worktree without the owner's
    // untracked files would remove theirs.
    await template.db.execute(sql`
      insert into asset (id, kind, path, source_repo) values
        ('manimkc:out/demo/one/one.mp4', 'video', 'out/demo/one/one.mp4', 'manimkc'),
        ('manimkc:out/demo/one/gone.mp4', 'video', 'out/demo/one/gone.mp4', 'manimkc')`);
    work = await mkdtemp(path.join(tmpdir(), "catalog-flip-rehearsal-removes-"));
    tree = path.join(work, "tree");
    await seedWithManimkc(tree);
    manimkc = path.join(work, "manimkc");
    await manimkcStandIn(manimkc, randomBytes(64));
    await aloneOn(template.name);
  }, 60_000);

  afterAll(async () => {
    await template?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  it("stops at the import into a throwaway copy, naming the row, before the copy under test is imported", async () => {
    const name = `${template.name}_removes`;
    const ran = await rehearse(["--from", template.name, "--name", name, "--tree-from", tree, "--json"], {
      MANIMKC_ROOT: manimkc,
      FFMPEG_PATH: "none",
    });
    const report = JSON.parse(ran.stdout) as Report;
    expect(ran.code).toBe(1);
    expect(report.ok).toBe(false);
    expect(report.steps.map((s) => [s.name, s.ok])).toEqual([
      ["back up the database", true],
      ["migrate", true],
      ["doctor", true],
      ["import into a throwaway copy", false],
    ]);
    expect(report.steps.at(-1)?.gist).toMatch(/^on a copy, before touching .*: the import removed 1 row\(s\).*manimkc:out\/demo\/one\/gone\.mp4/);
    // Both copies are dropped, without --keep.
    expect(report.copy).toMatchObject({ name, kept: false, dropped: true });
    expect(await databasesLike(`${name}%`)).toEqual([]);
    expect(await databasesLike("self_learn_preflight_%")).toEqual([]);
  }, 120_000);
});
