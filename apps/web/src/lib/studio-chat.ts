import type { Brief, Job } from "@/lib/studio-jobs";
import { isActive } from "@/lib/studio-jobs";
import type { DraftState, DraftView, PendingTopic, Refusal, TranscriptEntry } from "@/lib/studio-drafts";
import { refusalNumber, refusalReason, refusalString } from "@/lib/studio-drafts";

/**
 * What the studio's conversation shows, decided here and nowhere else.
 *
 * Pure, like `studio-jobs.ts` and `studio-view.ts`: no React, no fetch. The
 * panel is view code and untested by design, so every judgement it makes
 * (what part of a reply a person sees, which brief card carries the one live
 * Draw, why Draw or Send is disabled, which of E1 to E9 applies) lives on this
 * side of the line where it can be a test. The shapes it reads are in
 * `studio-drafts.ts`.
 */

/* -------------------------------------------------------------------------- */
/* The words                                                                  */
/* -------------------------------------------------------------------------- */

/** The unpaid opening turn the studio writes into an empty conversation. */
/**
 * The composer after a refused turn. A turn typed in the composer comes back
 * unless something new was typed meanwhile (the person's newer words win, as
 * before). A turn that was never in the composer (the Extend opener) goes back
 * in front of whatever it holds, so neither is lost.
 */
export function wordsBack(held: string, body: string, keptComposer: boolean): string {
  if (held === "") return body;
  return keptComposer ? `${body}\n${held}` : held;
}

export const OPENING_TURN =
  "Tell me what the diagram should make clear. A sentence is enough; I'll ask if I need more.";

export const THINKING = "The planner is thinking";
export const CHECKING_BRIEF = "Checking the brief";
export const STILL_ANSWERING = "The planner is still answering.";
export const EDITING_BRIEF = "Save or cancel your edits to the brief first.";
export const CUT_OFF = "The reply was cut off.";
export const GONE = "This conversation is gone. Drafts are kept seven days.";

/* -------------------------------------------------------------------------- */
/* A reply, without its machine blocks                                        */
/* -------------------------------------------------------------------------- */

/** The fenced blocks a planner reply carries for the runner, never for a person. */
const MACHINE_TAGS = ["brief", "topic", "suggest", "hold"] as const;
/** The blocks whose arrival is a brief being checked; `suggest` and `hold` are only cut. */
const CHECKED_TAGS = ["brief", "topic"] as const;

export interface ReplyView {
  /** The prose a person reads. */
  prose: string;
  /** Whether a `brief` block was in the reply (complete or not). */
  hadBrief: boolean;
  /** A `brief` or `topic` block is still arriving: show "Checking the brief" in its place. */
  checking: boolean;
}

/**
 * Take a planner reply apart for the person reading it.
 *
 * Every fenced block tagged `brief` or `topic` is removed: the brief becomes
 * the confirm card and the topic its "New topic" rows, and neither is ever
 * shown as raw JSON. While a reply is streaming, an opening fence with no
 * close yet, or the first backticks of one at the very end, is cut too and
 * reported as `checking`, so the JSON never flickers onto the screen a
 * character at a time. A finished reply with an unclosed block (the planner
 * was cut off mid-brief) loses the block the same way.
 */
