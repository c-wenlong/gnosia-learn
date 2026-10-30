"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { topSeq, type Value } from "@/components/studio/draft/thread";
import { getDraft, type DraftView } from "@/lib/studio-drafts";
import { openDraftEvents } from "@/lib/studio-events";
import { announceDraftChange } from "@/lib/studio-draft-list";

/** The polled record while a turn is in flight, for when the stream is down. */
const POLL_IN_FLIGHT_MS = 4_000;

export type RecordStatus = "loading" | "ready" | "gone" | "down";

/**
 * The conversation's record, as the panel caches it. **The runner owns the
 * draft; this is a cache of it**, as `JobsProvider` is of the jobs.
 * `GET /api/drafts/{id}` is the record. The event stream adds the one thing
 * the record cannot, a reply growing as it is written (`delta`), and every
 * other event is a cue to read the record again, so a missed event or a
 * dropped stream costs a moment and nothing else.
 *
 * `pending` is the person's turn between Send and the record having it: a
 * verb sets it, and the read that finds its seq in the transcript clears it.
 * `refreshJobs` is the jobs cache's read, asked whenever a job may have moved.
 */
export function useDraftRecord(draftId: string, refreshJobs: () => Promise<unknown>) {
  const [view, setView] = useState<DraftView | null>(null);
  const [status, setStatus] = useState<RecordStatus>("loading");
  const [downReason, setDownReason] = useState<string | null>(null);
  /** The reply being written, as the last `delta` had it. */
  const [stream, setStream] = useState<{ turn: number; text: string } | null>(null);
  /** The person's turn between Send and the record having it. */
  const [pending, setPending] = useState<{ value: Value; seq: number | null } | null>(null);
  /**
   * The newest seq the first read of the record held. Entries after it are
   * new while the panel is open and animate in; the ones it opened with do
   * not, so reopening a conversation does not replay it. Null until read.
   */
  const [baseline, setBaseline] = useState<number | null>(null);

  // The sidebar lists this conversation by its name, its title, its first
  // message and its state, so each change to those is news to it (`ChatHistory`).
  const listed = view === null ? null : `${view.state}|${view.name ?? ""}|${view.title ?? ""}|${view.transcript.length}`;
  useEffect(() => {
    if (listed !== null) announceDraftChange(draftId);
  }, [draftId, listed]);

  /**
   * Reads can overlap (an event, the poll, focus), and an older answer
   * landing after a newer one would put the thread back a step. Each read
   * takes a number, and an answer older than the last one shown is dropped.
   */
  const issued = useRef(0);
  const shown = useRef(0);
  const load = useCallback(async (): Promise<DraftView | null> => {
    issued.current += 1;
    const ticket = issued.current;
    const result = await getDraft(draftId);
    if (ticket < shown.current) return null;
    shown.current = ticket;
    if (!result.ok) {
      if (result.status === 404) setStatus("gone");
      else {
        // A runner that went away mid-conversation keeps what is on screen
        // and says so; a first read that failed has nothing to keep.
        setDownReason(result.refusal.error);
        setStatus((held) => (held === "ready" ? held : "down"));
      }
      return null;
    }
    const fresh = result.data;
    setView(fresh);
    setBaseline((held) => held ?? topSeq(fresh.transcript));
    setStatus("ready");
    setDownReason(null);
    if (!fresh.inFlight) setStream(null);
    setPending((held) => {
      if (held === null) return null;
      if (held.seq !== null && fresh.transcript.some((entry) => entry.seq === held.seq)) return null;
      return held;
    });
    return fresh;
  }, [draftId]);

  // Several events in one burst (a reply, its briefs, the state) are one read.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reload = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void load();
    }, 60);
  }, [load]);

  useEffect(() => {
    // The first read runs from an effect because the record lives on the
    // runner, reached through the browser's proxy; the page cannot read it
    // for the first paint without a second implementation of this panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [load]);

  /* ---------------------------------------------------------------- */
  /* The stream                                                        */
  /* ---------------------------------------------------------------- */

  const ready = status === "ready";
  const lastSeq = useRef(0);
  useEffect(() => {
    lastSeq.current = view === null ? 0 : topSeq(view.transcript);
  }, [view]);

  useEffect(() => {
    if (!ready) return;
    return openDraftEvents(draftId, () => lastSeq.current, {
      // The browser gave up on the stream and it was opened again: whatever
      // happened meanwhile is in the record.
      onReopen: () => void load(),
      onEvent: (event) => {
        if (event.type === "delta") {
          setStream({ turn: event.data.turn, text: event.data.text });
          return;
        }
        // A reply that ended, or one the runner refused and is retrying, is
        // no longer the text being written: the retry's deltas start again.
        if (event.type === "reply" || event.type === "brief-invalid" || event.type === "error") setStream(null);
        if (event.type === "state" && (event.data.state === "drawing" || event.data.jobId !== null || event.data.slots !== undefined)) {
          void refreshJobs();
        }
        reload();
      },
    });
  }, [draftId, ready, reload, refreshJobs, load]);

  // The record is the truth, so a turn in flight is also polled: with the
  // stream down, the reply still arrives, only without growing on screen.
  const inFlight = (view?.inFlight ?? false) || pending !== null;
  useEffect(() => {
    if (!inFlight) return;
    const every = setInterval(() => void load(), POLL_IN_FLIGHT_MS);
    return () => clearInterval(every);
  }, [inFlight, load]);

  // Focus is a cue too: a job held elsewhere may have been accepted
  // meanwhile, and the record may have moved in another tab.
  useEffect(() => {
    const wake = () => {
      void refreshJobs();
      void load();
    };
    window.addEventListener("focus", wake);
    return () => window.removeEventListener("focus", wake);
  }, [refreshJobs, load]);

  return { view, status, ready, downReason, stream, pending, setPending, baseline, load };
}
