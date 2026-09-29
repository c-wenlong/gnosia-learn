import type { Brief } from "@/lib/studio-jobs";

/**
 * Every call the web app makes to the runner's draft routes, and the shapes
 * they carry. One file on purpose: the routes (phase 1a of
 * docs/STUDIO-CHAT-FIRST.md) were built beside this client, so when a shape
 * moves, this is the one file that moves with it.
 *
 * Browser-side. Every path is `/studio/api/drafts/...`, which the studio's
 * route handler forwards to the runner after checking the request came from
 * this app's own page and adding the signed-in owner (AGENTS.md, the studio
 * proxy). Nothing here reaches the runner directly, and nothing here spawns
 * anything: layering rule 1.
 *
 * No React, so the conversation's pure half (`studio-chat.ts`) and the tests
 * can import the types without a client boundary.
 */

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export type DraftState = "open" | "briefed" | "drawing" | "done" | "abandoned";

/** Who said a transcript entry. `studio` is the runner speaking, not a third voice. */
export type DraftRole = "person" | "planner" | "studio";

/** The topic entry a planner proposes when nothing in the vocabulary fits (D39). */
export interface TopicProposal {
  slug: string;
  title: string;
  domain: string;
  summary: string | null;
  aliases: string[];
  relations: { kind: string; to: string }[];
}

/** A topic the dry run of `catalog topic add` said is close to the proposal. */
export interface NearMatch {
  slug: string;
  title: string;
  score?: number;
  field?: string;
}

export interface PendingTopic {
  entry: TopicProposal;
  nearMatches: NearMatch[];
}

export interface DraftError {
  kind: "agent" | "brief-invalid" | "timeout" | "interrupted";
  message: string;
  field?: string;
}

export interface BriefInvalid {
  field: string;
  message: string;
  /** True when the runner sent the planner one retry; false is E6. */
  retried: boolean;
}

export interface TranscriptEntry {
  seq: number;
  role: DraftRole;
  text: string;
  at: string;
  /** On a planner reply whose brief passed `validateBrief`. */
  brief?: Brief;
  /** On the same reply, when its topic is a proposal rather than a slug that exists. */
  pendingTopic?: PendingTopic;
  /** On a planner reply whose brief failed. */
  briefInvalid?: BriefInvalid;
  /** A first reply the automatic retry replaced: never shown. */
  superseded?: boolean;
  /** The runner's retry note to the planner: never shown. */
  internal?: boolean;
  /** E2: the reply was cut off, and `text` is whatever arrived. */
  interrupted?: boolean;
  costUsd?: number | null;
  costSource?: "result" | "stream" | null;
}

/** `GET /api/drafts/{id}`: the record. The stream is a cache of it. */
export interface DraftView {
  draftId: string;
  kind: "diagram";
  state: DraftState;
  /** The diagram's slug, on a draft opened to extend one. */
  source: string | null;
  /**
   * C11: the diagram's checkout moved on since the EXTENDING block was built
   * from it. Optional: a runner from before it does not send it.
   */
  sourceChanged?: boolean;
  /** The revision the EXTENDING block summarised. Optional, as above. */
  sourceRevision?: number | null;
  title: string | null;
  transcript: TranscriptEntry[];
  brief: Brief | null;
  pendingTopic: PendingTopic | null;
  jobId: string | null;
  turns: number;
  turnCap: number;
  costUsd: number | null;
  costSource: "result" | "stream" | null;
  inFlight: boolean;
  error: DraftError | null;
  created: string;
  updated: string;
  note: string;
}

export interface DraftSummary {
  draftId: string;
  kind: "diagram";
  state: DraftState;
  title: string | null;
  source: string | null;
  turns: number;
  costUsd: number | null;
  updated: string;
  jobId: string | null;
  /**
   * The person's first message, whitespace collapsed and cut to 120
   * characters: what the drafts list shows for a conversation with no brief
   * yet. Optional: a runner from before phase 3 does not send it.
   */
  firstMessage?: string | null;
}

/**
 * What the app says when the runner does not answer: the studio proxy's 502
 * when nothing listens on the runner's port, and this file's own status 0
 * when the fetch itself fails. One string, so a caller can tell a runner
 * that is down from a runner that answered 502 about the request.
 */
export const RUNNER_DOWN = "the studio runner is not answering";

/** True for either way the runner can be down. */
export function runnerDown(status: number, refusal: Refusal): boolean {
  return status === 0 || (status === 502 && refusal.error === RUNNER_DOWN);
}

/** The runner's refusal envelope, on every route. */
export interface Refusal {
  error: string;
  /** A sentence, or an object with a `reason` and the facts behind it. */
  detail: unknown;
}

/** A call's answer, with the failure named rather than thrown. */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; refusal: Refusal };

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
  brief: Brief;
  pendingTopic: PendingTopic | null;
}

export interface BriefInvalidEvent extends BriefInvalid {
  seq: number;
  replySeq: number;
}

