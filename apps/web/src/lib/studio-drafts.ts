import type { Mention } from "@/components/ui/mention-text";
import type { VideoBrief } from "@/lib/studio-brief-video";
import type { Brief } from "@/lib/studio-jobs";

export type { VideoAudience, VideoBeat, VideoBrief, VideoScene } from "@/lib/studio-brief-video";

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

/**
 * What a draft can make (docs/STUDIO-MENTIONS.md). A kind lives on a brief
 * and a job, never on the draft: one draft may hold a live diagram brief and
 * a live video brief at once (D60).
 */
export const DRAFT_KINDS = ["diagram", "video"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export function isDraftKind(value: unknown): value is DraftKind {
  return typeof value === "string" && (DRAFT_KINDS as readonly string[]).includes(value);
}

/** A chip in a person's message: the kind it tags and where its `@<kind>` sits in the text (D57). */
export type DraftMention = Mention<DraftKind>;

/** One brief a planner reply (or an edit's note) carries, with the tagged message it answers (D61). */
export type TranscriptBrief =
  | { kind: "diagram"; brief: Brief; requestSeq: number | null }
  | { kind: "video"; brief: VideoBrief; requestSeq: number | null; abbreviations?: string[] };

/** A `hold` block the planner ended an untagged reply with: the kinds it contradicts, and why (D60). */
export interface HoldBlock {
  kinds: DraftKind[];
  reason: string;
}

/**
 * One kind's slot in `draft.json` (D62): the brief in force for that kind,
 * its newest job, whether a tagged request is still owed a brief, and whether
 * the planner put the brief on hold.
 */
export interface DraftSlot {
  brief: Brief | VideoBrief | null;
  briefAt?: string | null;
  /** The transcript seq of the entry carrying the brief in force. */
  briefSeq: number | null;
  briefBy?: "planner" | "person" | null;
  pendingTopic: PendingTopic | null;
  jobId: string | null;
  /** Set while a tagged request for this kind is owed a brief. */
  waiting: { requestSeq: number } | null;
  /** The tagged message the brief in force answered, which pairs it for Make both. */
  requestSeq: number | null;
  /** Set while the brief in force is on hold. */
  held: { reason: string; at?: string } | null;
  state: "open" | "briefed" | "drawing" | "done";
  /**
   * The job a press of this kind would discard and replace in one
   * transaction: a video in review, changed by a newer brief (D52). The
   * runner's name for it was still to be settled when this was written;
   * `replacesJob` below is the one place that reads it.
   */
  replaces?: { jobId: string } | string | null;
}

/**
 * The job in review a press of `kind` would replace (Make video becomes
 * "Replace and make video"), or null. The one reader of the runner's field,
 * so adapting to its final name is a change here and nowhere else.
 */
export function replacesJob(view: { slots?: DraftSlots }, kind: DraftKind): string | null {
  const raw = view.slots?.[kind]?.replaces ?? null;
  if (typeof raw === "string") return raw === "" ? null : raw;
  return raw !== null && typeof raw === "object" && typeof raw.jobId === "string" ? raw.jobId : null;
}

export type DraftSlots = Partial<Record<DraftKind, DraftSlot>>;

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
  /** The kind whose brief was refused. Absent from a runner before STUDIO-MENTIONS.md, which meant diagram. */
  kind?: DraftKind;
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
  /**
   * On a planner reply whose brief passed `validateBrief`. Since
   * STUDIO-MENTIONS.md, the newest diagram brief, kept one release beside
   * `briefs` so the runner PR can land first (its API table).
   */
  brief?: Brief;
  /** Every brief the reply (or an edit's note) carries, one per kind (D61). */
  briefs?: TranscriptBrief[];
  /** On a person's message: its chips (D57). */
  mentions?: DraftMention[];
  /** On a planner reply: the kinds it offers as suggestion buttons (D58). */
  suggest?: DraftKind[];
  /** On a planner reply: the live cards it puts on hold (D60). */
  hold?: HoldBlock | null;
  /** Refused briefs of a reply, by kind, when more than one kind was judged. */
  briefsInvalid?: BriefInvalid[];
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
  /** Since STUDIO-MENTIONS.md, the newest brief's kind, for display only (D62). */
  kind: DraftKind;
  state: DraftState;
  /** The diagram's slug, on a draft opened to extend one, or the video's on a change draft. */
  source: string | null;
  /** What `source` names. Absent from a runner before video phase 2, which meant diagram. */
  sourceKind?: DraftKind;
  /** Per kind: the brief in force, its job, waiting and held (D62). Absent from a runner before 2a. */
  slots?: DraftSlots;
  /** The kinds this draft's planner prompt carries (D59). Absent means `["diagram"]`, a draft from before. */
  plannerKinds?: DraftKind[];
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
  /** The seq of the entry carrying the brief in force. Optional: a runner from before phase 3 does not send it. */
  briefSeq?: number | null;
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
  kind: DraftKind;
  /** The kinds the draft has briefs or jobs of, for the list's glyphs. Optional: a runner before 2a omits it. */
  kinds?: DraftKind[];
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
  kind?: DraftKind;
  brief: Brief | VideoBrief;
  pendingTopic: PendingTopic | null;
}

