import type { ReactNode } from "react";

import { cx, STATUS_TEXT } from "./classes";

export type ErrorTone = "danger" | "warn";

const TONE: Record<ErrorTone, string> = {
  danger: "text-danger",
  warn: "text-warn-text",
};

/**
 * Kit `ErrorText`: the one-line refusal under a control or beside a button,
 * said where it happened. A `role="alert"` paragraph at the status line's size
 * (12px, regular), which fades in as it mounts; `FormRow`'s error line is this.
 *
 * `danger` is a refusal (a save that failed, a field that is wrong); `warn` is
 * a nudge the learner can act on (an answer missing before Submit). `id` is
 * for a control that names the line in its `aria-describedby`.
 *
 * Nothing renders for empty `children`, so a caller can pass its error state
 * as it is. A line that must be announced again for the same words is
 * remounted by the caller's `key`.
 */
export function ErrorText({
  children,
  id,
  tone = "danger",
  className,
}: {
  children?: ReactNode;
  id?: string;
  tone?: ErrorTone;
  className?: string;
}) {
  if (children === undefined || children === null || children === false || children === "") return null;
  return (
    <p id={id} role="alert" className={cx(STATUS_TEXT, TONE[tone], "animate-fade-in motion-reduce:animate-none", className)}>
      {children}
    </p>
  );
}
