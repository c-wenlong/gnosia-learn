"use client";

import { useId, useState } from "react";

import { MathText } from "@/components/Math";
import { Button } from "@/components/ui/Button";
import { ChoiceRow, type ChoiceState } from "@/components/ui/ChoiceRow";
import { cx, LABEL, STATUS_TEXT } from "@/components/ui/classes";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Textarea";
import {
  CONFIDENCE_STOPS,
  DEFAULT_CONFIDENCE,
  type ChoiceAnswer,
  type ChoiceCheck,
  type ChoicePick,
} from "@/lib/check-block";
import { SESSION_TEXT_LIMIT } from "@/lib/session-core";

import { RecordedCard } from "./VerdictRow";

/**
 * The card under a tutor turn that asked a choice check
 * (docs/proposals/structured-checks.md, phase 1): the options in their seeded
 * order, "I don't know", how sure the learner is, an optional line of
 * reasoning, and Submit. Submit records the answer at once (K4): the pick is
 * graded against the key the tutor committed to before asking, so there is no
 * judge and no second tap. The card then shows the key, why it is right, and
 * what was written.
 *
 * `live` is false once the thread has moved past the check without an answer
 * (a message typed in the composer instead): the card folds to "Not answered"
 * and nothing is written, as an untapped verdict row folds to "Not recorded".
 */
const STOP_ITEMS = CONFIDENCE_STOPS.map((stop) => ({ id: String(stop), label: `${stop}%` }));

export function ChoiceCheckCard({
  check,
  order,
  answer,
  live,
  disabled = false,
  onSubmit,
  onRetry,
  concept,
}: {
  check: ChoiceCheck;
  /** Indices into `check.options`, in the order to show them (`choiceOrder`). */
  order: readonly number[];
  /** The learner's answer, once they have submitted one. */
  answer: ChoiceAnswer | null;
  live: boolean;
  /** The tutor is answering something else: the card waits. */
  disabled?: boolean;
  onSubmit: (pick: ChoicePick) => void;
  /** Resend a write that failed, with its request id. */
  onRetry: () => void;
  concept: { title: string; noteHref: string };
}) {
  const id = useId();
  const [picked, setPicked] = useState<number | null>(null);
  const [dontKnow, setDontKnow] = useState(false);
  const [confidence, setConfidence] = useState<number>(DEFAULT_CONFIDENCE);
  const [thinking, setThinking] = useState("");
  const [missing, setMissing] = useState(false);

  const done = answer !== null;
  const keyIndex = check.options.indexOf(check.answer);
  const stateOf = (i: number): ChoiceState => {
    if (!done) return i === picked ? "selected" : "idle";
    if (i === keyIndex) return "correct";
    if (i === answer.picked) return "wrong";
    return "idle";
  };

  if (!done && !live) {
    return (
      <div className="flex flex-col gap-1 self-stretch rounded-xl bg-surface2 px-4 py-3 text-[13px]">
        <p className="font-semibold text-text">
          <MathText text={check.question} />
        </p>
        <p className="text-[12px] text-text3">Not answered</p>
      </div>
    );
  }

  function submit() {
    if (picked === null && !dontKnow) {
      setMissing(true);
      return;
    }
    onSubmit({
      picked: dontKnow ? null : picked,
      confidence: dontKnow ? null : confidence,
      thinking: thinking.trim() === "" ? null : thinking.trim(),
    });
  }

  const pick = (i: number) => {
    setPicked(i);
    setDontKnow(false);
    setMissing(false);
  };

  return (
    <section
      aria-labelledby={`${id}-q`}
      className="flex animate-enter flex-col gap-3 self-stretch rounded-xl border border-border bg-surface px-4 py-3.5 motion-reduce:animate-none"
    >
      <p id={`${id}-q`} className="text-[15px] font-semibold leading-snug text-text">
        <MathText text={check.question} />
      </p>

      <div className="flex flex-col gap-1.5" role="group" aria-labelledby={`${id}-q`}>
        {order.map((i) => (
          <ChoiceRow key={i} state={stateOf(i)} disabled={done || disabled} onClick={() => pick(i)}>
            <MathText text={check.options[i] ?? ""} />
          </ChoiceRow>
        ))}
      </div>

      {!done ? (
        <>
          <div>
            <Button
              variant={dontKnow ? "accent" : "secondary"}
              size="sm"
              aria-pressed={dontKnow}
              disabled={disabled}
              onClick={() => {
                setDontKnow(true);
                setPicked(null);
                setMissing(false);
              }}
            >
              I don&apos;t know
            </Button>
          </div>

          {!dontKnow && (
            <div className="flex flex-col gap-1.5">
              <p id={`${id}-sure`} className={LABEL}>
                How sure are you?
              </p>
              <SegmentedControl
                label="How sure are you?"
                labelledBy={`${id}-sure`}
                items={STOP_ITEMS}
                value={String(confidence)}
                onChange={(next) => setConfidence(Number(next))}
                size="sm"
                block
                disabled={disabled}
              />
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Your reasoning (optional)</span>
            <Textarea
              value={thinking}
              onChange={(e) => setThinking(e.target.value)}
              maxLength={SESSION_TEXT_LIMIT}
              rows={2}
              disabled={disabled}
              placeholder="Why you picked it, or what you were unsure about"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm" onClick={submit} disabled={disabled}>
              Submit
            </Button>
            {missing && (
              <p role="alert" className={cx(STATUS_TEXT, "text-warn-text")}>
                Pick an option, or I don&apos;t know, first.
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-[14px] leading-6 text-text2">
            <MathText text={check.why} />
          </p>
          {answer.state === "recorded" && answer.recorded !== null ? (
            <RecordedCard recorded={answer.recorded} concept={concept} />
          ) : answer.state === "saving" ? (
            <p role="status" className="text-[12px] text-text3">
              Recording…
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className={cx(STATUS_TEXT, "text-warn-text")}>
                {answer.error ?? "The answer was not recorded."} A retry is never recorded twice.
              </p>
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
