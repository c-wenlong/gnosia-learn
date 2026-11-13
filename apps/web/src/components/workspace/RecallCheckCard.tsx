"use client";

import { useId, useState } from "react";

import { MathText } from "@/components/Math";
import { Button } from "@/components/ui/Button";
import { LABEL } from "@/components/ui/classes";
import { Textarea } from "@/components/ui/Textarea";
import { ErrorText } from "@/components/ui/ErrorText";
import { DEFAULT_CONFIDENCE, type RecallCheck, type RecallPick } from "@hermes/tutor/check-block";
import { SESSION_TEXT_LIMIT } from "@hermes/tutor/session-core";
import type { Verdict } from "@hermes/tutor/tutor-check";

import { AnswerRecap } from "./AnswerRecap";
import { ConfidenceField, ReasoningField } from "./SurenessFields";
import { VerdictRow } from "./VerdictRow";

/**
 * The card under a tutor turn that asked a recall check
 * (docs/proposals/structured-checks.md, phase 2): a box for the learner's own
 * words, how sure they are, an optional line of reasoning, and Submit.
 *
 * Submit locks the card and shows the answer the tutor committed to when it
 * asked (K1) under the learner's, and the judge reads both, the commitment
 * first. A recall check keeps the tap (K4): the verdict row under the card
 * works as it does for a `CHECK:` line (R2), the judge's verdict pre-selected
 * and nothing written until the learner chooses.
 *
 * `live` is false once the thread has moved past the check without an answer
 * (a message typed in the composer instead): the card folds to "Not
 * answered", as the choice card does.
 */
export function RecallCheckCard({
  check,
  pick,
  verdict,
  live,
  rowLive,
  disabled = false,
  onSubmit,
  onRecord,
  concept,
}: {
  check: RecallCheck;
  /** What the learner gave, once they have submitted. */
  pick: RecallPick | null;
  /** The answer's verdict row, once they have submitted. */
  verdict: Verdict | null;
  live: boolean;
  /** Whether the row is still the thread's newest: an older untapped one folds to "Not recorded". */
  rowLive: boolean;
  /** The tutor is answering something else: the card waits. */
  disabled?: boolean;
  onSubmit: (pick: RecallPick) => void;
  onRecord: (correct: boolean) => void;
  concept: { title: string; noteHref: string };
}) {
  const id = useId();
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState<number>(DEFAULT_CONFIDENCE);
  const [thinking, setThinking] = useState("");
  const [missing, setMissing] = useState(false);

  if (pick === null && !live) {
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
    if (answer.trim() === "") {
      setMissing(true);
      return;
    }
    onSubmit({ answer: answer.trim(), confidence, thinking: thinking.trim() === "" ? null : thinking.trim() });
  }

  return (
    <section
      aria-labelledby={`${id}-q`}
      className="flex animate-enter flex-col gap-3 self-stretch rounded-xl border border-border bg-surface px-4 py-3.5 motion-reduce:animate-none"
    >
      <p id={`${id}-q`} className="text-[15px] font-semibold leading-snug text-text">
        <MathText text={check.question} />
      </p>

      {pick === null ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Your answer</span>
            <Textarea
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                setMissing(false);
              }}
              maxLength={SESSION_TEXT_LIMIT}
              rows={3}
              disabled={disabled}
              aria-invalid={missing || undefined}
              placeholder="In your own words"
            />
          </label>

          <ConfidenceField value={confidence} onChange={setConfidence} disabled={disabled} />

          <ReasoningField
            value={thinking}
            onChange={setThinking}
            disabled={disabled}
            placeholder="How you got there, or what you were unsure about"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm" onClick={submit} disabled={disabled}>
              Submit
            </Button>
            {missing && <ErrorText tone="warn">Write your answer first.</ErrorText>}
          </div>
        </>
      ) : (
        <>
          <AnswerRecap
            layout="stacked"
            answer={<MathText text={pick.answer} />}
            confidence={pick.confidence}
            thinking={pick.thinking}
          />
          <div className="flex flex-col gap-0.5 text-[14px] leading-6">
            <p className="text-[13px] text-text3">The tutor&apos;s answer</p>
            <p className="whitespace-pre-wrap text-text">
              <MathText text={check.answer} />
            </p>
          </div>
          {verdict !== null && (
            <VerdictRow verdict={verdict} live={rowLive} onRecord={onRecord} concept={concept} />
          )}
        </>
      )}
    </section>
  );
}
