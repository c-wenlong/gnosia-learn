"use client";

import { useId, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";

import { Button } from "./Button";
import { cx } from "./classes";
import { ComposerBox, SendDisc } from "./ComposerBox";
import {
  COMPOSER_BOX_MIN_ROWS,
  COMPOSER_FRAME,
  COMPOSER_MAX_ROWS,
  COMPOSER_REASON,
  COMPOSER_TEXT,
  composerBoxHeight,
  composerHeight,
  composerKey,
  modEnterTarget,
} from "./composer-keys";

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
 * `layout="box"` draws the field in `ComposerBox` instead: three lines tall
 * when empty, with `toolbar` and a round Send in a row inside the frame under
 * it (D84 of docs/STUDIO-CHAT-FIRST.md). The keys and the growth rule are the
 * same. Nothing else uses it today but the studio's plain fallback for a box
 * `MentionComposer`.
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
  layout = "row",
  toolbar,
  minRows = COMPOSER_BOX_MIN_ROWS,
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
  /** `row`, the default: Send beside the field. `box`: the field over a row of controls, in one frame. */
  layout?: "row" | "box";
  /** The box's controls, between its left edge and Send. Not drawn in the row layout. */
  toolbar?: ReactNode;
  /** Lines the box's field shows when empty. */
  minRows?: number;
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
    box.style.height = `${layout === "box" ? composerBoxHeight(box.scrollHeight, minRows, maxRows) : composerHeight(box.scrollHeight, maxRows)}px`;
  }, [value, maxRows, minRows, layout, own]);

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

  const describedBy = reason === null ? undefined : reasonId;
  const reasonLine = reason !== null && (
    <p id={reasonId} className={COMPOSER_REASON}>
      {reason}
    </p>
  );

  if (layout === "box") {
    return (
      <form onSubmit={submit} className={cx("flex flex-col gap-1.5", className)}>
        <ComposerBox
          disabled={disabled}
          toolbar={toolbar}
          send={<SendDisc label={sendLabel} disabled={blocked} describedBy={describedBy} />}
          field={
            <label className="block min-w-0">
              <span className="sr-only">{label}</span>
              <textarea
                ref={own}
                rows={minRows}
                autoFocus={autoFocus}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={onKeyDown}
                maxLength={maxLength}
                placeholder={placeholder}
                disabled={disabled}
                autoComplete="off"
                aria-describedby={describedBy}
                className={cx(
                  "block w-full min-w-0 resize-none bg-transparent px-4 pb-1 pt-3 outline-none",
                  COMPOSER_TEXT,
                  "placeholder:text-text3 disabled:cursor-not-allowed",
                )}
              />
            </label>
          }
        />
        {reasonLine}
      </form>
    );
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
          aria-describedby={describedBy}
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
        <Button type="submit" disabled={blocked} aria-describedby={describedBy}>
          {sendLabel}
        </Button>
      </div>
      </div>
      {reasonLine}
    </form>
  );
}
