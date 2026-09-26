/**
 * The concept tutor's thread as the browser keeps it, and the two pure rules
 * the chat needs: which `[n]` markers in a reply are real citations, and how
 * much of a long thread to send back.
 *
 * React-free so the rules are testable; `TutorChat.tsx` is the only caller.
 */

export interface TutorTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Where a concept's thread lives in `sessionStorage`. Per tab and gone when
 * the tab closes, on purpose for now: the thread is a scratchpad, and what
 * counts as evidence is written by the session and the CLI, not by chat.
 */
export function threadKey(slug: string): string {
  return `self-learn:tutor:${slug}`;
}

/** A stored thread back into turns, dropping anything that is not one. */
export function parseThread(raw: string | null): TutorTurn[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (t): t is TutorTurn =>
        t !== null &&
        typeof t === "object" &&
        ((t as TutorTurn).role === "user" || (t as TutorTurn).role === "assistant") &&
        typeof (t as TutorTurn).content === "string",
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
