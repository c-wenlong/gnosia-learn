"use client";

import { createContext, useContext } from "react";

import { formatTimecode } from "@/components/media";

/** What the playback store last said about this video, kept current as it saves. */
export type WatchStatus = {
  /** Fraction of the video that has played, 0 to 1. */
  coverage: number;
  /** Past `WATCHED_FRACTION`, so the `watched` event has been appended. */
  watched: boolean;
  /** Where the next visit resumes, in seconds, or 0 for the start. */
  position: number;
  /**
   * The day it was first watched through (`2026-09-29`), made on the server in
   * the habit's time zone so both renders print the same text, or null when
   * it has not been, or was only just now in this tab.
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
  const percent = Math.round(status.coverage * 100);
  const resume = status.position > 0 ? `, stopped at ${formatTimecode(status.position)}` : "";
  if (status.watched) {
    return (
      <span aria-live="polite">
        <span className="font-semibold text-ok-text">
          <svg
            viewBox="0 0 12 12"
            aria-hidden
            className="mr-1 inline size-3 -translate-y-px"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 6.5 5 9l4.5-6" />
          </svg>
          Watched{status.watchedDay !== null ? ` ${status.watchedDay}` : ""}
        </span>
        {` (${percent}% played${resume})`}
      </span>
    );
  }
  return <span aria-live="polite">{percent > 0 ? `${percent}%${resume}` : "Not started"}</span>;
}
