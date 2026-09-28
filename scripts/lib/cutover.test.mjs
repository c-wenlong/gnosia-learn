import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { compareTrees, FINAL_TAG, makeFinalTag, tagProblems } from "./cutover.mjs";

// The cut-over's tag and its byte comparison, on throwaway repositories under
// the OS temp directory: nothing here touches the checkout the tests run in.

const git = (repo, ...args) =>
  execFileSync(
    "git",
    ["-C", repo, "-c", "user.name=test", "-c", "user.email=test@localhost", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args],
    { encoding: "utf8" },
  ).trim();

function put(root, file, text) {
  mkdirSync(join(root, file, ".."), { recursive: true });
  writeFileSync(join(root, file), text);
}

describe("the content-files-final tag", () => {
  let repo;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "cutover-tag-"));
    git(repo, "init", "-q");
    put(repo, "content/topics.yaml", "topics: []\n");
    put(repo, "learn/concepts/a/one.md", "one\n");
    put(repo, "README.md", "readme\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "files");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("tags HEAD, and says which untracked content files the tag does not hold", async () => {
    put(repo, "learn/assets/new.svg", "<svg/>");
    // An edit outside content/ and learn/ changes nothing the tag keeps.
    put(repo, "README.md", "edited\n");
    const made = await makeFinalTag(repo);
    expect(made.problem).toBeNull();
    expect(made.tag).toEqual({ name: FINAL_TAG, commit: git(repo, "rev-parse", "HEAD"), repo });
    expect(made.untracked).toEqual(["learn/assets/new.svg"]);
    expect(git(repo, "rev-parse", `${FINAL_TAG}^{commit}`)).toBe(git(repo, "rev-parse", "HEAD"));
  });

  it("refuses a HEAD other than the commit the cut-over compared", async () => {
    const compared = git(repo, "rev-parse", "HEAD");
    put(repo, "learn/concepts/a/two.md", "two\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "landed in between");
    const made = await makeFinalTag(repo, { expectedHead: compared });
    expect(made.tag).toBeNull();
    expect(made.problem).toMatch(/HEAD moved from .* since the tree was compared/);
    expect((await makeFinalTag(repo, { expectedHead: git(repo, "rev-parse", "HEAD") })).problem).toBeNull();
  });

  it("refuses when the tag exists already", async () => {
    git(repo, "tag", FINAL_TAG);
    const made = await makeFinalTag(repo);
    expect(made.tag).toBeNull();
    expect(made.problem).toMatch(/content-files-final already exists here/);
  });

  it("refuses a tracked file under content/ or learn/ that differs from HEAD", async () => {
    put(repo, "learn/concepts/a/one.md", "changed\n");
    const made = await makeFinalTag(repo);
    expect(made.tag).toBeNull();
    expect(made.problem).toMatch(/content\/ or learn\/ differs from HEAD[\s\S]*learn\/concepts\/a\/one\.md/);
    expect(() => git(repo, "rev-parse", "-q", "--verify", `refs/tags/${FINAL_TAG}`)).toThrow();
  });

  it("refuses a HEAD with no content/ left, which is a cut-over merged already", async () => {
    git(repo, "rm", "-q", "-r", "content", "learn");
    git(repo, "commit", "-q", "-m", "cut over");
    const state = await tagProblems(repo);
    expect(state.problems.join("\n")).toMatch(/has no content\/topics\.yaml/);
  });

  it("refuses a tag the remote has, and warns when the remote cannot be asked", async () => {
    const remote = mkdtempSync(join(tmpdir(), "cutover-remote-"));
    try {
      git(remote, "init", "-q", "--bare");
      git(repo, "remote", "add", "origin", remote);
      expect((await tagProblems(repo, { remote: "origin" })).problems).toEqual([]);
      git(repo, "tag", FINAL_TAG);
      git(repo, "push", "-q", "origin", FINAL_TAG);
      git(repo, "tag", "-d", FINAL_TAG);
      expect((await tagProblems(repo, { remote: "origin" })).problems).toEqual([
        `the tag ${FINAL_TAG} already exists on origin; a cut-over tags once`,
      ]);
      const unreachable = await tagProblems(repo, { remote: join(remote, "no-such-remote") });
      expect(unreachable.problems).toEqual([]);
      expect(unreachable.warnings[0]).toMatch(/could not ask/);
    } finally {
      rmSync(remote, { recursive: true, force: true });
    }
  });
});

describe("compareTrees", () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cutover-compare-"));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("sorts an export's files into identical, different and missing, and lists the tree's own", () => {
    const exported = join(root, "export");
    const tree = join(root, "tree");
    put(exported, "content/topics.yaml", "same\n");
    put(exported, "content/tags.yaml", "new bytes\n");
    put(exported, "learn/concepts/a/new.md", "only exported\n");
    put(tree, "content/topics.yaml", "same\n");
    put(tree, "content/tags.yaml", "old bytes\n");
    put(tree, "content/README.md", "the format\n");
    put(tree, "learn/map.md", "old map\n");
    put(tree, "README.md", "outside content/ and learn/, never compared\n");
    expect(compareTrees(exported, tree)).toEqual({
      compared: 3,
      identical: 1,
      differ: ["content/tags.yaml"],
      onlyInExport: ["learn/concepts/a/new.md"],
      onlyInTree: ["content/README.md", "learn/map.md"],
    });
  });
});
