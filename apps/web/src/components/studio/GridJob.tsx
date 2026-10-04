"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";

import { FADE_IN, POP_IN } from "@/components/studio/motion";
import { PanelLink } from "@/components/studio/PanelLink";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { Duration } from "@/components/studio/JobStrip";
import { KindBadge, TILE_LIFT } from "@/components/studio/KindBadge";
import { Chip } from "@/components/studio/StudioChrome";
import { finishedHeadline, type Job } from "@/lib/studio-jobs";
import {
  adoptPicture,
  afterShotHref,
  failureLine,
  jobForTarget,
  liveShotFor,
  LIVE_POLL_MS,
  loaderHeadline,
  loaderStep,
  newDiagramJobs,
  NO_PICTURES,
  retiredUrls,
  rowJobLabel,
  rowWords,
  settlePicture,
  showsThumbnail,
  tileStage,
  wantsLivePicture,
  type LivePictures,
  type TileStage,
} from "@/lib/studio-tile-jobs";
import { conversationHref, panelHref } from "@/lib/studio-view";
import { useElapsed } from "@/lib/use-elapsed";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * A job, shown in the grid where its diagram is ("The job in the grid" in
 * docs/STUDIO-CHAT-FIRST.md).
 *
 * An extend job draws over its diagram's tile: the thumbnail blurred behind a
 * loader. A new diagram gets a card of its own after the plus card, blank
 * until the agent's first picture. While the job runs, the blurred picture is
 * the newest screenshot the agent took of its own work, so the tile changes as
 * the drawing does; when it is ready to review, the card shows the candidate
 * sharp. Clicking either opens the job in the panel, where Accept and Discard
 * are.
 *
 * Everything this decides is in `studio-tile-jobs.ts`, which is tested; this
 * file is the markup and the polling.
 */

/* -------------------------------------------------------------------------- */
/* On an existing diagram's tile                                               */
/* -------------------------------------------------------------------------- */

/**
 * The loader over a diagram's thumbnail, when a job is drawing onto it.
 *
 * A sibling of the tile's own link rather than a child of it, positioned over
 * the thumbnail's 4:3 box, because its own link and its Cancel inside another
 * link would be nested interactive content.
 */
export function TileJob({
  target,
  title,
  thumbnail,
  path,
}: {
  target: string;
  title: string;
  /** The diagram's exported SVG, the backdrop until the agent takes a picture. */
  thumbnail: string | null;
  path: string;
}) {
  const { jobs, ended, dismissed } = useStudioJobs();
  const job = jobForTarget(jobs, target, ended, dismissed);
  if (job === null) return null;
  return (
    // Fades in over the tile as the job starts; opacity only, since a scale
    // would show the thumbnail round its edges for a moment.
    <div className={`absolute inset-x-0 top-0 aspect-[4/3] overflow-hidden border-b border-[var(--border)] ${FADE_IN}`}>
      {/* Keyed by job, so a second job on the same diagram starts from its own pictures. */}
      <JobStage key={job.jobId} job={job} title={title} thumbnail={thumbnail} path={path} isNew={false} />
    </div>
  );
}

/**
 * The same, as a few words in a list row: the row has no room for a picture.
 *
 * A link to the job's own panel, as a new diagram's row is, raised above the
 * row's stretched selection link (`DiagramRow`), so pressing the words opens
 * the job rather than selecting the diagram.
 */
export function RowJob({ target, title, path }: { target: string; title: string; path: string }) {
  const { jobs, ended, dismissed } = useStudioJobs();
  const job = jobForTarget(jobs, target, ended, dismissed);
  if (job === null) return null;
  return (
    <PanelLink
      href={panelHref(path, { job: job.jobId })}
      scroll={false}
      aria-label={rowJobLabel(job, title)}
      // Shrinks before the title does, and never past about half the row:
      // the diagram's name is what identifies the row, the status is extra.
      className="relative z-10 flex min-w-0 max-w-[45%] items-center rounded px-1 hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <RowWords job={job} />
    </PanelLink>
  );
}

