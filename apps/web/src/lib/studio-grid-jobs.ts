import type { JobState } from "@gnosia/schema/shared";

import { failureReport, isActive, jobKindOf, jobShotHref, PHASES, type Job } from "@/lib/studio-jobs";
import { isVideoJob, videoFailureLine, videoHeadline, type VideoJob } from "@/lib/studio-video-job";

/**
 * Which job the grid shows where, and what its loader says, for diagram and
 * video jobs alike.
 *
 * Pure, like `studio-jobs.ts` beside it: the tile loader, the new-diagram card
 * and the strip are view code and untested by design, so every judgement they
 * make lives here ("The job in the grid" in docs/STUDIO-CHAT-FIRST.md).
 *
 * A diagram job belongs to a tile when its `target` is that diagram's
 * `tldr.path`, the same test the inspector's job history uses; a video job
 * belongs to its slug's tile. A job whose target is no tile in the listing is
 * making a new one, and gets a card of its own after the plus card. That is
 * decided against the whole listing, not the filtered one, so an extend job on
 * a diagram a filter hides is left to the strip rather than drawn as a stray
 * new card.
 */

/**
 * Whether a job belongs on the diagram grid at all: an allowlist, so a video
 * job (docs/STUDIO-VIDEOS.md), or any kind added after it, stays off the
 * diagram tiles and gets its own. A row from a runner that predates `kind` is
 * a diagram (`jobKindOf`).
 */
export function isDiagramJob(job: Pick<Job, "kind"> & Partial<Pick<Job, "target">>): boolean {
  return jobKindOf(job) === "diagram";
}

/** What a tile or card is showing about its job. */
export type TileStage = "working" | "review" | "failed";

/** The fields the grid's rules read, which a job of either kind has. */
type GridJob = { jobId: string; state: JobState; target: string };

/**
 * Whether the grid shows this job at all.
 *
 * Queued, running and waiting for review always: those are live things a
 * person has to get back to. A failure only when this tab watched it happen
 * and nobody has dismissed it, which is the strip's rule too: yesterday's
 * failure is history, and a grid that kept every one would bury the diagrams.
 * A cancel is somebody's own decision and needs no card; accepted and
 * discarded are done.
 */
export function shownOnGrid(job: Pick<GridJob, "jobId" | "state">, ended: readonly string[], dismissed: readonly string[]): boolean {
  if (isActive(job.state)) return true;
  if (job.state === "failed" || job.state === "interrupted") {
    return ended.includes(job.jobId) && !dismissed.includes(job.jobId);
  }
  return false;
}

export function tileStage(job: Pick<GridJob, "state">): TileStage {
  if (job.state === "awaiting_review") return "review";
  if (job.state === "failed" || job.state === "interrupted") return "failed";
  return "working";
}

/**
 * The newest job `matches` picks, when the grid shows it, or null. The list
 * arrives newest first.
 *
 * The newest job, then the rule, and not the newest job the rule lets
 * through: a failure left undismissed and then a retry that was accepted
 * would otherwise put the old failure's loader back over the tile the retry
 * just landed. The same order as `untiledJobs`.
 */
function newestShown<J extends GridJob>(
  jobs: readonly J[],
  matches: (job: J) => boolean,
  ended: readonly string[],
  dismissed: readonly string[],
): J | null {
  const newest = jobs.find(matches);
  return newest !== undefined && shownOnGrid(newest, ended, dismissed) ? newest : null;
}

/**
 * The jobs making something the grid has no tile for, newest first, one per
 * target: a retry on the same slug replaces its failed card rather than
 * standing beside it.
 */
function untiledJobs<J extends GridJob>(
  jobs: readonly J[],
  tiled: (job: J) => boolean,
  ended: readonly string[],
  dismissed: readonly string[],
): J[] {
  const seen = new Set<string>();
  const out: J[] = [];
  for (const job of jobs) {
    if (tiled(job) || seen.has(job.target)) continue;
    seen.add(job.target);
    if (shownOnGrid(job, ended, dismissed)) out.push(job);
  }
  return out;
}

