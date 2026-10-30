import {
  checkBlockText,
  isCardCheck,
  restoreCardCheck,
  restoreChoiceAnswer,
  restoreRecallPick,
  type ChoiceAnswer,
  type RecallPick,
} from "@/lib/check-block";
import { restoreCheck, restoreVerdict, type TurnCheck, type Verdict } from "@/lib/tutor-check";

/**
 * The concept tutor's thread as the browser keeps it, and the pure rules the
 * chat needs: which `[n]` markers in a reply are real citations, how much of
 * a long thread to send back, and which turns go to the studio with a tagged
 * message (docs/STUDIO-TUTOR-HANDOFF.md, D69 and D70).
 *
 * React-free so the rules are testable. `TutorChat.tsx` reads the thread;
 * the hand-off (`tutor-handoff.ts` and the studio's server action) takes its
 * turns from it through `chatTurns`.
 *
 * Kept small on purpose: the concept page loads it whether or not a studio
 * exists, so nothing here imports the studio's code.
 */

export interface TutorTurn {
  role: "user" | "assistant";
  content: string;
  /** A tutor turn that asked a check (its `CHECK:` marker, taken off by the route). */
  check?: TurnCheck | null;
  /** A learner turn that answered one: its verdict row (docs/proposals/recall-in-chat.md, R2). */
  verdict?: Verdict | null;
  /**
   * A learner turn that answered a choice card (docs/proposals/structured-checks.md):
   * the pick and the write. Its `content` is the `<check_answer>` block the
   * tutor reads; the card under the asking turn is what the learner sees.
   */
  choice?: ChoiceAnswer | null;
  /**
   * A learner turn that answered a recall card (phase 2): their words, the
   * confidence and the reasoning, beside the `verdict` the judge and the tap
   * fill in. Its `content` is the `<check_answer>` block the tutor reads; the
   * card under the asking turn is what the learner sees.
   */
  recall?: RecallPick | null;
}

/**
 * A tagged message the tutor handed to the studio (D70): drawn at the end of
 * the thread with its chips and a link to the conversation it opened. It is
 * the person's record of where the message went, never a turn of the
 * tutor's: `chatTurns` leaves it out of what `/api/agent/chat` is sent and of
 * what the next hand-off carries.
 */
export interface HandoffMarker {
  role: "studio";
  /** The message as sent, `@diagram` and `@video` where the chips were. */
  content: string;
  /** Where the chips sit in `content`, as a studio message's `mentions` do. */
  mentions: { kind: string; start: number; end: number }[];
  /** The conversation it opened. */
  draftId: string;
}

export type ThreadItem = TutorTurn | HandoffMarker;

/** A stored turn back, with its check and verdict kept only when they are well formed. */
function restoreTurn(t: TutorTurn): TutorTurn {
  const turn: TutorTurn = { role: t.role, content: t.content };
  const check = t.role === "assistant" ? (restoreCardCheck(t.check) ?? restoreCheck(t.check)) : null;
  if (check !== null) turn.check = check;
  const verdict = t.role === "user" ? restoreVerdict(t.verdict) : null;
  if (verdict !== null) turn.verdict = verdict;
  const choice = t.role === "user" ? restoreChoiceAnswer(t.choice) : null;
  if (choice !== null) turn.choice = choice;
  const recall = t.role === "user" ? restoreRecallPick(t.recall) : null;
  if (recall !== null) turn.recall = recall;
  return turn;
}

/** A runner's draft id: a UUID today; anything else stored is not linked to. */
const DRAFT_ID = /^[A-Za-z0-9-]{1,100}$/;

function isTurn(t: unknown): t is TutorTurn {
  return (
    t !== null &&
    typeof t === "object" &&
    ((t as TutorTurn).role === "user" || (t as TutorTurn).role === "assistant") &&
    typeof (t as TutorTurn).content === "string"
  );
}

function isMarker(t: unknown): t is HandoffMarker {
  if (t === null || typeof t !== "object") return false;
  const m = t as HandoffMarker;
  return (
    m.role === "studio" &&
    typeof m.content === "string" &&
    typeof m.draftId === "string" &&
    DRAFT_ID.test(m.draftId) &&
    Array.isArray(m.mentions)
  );
}

