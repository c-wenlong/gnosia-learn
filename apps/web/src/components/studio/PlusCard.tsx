"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { cx } from "@/components/ui/classes";
import { createDraft, idempotencyKey } from "@/lib/studio-drafts";
import { panelHref } from "@/lib/studio-view";

/**
 * Start a conversation: `POST /api/drafts`, then open it in the panel.
 *
 * Shared by the plus card, the panel's New diagram after a job, and Start
 * over, so there is one way a draft begins. The panel's other parameters are
 * dropped on the way: a new conversation is not about the job or the tile
 * that was open.
 */
export function useStartDraft(path: string): {
  start: () => Promise<void>;
  busy: boolean;
  error: string | null;
} {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await createDraft({ idempotencyKey: idempotencyKey("draft") });
    if (!result.ok) {
      setBusy(false);
      setError(result.refusal.error);
      return;
    }
    router.push(
      panelHref(path, { draft: result.data.draftId, job: null, brief: null, selected: null, shot: null }),
      { scroll: false },
    );
    setBusy(false);
  }

  return { start, busy, error };
}

/**
 * The grid's first tile, and the one way into a new diagram (D31).
 *
 * `DiagramTile`'s 4:3 frame and radius with a dashed border, a 40px plus in
 * `--text3`, and "New diagram" in the title role under it. A `<button>`, so it
 * is first in the tab order, and the grid keeps it under any filter.
 */
export function PlusCard({ path, layout = "grid" }: { path: string; layout?: "grid" | "list" }) {
  const { start, busy, error } = useStartDraft(path);

  if (layout === "list") {
    return (
      <div>
        <button
          type="button"
          data-studio-plus
          onClick={() => void start()}
          disabled={busy}
          aria-describedby={error === null ? undefined : "studio-plus-error"}
          className={cx(
            "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-text2",
            "transition-colors hover:bg-surface2 hover:text-text disabled:cursor-progress disabled:opacity-70",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          )}
        >
          <span className="flex h-6 w-12 shrink-0 items-center justify-center rounded border border-dashed border-border text-text3">
            <PlusGlyph className="h-3.5 w-3.5" />
          </span>
          {busy ? "Opening a conversation…" : "New diagram"}
        </button>
        {error !== null && (
          <p id="studio-plus-error" role="alert" className="px-2 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-studio-plus
      onClick={() => void start()}
      disabled={busy}
      aria-describedby={error === null ? undefined : "studio-plus-error"}
      className={cx(
        "group flex min-w-0 flex-col overflow-hidden rounded-xl border-2 border-dashed border-border bg-transparent text-left",
        "transition-colors duration-100 hover:border-accent hover:bg-surface disabled:cursor-progress",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      )}
    >
      <span className="flex aspect-[4/3] w-full items-center justify-center">
        <span
          className={cx(
            "flex h-16 w-16 items-center justify-center rounded-full bg-surface2 text-text3 transition-colors",
            "group-hover:bg-accent group-hover:text-white",
            busy && "animate-pulse",
          )}
        >
          <PlusGlyph className="h-10 w-10" />
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-3 pb-3">
        <span className="text-sm font-semibold text-text">{busy ? "Opening a conversation…" : "New diagram"}</span>
        {error === null ? (
          <span className="text-xs text-text3">Say what it should show. The planner writes the brief.</span>
        ) : (
          <span id="studio-plus-error" role="alert" className="text-xs text-danger">
            {error}
          </span>
        )}
      </span>
    </button>
  );
}

function PlusGlyph({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 40 40" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M20 9v22M9 20h22" />
    </svg>
  );
}
