import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  compareTrees,
  contentStatus,
  exportRewrites,
  FINAL_TAG,
  headOf,
  makeFinalTag,
  tagProblems,
  tagWorktreeProblem,
  writeHeadTree,
} from "./cutover.mjs";

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
    expect(made.tag).toEqual({ name: FINAL_TAG, commit: git(repo, "rev-parse", "HEAD"), repo, made: true });
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

  it("refuses a directory inside a checkout rather than tagging the checkout around it", async () => {
    const inner = join(repo, "learn", "concepts");
    expect((await tagProblems(inner)).problems.join("\n")).toMatch(/is not the top of a git checkout/);
    expect((await makeFinalTag(inner)).tag).toBeNull();
    expect(await headOf(inner)).toBeNull();
    expect(() => git(repo, "rev-parse", "-q", "--verify", `refs/tags/${FINAL_TAG}`)).toThrow();
  });

  it("accepts a tag already on HEAD, lightweight or annotated, and leaves it as it is", async () => {
    const head = git(repo, "rev-parse", "HEAD");
    git(repo, "tag", FINAL_TAG);
    expect((await tagProblems(repo)).tagged).toEqual({ local: head, remote: null });
    expect(await makeFinalTag(repo, { expectedHead: head })).toMatchObject({ problem: null, tag: { commit: head, made: false } });
    git(repo, "tag", "-d", FINAL_TAG);
    git(repo, "tag", "-a", FINAL_TAG, "-m", "last commit with content/ and learn/");
    const object = git(repo, "rev-parse", `refs/tags/${FINAL_TAG}`);
    const made = await makeFinalTag(repo, { expectedHead: head });
    expect(made).toMatchObject({ problem: null, tag: { name: FINAL_TAG, commit: head, made: false } });
    // Left as it was: still the annotated tag, not replaced by a lightweight one.
    expect(git(repo, "rev-parse", `refs/tags/${FINAL_TAG}`)).toBe(object);
  });

  it("refuses a tag on another commit than HEAD", async () => {
    git(repo, "tag", FINAL_TAG);
    put(repo, "learn/concepts/a/two.md", "two\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "after the tag");
    const made = await makeFinalTag(repo);
    expect(made.tag).toBeNull();
    expect(made.problem).toMatch(/content-files-final already exists here, on [0-9a-f]{12}, not on HEAD/);
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

  it("accepts the remote's tag on HEAD, annotated too, refuses it anywhere else, and warns when the remote cannot be asked", async () => {
    const remote = mkdtempSync(join(tmpdir(), "cutover-remote-"));
    try {
      git(remote, "init", "-q", "--bare");
      git(repo, "remote", "add", "origin", remote);
      expect((await tagProblems(repo, { remote: "origin" })).problems).toEqual([]);
      const tagged = git(repo, "rev-parse", "HEAD");
      // Annotated, as the owner made it: the remote's own line names the tag
      // object, and only its peeled line names the commit.
      git(repo, "tag", "-a", FINAL_TAG, "-m", "last commit with content/ and learn/");
      git(repo, "push", "-q", "origin", FINAL_TAG);
      git(repo, "tag", "-d", FINAL_TAG);
      const onHead = await tagProblems(repo, { remote: "origin" });
      expect(onHead.problems).toEqual([]);
      expect(onHead.tagged).toEqual({ local: null, remote: tagged });
      put(repo, "learn/concepts/a/two.md", "two\n");
      git(repo, "add", "-A");
      git(repo, "commit", "-q", "-m", "after the tag");
      expect((await tagProblems(repo, { remote: "origin" })).problems).toEqual([
        `the tag ${FINAL_TAG} on origin names ${tagged.slice(0, 12)}, not HEAD (${git(repo, "rev-parse", "HEAD").slice(0, 12)}): ` +
          "it would keep other files than the ones compared",
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

describe("flip day's export in the working tree", () => {
  let root;
  let repo;
  let exported;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cutover-rewrites-"));
    repo = join(root, "repo");
    exported = join(root, "export");
    mkdirSync(repo);
    git(repo, "init", "-q");
    put(repo, "content/topics.yaml", "topics: []\n");
    put(repo, "learn/concepts/a/one.md", "---\ntitle: one\nlegacy: yes\n---\none\n");
    put(repo, "learn/assets/d.tldr", '{"b":1,"a":2}\n');
    put(repo, "learn/map.md", "the old map\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "files");
    // What the database exports: the same content in its own bytes.
    put(exported, "content/topics.yaml", "topics: []\n");
    put(exported, "learn/concepts/a/one.md", "---\ntitle: one\n---\none\n");
    put(exported, "learn/assets/d.tldr", '{"a":2,"b":1}\n');
    put(exported, "learn/assets/new.tldr", "{}\n");
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const exportInto = (...files) => {
    for (const file of files) put(repo, file, readFileSync(join(exported, file), "utf8"));
  };

  it("accepts the files the export rewrote, byte for byte, and lists them", async () => {
    exportInto("learn/concepts/a/one.md", "learn/assets/d.tldr", "learn/assets/new.tldr");
    const status = await contentStatus(repo);
    expect(status.edits).toEqual([
      { status: " M", path: "learn/assets/d.tldr" },
      { status: " M", path: "learn/concepts/a/one.md" },
    ]);
    expect(status.untracked).toEqual(["learn/assets/new.tldr"]);
    expect(exportRewrites(exported, repo, status.edits)).toEqual({
      rewrites: ["learn/assets/d.tldr", "learn/concepts/a/one.md"],
      unexpected: [],
    });
    const state = await tagProblems(repo, { edits: { exportDir: exported } });
    expect(state.problems).toEqual([]);
    expect(state.rewrites).toEqual(["learn/assets/d.tldr", "learn/concepts/a/one.md"]);
    const made = await makeFinalTag(repo, { exportDir: exported });
    expect(made).toMatchObject({ problem: null, tag: { made: true }, rewrites: ["learn/assets/d.tldr", "learn/concepts/a/one.md"] });
  });

  it("refuses an edit no export writes, one in other bytes than the export's, and a deletion", async () => {
    exportInto("learn/concepts/a/one.md");
    put(repo, "learn/map.md", "edited by hand\n");
    put(repo, "learn/assets/d.tldr", '{"a":2,"b":3}\n');
    git(repo, "rm", "-q", "content/topics.yaml");
    const { edits } = await contentStatus(repo);
    const checked = exportRewrites(exported, repo, edits);
    expect(checked.rewrites).toEqual(["learn/concepts/a/one.md"]);
    expect(checked.unexpected).toEqual([
      'content/topics.yaml (git status "D": an export changes files in place, never deletes, adds or renames one)',
      "learn/assets/d.tldr (its bytes are not what the database exports)",
      "learn/map.md (no export writes this file)",
    ]);
    const made = await makeFinalTag(repo, { exportDir: exported });
    expect(made.tag).toBeNull();
    expect(made.problem).toMatch(/Only flip day's export may differ from HEAD here/);
    // Without an export to check against, every edit is refused, as before.
    expect((await makeFinalTag(repo)).problem).toMatch(/Commit them/);
  });

  it("passes edits in place for a later check when asked to, and refuses the rest at once", async () => {
    exportInto("learn/concepts/a/one.md");
    const pending = await tagProblems(repo, { edits: "pending" });
    expect(pending.problems).toEqual([]);
    expect(pending.edited).toEqual(["learn/concepts/a/one.md"]);
    git(repo, "rm", "-q", "learn/map.md");
    expect((await tagProblems(repo, { edits: "pending" })).problems.join("\n")).toMatch(/D {2}learn\/map\.md/);
  });

  it("writes HEAD's own files out, with the untracked ones beside them", async () => {
    exportInto("learn/concepts/a/one.md", "learn/assets/new.tldr");
    const out = join(root, "head");
    mkdirSync(out);
    expect(await writeHeadTree(repo, out, ["learn/assets/new.tldr"])).toBeNull();
    expect(readFileSync(join(out, "learn/concepts/a/one.md"), "utf8")).toBe("---\ntitle: one\nlegacy: yes\n---\none\n");
    expect(readFileSync(join(out, "learn/assets/new.tldr"), "utf8")).toBe("{}\n");
    expect(readFileSync(join(out, "content/topics.yaml"), "utf8")).toBe("topics: []\n");
  });
});

describe("the worktree at the tag, standing in for the script's own checkout", () => {
  let root;
  let main;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cutover-worktree-"));
    main = join(root, "main");
    mkdirSync(main);
    git(main, "init", "-q");
    put(main, "content/topics.yaml", "topics: []\n");
    git(main, "add", "-A");
    git(main, "commit", "-q", "-m", "files");
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("is accepted when it is a worktree of the same repository at the tag's commit", async () => {
    git(main, "tag", "-a", FINAL_TAG, "-m", "last commit with the files");
    put(main, "README.md", "moved on\n");
    git(main, "add", "-A");
    git(main, "commit", "-q", "-m", "the cut-over");
    const at = join(root, "files");
    git(main, "worktree", "add", "-q", at, FINAL_TAG);
    expect(await tagWorktreeProblem(main, at)).toBeNull();
  });

  it("is refused with no tag, at another commit, as a directory inside it, or as a separate clone", async () => {
    const at = join(root, "files");
    git(main, "worktree", "add", "-q", "--detach", at, "HEAD");
    expect(await tagWorktreeProblem(main, at)).toMatch(/there is no content-files-final tag/);
    put(main, "README.md", "moved on\n");
    git(main, "add", "-A");
    git(main, "commit", "-q", "-m", "after");
    git(main, "tag", FINAL_TAG);
    expect(await tagWorktreeProblem(main, at)).toMatch(/is at [0-9a-f]{12}, not at content-files-final/);
    expect(await tagWorktreeProblem(main, join(at, "content"))).toMatch(/is not the top of a git checkout/);
    const clone = join(root, "clone");
    execFileSync("git", ["clone", "-q", main, clone]);
    git(clone, "checkout", "-q", FINAL_TAG);
    expect(await tagWorktreeProblem(main, clone)).toMatch(/is not a worktree of the repository this script is in/);
    expect(await tagWorktreeProblem(main, join(root, "nowhere-" + Date.now()))).toMatch(/is not in a git checkout/);
  });
});
