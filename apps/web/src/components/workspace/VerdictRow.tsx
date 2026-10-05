"use client";

import { Button } from "@/components/ui/Button";
import { cx, linkClasses, STATUS_TEXT } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { formatInterval } from "@/lib/review-core";
import { recordedCard, recordedLine, type RecordedResult, type Verdict } from "@/lib/tutor-check";

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
  concept,
}: {
  verdict: Verdict;
  live: boolean;
  onRecord: (correct: boolean) => void;
  /**
   * The concept the answer was recorded against, and where its note is: given,
   * a committed verdict becomes a card naming both (D89 of
   * docs/STUDIO-CHAT-FIRST.md); without it, the one line it always was.
   */
  concept?: { title: string; noteHref: string };
}) {
  if (verdict.state === "recorded" && verdict.recorded !== null && concept !== undefined) {
    return <RecordedCard recorded={verdict.recorded} concept={concept} />;
  }
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
        <p role="alert" className={cx(STATUS_TEXT, "text-warn-text")}>
          {verdict.error} A retry is never recorded twice.
        </p>
      )}
    </div>
  );
}

/**
 * What a committed verdict wrote, as a card in the thread: the verdict, the
 * concept it counts for, how its mastery moved and when it is next reviewed,
 * and a link to the concept's note. After Manus's deliverable card: the
 * thread shows what the turn left behind, not only that it happened.
 */
function RecordedCard({
  recorded,
  concept,
}: {
  recorded: RecordedResult;
  concept: { title: string; noteHref: string };
}) {
  const card = recordedCard(recorded, (d) => formatInterval(d));
  const ok = recorded.correct;
  return (
    <section
      role="status"
      aria-label={`${card.verdict}: ${concept.title}`}
      data-recorded={ok ? "correct" : "incorrect"}
      className="flex w-full max-w-[34rem] animate-enter items-start gap-3 self-start rounded-xl border border-border bg-surface px-4 py-3 motion-reduce:animate-none"
    >
      <span
        aria-hidden
        className={cx(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
          ok ? "bg-ok-tint text-ok-text" : "bg-warn-tint text-warn-text",
        )}
      >
        <Glyph name={ok ? "tick" : "close"} size={16} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cx("text-[13px] font-semibold", ok ? "text-ok-text" : "text-warn-text")}>{card.verdict}</p>
        <p className="text-[14px] font-semibold leading-5 text-text">{concept.title}</p>
        <p className="text-[13px] text-text2">
          {card.mastery}
          {card.review !== null && <span className="text-text3"> · {card.review}</span>}
        </p>
        {/* A plain anchor: the note is on this page, and `WorkspacePanels`
            brings it into view on the `hashchange` a fragment link fires (a
            second press, with the hash already set, fires one by hand). */}
        <a
          href={concept.noteHref}
          onClick={() => {
            if (concept.noteHref.startsWith("#") && window.location.hash === concept.noteHref) {
              window.dispatchEvent(new HashChangeEvent("hashchange"));
            }
          }}
          className={linkClasses({ size: "xs", className: "mt-1 self-start" })}
        >
          Open the note
        </a>
      </div>
    </section>
  );
}
