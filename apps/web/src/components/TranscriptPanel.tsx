"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { activeCueIndex, formatTimecode, type TranscriptCue } from "@/components/media";

/**
 * The spoken lines of a video, following playback.
 *
 * Presentational: it is handed the cues and the current time and hands clicks
 * back. It never reads a file, a route or the clock — `VideoPlayer` owns the
 * `<video>` element and this owns the reading experience beside it.
 *
 * Three behaviours are the whole point of the component:
 *
 * 1. The line being spoken is highlighted, and lines already spoken recede, so
 *    a glance at the panel says where you are without reading it.
 * 2. Clicking a line seeks the video to it.
 * 3. The panel scrolls itself to keep that line in view, and stops the moment
 *    the reader scrolls somewhere else on purpose. A transcript that drags the
 *    reader back every quarter second is the single thing that makes one
 *    unusable, so the follow is given up on the first unexplained scroll and
 *    picked up again when the current line comes back into view.
 *
 * The scroll is instant, never smooth: `timeupdate` fires about four times a
 * second, and a quarter-second animation restarting that often reads as drift
 * rather than motion.
 */

/** How far off the expected position a scroll has to land to count as the reader's. */
const SCROLL_SLOP = 2;

export function TranscriptPanel({
  cues,
  currentTime,
  onSeek,
  scrollerClassName = "max-h-[22rem]",
}: {
  cues: TranscriptCue[];
  currentTime: number;
  /** Omitted when there is nothing to seek; lines then render as plain text. */
  onSeek?: (seconds: number) => void;
  /** The height budget for the scrolling list, so a parent can fit it to its column. */
  scrollerClassName?: string;
}) {
  const scrollerRef = useRef<HTMLOListElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const [following, setFollowing] = useState(true);
  // The scrollTop this component last set. A scroll event landing there is the
  // browser reporting our own move back to us, not the reader moving.
  const expectedTop = useRef<number | null>(null);

  const active = activeCueIndex(cues, currentTime);

  const activeVisible = useCallback(() => {
    const scroller = scrollerRef.current;
    const line = activeRef.current;
    if (!scroller || !line) return true;
    const top = line.offsetTop;
    const bottom = top + line.offsetHeight;
    return top >= scroller.scrollTop && bottom <= scroller.scrollTop + scroller.clientHeight;
  }, []);

  useEffect(() => {
    if (!following || active < 0) return;
    const scroller = scrollerRef.current;
    const line = activeRef.current;
    if (!scroller || !line) return;
    if (activeVisible()) return;
    // A third of the way down, so the next few lines are already readable.
    const next = Math.max(0, line.offsetTop - scroller.clientHeight / 3);
    expectedTop.current = next;
    scroller.scrollTop = next;
  }, [active, following, activeVisible]);

  function onScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const expected = expectedTop.current;
    expectedTop.current = null;
    if (expected !== null && Math.abs(scroller.scrollTop - expected) <= SCROLL_SLOP) return;
    setFollowing(activeVisible());
  }

  function seekTo(seconds: number) {
    setFollowing(true);
    onSeek?.(seconds);
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Transcript
        </h3>
        {cues.length > 0 &&
          (following ? (
            <span className="text-[11px] tabular-nums text-[var(--muted)]">
              {active + 1} / {cues.length}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setFollowing(true)}
              className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent-strong)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Follow along
            </button>
          ))}
      </div>

      {cues.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">
          No transcript beside this video.
          <span className="mt-1 block text-xs">
            Narrated cuts ship one; a silent render has nothing to say.
          </span>
        </p>
      ) : (
        <ol
          ref={scrollerRef}
          onScroll={onScroll}
          aria-label="Transcript"
          className={`relative overflow-y-auto overscroll-contain p-1.5 ${scrollerClassName}`}
        >
          {cues.map((cue, i) => {
            const isActive = i === active;
            const spoken = i < active;
            const content = (
              <>
                <span
                  className={`pt-px font-mono text-[11px] tabular-nums ${
                    isActive ? "text-[var(--accent-strong)]" : "text-[var(--muted)]"
                  }`}
                >
                  {formatTimecode(cue.start)}
                </span>
                <span className={isActive ? "font-medium" : undefined}>{cue.text}</span>
              </>
            );
            const tone = isActive
              ? "bg-[var(--nav-active-bg)] text-[var(--foreground)]"
              : spoken
                ? "text-[var(--muted)]"
                : "text-[var(--muted-strong)]";
            return (
              <li key={`${cue.start}-${i}`} ref={isActive ? activeRef : undefined}>
                {onSeek ? (
                  <button
                    type="button"
                    onClick={() => seekTo(cue.start)}
                    aria-current={isActive ? "true" : undefined}
                    className={`grid w-full grid-cols-[3rem_minmax(0,1fr)] gap-2 rounded-lg px-2 py-1.5 text-left text-sm leading-relaxed transition-colors duration-150 hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] ${tone}`}
                  >
                    {content}
                  </button>
                ) : (
                  <p
                    aria-current={isActive ? "true" : undefined}
                    className={`grid grid-cols-[3rem_minmax(0,1fr)] gap-2 rounded-lg px-2 py-1.5 text-sm leading-relaxed ${tone}`}
                  >
                    {content}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
