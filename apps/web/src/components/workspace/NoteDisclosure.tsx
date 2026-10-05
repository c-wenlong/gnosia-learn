"use client";

import { useId, useRef, useState, type ReactNode } from "react";

import { cx, linkClasses } from "@/components/ui/classes";
import { Collapse } from "@/components/ui/Collapse";
import { useHydrated } from "@/lib/use-hydrated";

/** A text link, as a `<summary>` before hydration and a `<button>` after. */
const TOGGLE = linkClasses({ size: "sm", className: "self-start text-left select-none" });

/**
 * "Read the whole note" in the workspace's left panel: a button and a
 * `Collapse`, so the note glides open and shut rather than snapping as a
 * `<details>` does. The note itself is rendered on the server and arrives as
 * `children`.
 *
 * The page arrives as a native `<details>`, so the note can be read on a page
 * whose script never runs, and the button takes its place once the script
 * has. From then the note mounts on the first open and stays, `inert` while
 * shut: a shut `<details>` never laid its content out, so a lazy diagram or
 * video in the note was not fetched until it was opened, and a note nobody
 * opens should still cost nothing. A `<details>` opened before the script
 * ran stays open.
 */
export function NoteDisclosure({ children }: { children: ReactNode }) {
  // False on the server and while hydrating, so the page's `<details>` hydrates as it was sent.
  const enhanced = useHydrated();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  /** The page's `<summary>` had the focus when the button replaced it: the button takes it on. */
  const focusToggle = useRef(false);
  const id = useId();

  if (!enhanced) {
    return (
      <details
        // Hydration attaches this before the button replaces it: a note opened
        // before then stays open, and a focused summary hands its focus on.
        ref={(element) => {
          if (element === null) return;
          focusToggle.current = element.contains(document.activeElement);
          if (element.open) {
            setOpen(true);
            setOpened(true);
          }
        }}
        className="group"
      >
        <summary className={cx(TOGGLE, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
          <span className="group-open:hidden">Read the whole note</span>
          <span className="hidden group-open:inline">Hide the note</span>
        </summary>
        {children}
      </details>
    );
  }

  return (
    <div className="flex flex-col">
      <button
        ref={(button) => {
          if (button === null || !focusToggle.current) return;
          focusToggle.current = false;
          button.focus();
        }}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((was) => !was);
          setOpened(true);
        }}
        className={TOGGLE}
      >
        {open ? "Hide the note" : "Read the whole note"}
      </button>
      <Collapse open={open} id={id}>
        {opened && children}
      </Collapse>
    </div>
  );
}