export function splitReply(text: string, streaming = false): ReplyView {
  let rest = text.replace(/\r\n/g, "\n");
  let hadBrief = false;
  let checking = false;

  // Complete blocks: an opening fence line tagged brief or topic, up to the
  // next fence line.
  const complete = /(^|\n)[ \t]*(`{3,})[ \t]*(brief|topic|suggest|hold)\b[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g;
  rest = rest.replace(complete, (_match, lead: string, _fence: string, tag: string) => {
    if (tag === "brief") hadBrief = true;
    return lead;
  });

  // An opening fence with no close: everything from it on is machine text.
  const open = /(^|\n)[ \t]*`{3,}[ \t]*(brief|topic|suggest|hold)\b/.exec(rest);
  if (open !== null) {
    if (open[2] === "brief") hadBrief = true;
    rest = rest.slice(0, open.index + open[1].length);
    checking = streaming && (CHECKED_TAGS as readonly string[]).includes(open[2]!);
  } else if (streaming) {
    // The first characters of a fence at the very end: "```", "```br".
    // Held back until the next delta says what they open; a tag that is
    // plainly something else ("```mermaid") is left alone.
    const tail = /(^|\n)[ \t]*(`{1,3})([a-z]*)$/.exec(rest);
    const tag = tail?.[3] ?? "";
    const fenceDone = tail?.[2].length === 3;
    if (tail !== null && (tag === "" || (fenceDone && MACHINE_TAGS.some((name) => name.startsWith(tag))))) {
      rest = rest.slice(0, tail.index + tail[1].length);
      checking = tag !== "" && CHECKED_TAGS.some((name) => name.startsWith(tag));
    }
  }

  return { prose: rest.replace(/\n{3,}/g, "\n\n").trim(), hadBrief, checking };
}

/* -------------------------------------------------------------------------- */
/* The thread                                                                 */
/* -------------------------------------------------------------------------- */

/** What the person sees of the transcript: superseded replies and retry notes are hidden. */
export function visibleEntries(transcript: readonly TranscriptEntry[]): TranscriptEntry[] {
  return transcript
    .filter((entry) => entry.superseded !== true && entry.internal !== true)
    .sort((a, b) => a.seq - b.seq);
}

/** The seq of the newest entry carrying a valid brief, or null. */
export function latestBriefSeq(transcript: readonly TranscriptEntry[]): number | null {
  let latest: number | null = null;
  for (const entry of visibleEntries(transcript)) {
    if (entry.brief !== undefined && (latest === null || entry.seq > latest)) latest = entry.seq;
  }
  return latest;
}

/**
 * Where a brief card stands.
 *
 * - `live`: the newest brief of a `briefed` draft, with the one Draw.
 * - `held`: the newest brief of an `open` draft. The conversation moved on
 *   after it (a reply with no brief), so Draw would not use it, but it can be
 *   put back in force as it is, or edited first.
 * - `drawn`: the newest brief of a draft that went on to draw; it links to its job.
 * - `stale`: an older brief, with a newer one below it.
 * - `closed`: the newest brief of a closed draft. Nothing is below it.
 */
export type CardStatus = "live" | "held" | "drawn" | "stale" | "closed";

/** One Draw on screen, ever: only the newest brief, and only while the draft is `briefed`. */
export function cardStatus(view: Pick<DraftView, "state" | "transcript">, seq: number): CardStatus {
  if (seq !== latestBriefSeq(view.transcript)) return "stale";
  if (view.state === "briefed") return "live";
  if (view.state === "open") return "held";
  if (view.state === "drawing" || view.state === "done") return "drawn";
  return "closed";
}

/** Whether a card in this state may be edited: the brief in force, or the newest one to put back. */
export function cardEditable(status: CardStatus): boolean {
  return status === "live" || status === "held";
}

/** Whether the conversation has anything in it yet, which decides the opening turn. */
export function isEmptyConversation(transcript: readonly TranscriptEntry[]): boolean {
  return visibleEntries(transcript).every((entry) => entry.role === "studio");
}

/** The last thing the person said, for Try again (E1, E2). */
export function lastPersonText(transcript: readonly TranscriptEntry[]): string | null {
  const people = visibleEntries(transcript).filter((entry) => entry.role === "person");
  return people.at(-1)?.text ?? null;
}

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

/** `$0.070`, or `~$0.070` when some of it was rebuilt from the stream and runs low. */
export function costLabel(costUsd: number | null, source: "result" | "stream" | null): string | null {
  if (costUsd === null || !Number.isFinite(costUsd)) return null;
  return `${source === "stream" ? "~" : ""}$${costUsd.toFixed(3)}`;
}

/** The runner's cap status, as `/api/health` reports it in `dailyCap`. */
export interface CapStatus {
  capUsd: number | null;
  totalUsd: number;
  exceeded: boolean;
  oldestAgesOutAt?: string | null;
}

/** Read `dailyCap` from `/api/health`, or from a 429's detail, or nothing. */
export function capFrom(value: unknown): CapStatus | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.totalUsd !== "number") return null;
  const capUsd = typeof raw.capUsd === "number" ? raw.capUsd : null;
  return {
    capUsd,
    totalUsd: raw.totalUsd,
    exceeded: typeof raw.exceeded === "boolean" ? raw.exceeded : capUsd !== null && raw.totalUsd >= capUsd,
    oldestAgesOutAt: typeof raw.oldestAgesOutAt === "string" ? raw.oldestAgesOutAt : null,
  };
}

export type FormatTime = (iso: string) => string;

const localTime: FormatTime = (iso) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString(undefined, { hour: "numeric", minute: "2-digit", weekday: "short" });
};

/** E3's sentence: what is spent against what, and when it can first fall. */
export function capSentence(cap: CapStatus, format: FormatTime = localTime): string {
  const spent =
    cap.capUsd === null
      ? "The daily spend cap is reached"
      : `$${cap.totalUsd.toFixed(2)} of the $${cap.capUsd.toFixed(2)} daily cap is spent`;
  const when =
    cap.oldestAgesOutAt === null || cap.oldestAgesOutAt === undefined
      ? "Wait for the 24-hour window to move, or raise STUDIO_DAILY_USD."
      : `It frees from ${format(cap.oldestAgesOutAt)}, or raise STUDIO_DAILY_USD.`;
  return `${spent}. ${when}`;
}

/* -------------------------------------------------------------------------- */
/* The composer                                                               */
/* -------------------------------------------------------------------------- */

export interface ComposerState {
  /** The whole composer is off: nothing typed now could be sent. */
  disabled: boolean;
  /** Send only: the person may keep typing while a reply arrives. */
  sendDisabled: boolean;
  reason: string | null;
  placeholder: string;
}

/**
 * What the composer allows, and why not when it does not.
 *
 * In the order a person would want to hear them: a closed conversation, a
 * drawing in progress (C14), the turn cap (E4), the daily cap (E3), then a
 * reply still arriving, and then the brief being edited on its card; the last
 * two disable Send and nothing else.
 */
export function composerState(
  view: Pick<DraftView, "state" | "inFlight" | "turns" | "turnCap" | "jobId"> & Partial<Pick<DraftView, "slots">>,
  cap: CapStatus | null,
  pending = false,
  empty = false,
  editing = false,
): ComposerState {
  // A runner with per-kind slots (docs/STUDIO-MENTIONS.md) takes messages
  // while a job runs (C14 lifted), and its conversation starts as a chat.
  const kinds = view.slots !== undefined;
  const placeholder = kinds
    ? empty
      ? "Ask about an idea, or type @ to make something"
      : "Reply, or type @ to make something"
    : view.jobId !== null
      ? "Ask for another diagram, or a change to this one"
      : empty
        ? "Describe the diagram"
        : "Reply to the planner";
  if (view.state === "abandoned") {
    return { disabled: true, sendDisabled: true, reason: "This conversation was closed.", placeholder };
  }
  if (view.state === "drawing" && !kinds) {
    return {
      disabled: true,
      sendDisabled: true,
      // `drawing` covers a job still running and one waiting for review, so
      // the sentence names every way out, not only the running case's.
      reason: "A diagram from this conversation is still open. Talk again once it is accepted, discarded or cancelled.",
      placeholder,
    };
  }
  if (view.turnCap > 0 && view.turns >= view.turnCap) {
    return {
      disabled: true,
      sendDisabled: true,
      reason: `This conversation has reached its ${view.turnCap}-turn limit.`,
      placeholder,
    };
  }
  if (cap !== null && cap.exceeded) {
    return { disabled: true, sendDisabled: true, reason: capSentence(cap), placeholder };
  }
  if (view.inFlight || pending) {
    return { disabled: false, sendDisabled: true, reason: STILL_ANSWERING, placeholder };
  }
  if (editing) {
    // A reply may carry a new brief, which would retire the card being
    // edited and the edits with it. Typing is fine; sending waits.
    return { disabled: false, sendDisabled: true, reason: EDITING_BRIEF, placeholder };
  }
  return { disabled: false, sendDisabled: false, reason: null, placeholder };
}

/* -------------------------------------------------------------------------- */
/* Draw                                                                       */
/* -------------------------------------------------------------------------- */

/** `learn/assets/<slug>.tldr`, or any path, to the slug it names. */
export function targetSlug(target: string): string {
  const base = target.split("/").at(-1) ?? target;
  return base.replace(/\.tldr$/, "");
}

export interface DrawBlock {
  reason: string;
  /** The job holding the target, when that is the reason: the card links to it. */
  holder: string | null;
}

/**
 * Why Draw cannot be pressed right now, or null when it can.
 *
 * Re-derived from the jobs list and the cap whenever either changes, which the
 * panel refreshes when it regains focus. The runner checks all of it again on
 * the press, so this is the courtesy and the 409 or 429 is the rule.
 */
export function drawBlock(
  brief: Brief,
  view: Pick<DraftView, "inFlight">,
  jobs: readonly Job[],
  cap: CapStatus | null,
): DrawBlock | null {
  if (view.inFlight) return { reason: STILL_ANSWERING, holder: null };
  const holder = jobs.find((job) => isActive(job.state) && targetSlug(job.target) === brief.slug);
  if (holder !== undefined) {
    const name = holder.title ?? holder.jobId.slice(0, 8);
    const state = holder.state === "awaiting_review" ? "waiting for review" : holder.state;
    return {
      reason: `“${name}” already holds ${brief.slug} (${state}). Accept or discard it first.`,
      holder: holder.jobId,
    };
  }
  if (cap !== null && cap.exceeded) return { reason: capSentence(cap), holder: null };
  return null;
}

/** The button's words: a proposed topic is created by the same press. */
export function drawLabel(pending: PendingTopic | null | undefined): string {
  return pending ? "Create topic and draw" : "Draw";
}

/** "New diagram, saved as `x`" or "Extends `x`". */
export function modeLine(brief: Pick<Brief, "mode" | "slug">): { lead: string; slug: string } {
  return brief.mode === "extend" ? { lead: "Extends", slug: brief.slug } : { lead: "New diagram, saved as", slug: brief.slug };
}

/** The runner's refusal text as a sentence: a capital first, a full stop last. */
export function sentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") return trimmed;
  const capital = trimmed[0]!.toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

export interface DrawRefusal {
  text: string;
  /** The job holding the target, when that is the reason: the card links to it. */
  holder: string | null;
  /**
   * The runner's own words, which its studio note repeats (`Draw was refused:
   * <error>`) for the refusals it writes one for. The card hides its line once
   * that note is in the thread, and only then.
   */
  error: string;
}

/**
 * A refused Draw (E7), in words, with the one action it offers.
 *
 * Keyed on the runner's `detail.reason` (phase 1a's `drafts.ts`), and on the
 * status for the refusals `POST /api/jobs` shares. What the runner says is
 * kept wherever it names something this side cannot (a slug, a job, a path).
 */
export function drawRefusal(status: number, refusal: Refusal): DrawRefusal {
  const reason = refusalReason(refusal);
  const own = (text: string, holder: string | null = null): DrawRefusal => ({ text, holder, error: refusal.error });
  switch (reason) {
    case "topic-exists":
      return own(
        refusalDetailFlag(refusal, "pendingTopicCleared")
          ? "That topic was created elsewhere in the meantime. The brief now uses it, so Draw again."
          : sentence(refusal.error),
      );
    case "not-briefed":
      return own(
        refusalString(refusal, "state") === "drawing"
          ? "This conversation's drawing is already in progress."
          : "There is no brief to draw right now.",
      );
    case "in-flight":
      return own("The planner is still answering. Draw once its reply is in.");
    case "draw-in-progress":
      return own("Draw was just pressed. Wait a moment for the drawing to be queued.");
    case "topic-owner":
      return own(sentence(refusal.error));
    case "catalog-unreachable":
      return own(`${sentence(refusal.error)} Nothing was queued.`);
    case "topic-add":
      return own(`The new topic was refused: ${sentence(refusal.error)}`);
    default:
      break;
  }
  if (status === 409) return own(sentence(refusal.error), refusalString(refusal, "holder"));
  if (status === 429) {
    const totalUsd = refusalNumber(refusal, "totalUsd");
    const cap = capFrom({
      totalUsd: totalUsd ?? 0,
      capUsd: refusalNumber(refusal, "capUsd"),
      exceeded: true,
      oldestAgesOutAt: refusalString(refusal, "oldestAgesOutAt"),
    });
    return own(totalUsd === null || cap === null ? sentence(refusal.error) : capSentence(cap));
  }
  if (status === 0) return own("The studio runner is not answering, so nothing was queued.");
  return own(sentence(refusal.error));
}

function refusalDetailFlag(refusal: Refusal, field: string): boolean {
  const detail = refusal.detail;
  return typeof detail === "object" && detail !== null && (detail as Record<string, unknown>)[field] === true;
}

/**
 * A refused message, in words. `null` for the daily cap, which the composer
 * itself then says (E3), so it is not said twice.
 */
export function sendRefusal(status: number, refusal: Refusal): string | null {
  if (status === 429) return null;
  switch (refusalReason(refusal)) {
    case "in-flight":
      return "The planner is still answering the last message.";
    case "drawing":
      return "A diagram from this conversation is still open. Accept, discard or cancel it first.";
    case "abandoned":
      return "This conversation was closed. Start a new one.";
    case "turn-cap":
      return null;
    case "planner-busy":
      return "Every planner is busy right now. Try again in a few seconds.";
    case "shutdown":
      return "The studio is shutting down. Try again once it is back.";
    case "draw-in-progress":
      return "Draw was just pressed. Wait a moment for the drawing to be queued.";
    default:
      break;
  }
  if (status === 0) return "The studio runner is not answering. Your message is still in the box.";
  return sentence(refusal.error);
}

/**
 * Whether a refused Draw's line is already said by the runner's studio note:
 * a note after the refusal that repeats the runner's words. A refusal the
 * runner writes no note for (a reply in flight, a second press) keeps its line.
 */
export function refusalNoted(
  refused: { seq: number; error: string },
  entries: readonly Pick<TranscriptEntry, "seq" | "role" | "text">[],
): boolean {
  const words = refused.error.trim();
  if (words === "") return false;
  return entries.some((entry) => entry.role === "studio" && entry.seq > refused.seq && entry.text.includes(words));
}

/**
 * The idempotency key for one press of Draw: the brief it draws and the job
 * the draft had before it. A double press, or a press repeated after a reload,
 * is the same key and gets the first press's job back; Draw again after that
 * job failed is a new key, because the draft's newest job has changed.
 */
export function drawKey(draftId: string, briefSeq: number, previousJobId: string | null): string {
  return `draw:${draftId}:${briefSeq}:${previousJobId ?? "none"}`;
}

/** Cmd or Ctrl+Enter: Draw only from an empty composer; words there are sent. */
export function modEnterAction(text: string, drawLive: boolean): "draw" | "send" | "none" {
  if (text.trim() !== "") return "send";
  return drawLive ? "draw" : "none";
}

/**
 * The line under a planner turn in progress. "Thinking" until words arrive;
 * once the reply has landed and the turn is still open, the runner is
 * checking its brief (and may be asking the planner to fix it).
 */
export function turnIndicator(
  view: Pick<DraftView, "inFlight" | "transcript">,
  streaming: boolean,
): "thinking" | "checking" | null {
  if (!view.inFlight || streaming) return null;
  const visible = visibleEntries(view.transcript);
  const lastPerson = visible.filter((entry) => entry.role === "person").at(-1)?.seq ?? 0;
  const replied = visible.some((entry) => entry.role === "planner" && entry.seq > lastPerson);
  return replied ? "checking" : "thinking";
}

/**
 * The topic a brief card shows as "New topic". The live card (and a held
 * one, which a save puts back in force) reads the draft's own `pendingTopic`, which the runner clears once the topic exists,
 * so its button stops saying "Create topic and draw". An older card keeps
 * what its reply proposed, as the record of that reply.
 */
export function cardPendingTopic(
  status: CardStatus,
  entry: Pick<TranscriptEntry, "pendingTopic">,
  view: Pick<DraftView, "pendingTopic">,
): PendingTopic | null {
  return cardEditable(status) ? view.pendingTopic : (entry.pendingTopic ?? null);
}

/**
 * Where a job link from inside a conversation goes: the same panel when the
 * job is this draft's, otherwise out of the conversation, so another job is
 * not shown under this conversation's back bar.
 */
export function jobPatch(
  jobId: string,
  draft: { draftId: string; jobId: string | null },
  jobs: readonly Pick<Job, "jobId" | "draftId">[],
): { job: string; draft?: null } {
  const own = jobId === draft.jobId || jobs.some((job) => job.jobId === jobId && job.draftId === draft.draftId);
  return own ? { job: jobId } : { job: jobId, draft: null };
}

/** What Start over does first: close this draft, leave it, or refuse. */
export function startOverStep(state: DraftState): "abandon" | "skip" | "refuse" {
  if (state === "open" || state === "briefed") return "abandon";
  if (state === "drawing") return "refuse";
  return "skip";
}

/* -------------------------------------------------------------------------- */
/* Errors in the thread                                                       */
/* -------------------------------------------------------------------------- */

export type ThreadProblem =
  | { case: "E1"; text: string }
  | { case: "E2"; text: string }
  | { case: "E6"; text: string; field: string | null };

/**
 * The warn card at the foot of the thread, if any.
 *
 * E1 is the planner's request refused (a credential, a model), with the API's
 * own sentence. E2 is a turn that timed out or was cut off by a restart. E6 is
 * the brief refused twice. An error the person has since talked past is not
 * shown: a newer person turn than the error means it is history.
 */
export function threadProblem(view: Pick<DraftView, "error" | "transcript" | "inFlight">): ThreadProblem | null {
  if (view.inFlight) return null;
  const visible = visibleEntries(view.transcript);
  const last = visible.at(-1);
  if (last?.role === "planner" && last.interrupted === true) return { case: "E2", text: CUT_OFF };
  if (last?.role === "planner" && last.briefInvalid !== undefined && !last.briefInvalid.retried) {
    return {
      case: "E6",
      text: `${last.briefInvalid.field}: ${last.briefInvalid.message}`,
      field: last.briefInvalid.field,
    };
  }
  const error = view.error;
  if (error === null) return null;
  // Only an error nobody has answered: the last visible entry is the person's
  // turn it was about, or a studio note.
  if (last !== undefined && last.role === "planner") return null;
  if (error.kind === "agent") return { case: "E1", text: error.message };
  if (error.kind === "timeout" || error.kind === "interrupted") return { case: "E2", text: CUT_OFF };
  return { case: "E6", text: error.field ? `${error.field}: ${error.message}` : error.message, field: error.field ?? null };
}

/** E6's paid "Ask again": one turn, with the validator's sentence attached. */
export function askAgainText(problem: Extract<ThreadProblem, { case: "E6" }>): string {
  return `The studio refused that brief: ${problem.text}. Please fix that and send the whole brief again.`;
}

/* -------------------------------------------------------------------------- */
/* Suggestions                                                                */
/* -------------------------------------------------------------------------- */

export interface Suggestion {
  label: string;
  /** What the chip puts in the composer. It never sends. */
  text: string;
}

/**
 * Three chips under the opening turn, from the topics the corpus already uses
 * most. They prefill the composer and stop, so the person finishes the
 * sentence: a chip that sent would spend money on a guess.
 */
export function suggestions(
  topics: readonly (string | null)[],
  titles: ReadonlyMap<string, string>,
  count = 3,
): Suggestion[] {
  const tally = new Map<string, number>();
  for (const topic of topics) if (topic !== null) tally.set(topic, (tally.get(topic) ?? 0) + 1);
  const ranked = [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([slug]) => titles.get(slug) ?? slug);
  const fallback = ["How a request travels through a system", "The parts of a cell", "A comparison of two algorithms"];
  const labels = ranked.length > 0 ? ranked : fallback;
  return labels.map((label) =>
    ranked.length > 0
      ? { label, text: `A diagram for ${label} that shows ` }
      : { label, text: `${label}: ` },
  );
}
