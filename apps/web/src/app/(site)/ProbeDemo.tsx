"use client";

import { useEffect, useRef, useState } from "react";

import { cx } from "@/components/ui/classes";

import { siteLink } from "./site";

/**
 * The hero's one working piece: a probe question whose answer moves the
 * learner's estimate for the concept, the way an answer in the app moves
 * `mastery.p_known`. The numbers are illustrative, not a call to the model;
 * what is true is the shape: a right answer raises the estimate, a wrong one
 * lowers it, and either way the book writes it down.
 */
const QUESTION = "Softmax turns a list of scores into what?";
const CHOICES = ["Probabilities that sum to one", "The single largest score", "The scores, sorted high to low"];
const CORRECT = 0;
const BEFORE = 0.54;
const AFTER_RIGHT = 0.83;
const AFTER_WRONG = 0.38;

export function ProbeDemo() {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const right = picked === CORRECT;
  const p = !answered ? BEFORE : right ? AFTER_RIGHT : AFTER_WRONG;

  // Answering disables the choices, so focus would fall to the page: move it
  // to "Try again", and back to the first choice on a retry. `moved` keeps the
  // first render from taking focus away from wherever the visitor is.
  const retryRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    (answered ? retryRef : firstRef).current?.focus();
  }, [answered]);
  const choose = (i: number | null) => {
    moved.current = true;
    setPicked(i);
  };

  return (
    <div className="gnosia-paper relative rounded-[28px] p-6 text-left md:p-7">
      <p className="flex items-center justify-between gap-3 text-[12px] font-semibold tracking-[0.16em] text-brand-mist uppercase">
        <span>Probe · Softmax</span>
        <span className="font-book text-[13px] font-normal tracking-normal normal-case italic">try it</span>
      </p>
      <p className="mt-3 font-book text-[22px] leading-snug font-medium text-brand-ink md:text-[24px]">{QUESTION}</p>

      <ul className="mt-5 flex flex-col gap-2.5">
        {CHOICES.map((c, i) => {
          const isPicked = picked === i;
          const showRight = answered && i === CORRECT;
          const showWrong = isPicked && !right;
          return (
            <li key={c}>
              <button
                type="button"
                ref={i === 0 ? firstRef : undefined}
                aria-pressed={isPicked}
                disabled={answered}
                onClick={() => choose(i)}
                className={cx(
                  "flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[15px] font-medium transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal",
                  !answered && "border-brand-ink/12 text-brand-ink hover:border-brand-teal/60 hover:bg-brand-teal/5",
                  answered && !showRight && !showWrong && "border-brand-ink/8 text-brand-mist",
                  showRight && "border-brand-teal bg-brand-teal/10 text-brand-ink",
                  showWrong && "border-brand-gold bg-brand-gold/10 text-brand-ink",
                )}
              >
                <span>{c}</span>
                {showRight && <Mark d="M4 8.5 7 11.5 12.5 5" className="text-brand-teal" />}
                {showWrong && <Mark d="M5 5l6 6M11 5l-6 6" className="text-brand-gold" />}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 border-t border-dashed border-brand-ink/15 pt-5">
        <p className="flex items-baseline justify-between gap-3 text-[13px] text-brand-mist">
          <span>How sure your book is that you know softmax</span>
          <span className="font-mono text-[14px] font-semibold text-brand-ink tabular-nums">{p.toFixed(2)}</span>
        </p>
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-brand-ink/10">
          <span
            className={cx(
              "block h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none",
              answered && !right ? "bg-brand-gold" : "bg-brand-teal",
            )}
            style={{ width: `${p * 100}%` }}
          />
        </span>
        <p aria-live="polite" className="mt-3 min-h-[2.75rem] text-[14px] leading-snug text-brand-mist">
          {!answered && "Pick an answer. Every answer is evidence."}
          {answered &&
            right &&
            `Right. The estimate rises to ${AFTER_RIGHT.toFixed(2)}, and the next lesson can build on it.`}
          {answered &&
            !right &&
            `Not quite: it gives probabilities that sum to one. The estimate drops to ${AFTER_WRONG.toFixed(2)}, so softmax stays on your list.`}
        </p>
        {answered && (
          <button
            ref={retryRef}
            type="button"
            onClick={() => choose(null)}
            className={siteLink("mt-1 rounded-md text-[14px] font-semibold text-brand-teal underline-offset-4 hover:underline")}
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function Mark({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cx("size-4 shrink-0", className)} fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
