"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { ChoiceRow, type ChoiceState } from "@/components/ui/ChoiceRow";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { FeedbackBar } from "@/components/ui/FeedbackBar";
import { RatingButton } from "@/components/ui/RatingButton";
import { StatTile } from "@/components/ui/StatTile";
import { cx } from "@/components/ui/classes";
import {
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
 * write `router.refresh()` re-reads the layout, so the streak and target pills
 * in the shell move with the session.
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
  asOf,
}: {
  initial: ReviewSessionData;
  /** The concept `?concept=` named, when the session came from its workspace. */
  focus: string | null;
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
    : { href: "/today", label: "Exit to Today" };

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
    if (phase === "answered") ratingsRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
      <Frame percent={0} label="Review" exit={exit}>
        <Closing
          title="Reviews are unavailable"
          lead="The database could not be reached, so there is no queue to show and nothing could be graded. Start Postgres and reload."
        />
      </Frame>
    );
  }

  if (total === 0) {
    const next = formatDue(initial.nextDue, now);
    return (
      <Frame percent={0} label="Review" exit={exit}>
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
      <Frame percent={100} label={`Review · ${total} of ${total}`} short={`${total} of ${total}`} exit={exit}>
        <Closing
          title="Review done"
          lead={`${outcomes.length} ${outcomes.length === 1 ? "card" : "cards"} reviewed${
            close !== null && close.remaining > 0 ? `, and ${close.remaining} more came due` : ""
          }.`}
        >
          <div className="flex w-full gap-2.5 md:gap-3.5">
            <StatTile value={outcomes.length} label="reviewed" tone="ok" />
            <StatTile value={again} label="again" tone="streak" />
            <StatTile value={<span className="text-[20px] md:text-[26px]">{next}</span>} label="next due" tone="accent" />
          </div>
        </Closing>
      </Frame>
    );
  }

  const position = index + 1;
  const domain = queueDomain(items.map((i) => i.domain));
  const left = minutesLeft(total - index);
  const answerShown = phase !== "ask";

  return (
    <Frame
      percent={(position / total) * 100}
      label={`Review · ${position} of ${total}`}
      short={`${position} of ${total}`}
      exit={exit}
    >
      <div className="hidden items-center justify-between gap-4 text-[12px] md:flex">
        <p className="font-medium text-text2">
          Review · {position} of {total}
          {domain !== null && ` · ${domain}`}
        </p>
        <p className="text-text3">Est. {left} min left</p>
      </div>

      <section
        aria-live="polite"
        className="flex flex-col gap-1 rounded-2xl border-2 border-border bg-surface p-4 md:gap-2 md:rounded-[20px] md:p-6"
      >
        <Eyebrow>
          {item.kind === "check" ? "Check" : "Recall"} · {item.title}
          {item.leech && " · leech"}
        </Eyebrow>
        <h1 className="font-display text-[20px] leading-[1.3] font-bold text-text md:text-[24px]">{item.prompt}</h1>
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
          <AnswerPanel item={item} whyOpen={whyOpen} onWhy={() => setWhyOpen((open) => !open)} />
        )
      )}

      <div
        ref={ratingsRef}
        className="mt-auto flex scroll-mb-[calc(4.25rem+env(safe-area-inset-bottom))] flex-col gap-2.5 md:mt-0 md:scroll-mb-0"
      >
        {answerShown ? (
          <>
            <p className="hidden text-[13px] font-medium text-text2 md:block">
              {item.kind === "check" ? "Or rate it yourself" : "How well did you recall it?"}
            </p>
            <div className="flex gap-1.5 md:gap-3" role="group" aria-label="Rate your recall">
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
          </>
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

function newRequestId(): string {
  // `randomUUID` needs a secure context; a LAN address over http is not one.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function keysHint(item: ReviewItem, phase: Phase): string {
  if (item.kind === "recall") return phase === "ask" ? "Space reveals the answer" : "Keys 1 to 4 rate";
  return phase === "ask" ? "Keys 1 to 4 pick an answer" : "Keys 1 to 4 rate · enter continues";
}

/** The focus-mode frame: the step bar, the label and exit row, the 720px column. */
function Frame({
  percent,
  label,
  short,
  exit,
  children,
}: {
  percent: number;
  label: string;
  short?: string;
  exit: { href: string; label: string };
  children: ReactNode;
}) {
  const value = Math.max(0, Math.min(100, percent));
  return (
    // On a phone the column fills the space between the shell's header and its
    // tab bar, so the rating row sits at the bottom where a thumb is (hi-fi 14).
    <div className="flex min-h-[calc(100dvh-3.5rem-6.5rem-env(safe-area-inset-bottom))] flex-col md:min-h-0">
      <div
        className="h-2 w-full bg-border md:h-3"
        role="progressbar"
        aria-label="Review progress"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-r-[4px] bg-accent transition-[width] duration-300 md:rounded-r-md"
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
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-3 px-3.5 pt-1 pb-3.5 md:flex-none md:gap-[22px] md:px-0 md:pt-0 md:pb-10">
        {children}
      </div>
    </div>
  );
}

/** The tinted answer panel: the answer, its citation, Why? and Open concept. */
function AnswerPanel({ item, whyOpen, onWhy }: { item: ReviewItem; whyOpen: boolean; onWhy: () => void }) {
  return (
    <section className="flex flex-col gap-1 rounded-2xl bg-tint p-4 md:gap-2.5 md:rounded-[20px] md:p-6">
      <Eyebrow>Answer</Eyebrow>
      <p className="text-[15px] leading-[1.45] text-text md:text-[17px] md:leading-[26px]">
        {item.answer.trim() !== "" ? item.answer : "This note has no summary yet. Open the concept and check yourself against the note."}
      </p>
      <Links item={item} whyOpen={whyOpen} onWhy={onWhy} />
      {whyOpen && item.why !== null && <p className="text-[14px] leading-[1.5] text-text2">{item.why}</p>}
    </section>
  );
}

function Links({ item, whyOpen, onWhy }: { item: ReviewItem; whyOpen: boolean; onWhy: () => void }) {
  const hasAny = item.source !== null || item.why !== null;
  return (
    <div className={cx("flex flex-wrap items-center gap-2 pt-1", !hasAny && "hidden md:flex")}>
      {item.source !== null && <CitePill n={1} label={item.source} />}
      {item.why !== null && (
        <Button variant="ghost" size="sm" onClick={onWhy} aria-expanded={whyOpen}>
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
            {choice}
          </ChoiceRow>
        ))}
      </div>
      {answered && suggested !== null && (
        <FeedbackBar
          ok={right}
          title={right ? "Correct" : picked === null ? "Here is the answer" : "Not quite"}
          detail={item.why ?? undefined}
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
        <h1 className="font-display text-[28px] font-bold text-text md:text-[32px]">{title}</h1>
        <p className="max-w-[480px] text-[14px] text-text2">{lead}</p>
      </div>
      {children}
      <Button href="/today">Back to Today</Button>
    </div>
  );
}
