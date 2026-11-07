import { Card } from "@/components/ui/Card";
import { Glyph } from "@/components/ui/Glyph";
import { LinkRow } from "@/components/ui/LinkRow";
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
                  <LinkRow
                    href={step.href}
                    lead={
                      step.bucket !== undefined ? (
                        <MasteryDot bucket={step.bucket} />
                      ) : (
                        <Glyph name="topics" size={16} className="text-text2" />
                      )
                    }
                    title={step.title}
                    trailing={
                      step.detail !== null && <span className="shrink-0 text-[12px] text-text3 max-md:hidden">{step.detail}</span>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}
