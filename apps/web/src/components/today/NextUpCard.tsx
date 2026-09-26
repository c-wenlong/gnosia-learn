import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { MasteryDot } from "@/components/ui/MasteryDot";
import type { NextUp } from "@/lib/today-core";

/**
 * Next up (hi-fi 01, top left; 13, first card): the first concept on the
 * frontier, where it sits, how well it is known, and the two ways in. On a
 * phone the card is tighter, the eyebrow shorter, and only Continue remains.
 */
export function NextUpCard({
  nextUp,
  conceptCount,
  reachable,
}: {
  nextUp: NextUp | null;
  conceptCount: number;
  reachable: boolean;
}) {
  if (nextUp === null) return <EmptyNextUp conceptCount={conceptCount} reachable={reachable} />;
  const encoded = encodeURIComponent(nextUp.id);
  return (
    <Card aria-label="Next up" className="max-md:gap-2 max-md:p-3.5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Eyebrow>
            <span className="md:hidden">{nextUp.eyebrowShort}</span>
            <span className="max-md:hidden">{nextUp.eyebrow}</span>
          </Eyebrow>
          <h2 className="font-display text-[20px] leading-tight font-bold text-text md:text-[26px]">{nextUp.title}</h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text2">
            <MasteryDot bucket={nextUp.bucket} pL={nextUp.pL} showLabel />
            {nextUp.lastSeen !== null && <span className="max-md:hidden">· last seen {nextUp.lastSeen}</span>}
          </p>
        </div>
        <div className="flex flex-col gap-2.5 md:w-[190px] md:shrink-0">
          {/* Not prefetched until phase 1d builds the session route: a
              prefetch of a 404 never settles, which holds the page's
              network open. */}
          <Button href={`/learn/${encoded}/session`} prefetch={false} block>
            <span className="md:hidden">Continue</span>
            <span className="max-md:hidden">Continue teaching</span>
          </Button>
          <div className="max-md:hidden">
            <Button href={`/learn/${encoded}`} variant="secondary" block>
              Open workspace
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function EmptyNextUp({ conceptCount, reachable }: { conceptCount: number; reachable: boolean }) {
  const [title, body, action] = !reachable
    ? [
        "Nothing to show yet",
        "Your path, your reviews and what you did lately appear here once the database can be read.",
        { href: "/courses", label: "Browse courses" },
      ]
    : conceptCount === 0
      ? [
          "Nothing on your path yet",
          "Concepts join your path once the tutor has written notes for them, and the next one to learn shows here. Start from a course in the meantime.",
          { href: "/courses", label: "Browse courses" },
        ]
      : [
          "Everything on your path is mastered",
          "Nothing is waiting to be taught. Reviews still come back round when they fall due.",
          { href: "/learn", label: "See every concept" },
        ];
  return (
    <Card aria-label="Next up" className="items-start max-md:gap-2 max-md:p-3.5">
      <Eyebrow>Next on your path</Eyebrow>
      <h2 className="font-display text-[20px] leading-tight font-bold text-text md:text-[26px]">{title}</h2>
      <p className="max-w-prose text-[14px] text-text2">{body}</p>
      <Button href={action.href} variant="secondary" size="sm">
        {action.label}
      </Button>
    </Card>
  );
}
