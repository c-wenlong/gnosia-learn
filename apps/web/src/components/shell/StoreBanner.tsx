"use client";

import { useState } from "react";

import { Collapse } from "@/components/ui/Collapse";
import { TextLink } from "@/components/ui/TextLink";
import { useLearner } from "@/lib/learner-context";

/**
 * The one place a failed write is visible.
 *
 * Progress used to be saved in the browser, where the only failure was a full
 * quota. It is a database now, and a database can be down, so the shell
 * carries two states: the snapshot the server rendered was empty because it
 * could not ask, and the last change the learner made did not land. Both are
 * said in words rather than left to be inferred from a bar that reads zero.
 *
 * The text is `--text`, not `--warn-text`: the yellow on its own tint is under
 * 3:1 in the light theme, fine for a two-word verdict and not for a sentence.
 *
 * It slides down over the page and back up (`Collapse`) rather than shoving
 * the page in a frame, keeping its last words while it folds away. A screen
 * reader hears an `sr-only` status line that is always in the page, so the
 * words are announced when they appear even though the banner itself is
 * inert while shut. Dismiss puts focus on the page's main region, since the
 * button that had it folds away.
 */
export function StoreBanner() {
  const { reachable, saveError, dismissSaveError } = useLearner();
  const message = saveError ?? (reachable ? null : "Not connected to the database. Nothing you change here will be saved.");
  const dismissable = saveError !== null;

  const [last, setLast] = useState<{ message: string; dismissable: boolean } | null>(
    message === null ? null : { message, dismissable },
  );
  if (message !== null && (last === null || last.message !== message || last.dismissable !== dismissable)) {
    setLast({ message, dismissable });
  }
  const shown = message !== null ? { message, dismissable } : last;

  const dismiss = () => {
    dismissSaveError();
    // The page's main region, made focusable for the purpose if it is not.
    const main = document.querySelector<HTMLElement>("main");
    if (main === null) return;
    if (!main.hasAttribute("tabindex")) {
      main.setAttribute("tabindex", "-1");
      main.style.outline = "none";
    }
    main.focus({ preventScroll: true });
  };

  return (
    <>
      <p role="status" className="sr-only">
        {message ?? ""}
      </p>
      <Collapse open={message !== null}>
        {shown !== null && (
          <div className="flex items-start gap-3 border-b-2 border-warn bg-warn-tint px-4 py-2 text-sm text-text md:px-7">
            <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-warn-lip" />
            <span aria-hidden className="min-w-0 flex-1">
              {shown.message}
            </span>
            {shown.dismissable && (
              <TextLink onClick={dismiss} aria-label="Dismiss this message" tone="inherit" weight="semibold" className="shrink-0">
                Dismiss
              </TextLink>
            )}
          </div>
        )}
      </Collapse>
    </>
  );
}
