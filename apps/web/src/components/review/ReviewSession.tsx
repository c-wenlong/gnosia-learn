"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import { Button } from "@/components/ui/Button";
import { ChoiceRow, type ChoiceState } from "@/components/ui/ChoiceRow";
import { Collapse } from "@/components/ui/Collapse";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { MathText } from "@/components/Math";
import { FeedbackBar } from "@/components/ui/FeedbackBar";
import { RatingButton } from "@/components/ui/RatingButton";
import { StatTile } from "@/components/ui/StatTile";
import { cx, TRACK } from "@/components/ui/classes";
import { scrollBehavior } from "@/lib/reduced-motion";
import {
  cardEyebrow,
  cardStats,
  formatDue,
  formatInterval,
  isRating,
  minutesLeft,
  queueDomain,
  RATING_IF_CORRECT,
  RATING_IF_WRONG,
  RATING_LABEL,
  type Rating,
  type ReviewItem,
  type ReviewSessionData,
} from "@/lib/review-core";

import { CitePill } from "./CitePill";

/**
 * The review session (hi-fi 08, and 14 on a phone): one card at a time, the
 * four ratings under it, and a close screen at the end of the queue.
 *
 * A recall card is prompt, then (space or Show answer) the answer, then a
 * rating. A check card is a multiple-choice question that grades itself: a
 * right pick suggests Good and a wrong one Again, shown on the rating row and
 * committed by Continue, and any of the four buttons overrides it. Keys 1 to 4
 * pick an option before the verdict and rate after it.
 *
 * The queue is fixed when the page renders. Each rating is one
 * `POST /api/review/grade`, and the card advances only once it has been
 * recorded: a grade that did not save stays on screen with the error, since a
 * review silently lost is worse than one retried (layering rule 14). After each
 * write `router.refresh()` re-reads the layout, so the learner snapshot the
 * shell holds moves with the session.
 *
 * **Motion.** Each card's column is keyed on its place in the queue, so the
 * next card rises in rather than being swapped in place, and the focus moves
 * to its prompt, since the rating that was pressed went with the old column.
 * The answer and the rating row rise in when they appear; when the control
 * that revealed them (Show answer, I don't know, a picked option) has gone or
 * gone dead, the focus moves to the answer, or to the rating row on a check
 * card. Never to a rating button itself: Space on a focused button presses
 * it, and Space must not rate a card the learner has only just seen answered.
 */

type Phase = "ask" | "shown" | "answered";

interface Outcome {
  conceptId: string;
  rating: Rating;
}

interface CloseData {
  nextDue: string | null;
  remaining: number;
}

