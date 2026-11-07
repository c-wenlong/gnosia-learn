"use client";

import { useId } from "react";

import { LABEL } from "@/components/ui/classes";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Textarea";
import { CONFIDENCE_STOPS } from "@gnosia/tutor/check-block";
import { SESSION_TEXT_LIMIT } from "@gnosia/tutor/session-core";

/**
 * "How sure are you?" and "Your reasoning (optional)", the two fields a
 * check asks beside its answer (docs/proposals/structured-checks.md, K6 and
 * K8): on a choice card, a recall card and the session page's question.
 */

/** The confidence stops as segmented-control items. */
const STOP_ITEMS = CONFIDENCE_STOPS.map((stop) => ({ id: String(stop), label: `${stop}%` }));

export function ConfidenceField({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <p id={`${id}-sure`} className={LABEL}>
        How sure are you?
      </p>
      <SegmentedControl
        label="How sure are you?"
        labelledBy={`${id}-sure`}
        items={STOP_ITEMS}
        value={String(value)}
        onChange={(next) => onChange(Number(next))}
        size="sm"
        block
        disabled={disabled}
      />
    </div>
  );
}

export function ReasoningField({
  value,
  onChange,
  disabled,
  placeholder = "Why you picked it, or what you were unsure about",
}: {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={LABEL}>Your reasoning (optional)</span>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={SESSION_TEXT_LIMIT}
        rows={2}
        disabled={disabled}
        placeholder={placeholder}
      />
    </label>
  );
}
