"use client";

import { StudioTime } from "@/components/studio/StudioZone";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { FADE_IN, POP_IN } from "@/components/studio/motion";
import { FadeImg } from "@/components/studio/motion-parts";
import { PanelLink } from "@/components/studio/PanelLink";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { Duration } from "@/components/studio/JobStrip";
import { KindBadge, KindWord } from "@/components/studio/KindBadge";
import { usePanelHost } from "@/components/studio/panel-host";
import { JOB_BAR, JOB_CONTROL, TILE, TILE_ACTIONS, TILE_LIFT } from "@/components/studio/surfaces";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { buttonClasses, cx, linkClasses } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { useImageReveal } from "@/components/ui/use-image-reveal";
import { useSheets } from "@/components/studio/video/use-video-job";
import { useElapsed } from "@/lib/use-elapsed";
import { createDraft, idempotencyKey } from "@/lib/studio-drafts";
import { extendKey, forgetExtendKey, sessionStore } from "@/lib/studio-extend";
import {
  changeDraftOutcome,
  libraryHref,
  mediaHref,
  newestSheet,
  newVideoJobs,
  posterHref,
  sheetSrc,
  spokenLength,
  videoFailureLine,
  videoHeadline,
  videoJobForSlug,
  videoStepCount,
  videoTileStage,
  type VideoJob,
  type StudioVideo,
  type VideoTileStage,
} from "@/lib/studio-video";
import { conversationHref, gridHref, panelHref } from "@/lib/studio-view";

/**
 * Studio videos in the grid, and a video job where its video is (docs/
 * STUDIO-VIDEOS.md phase 2; "The job in the grid" in STUDIO-CHAT-FIRST.md).
 *
 * A landed video is a poster tile: the poster the gate cut, contained in the
 * tile's 4:3 frame on black, its length in the corner, and Change on hover,
 * which opens a conversation on it. Pressing it plays the video in a preview
 * dialog over the grid (`?play=`, D85 of STUDIO-CHAT-FIRST.md); a modified
 * click still opens the library page that plays it with its chapters. A video being made gets the diagram loader's pattern:
 * a card after the plus card, or over its own tile when it is a change, with
 * the newest contact sheet blurred under a veil as the picture, the step and
 * the time in a bar at its foot, and Cancel. The contact sheet is what the
 * agent last looked at, so the tile moves a preview round at a time.
 *
 * Every judgement here is in `lib/studio-video.ts`, which is tested.
 */

/* -------------------------------------------------------------------------- */
/* A landed video                                                             */
/* -------------------------------------------------------------------------- */

