"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

import { Button } from "./Button";
import { Callout } from "./Callout";
import { Collapse } from "./Collapse";

/**
 * Kit `ConfirmFold`: the question that folds open under a destructive button
 * (Settings' Reset progress, a course's Reset, deleting a provider), in
 * place of the browser's `confirm()`, which froze the page in a box the app
 * could not style or animate. A warn `Callout` in a `Collapse`, with the
 * destructive press first and Cancel beside it. The caller holds `open`, and
 * points its toggle's `aria-controls` at `id`.
 *
 * Focus is the part that matters, so the fold owns it:
 *
 * - Opening moves focus into the fold, onto Cancel, the press that loses
 *   nothing: from the toggle (`returnFocusTo`), from a toggle that folded
 *   away as this opened (a row of buttons that gives way to the confirm), or
 *   when focus was dropped. Focus somewhere else entirely stays put.
 * - Closing gives focus to `returnFocusTo` only when focus was inside the
 *   fold, or was dropped (a button that went disabled while `busy` drops it):
 *   never pulled back from somewhere the person moved it meanwhile. The
 *   target is read on the render that closes, so a caller can name a
 *   different one after a success.
 * - While `busy` both presses are disabled, since closing cannot take back a
 *   write that has left; when `busy` ends with the fold still open (the write
 *   failed), focus dropped by the disabled press goes back to it.
 * - Escape inside the fold is Cancel, unless `busy`.
 */
export function ConfirmFold({
  open,
  id,
  label,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  busy = false,
  returnFocusTo,
  className,
}: {
  open: boolean;
  /** The fold's id, for the toggle's `aria-controls`. */
  id: string;
  /** The group's accessible name: "Confirm reset". */
  label: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** Where focus goes when the fold shuts with focus inside it: usually the toggle. */
  returnFocusTo: RefObject<HTMLElement | null>;
  /** Classes around the box, such as the space above it (`pt-3`), which folds away with it. */
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const was = useRef({ open, busy });

  useEffect(() => {
    const before = was.current;
    was.current = { open, busy };
    const at = document.activeElement;
    const dropped = at === null || at === document.body;
    if (open && !before.open) {
      // From the toggle, from a toggle that went inert as this opened, or
      // from nowhere: the safe press takes it.
      if (dropped || at === returnFocusTo.current || at.closest("[inert]") !== null) cancel.current?.focus();
    } else if (!open && before.open) {
      if (dropped || panel.current?.contains(at)) returnFocusTo.current?.focus();
    } else if (open && before.busy && !busy) {
      if (dropped || panel.current?.contains(at)) confirm.current?.focus();
    }
  }, [open, busy, returnFocusTo]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || busy) return;
    // Not the dialog or page around it: Escape here answers this question.
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };

  return (
    <Collapse open={open} id={id}>
      {/* The space above the box is padding here, inside what the fold
          clips, not on the fold's own box: padding there stays in a shut
          grid row (measured, 12px), so a shut confirm still took room. */}
      <div onKeyDown={onKeyDown} className={className}>
        <Callout
          ref={panel}
          tone="warn"
          bordered
          role="group"
          aria-label={label}
          actions={
            <>
              <Button ref={confirm} variant="warn" size="sm" disabled={busy} onClick={onConfirm}>
                {confirmLabel}
              </Button>
              <Button ref={cancel} variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
                {cancelLabel}
              </Button>
            </>
          }
        >
          {message}
        </Callout>
      </div>
    </Collapse>
  );
}