/** The newest diagram job drawing onto `target`, when the grid shows it, or null. */
export function jobForTarget(
  jobs: readonly Job[],
  target: string,
  ended: readonly string[],
  dismissed: readonly string[],
): Job | null {
  return newestShown(jobs, (job) => isDiagramJob(job) && job.target === target, ended, dismissed);
}

/** The diagram jobs drawing a diagram the listing does not have yet, newest first, one per target. */
export function newDiagramJobs(
  jobs: readonly Job[],
  existingTargets: ReadonlySet<string>,
  ended: readonly string[],
  dismissed: readonly string[],
): Job[] {
  return untiledJobs(jobs.filter(isDiagramJob), (job) => existingTargets.has(job.target), ended, dismissed);
}

/** The video rows of a mixed list, in its order. */
function videoJobs(jobs: readonly { kind?: string }[]): VideoJob[] {
  return jobs.filter((job): job is VideoJob => isVideoJob(job));
}

/** The newest video job on a landed video's slug (a change), when the grid shows it. */
export function videoJobForSlug(
  jobs: readonly { kind?: string }[],
  slug: string,
  ended: readonly string[],
  dismissed: readonly string[],
): VideoJob | null {
  return newestShown(videoJobs(jobs), (job) => job.slug === slug, ended, dismissed);
}

/** The video jobs making a video the grid has no tile for, newest first, one per target. */
export function newVideoJobs(
  jobs: readonly { kind?: string }[],
  existingSlugs: ReadonlySet<string>,
  ended: readonly string[],
  dismissed: readonly string[],
): VideoJob[] {
  return untiledJobs(videoJobs(jobs), (job) => existingSlugs.has(job.slug), ended, dismissed);
}

/** The video tile's names for the shared rules, kept for the video view's imports. */
export type VideoTileStage = TileStage;
export const videoTileStage: (job: Pick<VideoJob, "state">) => TileStage = tileStage;

/**
 * The loader's headline: what the job is doing, in sentence case.
 *
 * The strip and the panel name a phase as a step in a list ("Draw", "Export
 * the SVG"); a loader over a picture reads as something happening now, so it
 * says it that way. Same seven phases, same keys.
 */
const DOING: Record<(typeof PHASES)[number]["key"], string> = {
  reading: "Reading the brief",
  planning: "Planning the drawing",
  drawing: "Drawing",
  linting: "Checking the layout",
  exporting: "Exporting the SVG",
  verifying: "Verifying the export",
  ready: "Ready to review",
};

export function loaderHeadline(job: Job): string {
  if (job.state === "queued") return "Waiting to start";
  if (job.state === "awaiting_review") return DOING.ready;
  if (job.phase !== null && job.phase in DOING) return DOING[job.phase as keyof typeof DOING];
  return "Starting";
}

/** `Step 3 of 7`, or null while nothing has started. Never a percentage (D23). */
export function loaderStep(job: Job): string | null {
  if (job.state !== "running") return null;
  const at = PHASES.findIndex((phase) => phase.key === job.phase);
  return at < 0 ? null : `Step ${at + 1} of ${PHASES.length}`;
}

/** The failure in one sentence, capitalised for a card: the panel has the rest. */
export function failureLine(job: Job): string {
  const headline = failureReport(job).headline;
  return headline.charAt(0).toUpperCase() + headline.slice(1);
}

/** What a list row says about its job: the failure when it failed, else what it is doing. */
export function rowWords(job: Job): string {
  return tileStage(job) === "failed" ? failureLine(job) : loaderHeadline(job);
}

/**
 * The accessible name of a list row's link to its job: the same words the row
 * shows, so a failed job is not announced by the phase it failed in.
 */
export function rowJobLabel(job: Job, title: string): string {
  return `${rowWords(job)}: open the job on ${title}`;
}

