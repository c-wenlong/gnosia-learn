"use client";

import { useEffect, useRef, useState } from "react";

import type { StudioEvent } from "@/lib/studio-jobs";

/** Every event type the runner's job stream sends. A type left out of this list is never heard. */
export const JOB_EVENT_TYPES = ["phase", "step", "gate", "done", "error"] as const;

/** One array, so "no events for this job" is the same value on every render. */
const EMPTY: StudioEvent[] = [];

/**
 * A job's event stream, `/studio/api/jobs/{id}/events`: the events in `seq`
 * order with each `seq` once, and whether the stream for this job is open.
 * The provider follows the active job with it, and a video panel a job the
 * provider is not following (two jobs can run at once).
 *
 * `EventSource` reconnects by itself and re-sends `Last-Event-ID` when it
 * does, which is what the runner replays from; a fresh connection replays the
 * runner's whole buffer. So the same `seq` can arrive twice, and is kept once.
 *
 * The events are tagged with the job they belong to rather than cleared when
 * the job changes, because clearing them would mean setting state from inside
 * the effect that opens the stream, and state set synchronously in an effect
 * is a cascading render. Tagging makes "whose events are these" something a
 * render can answer. The last job's events stay readable after the stream is
 * turned off, as the record of what it said.
 */
export function useJobEventStream(
  jobId: string | null,
  {
    enabled = true,
    closeAfterMs,
    onEvent,
  }: {
    /** False opens nothing: `?stream=off`, or a job someone else follows. */
    enabled?: boolean;
    /** Close after this long: a finished job's stream replays its buffer, then has nothing to say. */
    closeAfterMs?: number;
    /** Each new event as it lands, after it is held. */
    onEvent?: (event: StudioEvent) => void;
  } = {},
): { events: StudioEvent[]; open: boolean } {
  const [held, setHeld] = useState<{ job: string; events: StudioEvent[] }>({ job: "", events: [] });
  /** The job whose stream is open. Set only from the source's own callbacks. */
  const [liveFor, setLiveFor] = useState<string | null>(null);
  const listener = useRef(onEvent);
  useEffect(() => {
    listener.current = onEvent;
  });

  useEffect(() => {
    if (jobId === null || !enabled) return;
    const job = jobId;
    const source = new EventSource(`/studio/api/jobs/${encodeURIComponent(job)}/events`);
    source.onopen = () => setLiveFor(job);
    source.onerror = () => setLiveFor(null);

    const receive = (message: MessageEvent<string>): void => {
      let event: StudioEvent;
      try {
        event = JSON.parse(message.data) as StudioEvent;
      } catch {
        return;
      }
      setLiveFor(job);
      setHeld((prev) => {
        if (prev.job !== job) return { job, events: [event] };
        if (prev.events.some((seen) => seen.seq === event.seq)) return prev;
        return { job, events: [...prev.events, event].sort((a, b) => a.seq - b.seq) };
      });
      listener.current?.(event);
    };
    for (const type of JOB_EVENT_TYPES) source.addEventListener(type, receive as EventListener);
    const closer =
      closeAfterMs === undefined
        ? null
        : setTimeout(() => {
            source.close();
            setLiveFor((held) => (held === job ? null : held));
          }, closeAfterMs);

    return () => {
      if (closer !== null) clearTimeout(closer);
      for (const type of JOB_EVENT_TYPES) source.removeEventListener(type, receive as EventListener);
      source.close();
    };
  }, [jobId, enabled, closeAfterMs]);

  return {
    events: jobId !== null && held.job === jobId ? held.events : EMPTY,
    open: jobId !== null && liveFor === jobId,
  };
}
