import { realpathSync } from "node:fs";
import path from "node:path";

import { cacheDir } from "../../content-cache";
import { REPO_ROOT, studioHome, workDir } from "../../paths";
import { BASH_DENY, claudeTempRules, rule, siblingJobRules, studioHomeRules } from "../../settings";
import { guardHooks } from "../bash-guard";
import type { VideoPaths } from "../paths";
import type { VideoAgentSettings } from "../settings";
import { revideokcPaths } from "./paths";
import { portsFile } from "./sandbox";

/**
 * A revideokc job's permission file: manimkc's (`../settings.ts`), with the
 * files a revideokc topic is made of.
 *
 * - **Edit** allows `scene.tsx`, `narration.json` and any `.ts` or `.tsx`
 *   directly in the topic folder (the agent may add a file beside the scene
 *   and import it), and nothing else. `topic.yml`, the checkout's copies and
 *   `render/` are the runner's.
 * - **Read** covers the topic folder (the working directory), the checkout's
 *   `lib/` and `docs/` copies, and the renders the agent looks at
 *   (`render/out/` and `render/stills/`), which are the session's
 *   `--add-dir`s, and the brief's source note.
 * - The clean-room rule names the real revideokc checkout's `topics/` and the
 *   owner's revideokc data root, and manimkc's too (its clip cache seeds a
 *   job, read by the runner and nobody else).
 * - The same Bash prefix and the same `PreToolUse` guard as manimkc's.
 *
 * What the agent's TypeScript does in Chrome is the sandbox's (D76).
 */

function spellings(target: string): string[] {
  let real = target;
  try {
    real = realpathSync(target);
  } catch {
    /* not there yet */
  }
  return [...new Set([target, real])];
}

export interface RevideokcSettingsInput {
  jobId: string;
  paths: VideoPaths;
  /** The real revideokc checkout, whose `topics/` is the clean-room rule. */
  revideokcRoot: string;
  /** The owner's revideokc data root, when it is not the checkout. */
  revideokcHome: string | null;
  manimkcRoot: string;
  manimkcHome: string | null;
  source?: string;
  guard: string;
}

export function buildRevideokcSettings(input: RevideokcSettingsInput): VideoAgentSettings {
  const { paths } = input;
  const own = revideokcPaths(paths);
  const home = process.env.HOME ?? "";

  const allow = [
    `Bash(${paths.wrapper}:*)`,
    rule("Edit", paths.sceneFile),
    rule("Edit", own.narration),
    rule("Edit", paths.topicDir, "/*.ts"),
    rule("Edit", paths.topicDir, "/*.tsx"),
    rule("Read", paths.topicDir, "/**"),
    rule("Read", paths.lib, "/**"),
    rule("Read", own.docs, "/**"),
    rule("Read", paths.out, "/**"),
    rule("Read", own.stillsRoot, "/**"),
    ...(input.source === undefined ? [] : [rule("Read", input.source)]),
  ];

  const cleanRoom = [
    path.join(input.revideokcRoot, "topics"),
    ...(input.revideokcHome === null ? [] : [input.revideokcHome]),
    path.join(input.manimkcRoot, "topics"),
    ...(input.manimkcHome === null ? [] : [input.manimkcHome]),
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
    rule("Edit", own.docs, "/**"),
    rule("Edit", path.join(paths.checkout, "src"), "/**"),
    rule("Edit", path.join(paths.checkout, "tools"), "/**"),
    rule("Edit", path.join(paths.checkout, "tsconfig.json")),
    rule("Edit", path.join(paths.checkout, "package.json")),
    rule("Edit", paths.render, "/**"),
    // This job's records, profiles and wrapper.
    ...[paths.bin, paths.inflight, paths.candidate, paths.source, paths.clips, paths.rejected].flatMap((dir) => [rule("Read", dir, "/**"), rule("Edit", dir, "/**")]),
    ...[
      paths.calls,
      paths.reads,
      paths.brief,
      paths.settings,
      paths.renderProfile,
      paths.narrateProfile,
      paths.gateProfile,
      portsFile(paths),
      path.join(paths.job, "job.json"),
      path.join(paths.job, "session.ndjson"),
      path.join(paths.job, "gate.json"),
    ].flatMap((file) => [rule("Read", file), rule("Edit", file)]),
    // The clean-room rule: no other video, the owner's or the studio's.
    ...cleanRoom.flatMap((dir) => spellings(dir).flatMap((spelled) => [rule("Read", spelled, "/**"), rule("Edit", spelled, "/**")])),
    rule("Read", workDir(), "/**"),
    rule("Edit", workDir(), "/**"),
    rule("Read", cacheDir(), "/**"),
    rule("Edit", cacheDir(), "/**"),
    ...studioHomeRules(),
    ...siblingJobRules(input.jobId),
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
