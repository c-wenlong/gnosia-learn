"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { formatTimecode, type TranscriptCue, type VideoChapter } from "@/components/media";
import { JobLog } from "@/components/studio/JobPanel";
import { Duration } from "@/components/studio/JobStrip";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { FADE_IN } from "@/components/studio/motion";
import { FadeImg } from "@/components/studio/motion-parts";
import { useJobEvents, useSheets, useTranscript, useVideoJob } from "@/components/studio/video/use-video-job";
import { Button } from "@/components/ui/Button";
import { cx, FIELD_TEXT, LABEL } from "@/components/ui/classes";
import { Collapse } from "@/components/ui/Collapse";
import { VideoPlayer } from "@/components/VideoPlayer";
import { modelName } from "@/lib/model-name";
import { announceOpener, leaveOpener, sessionStore } from "@/lib/studio-extend";
import { isActive, narration, type StudioEvent } from "@/lib/studio-jobs";
import { useElapsed } from "@/lib/use-elapsed";
import {
  changedLines,
  changeHint,
  changeProblem,
  childJob,
  changeWord,
  CHANGE_LIMIT,
  formatSize,
  gateStepLabel,
  uniqueWarnings,
  libraryHref,
  logLine,
  mediaFiles,
  mediaHref,
  readyHeadline,
  reviewActions,
  sceneTitle,
  sheetSrc,
  sheetsInOrder,
  spokenLength,
  stepRows,
  storyboard,
  videoFailure,
  videoHeadline,
  videoStepCount,
  type ContactSheet,
  type StepRow,
  type VideoBrief,
  type VideoJob,
} from "@/lib/studio-video";
import { conversationHref, panelHref } from "@/lib/studio-view";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The video job view (docs/STUDIO-VIDEOS.md, "The job view"): the panel's
 * body for a video job, in the place the diagram one sits.
 *
 * **While it runs** the view is the work as the agent sees it: the latest
 * contact sheet of every scene, in play order, arriving as each preview
 * finishes; beside it the skill's steps, each advanced by what the runner
 * saw rather than by the agent's account (D24), and the log of what each
 * wrapper call did. Elapsed time and the running cost, never a percentage
 * (D23), and Cancel.
 *
 * **When it is ready** the finished cut plays from the gate's own copy, with
 * its chapters beside it as the storyboard: each scene, its lines as voiced,
 * a jump to its start. Under it every line the agent changed beside the
 * brief's, the checks, and Accept, Discard and Change. Change asks what
 * should change: a change to the picture revises the job (D52), and a change
 * to what is said goes back to the conversation with the Video chip in the
 * composer, where the planner writes a `change` brief.
 */
export function VideoJobPanel({
  jobId,
  path,
  inConversation = false,
  initial,
}: {
  jobId: string;
  path: string;
  /** Inside the conversation's own job view, which has its own way back. */
  inConversation?: boolean;
  /** The job as `JobPanel` already read it, when the provider did not list it. */
  initial?: unknown;
}) {
  const { job, brief, looking } = useVideoJob(jobId, initial);
  if (job === null) {
    return (
      <div className="px-5 py-4 text-[14px] text-text2">
        {looking ? "Looking up this job." : "The runner has no such job. It may have been pruned, or this link is from another machine's studio."}
      </div>
    );
  }
  // Keyed by job, so a revise's new job starts with its own sheets and state.
  return <Body key={job.jobId} job={job} brief={brief} path={path} inConversation={inConversation} />;
}

