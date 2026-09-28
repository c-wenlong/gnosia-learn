import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  blobRoot,
  loadEnv,
  MANIMKC_DIR,
  REPO_ROOT,
  resolveManimkcRoot,
  resolveTldrawkcRoot,
  TLDRAWKC_DIR,
} from "../src/env";
import { canvasCliPath } from "../src/index/tldr";
import { manimkcCliPath } from "../src/index/manimkc";
import { repoRoot as learnRepoRoot, workDir } from "../src/learn/paths";

/**
 * Where the two submodules are, and what says so.
 *
 * The property that matters most is the boring one: with nothing set, both
 * resolve to the paths `.gitmodules` uses. Every override below is a
 * convenience; a default that needed configuring would be a regression for
 * every clone, and CI runs with none of these variables.
 *
 * Each case sets the variable itself rather than through `services/catalog/.env`.
 * That file's precedence is `loadEnv`'s and is already the case `DATABASE_URL`
 * rests on; what is new here is the resolution of the value once it is read.
 */

const VARIABLES = ["MANIMKC_ROOT", "TLDRAWKC_ROOT", "LEARN_ROOT", "SELF_LEARN_HOME"] as const;
const original = new Map(VARIABLES.map((name) => [name, process.env[name]]));

beforeAll(() => {
  // Read services/catalog/.env now, before the first clearing. `loadEnv`
  // memoises, so after this the only thing that can put one of these back is a
  // test doing it on purpose. A developer whose real .env happens to set
  // one still gets the same assertions as CI, which sets none of them.
  loadEnv();
});

beforeEach(() => {
  for (const name of VARIABLES) delete process.env[name];
});

