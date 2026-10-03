import { Button } from "@/components/ui/Button";
import { Card, CardAction } from "@/components/ui/Card";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { recallHref, type RecallPick } from "@/lib/home-core";

/**
 * Worth a quick recall (docs/proposals/home-page.md, part 4): at most three
 * due cards, those nearest what the owner is doing first, and one button that
 * opens the review with just them. No queue count and no "overdue": a due
 * date that passed while the owner learnt something else is not a debt (H3).
 * The whole queue stays one link away. Drawn only when a card is due.
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
            <span className="min-w-0 flex-1 truncate text-[14px] text-text">{pick.title}</span>
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
        <Button href={recallHref(picks)} className="max-md:w-full">
          Recall these
        </Button>
      </div>
    </Card>
  );
}