/**
 * A marker's words cut at its chips, for drawing: each chip a range inside
 * the words reading exactly `@<kind>`, taken in order, overlaps and repeats
 * left as words. The rule `inlinePieces` in `mentions.ts` applies, kept
 * here because that module (the studio composer's rules) would add every one
 * of its exports to each concept page's first load, and a marker only needs
 * this.
 */
export function markerPieces(marker: Pick<HandoffMarker, "content" | "mentions">): ({ text: string } | { kind: string })[] {
  const { content } = marker;
  const chips = marker.mentions
    .filter((m) => m.start >= 0 && m.end <= content.length && m.end > m.start && content.slice(m.start, m.end) === `@${m.kind}`)
    .sort((a, b) => a.start - b.start);
  const pieces: ({ text: string } | { kind: string })[] = [];
  const seen = new Set<string>();
  let at = 0;
  for (const chip of chips) {
    if (chip.start < at || seen.has(chip.kind)) continue;
    seen.add(chip.kind);
    if (chip.start > at) pieces.push({ text: content.slice(at, chip.start) });
    pieces.push({ kind: chip.kind });
    at = chip.end;
  }
  if (at < content.length) pieces.push({ text: content.slice(at) });
  return pieces;
}

/**
 * The tutor's own turns, markers left out and each cut to its role and
 * words: what the planner is sent, and what the chat route is sent once
 * `requestTurns` has put each card check's block back. A turn's verdict and
 * answer state are the page's, and never reach a model.
 */
export function chatTurns(items: readonly ThreadItem[]): TutorTurn[] {
  return items
    .filter((item): item is TutorTurn => item.role !== "studio")
    .map(({ role, content }) => ({ role, content }));
}

/**
 * What the model is told the learner said before a thread that opens on the
 * tutor's own turn (the recall opening, R3 of
 * docs/proposals/recall-in-chat.md). A conversation sent to a model starts on
 * a user turn, so this stands in for the visit that prompted the question,
 * and is never shown.
 */
export const RECALL_SEED =
  "I have come back to this concept and its review is due. Ask me one recall question before anything else.";

/**
 * The turns a chat request sends: the tutor's own turns, cut to role and
 * words, with `RECALL_SEED` before a thread that opens on the tutor, then
 * trimmed to the route's bounds. A turn that asked a card check goes back
 * with its `check` block rebuilt at the end (§5 of
 * docs/proposals/structured-checks.md): the tutor grades a recall answer
 * against the answer it committed to, which it can only do if it sees it.
 * The browser still draws that turn without the block.
 */
export function requestTurns(items: readonly ThreadItem[]): TutorTurn[] {
  const turns = withCheckBlocks(items.filter((item): item is TutorTurn => item.role !== "studio"));
  const seeded = turns[0]?.role === "assistant" ? [{ role: "user" as const, content: RECALL_SEED }, ...turns] : turns;
  return trimForRequest(seeded);
}

/** Each turn cut to role and words, a card check's block put back at the end of the turn that asked it. */
function withCheckBlocks(turns: readonly Pick<TutorTurn, "role" | "content" | "check">[]): TutorTurn[] {
  return turns.map(({ role, content, check }) => ({
    role,
    content: role === "assistant" && isCardCheck(check) ? `${content}\n\n${checkBlockText(check)}` : content,
  }));
}

/**
 * The route's payload bounds, `PAYLOAD_LIMITS` in `@gnosia/tutor/guards`
 * (kept as numbers here, so this browser module imports nothing from the
 * server's guards; `tutor-thread.test.ts` holds the two equal).
 */
export const ROUTE_LIMITS = { maxMessages: 40, maxTotalChars: 24_000 } as const;

/**
 * What the topic tutor is told stands before a trimmed thread that would
 * otherwise open on its own turn: a conversation sent to a model starts on a
 * user turn, and the turn that asked the latest check must not be dropped
 * just to start on one. Never shown.
 */
export const TRIMMED_SEED = "(Earlier turns of this session were left out to fit. Carry on from here.)";

/**
 * The turns the course topic tutor sends (`AgentSession`): as `requestTurns`
 * does, each card check's block put back, then the newest turns that fit the
 * route's bounds exactly. The topic route counts the learner's note against
 * the same character budget, so the note's length comes off the turns'
 * share. A tail that opens on the tutor's turn keeps it, behind
 * `TRIMMED_SEED`, so an answer is never sent without the question it
 * answers whenever the two fit. Without this a long session reached the
 * route's 40 messages or 24000 characters and every turn after it was
 * refused.
 */
