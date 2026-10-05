"use client";

import { useId, useRef, useState, type ReactNode } from "react";

import { AskButton } from "@/components/library/AssetActions";
import { AskPanel } from "@/components/library/AskPanel";
import { Collapse } from "@/components/ui/Collapse";

/**
 * A note's or a diagram's title row with Ask in it: the heading on the left,
 * the actions on the right with Ask among them, and the unsaved chat
 * (`AskPanel`) gliding open under the whole row. A client component only for
 * Ask's open state; the heading and the other actions arrive rendered from
 * the server page. A video draws its own row (`LibraryVideo`), since its Ask
 * also reads the player.
 */
export function AskableTitle({
  heading,
  before,
  after,
  assetId,
  subject,
}: {
  heading: ReactNode;
  /** Actions before Ask: Mark read, Favorite. */
  before?: ReactNode;
  /** Actions after Ask: Download, Add to note. */
  after?: ReactNode;
  assetId: string;
  subject: "note" | "diagram";
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ask = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {heading}
        <div className="flex shrink-0 flex-wrap items-start gap-2.5">
          {before}
          <AskButton
            open={open}
            onToggle={() => setOpen((was) => !was)}
            controls={id}
            subject={subject}
            buttonRef={ask}
          />
          {after}
        </div>
      </div>
      <Collapse open={open} id={id}>
        <div className="pt-1">
          <AskPanel
            assetId={assetId}
            subject={subject}
            open={open}
            onDismiss={() => {
              setOpen(false);
              ask.current?.focus();
            }}
          />
        </div>
      </Collapse>
    </div>
  );
}
