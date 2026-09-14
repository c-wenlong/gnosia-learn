import { readdirSync } from "node:fs";
import path from "node:path";

import {
  absolute,
  candidatePath,
  candidateSvgPath,
  jobJsonPath,
  scratchDir,
  sessionLogPath,
  settingsPath,
  studioHome,
  targetPath,
  targetSvgPath,
  ASSETS_DIR,
  REPO_ROOT,
} from "./paths";

/**
 * The per-job permission file. This is the primary control, not the prompt.
 *
 * Everything here was checked against the CLI rather than assumed, because
 * three of its rules are counter-intuitive and each one, got wrong, silently
 * removes the boundary:
 *
 * 1. **A bare tool name allows every use of that tool.** `Bash` as an allow
 *    rule matches every command, so passing `--allowedTools Bash` would make an
 *    allowlist of command prefixes decorative. Nothing here, and nothing on the
 *    command line, ever names a tool without a pattern.
 * 2. **File writes are matched against `Edit(path)` rules, never `Write(path)`.**
 *    The CLI accepts a `Write(...)` path rule and never consults it, so a file
 *    allowlist written that way reads as careful and permits nothing — which
 *    looks the same as working until the agent cannot write its own candidate.
 * 3. **`permissions.allow` merges across settings sources rather than being
 *    overridden by the most specific one.** A rule in this machine's
 *    `~/.claude/settings.json` would be added to this file's, so the runner
 *    passes `--setting-sources ""` and this file is the only source of rules
 *    the session has.
 *
 * The shape is the same one manimkc's `agent.write_settings` writes, and so is
 * the reason its paths are absolute and derived at runtime: manimkc shipped
 * relative rules, its data root moved, and the rules stopped matching the files
 * they named while the agent could still read a real `.env`. No path below is
 * relative to anything but a value resolved from `REPO_ROOT` at spawn time.
 *
 * Two limits are named rather than hidden. Deny always beats allow, so a deny
 * on a parent directory would take the candidate with it and every deny here is
 * written to miss the two files the job is allowed to write. And a Bash prefix
 * rule is not a sandbox: the CLI's own documentation says so, `canvas run`
 * takes an output path as an argument, and an OS-level filesystem sandbox is
 * the only thing that closes that. It is in the design's known gaps and it is
 * still open.
 */

export interface AgentSettings {
  permissions: {
    defaultMode: "default";
    /** Reads outside the working directories are refused in every mode. */
    blockReadsOutsideWorkingDirectories: true;
    allow: string[];
    deny: string[];
  };
}

/**
 * A rule for an absolute path.
 *
 * The leading double slash is the CLI's syntax for "anchored at the filesystem
 * root". A single slash anchors at the settings file's own directory instead,
 * which for a per-job settings file is the job workspace — so the obvious
 * spelling would silently write a rule about the wrong place.
 */
function rule(tool: string, absolutePath: string, suffix = ""): string {
  return `${tool}(/${absolutePath}${suffix})`;
}

/**
 * The Bash allowlist: five command prefixes, and everything else denied.
 *
 * This is the correction the design's first draft needed, and a review caught
 * it once already. A deny list over `rm`, `mv`, `git` and the network tools
 * does not constrain Bash at all, because a shell redirect, `cp`, `tee`,
 * `printf >`, `sed -i` or `python3` writes anywhere in the tree and the file
 * allowlist has no say over any of it. An allowlist inverts the default: a
 * command that matches nothing here reaches no approval surface in a `-p`
 * session and is refused.
 *
 * `npm run --silent canvas` carries `--silent` because npm prints a two-line
 * banner otherwise and `--json` output is then unparseable. It is in the rule
 * rather than only in the prompt, so the call that works is the call that is
 * spelled correctly.
 */
export const BASH_ALLOW = [
  "Bash(npm run --silent canvas:*)",
  "Bash(cat:*)",
  "Bash(ls:*)",
  "Bash(head:*)",
  "Bash(wc:*)",
] as const;

/**
 * Belt and braces, not the boundary.
 *
 * Every one of these is already denied by not being on the allowlist. They are
 * written down because a future edit that widens the allowlist — an `npx`, a
 * `sh -c`, a `docker exec` — would otherwise re-open a hole quietly, and
 * because the CLI's matcher normalises some wrappers away, so naming the
 * wrappers is the only way a reader learns they exist.
 */
export const BASH_DENY = [
  "Bash(sh:*)",
  "Bash(bash:*)",
  "Bash(zsh:*)",
  "Bash(env:*)",
  "Bash(eval:*)",
  "Bash(exec:*)",
  "Bash(npx:*)",
  "Bash(node:*)",
  "Bash(python:*)",
  "Bash(python3:*)",
  "Bash(perl:*)",
  "Bash(ruby:*)",
  "Bash(git:*)",
  "Bash(rm:*)",
  "Bash(mv:*)",
  "Bash(cp:*)",
  "Bash(tee:*)",
  "Bash(dd:*)",
  "Bash(ln:*)",
  "Bash(chmod:*)",
  "Bash(sed:*)",
  "Bash(awk:*)",
  "Bash(find:*)",
  "Bash(xargs:*)",
  "Bash(curl:*)",
  "Bash(wget:*)",
  "Bash(nc:*)",
  "Bash(ncat:*)",
  "Bash(ssh:*)",
  "Bash(scp:*)",
  "Bash(sftp:*)",
  "Bash(rsync:*)",
  "Bash(setsid:*)",
  "Bash(nohup:*)",
  "Bash(docker:*)",
  "Bash(osascript:*)",
  "Bash(open:*)",
] as const;

