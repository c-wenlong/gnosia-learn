"use client";

import { useId, useState, type ReactNode } from "react";

import { Collapse } from "@/components/ui/Collapse";

/**
 * "Read the whole note" in the workspace's left panel: a button and a
 * `Collapse`, so the note glides open and shut rather than snapping as a
 * `<details>` does. The note itself is rendered on the server and arrives as
 * `children`. It mounts on the first open and then stays, `inert` while shut:
 * a shut `<details>` never laid its content out, so a lazy diagram or video
 * in the note was not fetched until it was opened, and a note nobody opens
 * should still cost nothing.
 */
export function NoteDisclosure({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((was) => !was);
          setOpened(true);
        }}
        className="self-start rounded-sm text-left text-[13px] font-medium text-accent-text underline-offset-4 select-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {open ? "Hide the note" : "Read the whole note"}
      </button>
      <Collapse open={open} id={id}>
        {opened && children}
      </Collapse>
    </div>
  );
}
