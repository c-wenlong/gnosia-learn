"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";

import { usePanelHost } from "@/components/studio/panel-host";

/**
 * A link that opens, closes or swaps a panel on `/studio`: a `Link`, except
 * that a plain click `PanelHost` can serve moves the URL in the browser and
 * skips the server render (a second or more). A modified click (new tab,
 * new window) and anywhere without the host, the canvas route included, is
 * the `Link` it always was.
 *
 * With `panel`, a plain click opens that panel and `href` is only where a
 * modified click and a script-less page go: a video tile plays its preview
 * in place (`?play=`) and still opens the library page in a new tab.
 */
export function PanelLink({
  href,
  panel,
  onClick,
  ...rest
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string; panel?: string }) {
  const host = usePanelHost();
  return (
    <Link
      href={href}
      scroll={false}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || host === null) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
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
  return <div className={`${className} ${selected ? selectedClassName : idleClassName}`}>{children}</div>;
}
