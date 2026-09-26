"use client";

import { useRef, useState } from "react";
import {
  activeChapterIndex,
  formatTimecode,
  type TranscriptCue,
  type VideoChapter,
} from "@/components/media";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { chipClasses } from "@/components/ui/classes";
import { useAssetFailure } from "@/components/use-asset-failure";
import { WidgetFailure } from "@/components/WidgetFailure";

/**
 * A narrated video with its chapters and its transcript beside it.
 *
 * Presentational, and it stays that way: `src`, `poster` and the two sidecar
 * lists arrive already resolved. Nothing here queries the catalog or builds a
 * URL, so the component and the route that serves the bytes can be written
 * without either waiting on the other.
 *
 * **Native `<video controls>`, no player library.** Every browser already
 * ships a play/pause, a scrubber, volume, captions, picture-in-picture and
 * fullscreen that the keyboard and a screen reader both know, and a study
 * surface gains nothing from a second, worse copy of them. What the native
 * element does not have is chapters and a transcript, so that is what this
 * component adds and all it adds.
 *
 * The layout is the library asset page's main column (hi-fi 11): the
 * picture, then the chapters as a row of chips, then the transcript in a card
 * beneath. One column at every width, because the page gives the video the
 * wide column and keeps its own rail for the asset's metadata; the transcript
 * beside the picture would take width from both.
 *
 * **A video that fails says why.** Without an `onError` the reader got the
 * browser's own dead player, with no hint whether the file was gone, the index
 * was stale or the route was off. Now the player is replaced, at its own size,
 * by the shared Widget placeholder failure panel, which asks `statusHref` for
 * the reason. The chapters and the transcript stay: they are text the page
 * already has, and still worth reading when the picture is missing.
 */
export function VideoPlayer({
  src,
  statusHref,
  poster,
  title,
  chapters,
  transcript,
}: {
  src: string;
  /** Where to ask why `src` failed. Without one a failure says it has no reason. */
  statusHref?: string;
  /** Already resolved. Without one the browser shows the first frame instead. */
  poster?: string;
  /** Names the player for assistive technology, and titles the chapter rail. */
  title?: string;
  /** Provided and empty is a video whose chapters are missing, and says so. */
  chapters?: VideoChapter[];
  /** Provided and empty is a video with no narration, and says so. */
  transcript?: TranscriptCue[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const { failure, fail, retry, attempt, observe } = useAssetFailure(src, statusHref);
  // A seek the element refused, held until it can be honoured. See `seek`.
  // It carries the load it was asked for rather than the URL: with the URL, a
  // reader who goes A to B and back to A before the first load reports itself
  // would have the seek they asked for on the first A applied to the second,
  // because the two As are the same string. A load number cannot repeat.
  const pendingSeek = useRef<{ load: number; seconds: number } | null>(null);

  // Playback position belongs to the file being played, so a new `src` starts
  // over. Without this the component keeps whatever the last video was at: a
  // soft navigation from one asset to the next reuses the mounted instance
  // (the route renders no `key`), and the chapter rail and the transcript then
  // highlight a position in a video nobody is watching.
  //
  // Done during render rather than in an effect on purpose. React re-runs this
  // component before committing anything, so the swapped-in video is never
  // painted with the old position; an effect would show the wrong highlight
  // for a frame first. This is the documented way to adjust state when a prop
  // changes, and it is the component's own job rather than the caller's: the
  // diagram studio renders this from another route, and a fix that depends on
  // every caller remembering a `key` is a fix that the next caller loses.
  const [source, setSource] = useState({ src, load: 0 });
  if (source.src !== src) {
    setSource((previous) => ({ src, load: previous.load + 1 }));
    setTime(0);
  }

  function seek(seconds: number) {
    const target = Math.max(0, seconds);
    // Optimistic, and not only for tests: a browser reports the new time on
    // the next `timeupdate`, and the highlight should move on the click.
    setTime(target);
    const video = videoRef.current;
    if (!video) {
      pendingSeek.current = { load: source.load, seconds: target };
      return;
    }
    try {
      video.currentTime = target;
      pendingSeek.current = null;
    } catch {
      // A seek before metadata has loaded throws, and `preload="metadata"`
      // means the first clicks land in exactly that window. Dropping it here
      // left the reader on a chapter the video had never moved to, so the next
      // play started from the top. Hold it and apply it at `loadedmetadata`.
      pendingSeek.current = { load: source.load, seconds: target };
    }
  }

  function applyPendingSeek(video: HTMLVideoElement) {
    const pending = pendingSeek.current;
    if (!pending) return;
    if (pending.load !== source.load) {
      // Asked for on a load this element has already moved past. Not this
      // one's, even when the same file has come back around.
      pendingSeek.current = null;
      return;
    }
    try {
      video.currentTime = pending.seconds;
      pendingSeek.current = null;
    } catch {
      // Still too early. The next readiness event tries again.
    }
  }

  const activeChapter = chapters ? activeChapterIndex(chapters, time) : -1;

  return (
    <section className="flex flex-col gap-3.5">
      {failure !== null ? (
        <WidgetFailure
          headline="This video did not load."
          code={failure.code}
          onRetry={retry}
          className="min-h-64 w-full sm:min-h-80"
        />
      ) : (
        <div className="overflow-hidden rounded-xl bg-black has-[video:focus-visible]:ring-2 has-[video:focus-visible]:ring-accent has-[video:focus-visible]:ring-offset-2 has-[video:focus-visible]:ring-offset-page">
          {/* The caption track is a separate asset row and a separate prop the
              catalog has not been asked for yet; what this component is handed
              is the transcript, and it renders that beneath the picture. */}
          <video
            key={attempt}
            ref={(element) => {
              videoRef.current = element;
              observe(element);
            }}
            src={src}
            poster={poster}
            controls
            preload="metadata"
            playsInline
            aria-label={title}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onSeeked={(e) => setTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => applyPendingSeek(e.currentTarget)}
            onCanPlay={(e) => applyPendingSeek(e.currentTarget)}
            onError={fail}
            className="aspect-video w-full bg-black outline-none"
          />
        </div>
      )}

      {chapters !== undefined && (
        <nav
          aria-label={title ? `Chapters of ${title}` : "Chapters"}
          className="flex flex-wrap items-center gap-2"
        >
          <h3 className="mr-1 text-[12px] font-normal text-text3">Chapters</h3>
          {chapters.length === 0 ? (
            <p className="text-[12px] text-text2">No chapters for this video.</p>
          ) : (
            chapters.map((chapter, i) => {
              const isActive = i === activeChapter;
              return (
                <button
                  key={`${chapter.start}-${i}`}
                  type="button"
                  onClick={() => seek(chapter.start)}
                  aria-current={isActive ? "true" : undefined}
                  className={chipClasses({ active: isActive, size: "sm", className: "max-w-full" })}
                >
                  <span className="truncate">{chapter.title}</span>
                  <span className={`tabular-nums ${isActive ? "" : "text-text2"}`}>
                    {formatTimecode(chapter.start)}
                  </span>
                </button>
              );
            })
          )}
        </nav>
      )}

      {transcript !== undefined && (
        <TranscriptPanel
          // The panel's follow-along state is playback state too: a
          // reader who scrolled away from one video should not land on
          // the next one with its transcript already given up on. A key
          // is right *here*, where the one caller owns the child and
          // always passes it, and wrong at the route, where the next
          // caller would have to remember it.
          key={src}
          cues={transcript}
          currentTime={time}
          onSeek={seek}
          scrollerClassName="max-h-[26rem]"
        />
      )}
    </section>
  );
}
