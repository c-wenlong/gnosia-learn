import type { Mention } from "@/lib/mentions";
import { storedHarness } from "@/lib/studio-harness";
import type { VideoBrief } from "@/lib/studio-brief-video";
import { asRefusal, call, DRAFTS_BASE as BASE, draftPath, type Refusal } from "@/lib/studio-client";
import type { Brief } from "@/lib/studio-jobs";

/**
 * Every call the web app makes to the runner's draft routes, and the shapes
 * they carry. The routes (phase 1a of docs/STUDIO-CHAT-FIRST.md) were built
 * beside this client, so when a draft shape moves, this is the file that
 * moves with it. The client underneath is `studio-client.ts`; the stream is
 * `studio-events.ts`, the BYOK settings `studio-byok.ts`, and health
 * `studio-health.ts`.
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

/**
 * The kinds a message can tag (D105): the draft kinds plus `svg`, the
 * picture a planner reply draws itself as one fenced `svg` block. `svg`
 * never has a slot, a waiting, a card or a job — it is content, not a brief.
 */
export const TAG_KINDS = ["diagram", "video", "svg"] as const;
export type TagKind = (typeof TAG_KINDS)[number];

export function isTagKind(value: unknown): value is TagKind {
  return typeof value === "string" && (TAG_KINDS as readonly string[]).includes(value);
}

/** A chip in a person's message: the kind it tags and where its `@<kind>` sits in the text (D57). */
export type DraftMention = Mention<TagKind>;

/** One brief a planner reply (or an edit's note) carries, with the tagged message it answers (D61). */
export type TranscriptBrief =
  | { kind: "diagram"; brief: Brief; requestSeq: number | null; pendingTopic?: PendingTopic | null }
  | {
      kind: "video";
      brief: VideoBrief;
      requestSeq: number | null;
      pendingTopic?: PendingTopic | null;
      /** V11's words the voice would read as words, from gnosia-audio's pronunciation table; absent from a runner that has not read it. */
      abbreviations?: string[];
    };

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
  /** The slot's own kind (#207). */
  kind?: DraftKind;
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
  /** The state of `jobId`, as the runner last saw it (#207). */
  jobState?: string | null;
  /** The runner's own word that this slot's brief is in force and pressable (#207). */
  live?: boolean;
  /** This kind's job from the draft that has not reached a verdict, which holds the press (#207). */
  busy?: { jobId: string; state: string } | null;
  /**
   * The job a press of this kind would discard and replace in one
   * transaction: a video in review, changed by a newer brief (D52).
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
  /** The kind whose brief the error is about (#207). */
  briefKind?: DraftKind;
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
  /** On a person's message: the idempotency key it was sent with, when it had one. */
  key?: string;
  /** On a planner reply: the kinds it offers as suggestion buttons (D58, D105). */
  suggest?: TagKind[];
  /** On a planner reply with a suggestion: the pitch line its consent card shows (D106). */
  pitch?: string | null;
  /** The kinds of the reply's suggestion the person declined (D109). */
  declined?: TagKind[];
  /** On a planner reply: the live cards it puts on hold (D60). */
  hold?: HoldBlock | null;
  /** Refused briefs of a reply, by kind, when more than one kind was judged. */
  briefsInvalid?: BriefInvalid[];
  /** Kinds whose brief the runner dropped because nothing tagged or awaited them (T24). Never shown. */
  briefsIgnored?: DraftKind[];
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
  /** The kinds this draft's planner prompt carries (D59, D105). Absent means `["diagram"]`, a draft from before. */
  plannerKinds?: TagKind[];
  /** False for a draft from before the combined prompt, whose untagged messages count as tagged Diagram (#207). */
  conversational?: boolean;
  /** The kinds still owed a brief, oldest request first (#207). The slots' `waiting` says the same per kind. */
  waiting?: DraftKind[];
  /** A diagram and a video card live, not held, answering one message: Make both's pair (#207). */
  pair?: { requestSeq: number; kinds: DraftKind[] } | null;
  /**
   * C11: the diagram's checkout moved on since the EXTENDING block was built
   * from it. Optional: a runner from before it does not send it.
   */
  sourceChanged?: boolean;
  /** The revision the EXTENDING block summarised. Optional, as above. */
  sourceRevision?: number | null;
  /**
   * The concept a hand-off from the concept tutor opened the draft on
   * (docs/STUDIO-TUTOR-HANDOFF.md), with how many tutor turns reached the
   * planner after its 6,000-character cap. Null on every other draft, and
   * absent from a runner before the hand-off.
   */
  concept?: DraftConcept | null;
  title: string | null;
  /**
   * The name the owner gave the conversation (Rename), shown before `title`
   * (`conversationTitle`). Optional: a runner from before it does not send it.
   */
  name?: string | null;
  /**
   * The model the conversation's own picker holds (D90), null for the
   * runner's default. Optional: a runner from before it does not send it.
   */
  model?: string | null;
  /**
   * The harness the conversation's turns run on: `"claude"` or `"byok"`
   * (Qwen Code on the owner's key). Optional: a runner from before it does
   * not send it.
   */
  harness?: string | null;
  transcript: TranscriptEntry[];
  /**
   * The brief kinds this conversation may start unprompted, from Always allow
   * on a consent card (D108). Optional: a runner before the consent card does
   * not send it.
   */
  trust?: DraftKind[];
  /**
   * What a make of each kind has cost on this machine, for the consent card's
   * estimate (D107): null under three finished jobs. Optional, as above.
   */
  estimates?: Partial<Record<DraftKind, CostBand | null>>;
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

