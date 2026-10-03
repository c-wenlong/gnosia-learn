import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Glyph } from "@/components/ui/Glyph";
import { MasteryDot } from "@/components/ui/MasteryDot";
import type { NextGroup } from "@/lib/home-core";

/**
 * Next from here (docs/proposals/home-page.md, part 3): for each of the top
 * threads, the two or three things it opens up. It replaced Today's single
 * "Next up", which was the weakest concept on the whole frontier and then the
 * alphabet, whatever the owner had been doing.
 */
export function NextCard({ groups }: { groups: NextGroup[] }) {
  return (
    <Card title="Next from here" className="max-md:gap-2 max-md:p-3.5">
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <section key={group.key} aria-label={group.heading} className="flex flex-col gap-1">
            <h3 className="truncate text-[12px] font-semibold text-text2">{group.heading}</h3>
            <ul className="-mx-2 flex flex-col">
              {group.steps.map((step) => (
                <li key={step.key}>
                  <Link
                    href={step.href}
                    className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
                  >
                    {step.bucket !== undefined ? (
                      <MasteryDot bucket={step.bucket} />
                    ) : (
                      <Glyph name="topics" size={16} className="text-text2" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[14px] text-text">{step.title}</span>
                    {step.detail !== null && <span className="shrink-0 text-[12px] text-text3 max-md:hidden">{step.detail}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}