export function ReviewSession({
  initial,
  focus,
  selected = false,
  asOf,
}: {
  initial: ReviewSessionData;
  /** The concept `?concept=` named, when the session came from its workspace. */
  focus: string | null;
  /**
   * The session is Home's "Recall these" (`?only=`), so an empty one means the
   * picked cards are no longer due, not that nothing is.
   */
  selected?: boolean;
  /** When the server read the queue; the relative dates are computed from it. */
  asOf: string;
}) {
  const router = useRouter();
  const [items] = useState(initial.items);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("ask");
  /** The option picked on a check card; null with `answered` means "I don't know". */
  const [picked, setPicked] = useState<number | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [close, setClose] = useState<CloseData | null>(null);
  const ratingsRef = useRef<HTMLDivElement>(null);
  /** The card's column, keyed on the card, so its prompt can take the focus. */
  const columnRef = useRef<HTMLDivElement>(null);
  /** The rating row (`role="group"`), a focus target after a check card is answered. */
  const ratingGroupRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLElement>(null);
  /** The card whose prompt last had the focus moved to it: the first is left alone. */
  const shownIndex = useRef(index);
  // `pending` is state, so two key presses inside one frame both read it as
  // false and would grade the card twice, skipping the next one. The ref is
  // the guard; the state is only for the disabled look.
  const inFlight = useRef(false);
  // The card the queue is really on. A key handler still holding the previous
  // render's card between a recorded grade and the re-render finds it stale.
  const current = useRef(0);
  // One name per card, reused by a retry, so a grade the server saved but
  // whose answer was lost is not recorded twice (`requestId` on the route).
  const attempt = useRef(newRequestId());

  const now = useMemo(() => new Date(asOf), [asOf]);
  const item: ReviewItem | undefined = items[index];
  const total = items.length;
  const done = initial.reachable && index >= total;

  const exit = focus
    ? { href: `/learn/${encodeURIComponent(focus)}`, label: "Exit to workspace" }
    : { href: "/home", label: "Exit to Home" };

  const suggested: Rating | null =
    item?.kind === "check" && phase === "answered"
      ? picked !== null && picked === item.correct
        ? RATING_IF_CORRECT
        : RATING_IF_WRONG
      : null;

  const rate = useCallback(
    async (rating: Rating) => {
      if (item === undefined || inFlight.current || current.current !== index) return;
      inFlight.current = true;
      setPending(true);
      setError(null);
      try {
        const res = await fetch("/api/review/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conceptId: item.conceptId, grade: rating, requestId: attempt.current }),
        });
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          result?: { rating?: unknown };
        } | null;
        if (!res.ok || body?.ok !== true) {
          setError(body?.error ?? `Not saved (${res.status}).`);
          return;
        }
        current.current = index + 1;
        attempt.current = newRequestId();
        // What the server recorded, which on a replayed retry is the first
        // rating rather than the one just pressed.
        const recorded = isRating(body.result?.rating) ? body.result.rating : rating;
        setOutcomes((list) => [...list, { conceptId: item.conceptId, rating: recorded }]);
        setIndex((i) => i + 1);
        setPhase("ask");
        setPicked(null);
        setWhyOpen(false);
        router.refresh();
      } catch {
        setError("Not saved: the server could not be reached.");
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [item, index, router],
  );

  const reveal = useCallback(() => setPhase("shown"), []);
  const pick = useCallback((choice: number | null) => {
    setPicked(choice);
    setPhase("answered");
  }, []);

  // On a phone the verdict and the ratings land below the options, under the
  // fold; bring the ratings up so Continue is on screen. A no-op on a desktop,
  // where they are already in view.
  useEffect(() => {
    if (phase === "answered") ratingsRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }, [phase]);

  // The next card (or the close screen) takes the focus to its heading.
  useEffect(() => {
    if (shownIndex.current === index) return;
    shownIndex.current = index;
    columnRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  }, [index]);

  // Show answer, I don't know and a picked option leave the focus on nothing:
  // the first two unmount, the third is disabled. Move it to what appeared.
  useEffect(() => {
    if (phase === "ask" || !focusLost()) return;
    const target = phase === "shown" ? answerRef.current : ratingGroupRef.current;
    target?.focus({ preventScroll: true });
  }, [phase]);

  // The close screen's "next due" is read after the last grade, not before:
  // the grades just written are what moved it.
  useEffect(() => {
    if (!done || total === 0) return;
    let live = true;
    fetch("/api/review/due", { cache: "no-store" })
      .then((res) => res.json())
      .then((body: { ok?: boolean; nextDue?: string | null; items?: unknown[] }) => {
        if (live && body.ok) setClose({ nextDue: body.nextDue ?? null, remaining: body.items?.length ?? 0 });
      })
      .catch(() => {
        if (live) setClose({ nextDue: null, remaining: 0 });
      });
    return () => {
      live = false;
    };
  }, [done, total]);

  useEffect(() => {
    if (item === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || pending) return;
      const target = event.target as HTMLElement | null;
      if (target !== null && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      // Space and Enter on a focused link or button belong to that control:
      // Enter on Exit leaves, it does not record the suggested grade.
      const onControl = target !== null && target.closest("a[href], button:not(:disabled)") !== null;

      const n = Number(event.key);
      const number = Number.isInteger(n) && n >= 1 && n <= 4 ? n - 1 : null;
      const confirm = (event.key === " " || event.key === "Enter") && !onControl;

      if (item.kind === "recall" && phase === "ask" && confirm) {
        event.preventDefault();
        reveal();
      } else if (item.kind === "check" && phase === "ask" && number !== null && number < (item.choices?.length ?? 0)) {
        event.preventDefault();
        pick(number);
      } else if (phase !== "ask" && number !== null && isRating(number)) {
        event.preventDefault();
        void rate(number);
      } else if (phase === "answered" && confirm && suggested !== null) {
        event.preventDefault();
        void rate(suggested);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, phase, pending, suggested, rate, reveal, pick]);

  if (!initial.reachable) {
    return (
      <Frame percent={0} label="Review" exit={exit} stepKey="empty" columnRef={columnRef}>
        <Closing
          title="Reviews are unavailable"
          lead="The database could not be reached, so there is no queue to show and nothing could be graded. Start Postgres and reload."
        />
      </Frame>
    );
  }

  if (total === 0 && selected) {
    return (
      <Frame percent={0} label="Review" exit={exit} stepKey="empty" columnRef={columnRef}>
        <Closing
          title="Already reviewed"
          lead="The cards picked for you are not due any more, so there is nothing to ask here. Any others that are due are under All reviews."
        >
          <Button href="/review" variant="secondary">
            All reviews
          </Button>
        </Closing>
      </Frame>
    );
  }

  if (total === 0) {
    const next = formatDue(initial.nextDue, now);
    return (
      <Frame percent={0} label="Review" exit={exit} stepKey="empty" columnRef={columnRef}>
        <Closing
          title="Nothing due"
          lead={next === null ? "No review is scheduled yet. Cards appear here once a concept has been taught or probed." : `The next card is due ${next}.`}
        />
      </Frame>
    );
  }

  if (done || item === undefined) {
    const again = outcomes.filter((o) => o.rating === 0).length;
    const next = close === null ? "…" : (formatDue(close.nextDue, new Date()) ?? "none");
    return (
      <Frame
        percent={100}
        label={`Review · ${total} of ${total}`}
        short={`${total} of ${total}`}
        exit={exit}
        stepKey="done"
        columnRef={columnRef}
      >
        <Closing
          title="Review done"
          lead={`${outcomes.length} ${outcomes.length === 1 ? "card" : "cards"} reviewed${
            close !== null && close.remaining > 0 ? `, and ${close.remaining} more came due` : ""
          }.`}
        >
          <div className="flex w-full gap-2.5 md:gap-3.5">
            <StatTile value={outcomes.length} label="Reviewed" tone="ok" />
            <StatTile value={again} label="Again" tone="streak" />
            <StatTile
              // Keyed on the value, so the date fades in over the "…" it replaces once the queue has been read again.
              value={
                <span key={next} className="animate-fade-in text-[20px] motion-reduce:animate-none md:text-[26px]">
                  {next}
                </span>
              }
              label="Next due"
              tone="accent"
            />
          </div>
        </Closing>
      </Frame>
    );
  }

  const position = index + 1;
  const domain = queueDomain(items.map((i) => i.domain));
  const left = minutesLeft(total - index);
  const answerShown = phase !== "ask";
  const eyebrow = cardEyebrow(item);

  return (
    <Frame
      percent={(position / total) * 100}
      label={`Review · ${position} of ${total}`}
      short={`${position} of ${total}`}
      exit={exit}
      stepKey={index}
      columnRef={columnRef}
    >
      {/* The frame above already says "Review · n of N", so this line keeps
          only what it adds: the queue's domain and the time left. */}
      <div className="hidden items-center justify-between gap-4 text-[12px] md:flex">
        {domain !== null && <p className="font-medium text-text2">{domain}</p>}
        <p className="ml-auto text-text3">Est. {left} min left</p>
      </div>

      <section
        aria-live="polite"
        className="flex flex-col gap-1 rounded-2xl border-2 border-border bg-surface p-4 md:gap-2 md:rounded-[20px] md:p-6"
      >
        {/* Left out only when it would repeat the prompt; see `cardEyebrow`. */}
        {eyebrow !== null && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 tabIndex={-1} className="font-display text-[20px] leading-[1.3] font-bold text-text outline-none md:text-[24px]">
          <MathText text={item.prompt} />
        </h1>
      </section>

      {item.kind === "check" ? (
        <CheckBody
          item={item}
          phase={phase}
          picked={picked}
          suggested={suggested}
          pending={pending}
          onPick={pick}
          onContinue={() => suggested !== null && void rate(suggested)}
        />
      ) : (
        answerShown && (
          <AnswerPanel item={item} whyOpen={whyOpen} onWhy={() => setWhyOpen((open) => !open)} panelRef={answerRef} />
        )
      )}

      <div
        ref={ratingsRef}
        className="mt-auto flex scroll-mb-[calc(4.25rem+env(safe-area-inset-bottom))] flex-col gap-2.5 md:mt-0 md:scroll-mb-0"
      >
        {answerShown ? (
          <div className="flex animate-enter flex-col gap-2.5 motion-reduce:animate-none">
            <p className="hidden text-[13px] font-medium text-text2 md:block">
              {item.kind === "check" ? "Or rate it yourself" : "How well did you recall it?"}
            </p>
            <div
              ref={ratingGroupRef}
              tabIndex={-1}
              className="flex gap-1.5 outline-none md:gap-3"
              role="group"
              aria-label="Rate your recall"
            >
              {RATING_LABEL.map((label, rating) => (
                <RatingButton
                  key={label}
                  label={label}
                  interval={formatInterval(item.intervals[rating] ?? 1)}
                  short={formatInterval(item.intervals[rating] ?? 1, true)}
                  shortcut={String(rating + 1)}
                  suggested={suggested === rating}
                  disabled={pending}
                  onClick={() => void rate(rating as Rating)}
                />
              ))}
            </div>
          </div>
        ) : item.kind === "recall" ? (
          <Button block onClick={reveal} aria-keyshortcuts="Space">
            Show answer
          </Button>
        ) : (
          <div className="flex">
            <Button variant="secondary" onClick={() => pick(null)} disabled={pending}>
              I don&apos;t know
            </Button>
          </div>
        )}
        {error !== null && (
          <p role="alert" className="text-[13px] font-medium text-danger">
            {error}
          </p>
        )}
      </div>

      <div className="hidden items-center justify-between gap-4 text-[12px] text-text3 md:flex">
        <p>{keysHint(item, phase)}</p>
        <p suppressHydrationWarning>{cardStats(item, now)}</p>
      </div>
    </Frame>
  );
}

/** Whether the focus is on nothing a key press could reach: the page, a removed control or a disabled one. */
function focusLost(): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body || !active.isConnected) return true;
  return active instanceof HTMLButtonElement && active.disabled;
}

function newRequestId(): string {
  // `randomUUID` needs a secure context; a LAN address over http is not one.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function keysHint(item: ReviewItem, phase: Phase): string {
  if (item.kind === "recall") return phase === "ask" ? "Space reveals the answer" : "Keys 1 to 4 rate";
  return phase === "ask" ? "Keys 1 to 4 pick an answer" : "Keys 1 to 4 rate · enter continues";
}

/**
 * The focus-mode frame: the step bar, the label and exit row, the 720px column.
 * The column is keyed on `stepKey`, so each card mounts afresh and rises in;
 * the bar above it stays, and its fill slides to the new width.
 */
function Frame({
  percent,
  label,
  short,
  exit,
  stepKey,
  columnRef,
  children,
}: {
  percent: number;
  label: string;
  short?: string;
  exit: { href: string; label: string };
  stepKey: number | string;
  columnRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const value = Math.max(0, Math.min(100, percent));
  return (
    // On a phone the column fills the space under the shell's header, less the
    // page's bottom padding, so the rating row sits at the bottom where a thumb
    // is (hi-fi 14).
    <div className="flex min-h-[calc(100dvh-3.5rem-2rem-env(safe-area-inset-bottom))] flex-col md:min-h-0">
      <div
        className={cx("h-2 w-full md:h-3", TRACK)}
        role="progressbar"
        aria-label="Review progress"
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
        <p>
          <span className="md:hidden">{short ?? label}</span>
          <span className="hidden md:inline">{label}</span>
        </p>
        <Link
          href={exit.href}
          className="rounded-sm hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="md:hidden">Exit</span>
          <span className="hidden md:inline">{exit.label}</span>
        </Link>
      </div>
      <div
        key={stepKey}
        ref={columnRef}
        data-step={stepKey}
        className="mx-auto flex w-full max-w-[720px] flex-1 animate-enter flex-col gap-3 px-3.5 pt-1 pb-3.5 motion-reduce:animate-none md:flex-none md:gap-[22px] md:px-0 md:pt-0 md:pb-10"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The tinted answer panel: the answer, its citation, Why? and Open concept.
 * It rises in as it appears, and can hold the focus (`tabIndex={-1}`) once
 * Show answer has gone.
 */
function AnswerPanel({
  item,
  whyOpen,
  onWhy,
  panelRef,
}: {
  item: ReviewItem;
  whyOpen: boolean;
  onWhy: () => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  const whyId = useId();
  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      aria-label="Answer"
      className="flex animate-enter flex-col gap-1 rounded-2xl bg-tint p-4 outline-none motion-reduce:animate-none md:gap-2.5 md:rounded-[20px] md:p-6"
    >
      <Eyebrow>Answer</Eyebrow>
      <p className="text-[15px] leading-[1.45] text-text md:text-[17px] md:leading-[26px]">
        {item.answer.trim() !== "" ? (
          <MathText text={item.answer} />
        ) : (
          "This note has no summary yet. Open the concept and check yourself against the note."
        )}
      </p>
      {/* One row of the panel, so a shut Why? adds no gap under the links. */}
      <div className="flex flex-col">
        <Links item={item} whyOpen={whyOpen} onWhy={onWhy} whyId={whyId} />
        {item.why !== null && (
          <Collapse open={whyOpen} id={whyId}>
            <p className="pt-1 text-[14px] leading-[1.5] text-text2 md:pt-2.5">
              <MathText text={item.why} />
            </p>
          </Collapse>
        )}
      </div>
    </section>
  );
}

function Links({
  item,
  whyOpen,
  onWhy,
  whyId,
}: {
  item: ReviewItem;
  whyOpen: boolean;
  onWhy: () => void;
  whyId: string;
}) {
  const hasAny = item.source !== null || item.why !== null;
  return (
    <div className={cx("flex flex-wrap items-center gap-2 pt-1", !hasAny && "hidden md:flex")}>
      {item.source !== null && <CitePill n={1} label={item.source} />}
      {item.why !== null && (
        <Button variant="ghost" size="sm" onClick={onWhy} aria-expanded={whyOpen} aria-controls={whyId}>
          Why?
        </Button>
      )}
      <span className="hidden md:contents">
        <Button variant="ghost" size="sm" href={`/learn/${encodeURIComponent(item.conceptId)}`}>
          Open concept
        </Button>
      </span>
    </div>
  );
}

function CheckBody({
  item,
  phase,
  picked,
  suggested,
  pending,
  onPick,
  onContinue,
}: {
  item: ReviewItem;
  phase: Phase;
  picked: number | null;
  suggested: Rating | null;
  pending: boolean;
  onPick: (choice: number) => void;
  onContinue: () => void;
}) {
  const answered = phase === "answered";
  const right = answered && picked !== null && picked === item.correct;
  const stateOf = (i: number): ChoiceState => {
    if (!answered) return "idle";
    if (i === item.correct) return "correct";
    if (i === picked) return "wrong";
    return "idle";
  };
  return (
    <>
      <div className="flex flex-col gap-2" role="group" aria-label="Options">
        {(item.choices ?? []).map((choice, i) => (
          <ChoiceRow
            key={choice}
            shortcut={String(i + 1)}
            state={stateOf(i)}
            disabled={answered || pending}
            onClick={() => onPick(i)}
          >
            <MathText text={choice} />
          </ChoiceRow>
        ))}
      </div>
      {answered && suggested !== null && (
        <FeedbackBar
          ok={right}
          title={right ? "Correct" : picked === null ? "Here is the answer" : "Not quite"}
          detail={item.why === null ? undefined : <MathText text={item.why} />}
          note={`Counts as ${RATING_LABEL[suggested]}, next in ${formatInterval(item.intervals[suggested] ?? 1)}.`}
          actions={
            <>
              {item.source !== null && <CitePill n={1} label={item.source} />}
              <Button variant={right ? "ok" : "warn"} onClick={onContinue} disabled={pending}>
                Continue
              </Button>
            </>
          }
        />
      )}
    </>
  );
}

/** The end of the queue, an empty queue, or an unreachable one: a title, a line, and the way out. */
function Closing({ title, lead, children }: { title: string; lead: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-6 pt-6 text-center md:pt-10">
      <div className="flex flex-col items-center gap-1.5">
        <h1 tabIndex={-1} className="font-display text-[28px] font-bold text-text outline-none md:text-[32px]">
          {title}
        </h1>
        <p className="max-w-[480px] text-[14px] text-text2">{lead}</p>
      </div>
      {children}
      <Button href="/home">Back to Home</Button>
    </div>
  );
}