/** A kind's cost band from the machine's finished jobs (D107). */
export interface CostBand {
  low: number;
  high: number;
  n: number;
}

/** `concept` on a draft's record (D65 of docs/STUDIO-TUTOR-HANDOFF.md). */
export interface DraftConcept {
  slug: string;
  title: string;
  /** The topic whose concept list names the slug, or null when none does (H13). */
  topic: string | null;
  /** The tutor turns the TUTOR block carries, at least in part: what the pinned line counts. */
  tutorTurns: number;
}

export interface DraftSummary {
  draftId: string;
  kind: DraftKind;
  /** The kinds the draft has briefs or jobs of, for the list's glyphs. Optional: a runner before 2a omits it. */
  kinds?: DraftKind[];
  state: DraftState;
  title: string | null;
  /** The owner's name for the conversation, shown before `title`. Optional: a runner from before it does not send it. */
  name?: string | null;
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
  /** The concept a hand-off from the tutor opened it on: its title names a row with no brief yet. */
  concept?: { slug: string; title: string } | null;
}

/* -------------------------------------------------------------------------- */
/* Calls                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How long a create opened on a diagram or a video waits. The runner answers
 * it only after the checkout and `canvas inspect`, and gives `inspect` alone
 * 180 seconds (`STUDIO_VERB_TIMEOUT_MS`), so the shared `CALL_TIMEOUT_MS`
 * gave up on a cold Chromium while the runner was still making the draft.
 * Past this the answer is `RUNNER_SLOW`, and a retry with the same key joins
 * the create still running.
 */
export const SOURCE_CREATE_TIMEOUT_MS = 240_000;

/**
 * `POST /api/drafts`: a new conversation, or one opened on a diagram to
 * extend it. `model` is the picker its composer carries (D90); `harness` is
 * the pane picker's last pick, so the conversation's turns run on the harness
 * it shows. `"claude"` is the runner's default and is not sent.
 */
export function createDraft(input: { source?: string; sourceKind?: "diagram" | "video"; idempotencyKey: string; model?: string; harness?: string }) {
  const { harness: picked, ...rest } = input;
  const harness = picked ?? storedHarness();
  return call<{ draftId: string; state: DraftState; note: string }>(BASE, {
    method: "POST",
    body: JSON.stringify({ ...rest, ...(harness === "claude" ? {} : { harness }) }),
    ...(input.source === undefined ? {} : { signal: AbortSignal.timeout(SOURCE_CREATE_TIMEOUT_MS) }),
  });
}

/**
 * `GET /api/drafts`: the drafts list, phase 3's section above the grid.
 * Several states go as one comma list (`state=open,briefed`); `nonEmpty`
 * leaves out drafts nobody has said anything in, and `q` keeps the ones that
 * match it, both before the limit applies.
 */
export function listDrafts(
  query: {
    state?: DraftState | readonly DraftState[];
    nonEmpty?: boolean;
    limit?: number;
    /**
     * Words to find in a draft's name, title, first message or concept title, in
     * any case. The runner applies them before the limit, so a page is a page
     * of matches. Blank is no search and is not sent.
     */
    q?: string;
    /** The last row of the page before: the next page starts after it. */
    before?: { updated: string; draftId: string };
  } = {},
) {
  const params = new URLSearchParams();
  if (query.state !== undefined) params.set("state", typeof query.state === "string" ? query.state : query.state.join(","));
  if (query.nonEmpty === true) params.set("nonEmpty", "1");
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const q = query.q?.trim() ?? "";
  if (q !== "") params.set("q", q);
  if (query.before !== undefined) {
    params.set("before", query.before.updated);
    params.set("beforeId", query.before.draftId);
  }
  const search = params.toString();
  return call<{ drafts: DraftSummary[]; note: string }>(search === "" ? BASE : `${BASE}?${search}`);
}

/**
 * `PUT /api/drafts/{id}/name`: the owner's name for the conversation, or
 * `null` (or a blank name) to take it off, after which the planner's title
 * shows again. The runner keeps it on the draft, which every page reads.
 */
