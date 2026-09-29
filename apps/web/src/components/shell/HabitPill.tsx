"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cx, PILL } from "@/components/ui/classes";

/**
 * A top-bar stat pill that is a button: pressing it, by tap, click or key,
 * opens a small popover with the facts behind the number ("Studied today.",
 * "1 free miss left this week."). Those facts used to be a `title` tooltip on
 * a plain span, which a phone or a keyboard could not reach, and since
 * Today's Streak card went (2026-09-29) the pill is the only place they show.
 *
 * The same disclosure as `AvatarMenu`: `aria-expanded` on the button, closed
 * by Escape, a press outside, pressing it again, or focus moving to something
 * outside the pill and its popover (Tab away). Escape gives focus back to the
 * pill only when focus was inside it; pressed while the reader is somewhere
 * else on the page, it closes the popover and leaves focus where it is.
 * Its accessible name is `name`, the pill's text followed by the facts, so a
 * screen reader hears them without opening it.
 */
export function HabitPill({
  dot,
  name,
  details,
  children,
}: {
  /** The stat's colour, a CSS value such as `var(--streak)`. */
  dot: string;
  /** The accessible name: what the pill shows, then the facts. */
  name: string;
  /** One line each in the popover. */
  details: readonly string[];
  /** What the pill shows. Optional in the type only so a test can pass it positionally. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        if (root.current?.contains(document.activeElement)) button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className="relative"
      // Focus leaving for an element outside closes it. A null `relatedTarget`
      // (a press on the popover's own text, or on the page) is left to the
      // pointer handler, which knows whether the press was inside.
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label={name}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          PILL,
          "transition-colors duration-100 hover:border-text3",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
      >
        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: dot }} />
        {children}
      </button>
      {open && (
        <div
          id={id}
          className="absolute top-full right-0 z-40 mt-2 flex w-60 flex-col gap-1 rounded-2xl border-2 border-border bg-surface px-3.5 py-3"
        >
          {details.map((line) => (
            <p key={line} className="text-[13px] leading-snug text-text2">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
