import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import ignore from "ignore";
import { afterAll, describe, expect, it } from "vitest";

import { BASH_ALLOW, buildSettings, claudeTempRules, otherJobPatterns } from "../src/settings";
import { cacheDir } from "../src/content-cache";
import {
  absolute,
  candidateDir,
  candidatePath,
  candidateSvgPath,
  jobDir,
  scratchDir,
  targetPath,
  workDir,
} from "../src/paths";

/**
 * The settings file is the boundary, so these are the tests that matter most in
 * this phase. Each one is a mistake that has already been made somewhere: a
 * deny list pretending to be an allowlist, a relative rule that stopped
 * matching when a root moved, and a deny on a parent that quietly took the
 * allow with it.
 */

// A STUDIO_HOME of this file's own, holding what a runner's holds: this job,
// another job, the checkouts, the cache, and something added later.
const home = mkdtempSync(path.join(tmpdir(), "studio-settings-"));
process.env.STUDIO_HOME = home;
for (const dir of ["jobs/job-1/candidate", "jobs/job-other/candidate", "work", "cache", "state"]) {
  mkdirSync(path.join(home, dir), { recursive: true });
}
// A tree that still holds the old per-slug directory, in the test's own
// repository root (a temp farm, see vitest.setup.ts), never the checkout.
mkdirSync(absolute("learn/assets/.candidates"), { recursive: true });
afterAll(() => {
  delete process.env.STUDIO_HOME;
  rmSync(home, { recursive: true, force: true });
});

const settings = buildSettings({ jobId: "job-1", slug: "dot-product" });
const allow = settings.permissions.allow;
const deny = settings.permissions.deny;

describe("the Bash rules are an allowlist", () => {
  it("allows exactly one command prefix, the canvas launcher", () => {
    const bash = allow.filter((rule) => rule.startsWith("Bash("));
    expect(bash).toEqual([...BASH_ALLOW]);
    expect(bash).toEqual(["Bash(npm run --silent canvas:*)"]);
  });

  it("allows no command that reads a file, because a Bash rule cannot name a path", () => {
    // `Bash(cat:*)` is a string prefix with no idea of a path, so it allows
    // `cat` against every file on the machine and only a `Read(...)` deny it
    // happens to match stops it — which makes the boundary an enumeration of
    // secrets somebody remembered. File reading goes through the Read tool
    // instead, which is matched against paths and confined to the working
    // directories.
    for (const command of ["cat", "head", "tail", "ls", "wc", "grep", "less", "od", "strings"]) {
      expect(allow.some((rule) => rule.startsWith(`Bash(${command}`))).toBe(false);
    }
  });

  it("denies the file readers by name, because a command substitution is not split", () => {
    // A compound command is split on `&&`, `;` and `|` and each part matched,
    // but `npm run --silent canvas -- run x --code "$(cat ~/.aws/credentials)"`
    // is one string that matches the allowed prefix. Deny rules are the half of
    // the matcher that reaches inside a substitution, so these are the rule
    // that closes it rather than a note about it.
    for (const command of ["cat", "head", "tail", "ls", "wc"]) {
      expect(deny).toContain(`Bash(${command}:*)`);
    }
  });

  it("never allows a bare tool name, which would match every use of it", () => {
    // `Bash` without parentheses matches every command, so a single bare name
    // anywhere in the allow list makes the prefixes above decorative.
    for (const rule of allow) {
      expect(rule).toMatch(/^[A-Za-z]+\(.+\)$/);
    }
  });

  it("does not allow cp, tee, or anything that could take a redirect's place", () => {
    // The three the design names, plus the interpreters that make a redirect
    // unnecessary. A deny list over these would not have been enough; their
    // absence from the allowlist is what refuses them.
    for (const command of ["cp", "tee", "python3", "sh", "bash", "npx", "node", "mv", "rm", "dd"]) {
      expect(allow.some((rule) => rule.startsWith(`Bash(${command}`))).toBe(false);
    }
  });

  it("has no rule that would permit a shell redirect", () => {
    // A redirect's target is checked against the Edit rules, and those name two
    // files and one directory. Nothing in the allowlist mentions a shell
    // operator, and nothing spawns a shell that could interpret one.
    for (const rule of allow) {
      expect(rule).not.toMatch(/[>|&;]/);
    }
  });

  it("keeps the dangerous commands on the deny list as well, as belt and braces", () => {
    for (const command of ["cp", "tee", "git", "rm", "curl", "python3"]) {
      expect(deny).toContain(`Bash(${command}:*)`);
    }
  });
});

