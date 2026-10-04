import type { ReactNode } from "react";

import { badgeClasses, type BadgeTone } from "./classes";

/**
 * Kit `Badge`: a short label in a tone, never a control. A topic, a job's
 * state, a cost, a warning such as "No topic" or "SVG stale". A label that
 * can be pressed is a `Chip`; a status a whole region is in is a `Banner`.
 *
 * The words sit in a `truncate` span, so a long slug in a crowded row ends in
 * an ellipsis rather than pushing the row wider; `title` can carry the whole
 * of it, or say more (what a cost figure means). No state and no hooks, so it
 * is safe in a server component.
 */
export function Badge({
  tone = "muted",
  title,
  className,
  children,
}: {
  /** `muted` (the default), `accent`, `warn`, `danger` or `ok`. */
  tone?: BadgeTone;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span title={title} className={badgeClasses({ tone, className })}>
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
