"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import {
  activeChapterIndex,
  chapterSegments,
  formatTimecode,
  SKIP_STEP,
  type VideoChapter,
} from "@gnosia/tutor/media";
import { cx } from "@/components/ui/classes";

/**
 * The video's scrub bar, cut into its chapters the way YouTube draws one.
 *
 * Each chapter is its own stretch of the bar with a small gap before the next,
 * so the shape of the video is visible before anything plays. Hovering a
 * stretch raises it and shows a frame from that moment with the time and the
 * chapter's title above the pointer; pressing and dragging scrubs.
 *
 * **The preview frame is a second `<video>`, not a sprite sheet.** manimkc
 * writes no thumbnail track, and a hidden element pointed at the same file can
 * seek to any second the route serves by Range. Its `src` is only set on the
 * first hover, so a reader who never hovers downloads nothing extra, and seeks
 * are queued one at a time, so sweeping across the bar asks for the latest
 * frame rather than every frame on the way.
 *
 * **Keyboard.** The bar is a `slider`: arrows move five seconds, Page Up and
 * Page Down jump between chapters, Home and End go to either end. Its value
 * text names the chapter, which is how a screen reader hears where it is.
 */

/** Space between two chapters on the bar, in pixels. */
const GAP_PX = 3;
/** The preview frame's width, in pixels. Height follows at 16:9. */
const PREVIEW_WIDTH = 176;

