import { cx } from "@/components/ui/classes";
import { formatTimecode } from "@gnosia/tutor/media";

/**
 * One timecoded line of a transcript or a chapter list: the start time in a
 * 3rem column, the words beside it. Shared by the live transcript beside a
 * video (`TranscriptPanel`) and a standalone transcript or chapters sidecar
 * read on its own (`CueList` in `library/AssetBody.tsx`), which drew three
 * copies of it before.
 *
 * With `onSeek` it is a button that seeks the video to the line; without, a
 * paragraph. `current` marks the line being spoken (`aria-current`), and
 * `className` carries the line's tone, which only the caller knows.
 *
 * The words are capped at 70ch. A spoken line set across the whole of a wide
 * column is a line nobody reads, and `ch` is the width of a zero in the sans,
 * wider than its average letter, so 70ch holds roughly 80 characters of prose.
 * The copies disagreed before (80ch live, 70ch in the sidecar) with the same
 * reason given for both. The raw-file view in `AssetBody.tsx` keeps its 80ch:
 * its text is mono, where a `ch` is exactly one character.
 *
 * No hooks and no `"use client"`, so the server-rendered sidecar list and the
 * client-side panel both draw it.
 */
export function TranscriptLine({
  start,
  text,
  current = false,
  onSeek,
  className,
}: {
  start: number;
  text: string;
  current?: boolean;
  onSeek?: (seconds: number) => void;
  className?: string;
}) {
  const content = (
    <>
      <span className="pt-px text-[12px] tabular-nums text-text3">{formatTimecode(start)}</span>
      <span className="max-w-[70ch]">{text}</span>
    </>
  );
  const line = cx(
    "grid w-full grid-cols-[3rem_minmax(0,1fr)] gap-2 rounded-lg px-2 py-1 text-left text-[14px] leading-[22px] transition-colors duration-150 motion-reduce:transition-none",
    onSeek && "hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
    className,
  );
  return onSeek ? (
    <button type="button" onClick={() => onSeek(start)} aria-current={current ? "true" : undefined} className={line}>
      {content}
    </button>
  ) : (
    <p aria-current={current ? "true" : undefined} className={line}>
      {content}
    </p>
  );
}
