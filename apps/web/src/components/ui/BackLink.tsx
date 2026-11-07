import type { ReactNode } from "react";

import { cx } from "./classes";
import { TextLink } from "./TextLink";

/**
 * Kit `BackLink`: the way back to where a page was opened from, over its
 * content ("← Back to module", "← Library"). A 13px kit `TextLink` with the
 * arrow hidden from a screen reader, which would otherwise read it aloud
 * ("leftwards arrow, Back to module"); the words alone name the link.
 *
 * No state and no hooks, so a server component draws it.
 */
export function BackLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <TextLink href={href} size="sm" className={cx("self-start", className)}>
      <span aria-hidden="true">←</span> {children}
    </TextLink>
  );
}
