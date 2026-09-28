"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { TranscriptCue, VideoChapter } from "@/components/media";
import type { TabItem } from "@/components/ui/Tabs";
import { VideoPlayer, type PlaybackSignal } from "@/components/VideoPlayer";
import { coverage, MAX_RANGES, mergeRanges, resumeAt, type Playback, type Range } from "@/lib/playback";

/** Save at most this often while a video plays, in milliseconds. */
const SAVE_EVERY_MS = 15_000;
/** A jump between two time updates bigger than this is a seek, not playback. */
const MAX_STEP_SECONDS = 3;

const ENDPOINT = "/api/learner/playback";

/**
 * A library video that remembers where the reader is.
 *
 * There is no "Mark watched" button. The player reports playback as it
 * happens; this component turns it into the stretches that actually played
 * and posts them to `/api/learner/playback` every fifteen seconds of play, on
 * pause, at the end, and with `sendBeacon` when the page is hidden or left.
 * The route merges them, stores the position, and appends the `watched` event
 * itself once enough of the video has played (`WATCHED_FRACTION`). The next
 * visit starts where this one stopped.
 *
 * The status beside the title is the route's answer, so it says what was
 * stored rather than what this tab hopes was. A save the route did not accept
 * puts its ranges back, so the next save carries them again; a beacon cannot
 * report back, which is why it is kept for the page being left.
 *
 * Its state belongs to one asset, so the page renders it with `key` set to
 * the asset id: a client navigation from one video to the next starts over
 * rather than carrying the first video's resume point and progress.
 */
export function LibraryVideo({
  assetId,
  src,
  statusHref,
  poster,
  title,
  chapters,
  transcript,
  saved,
  heading,
  meta,
  actions,
  notes,
  tabs,
}: {
  assetId: string;
  src: string;
  statusHref: string;
  poster?: string;
  title: string;
  chapters?: VideoChapter[];
  transcript?: TranscriptCue[];
  /** What the store held when the page was rendered, or null for a first visit. */
  saved: Playback | null;
  heading: ReactNode;
  /** The line under the title: kind, source, size. */
  meta: string;
  actions?: ReactNode;
  /** Quiet lines under the facts: a sidecar that could not be read, say. */
  notes?: ReactNode;
  tabs?: TabItem[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(() => ({
    coverage: saved === null ? 0 : coverage(saved.ranges, saved.duration),
    watched: saved?.watchedAt != null,
  }));
  const [startAt] = useState(() => resumeAt(saved));

  const state = useRef({
    open: null as number | null,
    last: startAt,
    duration: saved?.duration ?? Number.NaN,
    ranges: [] as Range[],
    sentAt: 0,
    sentPosition: -1,
  });

  /** Close the stretch playing now at `end`, and start none. */
  const close = useCallback((end: number) => {
    const s = state.current;
    if (s.open !== null && end > s.open) s.ranges.push([s.open, end]);
    s.open = null;
  }, []);

  const save = useCallback(
    (beacon: boolean) => {
      const s = state.current;
      if (!(s.duration > 0)) return;
      // The stretch still playing is sent too, and carried on from here, so a
      // save in the middle of playback loses nothing and repeats nothing.
      const pending: Range[] = [...s.ranges];
      if (s.open !== null && s.last > s.open) {
        pending.push([s.open, s.last]);
        s.open = s.last;
      }
      const ranges = mergeRanges(pending).slice(-MAX_RANGES);
      if (ranges.length === 0 && Math.abs(s.last - s.sentPosition) < 1) return;
      s.ranges = [];
      s.sentAt = Date.now();
      s.sentPosition = s.last;
      const body = JSON.stringify({ assetId, position: s.last, duration: s.duration, ranges });

      if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
        return;
      }
      // Put this save's ranges back for the next one to carry.
      const requeue = () => {
        s.ranges.push(...ranges);
        s.sentPosition = -1;
      };
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      })
        .then((response) => {
          if (response.ok) return response.json();
          // Worth another try only when the server or the network was the
          // trouble. A 400 names this save as wrong, and would be again.
          if (response.status >= 500 || response.status === 429) requeue();
          return null;
        })
        .then((payload: { result?: { coverage: number; watchedAt: string | null; crossed: boolean } } | null) => {
          const result = payload?.result;
          if (!result) return;
          setStatus({ coverage: result.coverage, watched: result.watchedAt !== null });
          // A watched event is a study day: the streak pill is drawn by the
          // root layout, which a client navigation keeps mounted.
          if (result.crossed) router.refresh();
        })
        .catch(requeue);
    },
    [assetId, router],
  );

  const onPlayback = useCallback(
    (signal: PlaybackSignal) => {
      const s = state.current;
      if (Number.isFinite(signal.duration) && signal.duration > 0) s.duration = signal.duration;
      switch (signal.type) {
        case "time": {
          const step = signal.time - s.last;
          if (s.open === null) s.open = signal.time;
          else if (step < 0 || step > MAX_STEP_SECONDS) {
            close(s.last);
            s.open = signal.time;
          }
          s.last = signal.time;
          if (Date.now() - s.sentAt >= SAVE_EVERY_MS) save(false);
          break;
        }
        case "seeking":
          close(s.last);
          s.last = signal.time;
          break;
        case "pause":
        case "ended":
          s.last = signal.time;
          close(signal.time);
          save(false);
          break;
      }
    },
    [close, save],
  );

  useEffect(() => {
    const leave = () => save(true);
    const hidden = () => {
      if (document.visibilityState === "hidden") save(true);
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", hidden);
      // A client navigation to another page unmounts without a pagehide.
      save(true);
    };
  }, [save]);

  const percent = Math.round(status.coverage * 100);
  const progress = status.watched ? "Watched" : percent > 0 ? `${percent}% watched` : null;

  return (
    <VideoPlayer
      src={src}
      statusHref={statusHref}
      poster={poster}
      title={title}
      chapters={chapters}
      transcript={transcript}
      startAt={startAt}
      onPlayback={onPlayback}
      header={
        <div className="flex flex-col gap-2">
          {heading}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-[13px] text-text2">
              <span>{meta}</span>
              {progress !== null && (
                <>
                  <span aria-hidden className="text-text3">
                    ·
                  </span>
                  <span className={status.watched ? "font-semibold text-ok-text" : undefined} aria-live="polite">
                    {status.watched && (
                      <svg viewBox="0 0 12 12" aria-hidden className="mr-1 inline size-3 -translate-y-px" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2.5 6.5 5 9l4.5-6" />
                      </svg>
                    )}
                    {progress}
                  </span>
                </>
              )}
            </p>
            {actions !== undefined && <div className="ml-auto flex gap-2">{actions}</div>}
          </div>
          {notes}
        </div>
      }
      tabs={tabs}
    />
  );
}
