"use client";

import { useId, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent, type RefObject } from "react";

import { Button } from "./Button";
import { cx } from "./classes";
import { COMPOSER_FRAME, COMPOSER_MAX_ROWS, COMPOSER_REASON, COMPOSER_TEXT, composerHeight, composerKey, modEnterTarget } from "./composer-keys";

/**
 * Kit composer: the chat input the concept tutor and the studio's planner
 * share. A 52px field at radius 16 with a 2px `--border` that goes `--accent`
 * on focus, and Send beside it.
 *
 * A textarea rather than the tutor's old one-line input, growing to six
 * lines and scrolling past that, because a pasted list or a flowchart
 * flattens into one line in an `<input>`. At one line it measures exactly
 * what the input did, so the tutor does not change.
 *
 * Enter sends and Shift+Enter is a new line (`composer-keys.ts`). Cmd or
 * Ctrl+Enter goes to `onModEnter` from an empty field when the caller has a
 * use for it, the studio's Draw, and sends otherwise.
 *
 * A client component, like `FilterMenu`: it measures itself on every change.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  label,
  placeholder,
  maxLength,
  disabled = false,
  sendDisabled = false,
  disabledReason,
  autoFocus,
  inputRef,
  onModEnter,
  maxRows = COMPOSER_MAX_ROWS,
  sendLabel = "Send",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Called with the text as typed; the caller trims and decides. */
  onSubmit: (value: string) => void;
  /** What a screen reader hears for the field. Visually hidden. */
  label: string;
  placeholder?: string;
  maxLength?: number;
  /** The whole composer: the field and Send. */
  disabled?: boolean;
  /** Send only, as while a reply is still arriving: the person can keep typing. */
  sendDisabled?: boolean;
  /**
   * Why the composer or Send is disabled, as a 12px line under the field tied
   * to it by `aria-describedby`. Under rather than beside Send (the kit
   * `Button`'s `disabledReason`), because a sentence beside Send takes its
   * width from the field on a phone.
   */
  disabledReason?: string;
  autoFocus?: boolean;
  /** The textarea, for a caller that focuses it (a suggestion chip). */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  onModEnter?: () => void;
  maxRows?: number;
  sendLabel?: string;
  className?: string;
}) {
  const fallback = useRef<HTMLTextAreaElement | null>(null);
  const own = inputRef ?? fallback;
  const reasonId = useId();
  const reason = (disabled || sendDisabled) && disabledReason ? disabledReason : null;
  const empty = value.trim() === "";
  const blocked = disabled || sendDisabled || empty;

  useLayoutEffect(() => {
    const box = own.current;
    if (box === null) return;
    // Collapse first, so a deleted line gives its height back.
    box.style.height = "auto";
    box.style.height = `${composerHeight(box.scrollHeight, maxRows)}px`;
  }, [value, maxRows, own]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (blocked) return;
    onSubmit(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const meaning = composerKey({
      key: event.key,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.nativeEvent.keyCode,
    });
    if (meaning === "send") {
      event.preventDefault();
      submit();
    } else if (meaning === "mod-send") {
      event.preventDefault();
      // `submit` refuses a blocked send, Cmd+Enter included.
      if (modEnterTarget(value, onModEnter !== undefined) === "mod") onModEnter?.();
      else submit();
    }
  }

  return (
    <form onSubmit={submit} className={cx("flex flex-col gap-1.5", className)}>
      <div className="flex items-end gap-2.5">
      <label className="min-w-0 flex-1">
        <span className="sr-only">{label}</span>
        <textarea
          ref={own}
          rows={1}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-describedby={reason === null ? undefined : reasonId}
          className={cx(
            "block h-[52px] w-full min-w-0 resize-none px-4 py-3 outline-none",
            COMPOSER_FRAME,
            COMPOSER_TEXT,
            "placeholder:text-text3 focus:border-accent disabled:cursor-not-allowed disabled:opacity-60",
          )}
        />
      </label>
      {/* The 2px under the button puts its face where the old centred row put
          it: the textarea grows downwards and Send stays on its last line. */}
      <div className="pb-0.5">
        <Button type="submit" disabled={blocked} aria-describedby={reason === null ? undefined : reasonId}>
          {sendLabel}
        </Button>
      </div>
      </div>
      {reason !== null && (
        <p id={reasonId} className={COMPOSER_REASON}>
          {reason}
        </p>
      )}
    </form>
  );
}
