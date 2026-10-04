/**
 * Recall in the chat, phase 1 (docs/proposals/recall-in-chat.md): the pure
 * rules for a check the concept tutor asks inside its thread.
 *
 * - `splitCheck` takes the tutor's one-line `CHECK:` marker off a reply (R5).
 *   The chat route runs it, so the browser only ever sees the prose and a
 *   `check` beside it.
 * - `checkSource` says whether an answer is a `probe` or `teach`
 *   observation (R4).
 * - `Verdict` is the state of one answer's verdict row, kept on the
 *   learner's turn in the thread, and `recordedLine` its words once written.
 *
 * React-free, so the rules are testable and the route can import them.
 */

/** The longest check question kept, as long as a session question may be. */
export const CHECK_QUESTION_LIMIT = 400;

/**
 * The longest answer the chat takes, and so the longest the judge grades: the
 * composer's limit, so the verdict is on the whole reply the learner sent.
 * The observation stores at most `SESSION_TEXT_LIMIT` of it as `chosen`,
 * which is the log's record of the answer, not what was graded.
 */
export const CHAT_ANSWER_LIMIT = 4_000;

/** The longest judge feedback the row shows. */
export const VERDICT_FEEDBACK_LIMIT = 300;

/** The marker, on its own line: `CHECK: ...`, tolerating the bold or code a model adds around it. */
const MARKER = /^[\s>*_`]*CHECK[*_`]*\s*:[*_`]*\s*(.+?)[\s*_`]*$/i;

/** What the tutor asked, when a turn asked a check. */
export interface TurnCheck {
  question: string;
}

/**
 * A reply with its marker taken off. Only the last non-blank line counts, so
 * a turn that mentions "check:" mid-paragraph is prose, and a marker the
 * model left anywhere but the end is left as it wrote it. A reply that is
 * nothing but the marker keeps the question as its prose, so the learner
 * still sees what was asked.
 */
export function splitCheck(reply: string): { content: string; check: TurnCheck | null } {
  const lines = reply.replace(/\s+$/, "").split("\n");
  const last = lines.at(-1) ?? "";
  const match = MARKER.exec(last);
  if (match === null) return { content: reply.trim(), check: null };
  const question = match[1].trim().replace(/\s+/g, " ").slice(0, CHECK_QUESTION_LIMIT);
  if (question === "") return { content: reply.trim(), check: null };
  const content = lines.slice(0, -1).join("\n").trim();
  return { content: content === "" ? question : content, check: { question } };
}

/** The roles a thread item can have, as far as these rules need to know. */
interface ThreadLike {
  role: string;
  check?: TurnCheck | null;
}

/**
 * The index of the check the learner's next message would answer: the last
 * tutor turn, when it carried a marker and nothing but hand-off markers came
 * after it. Null when the thread is not waiting on a check.
 */
export function pendingCheck(items: readonly ThreadLike[]): number | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item.role === "studio") continue;
    return item.role === "assistant" && item.check ? i : null;
  }
  return null;
}

/**
 * R4: `teach` only when an earlier tutor turn in this thread, before the one
 * that asked, carried no marker: that turn explained rather than asked. An
 * opening recall question, its reflection included, is a marker turn, so a
 * thread that has only asked records a `probe`, which skips the learning
 * step and cannot credit teaching that did not happen.
 */
export function checkSource(items: readonly ThreadLike[], askedAt: number): "probe" | "teach" {
  for (let i = 0; i < askedAt && i < items.length; i += 1) {
    const item = items[i];
    if (item.role === "assistant" && !item.check) return "teach";
  }
  return "probe";
}

/** What the observe route answered, as much of it as the row says. */
export interface RecordedResult {
  correct: boolean;
  pLBefore: number;
  pLAfter: number;
  intervalDays: number | null;
}

/**
 * One answer's verdict row (R2). `judged` is the judge call's state:
 * `pending` while it runs, `ready` with a suggestion, `unavailable` when it
 * failed or answered with no verdict, in which case nothing is pre-selected.
 * `state` is the write's: nothing is written until the learner taps.
 */
export interface Verdict {
  question: string;
  /** Made once per answer and resent on a retry, so a lost response replays rather than records twice. */
  requestId: string;
  source: "probe" | "teach";
  judged: "pending" | "ready" | "unavailable";
  suggested: boolean | null;
  feedback: string | null;
  state: "open" | "saving" | "failed" | "recorded";
  /**
   * The verdict the learner tapped, once they have. A retry after a failed
   * write offers only this one: the request id is the same, so a write that
   * landed but whose answer was lost replays as this verdict, and offering
   * the other would ask for a choice the server would not record.
   */
  tapped: boolean | null;
  error: string | null;
  recorded: RecordedResult | null;
}

/** A fresh row for an answer to `question`. */
export function newVerdict(question: string, requestId: string, source: "probe" | "teach"): Verdict {
  return {
    question,
    requestId,
    source,
    judged: "pending",
    suggested: null,
    feedback: null,
    state: "open",
    tapped: null,
    error: null,
    recorded: null,
  };
}

