import Link from "next/link";
import type { ReactNode } from "react";

import { BANNER_MARK, bannerClasses, cx, linkClasses, type BannerTone } from "./classes";
import { TextLink } from "./TextLink";

/**
 * Kit `Banner`: a full-width strip across the top of a region, for a state
 * the whole region is in while it still works (the database is down, a write
 * did not land, a build is stale) or for the answer to what a person just
 * pressed. Never a wall: a region that cannot work at all shows a `Notice`
 * instead, and a box inside the flow is a `Callout`.
 *
 * `onDismiss` puts a Dismiss button at the right; `dismissHref` a Dismiss
 * link, for a message a server render carries in its URL (the link drops it
 * without scrolling). Neither, and it stays until its state does.
 *
 * `role` is `status` by default. A caller that announces its words some other
 * way (the store banner's `sr-only` line, which is in the page while the
 * banner itself is inert) passes `none` and hides its words from the reader.
 * The padding is the region's gutter, so a caller whose page has a wider one
 * passes it in `className`. No state and no hooks; `onDismiss` makes the
 * caller a client component, as usual.
 */
export function Banner({
  tone = "warn",
  role = "status",
  onDismiss,
  dismissHref,
  dismissLabel = "Dismiss",
  dismissAriaLabel,
  className,
  children,
}: {
  tone?: BannerTone;
  role?: "status" | "alert" | "none";
  onDismiss?: () => void;
  dismissHref?: string;
  /** The words of the Dismiss control. */
  dismissLabel?: string;
  /** Its accessible name, where "Dismiss" alone would not say what goes. */
  dismissAriaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role={role === "none" ? undefined : role} className={bannerClasses({ tone, className })}>
      <span aria-hidden className={cx("mt-1.5 size-2 shrink-0 rounded-full", BANNER_MARK[tone])} />
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onDismiss !== undefined ? (
        <TextLink onClick={onDismiss} aria-label={dismissAriaLabel} tone="inherit" weight="semibold" className="shrink-0">
          {dismissLabel}
        </TextLink>
      ) : dismissHref !== undefined ? (
        <Link
          href={dismissHref}
          scroll={false}
          aria-label={dismissAriaLabel}
          className={linkClasses({ tone: "inherit", weight: "semibold", className: "shrink-0" })}
        >
          {dismissLabel}
        </Link>
      ) : null}
    </div>
  );
}
