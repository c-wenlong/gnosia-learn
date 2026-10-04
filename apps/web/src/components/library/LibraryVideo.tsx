"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { AskButton, DownloadButton, FavoriteButton } from "@/components/library/AssetActions";
import { AskPanel } from "@/components/library/AskPanel";
import { WatchStatusContext, type WatchStatus } from "@/components/library/WatchProgress";
import type { TranscriptCue, VideoChapter } from "@/components/media";
import { Collapse } from "@/components/ui/Collapse";
import type { TabItem } from "@/components/ui/Tabs";
import { VideoPlayer, type PlaybackSignal } from "@/components/VideoPlayer";
import { coverage, MAX_RANGES, mergeRanges, resumeAt, type Playback, type Range } from "@/lib/playback";

/** Save at most this often while a video plays, in milliseconds. */
const SAVE_EVERY_MS = 15_000;
/** A jump between two time updates bigger than this is a seek, not playback. */
const MAX_STEP_SECONDS = 3;

const ENDPOINT = "/api/learner/playback";

/** What `POST /api/learner/playback` answers. */
type SaveResult = {
  coverage: number;
  watchedAt: string | null;
  watchedDay: string | null;
  position: number;
  crossed: boolean;
};

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
 * The status it provides (`WatchStatusContext`, read by the Details tab's
 * `WatchProgress`) is the route's answer, so it says what was stored rather
 * than what this tab hopes was. A save the route did not accept
 * puts its ranges back, so the next save carries them again; a beacon cannot
 * report back, which is why it is kept for the page being left.
 *
 * Under the title sits a row of pill actions, as on a video site's watch
 * page: Favorite (the star, `FavoriteButton`), Ask (an unsaved chat about
 * this video, `AskPanel`, told where the player is when each question is
 * sent), Download, then whatever the page adds (`actions`).
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
  sourceRepo,
  chapters,
  transcript,
  saved,
  heading,
  watchedDay,
  favorite,
  downloadName,
  actions,
  notes,
  tabs,
}: {
  assetId: string;
  src: string;
  statusHref: string;
  poster?: string;
  title: string;
  /** The tool that made the video, for the upload command a failure names. */
  sourceRepo?: string;
  chapters?: VideoChapter[];
  transcript?: TranscriptCue[];
  /** What the store held when the page was rendered, or null for a first visit. */
  saved: Playback | null;
  heading: ReactNode;
  /** The day `saved.watchedAt` falls on in the app's time zone, or null. */
  watchedDay: string | null;
  /** Whether the owner has starred this video. */
  favorite: boolean;
  /** The name Download saves the file under, or the browser's choice when absent. */
  downloadName?: string;
  /** More actions after Favorite, Ask and Download. */
  actions?: ReactNode;
  /** Quiet lines under the facts: a sidecar that could not be read, say. */
  notes?: ReactNode;
  tabs?: TabItem[];
}) {
  const router = useRouter();
  const askId = useId();
  const [asking, setAsking] = useState(false);
  const [startAt] = useState(() => resumeAt(saved));
  const [status, setStatus] = useState<WatchStatus>(() => ({
    coverage: saved === null ? 0 : coverage(saved.ranges, saved.duration),
    watched: saved?.watchedAt != null,
    position: saved?.position ?? 0,
    watchedDay,
  }));

  const state = useRef({
    open: null as number | null,
    last: startAt,
    duration: saved?.duration ?? Number.NaN,
    ranges: [] as Range[],
    // Zero until playback first reports: the fifteen seconds count from then,
    // not from the epoch, so the first time update is not a save of nothing.
    sentAt: 0,
    sentPosition: startAt,
    // Saves can overlap and answer out of order; only the newest answer is shown.
    sent: 0,
    shown: 0,
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
      const seq = ++s.sent;
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
        .then((payload: { result?: SaveResult } | null) => {
          const result = payload?.result;
          if (!result) return;
          // A crossing wrote a `watched` event: re-read the server's render
          // so it agrees with the log, whichever answer arrives last.
          if (result.crossed) router.refresh();
          if (seq < s.shown) return;
          s.shown = seq;
          setStatus({
            coverage: result.coverage,
            watched: result.watchedAt !== null,
            position: result.position,
            watchedDay: result.watchedDay,
          });
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
          if (s.sentAt === 0) s.sentAt = Date.now();
          else if (Date.now() - s.sentAt >= SAVE_EVERY_MS) save(false);
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

  return (
    <WatchStatusContext value={status}>
      <VideoPlayer
        src={src}
        statusHref={statusHref}
        poster={poster}
        title={title}
        sourceRepo={sourceRepo}
        chapters={chapters}
        transcript={transcript}
        startAt={startAt}
        onPlayback={onPlayback}
        header={
          <div className="flex flex-col gap-2">
            {heading}
            <div className="flex flex-wrap items-center gap-2">
              <FavoriteButton assetId={assetId} initial={favorite} />
              <AskButton open={asking} onToggle={() => setAsking((open) => !open)} controls={askId} />
              <DownloadButton href={src} filename={downloadName} />
              {actions}
            </div>
            <Collapse open={asking} id={askId}>
              <div className="pt-1">
                <AskPanel assetId={assetId} subject="video" position={() => state.current.last} />
              </div>
            </Collapse>
            {notes}
          </div>
        }
        tabs={tabs}
      />
    </WatchStatusContext>
  );
}
