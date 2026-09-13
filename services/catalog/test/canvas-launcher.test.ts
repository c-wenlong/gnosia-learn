import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { REPO_ROOT } from "../src/env";
import { canvasCliPath } from "../src/index/tldr";

/**
 * `npm run canvas` and the diagram indexer resolve one root, one way.
 *
 * The regression this guards is a real one that shipped in review: the script
 * was `node "${TLDRAWKC_ROOT:-tools/tldrawkc}/dist/cli/index.js"`, and shell
 * expansion cannot do what `resolveTldrawkcRoot` does. It reads only the
 * process environment, so a root set in `services/catalog/.env` reached the
 * indexer and not the tool, and it leaves a `~` that arrived inside a variable
 * as a literal directory name. The two consumers agreed only when the value
 * was absolute and exported.
 *
 * So these spawn the real `npm run canvas`, against a stub CLI at a root only
 * the resolver could have found, and assert it is the stub that ran. The
 * dotenv half of the same rule is asserted in `env.test.ts`, in process: the
 * file this reads is a fixed path in the repo, and a test that wrote it would
 * clobber a developer's own and leave it behind on a crash.
 */

/** A stand-in for tldrawkc's build: prints the arguments it got, exits 3. */
const STUB = `console.log(JSON.stringify(process.argv.slice(2)));\nprocess.exit(3);\n`;

let root: string;

function canvas(args: string[], tldrawkcRoot: string) {
  return spawnSync("npm", ["run", "--silent", "canvas", "--", ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, TLDRAWKC_ROOT: tldrawkcRoot },
  });
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "canvas-root-"));
  await mkdir(path.join(root, "dist", "cli"), { recursive: true });
  await writeFile(path.join(root, "dist", "cli", "index.js"), STUB, "utf8");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("npm run canvas", () => {
  it("runs the build under TLDRAWKC_ROOT, and forwards arguments untouched", () => {
    const result = canvas(["inspect", "a.tldr", "--json"], root);
    expect(JSON.parse(result.stdout)).toEqual(["inspect", "a.tldr", "--json"]);
  });

  it("exits with the tool's own code, so 3 still means lints remain", () => {
    // The wrapper must not flatten this: `inspect` exiting 0 is the definition
    // of a finished diagram, and a script reads the number.
    expect(canvas(["inspect", "a.tldr"], root).status).toBe(3);
  });

  it("writes nothing of its own to stdout, so --json stays parseable", () => {
    const result = canvas(["list", "--json"], root);
    expect(result.stdout).toBe('["list","--json"]\n');
  });

  it("resolves to the same path the indexer would use", () => {
    // The two entry points, one answer. `canvasCliPath` is what the indexer
    // calls, and the launcher is one line calling the same function.
    process.env.TLDRAWKC_ROOT = root;
    try {
      expect(canvasCliPath()).toBe(path.join(root, "dist", "cli", "index.js"));
    } finally {
      delete process.env.TLDRAWKC_ROOT;
    }
    expect(JSON.parse(canvas(["help"], root).stdout)).toEqual(["help"]);
  });

  it("expands a leading tilde, which the shell left literal", () => {
    // Nothing is built at this path, so the assertion is on the refusal: it
    // names an absolute path under $HOME. The shell version looked for a
    // directory called "~" beside the repo and said so.
    const result = canvas(["help"], "~/no-tldrawkc-here");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      path.join(homedir(), "no-tldrawkc-here", "dist", "cli", "index.js"),
    );
    expect(result.stderr).not.toContain("~/no-tldrawkc-here/dist");
  });

  it("names the root it was pointed at when there is no build there", () => {
    const result = canvas(["help"], path.join(root, "empty"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path.join(root, "empty", "dist", "cli", "index.js"));
    expect(result.stderr).toContain("npm run build");
  });
});
