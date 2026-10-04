import type { ReactNode } from "react";

import { CARD_TITLE, cardClasses, cx } from "./classes";
import { TextLink } from "./TextLink";

/**
 * Kit `Card`: the flat surface every dashboard block sits on. 2px `--border`,
 * radius 20, padding 20, no shadow. An optional title row carries a 16/700
 * title and an action at the right, usually a `CardAction` link.
 */
export function Card({
  title,
  action,
  tight = false,
  as: Tag = "section",
  className,
  children,
  ...rest
}: {
  title?: ReactNode;
  action?: ReactNode;
  /** Padding 14 instead of 20, for phone cards and dense grids. */
  tight?: boolean;
  as?: "section" | "div" | "article" | "li";
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
  id?: string;
}) {
  return (
    <Tag className={cardClasses({ tight, className })} {...rest}>
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
