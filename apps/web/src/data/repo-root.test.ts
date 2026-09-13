import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { findRepoRoot, REPO_ROOT } from "./repo-root";

/**
 * The walk that finds `content/`.
 *
 * Worth its own test because the failure it guards against is invisible in
 * development: `process.cwd()` is the repository root under vitest and under
 * `next build` run from the root, and `apps/web/` only in the two cases nobody
 * runs by hand — a build started in the app directory, and a deployment.
 */

const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "repo-root-")));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("findRepoRoot", () => {
  it("returns the directory itself when the content tree is right there", () => {
    const root = path.join(scratch, "here");
    mkdirSync(path.join(root, "content", "courses"), { recursive: true });
    expect(findRepoRoot(root)).toBe(root);
  });

  it("climbs out of a nested workspace to the directory holding content/", () => {
    const root = path.join(scratch, "monorepo");
    mkdirSync(path.join(root, "content", "courses"), { recursive: true });
    const app = path.join(root, "apps", "web");
    mkdirSync(app, { recursive: true });
    expect(findRepoRoot(app)).toBe(root);
  });

  it("refuses by name rather than climbing past the filesystem root", () => {
    const orphan = path.join(scratch, "orphan");
    mkdirSync(orphan, { recursive: true });
    expect(() => findRepoRoot(orphan)).toThrow(/No content\/courses directory/);
  });

  it("resolves this repository from the process the tests run in", () => {
    expect(REPO_ROOT).toBe(findRepoRoot(process.cwd()));
  });
});
