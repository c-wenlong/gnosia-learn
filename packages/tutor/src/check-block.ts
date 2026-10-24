import { seedOf } from "./review-core";
import { SESSION_TEXT_LIMIT } from "./session-core";
import { firstObject, QUESTION_LIMITS, shuffleWithSeed } from "./session-question";
import { CHAT_ANSWER_LIMIT, CHECK_QUESTION_LIMIT, splitCheck, type RecordedResult, type TurnCheck } from "./tutor-check";

/**
 * Structured checks, phase 1 (docs/proposals/structured-checks.md): the
 * `check` block a tutor turn ends with, read and refused here, and the rules
 * the choice card needs.
 *
 * A choice check is a question, its options and the key, written by the
 * tutor in the same turn it asks (K1), as a fenced block at the end of its
 * reply rather than a tool call (K2):
 *
 * ````
 * ```check
 * {"kind": "choice", "question": "...", "options": ["...", "..."], "why": "...", "answer": "<an option, copied exactly>"}
 * ```
 * ````
 *
 * A block that cannot be used falls back (K7): with a readable question it
 * becomes an open check, judged as a `CHECK:` line is, and otherwise the turn
 * asked nothing. A recall block is an open check until phase 2 reads its
 * committed answer.
 *
 * React-free, so the rules are testable and the route can import them.
 */

/** How many options a choice check may have. */
export const CHOICE_OPTIONS = { min: 3, max: 5 } as const;

/** The confidence stops the card offers, in percent. 50 is where it rests. */
export const CONFIDENCE_STOPS = [0, 30, 50, 70, 90, 100] as const;
export const DEFAULT_CONFIDENCE = 50;

/** A choice check as the route returns it and the thread keeps it. */
export interface ChoiceCheck extends TurnCheck {
  kind: "choice";
  /** As the tutor wrote them; the card shows them shuffled (`choiceOrder`). */
  options: string[];
  /** Why the key is right, shown once the learner has answered. */
  why: string;
  /** The key: one of `options`, exactly. */
  answer: string;
}

export function isChoiceCheck(check: TurnCheck | null | undefined): check is ChoiceCheck {
  return (
    check !== null &&
    check !== undefined &&
    (check as Partial<ChoiceCheck>).kind === "choice" &&
    Array.isArray((check as Partial<ChoiceCheck>).options)
  );
}

/** A block read off a reply: the check it holds, or why it cannot be used and what is left of it. */
export type BlockOutcome =
  | { ok: true; check: ChoiceCheck }
  | { ok: false; reason: string; fallback: TurnCheck | null };

/** One line of text: trimmed, inner whitespace collapsed. */
function line(value: unknown): string | null {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : null;
}

/**
 * The block's object as a check, or the reason it is not one. The rules are
 * the proposal's table: a question within `CHECK_QUESTION_LIMIT`, three to
 * five distinct options within `QUESTION_LIMITS.option`, a `why` within
 * `QUESTION_LIMITS.explanation`, and a key equal to exactly one option. The
 * key is matched by its text, never its index, so a miscounted position
 * cannot grade the wrong option. A refused block keeps its question, when it
 * has a readable one, as the open check it falls back to.
 */
export function readCheckBlock(data: unknown): BlockOutcome {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "The block was not a JSON object.", fallback: null };
  }
  const record = data as Record<string, unknown>;
  const question = line(record.question);
  const fallback =
    question !== null && question !== "" && question.length <= CHECK_QUESTION_LIMIT ? { question } : null;
  const refuse = (reason: string): BlockOutcome => ({ ok: false, reason, fallback });

  if (fallback === null) return refuse(`The question must be 1 to ${CHECK_QUESTION_LIMIT} characters.`);
  if (record.kind === "recall") return refuse("A recall block is read as an open check until phase 2.");
  if (record.kind !== "choice") return refuse('"kind" must be "choice" or "recall".');

  if (!Array.isArray(record.options)) return refuse('"options" must be a list.');
  const options = record.options.map(line);
  if (options.length < CHOICE_OPTIONS.min || options.length > CHOICE_OPTIONS.max) {
    return refuse(`A choice check needs ${CHOICE_OPTIONS.min} to ${CHOICE_OPTIONS.max} options.`);
  }
  if (options.some((o) => o === null || o === "" || o.length > QUESTION_LIMITS.option)) {
    return refuse(`Each option must be 1 to ${QUESTION_LIMITS.option} characters of text.`);
  }
  const texts = options as string[];
  if (new Set(texts).size !== texts.length) return refuse("Two options are the same.");

  const why = line(record.why);
  if (why === null || why === "" || why.length > QUESTION_LIMITS.explanation) {
    return refuse(`"why" must be 1 to ${QUESTION_LIMITS.explanation} characters.`);
  }
  const answer = line(record.answer);
  if (answer === null || !texts.includes(answer)) return refuse("The answer is not one of the options, copied exactly.");

  const check: ChoiceCheck = { question: fallback.question, kind: "choice", options: texts, why, answer };
  const concept = line(record.concept);
  if (concept) check.concept = concept.toLowerCase();
  return { ok: true, check };
}