/* -------------------------------------------------------------------------- */
/* A new diagram                                                              */
/* -------------------------------------------------------------------------- */

/**
 * One card per job drawing a diagram the listing does not have yet.
 *
 * `targets` is every diagram in the listing, not the filtered view: an extend
 * job on a diagram a filter hides is not a new diagram, and the strip covers it.
 * Rendered straight after the plus card in either layout, under any filter,
 * because both are about something the person started.
 */
export function NewDiagramJobs({
  targets,
  path,
  layout,
}: {
  targets: string[];
  path: string;
  layout: "grid" | "list";
}) {
  const { jobs, ended, dismissed } = useStudioJobs();
  const existing = useMemo(() => new Set(targets), [targets]);
  const drawing = newDiagramJobs(jobs, existing, ended, dismissed);
  return drawing.map((job) =>
    layout === "grid" ? (
      <NewDiagramCard key={job.jobId} job={job} path={path} />
    ) : (
      <NewDiagramRow key={job.jobId} job={job} path={path} />
    ),
  );
}

function NewDiagramCard({ job, path }: { job: Job; path: string }) {
  const title = job.title ?? "New diagram";
  return (
    <div className={`relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] ${TILE_LIFT} ${POP_IN}`}>
      <div className="relative aspect-[4/3] overflow-hidden border-b border-[var(--border)]">
        <JobStage job={job} title={title} thumbnail={null} path={path} isNew />
        <KindBadge kind="diagram" />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 p-3">
        <span className="line-clamp-2 text-sm font-medium">{title}</span>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Chip>{job.topic}</Chip>
        </div>
      </div>
    </div>
  );
}

function NewDiagramRow({ job, path }: { job: Job; path: string }) {
  return (
    <PanelLink
      href={panelHref(path, { job: job.jobId })}
      scroll={false}
      className={`flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-xs transition-colors hover:bg-[var(--surface-hover)] ${FADE_IN}`}
    >
      <span className="flex h-6 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--surface2)]">
        <Dot stage={tileStage(job)} />
      </span>
      <KindBadge kind="diagram" inline />
      <span className="min-w-[5rem] flex-1 truncate font-medium">{job.title ?? "New diagram"}</span>
      <span className="flex min-w-0 max-w-[45%]">
        <RowWords job={job} />
      </span>
    </PanelLink>
  );
}

/* -------------------------------------------------------------------------- */
/* The stage: backdrop, link, status                                           */
/* -------------------------------------------------------------------------- */

function JobStage({
  job,
  title,
  thumbnail,
  path,
  isNew,
}: {
  job: Job;
  title: string;
  thumbnail: string | null;
  path: string;
  isNew: boolean;
}) {
  const stage = tileStage(job);
  const frame = useRef<HTMLDivElement>(null);
  const { pictures: live, settle } = useLivePicture(job, frame);
  const headline = loaderHeadline(job);
  const label =
    stage === "review"
      ? isNew
        ? `Review ${title}`
        : `Review the new version of ${title}`
      : stage === "failed"
        ? `${title}: ${failureLine(job)}. Open the job`
        : `${title}: ${headline}. Open the job`;

  return (
    <div ref={frame} className="relative h-full w-full bg-[var(--surface2)]">
      <Backdrop job={job} stage={stage} live={live} settle={settle} thumbnail={thumbnail} />
      <PanelLink
        href={panelHref(path, { job: job.jobId })}
        scroll={false}
        aria-label={label}
        className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
      />
      <Status job={job} stage={stage} headline={headline} path={path} />
    </div>
  );
}

/**
 * The picture behind the loader.
 *
 * Working: the newest live picture, else the diagram's thumbnail, else the
 * blank surface, blurred and veiled, with the light crossing it. Ready: the
 * candidate as the gate photographed it, sharp, falling back to the last live
 * picture. Failed: whatever was last there, blurred further.
 *
 * Any picture sits on the tile thumbnail's own light mat, the constant
 * `Thumbnail` in `DiagramTile.tsx` uses, and the veil goes over both. A
 * diagram is drawn for a light page, so without the mat a dark palette showed
 * its strokes on charcoal until the first live picture came in.
 */