describe("every path rule is absolute and derived at runtime", () => {
  it("writes file rules as Edit, because a Write path rule is never consulted", () => {
    const candidate = candidatePath("job-1", "dot-product");
    expect(allow).toContain(`Edit(/${candidate})`);
    expect(allow).toContain(`Edit(/${candidateSvgPath("job-1", "dot-product")})`);
    expect(allow.some((rule) => rule.startsWith("Write("))).toBe(false);
  });

  it("anchors every path at the filesystem root, with the double slash", () => {
    for (const rule of [...allow, ...deny]) {
      const match = /^[A-Za-z]+\((.+)\)$/.exec(rule);
      if (match === null) continue;
      const target = match[1] ?? "";
      // Three shapes are legal: an absolute path (`//…`), a bare name that
      // gitignore semantics match at any depth (`.env`), and a Bash prefix.
      if (rule.startsWith("Bash(")) continue;
      if (!target.startsWith("/")) {
        expect(target).not.toContain("/");
        continue;
      }
      expect(target.startsWith("//")).toBe(true);
    }
  });

  it("hardcodes no home directory", () => {
    const home = process.env.HOME ?? "";
    // The home-anchored denies are built from `process.env.HOME` at call time,
    // which is the bug manimkc shipped and fixed: a literal path denies nothing
    // on any machine but the one it was written on.
    expect(deny.some((rule) => rule.includes(path.join(home, ".claude")))).toBe(true);
    expect(JSON.stringify(settings)).not.toContain("/Users/you");
    expect(JSON.stringify(settings)).not.toContain("/home/");
  });

  it("blocks reads outside the working directories", () => {
    expect(settings.permissions.blockReadsOutsideWorkingDirectories).toBe(true);
  });
});

describe("the committed corpus is out of reach", () => {
  it("denies the target the job will one day replace", () => {
    const target = absolute(targetPath("dot-product"));
    expect(deny).toContain(`Edit(/${target})`);
    expect(deny).toContain(`Read(/${target})`);
  });

  it("denies the checkouts, where every diagram in the database is a file", () => {
    // The mirror's document and every other diagram live under
    // $STUDIO_HOME/work/ since Track D: the clean-room rule reaches them there.
    expect(deny).toContain(`Read(/${workDir()}/**)`);
    expect(deny).toContain(`Edit(/${workDir()}/**)`);
  });

  it("denies every committed diagram by name, not only by glob", () => {
    // The glob is there too, but a `*` that behaves differently from what was
    // assumed would silently open the whole directory. An enumerated path
    // cannot.
    const committed = deny.filter((rule) => rule.includes("/learn/assets/") && !rule.includes("*"));
    expect(committed.length).toBeGreaterThan(0);
  });

  it("does not deny a parent of the candidate, which would take the allow with it", () => {
    // Deny always beats allow, so a deny on `learn/assets/**` would refuse the
    // job its own output while looking stricter.
    const candidate = candidatePath("job-1", "dot-product");
    for (const rule of deny) {
      const match = /^[A-Za-z]+\(\/(.+?)(\/\*\*)?\)$/.exec(rule);
      if (match === null) continue;
      const target = match[1] ?? "";
      if (!target.startsWith("/")) continue;
      if (match[2] === "/**") {
        expect(candidate.startsWith(`${target}/`)).toBe(false);
      }
    }
  });

  it("does not deny the job's own scratch directory", () => {
    const scratch = scratchDir("job-1");
    expect(deny.some((rule) => rule.includes(`${scratch}/**`))).toBe(false);
    expect(allow).toContain(`Edit(/${scratch}/**)`);
  });
});

