import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Glyph } from "@/components/ui/Glyph";
import { LinkRow } from "@/components/ui/LinkRow";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { Thread } from "@/lib/home-core";
import { recentGlyph } from "@/lib/recent-glyphs";

/**
 * Pick up where you left off (docs/proposals/home-page.md, part 2): the last
 * few things the owner touched, newest first, each a link back to where it
 * stopped. It replaced Today's Recent activity, which read the same history
 * but could only be read, and saw nothing of course pages, videos or the
 * studio.
 */
export function ThreadsCard({ threads, reachable }: { threads: Thread[]; reachable: boolean }) {
  return (
    <Card title="Pick up where you left off" className="max-md:gap-2 max-md:p-3.5">
      {threads.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[14px] text-text2">
            {reachable
              ? "Nothing to go back to yet. Course modules, videos, tutor sessions and concepts you answer questions on show here."
              : "What you were doing could not be read."}
          </p>
          {reachable && (
            <Button href="/courses" variant="secondary" size="sm">
              Browse courses
            </Button>
          )}
        </div>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {threads.map((t) => {
            // The sidebar's glyph and word for the same row (`recentGlyph`).
            const kind = recentGlyph(t);
            return (
              <li key={t.key}>
                <LinkRow
                  href={t.href}
                  srKind={kind.word}
                  lead={<Glyph name={kind.glyph} className="text-text2" />}
                  title={t.title}
                  meta={
                    <>
                      {t.kind === "concept" && t.bucket !== undefined ? (
                        <MasteryDot bucket={t.bucket} pL={t.pL} size={10} showLabel />
                      ) : (
                        <span className="truncate">{t.detail}</span>
                      )}
                      {t.percent !== undefined && (
                        // ProgressBar fills its container, so the wrapper sizes it.
                        <span className="w-16 shrink-0 max-md:hidden">
                          <ProgressBar percent={t.percent} size="sm" label={`${t.percent}% watched`} />
                        </span>
                      )}
                    </>
                  }
                  trailing={
                    <time dateTime={t.at} className="shrink-0 text-[12px] text-text3">
                      {t.day}
                    </time>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
