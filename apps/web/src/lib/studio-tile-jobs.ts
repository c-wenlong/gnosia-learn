import { failureReport, isActive, PHASES, type Job } from "@/lib/studio-jobs";

/**
 * Which job the grid shows where, and what its loader says.
 *
 * Pure, like `studio-jobs.ts` beside it: the tile loader, the new-diagram card
 * and the strip are view code and untested by design, so every judgement they
 * make lives here ("The job in the grid" in docs/STUDIO-CHAT-FIRST.md).
 *
 * A job belongs to a tile when its `target` is that diagram's `tldr.path`, the
 * same test the inspector's job history uses. A job whose target is no diagram
 * in the listing is drawing a new one, and gets a card of its own after the
 * plus card. That is decided against the whole listing, not the filtered one,
 * so an extend job on a diagram a filter hides is left to the strip rather
 * than drawn as a stray new card.
 */

/** What a tile or card is showing about its job. */
export type TileStage = "working" | "review" | "failed";

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
export function shownOnGrid(job: Job, ended: readonly string[], dismissed: readonly string[]): boolean {
  if (isActive(job.state)) return true;
  if (job.state === "failed" || job.state === "interrupted") {
    return ended.includes(job.jobId) && !dismissed.includes(job.jobId);
  }
  return false;
}

export function tileStage(job: Job): TileStage {
  if (job.state === "awaiting_review") return "review";
  if (job.state === "failed" || job.state === "interrupted") return "failed";
  return "working";
}

/** The newest shown job drawing onto `target`, or null. The list arrives newest first. */
export function jobForTarget(
  jobs: readonly Job[],
  target: string,
  ended: readonly string[],
  dismissed: readonly string[],
): Job | null {
  return jobs.find((job) => job.target === target && shownOnGrid(job, ended, dismissed)) ?? null;
}

/**
 * The jobs drawing a diagram the listing does not have yet, newest first, one
 * per target: a retry on the same slug replaces its failed card rather than
 * standing beside it.
 */
export function newDiagramJobs(
  jobs: readonly Job[],
  existingTargets: ReadonlySet<string>,
  ended: readonly string[],
  dismissed: readonly string[],
): Job[] {
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const job of jobs) {
    if (existingTargets.has(job.target) || seen.has(job.target)) continue;
    seen.add(job.target);
    if (shownOnGrid(job, ended, dismissed)) out.push(job);
  }
  return out;
}

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
  return `/studio/api/jobs/${encodeURIComponent(jobId)}/shot?which=live`;
}

/** The candidate as the gate photographed it: the picture a finished card shows. */
export function afterShotHref(jobId: string): string {
  return `/studio/api/jobs/${encodeURIComponent(jobId)}/shot?which=after`;
}

/** Whether the tile should be asking for a newer picture. */
export function wantsLivePicture(job: Job, visible: boolean, pageHidden: boolean): boolean {
  return job.state === "running" && visible && !pageHidden;
}
