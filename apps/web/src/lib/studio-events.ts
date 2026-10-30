import { draftPath } from "@/lib/studio-client";
import type { Brief } from "@/lib/studio-jobs";
import type { VideoBrief } from "@/lib/studio-brief-video";
import type {
  BriefInvalid,
  DraftError,
  DraftKind,
  DraftSlots,
  DraftState,
  PendingTopic,
  TranscriptEntry,
} from "@/lib/studio-drafts";

/**
 * A draft's event stream (`GET /api/drafts/{id}/events`): the event shapes,
 * and the reader that reopens a stream the browser closed for good.
 * Browser-side, through the studio proxy.
 */

/* -------------------------------------------------------------------------- */
/* The stream's events                                                        */
/* -------------------------------------------------------------------------- */

/** The event names `GET /api/drafts/{id}/events` sends, in the doc's API table. */
export const DRAFT_EVENT_TYPES = [
  "delta",
  "message",
  "reply",
  "studio",
  "brief",
  "brief-invalid",
  "brief-ignored",
  "state",
  "error",
] as const;

export type DraftEventType = (typeof DRAFT_EVENT_TYPES)[number];

/** A reply as it arrives: the whole text so far, for the person turn `turn`. No `id:`. */
export interface DeltaEvent {
  turn: number;
  text: string;
}

export interface BriefEvent {
  seq: number;
  replySeq: number;
  kind?: DraftKind;
  requestSeq?: number | null;
  brief: Brief | VideoBrief;
  pendingTopic: PendingTopic | null;
  /** A video brief's V11 words, as on the transcript's brief. */
  abbreviations?: string[];
}

export interface BriefInvalidEvent extends BriefInvalid {
  seq: number;
  replySeq: number;
}

export interface StateEvent {
  state: DraftState;
  slots?: DraftSlots;
  waiting?: DraftKind[];
  pair?: { requestSeq: number; kinds: DraftKind[] } | null;
  jobId: string | null;
  inFlight: boolean;
  turns: number;
  costUsd: number | null;
  costSource: "result" | "stream" | null;
}

export interface ErrorEvent {
  seq: number;
  kind: DraftError["kind"];
  message: string;
  replySeq?: number;
}

export type DraftEvent =
  | { type: "delta"; data: DeltaEvent }
  | { type: "message" | "reply" | "studio"; data: TranscriptEntry }
  | { type: "brief"; data: BriefEvent }
  | { type: "brief-invalid"; data: BriefInvalidEvent }
  | { type: "brief-ignored"; data: { seq: number; replySeq: number; kind: DraftKind } }
  | { type: "state"; data: StateEvent }
  | { type: "error"; data: ErrorEvent };

/** Backoff between reconnects after the browser gave up: 1s, 2s, 4s, up to 30s. */
export function reconnectDelay(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt));
}

/**
 * `GET /api/drafts/{id}/events?after=<seq>`: the stream.
 *
 * `EventSource` cannot set `Last-Event-ID` on its first connection, so the
 * panel reads the record first and asks for what came after its last entry;
 * on a reconnect the browser sends the header itself. Persisted events carry
 * `id: <seq>`; `delta` carries none, and is re-sent after the replay when a
 * turn is still in flight.
 *
 * **A stream the browser closed for good is reopened here.** `EventSource`
 * retries a dropped connection by itself, but a retry answered with anything
 * but 200 (the runner restarting, so the proxy answers 502) closes it for
 * good, and the panel would then sit on polling alone. So on an error that
 * leaves the source `CLOSED`, this opens a new one after a backoff, from
 * whatever `after()` says the record holds now, and tells the caller through
 * `onReopen` so it can read the record for what it missed.
 *
 * A payload that does not parse is dropped: the record is re-read after every
 * event that matters, so a lost one costs nothing but a moment.
 */
export function openDraftEvents(
  draftId: string,
  after: number | (() => number),
  handlers: {
    onEvent: (event: DraftEvent) => void;
    onReopen?: () => void;
  },
): () => void {
  const from = () => Math.max(0, typeof after === "function" ? after() : after);
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let stopped = false;

  const listeners = DRAFT_EVENT_TYPES.map((type) => {
    const listener = (message: MessageEvent<string>) => {
      let data: unknown;
      try {
        data = JSON.parse(message.data);
      } catch {
        return;
      }
      if (typeof data !== "object" || data === null) return;
      handlers.onEvent({ type, data } as DraftEvent);
    };
    return [type, listener] as const;
  });

  const detach = (held: EventSource) => {
    for (const [type, listener] of listeners) held.removeEventListener(type, listener as EventListener);
    held.close();
  };

  const connect = () => {
    if (stopped) return;
    const next = new EventSource(draftPath(draftId, `/events?after=${from()}`));
    source = next;
    next.onopen = () => {
      attempt = 0;
    };
    next.onerror = () => {
      if (next.readyState !== EventSource.CLOSED || stopped) return;
      detach(next);
      if (source === next) source = null;
      const wait = reconnectDelay(attempt);
      attempt += 1;
      retry = setTimeout(() => {
        retry = null;
        if (stopped) return;
        handlers.onReopen?.();
        connect();
      }, wait);
    };
    for (const [type, listener] of listeners) next.addEventListener(type, listener as EventListener);
  };

  connect();
  return () => {
    stopped = true;
    if (retry !== null) clearTimeout(retry);
    if (source !== null) detach(source);
    source = null;
  };
}
