import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, beforeEach } from "vitest";

import { clearTables, migratedScratchDatabase, type Scratch } from "./scratch-database";
import { seedContent } from "./state-fixture";

/**
 * The `learn` CLI, end to end, against a scratch database and a temporary
 * knowledge base. The suites are split by subject so vitest runs them side by
 * side: `learn-cli.test.ts` (the pinned `--json` shapes),
 * `learn-cli-loop.test.ts`, `learn-cli-confidence.test.ts`,
 * `learn-cli-refusals.test.ts`, `learn-cli-diagram.test.ts` and
 * `learn-cli-files.test.ts`. Each file has its own scratch database and
 * knowledge base, made once by `learnCli` and shared by its tests, which
 * clear the learner tables before each one.
 *
 * This replaces `scripts/learn/cli.test.mjs`, which copied the pipeline into a
 * temp directory to get a temp `learn/` for free — a trick that stops working
 * when the state is a database rather than files beside the code. The CLI takes
 * `LEARN_ROOT` for the files and `DATABASE_URL` for the rest, so a run here can
 * touch neither the real `learn/` nor the real `gnosia`.
 */

export const execFileAsync = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENTRY = path.resolve(HERE, "..", "src", "learn", "cli.ts");

/** ISO instants, so a golden can be written down. */
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
export function stamp(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value).replace(ISO, "<instant>"));
}

export interface LearnCli {
  /** The file's scratch database, once its `beforeAll` has run. */
  readonly scratch: Scratch;
  /** The temporary knowledge base, `LEARN_ROOT` for every run. */
  readonly root: string;
  learn(...args: string[]): Promise<{ stdout: string; stderr: string }>;
  json<T = unknown>(...args: string[]): Promise<T>;
  /** A file used as a directory: opening it fails, for the "database is down" paths. */
  unreachableUrl(): string;
}

/**
 * The scratch database and knowledge base one test file runs the CLI
 * against, with its hooks registered in the calling `describe`: made once,
 * dropped at the end, and the learner tables cleared before each test.
 */
export function learnCli(): LearnCli {
  let scratch: Scratch;
  let root: string;

  async function learn(...args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(process.execPath, ["--import", "tsx", ENTRY, ...args], {
      env: {
        ...process.env,
        LEARN_ROOT: root,
        DATABASE_URL: scratch.url,
      },
    });
  }

  async function json<T = unknown>(...args: string[]): Promise<T> {
    const { stdout } = await learn(...args, "--json");
    return JSON.parse(stdout) as T;
  }

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);

    root = await mkdtemp(path.join(tmpdir(), "learn-cli-"));
    await mkdir(path.join(root, "learn", "concepts", "fixtures"), { recursive: true });
    // The notes have to agree with the seeded rows: the graph comes from the
    // files and the mastery from the tables, and the CLI joins them by id.
    const notes: Record<string, string> = {
      alpha: "---\nid: alpha\ntitle: Alpha\nsummary: The first one.\n---\n\n# Alpha\n",
      beta: "---\nid: beta\ntitle: Beta\nrequires: [alpha]\n---\n\n# Beta\n",
      gamma: "---\nid: gamma\ntitle: Gamma\nrequires: [beta]\n---\n\n# Gamma\n",
    };
    for (const [slug, body] of Object.entries(notes)) {
      await writeFile(path.join(root, "learn", "concepts", "fixtures", `${slug}.md`), body, "utf8");
    }
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clearTables(scratch.db, ["event", "mastery", "review", "progress", "recap", "preference"]);
  });

  return {
    get scratch() {
      return scratch;
    },
    get root() {
      return root;
    },
    learn,
    json,
    unreachableUrl: () => `${scratch.url}/child.db`,
  };
}
