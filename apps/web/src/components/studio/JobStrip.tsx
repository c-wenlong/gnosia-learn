"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useStudioJobs } from "@/components/studio/JobsProvider";
import {
  elapsedMs,
  failureReport,
  finishedHeadline,
  formatDuration,
  isActive,
  phaseWords,
  stepLabel,
  type Job,
} from "@/lib/studio-jobs";
import { panelHref } from "@/lib/studio-view";

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

export function JobStrip({ path, stream = true }: { path: string; stream?: boolean }) {
  const { active, lastWatched, jobs, dismissed, dismiss, connection, post, setStreamEnabled } =
    useStudioJobs();

  // `?stream=off` is read by the page and lands here, because a layout — where
  // the provider is mounted, so that it survives navigation — is not given the
  // query string at all. This component is the one that renders on both routes.
  useEffect(() => setStreamEnabled(stream), [stream, setStreamEnabled]);

  const settled =
    lastWatched === null || dismissed.includes(lastWatched)
      ? null
      : (jobs.find((job) => job.jobId === lastWatched && !isActive(job.state)) ?? null);
  const job = active ?? settled;
  if (job === null) return null;

  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 text-xs">
      <Dot job={job} />
      <Link
        href={panelHref(path, { job: job.jobId })}
        scroll={false}
        className="flex min-w-0 flex-1 items-center gap-3 hover:underline"
        title="Open this job in the panel"
      >
        <span className="max-w-[18rem] truncate font-medium">{job.title ?? job.jobId.slice(0, 8)}</span>
        <Words job={job} />
      </Link>
      {isActive(job.state) ? (
        <>
          <Elapsed job={job} />
          {connection === "polling" && (
            <span className="shrink-0 text-[var(--muted)]" title="The event stream is not connected; this is the polled GET, which is the record anyway.">
              polling
            </span>
          )}
          {job.state !== "awaiting_review" && (
            <button
              type="button"
              onClick={() => void post(`/studio/api/jobs/${encodeURIComponent(job.jobId)}/cancel`)}
              disabled={job.cancelRequestedAt !== null}
              className="inline-flex h-6 shrink-0 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              {job.cancelRequestedAt === null ? "Cancel" : "Stopping"}
            </button>
          )}
        </>
      ) : (
        <>
          <span className="shrink-0 text-[var(--muted)]">{formatDuration(elapsedMs(job))}</span>
          <button
            type="button"
            onClick={() => dismiss(job.jobId)}
            className="inline-flex h-6 shrink-0 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs hover:bg-[var(--surface-hover)]"
          >
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}

/** What the strip says about a job, in the fewest words that are true. */
function Words({ job }: { job: Job }) {
  if (job.state === "awaiting_review") {
    return <span className="truncate text-[var(--muted-strong)]">{finishedHeadline(job)} · ready to review</span>;
  }
  if (job.state === "failed" || job.state === "interrupted" || job.state === "cancelled") {
    return <span className="truncate text-[var(--danger)]">{failureReport(job).headline}</span>;
  }
  if (!isActive(job.state)) {
    return <span className="truncate text-[var(--muted)]">{job.state}</span>;
  }
  // The step and the attempt stay: this is the only progress a person sees
  // when the tile is filtered out, scrolled away, or on the canvas route.
  return (
    <>
      <span className="truncate text-[var(--muted-strong)]">{phaseWords(job)}</span>
      <span className="shrink-0 tabular-nums text-[var(--muted)]">
        {stepLabel(job)}
        {job.attempt > 1 && ` · attempt ${job.attempt}`}
      </span>
    </>
  );
}

function Dot({ job }: { job: Job }) {
  const tone =
    job.state === "failed" || job.state === "interrupted"
      ? "bg-[var(--danger)]"
      : job.state === "awaiting_review" || job.state === "accepted"
        ? "bg-[var(--ok)]"
        : job.state === "cancelled" || job.state === "discarded"
          ? "bg-[var(--muted)]"
          : "bg-[var(--accent)]";
  const pulse = job.state === "running" ? "animate-pulse" : "";
  return <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${tone} ${pulse}`} />;
}

/**
 * Elapsed, counting up, from the record's own timestamps.
 *
 * The clock ticks in the browser and the start comes from the runner, so a tab
 * left open overnight is right when it comes back rather than however many
 * seconds it managed to stay awake for.
 */
export function Elapsed({ job }: { job: Job }) {
  const now = useNow(job.finished === null);
  return (
    <span className="shrink-0 tabular-nums text-[var(--muted)]">
      {formatDuration(elapsedMs(job, now))}
    </span>
  );
}

/** A second-resolution clock that stops when there is nothing to count. */
export function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}

/** No number on it, ever. It says "something is happening" and nothing more. */
export function IndeterminateBar() {
  return (
    <span
      aria-hidden
      className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--chip-bg)]"
    >
      <span className="block h-full w-1/3 animate-[studio-slide_1.6s_ease-in-out_infinite] rounded-full bg-[var(--accent)]" />
    </span>
  );
}