export interface StateEvent {
  state: DraftState;
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
  | { type: "state"; data: StateEvent }
  | { type: "error"; data: ErrorEvent };

/* -------------------------------------------------------------------------- */
/* Calls                                                                      */
/* -------------------------------------------------------------------------- */

const BASE = "/studio/api/drafts";

function draftPath(draftId: string, rest = ""): string {
  return `${BASE}/${encodeURIComponent(draftId)}${rest}`;
}

/** A key a retried POST can be recognised by. The runner answers 200 with the first result. */
export function idempotencyKey(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `studio-ui:${prefix}:${random}`;
}

function asRefusal(status: number, body: unknown): Refusal {
  const envelope = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  return {
    error: typeof envelope.error === "string" ? envelope.error : `the runner answered ${status}`,
    detail: envelope.detail ?? null,
  };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      // The studio proxy refuses a body that is not JSON before it strips the
      // headers that say a page sent it, so this is not decoration.
      headers: init.body === undefined ? init.headers : { "content-type": "application/json", ...init.headers },
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      refusal: { error: RUNNER_DOWN, detail: (error as Error).message },
    };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, status: response.status, refusal: asRefusal(response.status, body) };
  return { ok: true, status: response.status, data: body as T };
}

/** `POST /api/drafts`: a new conversation, or one opened on a diagram to extend it. */
export function createDraft(input: { source?: string; idempotencyKey: string }) {
  return call<{ draftId: string; state: DraftState; note: string }>(BASE, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * `GET /api/drafts`: the drafts list, phase 3's section above the grid.
 * Several states go as one comma list (`state=open,briefed`).
 */
export function listDrafts(query: { state?: DraftState | readonly DraftState[]; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (query.state !== undefined) params.set("state", typeof query.state === "string" ? query.state : query.state.join(","));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const search = params.toString();
  return call<{ drafts: DraftSummary[]; note: string }>(search === "" ? BASE : `${BASE}?${search}`);
}

/** `GET /api/drafts/{id}`: the whole record. 404 means pruned or never existed (E9). */
export function getDraft(draftId: string) {
  return call<DraftView>(draftPath(draftId));
}

/**
 * `POST /api/drafts/{id}/messages`: one person turn. 202 means the planner is
 * answering and the reply arrives on the stream. Refusals: 409 `in-flight`,
 * `drawing` or `abandoned`; 422 `turn-cap`; 429 the daily cap, with the same
 * detail `POST /api/jobs` gives; 400 an empty or over-long text.
 */
export function sendMessage(draftId: string, text: string) {
  return call<{ draftId: string; seq: number; note: string }>(draftPath(draftId, "/messages"), {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

/**
 * `POST /api/drafts/{id}/draw`: the press. With a pending topic the runner runs
 * `catalog topic add` first and then enqueues, in the one call. Refusals carry
 * `POST /api/jobs`'s statuses and bodies, and each also lands in the
 * transcript as a studio note (E7).
 */
export function drawDraft(draftId: string, key: string) {
  return call<{ draftId: string; jobId: string; state: DraftState; note: string }>(draftPath(draftId, "/draw"), {
    method: "POST",
    body: JSON.stringify({ idempotencyKey: key }),
  });
}

/**
 * `PUT /api/drafts/{id}/brief`: the person's own edit of the live brief (phase
 * 3). The body is a whole brief; the runner validates it as it validates the
 * planner's, stores it, and appends a studio note carrying it, so the thread
 * shows what changed and the planner hears of it on its next turn. An
 * identical brief is answered 200 and changes nothing.
 *
 * Refusals: 400 with `detail.field` naming the field `validateBrief` refused;
 * 409 with `detail.reason` `in-flight`, `brief-changed` (a planner reply
 * replaced the brief while this edit was checked), `draw-in-progress`,
 * `drawing`, `done` or `abandoned`; 503 when the topic list cannot be read.
 */
export function saveBrief(draftId: string, brief: Brief) {
  return call<{ draftId: string; state: DraftState; brief: Brief; pendingTopic: PendingTopic | null; note: string }>(
    draftPath(draftId, "/brief"),
    { method: "PUT", body: JSON.stringify(brief) },
  );
}

/** `POST /api/drafts/{id}/abandon`: close it for good. Stops a turn in flight first. */
export function abandonDraft(draftId: string) {
  return call<{ draftId: string; state: DraftState; note: string }>(draftPath(draftId, "/abandon"), {
    method: "POST",
    body: "{}",
  });
}

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
    onOpen?: () => void;
    onDrop?: () => void;
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
      handlers.onOpen?.();
    };
    next.onerror = () => {
      handlers.onDrop?.();
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

/**
 * The daily cap as `GET /api/health` reports it, or null when the runner did
 * not answer. Not a draft route, but Draw and Send are disabled on it, so it
 * lives with them. Health runs `doctor` (cached for 30 seconds on the runner)
 * and `claude --version`, so the panel reads it on focus at most every 30
 * seconds and once when the cap's oldest spend ages out, never on a timer.
 */
export async function readDailyCap(): Promise<unknown> {
  const result = await call<{ dailyCap?: unknown }>("/studio/api/health");
  return result.ok ? (result.data.dailyCap ?? null) : null;
}

/* -------------------------------------------------------------------------- */
/* Reading a refusal                                                          */
/* -------------------------------------------------------------------------- */

/** The `reason` a refusal's detail names, when it names one. */
export function refusalReason(refusal: Refusal): string | null {
  const detail = refusal.detail;
  if (typeof detail !== "object" || detail === null) return null;
  const reason = (detail as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}

/** A field of a refusal's detail object, when it is a string. */
export function refusalString(refusal: Refusal, field: string): string | null {
  const detail = refusal.detail;
  if (typeof detail !== "object" || detail === null) return null;
  const value = (detail as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

/** A field of a refusal's detail object, when it is a number. */
export function refusalNumber(refusal: Refusal, field: string): number | null {
  const detail = refusal.detail;
  if (typeof detail !== "object" || detail === null) return null;
  const value = (detail as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
