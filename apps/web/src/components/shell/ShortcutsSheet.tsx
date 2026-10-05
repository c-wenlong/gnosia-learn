"use client";

import { useId } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { DialogHeader } from "@/components/ui/DialogHeader";
import { NOTE } from "@/components/ui/classes";
import { shortcutsFor } from "@/lib/shortcuts";

import { ShortcutList, useIsMac } from "./ShortcutList";

/**
 * The shortcuts sheet: "?" or Cmd+/ anywhere outside a field opens it over
 * the page. A kit `Dialog` at its compact size, so it rises and fades in and
 * out as every dialog does (nothing moves under reduced motion), and Escape,
 * the backdrop or Close shut it. It lists the same table the Settings card
 * does (`ShortcutList`).
 */
export function ShortcutsSheet({ studio, closing, onClose }: { studio: boolean; closing: boolean; onClose: () => void }) {
  const mac = useIsMac();
  const title = useId();
  return (
    <Dialog labelledBy={title} onClose={onClose} closing={closing} size="compact">
      <DialogHeader title={<span id={title}>Keyboard shortcuts</span>} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-5">
        <ShortcutList shortcuts={shortcutsFor(studio)} mac={mac} />
        <p className={`${NOTE} pt-3`}>Only search works while you are typing in a field. The list is also in Settings, under General.</p>
      </div>
    </Dialog>
  );
}