export function VideoScrubber({
  src,
  time,
  duration,
  buffered,
  chapters,
  label,
  onSeek,
  onScrub,
  onStep,
}: {
  src: string;
  time: number;
  duration: number;
  /** How far the browser has buffered, in seconds. */
  buffered: number;
  chapters?: VideoChapter[];
  /** Names the slider for assistive technology. */
  label: string;
  onSeek: (seconds: number) => void;
  /** True while the pointer is held down on the bar, so the controls stay up. */
  onScrub?: (scrubbing: boolean) => void;
  /**
   * Takes the arrow keys over, so a press on the bar steps and flashes the
   * way a press anywhere else in the player does. Without it an arrow moves
   * `SKIP_STEP` seconds through `onSeek`.
   */
  onStep?: (direction: 1 | -1) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ time: number; x: number; width: number } | null>(null);
  // The preview stays mounted once shown, so its video keeps what it loaded;
  // leaving the bar only hides it.
  const [showing, setShowing] = useState(false);
  // A player kept across a query-only navigation hands the bar the next
  // video. The preview goes with the old one, so the new file is fetched for
  // a preview only once the reader hovers it.
  const [previewOf, setPreviewOf] = useState(src);
  if (previewOf !== src) {
    setPreviewOf(src);
    setHover(null);
    setShowing(false);
  }
  const [dragging, setDragging] = useState(false);
  const known = Number.isFinite(duration) && duration > 0;
  const segments = chapterSegments(chapters, duration);
  const current = chapters ? activeChapterIndex(chapters, time) : -1;

  function at(event: PointerEvent<HTMLDivElement>) {
    const box = barRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || !known) return null;
    const x = Math.min(Math.max(event.clientX - box.left, 0), box.width);
    return { time: (x / box.width) * duration, x, width: box.width };
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const point = at(event);
    if (point === null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    onScrub?.(true);
    setHover(point);
    setShowing(true);
    onSeek(point.time);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const point = at(event);
    if (point === null) return;
    setHover(point);
    setShowing(true);
    if (dragging) onSeek(point.time);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    onScrub?.(false);
    // A touch has no hover to fall back to, so its tooltip goes with the finger.
    if (event.pointerType !== "mouse") setShowing(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let target: number | null = null;
    const starts = (chapters ?? []).map((c) => c.start).sort((a, b) => a - b);
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
      case "ArrowRight":
      case "ArrowUp": {
        const direction = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : -1;
        if (onStep) onStep(direction);
        else target = time + direction * SKIP_STEP;
        break;
      }
      case "PageDown":
        target = starts.find((start) => start > time + 0.5) ?? null;
        break;
      case "PageUp": {
        // Back to the start of this chapter, or to the one before when the
        // reader is already at its start, as a music player's "previous" does.
        const earlier = starts.filter((start) => start < time - 1);
        target = earlier.length > 0 ? earlier[earlier.length - 1] : 0;
        break;
      }
      case "Home":
        target = 0;
        break;
      case "End":
        target = known ? duration : null;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (target !== null) onSeek(known ? Math.min(Math.max(target, 0), duration) : Math.max(target, 0));
  }

  const hoveredSegment =
    hover === null || !showing ? -1 : segments.findIndex((s) => hover.time >= s.start && hover.time < s.end);
  const hoverTitle = hoveredSegment >= 0 ? segments[hoveredSegment].title : null;
  const chapterName = current >= 0 ? chapters?.[current]?.title : undefined;

  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      // No range until the length is known: a max of 0 under a resume point
      // is an invalid slider, so the time is told by aria-valuetext alone.
      aria-valuemin={known ? 0 : undefined}
      aria-valuemax={known ? Math.round(duration) : undefined}
      aria-valuenow={known ? Math.round(time) : undefined}
      aria-valuetext={`${formatTimecode(time)}${known ? ` of ${formatTimecode(duration)}` : ""}${
        chapterName ? `, ${chapterName}` : ""
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => {
        if (!dragging) setShowing(false);
      }}
      onKeyDown={onKeyDown}
      className="group/bar relative h-5 cursor-pointer touch-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      {segments.map((segment, i) => {
        const left = known ? (segment.start / duration) * 100 : 0;
        const width = known ? ((segment.end - segment.start) / duration) * 100 : 100;
        const last = i === segments.length - 1;
        const played = fill(time, segment);
        const loaded = fill(buffered, segment);
        return (
          <div
            key={`${segment.start}-${i}`}
            className={cx(
              "absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-white/25 transition-[height] duration-100 motion-reduce:transition-none",
              i === hoveredSegment ? "h-[7px]" : "h-[3px] group-hover/bar:h-[5px]",
            )}
            style={{ left: `${left}%`, width: last ? `${width}%` : `calc(${width}% - ${GAP_PX}px)` }}
          >
            <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${loaded * 100}%` }} />
            <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${played * 100}%` }} />
          </div>
        );
      })}

      {known && (
        <span
          aria-hidden
          className={cx(
            "pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow transition-transform duration-100 motion-reduce:transition-none",
            dragging ? "scale-100" : "scale-0 group-hover/bar:scale-100 group-focus-visible/bar:scale-100",
          )}
          style={{ left: `${Math.min(time / duration, 1) * 100}%` }}
        />
      )}

      {hover !== null && (
        <Preview src={src} hover={hover} title={hoverTitle} hidden={!showing} />
      )}
    </div>
  );
}

/** How much of `segment` lies before `seconds`, from 0 to 1. */
function fill(seconds: number, segment: { start: number; end: number }): number {
  const span = segment.end - segment.start;
  if (!(span > 0)) return 0;
  return Math.min(Math.max((seconds - segment.start) / span, 0), 1);
}

/**
 * The frame, time and chapter above the pointer. Kept inside the bar's width,
 * so the first and last seconds do not push the card off the player.
 */
function Preview({
  src,
  hover,
  title,
  hidden,
}: {
  src: string;
  hover: { time: number; x: number; width: number };
  title: string | null;
  hidden: boolean;
}) {
  const frame = useFrame(src, hover.time);
  const half = PREVIEW_WIDTH / 2;
  const left = Math.min(Math.max(hover.x, half), Math.max(hover.width - half, half));
  return (
    <div
      aria-hidden
      className={cx(
        "pointer-events-none absolute bottom-full mb-2 flex -translate-x-1/2 animate-fade-in flex-col items-center gap-1.5",
        "transition-[opacity,visibility] duration-100 ease-out motion-reduce:animate-none motion-reduce:transition-none",
        hidden ? "invisible opacity-0" : "opacity-100",
      )}
      style={{ left, width: PREVIEW_WIDTH }}
    >
      <div className="aspect-video w-full overflow-hidden rounded-lg border-2 border-white/90 bg-black shadow-lg">
        {frame}
      </div>
      <div className="flex max-w-full items-baseline gap-2 rounded-md bg-black/75 px-2 py-1 text-[12px] text-white">
        <span className="shrink-0 tabular-nums">{formatTimecode(hover.time)}</span>
        {title !== null && <span className="min-w-0 truncate font-medium">{title}</span>}
      </div>
    </div>
  );
}

/**
 * A muted `<video>` held at `seconds`, as the preview's picture. One element
 * for the life of the bar, created on first use, and one seek in flight at a
 * time: when a seek finishes and the pointer has moved on, the next seek goes
 * straight to where it is now.
 */
function useFrame(src: string, seconds: number) {
  const ref = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const wanted = useRef(seconds);

  useEffect(() => {
    wanted.current = seconds;
    const video = ref.current;
    if (!video || busy.current) return;
    const target = Math.round(seconds * 2) / 2;
    if (Math.abs(video.currentTime - target) < 0.25) return;
    try {
      busy.current = true;
      video.currentTime = target;
    } catch {
      // Before metadata the element refuses; `loadedmetadata` retries below.
      busy.current = false;
    }
  }, [seconds]);

  function settle(video: HTMLVideoElement) {
    busy.current = false;
    const target = Math.round(wanted.current * 2) / 2;
    if (Math.abs(video.currentTime - target) >= 0.25) {
      try {
        busy.current = true;
        video.currentTime = target;
      } catch {
        busy.current = false;
      }
    }
  }

  return (
    <video
      ref={ref}
      src={src}
      muted
      playsInline
      // Only what a seek needs: each frame asked for is fetched as a range,
      // where `auto` could pull the whole file a second time beside the player.
      preload="metadata"
      tabIndex={-1}
      onLoadedMetadata={(e) => settle(e.currentTarget)}
      onSeeked={(e) => settle(e.currentTarget)}
      className="size-full object-contain"
    />
  );
}