function Body({ job, brief, path, inConversation }: { job: VideoJob; brief: VideoBrief | null; path: string; inConversation: boolean }) {
  const full: VideoJob = brief === null || job.brief !== undefined ? job : { ...job, brief };
  const running = job.state === "running" || job.state === "queued";
  const reviewing = job.state === "awaiting_review" || job.state === "accepted";
  const stopped = job.state === "failed" || job.state === "cancelled" || job.state === "interrupted";
  const events = useJobEvents(job);
  // A discarded job keeps its sheets (D52), so they are asked for too.
  const { sheets, loaded } = useSheets(job.jobId, job.state === "running", job.state !== "queued");
  const rows = stepRows(full);
  const { jobs } = useStudioJobs();
  const child = childJob(jobs, job.jobId);
  // The finished cut's transcript and its stored chapters, read once for the
  // whole view: the chapters' titles are the scenes' names everywhere in it,
  // the player's bar, the chapters tab, the changed lines, the sheets and the log.
  const ready = job.state === "awaiting_review";
  const narrated = full.brief === undefined || full.brief.voice !== "none";
  const { cues, chapters } = useTranscript(job.jobId, job.slug, ready && narrated);

  return (
    <div className="flex min-w-0 flex-col gap-5 px-5 py-4">
      <StatusLine job={full} replaced={job.state === "discarded" && child !== null} />
      {stopped && <FailureCard job={full} path={path} inConversation={inConversation} />}
      {job.state === "discarded" && (
        <p className="rounded-xl bg-surface2 px-4 py-3 text-[14px] text-text2">
          {child === null
            ? "Discarded. The renders are deleted and nothing landed in the catalog; the source is kept, so a later change can start from it."
            : "Its renders are deleted and nothing of it landed in the catalog; the newer version starts from its source."}
        </p>
      )}
      {child !== null && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-hair px-4 py-3">
          <p className="min-w-0 flex-1 text-[14px] text-text">
            A newer version: {videoHeadline(child).toLowerCase()}.
          </p>
          <Button size="sm" href={panelHref(path, { job: child.jobId })}>
            Open it
          </Button>
        </div>
      )}

      {reviewing && <Review job={full} path={path} cues={narrated ? cues : undefined} chapters={chapters} />}

      {!reviewing && (
        <SheetStrip job={full} sheets={sheets} loaded={loaded} running={running} chapters={chapters} />
      )}

      {reviewing ? (
        <HowItWasMade job={full} rows={rows} events={events} sheets={sheets} chapters={chapters} />
      ) : (
        <div className="grid min-w-0 gap-5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <StepList rows={rows} live={job.state === "running"} />
          <MakingLog job={full} events={events} chapters={chapters} />
        </div>
      )}

      <div className="min-w-0">
        <JobLog
          jobId={job.jobId}
          openByDefault={stopped}
          live={isActive(job.state) && job.state !== "awaiting_review"}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The status line                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What the job is doing, the step count, the time and the cost, and Cancel.
 * The headline is a live region, so a screen reader hears each new step.
 */
function StatusLine({ job, replaced }: { job: VideoJob; replaced: boolean }) {
  const { post } = useStudioJobs();
  const [cancelling, setCancelling] = useState(false);
  const live = job.state === "running" || job.state === "queued";
  // Null until hydrated, so the server's second is never matched against the browser's.
  const elapsed = useElapsed(job);
  const step = videoStepCount(job);
  const stopping = cancelling || job.cancelRequestedAt !== null;
  const model = job.resolvedModel ?? job.agentModel?.passed ?? null;
  const facts: ReactNode[] = [
    step,
    job.state === "queued" ? null : <Duration key="time" ms={elapsed} live={false} />,
    job.attempt > 1 ? `Attempt ${job.attempt}` : null,
  ].filter((part) => part !== null && part !== "");

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <span aria-hidden className={cx("size-2.5 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none", dotTone(job))} />
      <div className="min-w-0 flex-1">
        <p role="status" className="truncate text-[15px] font-semibold text-text">
          {replaced ? "Replaced" : headline(job)}
        </p>
        <p className="truncate text-[13px] tabular-nums text-text2">
          {facts.map((part, at) => (
            <Fragment key={at}>
              {at > 0 ? " · " : ""}
              {part}
            </Fragment>
          ))}
          {job.costUsd !== null && (
            <>
              {facts.length > 0 ? " · " : ""}
              <span
                title={
                  job.costSource === "stream"
                    ? "An estimate from the session's usage events, which runs low: the agent was stopped before it reported its own figure."
                    : "What the agent reported this job cost."
                }
              >
                {job.costSource === "stream" ? "~" : ""}${job.costUsd.toFixed(2)}
              </span>
            </>
          )}
          {model !== null && (
            <span className="text-text3" title={effortTitle(job)}>
              {facts.length > 0 || job.costUsd !== null ? " · " : ""}
              {modelName(model)}
            </span>
          )}
        </p>
      </div>
      {live && (
        <Button
          size="sm"
          variant="secondary"
          disabled={stopping}
          onClick={async () => {
            setCancelling(true);
            const result = await post(`/studio/api/jobs/${encodeURIComponent(job.jobId)}/cancel`);
            if (!result.ok) setCancelling(false);
          }}
        >
          {stopping ? "Stopping" : "Cancel"}
        </Button>
      )}
    </div>
  );
}

