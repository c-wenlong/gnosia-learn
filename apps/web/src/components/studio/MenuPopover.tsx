"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { isPlainClick } from "@/lib/plain-click";

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
  /**
   * Counts the openings, to key the panel by. A closed <details> keeps its
   * content in the page without drawing it, and a second opening does not
   * start a CSS animation again, so each opening gets a panel the browser
   * has never drawn. Counted on the summary's press, before the browser opens
   * it, so the new panel is there by the time it is shown.
   */
  const [openings, setOpenings] = useState(0);

  useEffect(() => {
    const details = ref.current;
    if (details === null) return;
    function onPointerDown(event: PointerEvent) {
      if (details!.open && !details!.contains(event.target as Node)) details!.open = false;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !details!.open) return;
      // Focus goes back to the button only from inside the menu; from anywhere
      // else it stays where the person put it.
      const inside = details!.contains(document.activeElement);
      details!.open = false;
      if (inside) details!.querySelector("summary")?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function onChoose(event: MouseEvent<HTMLDivElement>) {
    // A modified click opens the option in a new tab, and this one keeps its menu.
    if (!isPlainClick(event)) return;
    if ((event.target as Element).closest("a") !== null && ref.current !== null) ref.current.open = false;
  }

  return (
    <details ref={ref} name="studio-menu" className="group/menu relative shrink-0">
      <summary
        onClick={() => {
          if (ref.current !== null && !ref.current.open) setOpenings((count) => count + 1);
        }}
        className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium transition-colors hover:bg-[var(--surface-hover)] [&::-webkit-details-marker]:hidden"
      >
        {label}
        <span
          aria-hidden
          className="inline-block text-[var(--muted)] transition-transform duration-150 ease-soft group-open/menu:rotate-180 motion-reduce:transition-none"
        >
          ▾
        </span>
      </summary>
      {/* It pops in from its top right corner, where it hangs off the button. */}
      <div
        key={openings}
        onClick={onChoose}
        className="absolute right-0 z-30 mt-1 w-56 origin-top-right animate-pop-in rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 shadow-lg motion-reduce:animate-none"
      >
        {children}
      </div>
    </details>
  );
}
