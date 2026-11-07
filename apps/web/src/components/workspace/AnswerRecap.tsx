import type { ReactNode } from "react";

import { cx } from "@/components/ui/classes";

/**
 * What the learner sent, shown back on a check card once it is submitted:
 * their answer, how sure they said they were, and their reasoning when they
 * gave one. A description list on the card's sunk ground, shared by the two
 * check cards (docs/proposals/structured-checks.md), which lay it out apart:
 *
 * - `stacked` (`RecallCheckCard`): the answer is the learner's own words,
 *   often a paragraph, so each value sits under its label and keeps its line
 *   breaks, and the confidence rides on the label ("Your answer · 70% sure").
 * - `inline` (`ChoiceCheckCard`): the answer is one of the options, so the
 *   label and value share a line, wrapping when they must, and the
 *   confidence trails the option.
 *
 * React-free and stateless, so either card (both client components) or a
 * server one can draw it.
 */
export function AnswerRecap({
  layout,
  answer,
  confidence,
  thinking,
}: {
  layout: "stacked" | "inline";
  /** The answer as the card draws it: the learner's words, the option they picked, or "I don't know". */
  answer: ReactNode;
  /** 0 to 100, or null when there is none to show (an "I don't know"). */
  confidence: number | null;
  /** The learner's reasoning, or null when they gave none. */
  thinking: string | null;
}) {
  const stacked = layout === "stacked";
  const sure = confidence === null ? null : <span className="text-text2">· {confidence}% sure</span>;
  const pair = stacked ? "flex flex-col gap-0.5" : "flex flex-wrap gap-x-1.5";
  return (
    <dl className={cx("flex flex-col rounded-lg bg-surface2 px-3 py-2 text-[13px]", stacked ? "gap-2" : "gap-1")}>
      <div className={pair}>
        <dt className="text-text3">
          Your answer
          {stacked && sure !== null && <> {sure}</>}
        </dt>
        <dd className={cx("min-w-0 text-text", stacked && "whitespace-pre-wrap")}>
          {answer}
          {!stacked && sure !== null && <> {sure}</>}
        </dd>
      </div>
      {thinking !== null && (
        <div className={pair}>
          <dt className="text-text3">Your reasoning</dt>
          <dd className="min-w-0 whitespace-pre-wrap text-text">{thinking}</dd>
        </div>
      )}
    </dl>
  );
}