export function renameDraft(draftId: string, name: string | null) {
  return call<{ draftId: string; name: string | null; title: string | null; changed: boolean; note: string }>(draftPath(draftId, "/name"), {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

/**
 * `PUT /api/drafts/{id}/model`: the model the conversation's composer picker
 * holds (D90 of docs/STUDIO-CHAT-FIRST.md), which every turn and every job
 * this conversation makes then runs on. `null` (sent as `"default"`) hands it
 * back to the runner's own default.
 */
export function setDraftModel(draftId: string, model: string | null) {
  return call<{ draftId: string; model: string | null; changed: boolean; note: string }>(draftPath(draftId, "/model"), {
    method: "PUT",
    body: JSON.stringify({ model: model ?? "default" }),
  });
}

/**
 * `PUT /api/drafts/{id}/harness`: the pane picker's write. The runner refuses
 * a conversation that has already spoken (`harness-locked`): a harness's
 * session store is its own, so the pick moves only before the first turn.
 */
export function setDraftHarness(draftId: string, harness: string) {
  return call<{ draftId: string; harness: string; changed: boolean; note: string }>(draftPath(draftId, "/harness"), {
    method: "PUT",
    body: JSON.stringify({ harness }),
  });
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
 *
 * `key` is the message's idempotency key: a resend with it is answered 200
 * `replayed` with the first message's seq, and starts no second paid turn.
 */
export function sendMessage(
  draftId: string,
  body: string | { text: string; mentions?: readonly DraftMention[]; make?: boolean },
  key?: string,
) {
  const message = typeof body === "string" ? { text: body } : body;
  const payload =
    message.mentions !== undefined && message.mentions.length > 0 ? message : { text: message.text, ...(message.make === true ? { make: true } : {}) };
  return call<{ draftId: string; seq: number; note: string; replayed?: true }>(draftPath(draftId, "/messages"), {
    method: "POST",
    body: JSON.stringify(key === undefined ? payload : { ...payload, idempotencyKey: key }),
  });
}

/**
 * `PUT /api/drafts/{id}/trust` (D108): Always allow on a consent card, and the
 * draft menu's revoke. `trusted: true` lets the planner brief — and launch —
 * the kind unprompted on this conversation.
 */
export function setDraftTrust(draftId: string, kind: DraftKind, trusted: boolean) {
  return call<{ draftId: string; trust: DraftKind[]; note: string }>(draftPath(draftId, "/trust"), {
    method: "PUT",
    body: JSON.stringify({ kind, trusted }),
  });
}

/**
 * `POST /api/drafts/{id}/declined` (D109): the consent card's Deny. The reply
 * is marked so its card reads declined, and the planner is told not to make
 * the same offer again.
 */
export function declineSuggestion(draftId: string, replySeq: number, kinds: readonly TagKind[]) {
  return call<{ draftId: string; declined: TagKind[]; note: string }>(draftPath(draftId, "/declined"), {
    method: "POST",
    body: JSON.stringify({ replySeq, kinds }),
  });
}

/**
 * `POST /api/drafts/{id}/draw`: the press. With a pending topic the runner runs
 * `catalog topic add` first and then enqueues, in the one call. Refusals carry
 * `POST /api/jobs`'s statuses and bodies, and each also lands in the
 * transcript as a studio note (E7).
 */
export function drawDraft(draftId: string, key: string, kind: DraftKind = "diagram") {
  return call<{
    draftId: string;
    jobId: string;
    state: DraftState;
    kind?: DraftKind;
    /** False when the key had already started this job (#207). */
    created?: boolean;
    /** The video in review this press discarded, or null (#207). */
    replaces?: string | null;
    note: string;
  }>(draftPath(draftId, "/draw"), {
    method: "POST",
    // `kind` goes only when it is not the default, so a Draw is the body a
    // runner from before STUDIO-MENTIONS.md already takes.
    body: JSON.stringify(kind === "diagram" ? { idempotencyKey: key } : { idempotencyKey: key, kind }),
  });
}

/** One item of Make both's answer: the job it started, or the refusal its own press would have had. */
export type DrawItemResult =
  | { kind: DraftKind; jobId: string; created?: boolean; replaces?: string | null }
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
      out.push({
        kind: item.kind,
        jobId: item.jobId,
        ...(typeof item.created === "boolean" ? { created: item.created } : {}),
        ...(typeof item.replaces === "string" || item.replaces === null ? { replaces: item.replaces as string | null } : {}),
      });
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
    { method: "PUT", body: JSON.stringify(withoutModel(brief)) },
  );
}

/**
 * A brief as a save sends it: without `model`. Since D53 the model is the
 * settings panel's, and the runner keeps the model of the brief an edit
 * replaces (#207), so the card has nothing to say about it.
 */
function withoutModel(brief: Brief | VideoBrief): Brief | VideoBrief {
  if (!("model" in brief)) return brief;
  const { model: _model, ...rest } = brief as Brief;
  void _model;
  return rest;
}

/** `POST /api/drafts/{id}/abandon`: close it for good. Stops a turn in flight first. */
export function abandonDraft(draftId: string) {
  return call<{ draftId: string; state: DraftState; note: string }>(draftPath(draftId, "/abandon"), {
    method: "POST",
    body: "{}",
  });
}