/** The opening line of a fenced `check` block. */
const OPENING = /(?:^|\n)[ \t]*(`{3,}|~{3,})[ \t]*check[ \t]*\n/gi;

/**
 * The last fenced `check` block of a reply, when nothing but whitespace
 * follows its closing fence: where it starts and its body. Only that block
 * counts, as only the last line counts for `CHECK:`; an earlier one is prose.
 */
function lastBlock(text: string): { index: number; body: string } | null {
  const openings = [...text.matchAll(OPENING)];
  const last = openings.at(-1);
  if (last === undefined || last.index === undefined) return null;
  const rest = text.slice(last.index + last[0].length);
  const close = new RegExp(`^([\\s\\S]*?)\\n?[ \\t]*${last[1].replace(/[`~]/g, "\\$&")}[ \\t]*$`).exec(rest);
  return close === null ? null : { index: last.index, body: close[1] };
}

export interface SplitReply {
  content: string;
  check: TurnCheck | null;
  /** Why a `check` block the reply ended with was not used, when it was not. */
  refused: string | null;
}

/**
 * A reply with its check taken off: a `check` block first, then the `CHECK:`
 * line `splitCheck` reads. With `choice` false (a tutor whose page has no
 * choice card yet) a valid choice block is kept as the open check it falls
 * back to, so its question is still asked and judged.
 */
export function splitTurnCheck(reply: string, { choice = true }: { choice?: boolean } = {}): SplitReply {
  const trimmed = reply.replace(/\s+$/, "");
  const block = lastBlock(trimmed);
  if (block === null) return { ...splitCheck(reply), refused: null };

  const before = trimmed.slice(0, block.index).trim();
  const raw = firstObject(block.body);
  let outcome: BlockOutcome;
  if (raw === null) outcome = { ok: false, reason: "The block held no JSON object.", fallback: null };
  else {
    try {
      outcome = readCheckBlock(JSON.parse(raw));
    } catch {
      outcome = { ok: false, reason: "The block's JSON did not parse.", fallback: null };
    }
  }

  let check: TurnCheck | null;
  let refused: string | null = null;
  if (outcome.ok) {
    check = choice ? outcome.check : { question: outcome.check.question, ...(outcome.check.concept ? { concept: outcome.check.concept } : {}) };
  } else {
    check = outcome.fallback;
    refused = outcome.reason;
  }
  // A reply that is nothing but the block keeps the question as its prose, as `splitCheck` does.
  const content = before === "" ? (check?.question ?? "") : before;
  return { content, check, refused };
}

/** A stored check back: a choice check only when it still passes `readCheckBlock`, else the open check it reduces to. */
export function restoreChoiceCheck(value: unknown): ChoiceCheck | null {
  if (value === null || typeof value !== "object" || (value as { kind?: unknown }).kind !== "choice") return null;
  const outcome = readCheckBlock(value);
  return outcome.ok ? outcome.check : null;
}

/**
 * The order the card shows the options in, as indices into `options`. Seeded,
 * so a reload and the server render agree, and so the key is not always where
 * the tutor wrote it: models put the right answer first far more often than
 * chance, which is why `parseSessionQuestion` reshuffles too.
 */
export function choiceOrder(check: Pick<ChoiceCheck, "options">, seed: string): number[] {
  return shuffleWithSeed(
    check.options.map((_, i) => i),
    seedOf(seed),
  );
}

/** What the learner gave on a choice card. `picked` is an index into `options`, null for "I don't know". */
export interface ChoicePick {
  picked: number | null;
  /** Percent, one of `CONFIDENCE_STOPS`; null with "I don't know" (K6). */
  confidence: number | null;
  thinking: string | null;
}

/** Whether a pick is right: the option it names is the key. "I don't know" is never right. */
export function gradeChoice(check: ChoiceCheck, pick: Pick<ChoicePick, "picked">): boolean {
  return pick.picked !== null && check.options[pick.picked] === check.answer;
}

/** A reasoning box's text as stored: trimmed, clipped to `SESSION_TEXT_LIMIT`, null when empty. */
export function cleanThinking(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  return t === "" ? null : t.slice(0, SESSION_TEXT_LIMIT);
}

/** Strip the delimiters a learner could type to close the data block early. */
function fenced(text: string): string {
  return text.replace(/<\/?check_answer>/gi, "");
}

/**
 * The learner's answer as the tutor reads it on the next turn (§5 of the
 * proposal): a delimited data block, as the judge's `<learner_answer>` is,
 * naming the pick, whether it matched the key, the confidence and the
 * reasoning. The tutor's prompt says what the block is.
 */
export function choiceAnswerText(check: ChoiceCheck, pick: ChoicePick): string {
  const lines: string[] = [];
  if (pick.picked === null) lines.push(`I don't know (the key was "${check.answer}")`);
  else {
    const chosen = check.options[pick.picked] ?? "";
    lines.push(
      gradeChoice(check, pick)
        ? `Picked: "${chosen}" (correct)`
        : `Picked: "${chosen}" (incorrect; the key was "${check.answer}")`,
    );
    if (pick.confidence !== null) lines.push(`Confidence: ${pick.confidence}%`);
  }
  const thinking = cleanThinking(pick.thinking);
  if (thinking !== null) lines.push(`Reasoning: ${fenced(thinking)}`);
  return `<check_answer>\n${lines.join("\n")}\n</check_answer>`.slice(0, CHAT_ANSWER_LIMIT);
}

/** Whether a confidence is one the observe write takes: a whole percent from 0 to 100. */
export function isConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

/**
 * A learner turn that answered a choice card: what they gave, the grade, and
 * the write's state. Kept on the turn so a reload draws the card as it was.
 * A choice check records on submit (K4), so there is no `idle` state: the
 * turn exists because the learner pressed Submit.
 */
export interface ChoiceAnswer extends ChoicePick {
  /** Made once per answer and resent on a retry, so a lost response is never recorded twice. */
  requestId: string;
  correct: boolean;
  source: "probe" | "teach";
  state: "saving" | "recorded" | "failed";
  error: string | null;
  recorded: RecordedResult | null;
}

const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** A stored answer back, or null when it is not one. */
export function restoreChoiceAnswer(value: unknown): ChoiceAnswer | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.requestId !== "string" || !REQUEST_ID.test(v.requestId)) return null;
  if (typeof v.correct !== "boolean") return null;
  if (v.source !== "probe" && v.source !== "teach") return null;
  const picked = v.picked === null ? null : Number.isInteger(v.picked) && (v.picked as number) >= 0 ? (v.picked as number) : undefined;
  if (picked === undefined) return null;
  const state = v.state === "recorded" || v.state === "failed" || v.state === "saving" ? v.state : null;
  if (state === null) return null;
  const r = v.recorded as Record<string, unknown> | null | undefined;
  const recorded: RecordedResult | null =
    r &&
    typeof r === "object" &&
    typeof r.correct === "boolean" &&
    typeof r.pLBefore === "number" &&
    typeof r.pLAfter === "number" &&
    (r.intervalDays === null || typeof r.intervalDays === "number")
      ? { correct: r.correct, pLBefore: r.pLBefore, pLAfter: r.pLAfter, intervalDays: r.intervalDays as number | null }
      : null;
  // A recorded state with no result to show is not trusted, as `restoreVerdict` does.
  if (state === "recorded" && recorded === null) return null;
  return {
    requestId: v.requestId,
    correct: v.correct,
    source: v.source,
    picked,
    confidence: picked !== null && isConfidence(v.confidence) ? v.confidence : null,
    thinking: typeof v.thinking === "string" ? cleanThinking(v.thinking) : null,
    state,
    error: state === "failed" && typeof v.error === "string" ? v.error : null,
    recorded: state === "recorded" ? recorded : null,
  };
}

/**
 * An answer a reload cut off mid-write, settled: `saving` becomes `failed`,
 * so the one retry offered replays the same request id. Null when nothing was
 * in flight. Run once on mount, never per render.
 */
export function settleChoice(answer: ChoiceAnswer): ChoiceAnswer | null {
  if (answer.state !== "saving") return null;
  return { ...answer, state: "failed", error: "The page closed before the answer was confirmed." };
}
