import type { ReactNode } from "react";

import { CARD_TITLE, cardClasses, cx, type CardGap } from "./classes";
import { TextLink } from "./TextLink";

/**
 * Kit `Card`: the flat surface every dashboard block sits on. 2px `--border`,
 * radius 20, padding 20, no shadow. An optional title row carries a 16/700
 * title and an action at the right, usually a `CardAction` link.
 *
 * `flush` drops the padding and the gap and clips the children to the
 * corners, for a card whose content runs to its edges; `gap` sets the space
 * between children (`cardClasses` says why these are options, not classes).
 */
export function Card({
  title,
  action,
  tight = false,
  flush = false,
  gap,
  as: Tag = "section",
  className,
  children,
  ...rest
}: {
  title?: ReactNode;
  action?: ReactNode;
  /** Padding 14 instead of 20, for phone cards and dense grids. */
  tight?: boolean;
  /** No padding and no gap, the children clipped to the corners: the shell alone. */
  flush?: boolean;
  /** The space between children: 12 by default, none when `flush`. */
  gap?: CardGap;
  as?: "section" | "div" | "article" | "li";
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
  id?: string;
}) {
  return (
    <Tag className={cardClasses({ tight, flush, gap, className })} {...rest}>
      {(title !== undefined || action !== undefined) && (
        <div className="flex items-center gap-3">
          {title !== undefined && (
            <h2 className={cx(CARD_TITLE, "min-w-0 flex-1")}>{title}</h2>
          )}
          {action !== undefined && <div className="ml-auto shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}

/** The "See all" link at the right of a card's title row: a `TextLink` at 13px. */
export function CardAction({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <TextLink href={href} size="sm" className={className}>
      {children}
    </TextLink>
  );
}
