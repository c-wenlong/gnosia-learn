import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { REPO_ROOT } from "../src/env";
import { displayPath, importAuthor } from "../src/index/run";

/**
 * Who an import revision says wrote it, and how its reason names what was
 * read. Both are read long after the laptop that ran the import, so neither
 * may claim a commit the files were not at or carry a home directory.
 */

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" },
  }).trim();

describe("importAuthor", () => {
  let repo: string;
  let sha: string;

  beforeAll(async () => {
    repo = await mkdtemp(path.join(tmpdir(), "catalog-author-"));
    git(repo, "init", "-q");
    await mkdir(path.join(repo, "content"), { recursive: true });
    await writeFile(path.join(repo, "content", "topics.yaml"), "topics: []\n");
    git(repo, "add", "content");
    git(repo, "commit", "-q", "-m", "content");
    sha = git(repo, "rev-parse", "HEAD");
  });

  afterAll(async () => {
    if (repo !== undefined) await rm(repo, { recursive: true, force: true });
  });

  it("names the commit a clean tracked tree is at", () => {
    expect(importAuthor(repo)).toBe(`import:${sha}`);
  });

  it("marks a tree with local changes under content/ or learn/ as dirty", async () => {
    await mkdir(path.join(repo, "learn"), { recursive: true });
    await writeFile(path.join(repo, "learn", "new.md"), "untracked\n");
    try {
      expect(importAuthor(repo)).toBe(`import:${sha}-dirty`);
    } finally {
      await rm(path.join(repo, "learn"), { recursive: true, force: true });
    }
    expect(importAuthor(repo)).toBe(`import:${sha}`);
  });

  it("does not claim the enclosing repository's commit for an untracked folder inside it", async () => {
    const inside = path.join(repo, "scratch-export");
    await mkdir(path.join(inside, "content"), { recursive: true });
    await writeFile(path.join(inside, "content", "topics.yaml"), "topics: []\n");
    try {
      expect(importAuthor(inside)).toBe("import:unknown");
    } finally {
      await rm(inside, { recursive: true, force: true });
    }
  });

  it("is unknown outside any repository", async () => {
    const loose = await mkdtemp(path.join(tmpdir(), "catalog-author-loose-"));
    try {
      expect(importAuthor(loose)).toBe("import:unknown");
    } finally {
      await rm(loose, { recursive: true, force: true });
    }
  });
});

describe("displayPath", () => {
  it("names paths in the repository relative to it, and the repository itself in words", () => {
    expect(displayPath(REPO_ROOT)).toBe("the repository");
    expect(displayPath(path.join(REPO_ROOT, "tools", "manimkc"))).toBe("tools/manimkc");
    expect(displayPath("content/topics.yaml")).toBe("content/topics.yaml");
  });

  it("puts ~ in place of the home directory, and leaves anything else as it is", () => {
    // The repository may itself be under the home directory; a sibling of it is not in it.
    const outside = path.join(homedir(), "__catalog-display-path-test__", "export");
    expect(displayPath(outside)).toBe("~/__catalog-display-path-test__/export");
    expect(displayPath("/var/empty/export")).toBe("/var/empty/export");
  });
});
