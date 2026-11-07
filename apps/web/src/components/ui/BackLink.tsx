import type { ReactNode } from "react";

import { Button } from "./Button";
import { cx } from "./classes";
import { Glyph } from "./Glyph";
import { TextLink } from "./TextLink";

/**
 * Kit `BackLink`: the way back to where a page was opened from. The one
 * back-navigation control, in two looks:
 *
 * - `text` (the default), over a page's content ("← Back to module",
 *   "← Library"): a 13px kit `TextLink` with the arrow hidden from a screen
 *   reader, which would otherwise read it aloud ("leftwards arrow, Back to
 *   module"); the words alone name the link.
 * - `toolbar`, first on a tool's strip (the studio canvas): a ghost kit
 *   `Button` at `xs` with the previous glyph, which the kit already hides
 *   from a screen reader. `label` names it in full where the visible word is
 *   short ("Studio", read as "Back to the studio").
 *
 * No state and no hooks, so a server component, and a loading frame drawn
 * before anything hydrates, can draw it.
 */
export function BackLink({
  href,
  variant = "text",
  label,
  className,
  children,
}: {
  href: string;
  variant?: "text" | "toolbar";
  /** The accessible name, when it says more than the visible words. */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  if (variant === "toolbar") {
    return (
      <Button href={href} variant="ghost" size="xs" aria-label={label} className={className}>
        <Glyph name="previous" size={16} className="-ml-0.5" />
        {children}
      </Button>
    );
  }
  return (
    <TextLink href={href} size="sm" aria-label={label} className={cx("self-start", className)}>
      <span aria-hidden="true">←</span> {children}
    </TextLink>
  );
}
