import path from "node:path";

import { jobDir } from "../paths";

import type { ProfileKind } from "./sandbox";

/**
 * Every path a video job uses, built here (layering rule 5: one module
 * resolves paths, and every one is absolute).
 *
 * The workspace (D46 of docs/STUDIO-VIDEOS.md):
 *
 *   jobs/<id>/
 *     job.json, session.ndjson, brief.json   the runner's records
 *     agent-settings.json                    the permission file
 *     calls.ndjson                           one line per wrapper call, the wrapper's
 *     inflight/<pid>.json                    a wrapper call that has started and not ended
 *     reads.ndjson                           every sheet Read the stream showed, the runner's
 *     bin/video                              the wrapper
 *     render.sb, narrate.sb, gate.sb         the three sandbox profiles (Seatbelt)
 *     render.bwrap.json, …                   the same three on Linux (bwrap argv)
 *     sandbox-root/, sandbox-empty/          the bwrap skeleton rootfs and the
 *       sandbox-empty-file                   read-only shadows it mounts
 *     checkout/                              a synthetic manimkc checkout, MANIMKC_ROOT
 *       topics/studio/<slug>/<module>.py     the one file the agent edits
 *     render/                                MANIMKC_HOME, the only place a render writes
 *     candidate/                             the gate's copies, which Accept uploads
 *     source/                                the final source, kept after a verdict
 *     clips/                                 the final lines' clips, kept after a verdict
 *
 * manimkc's `new` names the scene file after the slug with its hyphens made
 * underscores (a Python module name), and the deliverable after the file, so
 * `module` is that spelling and `slug` the video's own.
 */

export const STUDIO_DOMAIN = "studio";

/** `attention-weights` → `attention_weights`: the scene file's and the deliverable's name. */
export function moduleOf(slug: string): string {
  return slug.replaceAll("-", "_");
}

export interface VideoPaths {
  job: string;
  bin: string;
  wrapper: string;
  calls: string;
  inflight: string;
  reads: string;
  brief: string;
  settings: string;
  renderProfile: string;
  narrateProfile: string;
  gateProfile: string;
  /**
   * The directory a Linux profile mounts read-only at `/`, one stub per mount
   * point, and the empty directory and file it mounts over a denied place.
   * Only the bwrap backend builds them; on macOS the three are named but
   * never created.
   */
  sandboxRoot: string;
  sandboxEmpty: string;
  sandboxEmptyFile: string;
  checkout: string;
  lib: string;
  topicDir: string;
  sceneFile: string;
  topicYml: string;
  render: string;
  renderTmp: string;
  mpl: string;
  manimBase: string;
  manimCache: string;
  audio: string;
  out: string;
  outTopic: string;
  scenes: string;
  deliverable: string;
  transcript: string;
  chapters: string;
  vtt: string;
  candidate: string;
  candidateSource: string;
  copies: string;
  poster: string;
  source: string;
  clips: string;
  rejected: string;
  /** The agent's TMPDIR and the CLI's scratchpad root: the same `tmp/` a diagram job has. */
  tmp: string;
}

/** A profile's file name on this machine: Seatbelt text on macOS, a bwrap argv on Linux (V4). */
function profileName(kind: ProfileKind): string {
  return process.platform === "linux" ? `${kind}.bwrap.json` : `${kind}.sb`;
}

export function videoPaths(jobId: string, slug: string): VideoPaths {
  const job = jobDir(jobId);
  const moduleName = moduleOf(slug);
  const checkout = path.join(job, "checkout");
  const render = path.join(job, "render");
  const topicDir = path.join(checkout, "topics", STUDIO_DOMAIN, slug);
  const outTopic = path.join(render, "out", STUDIO_DOMAIN, slug);
  const candidate = path.join(job, "candidate");
  const sandboxRoot = path.join(job, "sandbox-root");
  return {
    job,
    bin: path.join(job, "bin"),
    wrapper: path.join(job, "bin", "video"),
    calls: path.join(job, "calls.ndjson"),
    inflight: path.join(job, "inflight"),
    reads: path.join(job, "reads.ndjson"),
    brief: path.join(job, "brief.json"),
    settings: path.join(job, "agent-settings.json"),
    renderProfile: path.join(job, profileName("render")),
    narrateProfile: path.join(job, profileName("narrate")),
    gateProfile: path.join(job, profileName("gate")),
    sandboxRoot,
    sandboxEmpty: path.join(job, "sandbox-empty"),
    sandboxEmptyFile: path.join(job, "sandbox-empty-file"),
    checkout,
    lib: path.join(checkout, "lib"),
    topicDir,
    sceneFile: path.join(topicDir, `${moduleName}.py`),
    topicYml: path.join(topicDir, "topic.yml"),
    render,
    renderTmp: path.join(render, "tmp"),
    mpl: path.join(render, "mpl"),
    manimBase: path.join(render, "manim"),
    manimCache: path.join(render, "manim-cache"),
    audio: path.join(render, "cache", "audio"),
    out: path.join(render, "out"),
    outTopic,
    scenes: path.join(outTopic, "scenes"),
    deliverable: path.join(outTopic, `${moduleName}.mp4`),
    transcript: path.join(outTopic, `${moduleName}.transcript.json`),
    chapters: path.join(outTopic, `${moduleName}.chapters.json`),
    vtt: path.join(outTopic, `${moduleName}.vtt`),
    candidate,
    candidateSource: path.join(candidate, "source"),
    copies: path.join(candidate, "copies.json"),
    poster: path.join(candidate, "poster.jpg"),
    source: path.join(job, "source"),
    clips: path.join(job, "clips"),
    rejected: path.join(job, "rejected"),
    tmp: path.join(job, "tmp"),
  };
}

/** A scene's contact sheet, which `preview` writes beside its render. */
export function sheetPath(paths: VideoPaths, scene: string): string {
  return path.join(paths.scenes, `${scene}.sheet.png`);
}

/** `videos/<slug>.mp4`: the logical name the lease and the catalog key on. */
export function videoTarget(slug: string): string {
  return `videos/${slug}.mp4`;
}

/** `jobs/<id>/candidate/<slug>.mp4`, relative to `STUDIO_HOME`, the form the catalog records. */
export function videoCandidateRef(jobId: string, slug: string): string {
  return path.posix.join("jobs", jobId, "candidate", `${slug}.mp4`);
}

/**
 * The names a copy takes in `candidate/`: the catalog's (`<slug>.*`), not
 * manimkc's (`<module>.*`), since `catalog video put` reads the slug's.
 */
export function candidateNames(slug: string): { mp4: string; transcript: string; chapters: string; vtt: string } {
  return {
    mp4: `${slug}.mp4`,
    transcript: `${slug}.transcript.json`,
    chapters: `${slug}.chapters.json`,
    vtt: `${slug}.vtt`,
  };
}
