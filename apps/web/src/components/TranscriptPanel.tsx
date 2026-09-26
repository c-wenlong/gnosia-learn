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
  // `active` is `-1` before the first cue starts: nothing has been said yet,
  // so there is no line to report a position for. "0" would claim the reader
  // is on a line that does not exist, and clamping to "1" would claim they
  // are already on the first line before anyone has pressed play. Neither is
  // true, so the position reads as a dash instead, same shape as a real
  // number so the label does not resize once playback actually starts.
  const position = active < 0 ? "-" : active + 1;

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
    <section className="flex min-w-0 flex-col gap-1.5 rounded-[20px] border-2 border-border bg-surface px-3 pt-4 pb-3 sm:px-4">
      <div className="flex items-center justify-between gap-3 px-2">
        <h3 className="text-[16px] font-bold text-text">Transcript</h3>
        {cues.length > 0 &&
          (following ? (
            <span className="text-[12px] tabular-nums text-text3">
              {position} / {cues.length}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setFollowing(true)}
              className="rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Follow along
            </button>
          ))}
      </div>

      {cues.length === 0 ? (
        <p className="px-2 py-4 text-[14px] text-text2">
          No transcript beside this video.
          <span className="mt-1 block text-[12px] text-text3">
            Narrated cuts ship one; a silent render has nothing to say.
          </span>
        </p>
      ) : (
        <ol
          ref={scrollerRef}
          onScroll={onScroll}
          aria-label="Transcript"
          className={`relative overflow-y-auto overscroll-contain ${scrollerClassName}`}
        >
          {cues.map((cue, i) => {
            const isActive = i === active;
            const spoken = i < active;
            const content = (
              <>
                <span className="pt-px text-[12px] tabular-nums text-text3">
                  {formatTimecode(cue.start)}
                </span>
                <span>{cue.text}</span>
              </>
            );
            const tone = isActive
              ? "bg-tint font-medium text-text"
              : spoken
                ? "text-text3"
                : "text-text2";
            return (
              <li key={`${cue.start}-${i}`} ref={isActive ? activeRef : undefined}>
                {onSeek ? (
                  <button
                    type="button"
                    onClick={() => seekTo(cue.start)}
                    aria-current={isActive ? "true" : undefined}
                    className={`grid w-full grid-cols-[3rem_minmax(0,1fr)] gap-2 rounded-lg px-2 py-1 text-left text-[14px] leading-[22px] transition-colors duration-100 hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${tone}`}
                  >
                    {content}
                  </button>
                ) : (
                  <p
                    aria-current={isActive ? "true" : undefined}
                    className={`grid grid-cols-[3rem_minmax(0,1fr)] gap-2 rounded-lg px-2 py-1 text-[14px] leading-[22px] ${tone}`}
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
