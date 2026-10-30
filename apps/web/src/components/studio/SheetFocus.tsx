"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A sheet a link opens on the canvas route (the inspector below 1024px): focus
 * moves into it when it opens, so a keyboard or screen-reader user lands on
 * it rather than on the menu button behind it, and goes back to `returnTo`
 * when it closes, if that is on screen. A leaf, so the page stays a server
 * component.
 */
export function SheetFocus({
  label,
  returnTo,
  className,
  children,
}: {
  label: string;
  /** A selector for where focus goes back to on close: the button that opened it. */
  returnTo: string;
  className?: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    box.current?.focus();
    return () => {
      const back = document.querySelector<HTMLElement>(returnTo);
      // Not to a button hidden at this width: nothing would be focused at all.
      if (back !== null && back.getClientRects().length > 0) back.focus();
    };
  }, [returnTo]);
  return (
    <div ref={box} tabIndex={-1} role="group" aria-label={label} className={className}>
      {children}
    </div>
  );
}