function headline(job: VideoJob): string {
  switch (job.state) {
    case "awaiting_review":
      return readyHeadline(job);
    case "accepted":
      return "Accepted";
    case "discarded":
      return "Discarded";
    case "failed":
    case "cancelled":
    case "interrupted":
      return videoFailure(job).headline;
    default:
      return videoHeadline(job);
  }
}

function effortTitle(job: VideoJob): string | undefined {
  const effort = job.agentEffort?.passed ?? null;
  const from = job.agentModel?.source;
  const where = from === "panel" ? "the studio's settings" : from === "claude-settings" ? "your Claude Code settings" : from === "cli" ? "the CLI's own default" : null;
  const parts = [effort === null ? null : `Effort ${effort}`, where === null ? null : `from ${where}`].filter(Boolean);
  return parts.length === 0 ? undefined : parts.join(", ");
}

function dotTone(job: VideoJob): string {
  if (job.state === "failed" || job.state === "interrupted") return "bg-danger";
  if (job.state === "awaiting_review" || job.state === "accepted") return "bg-ok";
  if (job.state === "cancelled" || job.state === "discarded") return "bg-text3";
  return "bg-accent studio-breathe";
}

/* -------------------------------------------------------------------------- */
/* A failure                                                                  */
/* -------------------------------------------------------------------------- */

