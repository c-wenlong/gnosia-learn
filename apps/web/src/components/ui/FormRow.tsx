import { useId, type ReactNode } from "react";

import { cx, LABEL } from "./classes";
import { LiveStatus, type StatusTone } from "./LiveStatus";

/** What a row's control is handed: the ids that tie it to the row's words. */
export interface FormRowField {
  /** The control's id, which the `<label htmlFor>` names. */
  id: string;
  /** The label's own id, for a control that is named by `aria-labelledby` (a radio group). */
  labelId: string;
  /** The hint's and the error's ids, for the control's `aria-describedby`; undefined when there are neither. */
  describedBy: string | undefined;
  /** Whether the row shows an error, for the control's `aria-invalid`. */
  invalid: boolean;
}

/**
 * Kit `FormRow`: a label, an optional hint, the control, an optional error
 * and an optional status line, wired together, so a form field never carries
 * a label nothing points at or a hint a screen reader does not hear.
 *
 * The control is a function of the row (`children(field)`): it takes `id` for
 * the label, `describedBy` for the hint and the error, and `invalid`. The
 * error is a `role="alert"` line under the control; the status is a
 * `LiveStatus` ("Saving…", "Saved", why a save failed), which glides in and
 * out.
 *
 * `layout="stacked"` (the default) is a 12px label over the control, with the
 * hint, error and status under it: a field inside a form or a card's fold.
 * `layout="inline"` is a settings row: from 768px the label and hint take a
 * 320px column, the control 300px, and the status the rest of the line; under
 * that they stack.
 *
 * Safe in a server component (`useId` is allowed there), though a control
 * that takes an `onChange` makes its caller a client component anyway.
 */
export function FormRow({
  label,
  hint,
  error = null,
  status,
  layout = "stacked",
  id: given,
  className,
  children,
}: {
  label: ReactNode;
  /** A line about the field: what it is for, what happens on a change. */
  hint?: ReactNode;
  /** Why the value was refused; null or absent when it was not. */
  error?: string | null;
  /** The status line, as `LiveStatus` takes it. An inline row keeps its column whether or not one is given. */
  status?: { text: string | null; tone?: StatusTone };
  layout?: "stacked" | "inline";
  /** The control's id, when the caller needs it before the row renders (to focus it); one is made otherwise. */
  id?: string;
  className?: string;
  children: (field: FormRowField) => ReactNode;
}) {
  const made = useId();
  const id = given ?? made;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint !== undefined ? hintId : null, error !== null ? errorId : null].filter((part) => part !== null).join(" ") || undefined;
  const field: FormRowField = { id, labelId: `${id}-label`, describedBy, invalid: error !== null };
  const inline = layout === "inline";

  const labelLine = (
    <label id={field.labelId} htmlFor={id} className={inline ? "text-[14px] font-medium text-text" : LABEL}>
      {label}
    </label>
  );
  const hintLine = hint !== undefined && (
    <p id={hintId} className="text-[12px] text-text2">
      {hint}
    </p>
  );
  const errorLine = error !== null && (
    <p id={errorId} role="alert" className="animate-fade-in text-[12px] text-danger motion-reduce:animate-none">
      {error}
    </p>
  );
  const statusLine = status !== undefined && <LiveStatus text={status.text} tone={status.tone} />;

  if (inline) {
    return (
      <div className={cx("flex flex-col gap-2 md:flex-row md:items-center md:gap-4", className)}>
        <div className="flex flex-col gap-0.5 md:w-[320px] md:shrink-0">
          {labelLine}
          {hintLine}
        </div>
        <div className="flex w-full flex-col gap-1.5 md:w-[300px] md:shrink-0">
          {children(field)}
          {errorLine}
        </div>
        <div className="min-w-0 md:flex-1">{statusLine}</div>
      </div>
    );
  }
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      {labelLine}
      {children(field)}
      {hintLine}
      {errorLine}
      {status !== undefined && (
        // The space above a status is its own, inside its fold, so a shut
        // status leaves none behind (`LiveStatus`); this takes back the gap.
        <div className="-mt-1.5">
          <LiveStatus text={status.text} tone={status.tone} className="pt-1.5" />
        </div>
      )}
    </div>
  );
}