const MAT = "absolute inset-0 bg-diagram-matte";

function Backdrop({
  job,
  stage,
  live,
  settle,
  thumbnail,
}: {
  job: Job;
  stage: TileStage;
  live: LivePictures;
  settle: () => void;
  thumbnail: string | null;
}) {
  const [afterMissing, setAfterMissing] = useState(false);
  const [afterShown, setAfterShown] = useState(false);
  const afterImage = useRef<HTMLImageElement>(null);
  // The server renders this `<img>`, so a cached picture can finish loading
  // before React attaches `onLoad`, and the event is never seen: ask the
  // element itself once it is mounted.
  useEffect(() => {
    const image = afterImage.current;
    if (image !== null && image.complete && image.naturalWidth > 0) setAfterShown(true);
  }, [stage]);

  if (stage === "review") {
    const fallback = live.current ?? thumbnail;
    const src = afterMissing ? fallback : afterShotHref(job.jobId);
    return (
      <div className="absolute inset-0">
        {src !== null && <div aria-hidden className={MAT} />}
        {/* Until the candidate's picture has loaded (a canvas shot can be a
            3000px PNG), the last picture stays, blurred, rather than a blank. */}
        {!afterShown && fallback !== null && (
          <div aria-hidden className="absolute inset-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- see Thumbnail. */}
            <img src={fallback} alt="" className="absolute inset-0 h-full w-full object-contain p-2 blur-[3px]" />
            <div className="studio-veil absolute inset-0" />
          </div>
        )}
        {src !== null && (
          // eslint-disable-next-line @next/next/no-img-element -- a runner file behind the proxy, see Thumbnail.
          <img
            ref={afterImage}
            src={src}
            alt=""
            decoding="async"
            onLoad={() => setAfterShown(true)}
            onError={() => setAfterMissing(true)}
            // Clear of the status bar, so the bar never sits on the drawing.
            className={`relative h-full w-full object-contain px-2 pt-2 pb-14 ${afterShown ? "studio-fade-in" : "opacity-0"}`}
          />
        )}
      </div>
    );
  }

  const blur = stage === "failed" ? "blur-[6px]" : "blur-[3px]";
  // Contained, and framed as the tile's own thumbnail is, never cropped to
  // fill: the first real run added a note in the bottom corner of a nearly
  // square drawing, and a cover-cropped backdrop cut exactly that change off.
  // Framed the same, the thumbnail blurs in place when a job starts.
  // The blur deepens, and the veil thickens, as a job fails: a change, not a cut.
  const layer = `absolute inset-0 h-full w-full object-contain p-2 ${blur} transition-[filter] duration-300 ease-out motion-reduce:transition-none`;
  const thumbnailShown = thumbnail !== null && showsThumbnail(live);
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {(thumbnailShown || live.current !== null) && <div className={MAT} />}
      {thumbnailShown && (
        // eslint-disable-next-line @next/next/no-img-element -- see Thumbnail.
        <img src={thumbnail} alt="" decoding="async" className={layer} />
      )}
      {live.previous !== null && (
        // eslint-disable-next-line @next/next/no-img-element -- an object URL of a fetched PNG.
        <img src={live.previous} alt="" className={layer} />
      )}
      {live.current !== null && (
        // eslint-disable-next-line @next/next/no-img-element -- an object URL of a fetched PNG.
        <img
          key={live.current}
          src={live.current}
          alt=""
          onAnimationEnd={settle}
          className={`${layer} ${live.settled ? "" : "studio-fade-in"}`}
        />
      )}
      <div className={`absolute inset-0 transition-[background-color] duration-300 ease-out motion-reduce:transition-none ${stage === "failed" ? "studio-veil-strong" : "studio-veil"}`} />
      {stage === "working" && <div className="studio-shimmer absolute inset-0 overflow-hidden" />}
    </div>
  );
}

