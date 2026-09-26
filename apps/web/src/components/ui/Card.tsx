import Link from "next/link";
import type { ReactNode } from "react";

import { cardClasses, cx } from "./classes";

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
            <h2 className="min-w-0 flex-1 text-[16px] font-bold leading-snug text-text">{title}</h2>
          )}
          {action !== undefined && <div className="ml-auto shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}

/** The "See all" link at the right of a card's title row. */
export function CardAction({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "rounded-sm text-[13px] font-medium text-accent-text underline-offset-4 hover:underline",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      {children}
    </Link>
  );
}
