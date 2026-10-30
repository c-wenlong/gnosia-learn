"use client";

import { useEffect, useRef, useState } from "react";

import { Disclosure } from "@/components/ui/Disclosure";
import { useFollowFoot } from "@/components/ui/use-follow-foot";

/**
 * The raw log: collapsed, windowed, and opened by itself only on a failure.
 *
 * A9's bound, on the browser's side of it. `session.ndjson` is uncapped on disk
 * and is never sent whole to a page, so this asks for the total first and then
 * for the tail — two small requests rather than one that could be tens of
 * megabytes of agent transcript.
 */
export function JobLog({
  jobId,
  openByDefault,
  live,
}: {
  jobId: string;
  openByDefault: boolean;
  /** Whether there is any more log to come. A finished job is read once. */
  live: boolean;
}) {
  /**
   * Open is the default until somebody says otherwise about *this* job.
   *
   * Stored as the choice plus the job it was made about, rather than as a
   * boolean an effect resets when the default changes: an effect that assigns
   * state is a cascading render, and the question "has anyone overridden this?"
   * is one a render can answer.
   */
  const [choice, setChoice] = useState<{ job: string; open: boolean } | null>(null);
  const open = choice !== null && choice.job === jobId ? choice.open : openByDefault;
  const [lines, setLines] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const box = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const head = await fetch(`/studio/api/jobs/${encodeURIComponent(jobId)}/log?from=0&limit=1`, {
          cache: "no-store",
        });
        if (!head.ok) return;
        const counted = (await head.json()) as { total?: number };
        const size = counted.total ?? 0;
        const from = Math.max(0, size - WINDOW);
        const window = await fetch(
          `/studio/api/jobs/${encodeURIComponent(jobId)}/log?from=${from}&limit=${WINDOW}`,
          { cache: "no-store" },
        );
        if (!window.ok) return;
        const body = (await window.json()) as { lines?: string[] };
        if (!alive) return;
        setTotal(size);
        setLines(body.lines ?? []);
      } catch {
        // Same reasoning as the poll: a log window that could not be fetched is
        // not news, and the screen already says whether the runner is there.
      }
    };
    void load();
    // A job that has stopped has a log that has stopped, so it is read once.
    // Polling one for as long as a panel is open was two requests every four
    // seconds about a file nothing is writing to.
    if (!live) {
      return () => {
        alive = false;
      };
    }
    const timer = setInterval(() => void load(), 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [jobId, open, live]);

  // Each read follows the log's foot, unless the reader has scrolled up to
  // read something: a poll every four seconds must not pull them back down.
  useFollowFoot(box, lines, { onlyNearFoot: true });

  return (
    <div className="mt-4">
      {/* Folds open and shut; what was read stays while it is shut. */}
      <Disclosure
        open={open}
        onOpenChange={(next) => setChoice({ job: jobId, open: next })}
        className="flex w-full items-center justify-between text-xs font-semibold text-text2"
        summary={(shown) => (
          <>
            <span>Raw log</span>
            <span>{shown ? "Hide" : "Show"}</span>
          </>
        )}
      >
        <pre
          ref={box}
          className="mt-2 h-60 overflow-auto rounded-md border border-border bg-surface p-2 font-mono text-xs whitespace-pre-wrap break-all text-text2"
        >
          {lines.length === 0 ? "nothing on disk yet" : lines.join("\n")}
        </pre>
        <p className="mt-1 text-xs text-text2">
          the last {lines.length} of {total} lines
        </p>
      </Disclosure>
    </div>
  );
}

/** How many lines of the tail the panel holds. A window, never the whole file. */
const WINDOW = 200;
