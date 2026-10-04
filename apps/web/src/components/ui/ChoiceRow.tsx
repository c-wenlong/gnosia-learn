import type { ReactNode } from "react";

import { cx } from "./classes";

/**
 * Kit `Option`, after Duolingo's choice row: a 56px row with a keyboard-number
 * badge, radius 12, 2px border. Four states, the kit's colours on Brilliant's
 * tokens:
 *
 * | state      | ground        | border and text          | tag              |
 * | ---------- | ------------- | ------------------------ | ---------------- |
 * | `idle`     | `--surface`   | `--border`, `--text`     |                  |
 * | `selected` | `--tint`      | `--accent`, `--text`     |                  |
 * | `correct`  | `--ok-tint`   | `--ok-text`              | "correct answer" |
 * | `wrong`    | `--warn-tint` | `--warn-text`            | "your answer"    |
 *
 * "Not quite" is yellow, never red (DESIGN.md, the feedback footer). Graded
 * rows are recoloured in place rather than replaced, so the learner sees their
 * pick and the right one side by side. A graded row is disabled; the choice is
 * made.
 */
export type ChoiceState = "idle" | "selected" | "correct" | "wrong";

const STATE: Record<ChoiceState, string> = {
  idle: "border-border bg-surface text-text hover:bg-surface2",
  selected: "border-accent bg-tint text-text",
  correct: "border-ok-text bg-ok-tint text-ok-text",
  wrong: "border-warn-text bg-warn-tint text-warn-text",
};

const TAG: Partial<Record<ChoiceState, string>> = {
  correct: "correct answer",
  wrong: "your answer",
};

export function ChoiceRow({
  shortcut,
  state = "idle",
  disabled = false,
  onClick,
  className,
  children,
}: {
  /** The number key that picks it, shown in the badge ("1"). */
  shortcut?: string;
  state?: ChoiceState;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const tag = TAG[state];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-keyshortcuts={shortcut}
      aria-pressed={state === "selected" ? true : undefined}
      className={cx(
        "flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-3.5 py-2 text-left transition-colors duration-100",
        "disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        STATE[state],
        className,
      )}
    >
      {shortcut !== undefined && (
        <span
          aria-hidden
          className="flex size-[26px] shrink-0 items-center justify-center rounded-md border-2 border-border text-[12px] font-bold text-text3"
        >
          {shortcut}
        </span>
      )}
      <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug">{children}</span>
      {tag !== undefined && (
        <span className="shrink-0 animate-fade-in text-[12px] font-medium motion-reduce:animate-none">{tag}</span>
      )}
    </button>
  );
}
