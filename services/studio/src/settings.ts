import { readdirSync, realpathSync, type Dirent } from "node:fs";
import path from "node:path";

import { cacheDir } from "./content-cache";
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
  workDir,
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
 * 4. **A `Bash` rule is a string prefix and knows nothing about paths.** An
 *    allowed `cat` is allowed against every file on the machine, and only a
 *    `Read(...)` deny it happens to match stops it. `BASH_ALLOW` says what was
 *    done about that and why an enumerated deny list was not the answer.
 *
 * The shape is the same one manimkc's `agent.write_settings` writes, and so is
 * the reason its paths are absolute and derived at runtime: manimkc shipped
 * relative rules, its data root moved, and the rules stopped matching the files
 * they named while the agent could still read a real `.env`. No path below is
 * relative to anything but a value resolved from `REPO_ROOT` at spawn time.
 *
 * Two limits are named rather than hidden. Deny always beats allow, so a deny
 * on a parent directory would take the candidate with it and every deny here is
 * written to miss the two files the job is allowed to write, which sit in its
 * own workspace, `$STUDIO_HOME/jobs/<id>/candidate/`. And a Bash prefix
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
export function rule(tool: string, absolutePath: string, suffix = ""): string {
  return `${tool}(/${absolutePath}${suffix})`;
}

/**
 * The Bash allowlist: one command prefix, and everything else denied.
 *
 * This is the correction the design's first draft needed, and a review caught
 * it twice. A deny list over `rm`, `mv`, `git` and the network tools does not
 * constrain Bash at all, because a shell redirect, `cp`, `tee`, `printf >`,
 * `sed -i` or `python3` writes anywhere in the tree and the file allowlist has
 * no say over any of it. An allowlist inverts the default: a command that
 * matches nothing here reaches no approval surface in a `-p` session and is
 * refused, and a compound command is split on `&&`, `||`, `;`, `|` and a
 * newline with every part matched independently, so a second command cannot
 * ride along behind the first.
 *
 * **`cat`, `head`, `ls` and `wc` used to be here and are not any more**, which
 * is the fourth thing phase 1 found by checking the CLI. A Bash rule is a
 * string prefix and carries no idea of a path, so `Bash(cat:*)` allows `cat`
 * against *any* file. Two mechanisms partly cover that and neither is enough.
 * `Read(...)` deny rules do reach a file command the CLI recognises — `cat`,
 * `head`, `tail`, `sed`, `tee` and a redirect's target — so the secret denies
 * below were doing real work; but a deny list only ever names what somebody
 * thought of, and a token in a dotfile nobody enumerated was one `cat` away.
 * And `blockReadsOutsideWorkingDirectories` only removes those commands'
 * read-only auto-approval, which an explicit allow rule then grants back.
 *
 * So the file reading goes through the Read tool instead, which is the one
 * mechanism here that is genuinely path-matched: it is checked against the
 * `Read(...)` rules below and confined to the working directories, which are
 * the repository and this job's scratch. The agent loses nothing — it was
 * already told to Read its screenshots rather than `cat` them, because looking
 * at a picture is the point — and the boundary stops depending on an
 * enumeration being complete.
 *
 * `npm run --silent canvas` carries `--silent` because npm prints a two-line
 * banner otherwise and `--json` output is then unparseable. It is in the rule
 * rather than only in the prompt, so the call that works is the call that is
 * spelled correctly.
 */
export const BASH_ALLOW = ["Bash(npm run --silent canvas:*)"] as const;

/**
 * Not only belt and braces any more.
 *
 * Most of these are already denied by not being on the allowlist, and they are
 * written down because a future edit that widens the allowlist — an `npx`, a
 * `sh -c`, a `docker exec` — would otherwise re-open a hole quietly.
 *
 * The file readers at the top are load-bearing rather than decorative. A
 * compound command is split and each part matched, but a **command
 * substitution** is not split, so `npm run --silent canvas -- run x --code
 * "$(cat ~/.aws/credentials)"` matches the allowed prefix as one string. Deny
 * rules are the half of the matcher that does reach inside a substitution, a
 * subshell and a control-flow body, so naming `cat`, `head`, `ls` and `wc`
 * here is what closes that route rather than a note about it.
 */
export const BASH_DENY = [
  "Bash(cat:*)",
  "Bash(head:*)",
  "Bash(tail:*)",
  "Bash(ls:*)",
  "Bash(wc:*)",
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
  /** The diagram slug: with the job id, the two candidate paths are derived from it. */
  slug: string;
  /** A concept note the agent may read, repo-relative, from the brief. */
  source?: string;
}

