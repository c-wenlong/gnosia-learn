"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatTile } from "@/components/ui/StatTile";
import { formatDue } from "@/lib/review-core";
import {
  formatMove,
  formatPL,
  scheduledCards,
  sessionTotals,
  stepsWalked,
  whatMoved,
  type RecordedAnswer,
  type SessionStep,
} from "@/lib/session-core";

/**
 * The close screen (hi-fi 07): four numbers, what moved as before-and-after
 * bars, what got scheduled, and the two ways out.
 *
 * Right, mastery moved and review cards come from the answers this session
 * recorded, as the observe route reported them. Target is the habit's own
 * count, read by the server on the refresh after the last answer, so it is the
 * number the top bar shows too.
 */
export function SessionClose({
  slug,
  title,
  plan,
  answers,
  minutes,
  target,
  next,
}: {
  slug: string;
  title: string;
  plan: SessionStep[];
  answers: RecordedAnswer[];
  minutes: number;
  target: { done: number; total: number; reachable: boolean };
  next: { slug: string; title: string } | null;
}) {
  // One clock for the relative dates on this screen.
  const [now] = useState(() => new Date());
  const totals = sessionTotals(slug, answers);
  const moved = whatMoved(slug, title, answers);
  const scheduled = scheduledCards(slug, title, answers);

  return (
    <div className="flex flex-col gap-4 md:gap-[22px]">
      <div className="flex flex-col items-center gap-1.5 pt-2 text-center md:pt-0">
        <h1 className="font-display text-[26px] leading-tight font-bold text-text md:text-[32px]">Session closed</h1>
        <p className="text-[13px] text-text2">
          {title} · {minutes} min · {stepsWalked(plan)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:flex md:gap-3.5">
        <StatTile value={`${totals.right} / ${totals.answered}`} label="right" tone="ok" />
        <StatTile
          value={totals.before === null || totals.after === null ? "0.00" : formatMove(totals.before, totals.after)}
          label="mastery"
          tone="accent"
        />
        <StatTile value={totals.cards} label="review cards" tone="violet" />
        <StatTile value={target.reachable ? `${target.done} / ${target.total}` : "–"} label="target" tone="streak" />
      </div>

      <Card title="What moved">
        {moved.length === 0 ? (
          <p className="text-[14px] text-text2">Nothing was answered, so no belief moved.</p>
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
        <Button variant="secondary" href="/today">
          Back to Today
        </Button>
        <span className="flex-1" />
        {next !== null ? (
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
