import { homedir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  loadEnv,
  MANIMKC_DIR,
  REPO_ROOT,
  resolveManimkcRoot,
  resolveTldrawkcRoot,
  TLDRAWKC_DIR,
} from "../src/env";
import { canvasCliPath } from "../src/index/tldr";
import { manimkcCliPath } from "../src/index/manimkc";
import { repoRoot as learnRepoRoot } from "../src/learn/paths";

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

const VARIABLES = ["MANIMKC_ROOT", "TLDRAWKC_ROOT", "LEARN_ROOT"] as const;
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
});
