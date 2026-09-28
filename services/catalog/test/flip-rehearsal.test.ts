import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { REPO_ROOT } from "../src/env";
import { applyMigrations } from "../src/migrations";
import { partialMigrations } from "./partial-migrations";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * `scripts/flip-rehearsal.mjs`, the flip-day procedure that phase 3 runs
 * against the owner's database, run end to end against a copy.
 *
 * The template is what the owner's database is today: migrated to 0009 and
 * never flipped. The tree is the seed with one manimkc topic folder mapped,
 * and the manimkc CLI a stand-in reporting one rendered video and its
 * transcript, so the two uploads have something to store and the second has
 * nothing left to. No ffmpeg (`FFMPEG_PATH` names none), so posters are
 * skipped and said so. The script copies the template, runs every step, and
 * drops the copy; the template is read and nothing else.
 *
 * The `--real` switch is tested only for its refusals. It runs flip day
 * against the owner's database in place, and nothing here may.
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
  result: Record<string, unknown> & { [key: string]: unknown };
}

interface Report {
  mode: string;
  ok: boolean;
  copy: { name: string; method: string; kept: boolean; dropped: boolean };
  steps: Step[];
}

describe("scripts/flip-rehearsal.mjs --real refuses", () => {
  it("without --database", async () => {
    const ran = await rehearse(["--real"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--real needs --database <name>");
  });

  it("with a rehearsal's own options", async () => {
    const ran = await rehearse(["--real", "--database", "self_learn", "--keep"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--keep belong to a rehearsal");
  });

  it("without a terminal to type the name on, before it touches anything", async () => {
    // stdin is not a TTY here, as for any agent or script: there is no --yes.
    const ran = await rehearse(["--real", "--database", "self_learn_no_such_database"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("typed on a terminal");
    expect(ran.stdout).toBe("");
  });

  it("--database without --real", async () => {
    const ran = await rehearse(["--database", "self_learn"]);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("--database goes with --real");
  });
});

describe.skipIf(!reachable.ok)("scripts/flip-rehearsal.mjs on a copy", () => {
  let template: Scratch;
  let work: string;
  let tree: string;
  let manimkc: string;

  const url = (name: string) => {
    const at = new URL(process.env["DATABASE_URL"] ?? "postgres://localhost:5432/self_learn");
    at.pathname = `/${name}`;
    return at.toString();
  };

  beforeAll(async () => {
    template = await createScratchDatabase();
    // Where the owner's database is: at 0009, never flipped, no content rows.
    await applyMigrations(template.db, { folder: await partialMigrations(10) });

    work = await mkdtemp(path.join(tmpdir(), "catalog-flip-rehearsal-"));
    tree = path.join(work, "tree");
    for (const folder of ["content", "learn"]) {
      await cp(path.join(REPO_ROOT, "seed", folder), path.join(tree, folder), { recursive: true });
    }
    // One manimkc topic folder, under one of the seed's topics.
    const topics = path.join(tree, "content", "topics.yaml");
    const vocabulary = await readFile(topics, "utf8");
    const mapped = vocabulary.replace(
      /(- slug: agent-tool-use-and-reasoning-loops\n(?:.*\n)*?\s+manimkc: )\[\]/,
      "$1[demo/one]",
    );
    expect(mapped).not.toBe(vocabulary);
    await writeFile(topics, mapped);

    // A manimkc checkout whose data root holds one render and its transcript.
    manimkc = path.join(work, "manimkc");
    const out = path.join(manimkc, "out", "demo", "one");
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "one.mp4"), randomBytes(4096));
    await writeFile(path.join(out, "one.transcript.json"), JSON.stringify({ segments: [] }));
    const cli = path.join(manimkc, "tools", "cli", "manimkc");
    await mkdir(path.dirname(cli), { recursive: true });
    await writeFile(
      cli,
      [
        "#!/usr/bin/env python3",
        "import json, sys",
        'root = sys.argv[sys.argv.index("--root") + 1]',
        'if "mirrors" in sys.argv:',
        '    print(json.dumps({"outRoot": root, "destinations": {}}))',
        "else:",
        '    print(json.dumps({"outRoot": root, "topics": [{"path": "demo/one", "title": "One", "topic": None,',
        '        "out_dir": "out/demo/one", "sections": [{"section": "main", "deliverable": {',
        '        "path": "out/demo/one/one.mp4", "exists": True, "sidecars": {',
        '        "transcript": {"path": "out/demo/one/one.transcript.json", "exists": True}}}}]}],',
        '        "drift": {"orphans": [], "unrendered": []}}))',
        "",
      ].join("\n"),
    );
    await chmod(cli, 0o755);

    // `createdb -T` needs the template to have no other session.
    const admin = new pg.Client({ connectionString: url("postgres") });
    await admin.connect();
    try {
      await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()", [
        template.name,
      ]);
    } finally {
      await admin.end();
    }
  }, 60_000);

  afterAll(async () => {
    await template?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  it("runs every flip-day step on a copy of the template, then drops the copy", async () => {
    const name = `${template.name}_rehearsal`;
    const ran = await rehearse(["--from", template.name, "--name", name, "--tree-from", tree, "--json"], {
      MANIMKC_ROOT: manimkc,
      FFMPEG_PATH: "none",
    });
    const report = JSON.parse(ran.stdout) as Report;
    const failed = report.steps.find((s) => !s.ok);
    expect(failed?.gist ?? null, `${failed?.name}: ${ran.stderr}`).toBeNull();
    expect(ran.code).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.copy).toMatchObject({ name, method: "createdb -T", kept: false, dropped: true });

    // The procedure, in the plan's order.
    expect(report.steps.map((s) => s.name)).toEqual([
      "migrate",
      "doctor",
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
    ]);
    const step = (stepName: string) => report.steps.find((s) => s.name === stepName)?.result ?? {};

    expect(step("migrate")["applied"]).toEqual([
      "0010_content_expand",
      "0011_content_export_positions",
      "0012_concept_topic_not_null",
    ]);
    // Courses flip without --strict: two seed items name no concept.
    expect(step("flip courses")["rulesArmed"]).toEqual([]);
    const skipped = (step("import the tree again")["skipped"] as { source: string }[]).map((s) => s.source).sort();
    expect(skipped).toEqual(["concepts", "courses", "diagrams", "sessions", "tags", "topics"]);
    expect(step("asset upload")).toMatchObject({ uploaded: 2, rowsWritten: 2, refused: 0 });
    expect(step("asset upload")["postersSkipped"]).toMatch(/ffmpeg was not found/);
    expect(step("asset upload again")).toMatchObject({ uploaded: 0, rowsWritten: 0, refused: 0 });
    // The seed's diagram SVG, which the import stored, and the two uploads.
    expect(step("blob audit")).toMatchObject({ rows: 3, objects: 3, outstanding: 0 });

    // The copy is gone, and the template is as it was: at 0009, no content.
    const admin = new pg.Client({ connectionString: url("postgres") });
    await admin.connect();
    try {
      const copies = await admin.query("select 1 from pg_database where datname = $1", [name]);
      expect(copies.rowCount).toBe(0);
    } finally {
      await admin.end();
    }
    const topics = await template.db.execute<{ n: number }>(sql`select count(*)::int as n from topic`);
    expect(topics.rows[0]?.n).toBe(0);
    const applied = await template.db.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    expect(applied.rows[0]?.n).toBe(10);
  }, 240_000);
});
