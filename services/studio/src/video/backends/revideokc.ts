import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BackendJob, VideoBackend, VideoProfile } from "../backend";
import { prepareBwrap } from "../bwrap";
import { resolvedPaths } from "../checkout";
import { revideokcVideoPaths, revideokcPaths } from "../revideokc/paths";
import { buildRevideokcCheckout, scaffoldRevideokc } from "../revideokc/checkout";
import { narratedLines, revideokcClipKeys } from "../revideokc/clips";
import { runRevideokcDoctor } from "../revideokc/doctor";
import { REVIDEOKC_GATE } from "../revideokc/gate";
import { revideokcGateTools } from "../revideokc/gate-tools";
import { revideokcApiListing, revideokcManualText, revideokcPrompt } from "../revideokc/manual";
import { jobPorts } from "../revideokc/ports";
import { buildRevideokcProfile, readPorts, writePorts } from "../revideokc/sandbox";
import { buildRevideokcSettings } from "../revideokc/settings";
import { currentSourceHash, REVIDEOKC_SOURCE_PATTERN, sourceFilePaths } from "../revideokc/source";
import { discoverRevideokcToolchain, revideokcProblems, type RevideokcToolchain } from "../revideokc/toolchain";
import { revideokcWrapperConfig, writeRevideokcWrapper } from "../revideokc/wrapper";
import { resolvedStudioHome, type ProfileKind } from "../sandbox";
import { keepClips as keepClipFiles, seedClips } from "../seed";

/**
 * The revideokc backend (D75 to D79 of docs/STUDIO-VIDEO-TOOLS.md, phase 2c):
 * Revideo scenes in a synthetic revideokc checkout, voiced by gnosia-audio
 * with kokoro, rendered by headless Chrome inside the job's Seatbelt
 * profile with Chrome's own sandbox off (D76). Each part is a module under
 * `../revideokc/`, as manimkc's backend is a facade over the modules that do
 * its parts.
 */

const PROFILE_KINDS = ["render", "narrate", "gate"] as const satisfies readonly ProfileKind[];

function asRevideokc(job: BackendJob): RevideokcToolchain {
  return job.tools as RevideokcToolchain;
}

function profile(job: BackendJob, kind: ProfileKind, base: number): VideoProfile {
  const { paths, home } = job;
  const file = kind === "render" ? paths.renderProfile : kind === "narrate" ? paths.narrateProfile : paths.gateProfile;
  return { kind, file, text: buildRevideokcProfile(kind, { tools: asRevideokc(job), paths, home, studioHome: resolvedStudioHome(), base }) };
}

export const revideokcBackend: VideoBackend = {
  tool: "revideokc",
  sourcePattern: REVIDEOKC_SOURCE_PATTERN,

  toolchain: () => discoverRevideokcToolchain(),
  problems: (tools) => revideokcProblems(tools),
  paths: (jobId, slug) => revideokcVideoPaths(jobId, slug),

  // The job's port pair is chosen at setup and written beside its records;
  // the profiles are built from it, so they are the same text every time.
  profiles: (job) => PROFILE_KINDS.map((kind) => profile(job, kind, readPorts(job.paths))),

  async prepare(job) {
    await buildRevideokcCheckout(asRevideokc(job), job.paths);
    await writePorts(job.paths, await jobPorts(path.basename(job.paths.job)));
    const base = readPorts(job.paths);
    const written = PROFILE_KINDS.map((kind) => profile(job, kind, base));
    for (const each of written) await writeFile(each.file, each.text, "utf8");
    // The skeleton every bwrap profile mounts: stubs for each destination.
    if (job.tools.sandboxKind === "bwrap") await prepareBwrap(job.paths, written.map((each) => each.text));
    await mkdir(job.paths.candidate, { recursive: true });
  },

  scaffold: (job, brief, startFrom) => scaffoldRevideokc(job.paths, brief, startFrom),

  async wrapper(job, input) {
    const tools = asRevideokc(job);
    const listing = await revideokcApiListing(tools);
    const config = revideokcWrapperConfig({ tools, paths: job.paths, home: job.home, voice: job.voice, base: readPorts(job.paths), scenes: input.scenes, apiNames: listing?.names ?? [] });
    await writeRevideokcWrapper(tools.node, job.paths, config);
    return listing?.text ?? null;
  },

  async seed(job, lines, parent) {
    const keys = await revideokcClipKeys(job, lines).catch(() => [] as string[]);
    const parentClips = parent === null ? null : (await resolvedPaths(parent.jobId, parent.slug)).clips;
    return seedClips(job.paths, keys, { shared: job.tools.sharedAudioCache, parentClips });
  },

  async keepClips(job) {
    const lines = await narratedLines(job);
    const keys = await revideokcClipKeys(job, lines).catch(() => [] as string[]);
    await keepClipFiles(job.paths, keys);
  },

  manual: (wrapper, listing, paths) => revideokcManualText(wrapper, listing, paths),

  settings(job, input) {
    const tools = asRevideokc(job);
    const manimkcHome = tools.sharedAudioCache === null ? null : path.dirname(path.dirname(tools.sharedAudioCache));
    return buildRevideokcSettings({
      jobId: input.jobId,
      paths: job.paths,
      revideokcRoot: tools.revideokc.root,
      revideokcHome: tools.revideokc.ownerHome,
      manimkcRoot: tools.manimkcRoot,
      manimkcHome,
      guard: input.guard,
      ...(input.source === undefined ? {} : { source: input.source }),
    });
  },

  prompt: (request) => revideokcPrompt(request),

  gateTools: (job) => revideokcGateTools(job),

  sourceHash: (paths) => currentSourceHash(paths.topicDir),
  sourceFiles: (paths) => sourceFilePaths(paths.topicDir),
  sheets(paths, classes) {
    const own = revideokcPaths(paths);
    // The stills sheet shows every scene; the build's is rewritten by a build, which the job view counts.
    return [
      { id: "stills", title: "Stills", file: own.stillsSheet, kept: "stills.sheet.png", scenes: [...classes] },
      { id: "build", title: "The build", file: own.buildSheet, kept: `${own.stem}.sheet.png`, scenes: [] as string[] },
    ];
  },
  isSheet: (paths, file) => {
    const own = revideokcPaths(paths);
    return file === own.stillsSheet || file === own.buildSheet;
  },
  addDirs: (paths) => [paths.lib, revideokcPaths(paths).docs, paths.out, revideokcPaths(paths).stillsRoot],
  doctor: () => runRevideokcDoctor(),

  ...REVIDEOKC_GATE,
};