afterAll(() => {
  for (const [name, value] of original) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("resolveManimkcRoot and resolveTldrawkcRoot", () => {
  it("default to the submodules, with nothing configured", () => {
    expect(resolveManimkcRoot()).toBe(path.join(REPO_ROOT, MANIMKC_DIR));
    expect(resolveTldrawkcRoot()).toBe(path.join(REPO_ROOT, TLDRAWKC_DIR));
    expect(MANIMKC_DIR).toBe(path.join("tools", "manimkc"));
    expect(TLDRAWKC_DIR).toBe(path.join("tools", "tldrawkc"));
  });

  it("take an absolute path from the environment", () => {
    process.env.MANIMKC_ROOT = "/opt/checkouts/manimkc";
    process.env.TLDRAWKC_ROOT = "/opt/checkouts/tldrawkc";
    expect(resolveManimkcRoot()).toBe("/opt/checkouts/manimkc");
    expect(resolveTldrawkcRoot()).toBe("/opt/checkouts/tldrawkc");
  });

  it("resolve a relative value against the repo root, not the working directory", () => {
    // The variable is set once and read by commands run from anywhere, so a
    // cwd-relative reading would name a different folder each time.
    process.env.MANIMKC_ROOT = "../shared/manimkc";
    expect(resolveManimkcRoot("/srv/self-learn")).toBe("/srv/shared/manimkc");
  });

  it("expands a leading tilde, which a .env file cannot do for itself", () => {
    process.env.TLDRAWKC_ROOT = "~/code/tldrawkc";
    expect(resolveTldrawkcRoot()).toBe(path.join(homedir(), "code", "tldrawkc"));
  });

  it("treats an empty or whitespace-only value as unset", () => {
    // `TLDRAWKC_ROOT=` in a .env is somebody clearing the override, not asking
    // for the repo root itself.
    process.env.MANIMKC_ROOT = "";
    process.env.TLDRAWKC_ROOT = "   ";
    expect(resolveManimkcRoot()).toBe(path.join(REPO_ROOT, MANIMKC_DIR));
    expect(resolveTldrawkcRoot()).toBe(path.join(REPO_ROOT, TLDRAWKC_DIR));
  });
});

describe("blobRoot", () => {
  it("defaults to ~/.self-learn/blobs, and follows SELF_LEARN_HOME with a ~ expanded", () => {
    expect(blobRoot()).toBe(path.join(homedir(), ".self-learn", "blobs"));
    process.env["SELF_LEARN_HOME"] = "~/elsewhere";
    expect(blobRoot()).toBe(path.join(homedir(), "elsewhere", "blobs"));
    process.env["SELF_LEARN_HOME"] = "/srv/self-learn";
    expect(blobRoot()).toBe(path.join("/srv/self-learn", "blobs"));
  });

  it("refuses a relative SELF_LEARN_HOME rather than resolving it against wherever it runs", () => {
    process.env["SELF_LEARN_HOME"] = "data";
    expect(() => blobRoot()).toThrow(/absolute/);
  });
});

describe("a value that arrives through services/catalog/.env", () => {
  /**
   * The rule Greptile caught the shell expansion breaking: a root set only in
   * the dotenv has to normalise exactly as one set in the shell, and reach the
   * same resolved CLI path. Asserted against a temp file rather than the real
   * one, which is a fixed path in the repo: writing it would clobber a
   * developer's own and a crashed run would leave it behind.
   */
  async function dotenv(contents: string): Promise<void> {
    const directory = await mkdtemp(path.join(tmpdir(), "catalog-dotenv-"));
    temporary.push(directory);
    const file = path.join(directory, ".env");
    await writeFile(file, contents, "utf8");
    loadEnv(file);
  }

  const temporary: string[] = [];

  afterAll(async () => {
    for (const directory of temporary) await rm(directory, { recursive: true, force: true });
  });

  it("resolves the same as one set in the shell", async () => {
    await dotenv("TLDRAWKC_ROOT=/opt/from-dotenv/tldrawkc\n");
    expect(resolveTldrawkcRoot()).toBe("/opt/from-dotenv/tldrawkc");
    expect(canvasCliPath()).toBe(
      path.join("/opt/from-dotenv/tldrawkc", "dist", "cli", "index.js"),
    );
  });

  it("gets its tilde expanded, which no dotenv reader does for itself", async () => {
    // `process.loadEnvFile` performs no shell expansion, so this is the one
    // route by which a literal "~" can reach a path join.
    await dotenv("MANIMKC_ROOT=~/checkouts/manimkc\n");
    expect(resolveManimkcRoot()).toBe(path.join(homedir(), "checkouts", "manimkc"));
  });

  it("loses to the shell, the way DATABASE_URL does", async () => {
    process.env.MANIMKC_ROOT = "/from/the/shell";
    await dotenv("MANIMKC_ROOT=/from/the/file\n");
    expect(resolveManimkcRoot()).toBe("/from/the/shell");
  });
});

describe("the CLI paths built on them", () => {
  it("find each tool inside the configured checkout", () => {
    process.env.MANIMKC_ROOT = "/opt/manimkc";
    process.env.TLDRAWKC_ROOT = "/opt/tldrawkc";
    expect(manimkcCliPath(REPO_ROOT)).toBe(path.join("/opt/manimkc", "tools", "cli", "manimkc"));
    expect(canvasCliPath(REPO_ROOT)).toBe(path.join("/opt/tldrawkc", "dist", "cli", "index.js"));
  });

  it("fall back to the submodule under the repo root", () => {
    expect(manimkcCliPath("/srv/self-learn")).toBe(
      path.join("/srv/self-learn", "tools", "manimkc", "tools", "cli", "manimkc"),
    );
    expect(canvasCliPath("/srv/self-learn")).toBe(
      path.join("/srv/self-learn", "tools", "tldrawkc", "dist", "cli", "index.js"),
    );
  });
});

describe("LEARN_ROOT", () => {
  it("is this repo unless it is set", () => {
    expect(learnRepoRoot()).toBe(REPO_ROOT);
  });

  it("overrides the repo root, which is how the fixtures get a knowledge base", () => {
    process.env.LEARN_ROOT = "/tmp/learn-fixture";
    expect(learnRepoRoot()).toBe("/tmp/learn-fixture");
  });

  it("puts checkouts under $LEARN_ROOT/work, and refuses a LEARN_ROOT that would put them in the repository", () => {
    const saved = process.env["LEARN_WORK_DIR"];
    delete process.env["LEARN_WORK_DIR"];
    try {
      process.env.LEARN_ROOT = "/tmp/learn-fixture";
      expect(workDir()).toBe(path.join("/tmp/learn-fixture", "work"));
      process.env.LEARN_ROOT = REPO_ROOT;
      expect(() => workDir()).toThrow(/LEARN_ROOT=.* is this repository \(or inside it\)/);
      process.env.LEARN_ROOT = path.join(REPO_ROOT, "learn");
      expect(() => workDir()).toThrow(/would land in the tree/);
      // Unset, the default is a folder under the OS temp directory, never the tree.
      delete process.env.LEARN_ROOT;
      expect(path.relative(REPO_ROOT, workDir()).startsWith("..")).toBe(true);
    } finally {
      if (saved === undefined) delete process.env["LEARN_WORK_DIR"];
      else process.env["LEARN_WORK_DIR"] = saved;
    }
  });
});
