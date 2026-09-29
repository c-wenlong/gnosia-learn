import type { ReactNode } from "react";

import { cx } from "./classes";

/**
 * Kit `tutor` and `user` turns in the workspace chat (hi-fi 04).
 *
 * A tutor turn is bare prose, with its citation chips and its actions on one
 * row underneath: the thread reads as a document the tutor is writing, not a
 * column of bubbles. A learner turn is a tinted bubble at radius 20 on the
 * right, so the two voices are told apart by shape before anyone reads a word.
 * Both are server-safe; the chat that owns them is the client component.
 *
 * There is no visible speaker label. A chat has two parties and the shape
 * already says which turn is whose, so a "Tutor" or "Planner" line over every
 * reply only repeated it (removed 2026-09-29; AGENTS.md, "Sentence case, and
 * no label that repeats the page"). `label` still names the turn for a screen
 * reader, as the learner's bubble's hidden "You:" does.
 */
export function TutorMessage({
  children,
  cites,
  actions,
  label = "Tutor",
  className,
}: {
  children: ReactNode;
  /** `Cite` chips, left-aligned under the prose. */
  cites?: ReactNode;
  /** Ghost buttons, right-aligned on the same row. */
  actions?: ReactNode;
  /** Who is speaking, for a screen reader only. */
  label?: string;
  className?: string;
}) {
  return (
    <article aria-label={label} className={cx("flex min-w-0 flex-col gap-2 px-1.5", className)}>
      <div className="min-w-0 text-[15px] leading-6 text-text">{children}</div>
      {(cites || actions) && (
        <div className="flex flex-wrap items-center gap-2">
          {cites && <div className="flex min-w-0 flex-wrap items-center gap-2">{cites}</div>}
          {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
        </div>
      )}
    </article>
  );
}

export function UserMessage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex justify-end", className)}>
      <p className="max-w-[80%] rounded-[20px] bg-tint px-4 py-3 text-[15px] leading-6 break-words whitespace-pre-wrap text-text">
        <span className="sr-only">You: </span>
        {children}
      </p>
    </div>
  );
}