const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;
const unit = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

/**
 * A stored verdict back, or null when it is not one. In-flight states are
 * kept as stored: the thread is re-read on every render, and a `saving` read
 * back as `open` would put the buttons back mid-save. What a reload cut off
 * is settled once, when the chat mounts, by `settleInterrupted`.
 */
export function restoreVerdict(value: unknown): Verdict | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.question !== "string" || v.question.trim() === "" || !TOKEN.test(String(v.requestId))) return null;
  if (v.source !== "probe" && v.source !== "teach") return null;
  const r = v.recorded as Record<string, unknown> | null | undefined;
  const recorded: RecordedResult | null =
    r && typeof r === "object" && typeof r.correct === "boolean" && unit(r.pLBefore) && unit(r.pLAfter)
      ? {
          correct: r.correct,
          pLBefore: r.pLBefore,
          pLAfter: r.pLAfter,
          intervalDays: typeof r.intervalDays === "number" && Number.isFinite(r.intervalDays) ? r.intervalDays : null,
        }
      : null;
  const state =
    v.state === "recorded" && recorded !== null
      ? "recorded"
      : v.state === "failed" || v.state === "saving"
        ? v.state
        : "open";
  const judged =
    v.judged === "ready" && typeof v.suggested === "boolean" ? "ready" : v.judged === "pending" ? "pending" : "unavailable";
  return {
    question: v.question.slice(0, CHECK_QUESTION_LIMIT),
    requestId: String(v.requestId),
    source: v.source,
    judged,
    suggested: judged === "ready" ? (v.suggested as boolean) : null,
    feedback: typeof v.feedback === "string" ? v.feedback.slice(0, VERDICT_FEEDBACK_LIMIT) : null,
    state,
    tapped: typeof v.tapped === "boolean" ? v.tapped : null,
    error: state === "failed" && typeof v.error === "string" ? v.error : null,
    recorded: state === "recorded" ? recorded : null,
  };
}

/**
 * A verdict with what a reload cut off settled: a judge still `pending`
 * becomes `unavailable` (the learner still chooses, with nothing
 * pre-selected), and a write still `saving` becomes `failed` with its tap
 * kept, so the one retry offered replays the same request id. Null when
 * nothing was in flight. The chat runs this once on mount, never per render.
 */
export function settleInterrupted(verdict: Verdict): Verdict | null {
  if (verdict.judged !== "pending" && verdict.state !== "saving") return null;
  return {
    ...verdict,
    ...(verdict.judged === "pending" ? { judged: "unavailable" as const, suggested: null } : {}),
    ...(verdict.state === "saving"
      ? { state: "failed" as const, error: "The page closed before the answer was confirmed." }
      : {}),
  };
}

/** A stored check back, or null. */
export function restoreCheck(value: unknown): TurnCheck | null {
  if (value === null || typeof value !== "object") return null;
  const q = (value as Record<string, unknown>).question;
  return typeof q === "string" && q.trim() !== "" ? { question: q.slice(0, CHECK_QUESTION_LIMIT) } : null;
}

/** `Recorded as correct · p(L) 0.25 → 0.41 · review in 1 day`, the session page's words after an answer. */
export function recordedLine(result: RecordedResult, interval: (days: number) => string): string {
  const parts = [
    `Recorded as ${result.correct ? "correct" : "incorrect"}`,
    `p(L) ${result.pLBefore.toFixed(2)} → ${result.pLAfter.toFixed(2)}`,
  ];
  if (result.intervalDays !== null) parts.push(`review in ${interval(result.intervalDays)}`);
  return parts.join(" · ");
}

/** Lowercase words of three letters or more, for matching a question to a note's check. */
function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}

/**
 * How alike, by Jaccard over words, a question and a check must be. High on
 * purpose: "What happens before the action?" and "...after the action?"
 * share two thirds of their words and ask opposite things, so a looser bar
 * hands the judge the wrong answer key. A missed match costs the judge its
 * reference, never the verdict, and the prompt tells it to check the
 * reference asks the same thing before using it.
 */
const MATCH_THRESHOLD = 0.75;

/**
 * The note's check the tutor's question is closest to, when it is close
 * enough to be the same question (`MATCH_THRESHOLD`), else null. The judge then reads that check's answer as its reference. A tutor
 * paraphrasing a check is the case this exists for; a question the note does
 * not ask leaves the judge with the note's body alone.
 */
export function matchCheck<C extends { question: string }>(question: string, checks: readonly C[]): C | null {
  const asked = words(question);
  if (asked.size === 0) return null;
  let best: C | null = null;
  let bestScore = 0;
  for (const check of checks) {
    const theirs = words(check.question);
    if (theirs.size === 0) continue;
    let shared = 0;
    for (const w of asked) if (theirs.has(w)) shared += 1;
    const score = shared / (asked.size + theirs.size - shared);
    if (score > bestScore) {
      best = check;
      bestScore = score;
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best : null;
}
