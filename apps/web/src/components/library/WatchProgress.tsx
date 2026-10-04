"use client";

import { createContext, useContext } from "react";

import { formatTimecode } from "@/components/media";
import { Glyph } from "@/components/ui/Glyph";

/** What the playback store last said about this video, kept current as it saves. */
export type WatchStatus = {
  /** Fraction of the video that has played, 0 to 1. */
  coverage: number;
  /** Past `WATCHED_FRACTION`, so the `watched` event has been appended. */
  watched: boolean;
  /** Where the reader stopped, as stored, in seconds. */
  position: number;
  /**
   * The day it was first watched through (`2026-09-29`), made on the server in
   * the app's time zone (by the page, then by each save's answer), or null.
   */
  watchedDay: string | null;
};

export const WatchStatusContext = createContext<WatchStatus | null>(null);

/**
 * How much of this video the reader has watched, for the Details tab.
 *
 * The Details list is drawn on the server and handed to the player as a tab,
 * so this cell reads the live status from `LibraryVideo`'s context rather
 * than a prop: it moves as the player saves, without the page re-rendering.
 */
export function WatchProgress() {
  const status = useContext(WatchStatusContext);
  if (status === null) return <>unknown</>;
  // A few seconds of a long video rounds to 0%, which is not the same as none.
  const rounded = Math.round(status.coverage * 100);
  const percent = status.coverage > 0 && rounded === 0 ? "<1%" : `${rounded}%`;
  const stopped = status.position >= 1 ? `stopped at ${formatTimecode(status.position)}` : null;
  const resume = stopped === null ? "" : `, ${stopped}`;
  if (status.watched) {
    return (
      <span aria-live="polite">
        <span className="font-semibold text-ok-text">
          <Glyph name="tick" size={14} className="mr-1 inline -translate-y-px" />
          Watched{status.watchedDay !== null ? ` ${status.watchedDay}` : ""}
        </span>
        {` (${percent} played${resume})`}
      </span>
    );
  }
  const text =
    status.coverage > 0 ? `${percent}${resume}` : stopped !== null ? `Not played yet, ${stopped}` : "Not started";
  return <span aria-live="polite">{text}</span>;
}
