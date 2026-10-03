"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GnosiaWordmark } from "@/components/brand";
import { cx } from "@/components/ui/classes";
import { activeDestination, topBarDestinations } from "@/lib/nav";

import { AvatarMenu } from "./AvatarMenu";

/**
 * Kit `TopBar`: 64px on `--surface` with a hairline under it. The wordmark in
 * the display face, the five destinations, and Studio as a sixth when this
 * deployment has one (the selected one in the text colour over a 2px
 * underline), and the avatar menu at the right.
 *
 * Below 768px it is the phone header (kit `Phone`): 56px, the wordmark and the
 * avatar. The five destinations move to `TabBar`; Studio does not, and stays
 * in the avatar menu on a phone. Between 768 and 1024 the labels drop to 14px
 * and the gaps tighten, so six destinations (Studio on) still fit at 768.
 * On a `data-layout="focus"` page it is hidden from 768px up: focus mode
 * draws its own step bar and exit instead.
 *
 * The streak and target pills that sat beside the avatar were removed with
 * the habit layer (H1 of docs/proposals/home-page.md).
 *
 * A client component for `usePathname`.
 */
export function TopBar({ studio }: { studio: boolean }) {
  const active = activeDestination(usePathname());

  return (
    <header className="sticky top-0 z-30 border-b border-hair bg-surface pt-[env(safe-area-inset-top)] group-has-[[data-layout=full]]/shell:static md:group-has-[[data-layout=focus]]/shell:hidden">
      <div className="flex h-14 items-center gap-4 px-4 md:h-16 md:gap-5 md:px-6 lg:gap-8 lg:px-7">
        <Link
          href="/home"
          aria-label="Gnosia, Home"
          className="shrink-0 rounded-sm text-[14px] text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent md:text-[15px]"
        >
          <GnosiaWordmark />
        </Link>

        <nav aria-label="Primary" className="hidden h-full md:block">
          <ul className="flex h-full gap-3.5 lg:gap-7">
            {topBarDestinations(studio).map((d) => {
              const on = d.key === active;
              return (
                <li key={d.key} className="h-full">
                  <Link
                    href={d.href}
                    aria-current={on ? "page" : undefined}
                    className={cx(
                      "group/nav flex h-full flex-col items-center justify-center gap-2 text-[14px] transition-colors duration-100 lg:text-[15px]",
                      "focus-visible:outline-none",
                      on ? "font-semibold text-text" : "font-medium text-text2 hover:text-text",
                    )}
                  >
                    <span className="rounded-sm leading-5 group-focus-visible/nav:outline-2 group-focus-visible/nav:outline-offset-4 group-focus-visible/nav:outline-accent">
                      {d.label}
                    </span>
                    <span aria-hidden className={cx("h-0.5 w-7 rounded-full", on ? "bg-text" : "bg-transparent")} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center">
          <AvatarMenu studio={studio} />
        </div>
      </div>
    </header>
  );
}
