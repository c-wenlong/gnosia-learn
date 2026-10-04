import { useCallback, useRef, useState } from "react";

import type { StatusTone } from "./LiveStatus";

/**
 * A save's progress, and the words a `LiveStatus` (or a `FormRow`'s
 * `status`) says about it.
 *
 * `text` on `saving` and `saved` is for a caller whose words change with the
 * action ("Deleting…", "Key saved."); without it `statusProps` uses the words
 * it is given. An error always carries its own message, since only the
 * caller knows why the save failed.
 *
 * No `"use client"`: `statusProps` is a plain function a server component may
 * call, and a client module's exports reach a server component as references,
 * not functions. `useSaveStatus` is a hook, so only a client component can
 * call it anyway.
 */
export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving"; text?: string }
  | { kind: "saved"; text?: string }
  | { kind: "error"; message: string };

/** The words most saves use. */
export const SAVE_WORDS = { saving: "Saving…", saved: "Saved" } as const;

/** What a status says, as `LiveStatus` takes it: nothing while idle. */
export function statusProps(
  status: SaveStatus | undefined,
  words: { saving: string; saved: string } = SAVE_WORDS,
): { text: string | null; tone: StatusTone } {
  switch (status?.kind) {
    case "saving":
      return { text: status.text ?? words.saving, tone: "muted" };
    case "saved":
      return { text: status.text ?? words.saved, tone: "ok" };
    case "error":
      return { text: status.message, tone: "danger" };
    default:
      return { text: null, tone: "muted" };
  }
}

/** Said when a save's promise rejects rather than answering, which none does today. */
const REJECTED = "Not saved.";

/**
 * A save's status, and `track`, which reports a save through it: "saving" at
 * once, then "saved", or "error" with the message the save resolved to.
 *
 * The promise resolves to `null` when the save landed and to the words to
 * show when it did not. Only the newest save reports: an earlier one
 * finishing late cannot print "Saved" over a later one still in flight, or
 * its failure over the later one's success.
 *
 * `setStatus` is for a status no save stands behind, such as a value refused
 * before it is sent; it does not end the wait on a save already in flight.
 */
export function useSaveStatus(): {
  status: SaveStatus;
  setStatus: (status: SaveStatus) => void;
  track: (save: Promise<string | null>) => void;
} {
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const latest = useRef(0);
  const track = useCallback((save: Promise<string | null>) => {
    setStatus({ kind: "saving" });
    const mine = ++latest.current;
    void save.then(
      (error) => {
        if (mine !== latest.current) return;
        setStatus(error === null ? { kind: "saved" } : { kind: "error", message: error });
      },
      () => {
        if (mine === latest.current) setStatus({ kind: "error", message: REJECTED });
      },
    );
  }, []);
  return { status, setStatus, track };
}
