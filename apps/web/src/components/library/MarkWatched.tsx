"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { sendJson } from "@/lib/send-json";

type State = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "failed"; message: string };

/**
 * The asset page's primary action (hi-fi 11): append a `watched` event through
 * `POST /api/learner/watched`.
 *
 * `verb` is "watched" for a video and "read" for anything else; both write the
 * same event kind, because the log records that the learner spent time with
 * the asset and the difference is only the word on the button.
 *
 * **It calls `router.refresh()` after a write**, so the server-rendered "Last
 * watched" line picks up the new event.
 *
 * Pressing it again after a save appends again, which is honest (a second
 * viewing is a second event), so the button stays enabled and only its label
 * says the first one landed. The "Last watched" line stays visible after a
 * save: the refresh hands it the new day, so it confirms the write rather than
 * disappearing.
 */
export function MarkWatched({
  assetId,
  verb,
  lastWatchedDay,
}: {
  assetId: string;
  verb: "watched" | "read";
  /**
   * The day of the last `watched` event for this asset (`2026-09-26`), or null.
   * A day key made on the server in the app's time zone, not an instant, so
   * the server and the browser print the same text and hydration agrees.
   */
  lastWatchedDay: string | null;
}) {
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
    state.kind === "saving" ? "Saving…" : state.kind === "saved" ? `Marked ${verb}` : `Mark ${verb}`;

  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" onClick={mark} disabled={state.kind === "saving"} aria-live="polite">
        {label}
      </Button>
      {state.kind === "failed" ? (
        <p role="alert" className="text-[12px] text-danger">
          {state.message}
        </p>
      ) : lastWatchedDay !== null ? (
        <p className="text-[12px] text-text3">
          Last {verb} {lastWatchedDay}
        </p>
      ) : null}
    </div>
  );
}