export interface SettingsInput {
  jobId: string;
  /** The diagram slug: the two candidate paths are derived from it. */
  slug: string;
  /** A concept note the agent may read, repo-relative, from the brief. */
  source?: string;
}

/**
 * Build the settings for one job.
 *
 * `readdirSync` on `learn/assets/` is deliberate and is the narrowed clean-room
 * rule: every committed diagram is denied by its own absolute path, so the
 * agent cannot lift an existing document and cannot reach the file its own
 * candidate will one day replace. Globs are there too, for a file that appears
 * after the settings are written, but the enumerated paths are what does not
 * depend on how the matcher treats a `*`.
 */
export function buildSettings(input: SettingsInput): AgentSettings {
  const home = process.env.HOME ?? "";
  const candidate = absolute(candidatePath(input.slug));
  const candidateSvg = absolute(candidateSvgPath(input.slug));
  const scratch = scratchDir(input.jobId);

  const allow = [
    ...BASH_ALLOW,
    // The two files this job exists to write, and nothing else under
    // learn/assets/. `Edit` and not `Write`: the CLI checks a file write
    // against Edit rules, and a Write rule would be accepted and ignored.
    rule("Edit", candidate),
    rule("Edit", candidateSvg),
    rule("Read", candidate),
    rule("Read", candidateSvg),
    // Snippets, screenshots, and a mermaid source it was handed.
    rule("Edit", scratch, "/**"),
    rule("Read", scratch, "/**"),
  ];
  if (input.source !== undefined) {
    // The one note the clean-room rule lets it read: the concept this diagram
    // is about. Named by the brief, so it is a path the person chose.
    allow.push(rule("Read", absolute(input.source)));
  }

  const deny = [
    // Whole tools off. A bare name as a deny rule removes the tool from the
    // session rather than refusing it per call.
    "WebFetch",
    "WebSearch",
    ...BASH_DENY,
    // Secrets. Bare-name rules match at any depth, which is what catches the
    // dotenv in a workspace nobody thought about.
    "Read(.env)",
    "Read(.env.local)",
    "Read(.env.production)",
    "Read(*.pem)",
    "Read(id_rsa)",
    "Edit(.env)",
    "Edit(.env.local)",
    rule("Read", path.join(home, ".claude"), "/**"),
    rule("Read", path.join(home, ".claude.json")),
    rule("Read", path.join(home, ".ssh"), "/**"),
    rule("Read", path.join(home, ".aws"), "/**"),
    rule("Read", path.join(home, ".gnupg"), "/**"),
    rule("Read", path.join(home, ".netrc")),
    // The committed corpus: the clean-room rule, and the target itself.
    ...committedAssetRules(),
    rule("Read", absolute(targetPath(input.slug))),
    rule("Edit", absolute(targetPath(input.slug))),
    rule("Read", absolute(targetSvgPath(input.slug))),
    rule("Edit", absolute(targetSvgPath(input.slug))),
    rule("Read", absolute(`${ASSETS_DIR}/*.tldr`)),
    rule("Edit", absolute(`${ASSETS_DIR}/*.tldr`)),
    rule("Read", absolute(`${ASSETS_DIR}/*.svg`)),
    rule("Edit", absolute(`${ASSETS_DIR}/*.svg`)),
    // Git's own directory. `Bash(git:*)` is denied above; this is the other way
    // in. The runner runs no mutating git command either, and D6 says why.
    rule("Edit", path.join(REPO_ROOT, ".git"), "/**"),
    // Its own record. The runner's write-ahead log and this very file are not
    // the agent's to read or rewrite; manimkc denies its own state directory
    // for the same reason.
    rule("Read", jobJsonPath(input.jobId)),
    rule("Edit", jobJsonPath(input.jobId)),
    rule("Read", sessionLogPath(input.jobId)),
    rule("Edit", sessionLogPath(input.jobId)),
    rule("Read", settingsPath(input.jobId)),
    rule("Edit", settingsPath(input.jobId)),
    // Every other job's workspace, walked rather than denied as a parent:
    // a deny on the jobs directory would take this job's own scratch with it,
    // because deny beats allow.
    ...siblingJobRules(input.jobId),
  ];

  return {
    permissions: {
      defaultMode: "default",
      blockReadsOutsideWorkingDirectories: true,
      allow,
      deny,
    },
  };
}

/** Every committed diagram, denied by name. Missing directory means none yet. */
function committedAssetRules(): string[] {
  let entries: string[];
  try {
    entries = readdirSync(absolute(ASSETS_DIR));
  } catch {
    return [];
  }
  const rules: string[] = [];
  for (const entry of entries) {
    // `.candidates` is the one child that is not a committed asset, and it is
    // the directory the allow rules above point into.
    if (entry.startsWith(".")) continue;
    const file = absolute(`${ASSETS_DIR}/${entry}`);
    rules.push(rule("Read", file), rule("Edit", file));
  }
  return rules;
}

/** The other jobs' workspaces, by name, so this job's scratch stays reachable. */
function siblingJobRules(jobId: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(path.join(studioHome(), "jobs"));
  } catch {
    return [];
  }
  const rules: string[] = [];
  for (const entry of entries) {
    if (entry === jobId) continue;
    const directory = path.join(studioHome(), "jobs", entry);
    rules.push(rule("Read", directory, "/**"), rule("Edit", directory, "/**"));
  }
  return rules;
}
