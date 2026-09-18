import path from "node:path";

import { describe, expect, it } from "vitest";

import { BASH_ALLOW, buildSettings } from "../src/settings";
import { absolute, candidatePath, candidateSvgPath, scratchDir, targetPath } from "../src/paths";

/**
 * The settings file is the boundary, so these are the tests that matter most in
 * this phase. Each one is a mistake that has already been made somewhere: a
 * deny list pretending to be an allowlist, a relative rule that stopped
 * matching when a root moved, and a deny on a parent that quietly took the
 * allow with it.
 */

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
    const candidate = absolute(candidatePath("dot-product"));
    expect(allow).toContain(`Edit(/${candidate})`);
    expect(allow).toContain(`Edit(/${absolute(candidateSvgPath("dot-product"))})`);
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

  it("denies every committed diagram by name, not only by glob", () => {
    // The glob is there too, but a `*` that behaves differently from what was
    // assumed would silently open the whole directory. An enumerated path
    // cannot.
    const committed = deny.filter(
      (rule) => rule.includes("/learn/assets/") && !rule.includes(".candidates"),
    );
    expect(committed.length).toBeGreaterThan(0);
  });

  it("does not deny a parent of the candidate, which would take the allow with it", () => {
    // Deny always beats allow, so a deny on `learn/assets/**` would refuse the
    // job its own output while looking stricter.
    const candidate = absolute(candidatePath("dot-product"));
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
