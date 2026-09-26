"use client";

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
 */
export function StoreBanner() {
  const { reachable, saveError, dismissSaveError } = useLearner();
  if (saveError === null && reachable) return null;

  const message = saveError ?? "Not connected to the database. Nothing you change here will be saved.";
  return (
    <div role="status" className="flex items-start gap-3 border-b-2 border-warn bg-warn-tint px-4 py-2 text-sm text-text md:px-7">
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-warn-lip" />
      <span className="min-w-0 flex-1">{message}</span>
      {saveError !== null && (
        <button type="button" onClick={dismissSaveError} className="shrink-0 font-semibold underline underline-offset-2">
          Dismiss
        </button>
      )}
    </div>
  );
}
