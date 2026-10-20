import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { REPO_ROOT } from "../src/paths";
import { jobWorkspacePath } from "../src/diagram/review";

/**
 * The A4 backstop leaves the studio's own paths out of `git status`. Only the
 * default `.studio/` is gitignored, so a `STUDIO_HOME` set to another folder
 * in the checkout would otherwise fail every job on its own candidate.
 */
const before = process.env.STUDIO_HOME;
afterEach(() => {
  if (before === undefined) delete process.env.STUDIO_HOME;
  else process.env.STUDIO_HOME = before;
});

describe("jobWorkspacePath", () => {
  it("leaves out a STUDIO_HOME inside the checkout, and nothing beside it", () => {
    process.env.STUDIO_HOME = path.join(REPO_ROOT, "tmp", "studio");
    expect(jobWorkspacePath("tmp/studio/jobs/abc/candidate/dot-product.tldr")).toBe(true);
    expect(jobWorkspacePath("tmp/studio/")).toBe(true);
    expect(jobWorkspacePath("tmp/other.txt")).toBe(false);
    expect(jobWorkspacePath("tmp/")).toBe(false);
    expect(jobWorkspacePath("tmp/studiox/file")).toBe(false);
    expect(jobWorkspacePath("apps/web/src/app/page.tsx")).toBe(false);
  });

  it("leaves out nothing for a STUDIO_HOME outside the checkout", () => {
    process.env.STUDIO_HOME = path.join(path.dirname(REPO_ROOT), "elsewhere-studio");
    expect(jobWorkspacePath("apps/web/src/app/page.tsx")).toBe(false);
    expect(jobWorkspacePath("elsewhere-studio/jobs/x")).toBe(false);
  });

  it("still leaves out the old candidates directory a legacy record names", () => {
    expect(jobWorkspacePath("learn/assets/.candidates/dot-product.tldr")).toBe(true);
    expect(jobWorkspacePath("learn/assets/.candidates/")).toBe(true);
    expect(jobWorkspacePath("learn/assets/dot-product.tldr")).toBe(false);
  });
});
