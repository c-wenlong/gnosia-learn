/**
 * The concept tutor's thread as the browser keeps it, and the pure rules the
 * chat needs: which `[n]` markers in a reply are real citations, how much of
 * a long thread to send back, and which turns go to the studio with a tagged
 * message (docs/STUDIO-TUTOR-HANDOFF.md, D69 and D70).
 *
 * React-free so the rules are testable. `TutorChat.tsx` reads the thread;
 * the hand-off (`tutor-handoff.ts` and the studio's server action) takes its
 * turns through `handoffTurns`.
 *
 * Kept small on purpose: the concept page loads it whether or not a studio
 * exists, so nothing here imports the studio's code.
 */

export interface TutorTurn {
  role: "user" | "assistant";
  content: string;
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

/** The tutor's own turns, markers left out: the only thing the chat route or the planner is sent. */
export function chatTurns(items: readonly ThreadItem[]): TutorTurn[] {
  return items.filter((item): item is TutorTurn => item.role !== "studio");
}

/**
 * Where a concept's thread lives in `sessionStorage`. Per tab and gone when
 * the tab closes, on purpose for now: the thread is a scratchpad, and what
 * counts as evidence is written by the session and the CLI, not by chat.
 */
export function threadKey(slug: string): string {
  return `self-learn:tutor:${slug}`;
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
        : t,
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
  const kept: TutorTurn[] = [];
  let chars = 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (kept.length >= maxMessages) break;
    if (kept.length > 0 && chars + turn.content.length > maxChars) break;
    kept.unshift(turn);
    chars += turn.content.length;
  }
  while (kept.length > 1 && kept[0].role !== "user") kept.shift();
  return kept;
}

/** How many tutor turns a hand-off carries (D69): three exchanges. */
export const HANDOFF_TURNS = 6;
/** The most characters of them it carries, the newest kept first. */
export const HANDOFF_CHARS = 6_000;

/**
 * The tutor turns a tagged message takes to the studio (D69): the last six,
 * oldest dropped first to fit 6,000 characters, and the oldest one kept cut
 * at its start when it does not fit whole. The runner's TUTOR block applies
 * the same rule (`tutorBlock`), so what is sent is what the planner reads,
 * and the studio's "last N exchanges" line counts turns the person can see
 * were sent. Markers are left out: they are not the tutor's.
 */
export function handoffTurns(
  items: readonly ThreadItem[],
  { maxTurns = HANDOFF_TURNS, maxChars = HANDOFF_CHARS }: { maxTurns?: number; maxChars?: number } = {},
): TutorTurn[] {
  const recent = chatTurns(items)
    .slice(-maxTurns)
    .map((turn) => ({ role: turn.role, content: turn.content.trim() }))
    .filter((turn) => turn.content !== "");
  const kept: TutorTurn[] = [];
  let room = maxChars;
  for (let i = recent.length - 1; i >= 0 && room > 0; i -= 1) {
    const turn = recent[i];
    if (turn.content.length <= room) {
      kept.unshift(turn);
      room -= turn.content.length;
    } else {
      kept.unshift({ role: turn.role, content: turn.content.slice(turn.content.length - room) });
      room = 0;
    }
  }
  return kept;
}
