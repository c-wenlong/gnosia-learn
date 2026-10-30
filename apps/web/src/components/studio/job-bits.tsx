"use client";

import { useState } from "react";

import { useJobVerb } from "@/components/studio/use-job-verb";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { formatDuration, type Job } from "@/lib/studio-jobs";
import type { VerbOutcome } from "@/lib/studio-job-verb";
import { useElapsed } from "@/lib/use-elapsed";

/**
 * The small parts every view of a job draws the same way: the time, the
 * indeterminate bar, the status dot and Cancel. The strip, both job panels
 * and both kinds of grid tile import them from here, so none of them has to
 * import another's component to draw a duration.
 */

type Timed = Pick<Job, "started" | "requested" | "finished">;

/**
 * Elapsed, counting up, from the record's own timestamps.
 *
 * The clock ticks in the browser and the start comes from the runner, so a tab
 * left open overnight is right when it comes back rather than however many
 * seconds it managed to stay awake for.
 */
export function Elapsed({ job }: { job: Timed }) {
  const ms = useElapsed(job);
  return (
    <span className="shrink-0 text-text2">
      <Duration ms={ms} live={job.finished === null} />
    </span>
  );
}

/**
 * A duration as text, or the room for one.
 *
 * A running job has no figure on the server or in the browser's first pass
 * (`useElapsed`), so `ms` is `null` there and the text is held back. `live`
 * keeps five characters of width under it, tabular so each second is as wide as
 * the last, which fits `12:30`; whatever sits beside the figure does not move
 * when it arrives. A finished job's figure is there from the first render and
 * takes only the room it needs.
 */
export function Duration({ ms, live }: { ms: number | null; live: boolean }) {
  return (
    <span className={cx("inline-block tabular-nums", live ? "min-w-[5ch]" : "")}>
      {/* A no-break space, so the empty box keeps a line's height and baseline. */}
      {ms === null ? "\u00a0" : formatDuration(ms)}
    </span>
  );
}

/** No number on it, ever. It says "something is happening" and nothing more. */
export function IndeterminateBar() {
  return (
    <span
      aria-hidden
      className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-surface2"
    >
      <span className="block h-full w-1/3 animate-[studio-slide_1.6s_ease-in-out_infinite] rounded-full bg-accent" />
    </span>
  );
}

/**
 * The status dot's colour for a job state, one table for every place a job
 * shows a dot: red for a failure, green for a result, muted for a job that
 * was stopped or put away, and the accent, breathing, while it is queued or
 * running.
 */
export function jobDotTone(state: Job["state"]): string {
  switch (state) {
    case "failed":
    case "interrupted":
      return "bg-danger";
    case "awaiting_review":
    case "accepted":
      return "bg-ok";
    case "cancelled":
    case "discarded":
      return "bg-text3";
    default:
      return "bg-accent studio-breathe";
  }
}

/** The status dot: `sm` in a bar, a row or the strip, `md` beside the job panel's headline. */
export function JobDot({ job, size = "sm" }: { job: Pick<Job, "state">; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cx(
        "shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none",
        size === "md" ? "size-2.5" : "size-2",
        jobDotTone(job.state),
      )}
    />
  );
}

/**
 * Cancel on a queued or running job, and Stopping once it is asked: from the
 * press until the runner refuses it, then for as long as the record carries
 * the request. The strip, the tiles and both panels post the same call, and a
 * second press anywhere finds the job already stopping.
 *
 * A refusal is said where the press was. A panel that shows the runner's
 * words itself passes `onDone`; everywhere else (the strip, a tile, the video
 * job panel) the button says it, so a refused stop never looks like one still
 * on its way (R2-1-03). `problemAt` is where: `inline`, before the button in
 * its row, or `above`, over it, for a tile's bar, which has no room beside
 * the button and nothing but the picture above it.
 */
export function CancelJobButton({
  job,
  path,
  size = "xs",
  className,
  onDone,
  problemAt = "inline",
}: {
  job: Pick<Job, "jobId" | "cancelRequestedAt">;
  path: string;
  size?: "xs" | "sm";
  className?: string;
  /** What the runner said, for a panel that shows it. */
  onDone?: (outcome: VerbOutcome) => void;
  problemAt?: "inline" | "above";
}) {
  const { run } = useJobVerb(path);
  const [asked, setAsked] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const stopping = asked || job.cancelRequestedAt !== null;
  // Gone once the job is stopping anyway (another tab's press, a retry that
  // landed): the refusal is no longer the news.
  const said = problem !== null && !stopping ? problem : null;
  const button = (
    <Button
      variant="secondary"
      size={size}
      disabled={stopping}
      className={className}
      onClick={async () => {
        setAsked(true);
        setProblem(null);
        const outcome = await run(job.jobId, "cancel");
        if (!outcome.ok) {
          setAsked(false);
          if (onDone === undefined) setProblem(outcome.text);
        }
        onDone?.(outcome);
      }}
    >
      {stopping ? "Stopping" : "Cancel"}
    </Button>
  );
  if (said === null) return button;
  if (problemAt === "above") {
    return (
      // `pointer-events-auto` on the button only: the bar under it takes no clicks.
      <span className="relative inline-flex shrink-0">
        {button}
        <span
          role="alert"
          className="absolute right-0 bottom-full z-20 mb-1 w-max max-w-44 rounded-md border border-border bg-surface px-2 py-1.5 text-left text-xs leading-4 font-normal text-danger shadow-sm"
        >
          {said}
        </span>
      </span>
    );
  }
  return (
    <>
      <span role="alert" title={said} className="min-w-0 max-w-[24rem] truncate text-xs text-danger">
        {said}
      </span>
      {button}
    </>
  );
}
