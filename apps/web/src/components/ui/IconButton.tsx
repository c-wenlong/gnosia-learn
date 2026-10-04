import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";

import { iconButtonClasses, type IconButtonShape, type IconButtonSize, type IconButtonTone } from "./classes";

/**
 * Kit icon button: one glyph in a 24 to 40px box, for a control whose mark
 * says what it does (close, expand, the sidebar's fold, a chip's remove, the
 * box composer's Send, the video player's controls).
 *
 * `label` is required and is both the `aria-label` and the `title`, so the
 * screen reader and the pointer's tooltip say the same words. A caller may
 * pass a different `title` where the tooltip should say more (why a remove
 * is unavailable). `pressed` makes it a toggle (`aria-pressed`), which keeps
 * one label whatever its state, as ARIA asks of a toggle.
 *
 * Renders a `<Link>` when given `href`, a `<button type="button">` otherwise.
 * No state and no hooks, so it is safe in a server component; an `onClick`
 * makes the caller a client component, as usual. The classes are
 * `iconButtonClasses` in `classes.ts`, for a caller that renders its own
 * element (the studio's panel links).
 */
interface IconButtonOwnProps {
  /** What it does: the accessible name and the tooltip. */
  label: string;
  /** xs 24, sm 28, md 32, lg 36 (the default), xl 40. */
  size?: IconButtonSize;
  shape?: IconButtonShape;
  tone?: IconButtonTone;
  /** The focus ring on the edge rather than 2px out, for a button against its container's edge. */
  inset?: boolean;
  /** A 44px target under a finger, the face keeping its size. */
  touch?: boolean;
  className?: string;
  children: ReactNode;
}

export type IconButtonAsButton = IconButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "aria-label" | "aria-pressed"> & {
    href?: undefined;
    /** Set for a toggle, so it is announced as one. */
    pressed?: boolean;
    ref?: Ref<HTMLButtonElement>;
  };

export type IconButtonAsLink = IconButtonOwnProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href" | "aria-label"> & {
    href: string;
    /** Passed to `next/link`. */
    prefetch?: boolean;
    pressed?: never;
    ref?: Ref<HTMLAnchorElement>;
  };

export type IconButtonProps = IconButtonAsButton | IconButtonAsLink;

export function IconButton(props: IconButtonProps) {
  if (props.href !== undefined) {
    const { label, size, shape, tone, inset, touch, className, children, href, ...rest } = props;
    return (
      <Link
        href={href}
        aria-label={label}
        title={label}
        className={iconButtonClasses({ size, shape, tone, inset, touch, className })}
        {...rest}
      >
        {children}
      </Link>
    );
  }
  const { label, size, shape, tone, inset, touch, className, children, pressed, type = "button", ...rest } = props;
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={iconButtonClasses({ size, shape, tone, inset, touch, className })}
      {...rest}
    >
      {children}
    </button>
  );
}
