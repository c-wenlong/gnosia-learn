import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

import { buttonClasses, type ButtonSize, type ButtonVariant } from "./classes";

/**
 * Kit `Btn`. One primary per region (DESIGN.md, "Components").
 *
 * - `primary`: the 3D pill, black face in light and near-white in dark.
 * - `secondary`: a 2px outlined pill.
 * - `ghost`: accent text, no box. "Why?", "See all".
 * - `ok`, `warn`: the coloured 3D continue on a feedback footer.
 * - `accent`: the blue 3D pill, for the rare place black would compete.
 *
 * Renders a `<Link>` when given `href`, a `<button type="button">` otherwise.
 * No hooks, so it is safe in a server component; an `onClick` makes the
 * caller a client component, as usual.
 */
interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width of the container. */
  block?: boolean;
  className?: string;
  children: ReactNode;
}

export type ButtonAsButton = ButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & { href?: undefined };

export type ButtonAsLink = ButtonOwnProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href"> & {
    href: string;
    /** Passed to `next/link`. */
    prefetch?: boolean;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { variant, size, block, className, children, href, ...rest } = props;
    return (
      <Link href={href} className={buttonClasses({ variant, size, block, className })} {...rest}>
        {children}
      </Link>
    );
  }
  const { variant, size, block, className, children, type = "button", ...rest } = props;
  return (
    <button type={type} className={buttonClasses({ variant, size, block, className })} {...rest}>
      {children}
    </button>
  );
}
