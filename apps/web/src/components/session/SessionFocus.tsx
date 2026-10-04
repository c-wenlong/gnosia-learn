"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceRow, type ChoiceState } from "@/components/ui/ChoiceRow";
import { Collapse } from "@/components/ui/Collapse";
import { MathText } from "@/components/Math";
import { FeedbackBar } from "@/components/ui/FeedbackBar";
import { Placeholder } from "@/components/ui/Placeholder";
import { cx, TRACK } from "@/components/ui/classes";
import { TextLink } from "@/components/ui/TextLink";
import {
  feedbackNote,
  newSessionId,
  NOTHING_TO_ASK,
  STEP_NAME,
  stepLabel,
  tutorPrefill,
  type RecordedAnswer,
  type SessionMode,
  type SessionQuestion,
  type SessionStep,
  withConsequence,
  canAskAgain,
} from "@/lib/session-core";
import {
  outcomeOf,
  weekCheckLabel,
  weekCheckPercent,
  weekCheckSteps,
  type WeekCheckOutcome,
  type WeekCheckPlan,
} from "@/lib/week-check";
import { scrollBehavior } from "@/lib/motion";
import { quizKey } from "@/lib/quiz-keys";

import { SessionClose } from "./SessionClose";

/**
 * The session (hi-fi 05 to 07, and 15 on a phone): a short scripted loop over
 * one concept, one step on screen at a time.
 *
 * The plan arrives from the server. A question step uses the note's own check
 * when the plan has one; otherwise it asks the tutor model for a question
 * (`POST /api/agent/session`), and when the model is not configured or answers
 * in prose it falls back to the plan's fallback, or says there is no question
 * and lets the learner go on. A step the server already knows cannot be
 * filled (no check, no model) is not in the plan at all; `nothingToAsk` says
 * the plan asks nothing, and the teach step and the close screen say why.
 *
 * Picking is 1 to 4 or a click; Check (or Enter) grades. Every graded answer is
 * one `POST /api/learner/observe`, and the verdict shows only once it is
 * recorded, so what the page says and what the log holds cannot disagree. A
 * write that fails stays on screen with the error and the same request id, so
 * pressing Check again retries the same answer rather than recording a second.
 * After each write `router.refresh()` re-reads the layout, so the learner
 * snapshot the shell holds moves with the session.
 *
 * **Moving between steps.** Each step's column is keyed on its index, so a
 * new step rises in (`animate-enter`) rather than being swapped in place, and
 * the focus moves to its heading: the Continue that was pressed has gone with
 * the old column, and a focus left on nothing would start the next Tab from
 * the top of the page. The page glides back to the top, or jumps under
 * reduced motion.
 *
 * **A week check** (`weekCheck`, mode `module`) walks a module's concepts
 * rather than one: its steps are not fixed in advance but grow by one after
 * each answer, from `weekCheckSteps` over what was answered so far, since
 * whether a concept is asked again depends on the answer just given. The
 * plan is held from the first render, so the refresh after each answer (which
 * re-reads mastery on the server) cannot reorder the check under the learner.
 * Each step asks about its own concept: the answer is a probe recorded
 * against that concept with the module named, and a step the note cannot
 * fill asks the tutor about that concept.
 */

/** A week check as the page hands it over. */
export interface WeekCheckProps {
  moduleId: string;
  plan: WeekCheckPlan;
  /** The module page: where Exit and the close screen lead. */
  moduleHref: string;
  /** Why the check asks nothing, when the server knew before it began. */
  reason: string | null;
}

type Resolved = { question: SessionQuestion | null; note: string | null };

interface Graded {
  picked: number | null;
  correct: boolean;
  recorded: RecordedAnswer;
}

interface ObserveReply {
  ok?: boolean;
  error?: string;
  result?: RecordedAnswer;
}

