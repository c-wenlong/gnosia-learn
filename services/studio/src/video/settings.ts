import { realpathSync } from "node:fs";
import path from "node:path";

import { cacheDir } from "../content-cache";
import { REPO_ROOT, studioHome, workDir } from "../paths";
import { BASH_DENY, claudeTempRules, rule, siblingJobRules, studioHomeRules, type AgentSettings } from "../settings";
import { guardHooks } from "./bash-guard";
import type { VideoPaths } from "./paths";

/**
 * The video agent's permission file (docs/STUDIO-VIDEOS.md, "What the video
 * agent can and cannot do"). Built by the diagram agent's rule builders and
 * passed with the same seals (`--setting-sources ""`, `--strict-mcp-config`
 * with an empty config, `--permission-prompts none`, no bare tool name).
 *
 * What differs from the diagram agent:
 *
 * - **Bash** allows exactly one prefix, this job's wrapper by its absolute
 *   path, plus the diagram agent's deny list. On top of both, a `PreToolUse`
 *   hook (`bash-guard.ts`) refuses any command that is not the wrapper with
 *   plain words after it, so no pipe, list or substitution depends on how
 *   the CLI's matcher splits a command.
 * - **Edit** allows the scene file and nothing else. `topic.yml` is the
 *   runner's and the gate checks it; `lib/` is a copy the render reads, not a
 *   place to fix things.
 * - **Read** covers the working directory (the topic folder), the checkout's
 *   `lib/` copy and `render/out/` (the sheets), which are the session's two
 *   `--add-dir`s, and the brief's source note. With
 *   `blockReadsOutsideWorkingDirectories` on, nothing else is readable: the
 *   diagram agent runs from the repository root, the video agent does not.
 * - Everything the diagram agent is denied, plus the real manimkc checkout's
 *   `topics/` and the owner's `MANIMKC_HOME` (the clean-room rule), this
 *   job's own records, profiles and wrapper.
 *
 * This file governs the agent's tools only. What the agent's Python does
 * once it runs is the sandbox's (D44).
 */

/** A path and its resolved spelling, when they differ: the CLI matches either. */
function spellings(target: string): string[] {
  let real = target;
  try {
    real = realpathSync(target);
  } catch {
    /* not there yet: the one spelling */
  }
  return [...new Set([target, real])];
}

export interface VideoSettingsInput {
  jobId: string;
  paths: VideoPaths;
  /** The real manimkc checkout, whose `topics/` is the clean-room rule. */
  manimkcRoot: string;
  /** The owner's manimkc data root, read by nobody but the runner's seeding. */
  manimkcHome: string | null;
  /** An absolute path to the brief's source note, when there is one. */
  source?: string;
  /** The Bash guard's command line, from `writeGuard`. */
  guard: string;
}

export interface VideoAgentSettings extends AgentSettings {
  hooks: Record<string, unknown>;
}

export function buildVideoSettings(input: VideoSettingsInput): VideoAgentSettings {
  const { paths } = input;
  const home = process.env.HOME ?? "";

  const allow = [
    `Bash(${paths.wrapper}:*)`,
    rule("Edit", paths.sceneFile),
    rule("Read", paths.topicDir, "/**"),
    rule("Read", paths.lib, "/**"),
    rule("Read", paths.out, "/**"),
    ...(input.source === undefined ? [] : [rule("Read", input.source)]),
  ];

  const deny = [
    "WebFetch",
    "WebSearch",
    ...BASH_DENY,
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
    rule("Read", path.join(home, ".cache", "huggingface"), "/**"),
    // The runner's parts of the topic folder and the checkout.
    rule("Edit", paths.topicYml),
    rule("Edit", paths.lib, "/**"),
    rule("Edit", paths.render, "/**"),
    // This job's records, profiles and wrapper: not the agent's to read or rewrite.
    ...[paths.bin, paths.inflight, paths.candidate, paths.source, paths.clips, paths.rejected].flatMap((dir) => [rule("Read", dir, "/**"), rule("Edit", dir, "/**")]),
    ...[
      paths.calls,
      paths.reads,
      paths.brief,
      paths.settings,
      paths.renderProfile,
      paths.narrateProfile,
      paths.gateProfile,
      path.join(paths.job, "job.json"),
      path.join(paths.job, "session.ndjson"),
      path.join(paths.job, "gate.json"),
      path.join(paths.render, ".env"),
    ].flatMap((file) => [rule("Read", file), rule("Edit", file)]),
    // The clean-room rule: no other video, the owner's or the studio's.
    ...spellings(path.join(input.manimkcRoot, "topics")).flatMap((dir) => [rule("Read", dir, "/**"), rule("Edit", dir, "/**")]),
    ...(input.manimkcHome === null ? [] : spellings(input.manimkcHome).flatMap((dir) => [rule("Read", dir, "/**"), rule("Edit", dir, "/**")])),
    rule("Read", workDir(), "/**"),
    rule("Edit", workDir(), "/**"),
    rule("Read", cacheDir(), "/**"),
    rule("Edit", cacheDir(), "/**"),
    ...studioHomeRules(),
    ...siblingJobRules(input.jobId),
    // The same two families again under the resolved home, when STUDIO_HOME sits behind a link.
    ...(spellings(studioHome())[1] === undefined
      ? []
      : siblingJobRules(input.jobId).map((entry) => entry.replace(studioHome(), realpathSync(studioHome())))),
    rule("Edit", path.join(REPO_ROOT, ".git"), "/**"),
    ...claudeTempRules(),
  ];

  return {
    permissions: {
      defaultMode: "default",
      blockReadsOutsideWorkingDirectories: true,
      allow,
      deny: [...new Set(deny)],
    },
    hooks: guardHooks(input.guard),
  };
}