/**
 * Build the settings for one job.
 *
 * `readdirSync` on `learn/assets/` is deliberate and is the narrowed clean-room
 * rule: every diagram file still in the tree is denied by its own absolute
 * path, so the agent cannot lift an existing document. Globs are there too, for
 * a file that appears after the settings are written, but the enumerated paths
 * are what does not depend on how the matcher treats a `*`. The same walk over
 * `$STUDIO_HOME` denies everything the runner keeps there except this job's
 * own workspace: the checkouts, the cache and every other job. A job queued
 * after this file is written is not in any walk, so the other jobs are also
 * denied by globs that match every id but this one (`siblingJobRules`).
 */
export function buildSettings(input: SettingsInput): AgentSettings {
  const home = process.env.HOME ?? "";
  const candidate = candidatePath(input.jobId, input.slug);
  const candidateSvg = candidateSvgPath(input.jobId, input.slug);
  const scratch = scratchDir(input.jobId);

  const allow = [
    ...BASH_ALLOW,
    // The two files this job exists to write, named exactly, and not the
    // directory they sit in. `Edit` and not `Write`: the CLI checks a file
    // write against Edit rules, and a Write rule would be accepted and ignored.
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
    // The checkouts: every diagram in the database as a file, the mirror's
    // document among them. The same clean-room rule, now that the committed
    // corpus is materialised here rather than under learn/assets/.
    rule("Read", workDir(), "/**"),
    rule("Edit", workDir(), "/**"),
    // The cache: the last topic list and diagram list the runner read. Not a
    // secret, but not the agent's either, and the diagram list names every
    // diagram's blob.
    rule("Read", cacheDir(), "/**"),
    rule("Edit", cacheDir(), "/**"),
    // Anything else the runner keeps beside `jobs/`, by name, so a directory
    // added there later is denied without anyone remembering to add it here.
    ...studioHomeRules(),
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
    // The CLI's default temp root, where its scratchpad would be if
    // `CLAUDE_CODE_TMPDIR` did not move it into the job.
    ...claudeTempRules(),
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

/** Every diagram file in the tree, denied by name. Missing directory means none. */
function committedAssetRules(): string[] {
  // Every child, dot entries included: nothing the agent writes lives here any
  // more, so there is no directory to leave reachable. That takes in a
  // `.candidates/` still holding a job from before candidates moved.
  return denyEach(absolute(ASSETS_DIR), () => true);
}

/** Read and Edit denies on each entry of `directory` that `keep` selects, a directory with its contents. */
function denyEach(directory: string, keep: (name: string) => boolean): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const rules: string[] = [];
  for (const entry of entries) {
    if (!keep(entry.name)) continue;
    const target = path.join(directory, entry.name);
    rules.push(rule("Read", target), rule("Edit", target));
    if (entry.isDirectory()) rules.push(rule("Read", target, "/**"), rule("Edit", target, "/**"));
  }
  return rules;
}

/**
 * Every entry directly under `$STUDIO_HOME` except `jobs/`, which is walked
 * job by job below, because this job's own workspace is in there and a deny
 * on the parent would take its candidate and scratch with it.
 */
export function studioHomeRules(): string[] {
  return denyEach(studioHome(), (name) => name !== "jobs");
}

/**
 * The claude CLI's per-user temp root, `/tmp/claude-<uid>/`, denied whole.
 *
 * Every session there has a scratchpad, `<root>/<cwd>/<session>/scratchpad/`,
 * which its system prompt advertises, and the CLI allows any write into the
 * current session's scratchpad on its own authority: no allow rule, no working
 * directory, and `--permission-prompts none` does not stop it. A real job used
 * it on 2026-09-29. Measured on 2.1.274, the edit check reads `Edit(...)` deny
 * rules first and reaches the scratchpad allowance only after them, so a deny
 * here does refuse it; a `Write(...)` deny would not, for the reason at the top
 * of this file. The CLI has no flag that turns the scratchpad off: it is on
 * whenever a server-side gate or the artifact tool's eligibility says so.
 *
 * `agentEnv` moves the root into the job with `CLAUDE_CODE_TMPDIR`, which is
 * the actual fix. These rules are for a CLI that stops reading that variable:
 * the scratchpad would come back at the default root, and a refusal there is
 * better than a write nobody notices. Both spellings of the root are named,
 * the literal one and the resolved one (`/private/tmp` on macOS), since the
 * CLI resolves the root before it builds the path. A root that holds
 * `STUDIO_HOME` or the repository is left out, because deny beats allow and
 * the job's own candidate would go with it.
 */
export function claudeTempRules(): string[] {
  const uid = process.getuid?.() ?? 0;
  const bases = ["/tmp", process.env.CLAUDE_CODE_TMPDIR?.trim()].filter(
    (base): base is string => base !== undefined && base !== "",
  );
  const guarded = [studioHome(), REPO_ROOT];
  const roots = new Set<string>();
  for (const base of bases) {
    const root = path.join(path.resolve(base), `claude-${uid}`);
    // Both spellings go, or neither: the CLI resolves a path before matching
    // it, so dropping only `/tmp/…` would leave `/private/tmp/…` denying the
    // job's candidate all the same.
    if (guarded.some((dir) => contains(root, dir) || contains(resolved(root), resolved(dir)))) continue;
    roots.add(root);
    roots.add(resolved(root));
  }
  return [...roots].flatMap((root) => [rule("Read", root, "/**"), rule("Edit", root, "/**")]);
}

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** `target` with its deepest existing ancestor's symlinks resolved; the rest, which does not exist yet, as written. */
function resolved(target: string): string {
  const absoluteTarget = path.resolve(target);
  let existing = absoluteTarget;
  for (;;) {
    try {
      return path.join(realpathSync(existing), path.relative(existing, absoluteTarget));
    } catch {
      const parent = path.dirname(existing);
      if (parent === existing) return absoluteTarget;
      existing = parent;
    }
  }
}

/**
 * The alphabet of a job id: `randomUUID()` in the runner, lower-case hex and
 * dashes. The globs below are built over it, so a character outside it in a
 * sibling's name is covered only by the walk, never by a glob.
 */
const JOB_ID_ALPHABET = "0123456789abcdef-";

/**
 * Every other job's workspace, including a job enqueued after this one started.
 *
 * Two halves. The walk denies each job directory present at spawn by its own
 * name, whatever that name is. The globs cover the rest: the runner writes this
 * file once, when the agent starts, and a job queued while it runs creates a
 * workspace no enumerated rule names. With the default `STUDIO_HOME` inside the
 * repository that workspace is inside a working directory, so without a glob
 * the running agent could read the new job's records and candidate.
 *
 * A glob cannot say "every job but mine", because deny beats allow and the
 * matcher has no negated character class (it follows the gitignore rules, where
 * `[!x]` is a class holding `!` and `x`). So "not my id" is spelled out
 * position by position: a name that shares the first `i` characters of this id
 * and differs at character `i` matches `jobs/<prefix>[<every other
 * character>]*`. One pattern per position covers every id of this length or
 * longer that is not this one, and a last pattern covers a name that extends
 * this id. None of them matches this job's own directory, which the test
 * checks with the same matcher the CLI uses.
 */
export function siblingJobRules(jobId: string): string[] {
  const jobs = path.join(studioHome(), "jobs");
  const rules: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(jobs);
  } catch {
    // No jobs directory yet: nothing to enumerate, and the globs still apply.
  }
  for (const entry of entries) {
    if (entry === jobId) continue;
    const directory = path.join(jobs, entry);
    rules.push(rule("Read", directory, "/**"), rule("Edit", directory, "/**"));
  }
  for (const pattern of otherJobPatterns(jobId)) {
    const glob = path.join(jobs, pattern);
    rules.push(rule("Read", glob, "/**"), rule("Edit", glob, "/**"));
  }
  return rules;
}

/**
 * Directory-name globs matching every job id except `jobId`.
 *
 * Exported for the test, which runs them through the gitignore matcher. An id
 * holding a character that means something to that matcher gets no globs at
 * all, only the walk: escaping inside a gitignore pattern is too easy to get
 * subtly wrong for a rule whose failure is silent, and the runner's ids never
 * hold one.
 */
export function otherJobPatterns(jobId: string): string[] {
  if (!/^[A-Za-z0-9._-]+$/.test(jobId)) return [];
  const patterns: string[] = [];
  for (let i = 0; i < jobId.length; i += 1) {
    const mine = jobId.charAt(i).toLowerCase();
    const others = [...JOB_ID_ALPHABET].filter((character) => character !== mine);
    patterns.push(`${jobId.slice(0, i)}[${characterClass(others)}]*`);
  }
  patterns.push(`${jobId}?*`);
  return patterns;
}

/** A bracket body for these characters, with the dash last so it is literal. */
function characterClass(characters: string[]): string {
  const dash = characters.includes("-");
  return `${characters.filter((character) => character !== "-").join("")}${dash ? "-" : ""}`;
}
