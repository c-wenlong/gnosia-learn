"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "./Button";
import { cx } from "./classes";
import { TextLink } from "./TextLink";

/** The swap's fade: opacity only, for something replacing something in place. */
const SWAP = "animate-fade-in motion-reduce:animate-none";

/**
 * Kit `InlineConfirm`: a press that asks before it acts by swapping itself
 * for its question in place: "Discard" becomes "The renders are deleted; the
 * source is kept. Discard it / Keep it". For a destructive press in a row of
 * presses, where a fold opening under the row would be more than the
 * question needs (`ConfirmFold` is that fold).
 *
 * `size="text"` draws words in a line of text (`TextLink`s, the size of the
 * line around them); `size="button"` draws a ghost `Button` that swaps for
 * small ones. `tone="danger"` makes the confirming press the destructive one
 * (danger words, or the warn button); `neutral` an ordinary one.
 *
 * Uncontrolled by default, closing once `onConfirm` is called, or once
 * `busy` ends when `onConfirm` made it busy. A caller that opens it from
 * elsewhere too, or decides itself when the question goes, holds `open` and
 * `onOpenChange`.
 *
 * Focus follows the swap. The trigger leaves the page as the question
 * arrives, so focus that was on it goes to Keep it, the press that loses
 * nothing; opened from elsewhere, focus stays where it was. When the question
 * goes, focus that was in it comes back to the trigger. Escape in the
 * question is Keep it, which stays pressable while `busy`: putting the
 * question away does not stop the work, and the trigger stays disabled.
 */
export function InlineConfirm({
  label,
  question,
  confirmLabel,
  busyLabel,
  keepLabel = "Keep it",
  onConfirm,
  size = "button",
  tone = "danger",
  buttonSize = "md",
  open: openProp,
  onOpenChange,
  busy = false,
  disabled = false,
  className,
}: {
  /** The trigger's words: "Discard". */
  label: string;
  question: ReactNode;
  confirmLabel: string;
  /** The confirming press's words while `busy`: "Discarding". */
  busyLabel?: string;
  keepLabel?: string;
  onConfirm: () => void;
  size?: "text" | "button";
  tone?: "danger" | "neutral";
  /** The trigger's size when `size="button"`; the question's presses are always small. */
  buttonSize?: "md" | "sm";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The confirmed work is running: the trigger and the confirming press are disabled. */
  busy?: boolean;
  /** The trigger is disabled. */
  disabled?: boolean;
  /** Classes for the trigger and the question alike, such as a place in the row. */
  className?: string;
}) {
  const [own, setOwn] = useState(false);
  // Uncontrolled, confirmed, and the work it started still running: the
  // question stays up until `busy` ends. The trigger is disabled while busy
  // and could not take focus back, which would drop it to the page.
  const [held, setHeld] = useState(false);
  if (held && !busy) {
    setHeld(false);
    setOwn(false);
  }
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : own;
  const setOpen = (next: boolean) => {
    if (!controlled) setOwn(next);
    onOpenChange?.(next);
  };

  const questionId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const was = useRef(open);
  useEffect(() => {
    if (was.current === open) return;
    was.current = open;
    const at = document.activeElement;
    // What had focus (the trigger, or the question) has just left the page.
    const dropped = at === null || at === document.body;
    if (open) {
      if (dropped) keep.current?.focus();
    } else if (dropped) {
      trigger.current?.focus();
    }
  }, [open]);

  const confirm = () => {
    onConfirm();
    // Closed on the next render, unless `onConfirm` made it busy.
    if (!controlled) setHeld(true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Escape") return;
    // Not the dialog or page around it: Escape here answers this question.
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  };
  const confirmWords = busy && busyLabel !== undefined ? busyLabel : confirmLabel;

  if (!open) {
    return size === "text" ? (
      <TextLink ref={trigger} onClick={() => setOpen(true)} tone="muted" weight="normal" disabled={disabled || busy} className={cx(SWAP, className)}>
        {label}
      </TextLink>
    ) : (
      <Button ref={trigger} variant="ghost" size={buttonSize} disabled={disabled || busy} onClick={() => setOpen(true)} className={cx(SWAP, className)}>
        {label}
      </Button>
    );
  }

  return (
    <span
      role="group"
      aria-labelledby={questionId}
      onKeyDown={onKeyDown}
      className={cx("flex flex-wrap items-center", size === "text" ? "gap-x-2 gap-y-1" : "gap-2", SWAP, className)}
    >
      <span id={questionId} className={cx("text-text2", size === "button" && "text-[13px]")}>
        {question}
      </span>
      {size === "text" ? (
        <>
          <TextLink onClick={confirm} tone={tone === "danger" ? "danger" : "accent"} pending={busy}>
            {confirmWords}
          </TextLink>
          <TextLink ref={keep} onClick={() => setOpen(false)} tone="muted" weight="normal">
            {keepLabel}
          </TextLink>
        </>
      ) : (
        <>
          <Button size="sm" variant={tone === "danger" ? "warn" : "secondary"} disabled={busy} onClick={confirm}>
            {confirmWords}
          </Button>
          <Button ref={keep} size="sm" variant="ghost" onClick={() => setOpen(false)}>
            {keepLabel}
          </Button>
        </>
      )}
    </span>
  );
}
