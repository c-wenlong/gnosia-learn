import Link from "next/link";
import { useId, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";

import { buttonClasses, cx, type ButtonSize, type ButtonVariant } from "./classes";

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
 * A link has no disabled state: an anchor marked `aria-disabled` still
 * navigates, so a caller with nothing to link to renders a disabled button.
 *
 * `disabledReason` says why a disabled button is disabled, as 12px secondary
 * text beside it (wrapping under it when the row has no room), tied to the
 * button with `aria-describedby`. Use it rather than a `title`: a disabled
 * button takes no focus, so a keyboard or touch user never sees a tooltip.
 * Leave it off when the reason is already on screen next to the button.
 *
 * No state or effects, so it is safe in a server component. The reason's id
 * comes from `useId`, the one hook React allows there; an `onClick` makes the
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
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
    /** Why it is disabled, shown beside it. Ignored unless `disabled`. */
    disabledReason?: string;
  };

export type ButtonAsLink = ButtonOwnProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href"> & {
    href: string;
    /** Passed to `next/link`. */
    prefetch?: boolean;
    disabledReason?: never;
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
  const { disabledReason, ...rest } = props;
  if (rest.disabled && disabledReason) return <ReasonedButton {...rest} reason={disabledReason} />;
  return <PlainButton {...rest} />;
}

type PlainButtonProps = Omit<ButtonAsButton, "disabledReason">;

function PlainButton({ variant, size, block, className, children, type = "button", ...rest }: PlainButtonProps) {
  return (
    <button type={type} className={buttonClasses({ variant, size, block, className })} {...rest}>
      {children}
    </button>
  );
}

/** A disabled button with its reason beside it; the pair wraps as one unit. */
function ReasonedButton({ reason, "aria-describedby": describedBy, ...rest }: PlainButtonProps & { reason: string }) {
  const id = useId();
  return (
    <span className={cx(rest.block ? "flex w-full" : "inline-flex max-w-full", "flex-wrap items-center gap-x-2 gap-y-1")}>
      <PlainButton {...rest} aria-describedby={cx(describedBy, id)} />
      <span id={id} className="min-w-0 text-[12px] leading-4 text-text2">
        {reason}
      </span>
    </span>
  );
}
