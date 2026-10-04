import type { ConceptSummary } from "@self-learn/catalog/state";

import type { ConceptCheck } from "@/lib/concept-note-core";
import type { ConceptWorkspace } from "@/lib/concept-workspace-core";
import { buildChoices, formatDue } from "@/lib/review-core";

/**
 * The session's pure half: the step plan, the questions a note's check blocks
 * become, the teaching prose cut from the note, and the arithmetic the
 * feedback bar and the close screen print.
 *
 * React-free and server-free, so the page's loader, the client session, the
 * route handlers and the tests share one reading of each rule.
 */

/** The two sources a session's answer is recorded under. A review grade is never one. */
export const OBSERVE_SOURCES = ["probe", "teach"] as const;
export type ObserveSource = (typeof OBSERVE_SOURCES)[number];

/**
 * A question as two readings of it are compared: lowercase, runs of space
 * collapsed, trimmed. How the workspace finds which check an observation
 * asked, and how the week check finds when a check was last asked.
 */
export function normaliseQuestion(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** The longest question or answer text an observation stores. */
export const SESSION_TEXT_LIMIT = 2_000;

/** A request or session id as the page makes them: letters, digits, `-`, `_`, at most 128. */
export function isSessionToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/**
 * `web-2026-09-26-dot-product-k3f9x2`. The date and the concept make the log
 * readable; the random tail makes two sessions on one concept in one day two
 * sessions. The CLI's ids are `<date>-<topic>`, so the prefix also says which
 * surface opened it.
 */
export function newSessionId(slug: string, now: Date, random: string): string {
  const day = now.toISOString().slice(0, 10);
  const tail = random.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "0";
  return `web-${day}-${slug}-${tail}`.slice(0, 128);
}

/* -------------------------------------------------------------------------- */
/* Questions                                                                  */
/* -------------------------------------------------------------------------- */

/** One multiple-choice question as the session renders it. */
export interface SessionQuestion {
  /** `c1` for a note's check block, `model` for one the tutor wrote. */
  id: string;
  prompt: string;
  choices: string[];
  /** Index into `choices`. */
  correct: number;
  /** One line for the feedback bar. */
  reason: string | null;
  /** What "Why?" opens. */
  explanation: string | null;
  /** The check's `source:` line, shown as a citation. */
  source: string | null;
  origin: "note" | "model";
}

/**
 * A check block as a multiple-choice question: its answer and wrong options
 * from `pool`, in an order fixed by `variant` so the same check asked twice
 * (once as the probe, once after teaching) does not put the answer in the same
 * slot both times. Null when the check has no answer or the pool cannot supply
 * two wrong options.
 *
 * The notes hold no authored wrong options, so the wrong ones are real
 * statements about neighbouring ideas, never invented ones: the note's other
 * checks' answers first, then other concepts' summaries (`buildChoices`, the
 * review page's rule).
 */
export function noteQuestion(
  slug: string,
  check: ConceptCheck,
  pool: readonly string[],
  variant: string,
  /** The note's summary, which is what "Why?" opens: the idea the answer rests on. */
  summary = "",
): SessionQuestion | null {
  const answer = check.answer.trim();
  if (check.question.trim() === "" || answer === "") return null;
  const mc = buildChoices(`${slug}#${check.id}#${variant}`, answer, pool);
  if (mc === null) return null;
  const why = check.why.trim();
  const source = check.source.trim();
  return {
    id: check.id,
    prompt: check.question.trim(),
    choices: mc.choices,
    correct: mc.correct,
    reason: why === "" ? null : why,
    explanation: summary.trim() === "" ? null : `From your note: ${summary.trim()}`,
    source: source === "" ? null : source,
    origin: "note",
  };
}

/** Wrong options for a note's checks, split by how near they sit to this concept. */
export interface DistractorPool {
  /** Summaries of the concept's neighbours (needs, assumes, leads to, named by), then of its folder. */
  near: string[];
  /** Every other concept's summary. Only used to make up the numbers. */
  far: string[];
}

/**
 * Other concepts' summaries as wrong options, nearest first. A wrong option
 * about a neighbouring idea is a real test; one about an unrelated course is a
 * giveaway, so `far` only fills in when `near` and the note's other checks
 * cannot supply three.
 */
export function distractorPool(
  workspace: Pick<ConceptWorkspace, "slug" | "domain"> & {
    [edge in "requires" | "assumes" | "dependants" | "backlinks"]: readonly { slug: string }[];
  },
  summaries: readonly ConceptSummary[],
): DistractorPool {
  const others = summaries.filter((s) => s.conceptId !== workspace.slug && s.summary.trim() !== "");
  const neighbours = new Set(
    [...workspace.requires, ...workspace.assumes, ...workspace.dependants, ...workspace.backlinks].map((r) => r.slug),
  );
  const tier = (s: ConceptSummary) =>
    neighbours.has(s.conceptId) ? 0 : s.domain !== null && s.domain === workspace.domain ? 1 : 2;
  const ordered = [...others].sort((a, b) => tier(a) - tier(b));
  return {
    near: ordered.filter((s) => tier(s) < 2).map((s) => s.summary),
    far: ordered.filter((s) => tier(s) === 2).map((s) => s.summary),
  };
}

/** The wrong options a multiple-choice question wants. */
const WRONG_OPTIONS = 3;

/**
 * The wrong options for one check: the note's other checks' answers and the
 * near summaries, all of them; then, only if those come to fewer than three,
 * the far summaries closest in length to this answer, so a filler does not
 * stand out by its shape.
 */
export function wrongOptionsFor(check: ConceptCheck, otherAnswers: readonly string[], pool: DistractorPool): string[] {
  const strong = [...otherAnswers, ...pool.near];
  if (strong.length >= WRONG_OPTIONS) return strong;
  const length = check.answer.trim().length;
  // A filler with raw TeX in it (`$T(n)$`) stands out as much as one from
  // another course would; plain prose first.
  const tex = (text: string) => (text.includes("$") ? 1 : 0);
  const fill = [...pool.far]
    .sort((a, b) => tex(a) - tex(b) || Math.abs(a.length - length) - Math.abs(b.length - length))
    .slice(0, WRONG_OPTIONS - strong.length);
  return [...strong, ...fill];
}

/* -------------------------------------------------------------------------- */
/* The plan                                                                   */
/* -------------------------------------------------------------------------- */

export type StepKind = "probe" | "teach" | "check" | "close";

export interface SessionStep {
  kind: StepKind;
  /** The question for a probe or check step, when the note supplies one. */
  question: SessionQuestion | null;
  /**
   * For a question step with no note question: asked of the tutor model first,
   * and this is what the step falls back to when the model is unavailable or
   * answers in prose. Null means there is nothing to fall back to, and the step
   * says so and lets the learner continue.
   */
  fallback: SessionQuestion | null;
  /**
   * A week check's step only: the concept it asks about and where it sits in
   * the check. A concept session's steps are all about the page's concept.
   */
  place?: StepPlace;
}

/** Where a week check's question sits: which concept, the how-manyth of it, and which question of that concept. */
export interface StepPlace {
  slug: string;
  title: string;
  /** 1-based, in the order the check asks the concepts. */
  position: number;
  /** How many concepts the check holds. */
  of: number;
  /** 1-based: the how-manyth question about this concept. */
  question: number;
}

/**
 * `?mode=check` is the Studio card's Quiz me: straight to the checks.
 * `module` is a module's week check (`/courses/<slug>/<module>/check`), which
 * no `?mode=` names: its page is the mode.
 */
export type SessionMode = ConceptSessionMode | "module";

/** The two modes a concept's own session page takes. */
export type ConceptSessionMode = "learn" | "check";

export function parseMode(value: unknown): ConceptSessionMode {
  return value === "check" ? "check" : "learn";
}

/** The most checks Quiz me asks in one session. */
export const MAX_QUIZ_CHECKS = 5;

/**
 * The steps a session walks through.
 *
 * Learn (Teach me): probe, teach, check, close. The probe is the note's first
 * check; the check after teaching is its next one, or one the tutor writes,
 * falling back to the first check asked again (reshuffled) when the tutor is
 * unavailable. A note with no usable checks leaves both questions to the tutor.
 *
 * Check (Quiz me): each of the note's checks in turn (up to five), then close;
 * with none, one question from the tutor.
 */
export function buildSessionPlan(input: {
  slug: string;
  mode: ConceptSessionMode;
  checks: readonly ConceptCheck[];
  /** Other concepts' summaries, as wrong options. */
  pool: DistractorPool;
  /** This concept's summary, behind each note question's "Why?". */
  summary?: string;
}): SessionStep[] {
  const { slug, mode, checks, pool, summary = "" } = input;
  const answers = checks.map((c) => c.answer.trim()).filter((a) => a !== "");
  const poolFor = (check: ConceptCheck) =>
    wrongOptionsFor(
      check,
      answers.filter((a) => a !== check.answer.trim()),
      pool,
    );
  const ask = (variant: string) =>
    checks
      .map((c) => noteQuestion(slug, c, poolFor(c), variant, summary))
      .filter((q): q is SessionQuestion => q !== null);

  const close: SessionStep = { kind: "close", question: null, fallback: null };

  if (mode === "check") {
    const questions = ask("check").slice(0, MAX_QUIZ_CHECKS);
    if (questions.length === 0) return [{ kind: "check", question: null, fallback: null }, close];
    return [...questions.map((question) => ({ kind: "check" as const, question, fallback: null })), close];
  }

  const probes = ask("probe");
  const checksAfter = ask("check");
  const probe = probes[0] ?? null;
  const next = checksAfter[1] ?? null;
  return [
    { kind: "probe", question: probe, fallback: null },
    { kind: "teach", question: null, fallback: null },
    { kind: "check", question: next, fallback: next === null ? (checksAfter[0] ?? null) : null },
    close,
  ];
}

/**
 * Why a session asks nothing: the one sentence the session, its close screen
 * and the workspace all print, so the three cannot drift apart.
 */
export const NOTHING_TO_ASK =
  "This note has no check the session can ask, and the tutor has no model provider key to write one. Add one in Settings, under Provider keys.";

/** The week check's two reasons for asking nothing. */
export const NOTHING_TO_ASK_MODULE =
  "No note in this module has a check the session can ask, and the tutor has no model provider key to write one. Add one in Settings, under Provider keys.";
export const NO_CONCEPTS_TO_CHECK = "This module names no concept in your knowledge base, so there is nothing to check.";

/**
 * A reason and what follows from it, as one paragraph: "The tutor could not
 * be reached. Nothing is recorded; carry on." The reason is often an error
 * string from a route or a provider ("All free providers failed"), which has
 * no full stop, so one is added when the reason does not already end a
 * sentence; a doubled one ("failed..") collapses to one, and an ellipsis is
 * left alone. An empty reason leaves the consequence standing on its own.
 */
export function withConsequence(reason: string, consequence: string): string {
  const tail = consequence.trim();
  const trimmed = reason.trim().replace(/(?<!\.)\.\.$/, ".");
  if (trimmed === "") return tail;
  // Terminal punctuation, allowing a closing quote or bracket after it: `(HTTP 502).`, `"Done."`
  const head = /[.?!…]["'”’)\]]*$/.test(trimmed) ? trimmed : `${trimmed}.`;
  return tail === "" ? head : `${head} ${tail}`;
}

/**
 * A probe or check step that nothing can fill: no question from the note, no
 * fallback, and no tutor model to ask. With a model configured the step still
 * asks it, since only a request finds out whether the model answers.
 */
export function isEmptyStep(step: SessionStep, modelAvailable: boolean): boolean {
  return (
    (step.kind === "probe" || step.kind === "check") &&
    step.question === null &&
    step.fallback === null &&
    !modelAvailable
  );
}

/**
 * The plan the page walks: `plan` without the steps `isEmptyStep` finds, so
 * the learner is never walked through a card saying there is no question.
 * Teach me becomes Teach, then Close; Quiz me becomes Close alone. Nothing is
 * recorded either way, since only a graded answer writes. A plan with a model
 * or a note question comes back unchanged.
 */
export function withoutEmptySteps(plan: readonly SessionStep[], modelAvailable: boolean): SessionStep[] {
  return plan.filter((step) => !isEmptyStep(step, modelAvailable));
}

/** True when the plan has no probe or check left, so the session asks nothing. */
export function asksNothing(plan: readonly SessionStep[]): boolean {
  return !plan.some((step) => step.kind === "probe" || step.kind === "check");
}

/**
 * Whether a session on this concept can ask anything, for the workspace
 * before one starts. Decided from the same plan the session page walks, so
 * the two cannot disagree: a model can always be asked, and without one the
 * question is whether any check survives as a question, which also needs two
 * wrong options from `pool`. Teach me and Quiz me agree here, since the
 * variant a check is asked under changes only the order of its options.
 */
export function sessionCanAsk(
  input: { slug: string; checks: readonly ConceptCheck[]; pool: DistractorPool; summary?: string },
  modelAvailable: boolean,
): boolean {
  if (modelAvailable) return true;
  return !asksNothing(withoutEmptySteps(buildSessionPlan({ ...input, mode: "learn" }), false));
}

export const STEP_NAME: Record<StepKind, string> = {
  probe: "Probe",
  teach: "Teach",
  check: "Check",
  close: "Close",
};

/** "Step 2 of 4 · Teach · Dot product", or on a phone "Step 2 of 4 · Teach". */
export function stepLabel(plan: readonly SessionStep[], index: number, title: string, short = false): string {
  const step = plan[index];
  if (step === undefined) return title;
  const head = `Step ${index + 1} of ${plan.length} · ${STEP_NAME[step.kind]}`;
  return short || step.kind === "close" ? head : `${head} · ${title}`;
}

/** The close screen's subtitle list: "Probe, Teach, Check". */
export function stepsWalked(plan: readonly SessionStep[]): string {
  const names = plan.filter((s) => s.kind !== "close").map((s) => STEP_NAME[s.kind]);
  return [...new Set(names)].join(", ");
}

/**
 * Where Keep going leads: a frontier concept (every prerequisite held, itself
 * not yet), preferring one this concept leads to, then one in its folder, then
 * the frontier's own order. Never this concept. Null when the frontier holds
 * nothing else.
 */
export function nextConcept(
  frontier: readonly { id: string; title: string; domain: string | null }[],
  current: { slug: string; domain: string | null; dependants: readonly { slug: string }[] },
): { slug: string; title: string } | null {
  const others = frontier.filter((c) => c.id !== current.slug);
  const leadsTo = new Set(current.dependants.map((d) => d.slug));
  const pick =
    others.find((c) => leadsTo.has(c.id)) ??
    others.find((c) => c.domain !== null && c.domain === current.domain) ??
    others[0];
  return pick === undefined ? null : { slug: pick.id, title: pick.title };
}

/* -------------------------------------------------------------------------- */
/* Teaching prose                                                             */
/* -------------------------------------------------------------------------- */

/** Sections a teaching step leaves out: the quiz, the backlinks, the link list. */
const HIDDEN_SECTIONS = new Set(["checks", "sessions", "prerequisites"]);

/**
 * The part of a note a teach step shows: the body without its frontmatter,
 * its `# Title` (the page prints the title), its ```` ```check ```` blocks
 * (they hold the answers to the question about to be asked), the Checks,
 * Sessions and Prerequisites sections, and any heading with nothing under it
 * (the template's empty "## Why it matters").
 *
 * Line-based, and fence-aware so a `#` inside a code block is code.
 */
export function teachProse(source: string): string {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    start = end === -1 ? 0 : end + 1;
  }

  interface Section {
    heading: string | null;
    level: number;
    body: string[];
  }
  const sections: Section[] = [{ heading: null, level: 0, body: [] }];
  let fence: string | null = null;
  let inCheck = false;

  for (const line of lines.slice(start)) {
    const current = sections[sections.length - 1] as Section;
    const marker = /^\s*(```+|~~~+)\s*([\w-]*)/.exec(line);
    if (fence !== null) {
      const closes = new RegExp(`^\\s*${fence[0] === "~" ? "~" : "`"}{${fence.length},}\\s*$`).test(line);
      if (closes) {
        fence = null;
        if (inCheck) {
          inCheck = false;
          continue;
        }
      }
      if (!inCheck) current.body.push(line);
      continue;
    }
    if (marker !== null) {
      fence = marker[1] as string;
      inCheck = (marker[2] ?? "").toLowerCase() === "check";
      if (!inCheck) current.body.push(line);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading !== null) {
      sections.push({ heading: line, level: heading[1]?.length ?? 1, body: [] });
      continue;
    }
    current.body.push(line);
  }

  const kept: string[] = [];
  let skipBelow: number | null = null;
  for (const section of sections) {
    if (section.heading !== null) {
      const text = section.heading.replace(/^#+\s*/, "").replace(/\s*#*\s*$/, "").trim().toLowerCase();
      if (skipBelow !== null && section.level > skipBelow) continue;
      skipBelow = null;
      if (section.level === 1) {
        // The title: the page prints it, so only what is under it stays.
        kept.push(...section.body);
        continue;
      }
      if (HIDDEN_SECTIONS.has(text)) {
        skipBelow = section.level;
        continue;
      }
      if (section.body.every((l) => l.trim() === "")) continue;
      kept.push(section.heading, ...section.body);
      continue;
    }
    kept.push(...section.body);
  }

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Feedback and close                                                         */
/* -------------------------------------------------------------------------- */

/** What `POST /api/learner/observe` answers with, as far as the page reads it. */
export interface RecordedAnswer {
  concept: string;
  correct: boolean;
  pLBefore: number;
  pLAfter: number;
  /** p(L) after the answer is at the mastery threshold. The route always says; a test's fixture may not. */
  mastered?: boolean;
  propagated: { concept: string; title: string; hops: number; pLBefore?: number; pLAfter?: number }[];
  card: { due: string; intervalDays: number; created: boolean } | null;
  replayed: boolean;
}

/** p(L) to two places, the way every page prints it. */
export function formatPL(pL: number): string {
  return pL.toFixed(2);
}

/**
 * "+0.13", "-0.06", "+0.00": a mastery movement, signed. Pass the two ends when
 * they are printed beside it, so 0.36 to 0.36 reads "+0.00" rather than the
 * "-0.01" the unrounded difference would round to.
 */
export function formatMove(before: number, after: number): string {
  return formatSigned(Number(formatPL(after)) - Number(formatPL(before)));
}

/**
 * A change, always with its sign, zero included: "+0.00" beside a p(L) of
 * 0.15 reads as no change, where a bare "0.00" reads as the mastery itself.
 */
export function formatSigned(delta: number): string {
  const rounded = Math.round(delta * 100) / 100;
  return `${rounded < 0 ? "-" : "+"}${Math.abs(rounded).toFixed(2)}`;
}

/** The feedback bar's note: "p(L) 0.55 to 0.49 · this becomes a review card". */
export function feedbackNote(answer: RecordedAnswer, now: Date): string {
  const move = `p(L) ${formatPL(answer.pLBefore)} to ${formatPL(answer.pLAfter)}`;
  if (answer.card === null) return move;
  if (answer.card.created) return `${move} · this becomes a review card`;
  const due = formatDue(answer.card.due, now);
  return due === null ? move : `${move} · next review ${due}`;
}

export interface MovedRow {
  slug: string;
  title: string;
  before: number;
  after: number;
  /** Moved by propagation from a correct answer, not asked about. */
  prerequisite: boolean;
}

/**
 * The close screen's What moved: each concept answered, from its first
 * answer's prior to its last answer's posterior, then every prerequisite a
 * correct answer spread to, the same way. A replayed answer carries no numbers
 * for its propagation, so a prerequisite seen only there is left out rather
 * than drawn as a guess. A concept first reached by propagation and then
 * asked about itself (a week check asks several) is a concept answered.
 *
 * `titles` names the concepts a week check asked; a concept session's own
 * concept is `slug`, titled `title`.
 */
export function whatMoved(
  slug: string,
  title: string,
  answers: readonly RecordedAnswer[],
  titles: Readonly<Record<string, string>> = {},
): MovedRow[] {
  const titleOf = (concept: string) => titles[concept] ?? (concept === slug ? title : concept);
  const rows = new Map<string, MovedRow>();
  for (const a of answers) {
    const own = rows.get(a.concept);
    if (own === undefined) {
      rows.set(a.concept, {
        slug: a.concept,
        title: titleOf(a.concept),
        before: a.pLBefore,
        after: a.pLAfter,
        prerequisite: false,
      });
    } else {
      own.after = a.pLAfter;
      own.prerequisite = false;
      own.title = titleOf(a.concept);
    }
    for (const p of a.propagated) {
      if (p.pLBefore === undefined || p.pLAfter === undefined) continue;
      const seen = rows.get(p.concept);
      if (seen === undefined) {
        rows.set(p.concept, { slug: p.concept, title: p.title, before: p.pLBefore, after: p.pLAfter, prerequisite: true });
      } else {
        seen.after = p.pLAfter;
      }
    }
  }
  return [...rows.values()].sort((a, b) => Number(a.prerequisite) - Number(b.prerequisite));
}

export interface SessionTotals {
  answered: number;
  right: number;
  /** The session concept's p(L) before its first answer and after its last; null with no answers. */
  before: number | null;
  after: number | null;
  /** Review cards this session created or rescheduled, one per concept. */
  cards: number;
}

/**
 * The close screen's "mastery moved" tile: the session concept's p(L) change,
 * signed, or "–" when nothing about it was answered. A session that recorded
 * nothing measured nothing, so it does not claim a change of zero.
 */
export function formatTotalsMove(totals: Pick<SessionTotals, "before" | "after">): string {
  return totals.before === null || totals.after === null ? "–" : formatMove(totals.before, totals.after);
}

/**
 * The close screen's numbers. `slug` is the session's concept, or a week
 * check's concepts: then before and after are the means, over the concepts
 * answered, of each one's first prior and last posterior, so the tile shows
 * the average move and a single concept reads exactly as it always did.
 */
export function sessionTotals(slug: string | readonly string[], answers: readonly RecordedAnswer[]): SessionTotals {
  const wanted = new Set(typeof slug === "string" ? [slug] : slug);
  const ends = new Map<string, { before: number; after: number }>();
  for (const a of answers) {
    if (!wanted.has(a.concept)) continue;
    const seen = ends.get(a.concept);
    if (seen === undefined) ends.set(a.concept, { before: a.pLBefore, after: a.pLAfter });
    else seen.after = a.pLAfter;
  }
  const mean = (pick: (e: { before: number; after: number }) => number) =>
    ends.size === 0 ? null : [...ends.values()].reduce((sum, e) => sum + pick(e), 0) / ends.size;
  return {
    answered: answers.length,
    right: answers.filter((a) => a.correct).length,
    before: mean((e) => e.before),
    after: mean((e) => e.after),
    cards: new Set(answers.filter((a) => a.card !== null).map((a) => a.concept)).size,
  };
}

export interface ScheduledRow {
  slug: string;
  title: string;
  due: string;
  created: boolean;
}

/** The close screen's Scheduled card: each concept's card as the last answer left it. */
export function scheduledCards(
  slug: string,
  title: string,
  answers: readonly RecordedAnswer[],
  titles: Readonly<Record<string, string>> = {},
): ScheduledRow[] {
  const rows = new Map<string, ScheduledRow>();
  for (const a of answers) {
    if (a.card === null) continue;
    const prior = rows.get(a.concept);
    rows.set(a.concept, {
      slug: a.concept,
      title: titles[a.concept] ?? (a.concept === slug ? title : a.concept),
      due: a.card.due,
      created: (prior?.created ?? false) || a.card.created,
    });
  }
  return [...rows.values()];
}

/** The longest prefill "Ask the tutor" puts in the workspace input. */
export const PREFILL_LIMIT = 1_200;

/**
 * What "Ask the tutor" prefills in the workspace chat: the question, what the
 * learner picked, and the right answer, so the tutor starts where the session
 * left off instead of from nothing.
 */
export function tutorPrefill(question: SessionQuestion, picked: number | null): string {
  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
  // An option usually ends in a full stop already; the sentence adds its own.
  const bare = (text: string) => clip(text.trim().replace(/[.!?]+$/, ""), 300);
  const right = question.choices[question.correct] ?? "";
  const mine = picked === null ? "I didn't know." : `I answered: ${bare(question.choices[picked] ?? "")}.`;
  const tail =
    picked === question.correct ? "Why is that right, and what would make it wrong?" : `The answer was: ${bare(right)}. Why?`;
  return clip(`I was asked: ${clip(question.prompt, 400)} ${mine} ${tail}`, PREFILL_LIMIT);
}
