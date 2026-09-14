"use client";

import { useRef, useState } from "react";
import {
  activeChapterIndex,
  formatTimecode,
  type TranscriptCue,
  type VideoChapter,
} from "@/components/media";
import { TranscriptPanel } from "@/components/TranscriptPanel";

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
 * The layout is driven by container queries, not by the viewport. The app's
 * content column is capped at 48rem whatever the screen is doing, so a `lg:`
 * breakpoint here would put a 20rem transcript beside a video and leave the
 * video narrower than its own transcript. What the layout actually depends on
 * is how much room this component was given:
 *
 * ```
 * under 42rem   video, then chapters, then transcript, stacked
 * 42rem and up  video, then chapters and transcript side by side beneath it
 * 64rem and up  video with the reading column beside it
 * ```
 */
export function VideoPlayer({
  src,
  poster,
  title,
  chapters,
  transcript,
}: {
  src: string;
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

  function seek(seconds: number) {
    const target = Math.max(0, seconds);
    // Optimistic, and not only for tests: a browser reports the new time on
    // the next `timeupdate`, and the highlight should move on the click.
    setTime(target);
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = target;
    } catch {
      // A seek before metadata has loaded throws in some browsers. The time
      // the reader asked for is already on screen; the next play starts there.
    }
  }

  const activeChapter = chapters ? activeChapterIndex(chapters, time) : -1;
  const aside = chapters !== undefined || transcript !== undefined;

  return (
    // The container is the wrapper, never the grid itself: an element cannot
    // answer a query about its own width, only about an ancestor's.
    <div className="@container">
      <section
        className={`grid gap-4 ${
          aside ? "@5xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:items-start" : ""
        }`}
      >
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-black shadow-sm transition-shadow duration-150 has-[video:focus-visible]:ring-2 has-[video:focus-visible]:ring-[var(--accent)] has-[video:focus-visible]:ring-offset-2 has-[video:focus-visible]:ring-offset-[var(--background)]">
          {/* The caption track is a separate asset row and a separate prop the
              catalog has not been asked for yet; what this component is handed
              is the transcript, and it renders that beside the picture. */}
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            controls
            preload="metadata"
            playsInline
            aria-label={title}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onSeeked={(e) => setTime(e.currentTarget.currentTime)}
            className="aspect-video w-full bg-black outline-none"
          />
        </div>

        {aside && (
          <div className="grid content-start gap-4 @2xl:grid-cols-2 @5xl:grid-cols-1">
            {chapters !== undefined && (
              <nav
                aria-label={title ? `Chapters of ${title}` : "Chapters"}
                className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
              >
                <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Chapters
                  </h3>
                  {chapters.length > 0 && (
                    <span className="text-[11px] tabular-nums text-[var(--muted)]">
                      {chapters.length}
                    </span>
                  )}
                </div>
                {chapters.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-[var(--muted)]">
                    No chapters for this video.
                  </p>
                ) : (
                  <ol className="max-h-[18rem] overflow-y-auto overscroll-contain p-1.5 @5xl:max-h-[13rem]">
                    {chapters.map((chapter, i) => {
                      const isActive = i === activeChapter;
                      return (
                        <li key={`${chapter.start}-${i}`}>
                          <button
                            type="button"
                            onClick={() => seek(chapter.start)}
                            aria-current={isActive ? "true" : undefined}
                            className={`grid w-full grid-cols-[3rem_minmax(0,1fr)] gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] ${
                              isActive
                                ? "bg-[var(--nav-active-bg)] font-medium text-[var(--foreground)]"
                                : "text-[var(--muted-strong)]"
                            }`}
                          >
                            <span
                              className={`pt-px font-mono text-[11px] tabular-nums ${
                                isActive
                                  ? "text-[var(--accent-strong)]"
                                  : "text-[var(--muted)]"
                              }`}
                            >
                              {formatTimecode(chapter.start)}
                            </span>
                            <span>{chapter.title}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </nav>
            )}

            {transcript !== undefined && (
              <TranscriptPanel
                cues={transcript}
                currentTime={time}
                onSeek={seek}
                scrollerClassName="max-h-[18rem] @5xl:max-h-[26rem]"
              />
            )}
            </div>
        )}
      </section>
    </div>
  );
}