export function topicRequestTurns(
  turns: readonly Pick<TutorTurn, "role" | "content" | "check">[],
  learnerNote = "",
): TutorTurn[] {
  const kept = tailOf(withCheckBlocks(turns), {
    maxMessages: ROUTE_LIMITS.maxMessages - 1,
    maxChars: Math.max(0, ROUTE_LIMITS.maxTotalChars - learnerNote.length - TRIMMED_SEED.length),
  });
  return kept[0]?.role === "assistant" ? [{ role: "user", content: TRIMMED_SEED }, ...kept] : kept;
}

/**
 * The transcript the topic tutor's recap is made from: the newest turns that
 * fit the summarize route's bounds exactly, each cut to role and words. A
 * transcript is one block of text to the model, so it may open on either
 * voice; what matters is keeping every exchange that fits, since the route
 * wants at least two turns. `partial` says older turns were left out.
 */
export function recapTurns(turns: readonly Pick<TutorTurn, "role" | "content">[]): { turns: TutorTurn[]; partial: boolean } {
  const kept = tailOf(
    turns.map(({ role, content }) => ({ role, content })),
    { maxMessages: ROUTE_LIMITS.maxMessages, maxChars: ROUTE_LIMITS.maxTotalChars },
  );
  return { turns: kept, partial: kept.length < turns.length };
}

/** Where a thread's session id lives in `sessionStorage` (R6): beside the thread, gone with the tab. */
export function sessionKey(slug: string): string {
  return `gnosia:tutor-session:${slug}`;
}

/**
 * Where a concept's thread lives in `sessionStorage`. Per tab and gone when
 * the tab closes, on purpose for now: the thread is a scratchpad. What counts
 * as evidence from it is an answer the learner chose to record, which the
 * observe route writes to the database (docs/proposals/recall-in-chat.md);
 * the words stay here.
 */
export function threadKey(slug: string): string {
  return `gnosia:tutor:${slug}`;
}

/**
 * A stored thread back into turns and markers, dropping anything that is
 * neither. A marker's chips are checked against its words where they are
 * drawn, not here.
 */
export function parseThread(raw: string | null): ThreadItem[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((t): t is ThreadItem => isTurn(t) || isMarker(t)).map((t) =>
      t.role === "studio"
        ? {
            role: "studio",
            content: t.content,
            draftId: t.draftId,
            mentions: t.mentions.filter(
              (m): m is HandoffMarker["mentions"][number] =>
                m !== null && typeof m === "object" && typeof m.kind === "string" && Number.isInteger(m.start) && Number.isInteger(m.end),
            ),
          }
        : restoreTurn(t),
    );
  } catch {
    return [];
  }
}

/**
 * The distinct source numbers a reply cites, in first-use order, keeping only
 * those in `known`. `[2]`, `[1, 3]` and `[1][2]` all count; a number the list
 * does not have is left as text, since the model citing a source that does not
 * exist is the model being wrong, not a chip to draw.
 */
export function citedNumbers(text: string, known: readonly number[]): number[] {
  const allowed = new Set(known);
  const out: number[] = [];
  for (const match of text.matchAll(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g)) {
    for (const part of match[1].split(",")) {
      const n = Number(part.trim());
      if (allowed.has(n) && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

/**
 * The tail of a thread that fits the chat route's payload bounds
 * (`PAYLOAD_LIMITS` in `@/lib/agent/guard`: 40 messages, 24000 characters),
 * with room to spare. The oldest turns go first; the newest always stays, and
 * the kept tail starts on a user turn so the model never sees a reply to
 * nothing.
 */
export function trimForRequest(
  turns: readonly TutorTurn[],
  { maxMessages = 30, maxChars = 20_000 }: { maxMessages?: number; maxChars?: number } = {},
): TutorTurn[] {
  const kept = tailOf(turns, { maxMessages, maxChars });
  while (kept.length > 1 && kept[0].role !== "user") kept.shift();
  return kept;
}

/** The newest turns within both bounds, oldest dropped first; the newest always stays. */
function tailOf(turns: readonly TutorTurn[], { maxMessages, maxChars }: { maxMessages: number; maxChars: number }): TutorTurn[] {
  const kept: TutorTurn[] = [];
  let chars = 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (kept.length >= maxMessages) break;
    if (kept.length > 0 && chars + turn.content.length > maxChars) break;
    kept.unshift(turn);
    chars += turn.content.length;
  }
  return kept;
}
