import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";

import { linkClasses, type LinkSize, type LinkTone, type LinkWeight } from "./classes";

/**
 * Kit text link: words that go somewhere or do something, in a line of text
 * or beside a heading. One look for all three elements it can be:
 *
 * - with `href`, a `next/link` (an in-app link never reloads the page);
 * - with `href` and `external`, a plain `<a>` that opens in a new tab with
 *   `rel="noopener noreferrer"` (a raw file, a full-size picture);
 * - with neither, a `<button type="button">` ("Show older conversations",
 *   "Try again"), which can be `disabled`, or `pending` while what it started
 *   runs.
 *
 * Accent text by default, `muted` for a quiet one ("Keep it", "Exit"),
 * `danger` for a destructive one, `inherit` for one inside coloured text,
 * which is always underlined since its colour cannot mark it. The classes are
 * `linkClasses` in `classes.ts`. No state and no hooks.
 */
interface TextLinkOwnProps {
  tone?: LinkTone;
  /** The surrounding text's size by default; xs 12, sm 13, md 14. */
  size?: LinkSize;
  /** Medium by default. */
  weight?: LinkWeight;
  className?: string;
  children: ReactNode;
}

export type TextLinkAsButton = TextLinkOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
    external?: undefined;
    /** What it started is running: disabled, with the progress cursor, dimmed less. */
    pending?: boolean;
    ref?: Ref<HTMLButtonElement>;
  };

export type TextLinkAsLink = TextLinkOwnProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href"> & {
    href: string;
    /** A plain `<a>` opening in a new tab, for a file or a page outside the app. */
    external?: boolean;
    /** Passed to `next/link`. */
    prefetch?: boolean;
    pending?: never;
    ref?: Ref<HTMLAnchorElement>;
  };

export type TextLinkProps = TextLinkAsButton | TextLinkAsLink;

export function TextLink(props: TextLinkProps) {
  if (props.href !== undefined) {
    const { tone, size, weight, className, children, href, external = false, prefetch, ...rest } = props;
    const classes = linkClasses({ tone, size, weight, className });
    if (external) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} prefetch={prefetch} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  const { tone, size, weight, className, children, pending = false, type = "button", disabled, ...rest } = props;
  return (
    <button
      type={type}
      disabled={disabled || pending}
      className={linkClasses({ tone, size, weight, pending, className })}
      {...rest}
    >
      {children}
    </button>
  );
}
