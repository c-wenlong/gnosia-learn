"use client";

import { useEffect, useState } from "react";

import { useStudioPath } from "@/components/studio/panel-host";
import { CancelJobButton, Elapsed, JobDot } from "@/components/studio/job-bits";
import { PanelLink } from "@/components/studio/PanelLink";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { Button } from "@/components/ui/Button";
import { Collapse } from "@/components/ui/Collapse";
import {
  failureReport,
  finishedHeadline,
  isActive,
  phaseWords,
  stepLabel,
  type Job,
} from "@/lib/studio-jobs";
import { jobStateLabel } from "@/lib/studio-job-state";
import { asVideoJob, videoFailureLine, videoPhaseWords, videoStepCount, readyHeadline } from "@/lib/studio-video-job";
import { panelHref } from "@/lib/studio-url";

/**
 * The 32px job strip, under the studio strip and above the content.
 *
 * Present whenever there is a job to be present for, on **both** routes: a job
 * started from the canvas has to still be visible after navigating back to the
 * grid, which is the whole reason the provider behind it is mounted in the
 * layout rather than in a page.
 *
 * Left to right: a status dot, the diagram name, the phase in words,
 * `step 4 of 7`, elapsed counting up, and Cancel. There is no percentage here or anywhere else (D23).
 * Cancel and Dismiss are the kit's `Button` at `xs`, 28px inside the 32px strip.
 *
 * Slimmer since the job moved into the grid ("The job in the grid" in
 * docs/STUDIO-CHAT-FIRST.md). The tile or the new-diagram card now carries the
 * moving bar and the picture; the strip keeps the phase, the step, the attempt
 * after the first, the time and Cancel, because it is the one place the job
 * shows when its tile is filtered out, scrolled off, or on the canvas route,
 * which has no grid. Cancel stays in both places on purpose. On the strip it is the
 * only way to stop a job whose tile is not on screen, and on the tile it is
 * next to the picture a person is watching go wrong; they post the same call,
 * and the second press finds the job already stopping.
 */

export function JobStrip({ path: drawnFor, stream = true }: { path: string; stream?: boolean }) {
  // The address bar's view on `/studio`, which can move on from the server's.
  const path = useStudioPath(drawnFor);
  const { active, lastWatched, jobs, dismissed, dismiss, connection, setStreamEnabled } = useStudioJobs();

  // `?stream=off` is read by the page and lands here, because a layout — where
  // the provider is mounted, so that it survives navigation — is not given the
  // query string at all. This component is the one that renders on both routes.
  useEffect(() => setStreamEnabled(stream), [stream, setStreamEnabled]);

  const settled =
    lastWatched === null || dismissed.includes(lastWatched)
      ? null
      : (jobs.find((job) => job.jobId === lastWatched && !isActive(job.state)) ?? null);
  const current = active ?? settled;
  // The strip folds open when a job starts and shut when it is dismissed,
  // still showing the job it was about while it folds, rather than emptying
  // first: the last one shown is held for that.
  const [last, setLast] = useState<Job | null>(current);
  if (current !== null && current !== last) setLast(current);
  const job = current ?? last;

  return (
    <Collapse open={current !== null}>
      {job !== null && <Strip job={job} path={path} connection={connection} dismiss={dismiss} />}
    </Collapse>
  );
}

function Strip({
  job,
  path,
  connection,
  dismiss,
}: {
  job: Job;
  path: string;
  connection: ReturnType<typeof useStudioJobs>["connection"];
  dismiss: ReturnType<typeof useStudioJobs>["dismiss"];
}) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 text-xs">
      <JobDot job={job} />
      <PanelLink
        href={panelHref(path, { job: job.jobId })}
        scroll={false}
        className="flex min-w-0 flex-1 items-center gap-3 hover:underline"
        title="Open this job in the panel"
      >
        <span className="max-w-[18rem] truncate font-medium">{job.title ?? job.jobId.slice(0, 8)}</span>
        <Words job={job} />
      </PanelLink>
      {isActive(job.state) ? (
        <>
          <Elapsed job={job} />
          {connection === "polling" && (
            <span className="shrink-0 text-text2" title="The event stream is not connected; this is the polled GET, which is the record anyway.">
              polling
            </span>
          )}
          {job.state !== "awaiting_review" && <CancelJobButton key={job.jobId} job={job} path={path} />}
        </>
      ) : (
        <>
          <Elapsed job={job} />
          <Button variant="secondary" size="xs" onClick={() => dismiss(job.jobId)}>
            Dismiss
          </Button>
        </>
      )}
    </div>
  );
}

/** What the strip says about a job, in the fewest words that are true. */
function Words({ job }: { job: Job }) {
  const video = asVideoJob(job);
  if (video !== null) return <VideoWords job={video} />;
  if (job.state === "awaiting_review") {
    return <span className="truncate text-text2">{finishedHeadline(job)} · ready to review</span>;
  }
  if (job.state === "failed" || job.state === "interrupted" || job.state === "cancelled") {
    return <span className="truncate text-danger">{failureReport(job).headline}</span>;
  }
  if (!isActive(job.state)) {
    return <span className="truncate text-text2">{jobStateLabel(job.state)}</span>;
  }
  // The step and the attempt stay: this is the only progress a person sees
  // when the tile is filtered out, scrolled away, or on the canvas route.
  return (
    <>
      <span className="truncate text-text2">{phaseWords(job)}</span>
      <span className="shrink-0 tabular-nums text-text2">
        {stepLabel(job)}
        {job.attempt > 1 && ` · attempt ${job.attempt}`}
      </span>
    </>
  );
}

/** The same for a video job, whose steps are the manimkc-video skill's, not the seven phases. */
function VideoWords({ job }: { job: NonNullable<ReturnType<typeof asVideoJob>> }) {
  if (job.state === "awaiting_review") {
    return <span className="truncate text-text2">{readyHeadline(job)} · ready to review</span>;
  }
  if (job.state === "failed" || job.state === "interrupted" || job.state === "cancelled") {
    return <span className="truncate text-danger">{videoFailureLine(job)}</span>;
  }
  if (!isActive(job.state)) {
    return <span className="truncate text-text2">{jobStateLabel(job.state)}</span>;
  }
  const step = videoStepCount(job);
  return (
    <>
      <span className="truncate text-text2">{videoPhaseWords(job)}</span>
      {(step !== null || job.attempt > 1) && (
        <span className="shrink-0 tabular-nums text-text2">
          {step === null ? "" : step.toLowerCase()}
          {job.attempt > 1 && `${step === null ? "" : " · "}attempt ${job.attempt}`}
        </span>
      )}
    </>
  );
}
