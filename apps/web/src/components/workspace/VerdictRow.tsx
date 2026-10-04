"use client";

import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { formatInterval } from "@/lib/review-core";
import { recordedLine, type Verdict } from "@/lib/tutor-check";

/**
 * The row under a check the learner answered in the tutor chat (R2 of
 * docs/proposals/recall-in-chat.md): the judge's verdict pre-selected as the
 * primary button, the other beside it, and nothing written until a tap.
 *
 * The review page's rule for a check card, applied to prose: the model
 * suggests, the learner decides, and the append-only log holds only what the
 * learner agreed to. With the judge still reading, or unable to say, both
 * buttons are offered equally and neither is chosen.
 *
 * `live` is false once a later answer has a row of its own: an untapped row
 * then folds to "Not recorded", since the thread has moved on.
 */
export function VerdictRow({
  verdict,
  live,
  onRecord,
}: {
  verdict: Verdict;
  live: boolean;
  onRecord: (correct: boolean) => void;
}) {
  if (verdict.state === "recorded" && verdict.recorded !== null) {
    const ok = verdict.recorded.correct;
    return (
      <p
        role="status"
        className={cx(
          "animate-fade-in self-start rounded-xl px-4 py-2.5 text-[13px] motion-reduce:animate-none",
          ok ? "bg-ok-tint text-ok-text" : "bg-warn-tint text-warn-text",
        )}
      >
        {recordedLine(verdict.recorded, (d) => formatInterval(d))}
      </p>
    );
  }

  if (!live) {
    return (
      <p className="self-start px-1.5 text-[12px] text-text3">Not recorded</p>
    );
  }

  const saving = verdict.state === "saving";
  // A failed write keeps the verdict that was tapped: its retry replays the
  // same request id, so only that verdict can be offered again.
  const retrying =
    verdict.state === "failed" && verdict.tapped !== null
      ? verdict.tapped
      : null;
  const suggested = verdict.judged === "ready" ? verdict.suggested : null;
  const lead =
    verdict.judged === "pending"
      ? "Reading your answer…"
      : suggested === null
        ? "Record this answer?"
        : suggested
          ? "Looks right."
          : "Not quite.";

  return (
    <div
      role="group"
      aria-label="Record this answer"
      aria-busy={saving || verdict.judged === "pending"}
      className="flex animate-enter flex-col gap-2.5 self-stretch rounded-xl bg-surface2 px-4 py-3 text-[13px] motion-reduce:animate-none"
    >
      <p className="text-text">
        <span className="font-semibold">{lead}</span>
        {verdict.feedback && (
          <span className="text-text2"> {verdict.feedback}</span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {retrying !== null ? (
          <Button
            size="sm"
            variant={retrying ? "ok" : "warn"}
            onClick={() => onRecord(retrying)}
          >
            {retrying
              ? "Try again: record as correct"
              : "Try again: record as incorrect"}
          </Button>
        ) : (
          /* The suggestion leads; with none, correct comes first as it reads. */
          (suggested === false ? [false, true] : [true, false]).map(
            (correct) => (
              <Button
                key={String(correct)}
                size="sm"
                variant={
                  suggested === correct
                    ? correct
                      ? "ok"
                      : "warn"
                    : "secondary"
                }
                disabled={saving}
                onClick={() => onRecord(correct)}
              >
                {correct ? "Record as correct" : "Record as incorrect"}
              </Button>
            ),
          )
        )}
        <span className="text-[12px] text-text3">
          {saving
            ? "Recording…"
            : retrying !== null
              ? ""
              : "Nothing is recorded until you choose."}
        </span>
      </div>
      {verdict.state === "failed" && verdict.error && (
        <p role="alert" className="text-[12px] text-warn-text">
          {verdict.error} A retry is never recorded twice.
        </p>
      )}
    </div>
  );
}
