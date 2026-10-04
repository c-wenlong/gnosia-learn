import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card, CardAction } from "@/components/ui/Card";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { recallHref, type RecallPick } from "@/lib/home-core";

/**
 * Worth a quick recall (docs/proposals/home-page.md, part 4): at most three
 * due cards, those nearest what the owner is doing first. Each opens its
 * concept's page, whose tutor asks a recall question first while the card is
 * due, and the button opens the first (recall in the chat, phase 3). No queue
 * count and no "overdue": a due date that passed while the owner learnt
 * something else is not a debt (H3). The whole queue stays one link away.
 * Drawn only when a card is due.
 */
export function RecallCard({ picks }: { picks: RecallPick[] }) {
  return (
    <Card
      title="Worth a quick recall"
      action={<CardAction href="/review">All reviews</CardAction>}
      className="max-md:gap-2 max-md:p-3.5"
    >
      <ul className="flex flex-col gap-2">
        {picks.map((pick) => (
          <li key={pick.conceptId} className="flex min-w-0 items-center gap-3">
            <MasteryDot bucket={pick.bucket} />
            <Link
              href={recallHref(pick)}
              className="min-w-0 flex-1 truncate rounded-sm text-[14px] text-text underline-offset-4 transition-colors duration-100 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {pick.title}
            </Link>
            {pick.lastSeen !== null && (
              <span className="shrink-0 text-[12px] text-text2">
                <span className="md:hidden">{pick.lastSeen}</span>
                <span className="max-md:hidden">last seen {pick.lastSeen}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div>
        <Button href={recallHref(picks[0])} className="max-md:w-full">
          Start recall
        </Button>
      </div>
    </Card>
  );
}
