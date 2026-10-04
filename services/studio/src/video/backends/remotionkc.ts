import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BackendJob, VideoBackend, VideoProfile } from "../backend";
import { resolvedPaths } from "../checkout";
import { jobPorts, readPorts, writePorts } from "../ports";
import { buildRemotionkcCheckout, scaffoldRemotionkc } from "../remotionkc/checkout";
import { narratedLines, remotionkcClipKeys } from "../remotionkc/clips";
import { runRemotionkcDoctor } from "../remotionkc/doctor";
import { REMOTIONKC_GATE } from "../remotionkc/gate";
import { remotionkcGateTools } from "../remotionkc/gate-tools";
import { remotionkcApiListing, remotionkcManualText, remotionkcPrompt } from "../remotionkc/manual";
import { remotionkcPaths, remotionkcVideoPaths } from "../remotionkc/paths";
import { buildRemotionkcProfile } from "../remotionkc/sandbox";
import { buildRemotionkcSettings } from "../remotionkc/settings";
import { currentSourceHash, REMOTIONKC_SOURCE_PATTERN } from "../remotionkc/source";
import { discoverRemotionkcToolchain, remotionkcProblems, type RemotionkcToolchain } from "../remotionkc/toolchain";
import { remotionkcWrapperConfig, writeRemotionkcWrapper } from "../remotionkc/wrapper";
import { resolvedStudioHome, type ProfileKind } from "../sandbox";
import { keepClips as keepClipFiles, seedClips } from "../seed";
import { sourceFilePaths } from "../source-set";

/**
 * The remotionkc backend (phase 3 of docs/STUDIO-VIDEO-TOOLS.md, D80):
 * Remotion compositions in a synthetic remotionkc checkout, voiced by
 * gnosia-audio with kokoro, bundled by webpack and rendered by Remotion's
 * Chrome Headless Shell inside the job's Seatbelt profile. Each part is a
 * module under `../remotionkc/`, as revideokc's backend is a facade over
 * `../revideokc/`; what the two TypeScript tools share (the job's port
 * pair, the source set and its hash, the gate's steps 1 to 3 and 10, the
 * parse, the hostile probe) is in `../ports.ts`, `../source-set.ts`,
 * `../ts-gate.ts`, `../ts-parse.ts` and `../hostile-probe.ts`.
 */

const PROFILE_KINDS = ["render", "narrate", "gate"] as const satisfies readonly ProfileKind[];

function asRemotionkc(job: BackendJob): RemotionkcToolchain {
  return job.tools as RemotionkcToolchain;
}

function profile(job: BackendJob, kind: ProfileKind, base: number): VideoProfile {
  const { paths, home } = job;
  const file = kind === "render" ? paths.renderProfile : kind === "narrate" ? paths.narrateProfile : paths.gateProfile;
  return { kind, file, text: buildRemotionkcProfile(kind, { tools: asRemotionkc(job), paths, home, studioHome: resolvedStudioHome(), base }) };
}

export const remotionkcBackend: VideoBackend = {
  tool: "remotionkc",
  sourcePattern: REMOTIONKC_SOURCE_PATTERN,

  toolchain: () => discoverRemotionkcToolchain(),
  problems: (tools) => remotionkcProblems(tools),
  paths: (jobId, slug) => remotionkcVideoPaths(jobId, slug),

  // The job's port pair is chosen at setup and written beside its records;
  // the profiles are built from it, so they are the same text every time.
  profiles: (job) => PROFILE_KINDS.map((kind) => profile(job, kind, readPorts(job.paths))),

  async prepare(job) {
    await buildRemotionkcCheckout(asRemotionkc(job), job.paths);
    await writePorts(job.paths, await jobPorts(path.basename(job.paths.job)));
    const base = readPorts(job.paths);
    for (const kind of PROFILE_KINDS) {
      const written = profile(job, kind, base);
      await writeFile(written.file, written.text, "utf8");
    }
    await mkdir(job.paths.candidate, { recursive: true });
  },

  scaffold: (job, brief, startFrom) => scaffoldRemotionkc(job.paths, brief, startFrom),

  async wrapper(job, input) {
    const tools = asRemotionkc(job);
    const listing = await remotionkcApiListing(tools);
    const config = remotionkcWrapperConfig({ tools, paths: job.paths, home: job.home, voice: job.voice, base: readPorts(job.paths), scenes: input.scenes, apiNames: listing?.names ?? [] });
    await writeRemotionkcWrapper(tools.node, job.paths, config);
    return listing?.text ?? null;
  },

  async seed(job, lines, parent) {
    const keys = await remotionkcClipKeys(job, lines).catch(() => [] as string[]);
    const parentClips = parent === null ? null : (await resolvedPaths(parent.jobId, parent.slug)).clips;
    return seedClips(job.paths, keys, { shared: job.tools.sharedAudioCache, parentClips });
  },

  async keepClips(job) {
    const lines = await narratedLines(job);
    const keys = await remotionkcClipKeys(job, lines).catch(() => [] as string[]);
    await keepClipFiles(job.paths, keys);
  },

  manual: (wrapper, listing, paths) => remotionkcManualText(wrapper, listing, paths),

  settings(job, input) {
    const tools = asRemotionkc(job);
    const manimkcHome = tools.sharedAudioCache === null ? null : path.dirname(path.dirname(tools.sharedAudioCache));
    return buildRemotionkcSettings({
      jobId: input.jobId,
      paths: job.paths,
      remotionkcRoot: tools.remotionkc.root,
      remotionkcHome: tools.remotionkc.ownerHome,
      manimkcRoot: tools.manimkcRoot,
      manimkcHome,
      guard: input.guard,
      ...(input.source === undefined ? {} : { source: input.source }),
    });
  },

  prompt: (request) => remotionkcPrompt(request),

  gateTools: (job) => remotionkcGateTools(job),

  sourceHash: (paths) => currentSourceHash(paths.topicDir),
  sourceFiles: (paths) => sourceFilePaths(paths.topicDir),
  sheets(paths, classes) {
    const own = remotionkcPaths(paths);
    // The stills sheet shows every scene; the build's is rewritten by a build, which the job view counts.
    return [
      { id: "stills", title: "Stills", file: own.stillsSheet, kept: "stills.sheet.png", scenes: [...classes] },
      { id: "build", title: "The build", file: own.buildSheet, kept: `${own.stem}.sheet.png`, scenes: [] as string[] },
    ];
  },
  isSheet: (paths, file) => {
    const own = remotionkcPaths(paths);
    return file === own.stillsSheet || file === own.buildSheet;
  },
  addDirs: (paths) => [paths.lib, remotionkcPaths(paths).docs, paths.out, remotionkcPaths(paths).stillsRoot],
  doctor: () => runRemotionkcDoctor(),

  ...REMOTIONKC_GATE,
};
