import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { Thread, ThreadKind } from "@/lib/home-core";
import { isCourseVisit } from "@/lib/recent-core";

/** Each kind's glyph, and the word a screen reader hears before the title. */
const KIND: Record<ThreadKind, { glyph: GlyphName; word: string }> = {
  module: { glyph: "book", word: "Course module" },
  video: { glyph: "video", word: "Video" },
  draft: { glyph: "diagram", word: "Studio draft" },
  concept: { glyph: "concepts", word: "Concept" },
  session: { glyph: "chat", word: "Tutor session" },
};

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
          {threads.map((t) => (
            <li key={t.key}>
              <Link
                href={t.href}
                className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-100 hover:bg-surface2 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
              >
                <Glyph name={KIND[t.kind].glyph} className="text-text2" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[14px] font-medium text-text">
                    <span className="sr-only">{isCourseVisit(t) ? "Course" : KIND[t.kind].word}: </span>
                    {t.title}
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-[12px] text-text2">
                    {t.kind === "concept" && t.bucket !== undefined ? (
                      <MasteryDot bucket={t.bucket} pL={t.pL} size={10} showLabel />
                    ) : (
                      <span className="truncate">{t.detail}</span>
                    )}
                    {t.percent !== undefined && (
                      // ProgressBar fills its container, so the wrapper sizes it.
                      <span className="w-16 shrink-0 max-md:hidden">
                        <ProgressBar percent={t.percent} size="sm" label={`${t.title}, ${t.percent}% watched`} />
                      </span>
                    )}
                  </span>
                </span>
                <time dateTime={t.at} className="shrink-0 text-[12px] text-text3">
                  {t.day}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