export interface BriefInvalidEvent extends BriefInvalid {
  seq: number;
  replySeq: number;
}

export interface StateEvent {
  state: DraftState;
  slots?: DraftSlots;
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
export function createDraft(input: { source?: string; sourceKind?: "diagram" | "video"; idempotencyKey: string }) {
  return call<{ draftId: string; state: DraftState; note: string }>(BASE, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * `GET /api/drafts`: the drafts list, phase 3's section above the grid.
 * Several states go as one comma list (`state=open,briefed`); `nonEmpty`
 * leaves out drafts nobody has said anything in, before the limit applies.
 */
export function listDrafts(
  query: { state?: DraftState | readonly DraftState[]; nonEmpty?: boolean; limit?: number } = {},
) {
  const params = new URLSearchParams();
  if (query.state !== undefined) params.set("state", typeof query.state === "string" ? query.state : query.state.join(","));
  if (query.nonEmpty === true) params.set("nonEmpty", "1");
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const search = params.toString();
  return call<{ drafts: DraftSummary[]; note: string }>(search === "" ? BASE : `${BASE}?${search}`);
}

/** `GET /api/drafts/{id}`: the whole record. 404 means pruned or never existed (E9). */
export function getDraft(draftId: string) {
  return call<DraftView>(draftPath(draftId));
}

/**
 * `POST /api/drafts/{id}/messages`: one person turn, `{ text, mentions? }`
 * (D57). 202 means the planner is answering and the reply arrives on the
 * stream. Refusals: 409 `in-flight` or `abandoned`; 409
 * `kind-not-in-conversation` for a tag this draft's prompt cannot make (T4);
 * 422 `turn-cap`; 429 the daily cap, with the same detail `POST /api/jobs`
 * gives; 400 `{ field: "mentions" }` for a mention the runner's checks refuse,
 * and `{ field: "text" }` for an empty or over-long text or a bare tag in an
 * empty conversation. No longer refused while a job runs (C14 lifted).
 *
 * `mentions` is left out when there are none, so an untagged turn is the body
 * a runner from before STUDIO-MENTIONS.md already takes.
 */
export function sendMessage(draftId: string, body: string | { text: string; mentions?: readonly DraftMention[] }) {
  const message = typeof body === "string" ? { text: body } : body;
  const payload = message.mentions !== undefined && message.mentions.length > 0 ? message : { text: message.text };
  return call<{ draftId: string; seq: number; note: string }>(draftPath(draftId, "/messages"), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * `POST /api/drafts/{id}/draw`: the press. With a pending topic the runner runs
 * `catalog topic add` first and then enqueues, in the one call. Refusals carry
 * `POST /api/jobs`'s statuses and bodies, and each also lands in the
 * transcript as a studio note (E7).
 */
export function drawDraft(draftId: string, key: string, kind: DraftKind = "diagram") {
  return call<{ draftId: string; jobId: string; state: DraftState; kind?: DraftKind; note: string }>(draftPath(draftId, "/draw"), {
    method: "POST",
    // `kind` goes only when it is not the default, so a Draw is the body a
    // runner from before STUDIO-MENTIONS.md already takes.
    body: JSON.stringify(kind === "diagram" ? { idempotencyKey: key } : { idempotencyKey: key, kind }),
  });
}

/** One item of Make both's answer: the job it started, or the refusal its own press would have had. */
export type DrawItemResult =
  | { kind: DraftKind; jobId: string }
  | { kind: DraftKind; status: number; refusal: Refusal };

/**
 * Make both (D60): `POST /api/drafts/{id}/draw` with `{ items: [{ kind,
 * idempotencyKey }, ...] }`. The runner handles each item on its own (topics,
 * then enqueue) and answers `200 { results }`, one per item, each started or
 * refused exactly as that card's own press would have been. A retried press
 * is safe: each key returns the job it already started.
 */
export async function drawBoth(draftId: string, items: readonly { kind: DraftKind; idempotencyKey: string }[]) {
  const result = await call<{ draftId: string; results?: unknown[]; note?: string }>(draftPath(draftId, "/draw"), {
    method: "POST",
    body: JSON.stringify({ items }),
  });
  if (!result.ok) return result;
  return { ...result, data: { ...result.data, results: drawResults(result.data.results) } };
}

/** Make both's `results`, read defensively: a malformed entry is dropped. */
export function drawResults(raw: unknown): DrawItemResult[] {
  if (!Array.isArray(raw)) return [];
  const out: DrawItemResult[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    if (!isDraftKind(item.kind)) continue;
    if (typeof item.jobId === "string") {
      out.push({ kind: item.kind, jobId: item.jobId });
      continue;
    }
    const status = typeof item.status === "number" ? item.status : 500;
    const refusal = typeof item.refusal === "object" && item.refusal !== null ? asRefusal(status, item.refusal) : asRefusal(status, item);
    out.push({ kind: item.kind, status, refusal });
  }
  return out;
}

/**
 * `POST /api/drafts/{id}/slots/{kind}/stop-waiting`: the person no longer
 * wants the brief a tag asked for (D57). `200` with the slots; a kind not
 * waiting is `200` and writes nothing.
 */
export function stopWaiting(draftId: string, kind: DraftKind) {
  return call<{ slots?: DraftSlots }>(draftPath(draftId, `/slots/${encodeURIComponent(kind)}/stop-waiting`), {
    method: "POST",
    body: "{}",
  });
}

/**
 * `POST /api/drafts/{id}/slots/{kind}/use?base=<seq>`: Use this brief, which
 * takes a held brief off hold with no turn (D60). `409 brief-changed` when
 * `base` is no longer that kind's brief in force; a brief not on hold is
 * `200` and writes nothing.
 */
export function releaseHold(draftId: string, kind: DraftKind, base: number) {
  return call<{ slots?: DraftSlots }>(
    draftPath(draftId, `/slots/${encodeURIComponent(kind)}/use?base=${encodeURIComponent(String(base))}`),
    { method: "POST", body: "{}" },
  );
}

/**
 * `PUT /api/drafts/{id}/brief`: the person's own edit of the live brief (phase
 * 3). The body is a whole brief; the runner validates it as it validates the
 * planner's, stores it, and appends a studio note carrying it, so the thread
 * shows what changed and the planner hears of it on its next turn. An
 * identical brief is answered 200 and changes nothing.
 *
 * `base` is the transcript seq of the entry carrying the brief that was
 * edited (a planner reply, or the note of an earlier edit). The runner
 * refuses a base that is no longer the brief in force with 409
 * `brief-changed`, so an edit of an older brief never lands over a newer one
 * written meanwhile by the planner or another tab.
 *
 * Refusals: 400 with `detail.field` naming the field `validateBrief` refused;
 * 409 with `detail.reason` `in-flight`, `brief-changed` (a planner reply
 * replaced the brief while this edit was checked), `draw-in-progress`,
 * `drawing`, `done` or `abandoned`; 503 when the topic list cannot be read.
 */
export function saveBrief(draftId: string, brief: Brief | VideoBrief, base: number, kind: DraftKind = "diagram") {
  return call<{
    draftId: string;
    state: DraftState;
    brief: Brief | VideoBrief;
    briefSeq?: number | null;
    pendingTopic: PendingTopic | null;
    note: string;
  }>(
    draftPath(
      draftId,
      `/brief?base=${encodeURIComponent(String(base))}${kind === "diagram" ? "" : `&kind=${encodeURIComponent(kind)}`}`,
    ),
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
  return (await readStudioHealth())?.dailyCap ?? null;
}

/**
 * The two parts of `/api/health` the conversation acts on: the daily cap, and
 * the video doctor (`video`), which decides whether the menu's Video entry and
 * the Video suggestion can be used (T5, T25). Null when the runner did not
 * answer. Read at the same rate as the cap, for the same reason.
 */
export async function readStudioHealth(): Promise<{ dailyCap: unknown; video: unknown } | null> {
  const result = await call<{ dailyCap?: unknown; video?: unknown }>("/studio/api/health");
  return result.ok ? { dailyCap: result.data.dailyCap ?? null, video: result.data.video ?? null } : null;
}

/** Whether a video can be made now, and why not, from health's `video` block. */
export interface VideoAvailability {
  ok: boolean;
  /** The doctor's reason, when it fails. */
  reason: string | null;
}

/**
 * Read health's `video` block (`{ ok, checks, note? }`, #201). A failing
 * doctor gives its first failing check's detail, else its note. An absent
 * block (a runner from before the video runner) is unavailable, with no
 * reason, which the menu words as "not available on this machine".
 */
export function videoAvailability(raw: unknown): VideoAvailability {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: null };
  const video = raw as { ok?: unknown; note?: unknown; checks?: unknown };
  if (video.ok === true) return { ok: true, reason: null };
  const failing = Array.isArray(video.checks)
    ? video.checks.find((check) => typeof check === "object" && check !== null && (check as { ok?: unknown }).ok === false)
    : undefined;
  const detail =
    failing === undefined
      ? null
      : (["detail", "note", "message", "name"] as const)
          .map((field) => (failing as Record<string, unknown>)[field])
          .find((value): value is string => typeof value === "string" && value.trim() !== "") ?? null;
  const note = typeof video.note === "string" && video.note.trim() !== "" ? video.note : null;
  return { ok: false, reason: detail ?? note };
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
