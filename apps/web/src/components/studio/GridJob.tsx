"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import {
  JobRowWords,
  JobTileFrame,
  JobTileHeldPicture,
  jobTileLabel,
  jobTileLayer,
  JobTileStatus,
  JobTileVeil,
  NewJobCard,
  NewJobRow,
} from "@/components/studio/job-tile";
import { FADE_IN } from "@/components/studio/motion";
import { PanelLink } from "@/components/studio/PanelLink";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { cx } from "@/components/ui/classes";
import { useImageReveal } from "@/components/ui/use-image-reveal";
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
} from "@/lib/studio-grid-jobs";
import { panelHref } from "@/lib/studio-url";
import { useOnScreen } from "@/lib/use-on-screen";
import { usePageVisible } from "@/lib/use-page-visible";
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
 * Everything this decides is in `studio-grid-jobs.ts`, which is tested; this
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
    <div className={cx("absolute inset-x-0 top-0 aspect-[4/3] overflow-hidden border-b border-border", FADE_IN)}>
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
    <JobRowLink jobId={job.jobId} label={rowJobLabel(job, title)} path={path}>
      <RowWords job={job} />
    </JobRowLink>
  );
}

/**
 * A list row's link to its job's panel, for a diagram's row and a video's
 * alike: named for what it does and what it is about, and with a focus ring,
 * so neither row's link is a bare status a screen reader cannot place
 * (R2-1-24).
 */
export function JobRowLink({ jobId, label, path, children }: { jobId: string; label: string; path: string; children: ReactNode }) {
  return (
    <PanelLink
      href={panelHref(path, { job: jobId })}
      scroll={false}
      aria-label={label}
      // Shrinks before the title does, and never past about half the row:
      // the row's name is what identifies it, the status is extra.
      className="relative z-10 flex min-w-0 max-w-[45%] items-center rounded px-1 hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
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
      <NewJobCard
        key={job.jobId}
        job={job}
        kind="diagram"
        title={job.title ?? "New diagram"}
        stage={<JobStage job={job} title={job.title ?? "New diagram"} thumbnail={null} path={path} isNew />}
      />
    ) : (
      <NewJobRow key={job.jobId} job={job} kind="diagram" title={job.title ?? "New diagram"} path={path} words={<RowWords job={job} />} />
    ),
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
  const failure = failureLine(job);

  return (
    <JobTileFrame
      ref={frame}
      job={job}
      label={jobTileLabel({ stage, isNew, title, headline, failure })}
      path={path}
      backdrop={<Backdrop job={job} stage={stage} live={live} settle={settle} thumbnail={thumbnail} />}
      status={
        <JobTileStatus
          job={job}
          stage={stage}
          headline={headline}
          reviewLine={capitalise(finishedHeadline(job))}
          failure={failure}
          step={{ words: loaderStep(job), timed: true }}
          path={path}
        />
      }
    />
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
  const fallback = live.current ?? thumbnail;
  const src = stage !== "review" ? null : afterMissing ? fallback : afterShotHref(job.jobId);
  // The server renders this `<img>`, so a cached picture can finish loading
  // before React attaches `onLoad`; `useImageReveal` asks the element too.
  const { attach: attachAfter, onLoad: afterLoaded, loaded: afterShown } = useImageReveal(src);

  if (stage === "review") {
    return (
      <div className="absolute inset-0">
        {src !== null && <div aria-hidden className={MAT} />}
        {!afterShown && fallback !== null && <JobTileHeldPicture src={fallback} padded />}
        {src !== null && (
          // eslint-disable-next-line @next/next/no-img-element -- a runner file behind the proxy, see Thumbnail.
          <img
            ref={attachAfter}
            src={src}
            alt=""
            decoding="async"
            onLoad={afterLoaded}
            onError={() => setAfterMissing(true)}
            // Clear of the status bar, so the bar never sits on the drawing.
            className={cx("relative h-full w-full object-contain px-2 pt-2 pb-14", afterShown ? "studio-fade-in" : "opacity-0")}
          />
        )}
      </div>
    );
  }

  // Contained, and framed as the tile's own thumbnail is, never cropped to
  // fill: the first real run added a note in the bottom corner of a nearly
  // square drawing, and a cover-cropped backdrop cut exactly that change off.
  // Framed the same, the thumbnail blurs in place when a job starts.
  const layer = jobTileLayer(stage, true);
  const thumbnailShown = thumbnail !== null && showsThumbnail(live);
  return (
    <JobTileVeil stage={stage}>
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
          className={cx(layer, live.settled ? "" : "studio-fade-in")}
        />
      )}
    </JobTileVeil>
  );
}

/** The list row's version: a dot, the words, the time. */
function RowWords({ job }: { job: Job }) {
  const stage = tileStage(job);
  return <JobRowWords job={job} stage={stage} words={rowWords(job)} timed={stage === "working"} />;
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
  const pageHidden = !usePageVisible();
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