/** What a video's list row says about its job, as `rowWords` for a diagram's. */
export function videoRowWords(job: VideoJob): string {
  return tileStage(job) === "failed" ? videoFailureLine(job) : videoHeadline(job);
}

/** The accessible name of a video row's link to its job, as `rowJobLabel` for a diagram's (R2-1-24). */
export function videoRowJobLabel(job: VideoJob, title: string): string {
  return `${videoRowWords(job)}: open the job on ${title}`;
}

/* -------------------------------------------------------------------------- */
/* The live picture                                                           */
/* -------------------------------------------------------------------------- */

/**
 * How often a visible tile asks for a newer picture while its job runs.
 *
 * A drawing pass is a snippet, a `run` and a screenshot, which takes the agent
 * tens of seconds, so three seconds shows each new picture promptly and costs
 * a 304 almost every time. Nothing polls while the tile is off screen, the tab
 * is hidden, or the job is not running.
 */
export const LIVE_POLL_MS = 3_000;

/** The newest picture the agent took, through the studio's proxy. */
export function liveShotHref(jobId: string): string {
  return jobShotHref(jobId, "live");
}

/**
 * The live picture's URL for a job, or null for any job that is not a
 * diagram's: the only way the tile builds that URL, so a video job (whose
 * `shot?which=live` is a 404) never asks for it.
 */
export function liveShotFor(job: Pick<Job, "jobId" | "kind">): string | null {
  return isDiagramJob(job) ? liveShotHref(job.jobId) : null;
}

/** The candidate as the gate photographed it: the picture a finished card shows. */
export function afterShotHref(jobId: string): string {
  return jobShotHref(jobId, "after");
}

/** Whether the tile should be asking for a newer picture. */
export function wantsLivePicture(job: Job, visible: boolean, pageHidden: boolean): boolean {
  // Only a diagram job has a live shot: a video job's picture is its newest
  // contact sheet (`studio-video-job.ts`), and `shot?which=live` 404s for it.
  return isDiagramJob(job) && job.state === "running" && visible && !pageHidden;
}

/**
 * The pictures a tile is showing: the newest, the one it fades in over, and
 * the sequence number of the poll that brought the newest.
 */
export interface LivePictures {
  /** The newest picture, as an object URL, or null before the first. */
  current: string | null;
  /** The one before it, kept under the new one only while it fades in. */
  previous: string | null;
  /** True once `current` has finished fading in (at once with reduced motion). */
  settled: boolean;
  /** The poll that brought `current`; an answer to an earlier poll is stale. */
  seq: number;
}

export const NO_PICTURES: LivePictures = { current: null, previous: null, settled: true, seq: 0 };

/**
 * Take a newly decoded picture, or refuse it (null) when a later poll's
 * picture is already showing, so the preview never steps backwards. Without
 * motion it replaces the old one at once; otherwise the old one stays under
 * it until `settlePicture`.
 */
export function adoptPicture(held: LivePictures, url: string, seq: number, still: boolean): LivePictures | null {
  if (seq <= held.seq) return null;
  return still
    ? { current: url, previous: null, settled: true, seq }
    : { current: url, previous: held.current, settled: false, seq };
}

/** The fade has finished: drop the picture underneath. */
export function settlePicture(held: LivePictures): LivePictures {
  return held.settled && held.previous === null ? held : { ...held, previous: null, settled: true };
}

/** Of the object URLs a tile made, the ones nothing shows any more, to revoke. */
export function retiredUrls(owned: readonly string[], held: LivePictures): string[] {
  return owned.filter((url) => url !== held.current && url !== held.previous);
}

/**
 * Whether the tile's own thumbnail still belongs on screen: until there is a
 * live picture, and until the first one has faded in over it.
 */
export function showsThumbnail(held: LivePictures): boolean {
  return held.current === null || (held.previous === null && !held.settled);
}