export function VideoTile({ video, path }: { video: StudioVideo; path: string }) {
  const slug = video.slug;
  const title = video.title ?? slug;
  return (
    <div className={cx("group hover:bg-surface2", TILE, TILE_LIFT)}>
      <PanelLink
        href={libraryHref(slug, gridHref(path))}
        panel={panelHref(path, { play: slug })}
        aria-label={`Play video: ${title}`}
        className="flex min-w-0 flex-col"
      >
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-border bg-black">
          {video.posterAssetId !== null ? (
            // A blob behind the asset route, which the optimiser cannot resize; it fades in once loaded.
            <FadeImg src={posterHref(video.posterAssetId)} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-white/70">No poster</span>
          )}
          <PlayMark />
          {video.durationSeconds !== null && (
            <span className="absolute right-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
              {clockLength(video.durationSeconds)}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 p-3">
          <span className="line-clamp-2 text-sm font-medium">{title}</span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {video.topic !== null && <Badge>{video.topic}</Badge>}
            {video.updated !== "" && <span className="text-xs text-text2"><StudioTime at={video.updated} /></span>}
          </div>
        </div>
      </PanelLink>
      <TileVideoJob slug={slug} title={title} poster={video.posterAssetId === null ? null : posterHref(video.posterAssetId)} path={path} />
      {/* After a change job's loader, so the job does not hide what the tile is. */}
      <KindBadge kind="video" />
      <div className={TILE_ACTIONS}>
        <VideoChangeButton slug={slug} title={title} path={path} className={buttonClasses({ variant: "overlay", size: "xs" })} />
      </div>
    </div>
  );
}

/** The list layout's 32px row for a landed video. */
export function VideoRow({ video, path }: { video: StudioVideo; path: string }) {
  const slug = video.slug;
  const title = video.title ?? slug;
  const { jobs, ended, dismissed } = useStudioJobs();
  const job = videoJobForSlug(jobs, slug, ended, dismissed);
  return (
    <div className="relative flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-xs transition-colors hover:bg-surface2">
      <span className="flex h-6 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-black">
        {video.posterAssetId !== null && (
          <FadeImg src={posterHref(video.posterAssetId)} alt="" loading="lazy" className="h-full w-full object-contain" />
        )}
      </span>
      <KindBadge kind="video" inline />
      <PanelLink
        href={libraryHref(slug, gridHref(path))}
        panel={panelHref(path, { play: slug })}
        className="min-w-[5rem] flex-1 truncate font-medium outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
      >
        <KindWord kind="video" />
        {title}
      </PanelLink>
      {job !== null && (
        <PanelLink
          href={panelHref(path, { job: job.jobId })}
          scroll={false}
          className="relative z-10 flex min-w-0 max-w-[45%] items-center rounded px-1 hover:bg-surface2"
        >
          <RowWords job={job} />
        </PanelLink>
      )}
      <span className="hidden shrink-0 text-text2 sm:inline">{video.topic ?? ""}</span>
      <span className="w-24 shrink-0 text-right tabular-nums text-text2">{spokenLength(video.durationSeconds)}</span>
      <span className="relative z-10 shrink-0">
        <VideoChangeButton slug={slug} title={title} path={path} className={linkClasses({ pending: true, className: "px-1.5 py-0.5" })} />
      </span>
    </div>
  );
}

function PlayMark() {
  return (
    <span aria-hidden className="absolute flex size-10 items-center justify-center rounded-full bg-black/55 text-white opacity-90 backdrop-blur-sm">
      <Glyph name="play" className="size-5 translate-x-px fill-current" />
    </span>
  );
}

function clockLength(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Change from a tile: a conversation opened on the video (`POST /api/drafts`
 * with `sourceKind: "video"`), which puts its brief in the planner's CHANGING
 * block, so the person says what to change and the planner writes a `change`
 * brief. The press's key is kept a few minutes, so a double press or a
 * reload finds the same conversation rather than starting a second.
 */
export function VideoChangeButton({
  slug,
  title,
  path,
  className,
}: {
  slug: string;
  title: string;
  path: string;
  className?: string;
}) {
  const router = useRouter();
  const host = usePanelHost();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const name = `video:${slug}`;
  return (
    // `data-problem` keeps a tile's actions shown while the refusal is up
    // (`TILE_ACTIONS`), so the reason does not vanish with the hover.
    <span className="relative inline-flex" data-problem={problem !== null ? "" : undefined}>
      <button
        type="button"
        data-pending={pending ? "" : undefined}
        disabled={pending}
        aria-label={`Change: ${title}`}
        onClick={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          setPending(true);
          setProblem(null);
          const store = sessionStore();
          const made = await createDraft({
            source: slug,
            sourceKind: "video",
            idempotencyKey: extendKey(store, name, () => idempotencyKey(`change:${slug}`)),
          });
          const outcome = changeDraftOutcome(made);
          if ("problem" in outcome) {
            setPending(false);
            setProblem(outcome.problem);
            return;
          }
          const draftId = outcome.draftId;
          forgetExtendKey(store, name);
          // A conversation is a panel the host draws, so on /studio the
          // address bar moves without a server render.
          const href = conversationHref(host?.path ?? path, draftId);
          if (host?.navigate(href) !== true) router.push(href, { scroll: false });
          // The host's conversation opens over the grid, which stays mounted
          // under it: the tile is still here when the person comes back.
          setPending(false);
        }}
        className={className}
      >
        {pending ? "Opening" : problem !== null ? "Try again" : "Change"}
      </button>
      {/* Seen as well as heard: a tooltip is out of reach on a phone. */}
      {problem !== null && (
        <span
          role="alert"
          className="absolute top-full right-0 z-20 mt-1 w-56 rounded-md border border-border bg-surface px-2 py-1.5 text-left text-xs leading-4 font-normal text-danger shadow-sm"
        >
          {problem}
        </span>
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* A video being made                                                         */
/* -------------------------------------------------------------------------- */

/** A change job over its landed video's poster. */
function TileVideoJob({ slug, title, poster, path }: { slug: string; title: string; poster: string | null; path: string }) {
  const { jobs, ended, dismissed } = useStudioJobs();
  const job = videoJobForSlug(jobs, slug, ended, dismissed);
  if (job === null) return null;
  return (
    // Fades in over the poster as the job starts, as a diagram's does (`TileJob`).
    <div className={cx("absolute inset-x-0 top-0 aspect-[4/3] overflow-hidden border-b border-border", FADE_IN)}>
      <VideoStage key={job.jobId} job={job} title={title} backdrop={poster} path={path} isNew={false} />
    </div>
  );
}

/**
 * One card per video job making a video the grid has no tile for, straight
 * after the plus card, under any filter, as the diagram ones are.
 */
export function NewVideoJobs({ slugs, path, layout }: { slugs: string[]; path: string; layout: "grid" | "list" }) {
  const { jobs, ended, dismissed } = useStudioJobs();
  const existing = useMemo(() => new Set(slugs), [slugs]);
  const making = newVideoJobs(jobs, existing, ended, dismissed);
  return making.map((job) =>
    layout === "grid" ? (
      <div key={job.jobId} className={cx(TILE, TILE_LIFT, POP_IN)}>
        <div className="relative aspect-[4/3] overflow-hidden border-b border-border">
          <VideoStage job={job} title={job.title ?? "New video"} backdrop={null} path={path} isNew />
          <KindBadge kind="video" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 p-3">
          <span className="line-clamp-2 text-sm font-medium">{job.title ?? "New video"}</span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge>{job.topic}</Badge>
          </div>
        </div>
      </div>
    ) : (
      <PanelLink
        key={job.jobId}
        href={panelHref(path, { job: job.jobId })}
        scroll={false}
        className={cx("flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-xs transition-colors hover:bg-surface2", FADE_IN)}
      >
        <span className="flex h-6 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface2">
          <Dot stage={videoTileStage(job)} />
        </span>
        <KindBadge kind="video" inline />
        <span className="min-w-[5rem] flex-1 truncate font-medium">{job.title ?? "New video"}</span>
        <span className="flex min-w-0 max-w-[45%]">
          <RowWords job={job} />
        </span>
      </PanelLink>
    ),
  );
}

function VideoStage({
  job,
  title,
  backdrop,
  path,
  isNew,
}: {
  job: VideoJob;
  title: string;
  /** The landed video's poster, the picture until the first sheet. */
  backdrop: string | null;
  path: string;
  isNew: boolean;
}) {
  const stage = videoTileStage(job);
  const frame = useRef<HTMLDivElement>(null);
  const visible = useOnScreen(frame);
  // While this job's own panel is open it asks for the same sheets, and the
  // tile is behind the dialog: one poll per job, not two.
  const panelOpen = useSearchParams()?.get("job") === job.jobId;
  const { sheets } = useSheets(job.jobId, job.state === "running", visible && !panelOpen && job.state !== "queued");
  const newest = newestSheet(sheets);
  const live = useDecoded(newest === null ? null : sheetSrc(job.jobId, newest));
  const headline = videoHeadline(job);
  const label =
    stage === "review"
      ? isNew
        ? `Review ${title}`
        : `Review the new version of ${title}`
      : stage === "failed"
        ? `${title}: ${videoFailureLine(job)}. Open the job`
        : `${title}: ${headline}. Open the job`;

  return (
    <div ref={frame} className="relative h-full w-full bg-surface2">
      <Backdrop job={job} stage={stage} live={live} backdrop={backdrop} />
      <PanelLink
        href={panelHref(path, { job: job.jobId })}
        scroll={false}
        aria-label={label}
        className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      />
      <Status job={job} stage={stage} headline={headline} path={path} />
    </div>
  );
}

/**
 * The picture: working, the newest sheet (else the poster, else the blank
 * surface) blurred under the veil with the light crossing it; ready, the
 * gate's poster sharp, the last sheet blurred under it until it loads; failed,
 * the last picture blurred further. A sheet is a video frame, drawn on black,
 * so black is its mat in every palette.
 */
function Backdrop({
  job,
  stage,
  live,
  backdrop,
}: {
  job: VideoJob;
  stage: VideoTileStage;
  live: { current: string | null; previous: string | null };
  backdrop: string | null;
}) {
  const [posterMissing, setPosterMissing] = useState(false);
  const fallback = live.current ?? backdrop;
  // The server renders the poster's `<img>`, so a cached one can finish
  // loading before React attaches `onLoad`; `useImageReveal` asks the element too.
  const {
    attach: attachPoster,
    onLoad: posterLoaded,
    loaded: posterShown,
  } = useImageReveal(stage === "review" ? mediaHref(job.jobId, "poster.jpg") : null);

  if (stage === "review") {
    return (
      <div className="absolute inset-0 bg-black">
        {!posterShown && fallback !== null && (
          <div aria-hidden className="absolute inset-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- a runner file behind the proxy. */}
            <img src={fallback} alt="" className="absolute inset-0 h-full w-full object-contain blur-[3px]" />
            <div className="studio-veil absolute inset-0" />
          </div>
        )}
        {!posterMissing && (
          // eslint-disable-next-line @next/next/no-img-element -- the gate's poster, behind the proxy.
          <img
            ref={attachPoster}
            src={mediaHref(job.jobId, "poster.jpg")}
            alt=""
            decoding="async"
            onLoad={posterLoaded}
            onError={() => setPosterMissing(true)}
            className={cx("relative h-full w-full object-contain pb-12", posterShown ? "studio-fade-in" : "opacity-0")}
          />
        )}
      </div>
    );
  }

  const blur = stage === "failed" ? "blur-[6px]" : "blur-[3px]";
  const layer = cx("absolute inset-0 h-full w-full object-contain", blur, "transition-[filter] duration-300 ease-out motion-reduce:transition-none");
  const hasPicture = live.current !== null || backdrop !== null;
  return (
    <div aria-hidden className={cx("absolute inset-0 overflow-hidden", hasPicture ? "bg-black" : "")}>
      {live.current === null && backdrop !== null && (
        // eslint-disable-next-line @next/next/no-img-element -- see above.
        <img src={backdrop} alt="" decoding="async" className={layer} />
      )}
      {live.previous !== null && (
        // eslint-disable-next-line @next/next/no-img-element -- see above.
        <img src={live.previous} alt="" className={layer} />
      )}
      {live.current !== null && (
        // eslint-disable-next-line @next/next/no-img-element -- see above.
        <img key={live.current} src={live.current} alt="" className={cx(layer, "studio-fade-in")} />
      )}
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

/** The bar at the foot of the picture, as a diagram job's (`Status` in `GridJob.tsx`). */
function Status({ job, stage, headline, path }: { job: VideoJob; stage: VideoTileStage; headline: string; path: string }) {
  const { post, dismiss } = useStudioJobs();
  const [cancelling, setCancelling] = useState(false);

  if (stage === "review") {
    const seconds = job.gate?.durationSeconds ?? null;
    return (
      <div className={JOB_BAR}>
        <Dot stage={stage} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-text">{headline}</span>
          <span className="block truncate text-text2">
            {seconds === null ? "Built and checked" : `${spokenLength(seconds)}, built and checked`}
          </span>
        </span>
        {/* Not a control: the whole picture is the link to the review. */}
        <span className={buttonClasses({ size: "xs" })}>Review</span>
      </div>
    );
  }

  if (stage === "failed") {
    return (
      <div className={cx(JOB_BAR, "flex-wrap")}>
        <Dot stage={stage} />
        <span className="min-w-0 flex-1 truncate font-medium text-danger">{videoFailureLine(job)}</span>
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

  const stopping = cancelling || job.cancelRequestedAt !== null;
  return (
    <>
      <div className={JOB_BAR}>
        <Dot stage={stage} />
        <span className="min-w-0 flex-1">
          <span role="status" className="block truncate font-medium text-text">
            {headline}
          </span>
          <StepAndTime job={job} />
        </span>
        <Button
          variant="secondary"
          size="xs"
          disabled={stopping}
          onClick={async () => {
            setCancelling(true);
            const result = await post(`/studio/api/jobs/${encodeURIComponent(job.jobId)}/cancel`);
            if (!result.ok) setCancelling(false);
          }}
          className="pointer-events-auto"
        >
          {stopping ? "Stopping" : "Cancel"}
        </Button>
      </div>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-surface2">
        <span className="block h-full w-1/3 animate-[studio-slide_1.6s_ease-in-out_infinite] bg-accent" />
      </span>
    </>
  );
}

function StepAndTime({ job }: { job: VideoJob }) {
  // Null until hydrated, so the server's second is never matched against the browser's.
  const elapsed = useElapsed(job);
  const step = videoStepCount(job);
  const timed = job.state !== "queued";
  return (
    <span className="block truncate tabular-nums text-text2">
      {step === null && !timed ? "Video" : step}
      {step !== null && timed ? " · " : ""}
      {timed && <Duration ms={elapsed} live={job.finished === null} />}
    </span>
  );
}

function RowWords({ job }: { job: VideoJob }) {
  const stage = videoTileStage(job);
  const elapsed = useElapsed(job);
  return (
    <span className={cx("flex min-w-0 max-w-full items-center gap-1.5", stage === "failed" ? "text-danger" : "text-text2")}>
      <Dot stage={stage} />
      <span className="min-w-0 truncate">{stage === "failed" ? videoFailureLine(job) : videoHeadline(job)}</span>
      {stage === "working" && job.state !== "queued" && (
        <span className="shrink-0 text-text2">
          <Duration ms={elapsed} live={job.finished === null} />
        </span>
      )}
    </span>
  );
}

function Dot({ stage }: { stage: VideoTileStage }) {
  const tone = stage === "failed" ? "bg-danger" : stage === "review" ? "bg-ok" : "bg-accent studio-breathe";
  return <span aria-hidden className={cx("h-2 w-2 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none", tone)} />;
}

/* -------------------------------------------------------------------------- */
/* Pictures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The newest sheet once the browser has decoded it, and the one before it,
 * kept under the new one while it fades in; so the tile never swaps to a
 * half-loaded picture. Under reduced motion the fade is off in CSS and the
 * old picture goes at once.
 */
function useDecoded(src: string | null): { current: string | null; previous: string | null } {
  const [held, setHeld] = useState<{ current: string | null; previous: string | null }>({ current: null, previous: null });
  useEffect(() => {
    if (src === null) return;
    let alive = true;
    const image = new Image();
    image.src = src;
    image
      .decode()
      .then(() => {
        if (!alive) return;
        setHeld((prev) => (prev.current === src ? prev : { current: src, previous: prev.current }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [src]);
  // Drop the picture underneath once the fade (700ms) has run.
  useEffect(() => {
    if (held.previous === null) return;
    const timer = setTimeout(() => setHeld((prev) => ({ current: prev.current, previous: null })), 800);
    return () => clearTimeout(timer);
  }, [held.previous]);
  return held;
}

/** Whether the element is on screen, or within a screen's margin of it. */
function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setOn(entries.some((entry) => entry.isIntersecting)), { rootMargin: "200px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return on;
}
