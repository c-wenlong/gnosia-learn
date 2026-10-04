import type { ReactNode } from "react";

import { cardClasses, cx } from "./classes";

/**
 * Kit `Notice`: a state a page or a region says once, in place of the content
 * it cannot show: the catalog is unreachable or empty, a filter matches
 * nothing, a canvas will not start, the page does not exist. A `Card` with a
 * heading, a sentence or two, the command or setting that fixes it (printed
 * so it can be copied, every character selected on a click), and the actions
 * that move on from it.
 *
 * `command` is one thing to run; `commands` several, one block each. A
 * command keeps its own line breaks, so a long one can be written over lines
 * with `\`. `dense` is the narrow form for a region rather than a page (the
 * studio's): the tight card and 14px heading. `level` is the heading's level,
 * 2 by default; a notice that replaces a whole region with no heading of its
 * own above it takes 1. No state and no hooks, so a server component draws it.
 */
export function Notice({
  title,
  command,
  commands,
  role,
  actions,
  dense = false,
  level = 2,
  className,
  children,
}: {
  title: ReactNode;
  /** The exact thing to run or set. Rendered as code. */
  command?: string;
  /** Several, each its own block. */
  commands?: readonly string[];
  role?: "status" | "alert";
  /** Buttons or links in a row at the foot. */
  actions?: ReactNode;
  dense?: boolean;
  level?: 1 | 2 | 3;
  className?: string;
  children?: ReactNode;
}) {
  const Heading = `h${level}` as const;
  const lines = [...(command === undefined ? [] : [command]), ...(commands ?? [])];
  return (
    <section role={role} className={cardClasses({ tight: dense, className: cx("items-start", className) })}>
      <Heading className={cx("font-bold text-text", dense ? "text-[14px] leading-5" : "text-[16px] leading-snug")}>
        {title}
      </Heading>
      {children !== undefined && children !== null && children !== false && (
        <div className={cx("min-w-0 max-w-prose text-text2", dense ? "text-[13px] leading-5" : "text-[14px] leading-relaxed")}>
          {children}
        </div>
      )}
      {lines.length > 0 && (
        <div className="flex max-w-full flex-col items-start gap-1.5">
          {lines.map((line) => (
            <code
              key={line}
              className="max-w-full overflow-x-auto whitespace-pre rounded-lg bg-surface2 px-3 py-1.5 font-mono text-[12px] leading-relaxed text-text select-all"
            >
              {line}
            </code>
          ))}
        </div>
      )}
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </section>
  );
}
