"use client";

import { useState } from "react";

import { cx, STATUS_TEXT } from "./classes";
import { Collapse } from "./Collapse";

export type StatusTone = "muted" | "ok" | "danger";

const TONE: Record<StatusTone, string> = {
  muted: "text-text3",
  ok: "text-ok-text",
  danger: "text-danger",
};

/**
 * A one-line status under a control ("Saving…", "Saved", why it failed) that
 * glides in and out instead of pushing the page down at once.
 *
 * Two copies of the words, for two readers. A screen reader hears the
 * `aria-live` line, which is `sr-only` and always in the page, so it is never
 * inside an `inert` region and every change is announced as it was before.
 * The eye sees an `aria-hidden` copy in a `Collapse`, which keeps the last
 * words while it folds away, and fades each new message in.
 *
 * `text: null` is "nothing to say". `className` is for the visible line, such
 * as the space above it (`pt-3`), which folds away with it; put spacing here
 * rather than in the parent's `gap`, which would stay behind for a status
 * that is shut.
 */
export function LiveStatus({
  text,
  tone = "muted",
  className,
}: {
  text: string | null;
  tone?: StatusTone;
  className?: string;
}) {
  const [last, setLast] = useState<{ text: string; tone: StatusTone } | null>(
    text === null ? null : { text, tone },
  );
  if (text !== null && (last === null || last.text !== text || last.tone !== tone)) {
    setLast({ text, tone });
  }
  const shown = text !== null ? { text, tone } : last;
  return (
    <>
      <p aria-live="polite" className="sr-only">
        {text ?? ""}
      </p>
      <Collapse open={text !== null}>
        <p aria-hidden className={cx(STATUS_TEXT, className)}>
          {shown !== null && (
            <span key={`${shown.tone}:${shown.text}`} className={cx(TONE[shown.tone], "animate-fade-in motion-reduce:animate-none")}>
              {shown.text}
            </span>
          )}
        </p>
      </Collapse>
    </>
  );
}
