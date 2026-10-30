"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { cx, STATUS_TEXT } from "@/components/ui/classes";
import { sendJson } from "@/lib/send-json";

type State = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "failed"; message: string };

/**
 * The asset page's primary action for anything but a video (hi-fi 11),
 * "Mark read": append a `watched` event through `POST /api/learner/watched`.
 * A video records its own progress as it plays and has no such button; the
 * event kind is the same, since the log records that the learner spent time
 * with the asset and the difference is only the word.
 *
 * **It calls `router.refresh()` after a write**, so the server-rendered
 * "Read" line in the page's Details picks up the new event.
 *
 * Pressing it again after a save appends again, which is honest (a second
 * reading is a second event), so the button stays enabled and only its label
 * says the first one landed.
 */
export function MarkWatched({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function mark() {
    setState({ kind: "saving" });
    const reply = await sendJson<{ ok?: boolean; error?: string }>("POST", "/api/learner/watched", { assetId });
    if (reply === null) {
      setState({ kind: "failed", message: "Not saved: the server could not be reached." });
      return;
    }
    if (!reply.ok || reply.data.ok === false) {
      setState({ kind: "failed", message: reply.data.error ?? `Not saved (HTTP ${reply.status}).` });
      return;
    }
    setState({ kind: "saved" });
    router.refresh();
  }

  const label =
    state.kind === "saving" ? "Saving…" : state.kind === "saved" ? "Marked read" : "Mark read";

  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" onClick={mark} disabled={state.kind === "saving"} aria-live="polite">
        {label}
      </Button>
      {state.kind === "failed" && (
        <p role="alert" className={cx(STATUS_TEXT, "text-danger")}>
          {state.message}
        </p>
      )}
    </div>
  );
}

