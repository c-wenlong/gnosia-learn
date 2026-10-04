import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";

import { chipClasses, type ChipSize, type ChipTone } from "./classes";

/**
 * Kit `Chip`: filter, suggestion and label chips. A pill with a 1px border;
 * `active` fills it with the accent (or, with `tone="tint"`, tints it).
 *
 * With `href` it is a link, with `onClick` a toggle button (`aria-pressed`
 * says whether it is on), and with neither a plain label. Only the toggle can
 * be `disabled`: a link has no disabled state (see `Button`).
 */
export function Chip({
  active = false,
  size = "md",
  tone = "accent",
  dashed = false,
  disabled = false,
  href,
  onClick,
  title,
  className,
  children,
}: {
  active?: boolean;
  size?: ChipSize;
  tone?: ChipTone;
  /** A dashed border and secondary text: the "add one" chip at the end of a list. */
  dashed?: boolean;
  /** The toggle only. Dimmed, and its hover stops. */
  disabled?: boolean;
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  if (href !== undefined) {
    return (
      <Link
        href={href}
        title={title}
        aria-current={active ? "page" : undefined}
        className={chipClasses({ active, size, tone, dashed, className })}
      >
        {children}
      </Link>
    );
  }
  if (onClick !== undefined) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-pressed={active}
        className={chipClasses({ active, size, tone, dashed, className })}
      >
        {children}
      </button>
    );
  }
  return (
    <span title={title} className={chipClasses({ active, size, tone, dashed, interactive: false, className })}>
      {children}
    </span>
  );
}
