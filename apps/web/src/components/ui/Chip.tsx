import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";

import { chipClasses, type ChipSize } from "./classes";

/**
 * Kit `Chip`: filter, suggestion and label chips. A pill with a 1px border;
 * `active` fills it with the accent.
 *
 * With `href` it is a link, with `onClick` a toggle button (`aria-pressed`
 * says whether it is on), and with neither a plain label.
 */
export function Chip({
  active = false,
  size = "md",
  href,
  onClick,
  title,
  className,
  children,
}: {
  active?: boolean;
  size?: ChipSize;
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
        className={chipClasses({ active, size, className })}
      >
        {children}
      </Link>
    );
  }
  if (onClick !== undefined) {
    return (
      <button type="button" onClick={onClick} title={title} aria-pressed={active} className={chipClasses({ active, size, className })}>
        {children}
      </button>
    );
  }
  return (
    <span title={title} className={chipClasses({ active, size, interactive: false, className })}>
      {children}
    </span>
  );
}
