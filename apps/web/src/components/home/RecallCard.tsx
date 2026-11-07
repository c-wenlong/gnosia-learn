import { Button } from "@/components/ui/Button";
import { Card, CardAction } from "@/components/ui/Card";
import { LinkRow } from "@/components/ui/LinkRow";
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
      {/* The whole row opens the concept, as the proposal's part 4 says ("each
          row links to its concept"); #381 first wrapped only the title. */}
      <ul className="-mx-2 flex flex-col">
        {picks.map((pick) => (
          <li key={pick.conceptId}>
            <LinkRow
              href={recallHref(pick)}
              lead={<MasteryDot bucket={pick.bucket} />}
              title={pick.title}
              trailing={
                pick.lastSeen !== null && (
                  <span className="shrink-0 text-[12px] text-text2">
                    <span className="md:hidden">{pick.lastSeen}</span>
                    <span className="max-md:hidden">last seen {pick.lastSeen}</span>
                  </span>
                )
              }
            />
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
