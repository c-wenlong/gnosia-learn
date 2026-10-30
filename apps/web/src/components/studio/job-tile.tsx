"use client";

import type { ReactNode, Ref } from "react";

import { CancelJobButton, Duration, JobDot } from "@/components/studio/job-bits";
import { FADE_IN, POP_IN } from "@/components/studio/motion";
import { KindBadge } from "@/components/studio/KindBadge";
import { PanelLink } from "@/components/studio/PanelLink";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { JOB_BAR, JOB_CONTROL, TILE, TILE_LIFT, TILE_THUMB } from "@/components/studio/surfaces";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { buttonClasses, cx } from "@/components/ui/classes";
import type { Job } from "@/lib/studio-jobs";
import type { TileStage } from "@/lib/studio-grid-jobs";
import { conversationHref, panelHref } from "@/lib/studio-url";
import { useElapsed } from "@/lib/use-elapsed";

/**
 * A job in the grid, drawn over a picture: the parts a diagram job's tile
 * (`GridJob.tsx`) and a video job's (`video/VideoGridJob.tsx`) have in
 * common. Each kind keeps its own picture (the agent's live screenshot, the
 * newest contact sheet) and its own words, and hands them to these.
 */

/** What these parts read of a job, which a diagram job and a video job both carry. */
export type TileJob = Pick<
  Job,
  "jobId" | "state" | "draftId" | "cancelRequestedAt" | "started" | "requested" | "finished" | "title" | "topic"
>;

/** The picture link's accessible name: what the job is doing, and that pressing opens it. */
export function jobTileLabel({
  stage,
  isNew,
  title,
  headline,
  failure,
}: {
  stage: TileStage;
  isNew: boolean;
  title: string;
  headline: string;
  failure: string;
}): string {
  if (stage === "review") return isNew ? `Review ${title}` : `Review the new version of ${title}`;
  return `${title}: ${stage === "failed" ? failure : headline}. Open the job`;
}

/**
 * The stage: the picture behind, the link to the job's panel over all of it,
 * and the status bar at its foot. `ref` is the frame a kind watches to know
 * whether the tile is on screen.
 */
export function JobTileFrame({
  ref,
  job,
  label,
  path,
  backdrop,
  status,
}: {
  ref?: Ref<HTMLDivElement>;
  job: TileJob;
  label: string;
  path: string;
  backdrop: ReactNode;
  status: ReactNode;
}) {
  return (
    <div ref={ref} className="relative h-full w-full bg-surface2">
      {backdrop}
      <PanelLink
        href={panelHref(path, { job: job.jobId })}
        scroll={false}
        aria-label={label}
        className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      />
      {status}
    </div>
  );
}

/** One picture layer behind a working or failed job, contained and blurred. */
export function jobTileLayer(stage: TileStage, padded: boolean): string {
  // The blur deepens, and the veil thickens, as a job fails: a change, not a cut.
  return cx(
    "absolute inset-0 h-full w-full object-contain",
    padded && "p-2",
    stage === "failed" ? "blur-[6px]" : "blur-[3px]",
    "transition-[filter] duration-300 ease-out motion-reduce:transition-none",
  );
}

/**
 * The working or failed backdrop around a kind's picture layers: the veil
 * over them, and the light crossing it while the job works.
 */
export function JobTileVeil({ stage, className, children }: { stage: TileStage; className?: string; children: ReactNode }) {
  return (
    <div aria-hidden className={cx("absolute inset-0 overflow-hidden", className)}>
      {children}
      <div
        className={cx(
          "absolute inset-0 transition-[background-color] duration-300 ease-out motion-reduce:transition-none",
          stage === "failed" ? "studio-veil-strong" : "studio-veil",
        )}
      />
      {stage === "working" && <div className="studio-shimmer absolute inset-0 overflow-hidden" />}
    </div>
  );
}

/**
 * Under a result that has not loaded yet (a canvas shot can be a 3000px PNG),
 * the last picture stays, blurred, rather than a blank.
 */
export function JobTileHeldPicture({ src, padded }: { src: string; padded: boolean }) {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element -- a runner file behind the proxy, or an object URL. */}
      <img src={src} alt="" className={cx("absolute inset-0 h-full w-full object-contain blur-[3px]", padded && "p-2")} />
      <div className="studio-veil absolute inset-0" />
    </div>
  );
}

/**
 * The bar at the foot of the picture (`JOB_BAR`): what the job is doing and
 * the one control that belongs here, a secondary kit `Button` at `xs` with
 * its pointer events back on.
 */