describe("the candidate lives in the job's own workspace", () => {
  it("allows exactly this job's two candidate files, read and edit, and not their directory", () => {
    const tldr = candidatePath("job-1", "dot-product");
    const svg = candidateSvgPath("job-1", "dot-product");
    expect(path.dirname(tldr)).toBe(path.join(jobDir("job-1"), "candidate"));
    for (const file of [tldr, svg]) {
      expect(allow).toContain(`Edit(/${file})`);
      expect(allow).toContain(`Read(/${file})`);
    }
    expect(allow.some((rule) => rule.includes(`${candidateDir("job-1")}/**`))).toBe(false);
    // Nothing under learn/ is writable any more.
    expect(allow.some((rule) => rule.includes("/learn/assets"))).toBe(false);
  });

  it("denies another job's workspace, its candidate included", () => {
    const other = jobDir("job-other");
    expect(deny).toContain(`Read(/${other}/**)`);
    expect(deny).toContain(`Edit(/${other}/**)`);
    expect(allow.some((rule) => rule.includes(other))).toBe(false);
    // And the same rule from the other side: job-other's file allows are not job-1's.
    const theirs = buildSettings({ jobId: "job-other", slug: "dot-product" });
    expect(theirs.permissions.allow).toContain(`Edit(/${candidatePath("job-other", "dot-product")})`);
    expect(theirs.permissions.deny).toContain(`Edit(/${jobDir("job-1")}/**)`);
  });

  it("denies a job enqueued after this one started, and never this job's own workspace", () => {
    // The settings are written once, at spawn. A job queued while the agent
    // runs has a workspace no enumerated rule names, so only the globs stand
    // between the agent and its records. They go through the matcher the CLI
    // uses (node-ignore, gitignore rules); a CLI run against 2.1.274 read the
    // sibling's job.json without them and was refused with them.
    const own = randomUUID();
    const rules = buildSettings({ jobId: own, slug: "dot-product" }).permissions.deny;
    const prefix = `Read(/${path.join(home, "jobs")}/`;
    const globs = rules.filter((rule) => rule.startsWith(prefix) && /[[?]/.test(rule)).map((rule) => `jobs/${rule.slice(prefix.length, -1)}`);
    expect(globs.length).toBe(own.length + 1);
    const matcher = ignore().add(globs);
    for (const mine of ["candidate/dot-product.tldr", "candidate/dot-product.svg", "scratch/snippet.js", "scratch/shots/after.png"]) {
      expect(matcher.ignores(`jobs/${own}/${mine}`), mine).toBe(false);
    }
    for (let i = 0; i < 500; i += 1) {
      const later = randomUUID();
      expect(matcher.ignores(`jobs/${later}/job.json`), later).toBe(true);
      expect(matcher.ignores(`jobs/${later}/candidate/dot-product.tldr`), later).toBe(true);
    }
    // One character off at every position, and a name that extends this one.
    for (let i = 0; i < own.length; i += 1) {
      const swapped = own.charAt(i) === "0" ? "1" : "0";
      const near = `${own.slice(0, i)}${own.charAt(i) === "-" ? "a" : swapped}${own.slice(i + 1)}`;
      expect(matcher.ignores(`jobs/${near}/job.json`), near).toBe(true);
    }
    expect(matcher.ignores(`jobs/${own}.old/job.json`)).toBe(true);
    expect(rules).toContain(`Edit(/${path.join(home, "jobs", otherJobPatterns(own)[0] ?? "")}/**)`);
  });

  it("gives an id the matcher would read as a pattern no globs, only the walk", () => {
    expect(otherJobPatterns("job[1]")).toEqual([]);
    expect(otherJobPatterns("job-1")).toHaveLength("job-1".length + 1);
  });

  it("denies the rest of STUDIO_HOME: the checkouts, the cache, and anything added later", () => {
    expect(deny).toContain(`Read(/${workDir()}/**)`);
    expect(deny).toContain(`Read(/${cacheDir()}/**)`);
    expect(deny).toContain(`Edit(/${cacheDir()}/**)`);
    expect(deny).toContain(`Read(/${path.join(home, "state")}/**)`);
    // But never the jobs directory as a whole, which would take this job's own with it.
    expect(deny.some((rule) => rule.includes(`${path.join(home, "jobs")}/**`))).toBe(false);
  });

  it("denies a leftover learn/assets/.candidates as a whole, since no job writes there", () => {
    const legacy = absolute("learn/assets/.candidates");
    expect(deny).toContain(`Read(/${legacy}/**)`);
    expect(deny).toContain(`Edit(/${legacy}/**)`);
  });
});

describe("the network is off", () => {
  it("removes WebFetch and WebSearch as whole tools", () => {
    expect(deny).toContain("WebFetch");
    expect(deny).toContain("WebSearch");
  });

  it("denies the shell's own network clients too", () => {
    for (const command of ["curl", "wget", "nc", "ssh", "scp", "rsync"]) {
      expect(deny).toContain(`Bash(${command}:*)`);
    }
  });
});

describe("the source note", () => {
  it("is readable only when the brief named one", () => {
    const without = buildSettings({ jobId: "job-2", slug: "dot-product" });
    expect(without.permissions.allow.some((rule) => rule.startsWith("Read(") && rule.includes("concepts"))).toBe(false);

    const withSource = buildSettings({
      jobId: "job-2",
      slug: "dot-product",
      source: "learn/concepts/foundations/dot-product.md",
    });
    expect(withSource.permissions.allow).toContain(
      `Read(/${absolute("learn/concepts/foundations/dot-product.md")})`,
    );
  });
});

describe("the CLI's own scratchpad", () => {
  // The CLI keeps a scratchpad per session under `<root>/claude-<uid>/`, where
  // the root is `CLAUDE_CODE_TMPDIR` or `/tmp`, and allows every write into it
  // without reading an allow rule. `agentEnv` moves the root into the job; these
  // denies are for a CLI that stops honouring the variable.
  const uid = process.getuid?.() ?? 0;

  it("denies the default temp root whole, under both of its spellings", () => {
    for (const root of [`/tmp/claude-${uid}`, path.join(realpathSync("/tmp"), `claude-${uid}`)]) {
      expect(deny).toContain(`Read(/${root}/**)`);
      expect(deny).toContain(`Edit(/${root}/**)`);
    }
  });

  it("writes the deny as Edit, which the CLI reads before its scratchpad allowance", () => {
    // Measured on 2.1.274: a Write into the scratchpad under this rule came back
    // "File is in a directory that is denied by your permission settings".
    expect(deny.some((rule) => rule.startsWith("Write("))).toBe(false);
  });

  it("never denies a root the job's own workspace sits in", () => {
    // Deny beats allow, so a root holding STUDIO_HOME would take the candidate
    // with it. A runner whose STUDIO_HOME is under its own temp root keeps the
    // /tmp deny and drops that one.
    const base = mkdtempSync(path.join(tmpdir(), "studio-claude-tmp-"));
    const root = path.join(realpathSync(base), `claude-${uid}`);
    process.env.CLAUDE_CODE_TMPDIR = base;
    process.env.STUDIO_HOME = path.join(root, "studio");
    try {
      const rules = claudeTempRules();
      expect(rules).toContain(`Edit(//tmp/claude-${uid}/**)`);
      expect(rules.some((rule) => rule.includes(root))).toBe(false);

      process.env.STUDIO_HOME = home;
      expect(claudeTempRules()).toContain(`Edit(/${root}/**)`);
    } finally {
      delete process.env.CLAUDE_CODE_TMPDIR;
      process.env.STUDIO_HOME = home;
      rmSync(base, { recursive: true, force: true });
    }
  });
});
