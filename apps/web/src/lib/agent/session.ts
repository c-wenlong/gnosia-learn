import { CONCEPT_BODY_LIMIT, type ConceptPromptInput } from "@/lib/agent/prompt";
import { seedOf } from "@/lib/review-core";
import type { SessionQuestion } from "@/lib/session-core";

/**
 * The session's question writer: a system prompt that asks the tutor model
 * for one multiple-choice question as JSON, and the parser that turns its
 * reply into a `SessionQuestion` or refuses it.
 *
 * Used only when the note has no check block to ask (`buildSessionPlan` in
 * `@/lib/session-core`). The note's own checks always come first: they are
 * what the learner wrote down as worth knowing, and they work with no model.
 */

export type QuestionStep = "probe" | "check";

/** The longest question, option and explanation the parser accepts. */
export const QUESTION_LIMITS = { prompt: 400, option: 240, explanation: 800 } as const;

/**
 * The system prompt. Grounded in the note (the same body the concept tutor
 * reads, clipped the same way), with the step's purpose spelled out: a probe
 * asks before any teaching and must be answerable by someone who already
 * holds the idea; a check asks after it. The reply is JSON and nothing else.
 */
export function buildSessionQuestionPrompt(
  input: ConceptPromptInput,
  step: QuestionStep,
  avoid: readonly string[] = [],
): string {
  const body = input.body?.trim() ?? "";
  const clipped = body.length > CONCEPT_BODY_LIMIT ? `${body.slice(0, CONCEPT_BODY_LIMIT)}\n\n[note truncated]` : body;
  const purpose =
    step === "probe"
      ? "This is a PROBE: it is asked before any teaching, to measure whether the learner already holds the idea. Ask about the core idea itself, answerable in a few seconds by someone who understands it, without needing the note's exact wording."
      : "This is a CHECK: it is asked straight after the learner has read the note. Test understanding of the idea (why, when, what follows), not recall of a phrase.";
  const avoidLines =
    avoid.length === 0 ? "" : `\nDo not repeat these questions, or ask them in other words:\n${avoid.map((q) => `- ${q}`).join("\n")}\n`;

  return `# Self-Learn session · question writer · ${input.title}

You write one multiple-choice question about one concept from the learner's notebook.

${purpose}

## The concept
- Title: ${input.title}
- Summary: ${input.summary || "(no summary written)"}

## The note
${clipped || "(the note's body could not be read; write from the summary)"}
${avoidLines}
## Rules
1. Exactly four options. One is correct. The three wrong ones are plausible mistakes a learner actually makes, not jokes, and not "all of the above".
2. Options are short: one line each, no numbering, no letters.
3. The question stands alone; do not refer to "the note" or "the text".
4. The explanation says in one or two sentences why the correct option is right and what the most tempting wrong one gets wrong.
5. Stay inside what the note says. If it cannot support a question, ask about the summary.

## Output
Reply with a single JSON object and nothing else: no prose before or after, no markdown fence.
{"question": "...", "options": ["...", "...", "...", "..."], "correct": 0, "explanation": "..."}
"correct" is the zero-based index of the right option in "options".
`;
}

/** The user turn that asks for it. */
export function sessionQuestionRequest(step: QuestionStep): string {
  return step === "probe" ? "Write the probe question now, as JSON." : "Write the check question now, as JSON.";
}

export type ParsedQuestion =
  | { ok: true; question: SessionQuestion }
  | { ok: false; reason: string };

/** The first `{` to its matching `}`, skipping braces inside strings. */
function firstObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed === "" || trimmed.length > max) return null;
  return trimmed;
}

/** The first sentence, for the feedback bar's one line of reason. */
export function firstSentence(value: string): string {
  const match = /^.+?[.!?](?=\s|$)/.exec(value.trim());
  return (match?.[0] ?? value).trim();
}

/** A seeded Fisher-Yates, so the same reply always lands in the same order. */
function shuffleWithSeed<T>(list: readonly T[], seed: number): T[] {
  const out = [...list];
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * The model's reply as a question, or the reason it is not one.
 *
 * Lenient about the wrapping (a ```json fence, a sentence before the object)
 * and strict about the content: a question, three or four distinct options,
 * an in-range integer `correct`. Anything else, prose included, is refused
 * rather than repaired, because a question graded against a guessed answer
 * key would write wrong evidence into a log nothing can take it back out of.
 *
 * The options are reshuffled here, seeded by the question text. Models put the
 * right answer first far more often than a quarter of the time, and an answer
 * that is always in slot 1 is how a real session once had to be voided.
 */
export function parseSessionQuestion(reply: string): ParsedQuestion {
  const raw = firstObject(reply.replace(/```(?:json)?/gi, ""));
  if (raw === null) return { ok: false, reason: "The reply held no JSON object." };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "The reply's JSON did not parse." };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "The reply was not a JSON object." };
  }
  const record = data as Record<string, unknown>;
  const prompt = text(record.question, QUESTION_LIMITS.prompt);
  if (prompt === null) return { ok: false, reason: "The question was missing or too long." };

  if (!Array.isArray(record.options)) return { ok: false, reason: "The options were not a list." };
  const options = record.options.map((o) => text(o, QUESTION_LIMITS.option));
  if (options.some((o) => o === null) || options.length < 3 || options.length > 4) {
    return { ok: false, reason: "There must be three or four short options." };
  }
  const choices = options as string[];
  if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) {
    return { ok: false, reason: "Two options were the same." };
  }

  const index = record.correct ?? record.correctIndex;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= choices.length) {
    return { ok: false, reason: "The correct index was missing or out of range." };
  }

  const explanation = text(record.explanation, QUESTION_LIMITS.explanation);
  const right = choices[index] as string;
  const shuffled = shuffleWithSeed(choices, seedOf(prompt));
  return {
    ok: true,
    question: {
      id: "model",
      prompt,
      choices: shuffled,
      correct: shuffled.indexOf(right),
      reason: explanation === null ? null : firstSentence(explanation),
      explanation,
      source: null,
      origin: "model",
    },
  };
}
