"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";

import { usePanelHost } from "@/components/studio/panel-host";
import { cx } from "@/components/ui/classes";
import { isPlainClick } from "@/lib/plain-click";
import { browserMove } from "@/lib/studio-url";

/**
 * A link that opens, closes or swaps a panel on `/studio`: a `Link`, except
 * that a plain click `PanelHost` can serve moves the URL in the browser and
 * skips the server render (a second or more). A modified click (new tab,
 * new window) and anywhere without the host, the canvas route included, is
 * the `Link` it always was.
 *
 * With `panel`, a plain click opens that panel and `href` is only where a
 * modified click and a click before the page's scripts load go (with scripts
 * off the page never gets past its loading frame, so there is no tile to
 * press; see the notice in the `(app)` layout): a video tile plays its preview
 * in place (`?play=`) and still opens the library page in a new tab.
 *
 * A link the host serves is not prefetched. A `Link` in view asks the server
 * for its `href` (the page down to its loading boundary, again on a hover and
 * again after every refresh), and the host never uses the answer: it draws the
 * panel from what the page already sent. Three video tiles cost nine requests
 * a load for library pages a plain press never opens, and the filter links
 * more after each `RenewLists` refresh. A link the host hands back, and every
 * link outside it, prefetches as a `Link` does.
 */
export function PanelLink({
  href,
  panel,
  onClick,
  ...rest
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string; panel?: string }) {
  const host = usePanelHost();
  // The host's path rather than the address bar, which the server does not have.
  const served = host !== null && browserMove(host.path, panel ?? href);
  return (
    <Link
      href={href}
      scroll={false}
      {...rest}
      prefetch={served ? false : rest.prefetch}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || host === null) return;
        if (!isPlainClick(event)) return;
        if (host.navigate(panel ?? href)) event.preventDefault();
      }}
    />
  );
}

/**
 * A tile's frame, marked while its panel is open. Read from the address bar
 * rather than handed down by the server, since a tile's panel opens and closes
 * without the page being drawn again.
 */
export function SelectableFrame({
  name,
  className,
  selectedClassName,
  idleClassName,
  children,
}: {
  name: string;
  className: string;
  selectedClassName: string;
  idleClassName: string;
  children: ReactNode;
}) {
  const selected = useSearchParams().get("sel") === name;
  return <div className={cx(className, selected ? selectedClassName : idleClassName)}>{children}</div>;
}
