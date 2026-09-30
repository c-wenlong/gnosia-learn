import { cp, writeFile } from "node:fs/promises";
import path from "node:path";

import { cacheDir } from "../../content-cache";
import type { BackendJob, VideoBackend, VideoProfile } from "../backend";
import { buildCheckout, resolvedPaths, scaffold } from "../checkout";
import { safeRead } from "../copy";
import { sandboxedGateTools } from "../gate-tools";
import { apiListing, manualText } from "../manual";
import { buildVideoPrompt, buildVideoResumePrompt, buildVideoRetryPrompt, buildVideoRevisePrompt } from "../prompt";
import { buildProfile, resolvedStudioHome, type ProfileKind } from "../sandbox";
import { scanSource, voicedLines } from "../scan";
import { clipKeys, keepClips as keepClipFiles, seedClips } from "../seed";
import { buildVideoSettings } from "../settings";
import { discoverToolchain, toolchainProblems } from "../toolchain";
import { wrapperConfig, writeWrapper } from "../wrapper";
import { MANIMKC_GATE } from "./manimkc-gate";

/**
 * The manimkc backend (D75 of docs/STUDIO-VIDEO-TOOLS.md): ManimGL scenes in
 * a synthetic manimkc checkout, voiced by kokoro, rendered under three
 * Seatbelt profiles. The design of each part is docs/STUDIO-VIDEOS.md's, D43
 * to D54.
 *
 * A facade, and deliberately nothing more: each method calls the module that
 * has always done that part (`checkout.ts`, `sandbox.ts`, `seed.ts`,
 * `wrapper.ts`, `manual.ts`, `prompt.ts`, `settings.ts`, `gate-tools.ts`),
 * with the arguments the runner used to pass it, so moving behind the
 * interface changed no profile, wrapper, settings file or prompt.
 */

const PROFILE_KINDS = ["render", "narrate", "gate"] as const satisfies readonly ProfileKind[];

function profile(job: BackendJob, kind: ProfileKind): VideoProfile {
  const { tools, paths, home } = job;
  const file = kind === "render" ? paths.renderProfile : kind === "narrate" ? paths.narrateProfile : paths.gateProfile;
  return { kind, file, text: buildProfile(kind, { tools, paths, home, studioHome: resolvedStudioHome() }) };
}

export const manimkcBackend: VideoBackend = {
  tool: "manimkc",
  // A scene module and the topic's own file, one level: the files
  // `scaffold` copies in from a start and `video put` stores.
  sourcePattern: /^[a-z0-9_]+\.py$|^topic\.yml$/,

  toolchain: () => discoverToolchain(),
  problems: (tools) => toolchainProblems(tools),
  paths: (jobId, slug) => resolvedPaths(jobId, slug),

  profiles: (job) => PROFILE_KINDS.map((kind) => profile(job, kind)),

  async prepare(job) {
    await buildCheckout(job.tools, job.paths, job.voice);
    // Each profile built and written in turn, as the runner always did.
    for (const kind of PROFILE_KINDS) {
      const written = profile(job, kind);
      await writeFile(written.file, written.text, "utf8");
    }
    // matplotlib's font cache, built once by the doctor, so no job pays the
    // ten seconds a fresh MPLCONFIGDIR costs (measured).
    await cp(path.join(cacheDir(), "video-mpl"), job.paths.mpl, { recursive: true, verbatimSymlinks: true, force: false, errorOnExist: false }).catch(() => undefined);
  },

  scaffold: (job, brief, startFrom) => scaffold(job.tools, job.paths, brief, startFrom === null ? null : { files: startFrom }),

  async wrapper(job, input) {
    const listing = await apiListing(job.tools);
    const config = wrapperConfig({ ...job, scenes: input.scenes, apiNames: listing?.names ?? [], narrated: input.narrated });
    await writeWrapper(job.tools.node, job.paths, config);
    return listing?.text ?? null;
  },

  async seed(job, lines, parent) {
    const keys = await clipKeys(job, lines).catch(() => [] as string[]);
    const parentClips = parent === null ? null : (await resolvedPaths(parent.jobId, parent.slug)).clips;
    return seedClips(job.paths, keys, { shared: job.tools.sharedAudioCache, parentClips });
  },

  async keepClips(job) {
    const source = await safeRead(job.paths.sceneFile, 2 * 2 ** 20)
      .then((body) => body.toString("utf8"))
      .catch(() => null);
    if (source === null) return;
    const scan = await scanSource(job, source).catch(() => null);
    const keys = scan === null || !scan.ok ? [] : await clipKeys(job, voicedLines(scan)).catch(() => [] as string[]);
    await keepClipFiles(job.paths, keys);
  },

  manual: (wrapper, listing) => manualText(wrapper, listing),

  settings(job, input) {
    // The owner's manimkc data root, two levels above its shared TTS cache.
    const manimkcHome = job.tools.sharedAudioCache === null ? null : path.dirname(path.dirname(job.tools.sharedAudioCache));
    return buildVideoSettings({
      jobId: input.jobId,
      paths: job.paths,
      manimkcRoot: job.tools.manimkcRoot,
      manimkcHome,
      guard: input.guard,
      ...(input.source === undefined ? {} : { source: input.source }),
    });
  },

  prompt(request) {
    switch (request.kind) {
      case "first":
        return buildVideoPrompt({
          brief: request.brief,
          paths: request.paths,
          classes: request.classes,
          ...(request.source === undefined ? {} : { source: request.source }),
          ...(request.seededNote === undefined ? {} : { seededNote: request.seededNote }),
          change: request.change,
        });
      case "retry":
        return buildVideoRetryPrompt(request.findings, request.paths);
      case "revise":
        return buildVideoRevisePrompt(request.changes, request.paths);
      case "resume":
        return buildVideoResumePrompt(request.paths);
    }
  },

  gateTools: (job) => sandboxedGateTools(job),

  ...MANIMKC_GATE,
};