/**
 * The bar at the foot of the picture: what the job is doing and the one
 * control that belongs here.
 *
 * `pointer-events-none` on the bar and back on for its buttons, so a click on
 * the words opens the job like a click anywhere else on the picture.
 */
function Status({
  job,
  stage,
  headline,
  path,
}: {
  job: Job;
  stage: TileStage;
  headline: string;
  path: string;
}) {
  const { post, dismiss } = useStudioJobs();
  const [cancelling, setCancelling] = useState(false);

  const bar =
    "studio-glass pointer-events-none absolute inset-x-2 bottom-2 flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs shadow-sm";
  const control =
    "pointer-events-auto inline-flex h-7 shrink-0 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

  if (stage === "review") {
    return (
      <div className={bar}>
        <Dot stage={stage} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-[var(--foreground)]">{headline}</span>
          <span className="block truncate text-[var(--muted)]">{capitalise(finishedHeadline(job))}</span>
        </span>
        <span className="inline-flex h-7 shrink-0 items-center rounded-md bg-[var(--accent)] px-2 text-xs font-medium text-white">
          Review
        </span>
      </div>
    );
  }

  if (stage === "failed") {
    return (
      <div className={`${bar} flex-wrap`}>
        <Dot stage={stage} />
        <span className="min-w-0 flex-1 truncate font-medium text-[var(--danger)]">{failureLine(job)}</span>
        <span className="flex w-full justify-end gap-1.5">
          {typeof job.draftId === "string" && (
            <PanelLink href={conversationHref(path, job.draftId)} scroll={false} className={control}>
              Talk it through
            </PanelLink>
          )}
          <button type="button" onClick={() => dismiss(job.jobId)} className={control}>
            Dismiss
          </button>
        </span>
      </div>
    );
  }

  const stopping = cancelling || job.cancelRequestedAt !== null;
  return (
    <>
      <div className={bar}>
        <Dot stage={stage} />
        <span className="min-w-0 flex-1">
          <span role="status" className="block truncate font-medium text-[var(--foreground)]">
            {headline}
          </span>
          <StepAndTime job={job} />
        </span>
        <button
          type="button"
          disabled={stopping}
          onClick={async () => {
            setCancelling(true);
            const result = await post(`/studio/api/jobs/${encodeURIComponent(job.jobId)}/cancel`);
            if (!result.ok) setCancelling(false);
          }}
          className={control}
        >
          {stopping ? "Stopping" : "Cancel"}
        </button>
      </div>
      {/* The only motion that says "running" without the light: a strip along
          the picture's foot, indeterminate like the panel's bar (D23). */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-[var(--chip-bg)]">
        <span className="block h-full w-1/3 animate-[studio-slide_1.6s_ease-in-out_infinite] bg-[var(--accent)]" />
      </span>
    </>
  );
}

function StepAndTime({ job }: { job: Job }) {
  const ms = useElapsed(job);
  const step = loaderStep(job);
  const time = <Duration ms={ms} live={job.finished === null} />;
  return (
    <span className="block truncate tabular-nums text-[var(--muted)]">
      {step === null ? time : <>{step} · {time}</>}
    </span>
  );
}

/** The list row's version: a dot, the words, the time. */
function RowWords({ job }: { job: Job }) {
  const stage = tileStage(job);
  const ms = useElapsed(job);
  // The words truncate first; the dot and the time never do.
  return (
    <span
      className={`flex min-w-0 max-w-full items-center gap-1.5 ${stage === "failed" ? "text-[var(--danger)]" : "text-[var(--muted-strong)]"}`}
    >
      <Dot stage={stage} />
      <span className="min-w-0 truncate">{rowWords(job)}</span>
      {stage === "working" && (
        <span className="shrink-0 text-[var(--muted)]">
          <Duration ms={ms} live={job.finished === null} />
        </span>
      )}
    </span>
  );
}

function Dot({ stage }: { stage: TileStage }) {
  const tone =
    stage === "failed" ? "bg-[var(--danger)]" : stage === "review" ? "bg-[var(--ok)]" : "bg-[var(--accent)] studio-breathe";
  return <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${tone}`} />;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* -------------------------------------------------------------------------- */
/* The live picture                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Poll the job's live picture while it runs and the tile is on screen.
 *
 * Conditional by hand (`If-None-Match` with `cache: "no-store"`), so an
 * unchanged picture is a 304 with no body whatever the browser's cache
 * decides to keep. A new picture is decoded before it is shown, so the tile
 * never swaps to a half-loaded image. One request when the tile first shows a
 * job that is not running, so a failed card still has its last picture.
 *
 * One poll at a time: a tick that finds the last one still going is skipped,
 * so a large picture slow to decode is not overtaken by a later one, and an
 * answer to an older poll than the picture showing is dropped regardless
 * (`adoptPicture`). Leaving the screen aborts the poll in flight. Every object
 * URL is revoked once nothing shows it, a decode that failed included.
 */
function useLivePicture(
  job: Job,
  frame: RefObject<HTMLElement | null>,
): { pictures: LivePictures; settle: () => void } {
  const [pictures, setPictures] = useState<LivePictures>(NO_PICTURES);
  const visible = useOnScreen(frame);
  const pageHidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
  const tag = useRef<string | null>(null);
  const urls = useRef<string[]>([]);
  const issued = useRef(0);
  const polling = wantsLivePicture(job, visible, pageHidden);
  const live = liveShotFor(job);
  const once = live !== null && visible && !pageHidden && job.state !== "running" && job.state !== "queued";
  const jobId = job.jobId;

  useEffect(() => {
    if (live === null || (!polling && !once)) return;
    const controller = new AbortController();
    let busy = false;
    const tick = async (): Promise<void> => {
      if (busy) return;
      busy = true;
      const seq = (issued.current += 1);
      let url: string | null = null;
      let adopted = false;
      try {
        const response = await fetch(live, {
          cache: "no-store",
          signal: controller.signal,
          headers: tag.current === null ? {} : { "if-none-match": tag.current },
        });
        if (response.status !== 200) return;
        const etag = response.headers.get("etag");
        url = URL.createObjectURL(await response.blob());
        const image = new Image();
        image.src = url;
        await image.decode();
        if (controller.signal.aborted) return;
        const made = url;
        const still = prefersReducedMotion();
        tag.current = etag;
        urls.current.push(made);
        adopted = true;
        setPictures((held) => adoptPicture(held, made, seq, still) ?? held);
      } catch {
        // A poll that fails is the next poll's problem: the runner going away
        // is said by the strip and the page, not by a tile.
      } finally {
        if (!adopted && url !== null) URL.revokeObjectURL(url);
        busy = false;
      }
    };
    void tick();
    const timer = polling ? setInterval(() => void tick(), LIVE_POLL_MS) : null;
    return () => {
      controller.abort();
      if (timer !== null) clearInterval(timer);
    };
  }, [jobId, live, polling, once]);

  // Whatever nothing shows any more is revoked, including a picture a stale
  // answer brought that `adoptPicture` refused.
  useEffect(() => {
    const retired = new Set(retiredUrls(urls.current, pictures));
    for (const url of retired) URL.revokeObjectURL(url);
    urls.current = urls.current.filter((url) => !retired.has(url));
  }, [pictures]);

  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
    },
    [],
  );

  const settle = useCallback(() => setPictures(settlePicture), []);
  return { pictures, settle };
}

function subscribeVisibility(change: () => void): () => void {
  document.addEventListener("visibilitychange", change);
  return () => document.removeEventListener("visibilitychange", change);
}

/** Whether the element is on screen, or within a screen's margin of it. */
function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setOn(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return on;
}
