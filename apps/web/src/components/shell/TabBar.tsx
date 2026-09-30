"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/components/ui/classes";
import { activeDestination, DESTINATIONS } from "@/lib/nav";

import { NavIcon } from "./NavIcon";

/**
 * The phone tab bar (hi-fi frames 13 to 15): the five destinations
 * (`DESTINATIONS`, without Studio, which is a top-bar destination only),
 * fixed to the bottom below 768px. 68px plus the home-indicator inset. Hidden on a `data-layout="full"` page, which is the studio's canvas
 * and has no phone layout.
 */
export function TabBar() {
  const active = activeDestination(usePathname());
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-hair bg-surface pb-[env(safe-area-inset-bottom)] md:hidden group-has-[[data-layout=full]]/shell:hidden"
    >
      <ul className="grid h-[68px] grid-cols-5 px-2">
        {DESTINATIONS.map((d) => {
          const on = d.key === active;
          return (
            <li key={d.key}>
              <Link
                href={d.href}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "flex h-full flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold",
                  "focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent",
                  on ? "text-text" : "text-text3",
                )}
              >
                <NavIcon name={d.key} className="size-5" />
                {d.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