function FailureCard({ job, path, inConversation }: { job: VideoJob; path: string; inConversation: boolean }) {
  const failure = videoFailure(job);
  const { post } = useStudioJobs();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const resume = async (): Promise<void> => {
    setBusy(true);
    const result = await post(`/studio/api/jobs/${encodeURIComponent(job.jobId)}/resume`);
    setBusy(false);
    const next = typeof result.data.jobId === "string" ? result.data.jobId : null;
    if (result.ok && next !== null) {
      router.push(panelHref(path, { job: next }), { scroll: false });
      return;
    }
    setSaid(typeof result.data.error === "string" ? result.data.error : `Resume answered ${result.status}.`);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3">
      {failure.detail !== null && failure.detail !== "" && (
        <p className="text-[13px] break-words text-text">{failure.detail}</p>
      )}
      <p className="text-[13px] text-text2">Nothing landed in the catalog. The source the agent wrote is kept.</p>
      <div className="flex flex-wrap items-center gap-2">
        {failure.actions.includes("resume") && (
          <Button size="sm" disabled={busy} onClick={() => void resume()}>
            {busy ? "Resuming" : "Resume"}
          </Button>
        )}
        {failure.actions.includes("revise") && !changing && (
          <Button size="sm" variant="secondary" onClick={() => setChanging(true)}>
            Try again with a change
          </Button>
        )}
        {failure.actions.includes("talk") && !inConversation && typeof job.draftId === "string" && (
          <Button size="sm" variant="ghost" href={conversationHref(path, job.draftId)}>
            Back to the conversation
          </Button>
        )}
      </div>
      {changing && (
        <div className={FADE_IN}>
          <ChangeForm job={job} path={path} onClose={() => setChanging(false)} />
        </div>
      )}
      {said !== null && <p role="alert" className="text-[13px] text-danger">{said}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The sheets                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The latest contact sheet of each scene, in play order, a slot held for
 * every scene not rendered yet so the strip shows the whole video's shape.
 * A click opens the sheet at the panel's full width, above the strip, with
 * the previous and next scene a key away.
 */
function SheetStrip({
  job,
  sheets,
  loaded,
  running,
  chapters,
}: {
  job: VideoJob;
  sheets: ContactSheet[];
  loaded: boolean;
  running: boolean;
  chapters: VideoChapter[] | null;
}) {
  const ordered = sheetsInOrder(sheets, job.classes);
  const scenes = job.classes.length > 0 ? job.classes : ordered.map((sheet) => sheet.scene);
  const [open, setOpen] = useState<string | null>(null);
  const shown = ordered.find((sheet) => sheet.scene === open) ?? null;
  const labelId = useId();
  // The runner titles a sheet by the brief's scene name; once the video has
  // stored chapters, their titles are the scene's name here as everywhere.
  const titleOf = (scene: string): string => sceneTitle(job, scene, chapters);

  if (scenes.length === 0) {
    return (
      <section aria-labelledby={labelId} className="flex min-w-0 flex-col gap-2">
        <h3 id={labelId} className={LABEL}>
          Contact sheets
        </h3>
        <p className="rounded-xl bg-surface2 px-4 py-6 text-center text-[13px] text-text2">
          {job.state === "queued" ? "The sheets appear here once the video runner starts." : "The scenes are being set up."}
        </p>
      </section>
    );
  }

  const step = (by: number): void => {
    if (shown === null) return;
    const at = ordered.indexOf(shown);
    const next = ordered[(at + by + ordered.length) % ordered.length];
    if (next !== undefined) setOpen(next.scene);
  };

  return (
    <section aria-labelledby={labelId} className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 id={labelId} className={LABEL}>
          Contact sheets
        </h3>
        <span className="text-[12px] text-text3">
          {loaded ? `${ordered.length} of ${scenes.length} scenes rendered` : ""}
        </span>
      </div>

      {/* Fades in as it opens (opacity only, so Close's autofocus and the
          keys below work from the first frame); a step to another scene
          keeps the frame and fades the new picture in once it has loaded. */}
      {shown !== null && (
        <figure
          className={cx("flex min-w-0 flex-col gap-2 rounded-xl border border-hair bg-surface2 p-2", FADE_IN)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              // The sheet closes, not the panel: without this the dialog's
              // own cancel would take Escape too.
              event.preventDefault();
              event.stopPropagation();
              setOpen(null);
            } else if (event.key === "ArrowRight") step(1);
            else if (event.key === "ArrowLeft") step(-1);
          }}
        >
          <FadeImg
            src={sheetSrc(job.jobId, shown)}
            alt={`Contact sheet for ${titleOf(shown.scene)}, round ${shown.round}`}
            className="max-h-[60dvh] w-full rounded-lg bg-black object-contain"
          />
          <figcaption className="flex flex-wrap items-center gap-2 px-1">
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">{titleOf(shown.scene)}</span>
            <span className="text-[12px] text-text3">Round {shown.round}</span>
            {ordered.length > 1 && (
              <>
                <Button size="sm" variant="ghost" onClick={() => step(-1)} aria-label="Previous scene">
                  Previous
                </Button>
                <Button size="sm" variant="ghost" onClick={() => step(1)} aria-label="Next scene">
                  Next
                </Button>
              </>
            )}
            <Button size="sm" variant="secondary" onClick={() => setOpen(null)} autoFocus>
              Close
            </Button>
          </figcaption>
        </figure>
      )}

      <ol className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:thin]">
        {scenes.map((scene, index) => {
          const sheet = ordered.find((entry) => entry.scene === scene) ?? null;
          const title = chapters === null && sheet !== null ? sheet.title : titleOf(scene);
          return (
            <li key={scene} className="w-44 shrink-0 snap-start sm:w-48">
              {sheet === null ? (
                <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-surface2 px-2 text-center">
                  <span className="text-[12px] text-text3">{running ? "Not rendered yet" : "Never rendered"}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen(open === scene ? null : scene)}
                  aria-pressed={open === scene}
                  aria-label={`Open the sheet for ${title}`}
                  className={cx(
                    "relative block aspect-video w-full overflow-hidden rounded-lg border bg-black transition-shadow",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    open === scene ? "border-accent ring-2 ring-accent" : "border-hair hover:border-border",
                  )}
                >
                  <FadeImg
                    key={sheet.renderedAt ?? sheet.scene}
                    src={sheetSrc(job.jobId, sheet)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain"
                  />
                  {sheet.round > 1 && (
                    <span className="absolute top-1.5 right-1.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white">
                      Round {sheet.round}
                    </span>
                  )}
                </button>
              )}
              <p className="mt-1.5 flex items-baseline gap-1.5 text-[12px]">
                <span className="shrink-0 tabular-nums text-text3">{index + 1}</span>
                <span className="min-w-0 truncate font-medium text-text">{title.charAt(0).toUpperCase() + title.slice(1)}</span>
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The steps and the log                                                      */
/* -------------------------------------------------------------------------- */

/** Every step from the first second; the current one pulses and nothing else moves. */
function StepList({ rows, live }: { rows: StepRow[]; live: boolean }) {
  const labelId = useId();
  return (
    <section aria-labelledby={labelId} className="min-w-0">
      <h3 id={labelId} className={cx(LABEL, "mb-2")}>
        Steps
      </h3>
      <ol className="flex flex-col">
        {rows.map((row) => (
          <li key={row.key} className={cx("flex min-h-8 items-start gap-2.5 py-1", row.status === "pending" && "opacity-45")}>
            <StepMark status={row.status} live={live} />
            <span className="min-w-0 flex-1">
              <span
                className={cx(
                  "block text-[13px] leading-5",
                  row.status === "current" ? "font-semibold text-text" : row.status === "failed" ? "font-medium text-danger" : "text-text2",
                  row.key === "lines" && "text-warn-text",
                )}
              >
                {row.label}
                {row.rounds !== null && <span className="font-normal text-text3"> · {row.rounds}</span>}
              </span>
              {row.note !== null && (
                <span className="block text-[12px] leading-4 text-text3">{row.note}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepMark({ status, live }: { status: StepRow["status"]; live: boolean }) {
  const base = "mt-1 flex size-3 shrink-0 items-center justify-center rounded-full";
  if (status === "done") {
    return (
      <span aria-hidden className={cx(base, "bg-ok text-white")}>
        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.2 5 8.5 9.5 3.5" />
        </svg>
      </span>
    );
  }
  if (status === "failed") return <span aria-hidden className={cx(base, "bg-danger")} />;
  if (status === "current") return <span aria-hidden className={cx(base, "bg-accent transition-colors duration-200 motion-reduce:transition-none", live && "studio-breathe")} />;
  return <span aria-hidden className={cx(base, "border-2 border-border")} />;
}

/**
 * The log of what happened: one line per wrapper call and per sheet read,
 * from the runner's own records (D24), newest last, and the runner's seeding
 * of the voice before any of it.
 */
function MakingLog({ job, events, chapters }: { job: VideoJob; events: StudioEvent[]; chapters: VideoChapter[] | null }) {
  const labelId = useId();
  const lines = narration(events, 40);
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (box.current !== null) box.current.scrollTop = box.current.scrollHeight;
  }, [lines.length]);
  const seeded = job.seeded ?? null;
  return (
    <section aria-labelledby={labelId} className="min-w-0">
      <h3 id={labelId} className={cx(LABEL, "mb-2")}>
        What happened
      </h3>
      {lines.length === 0 ? (
        <p className="text-[13px] text-text3">
          {job.state === "queued"
            ? "Nothing yet: the video runner has not picked this up."
            : seeded !== null
              ? `${seeded.seeded} of ${seeded.wanted} lines were already voiced.`
              : isActive(job.state)
                ? "Nothing yet. Each render, narration and sheet the agent reads shows up here."
                : "Nothing was recorded for this job in this tab."}
        </p>
      ) : (
        <ol ref={box} aria-live="polite" className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {lines.map((line) => (
            <li key={`${line.at}-${line.note}`} className="flex gap-2 text-[13px] leading-5">
              <span className="w-11 shrink-0 tabular-nums text-text3">{clock(line.at)}</span>
              <span className="min-w-0 break-words text-text2">{logLine(line.note, job, chapters)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function clock(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** At review the making-of folds away under the video, where it is still one press off. */
function HowItWasMade({
  job,
  rows,
  events,
  sheets,
  chapters,
}: {
  job: VideoJob;
  rows: StepRow[];
  events: StudioEvent[];
  sheets: ContactSheet[];
  chapters: VideoChapter[] | null;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="min-w-0 border-t border-hair pt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((was) => !was)}
        className="flex w-full items-center justify-between rounded-md text-left text-[13px] font-semibold text-text2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span>How it was made</span>
        <span className="font-normal text-text3">{open ? "Hide" : "Show"}</span>
      </button>
      <Collapse open={open} id={id}>
        <div className="flex flex-col gap-5 pt-4">
          <SheetStrip job={job} sheets={sheets} loaded running={false} chapters={chapters} />
          <div className="grid min-w-0 gap-5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <StepList rows={rows} live={false} />
            <MakingLog job={job} events={events} chapters={chapters} />
          </div>
        </div>
      </Collapse>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The review                                                                 */
/* -------------------------------------------------------------------------- */

function Review({
  job,
  path,
  cues,
  chapters,
}: {
  job: VideoJob;
  path: string;
  /** Undefined for a silent video, or before the transcript is read. */
  cues: TranscriptCue[] | undefined;
  chapters: VideoChapter[] | null;
}) {
  const files = mediaFiles(job.slug);
  const ready = job.state === "awaiting_review";
  const [seek, setSeek] = useState<{ seconds: number; key: number } | undefined>(undefined);
  const playerBox = useRef<HTMLDivElement>(null);
  const board = storyboard(job, chapters);
  // A chapter pressed below the fold plays where the person can see it.
  const jump = (seconds: number): void => {
    setSeek((held) => ({ seconds, key: (held?.key ?? 0) + 1 }));
    const still = prefersReducedMotion();
    playerBox.current?.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
  };
  const changes = changedLines(job, chapters);
  const actions = reviewActions(job);

  return (
    <div ref={playerBox} className="flex min-w-0 scroll-mt-4 flex-col gap-5">
      {ready ? (
        <VideoPlayer
          src={mediaHref(job.jobId, files.mp4)}
          poster={mediaHref(job.jobId, files.poster)}
          title={job.title ?? job.slug}
          chapters={chapters ?? undefined}
          transcript={cues}
          seekTo={seek}
          // The storyboard beside the transcript, in the same card the
          // library uses: the chapters, each scene's lines as voiced, and a
          // jump to where each starts.
          tabs={[
            {
              id: "chapters",
              label: "Chapters",
              count: board.length,
              content: (
                <Chapters scenes={board} onJump={jump} />
              ),
            },
          ]}
        />
      ) : (
        <Landed job={job} path={path} />
      )}

      {changes.length > 0 && <ChangedLines lines={changes} />}
      {job.gate !== null && ready && <Checks job={job} />}
      <Actions job={job} path={path} accept={actions.accept} discard={actions.discard} change={actions.change} />
    </div>
  );
}

/**
 * The storyboard beside the player: each scene's title and its lines as
 * voiced, the title a jump to where the scene starts when the chapters are
 * known. A changed line carries a mark; the list under says what it was.
 */
function Chapters({
  scenes,
  onJump,
}: {
  scenes: ReturnType<typeof storyboard>;
  onJump: (seconds: number) => void;
}) {
  if (scenes.length === 0) return <p className="text-[13px] text-text3">This video has no chapters.</p>;
  return (
    <div className="min-w-0">
      <ol className="flex flex-col divide-y divide-hair">
        {scenes.map((scene, index) => (
          <li key={scene.scene} className="flex min-w-0 flex-col gap-1.5 py-3 first:pt-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="w-5 shrink-0 text-[12px] tabular-nums text-text3">{index + 1}</span>
              {scene.start === null ? (
                <span className="min-w-0 flex-1 text-[14px] font-semibold text-text">{scene.title}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onJump(scene.start ?? 0)}
                  className="min-w-0 flex-1 rounded-sm text-left text-[14px] font-semibold text-text hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  aria-label={`Play from ${scene.title}, at ${formatTimecode(scene.start)}`}
                >
                  {scene.title}
                </button>
              )}
              {scene.start !== null && <span className="shrink-0 text-[12px] tabular-nums text-text3">{formatTimecode(scene.start)}</span>}
            </div>
            {scene.lines.length > 0 && (
              <ul className="flex flex-col gap-1 pl-7">
                {scene.lines.map((line, at) => (
                  <li key={at} className="text-[13px] leading-5 text-text2">
                    {line.changed && (
                      <span className="mr-1.5 inline-block rounded-sm bg-warn-tint px-1 text-[11px] font-semibold text-warn-text">Changed</span>
                    )}
                    {line.text}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Every line the agent changed, beside the brief's version (D47, D48). */
function ChangedLines({ lines }: { lines: ReturnType<typeof changedLines> }) {
  const labelId = useId();
  return (
    <section aria-labelledby={labelId} className="min-w-0">
      <h3 id={labelId} className={cx(LABEL, "mb-2")}>
        {lines.length === 1 ? "One line differs from the brief" : `${lines.length} lines differ from the brief`}
      </h3>
      <ul className="flex flex-col gap-2">
        {lines.map((line, at) => (
          <li key={at} className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-surface2 px-4 py-3">
            <p className="text-[12px] text-text3">
              <span className="font-semibold text-text2">{changeWord(line.kind)}</span> in {line.title}
            </p>
            {line.brief !== null && (
              <p className="text-[13px] leading-5 text-text3">
                <span className="sr-only">The brief said: </span>
                <span className="text-text2 line-through decoration-text3">{line.brief}</span>
              </p>
            )}
            {line.voiced.length > 0 && (
              <p className="text-[13px] leading-5 text-text">
                <span className="sr-only">Voiced as: </span>
                {line.voiced.join(" ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The gate's ten steps, and its warnings, which a person may accept past. */
function Checks({ job }: { job: VideoJob }) {
  const gate = job.gate;
  const [open, setOpen] = useState(false);
  const id = useId();
  if (gate === null) return null;
  const passed = gate.steps.filter((step) => step.ok).length;
  const length = gate.length;
  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className={LABEL}>Checks</h3>
        <span className="text-[12px] text-text3">
          {passed} of {gate.steps.length} passed
          {length !== null && ` · ${spokenLength(length.durationSeconds)} against ${spokenLength(length.predictedSeconds)} predicted`}
          {length !== null && length.bytes > 0 && ` · ${formatSize(length.bytes)}`}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((was) => !was)}
          className="ml-auto rounded-sm text-[12px] font-medium text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {open ? "Hide each check" : "Show each check"}
        </button>
      </div>
      {gate.warnings.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 rounded-xl bg-warn-tint px-4 py-2.5">
          {uniqueWarnings(gate.warnings).map(({ text, count }) => (
            <li key={text} className="text-[13px] leading-5 text-warn-text">
              {text.charAt(0).toUpperCase() + text.slice(1)}
              {count > 1 && <span className="text-warn-text/80"> ({count} times)</span>}
            </li>
          ))}
        </ul>
      )}
      <Collapse open={open} id={id}>
        <ul className="mt-2 flex flex-col">
          {gate.steps.map((step) => (
            <li key={step.name} className="flex min-w-0 items-start gap-2.5 py-1">
              <StepMark status={step.ok ? "done" : "failed"} live={false} />
              <span className="min-w-0 flex-1 text-[13px] leading-5">
                <span className={step.ok ? "text-text2" : "font-medium text-danger"}>{gateStepLabel(step.name)}</span>
                <span className="block text-[12px] leading-4 break-words text-text3">{step.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Collapse>
    </section>
  );
}

/** After an accept: where it landed. */
function Landed({ job, path }: { job: VideoJob; path: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl bg-ok-tint px-4 py-3">
      <p className="text-[14px] font-semibold text-ok-text">In the catalog as {job.title ?? job.slug}</p>
      <p className="text-[13px] text-text2">
        The library plays it with its chapters and transcript.
      </p>
      <div>
        <Button size="sm" href={libraryHref(job.slug, path)}>
          Open in the library
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Accept, Discard, Change                                                    */
/* -------------------------------------------------------------------------- */

function Actions({ job, path, accept, discard, change }: { job: VideoJob; path: string; accept: boolean; discard: boolean; change: boolean }) {
  const { post, refresh } = useStudioJobs();
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "discard" | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [changing, setChanging] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const act = async (verb: "accept" | "discard"): Promise<void> => {
    setBusy(verb);
    const result = await post(`/studio/api/jobs/${encodeURIComponent(job.jobId)}/${verb}`);
    setBusy(null);
    setConfirmDiscard(false);
    const note = typeof result.data.note === "string" ? result.data.note : null;
    const error = typeof result.data.error === "string" ? result.data.error : null;
    setSaid(result.ok ? null : { ok: false, text: error ?? note ?? `${verb === "accept" ? "Accept" : "Discard"} answered ${result.status}.` });
    await refresh();
    router.refresh();
  };

  if (!accept && !discard && !change) return null;

  return (
    <div className="flex min-w-0 flex-col gap-3 border-t border-hair pt-4">
      {/* The presses and the change form swap in place, each fading in. */}
      {!changing && (
        <div className={cx("flex flex-wrap items-center gap-2", FADE_IN)}>
          {accept && (
            <Button disabled={busy !== null} onClick={() => void act("accept")}>
              {busy === "accept" ? "Accepting" : "Accept"}
            </Button>
          )}
          {change && (
            <Button variant="secondary" disabled={busy !== null} onClick={() => setChanging(true)}>
              Change
            </Button>
          )}
          {discard &&
            (confirmDiscard ? (
              <span className={cx("flex flex-wrap items-center gap-2", FADE_IN)}>
                <span className="text-[13px] text-text2">The renders are deleted; the source is kept.</span>
                <Button size="sm" variant="warn" disabled={busy !== null} onClick={() => void act("discard")}>
                  {busy === "discard" ? "Discarding" : "Discard it"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDiscard(false)}>
                  Keep it
                </Button>
              </span>
            ) : (
              <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirmDiscard(true)} className={FADE_IN}>
                Discard
              </Button>
            ))}
        </div>
      )}
      {accept && !changing && (
        <p className={cx("text-[12px] text-text3", FADE_IN)}>Nothing is in the catalog until Accept. Accept stores the video, its sidecars and its poster in one step.</p>
      )}
      {changing && (
        <div className={FADE_IN}>
          <ChangeForm job={job} path={path} onClose={() => setChanging(false)} />
        </div>
      )}
      {said !== null && (
        <p role="alert" className="text-[13px] text-danger">
          {said.text}
        </p>
      )}
    </div>
  );
}

/**
 * "What should change?" and two ways to send it (D52).
 *
 * Change the picture revises the job: the agent resumes its own session with
 * the words, from the source it wrote, and re-voices only what it changes. On
 * a job in review that sets the reviewed video aside in the same step, which
 * the line under the box says before the press rather than after.
 *
 * Change what is said goes back to the conversation, the words in the
 * composer after a Video chip, where the planner writes a `change` brief the
 * person approves before anything is spent. A job with no conversation (one
 * posted straight to the runner) has only the first.
 */
function ChangeForm({ job, path, onClose }: { job: VideoJob; path: string; onClose: () => void }) {
  const { refresh } = useStudioJobs();
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fieldId = useId();
  const hintId = useId();
  const reviewing = job.state === "awaiting_review";
  const canTalk = typeof job.draftId === "string";

  const revise = async (): Promise<void> => {
    // Cmd+Enter reaches here as well as the button, which is disabled while busy.
    if (busy) return;
    const wrong = changeProblem(text);
    if (wrong !== null) {
      setProblem(wrong);
      return;
    }
    setBusy(true);
    // Posted directly rather than through the provider's `post`, which reads
    // the job list before it returns: on a job in review that list already
    // says discarded, and the panel flashed "Discarded" before it moved on.
    // The panel moves to the new job first and the list is read after.
    let ok = false;
    let status = 0;
    let data: Record<string, unknown> = {};
    try {
      const response = await fetch(`/studio/api/jobs/${encodeURIComponent(job.jobId)}/revise`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changes: text.trim() }),
        cache: "no-store",
      });
      ok = response.ok;
      status = response.status;
      data = ((await response.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    } catch (error) {
      data = { error: `The studio runner is not answering: ${(error as Error).message}` };
    }
    const next = typeof data.jobId === "string" ? data.jobId : null;
    if (ok && next !== null) {
      router.push(panelHref(path, { job: next }), { scroll: false });
      void refresh();
      router.refresh();
      return;
    }
    setBusy(false);
    // A lost reply after the runner committed shows up on the next poll as
    // this job set aside with a link to its change (`childJob`).
    void refresh();
    setProblem(typeof data.error === "string" ? data.error : `The runner answered ${status}.`);
  };

  const talk = (): void => {
    const wrong = changeProblem(text);
    if (wrong !== null) {
      setProblem(wrong);
      return;
    }
    if (typeof job.draftId !== "string") return;
    leaveOpener(sessionStore(), job.draftId, { send: null, compose: text.trim(), source: null, mentions: ["video"] });
    router.push(conversationHref(path, job.draftId), { scroll: false });
    announceOpener(job.draftId);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-surface px-4 py-3">
      <label htmlFor={fieldId} className="text-[14px] font-semibold text-text">
        What should change?
      </label>
      <textarea
        id={fieldId}
        value={text}
        autoFocus
        rows={3}
        maxLength={CHANGE_LIMIT + 200}
        aria-describedby={hintId}
        aria-invalid={problem !== null}
        placeholder="The arrow in scene 3 points at the wrong box"
        onChange={(event) => {
          setText(event.target.value);
          if (problem !== null) setProblem(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void revise();
          }
        }}
        className={cx("min-h-20 w-full resize-y rounded-lg border-2 border-border bg-surface px-3 py-2 leading-5 text-text outline-none placeholder:text-text3 focus:border-accent aria-invalid:border-danger", FIELD_TEXT.px14)}
      />
      <p id={hintId} className="text-[12px] leading-4 text-text3">
        {changeHint(reviewing, canTalk)}
      </p>
      {problem !== null && (
        <p role="alert" className="text-[13px] text-danger">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => void revise()} aria-keyshortcuts="Meta+Enter Control+Enter">
          {busy ? "Starting" : "Change the picture"}
        </Button>
        {canTalk && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={talk}>
            Change what is said
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

