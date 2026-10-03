"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

/**
 * The strip's popover: a `<details>`, so it still opens with no JavaScript,
 * plus the three things a `<details>` does not do on its own.
 *
 * It closes when an option is chosen. Choosing one is a client navigation,
 * and React keeps the element, so the menu used to stay open over the grid
 * it had just changed, which read as nothing having happened.
 * It closes on a press outside it and on Escape.
 * And one is open at a time: every popover on the strip shares a `name`, which
 * makes the browser close the others (an exclusive accordion), so Display and
 * Sort can no longer be open over each other.
 */
export function MenuPopover({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = ref.current;
    if (details === null) return;
    function onPointerDown(event: PointerEvent) {
      if (details!.open && !details!.contains(event.target as Node)) details!.open = false;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !details!.open) return;
      details!.open = false;
      details!.querySelector("summary")?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function onChoose(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as Element).closest("a") !== null && ref.current !== null) ref.current.open = false;
  }

  return (
    <details ref={ref} name="studio-menu" className="relative shrink-0">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium transition-colors hover:bg-[var(--surface-hover)] [&::-webkit-details-marker]:hidden">
        {label}
        <span aria-hidden className="text-[var(--muted)]">
          ▾
        </span>
      </summary>
      <div
        onClick={onChoose}
        className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 shadow-lg"
      >
        {children}
      </div>
    </details>
  );
}
