"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatTile } from "@/components/ui/StatTile";
import { CLOSE_TITLE, cx } from "@/components/ui/classes";
import { formatDue } from "@/lib/review-core";
import {
  formatPL,
  formatTotalsMove,
  scheduledCards,
  sessionTotals,
  stepsWalked,
  whatMoved,
  type RecordedAnswer,
  type SessionStep,
  withConsequence,
} from "@/lib/session-core";

/**
 * The close screen (hi-fi 07): three numbers, what moved as before-and-after
 * bars, what got scheduled, and the two ways out.
 *
 * Right, mastery moved and review cards come from the answers this session
 * recorded, as the observe route reported them. Mastery moved is the change
 * in p(L), always signed, and a dash when nothing was answered. The fourth
 * tile, the daily target, went with the habit layer (H1 of
 * docs/proposals/home-page.md).
 *
 * `reason` is set when the session could ask nothing (no check in the note,
 * no model configured): What moved says why in place of "nothing was
 * answered", and a Quiz me that opened straight onto this screen, having
 * walked no step, is titled for what happened rather than as a closed session.
 *
 * A week check (`weekCheck`) closes on the same screen over its concepts:
 * each one it asked is a row of What moved under its own title, Mastery
 * moved is the mean move over them, and the way on is back to the module.
 */
export function SessionClose({
  slug,
  title,
  plan,
  answers,
  minutes,
  next,
  reason = null,
  weekCheck = null,
}: {
  slug: string;
  title: string;
  plan: SessionStep[];
  answers: RecordedAnswer[];
  minutes: number;
  next: { slug: string; title: string } | null;
  /** Why nothing was asked, when the server knew before the session began. */
  reason?: string | null;
  /** A week check: each concept's title by slug, and the module page to go back to. */
  weekCheck?: { titles: Readonly<Record<string, string>>; moduleHref: string } | null;
}) {
  // One clock for the relative dates on this screen.
  const [now] = useState(() => new Date());
  const titles = weekCheck?.titles ?? {};
  const totals = sessionTotals(weekCheck === null ? slug : Object.keys(titles), answers);
  const moved = whatMoved(slug, title, answers, titles);
  const scheduled = scheduledCards(slug, title, answers, titles);
  const walked = stepsWalked(plan);
  const asked = `${answers.length} question${answers.length === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-4 md:gap-[22px]">
      <div className="flex flex-col items-center gap-1.5 pt-2 text-center md:pt-0">
        <h1 tabIndex={-1} className={cx(CLOSE_TITLE, "outline-none")}>
          {walked === "" ? "Nothing to ask" : weekCheck === null ? "Session closed" : "Module check done"}
        </h1>
        <p className="text-[13px] text-text2">
          {walked === "" ? title : `${title} · ${minutes} min · ${weekCheck === null ? walked : asked}`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2.5 md:flex md:gap-3.5">
        <StatTile value={`${totals.right} / ${totals.answered}`} label="Right" tone="ok" />
        <StatTile value={formatTotalsMove(totals)} label="Mastery moved" tone="accent" />
        <StatTile value={totals.cards} label="Review cards" tone="violet" />
      </div>

      <Card title="What moved">
        {moved.length === 0 ? (
          <p className="text-[14px] text-text2">
            {reason === null ? "Nothing was answered, so no belief moved." : withConsequence(reason, "Nothing was recorded.")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3 md:gap-2">
            {moved.map((row) => (
              <li key={row.slug} className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
                <span className="flex min-w-0 flex-1 gap-1 text-[14px] text-text">
                  <span className="truncate">{row.title}</span>
                  {row.prerequisite && <span className="shrink-0 text-text2">(prerequisite)</span>}
                </span>
                <span className="flex items-center gap-2.5 md:gap-3">
                  <ProgressBar
                    percent={row.before * 100}
                    tone="mid"
                    label={`${row.title} before, p(L) ${formatPL(row.before)}`}
                    className="flex-1 md:w-[150px] md:flex-none"
                  />
                  <span className="w-8 text-right text-[12px] tabular-nums text-text2">{formatPL(row.before)}</span>
                  <ProgressBar
                    percent={row.after * 100}
                    label={`${row.title} after, p(L) ${formatPL(row.after)}`}
                    className="flex-1 md:w-[150px] md:flex-none"
                  />
                  <span className="w-8 text-right text-[12px] font-bold tabular-nums text-text">{formatPL(row.after)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Scheduled">
        {scheduled.length === 0 ? (
          <p className="text-[14px] text-text2">No review card was scheduled.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {scheduled.map((row) => (
              <li key={row.slug} className="flex items-center gap-2.5">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-m-mid" />
                <span className="min-w-0 flex-1 truncate text-[14px] text-text">{row.title}</span>
                <span className="shrink-0 text-[12px] text-text2" suppressHydrationWarning>
                  {row.created ? "new card, " : ""}review {formatDue(row.due, now) ?? "soon"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-auto flex flex-wrap items-center gap-3 md:mt-0">
        <Button variant="secondary" href="/home">
          Back to Home
        </Button>
        <span className="flex-1" />
        {weekCheck !== null ? (
          <Button href={weekCheck.moduleHref}>Back to the module</Button>
        ) : next !== null ? (
          <Button href={`/learn/${next.slug}/session`} className="max-w-full">
            <span className="truncate">Keep going · {next.title}</span>
          </Button>
        ) : (
          <Button href={`/learn/${slug}`}>Back to the workspace</Button>
        )}
      </div>
    </div>
  );
}