function randomToken(): string {
  // `randomUUID` needs a secure context; a LAN address over http is not one.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function modelProblem(code: string | undefined, error: string | undefined, status: number): string {
  // The server's own words say which case it is (docs/TUTOR-MODELS.md, T4):
  // no key anywhere, or a model list whose providers have none.
  if (code === "MISSING_API_KEY") return error ?? "The tutor has no model provider key yet. Add one in Settings, under Provider keys.";
  if (code === "UNSTRUCTURED_REPLY") return "The tutor answered, but not with a question it could be graded on.";
  if (code === "RATE_LIMITED") return "Too many questions in a minute; the tutor is resting.";
  return error ?? `The tutor did not answer (HTTP ${status}).`;
}

export function SessionFocus({
  slug,
  title,
  mode,
  plan,
  modelAvailable,
  nothingToAsk,
  teach,
  asset,
  assetCompact,
  next,
  weekCheck = null,
}: {
  slug: string;
  title: string;
  mode: SessionMode;
  plan: SessionStep[];
  modelAvailable: boolean;
  /** The plan has no question step: nothing in the note to ask, and no model to write one. */
  nothingToAsk: boolean;
  /** The teaching prose, rendered on the server. */
  teach: ReactNode;
  /** The widget slot on the teach step; null draws the placeholder. */
  asset: ReactNode | null;
  /** The same asset, smaller, above a check; null draws nothing. */
  assetCompact: ReactNode | null;
  next: { slug: string; title: string } | null;
  /** A module's week check; `slug` and `title` are then the module's. */
  weekCheck?: WeekCheckProps | null;
}) {
  const router = useRouter();
  // Held from the first render: a refresh brings a new plan, which must not change this check.
  const [checkPlan] = useState(() => weekCheck?.plan ?? null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [graded, setGraded] = useState<Record<number, Graded>>({});
  const [resolved, setResolved] = useState<Record<number, Resolved>>({});
  const [whyOpen, setWhyOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [closedAt, setClosedAt] = useState<number | null>(null);
  /**
   * A pick that was sent but not confirmed, per step. Once Check is pressed
   * the choice is fixed until the server answers: a retry resends the same
   * request id, and a request id stands for one answer, so letting the
   * learner change the pick in between would pair the saved verdict with an
   * option they never sent.
   */
  const [sent, setSent] = useState<Record<number, number | null>>({});
  /** A week check's step left with no question: the concept it was about. */
  const [skipped, setSkipped] = useState<Record<number, string>>({});

  // Refs, not state, for what a handler must see before React re-renders.
  const inFlight = useRef(false);
  const requested = useRef(new Set<number>());
  const attempts = useRef<Record<number, { requestId: string; picked: number | null }>>({});
  const sessionId = useRef<string | null>(null);
  const closed = useRef(false);
  /** The body of the answer being saved, if any: leaving resends it with the close. */
  const saving = useRef<Record<string, unknown> | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  /** The step's column, keyed on the step, so its heading can take the focus. */
  const columnRef = useRef<HTMLDivElement>(null);
  /** The step whose heading last had the focus moved to it: the first is left alone. */
  const shownIndex = useRef(index);
  const whyId = useId();

  // What each step of a week check came to, in order, as far as they are decided.
  const outcomes = useMemo((): WeekCheckOutcome[] => {
    const out: WeekCheckOutcome[] = [];
    for (let i = 0; ; i += 1) {
      const g = graded[i];
      if (g !== undefined) out.push(outcomeOf(g.recorded));
      else if (skipped[i] !== undefined) out.push({ concept: skipped[i] as string, result: "none", mastered: false });
      else return out;
    }
  }, [graded, skipped]);
  const steps = useMemo(
    () => (checkPlan === null ? plan : weekCheckSteps(checkPlan, outcomes)),
    [checkPlan, plan, outcomes],
  );

  const step = steps[index];
  const exitHref = weekCheck?.moduleHref ?? `/learn/${slug}`;
  /** The concept a step asks about: its own in a week check, else the session's. */
  const conceptOf = useCallback((s: SessionStep | undefined) => s?.place?.slug ?? slug, [slug]);

  /** The question on screen for a step, or why there is none, or that it is coming. */
  const questionFor = useCallback(
    (i: number): { status: "ready"; question: SessionQuestion } | { status: "loading" } | { status: "none"; note: string } => {
      const s = steps[i];
      if (s === undefined || (s.kind !== "probe" && s.kind !== "check")) return { status: "none", note: "" };
      if (s.question !== null) return { status: "ready", question: s.question };
      if (!modelAvailable) {
        return s.fallback !== null ? { status: "ready", question: s.fallback } : { status: "none", note: NOTHING_TO_ASK };
      }
      const r = resolved[i];
      if (r === undefined) return { status: "loading" };
      if (r.question !== null) return { status: "ready", question: r.question };
      if (s.fallback !== null) return { status: "ready", question: s.fallback };
      return { status: "none", note: r.note ?? NOTHING_TO_ASK };
    },
    [steps, modelAvailable, resolved],
  );

  // A question step with nothing from the note asks the tutor, once.
  useEffect(() => {
    const s = steps[index];
    if (s === undefined || s.question !== null || !modelAvailable) return;
    if (s.kind !== "probe" && s.kind !== "check") return;
    if (requested.current.has(index)) return;
    requested.current.add(index);
    const concept = conceptOf(s);
    // Only this concept's questions: a week check asks several concepts.
    const asked = Object.keys(graded)
      .filter((k) => conceptOf(steps[Number(k)]) === concept)
      .map((k) => questionFor(Number(k)))
      .flatMap((q) => (q.status === "ready" ? [q.question.prompt] : []))
      .slice(-4);
    const at = index;
    fetch("/api/agent/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conceptSlug: concept, step: s.kind, avoid: asked }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { question?: SessionQuestion; code?: string; error?: string };
        const question = res.ok && body.question !== undefined ? body.question : null;
        const note = question === null ? modelProblem(body.code, body.error, res.status) : null;
        setResolved((prev) => ({ ...prev, [at]: { question, note } }));
      })
      .catch(() => {
        setResolved((prev) => ({ ...prev, [at]: { question: null, note: "The tutor could not be reached." } }));
      });
  }, [index, steps, modelAvailable, graded, questionFor, conceptOf]);

  // A failed request is forgotten, and the effect above asks again.
  const askAgain = useCallback(() => {
    requested.current.delete(index);
    setResolved((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, [index]);

  const current = questionFor(index);
  // Joined here rather than in the JSX: a call on `current.note` down there made the React Compiler
  // treat `current` as mutable past `grade`, and it gave up memoizing `grade`.
  const noQuestion =
    current.status === "none"
      ? withConsequence(current.note, `Nothing is recorded; carry on${step?.kind === "probe" ? " to the teaching" : ""}.`)
      : null;
  const question = current.status === "ready" ? current.question : null;
  const answered = graded[index];

  const grade = useCallback(
    async (choice: number | null) => {
      if (question === null || step === undefined || inFlight.current || graded[index] !== undefined) return;
      inFlight.current = true;
      setPending(true);
      setError(null);
      // The first attempt fixes the pick; a retry sends that pick again.
      const attempt = (attempts.current[index] ??= { requestId: randomToken(), picked: choice });
      const picked = attempt.picked;
      setSent((prev) => (index in prev ? prev : { ...prev, [index]: picked }));
      const correct = picked !== null && picked === question.correct;
      sessionId.current ??= newSessionId(slug, new Date(), randomToken());
      const payload = {
        conceptSlug: conceptOf(step),
        correct,
        // Asked after this session taught it is a teaching check; a probe,
        // and a Quiz me or a week check with no teaching, only measure.
        source: step.kind === "check" && mode === "learn" ? "teach" : "probe",
        // A week check names its module, which the event carries.
        ...(weekCheck === null ? {} : { module: weekCheck.moduleId }),
        requestId: attempt.requestId,
        sessionId: sessionId.current,
        question: question.prompt,
        // `answer` is the right one, as `learn observe --answer` means it;
        // `chosen` is the pick, null for "I don't know".
        answer: question.choices[question.correct] ?? null,
        chosen: picked === null ? null : (question.choices[picked] ?? null),
      };
      saving.current = payload;
      try {
        const res = await fetch("/api/learner/observe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          // Survives the page going away, so an answer sent just before the
          // learner leaves still lands.
          keepalive: true,
        });
        const body = (await res.json().catch(() => null)) as ObserveReply | null;
        if (!res.ok || body?.ok !== true || body.result === undefined) {
          setError(body?.error ?? `Not saved (${res.status}). Press Try again; your pick is kept.`);
          return;
        }
        const recorded = body.result;
        // On a replayed retry the verdict is the one first recorded.
        setGraded((prev) => ({ ...prev, [index]: { picked, correct: recorded.correct, recorded } }));
        router.refresh();
      } catch {
        setError("Not saved: the server could not be reached. Press Try again; your pick is kept.");
      } finally {
        saving.current = null;
        inFlight.current = false;
        setPending(false);
      }
    },
    [question, step, graded, index, slug, mode, router, conceptOf, weekCheck],
  );

  /**
   * Close the session, once. Awaited with one retry when the learner reaches
   * the close screen; fired with `keepalive` when they leave mid-session
   * (Exit, Ask the tutor, a closed tab), so answered sessions do not stay
   * `running`. A session no answer opened has nothing to close.
   */
  const closeSession = useCallback(async (leaving: boolean): Promise<void> => {
    const id = sessionId.current;
    if (id === null || closed.current) return;
    const send = () =>
      fetch("/api/learner/session/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
        keepalive: leaving,
      });
    if (leaving) {
      closed.current = true;
      // An answer still saving must land before the close, or a first answer
      // would open a session nothing closes and a later one would be refused
      // by a closed session. Waiting for it is no good on a closing tab, where
      // nothing runs after `pagehide`; so the answer is sent again with
      // `closeSession`, which the server records (or replays, by its request
      // id) and then closes, in one request. Whichever copy lands first
      // records the answer; the other replays it.
      const pending = saving.current;
      const request =
        pending === null
          ? send()
          : fetch("/api/learner/observe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...pending, closeSession: true }),
              keepalive: true,
            });
      void request.catch(() => undefined);
      return;
    }
    for (let attempt = 0; attempt < 2 && !closed.current; attempt += 1) {
      try {
        const res = await send();
        if (res.ok) closed.current = true;
      } catch {
        // Retried once below; a close that never lands leaves a running row,
        // never lost evidence, since every answer is already recorded.
      }
      if (!closed.current && attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }, []);

  // Leaving before the close screen still closes what was answered.
  useEffect(() => {
    const onHide = () => void closeSession(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void closeSession(true);
    };
  }, [closeSession]);

  const advance = useCallback(() => {
    let walk = steps;
    // A week check's step left with nothing to ask ends its concept; the
    // step after it is decided by that, here, before moving on to it.
    const current = steps[index];
    if (checkPlan !== null && current?.kind === "check" && graded[index] === undefined && skipped[index] === undefined) {
      const concept = conceptOf(current);
      setSkipped((prev) => ({ ...prev, [index]: concept }));
      walk = weekCheckSteps(checkPlan, [...outcomes, { concept, result: "none", mastered: false }]);
    }
    const to = index + 1;
    if (to >= walk.length) return;
    setIndex(to);
    setSelected(null);
    setWhyOpen(false);
    setError(null);
    if (walk[to]?.kind === "close") {
      setClosedAt(Date.now());
      void closeSession(false).then(() => router.refresh());
    }
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }, [index, steps, router, closeSession, checkPlan, graded, skipped, outcomes, conceptOf]);

  // On a phone the verdict lands under the options; bring it up.
  useEffect(() => {
    if (answered !== undefined) feedbackRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }, [answered]);

  // A new step takes the focus to its heading; the page opening on the first does not.
  useEffect(() => {
    if (shownIndex.current === index) return;
    shownIndex.current = index;
    columnRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    if (step === undefined || step.kind === "close") return;
    const onKey = (event: KeyboardEvent) => {
      const pressed = quizKey(event, pending);
      if (pressed === null) return;
      // Enter on a focused link or button belongs to that control (`quizKey`).
      const { number, enter } = pressed;

      if (question !== null && answered === undefined) {
        if (number !== null && number < question.choices.length && !(index in sent)) {
          event.preventDefault();
          setSelected(number);
        } else if (enter && (selected !== null || index in sent)) {
          event.preventDefault();
          void grade(selected);
        }
        return;
      }
      if (enter && current.status !== "loading") {
        event.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, question, answered, selected, pending, current.status, grade, advance, index, sent]);

  if (step === undefined) return null;

  const percent = checkPlan === null ? ((index + 1) / steps.length) * 100 : weekCheckPercent(step);
  const label = checkPlan === null ? stepLabel(steps, index, title) : `Week check · ${weekCheckLabel(step)}`;
  const short = checkPlan === null ? stepLabel(steps, index, title, true) : weekCheckLabel(step);
  const exitLabel = weekCheck === null ? "Exit to workspace" : "Exit to module";
  const noQuestionReason = weekCheck?.reason ?? null;

  if (step.kind === "close") {
    const answers = Object.keys(graded)
      .map(Number)
      .sort((a, b) => a - b)
      .map((i) => (graded[i] as Graded).recorded);
    return (
      <Frame
        percent={100}
        label={checkPlan === null ? label : "Week check"}
        short={checkPlan === null ? short : "Week check"}
        exitHref={exitHref}
        exitLabel={exitLabel}
        stepKey={index}
        columnRef={columnRef}
      >
        <SessionClose
          slug={slug}
          title={title}
          plan={steps}
          answers={answers}
          minutes={Math.max(1, Math.round(((closedAt ?? startedAt) - startedAt) / 60_000))}
          next={next}
          reason={nothingToAsk ? (noQuestionReason ?? NOTHING_TO_ASK) : null}
          weekCheck={
            checkPlan === null || weekCheck === null
              ? null
              : {
                  titles: Object.fromEntries(checkPlan.concepts.map((c) => [c.slug, c.title])),
                  moduleHref: weekCheck.moduleHref,
                }
          }
        />
      </Frame>
    );
  }

  return (
    <Frame percent={percent} label={label} short={short} exitHref={exitHref} exitLabel={exitLabel} stepKey={index} columnRef={columnRef}>
      <h1 tabIndex={-1} className="font-display text-[20px] leading-tight font-bold text-text outline-none md:text-[28px]">
        {step.place?.title ?? title}
        {step.place === undefined && <span className="hidden md:inline"> · {STEP_NAME[step.kind]}</span>}
      </h1>

      {step.kind === "teach" ? (
        <>
          <div className="min-w-0">{teach}</div>
          {asset ?? <Placeholder label="No diagram or video explains this concept yet" height={170} className="md:h-[220px]!" />}
          {nothingToAsk && (
            <Callout tone="neutral" role="status" title="No question this session">
              {withConsequence(NOTHING_TO_ASK, "Nothing is recorded; Continue closes the session.")}
            </Callout>
          )}
          <div className="mt-auto flex items-center justify-end gap-3 md:mt-0">
            <Button onClick={advance} className="md:min-w-40">
              Continue
            </Button>
          </div>
        </>
      ) : (
        <>
          {step.kind === "probe" && (
            <p className="text-[15px] leading-[1.5] text-text2 md:text-[17px] md:leading-[27px]">
              One question before any teaching, to see where you start. It measures; it does not teach.
            </p>
          )}
          {step.kind === "check" && assetCompact !== null && mode === "learn" && assetCompact}

          {current.status === "loading" && (
            <Placeholder label="The tutor is writing a question…" height={180} className="motion-safe:animate-pulse" />
          )}

          {noQuestion !== null && (
            <Callout
              tone="neutral"
              role="status"
              title="No question for this step"
              className="animate-enter motion-reduce:animate-none"
              actions={
                canAskAgain({
                  modelAvailable,
                  hasOwnQuestion: step?.question != null,
                  hasFallback: step?.fallback != null,
                  resolved: resolved[index],
                }) ? (
                  <Button variant="secondary" size="sm" onClick={askAgain}>
                    Ask again
                  </Button>
                ) : undefined
              }
            >
              {noQuestion}
            </Callout>
          )}

          {question !== null && (
            <Question
              question={question}
              selected={index in sent ? (sent[index] ?? null) : selected}
              answered={answered}
              locked={pending || index in sent}
              onSelect={setSelected}
              // A question the tutor wrote replaces its placeholder: it rises in, at
              // least as tall as the placeholder was, so nothing under it jumps up.
              className={step.question === null && modelAvailable ? "min-h-[180px] animate-enter motion-reduce:animate-none" : undefined}
            />
          )}

          <div ref={feedbackRef} className="mt-auto flex scroll-mb-[calc(4.25rem+env(safe-area-inset-bottom))] flex-col gap-3 md:mt-0 md:scroll-mb-0">
            {question !== null && answered !== undefined ? (
              // One item in the column, so a shut Why? adds no gap under the bar.
              <div className="flex flex-col">
                <FeedbackBar
                  ok={answered.correct}
                  title={answered.correct ? "Correct" : answered.picked === null ? "Here is the answer" : "Not quite"}
                  detail={question.reason === null ? undefined : <MathText text={question.reason} />}
                  note={feedbackNote(answered.recorded, new Date())}
                  actions={
                    <>
                      {question.explanation !== null && (
                        <Button
                          variant="ghost"
                          onClick={() => setWhyOpen((open) => !open)}
                          aria-expanded={whyOpen}
                          aria-controls={whyId}
                        >
                          Why?
                        </Button>
                      )}
                      <Button variant="ghost" href={`/learn/${conceptOf(step)}?ask=${encodeURIComponent(tutorPrefill(question, answered.picked))}`}>
                        Ask the tutor
                      </Button>
                      <Button variant={answered.correct ? "ok" : "warn"} onClick={advance} aria-keyshortcuts="Enter">
                        Continue
                      </Button>
                    </>
                  }
                />
                {question.explanation !== null && (
                  <Collapse open={whyOpen} id={whyId}>
                    <div className="mt-3 rounded-2xl bg-surface2 p-4 text-[14px] leading-[1.55] text-text">
                      <p>
                        <MathText text={question.explanation} />
                      </p>
                      {question.source !== null && <p className="mt-1.5 text-[12px] text-text2">Source: {question.source}</p>}
                    </div>
                  </Collapse>
                )}
              </div>
            ) : question !== null ? (
              <div className="flex items-center gap-3">
                <span className="md:hidden">
                  <Button variant="secondary" size="sm" onClick={() => void grade(null)} disabled={pending || index in sent}>
                    Don&apos;t know
                  </Button>
                </span>
                <span className="hidden md:inline-flex">
                  <Button variant="secondary" onClick={() => void grade(null)} disabled={pending || index in sent}>
                    I don&apos;t know
                  </Button>
                </span>
                <span className="flex-1" />
                <Button
                  onClick={() => (index in sent || selected !== null) && void grade(selected)}
                  disabled={(selected === null && !(index in sent)) || pending}
                  aria-keyshortcuts="Enter"
                  className="min-w-32 md:min-w-40"
                >
                  {pending ? "Saving…" : index in sent ? "Try again" : "Check"}
                </Button>
              </div>
            ) : current.status === "none" ? (
              <div className="flex justify-end">
                <Button onClick={advance}>Continue</Button>
              </div>
            ) : null}
            {error !== null && (
              <p role="alert" className="text-[13px] font-medium text-danger">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </Frame>
  );
}

function Question({
  question,
  selected,
  answered,
  locked,
  onSelect,
  className,
}: {
  question: SessionQuestion;
  selected: number | null;
  answered: Graded | undefined;
  /** Saving, or sent and waiting to be retried: the pick cannot change. */
  locked: boolean;
  onSelect: (i: number) => void;
  className?: string;
}) {
  const stateOf = (i: number): ChoiceState => {
    if (answered === undefined) return i === selected ? "selected" : "idle";
    if (i === question.correct) return "correct";
    if (i === answered.picked) return "wrong";
    return "idle";
  };
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <p id="session-question" className="text-[15px] font-semibold leading-snug text-text md:text-[16px]">
        <MathText text={question.prompt} />
      </p>
      <div className="flex flex-col gap-1.5 md:gap-2" role="group" aria-labelledby="session-question">
        {question.choices.map((choice, i) => (
          <ChoiceRow
            key={`${i}-${choice}`}
            shortcut={String(i + 1)}
            state={stateOf(i)}
            disabled={answered !== undefined || locked}
            onClick={() => onSelect(i)}
          >
            <MathText text={choice} />
          </ChoiceRow>
        ))}
      </div>
    </div>
  );
}

/**
 * Focus mode's frame: the step bar, the label and exit row, the 720px column.
 * The column is keyed on `stepKey`, so each step mounts afresh and rises in;
 * the bar above it stays, and its fill slides to the new width.
 */
function Frame({
  percent,
  label,
  short,
  exitHref,
  exitLabel,
  stepKey,
  columnRef,
  children,
}: {
  percent: number;
  label: string;
  short: string;
  exitHref: string;
  /** What the exit link says from 768px up; "Exit" on a phone. */
  exitLabel: string;
  stepKey: number;
  columnRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const value = Math.max(0, Math.min(100, percent));
  return (
    // On a phone the column fills the space under the shell's header, less
    // the page's bottom padding, so the actions sit at the bottom where a
    // thumb is (hi-fi 15).
    <div className="flex min-h-[calc(100dvh-3.5rem-2rem-env(safe-area-inset-bottom))] flex-col md:min-h-0">
      <div
        className={cx("h-2 w-full md:h-3", TRACK)}
        role="progressbar"
        aria-label="Session progress"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-r-[4px] bg-accent transition-[width] duration-300 ease-soft motion-reduce:transition-none md:rounded-r-md"
          style={{ width: `${value}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-4 px-3.5 py-2 text-[12px] font-medium text-text2 md:px-6 md:py-3">
        <p className="min-w-0 truncate">
          <span className="md:hidden">{short}</span>
          <span className="hidden md:inline">{label}</span>
        </p>
        <TextLink href={exitHref} tone="muted" className="shrink-0">
          <span className="md:hidden">Exit</span>
          <span className="hidden md:inline">{exitLabel}</span>
        </TextLink>
      </div>
      <div
        key={stepKey}
        ref={columnRef}
        data-step={stepKey}
        className={cx(
          "mx-auto flex w-full max-w-[720px] flex-1 animate-enter flex-col gap-3 px-3.5 pt-1 pb-3.5 motion-reduce:animate-none",
          "md:flex-none md:gap-[22px] md:px-0 md:pt-0 md:pb-10",
        )}
      >
        {children}
      </div>
    </div>
  );
}