export function JobTileStatus({
  job,
  stage,
  headline,
  reviewLine,
  failure,
  step,
  path,
}: {
  job: TileJob;
  stage: TileStage;
  headline: string;
  /** Under the headline once the result is ready to review. */
  reviewLine: string;
  /** The failure in a line. */
  failure: string;
  /** The step and the time while the job works. */
  step: JobStep;
  path: string;
}) {
  const { dismiss } = useStudioJobs();

  if (stage === "review") {
    return (
      <div className={JOB_BAR}>
        <JobDot job={job} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-text">{headline}</span>
          <span className="block truncate text-text2">{reviewLine}</span>
        </span>
        {/* Not a control: the whole picture is the link to the review. */}
        <span className={buttonClasses({ size: "xs" })}>Review</span>
      </div>
    );
  }

  if (stage === "failed") {
    return (
      <div className={cx(JOB_BAR, "flex-wrap")}>
        <JobDot job={job} />
        <span className="min-w-0 flex-1 truncate font-medium text-danger">{failure}</span>
        <span className="flex w-full justify-end gap-1.5">
          {typeof job.draftId === "string" && (
            <PanelLink href={conversationHref(path, job.draftId)} scroll={false} className={JOB_CONTROL}>
              Talk it through
            </PanelLink>
          )}
          <Button variant="secondary" size="xs" onClick={() => dismiss(job.jobId)} className="pointer-events-auto">
            Dismiss
          </Button>
        </span>
      </div>
    );
  }

  return (
    <>
      <div className={JOB_BAR}>
        <JobDot job={job} />
        <span className="min-w-0 flex-1">
          <span role="status" className="block truncate font-medium text-text">
            {headline}
          </span>
          <JobStepAndTime job={job} step={step} />
        </span>
        <CancelJobButton job={job} path={path} className="pointer-events-auto" problemAt="above" />
      </div>
      {/* The only motion that says "running" without the light: a strip along
          the picture's foot, indeterminate like the panel's bar (D23). */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-surface2">
        <span className="block h-full w-1/3 animate-[studio-slide_1.6s_ease-in-out_infinite] bg-accent" />
      </span>
    </>
  );
}

/**
 * The step under a working job's headline: its words (or null), whether the
 * time shows yet, and what to say when there is neither.
 */
export interface JobStep {
  words: string | null;
  timed: boolean;
  idle?: string;
}

function JobStepAndTime({ job, step }: { job: TileJob; step: JobStep }) {
  // Null until hydrated, so the server's second is never matched against the browser's.
  const elapsed = useElapsed(job);
  return (
    <span className="block truncate tabular-nums text-text2">
      {step.words === null && !step.timed ? step.idle : step.words}
      {step.words !== null && step.timed ? " · " : ""}
      {step.timed && <Duration ms={elapsed} live={job.finished === null} />}
    </span>
  );
}

/** A list row's version: a dot, the words, the time. The words truncate first; the dot and the time never do. */
export function JobRowWords({
  job,
  stage,
  words,
  timed,
}: {
  job: TileJob;
  stage: TileStage;
  words: string;
  /** Whether the time shows, which only a working job's does. */
  timed: boolean;
}) {
  const elapsed = useElapsed(job);
  return (
    <span className={cx("flex min-w-0 max-w-full items-center gap-1.5", stage === "failed" ? "text-danger" : "text-text2")}>
      <JobDot job={job} />
      <span className="min-w-0 truncate">{words}</span>
      {timed && (
        <span className="shrink-0 text-text2">
          <Duration ms={elapsed} live={job.finished === null} />
        </span>
      )}
    </span>
  );
}

/** A card after the plus card for a job making something the grid has no tile for yet. */
export function NewJobCard({
  job,
  kind,
  title,
  stage,
}: {
  job: TileJob;
  kind: "diagram" | "video";
  title: string;
  /** The kind's stage, drawn in the card's 4:3 picture box. */
  stage: ReactNode;
}) {
  return (
    <div className={cx(TILE, TILE_LIFT, POP_IN)}>
      <div className={cx("relative overflow-hidden border-b border-border", TILE_THUMB)}>
        {stage}
        <KindBadge kind={kind} />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 p-3">
        <span className="line-clamp-2 text-sm font-medium">{title}</span>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge>{job.topic}</Badge>
        </div>
      </div>
    </div>
  );
}

/** The list layout's row for the same: a link to the job's panel. */
export function NewJobRow({
  job,
  kind,
  title,
  path,
  words,
}: {
  job: TileJob;
  kind: "diagram" | "video";
  title: string;
  path: string;
  /** The kind's `JobRowWords`. */
  words: ReactNode;
}) {
  return (
    <PanelLink
      href={panelHref(path, { job: job.jobId })}
      scroll={false}
      className={cx("flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-xs transition-colors hover:bg-surface2", FADE_IN)}
    >
      <span className="flex h-6 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface2">
        <JobDot job={job} />
      </span>
      <KindBadge kind={kind} inline />
      <span className="min-w-[5rem] flex-1 truncate font-medium">{title}</span>
      <span className="flex min-w-0 max-w-[45%]">{words}</span>
    </PanelLink>
  );
}
