"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { ThemeSwitch } from "@/components/ThemeSwitch";
import { cx } from "@/components/ui/classes";
import { FADE, FADE_IN } from "./motion";
import { useLearner } from "@/lib/learner-context";

/**
 * The account row at the foot of the sidebar, and the small menu it opens
 * upwards: the theme switch, Settings and Sign out. Folded to the rail it is
 * the avatar alone, and the menu opens to its right.
 *
 * The row shows the learner's name (`learner.display_name`, set on Settings),
 * and says "Account" until there is one.
 *
 * Sign out is a form post rather than a link, so nothing that prefetches or
 * embeds a URL can end the session (see `api/auth/sign-out`).
 *
 * A disclosure (a button that shows a list of links), not an ARIA `menu`:
 * a menu role promises arrow-key navigation, and three items do not need it.
 * It closes on Escape (focus back on the row), on a click outside, and on
 * choosing an item.
 */
export function AccountMenu({ collapsed, onPick }: { collapsed: boolean; onPick: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const themeLabel = useId();
  const name = useLearner().state.displayName ?? "Account";

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // The menu's Escape, not the drawer's.
        event.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const pick = () => {
    setOpen(false);
    onPick();
  };

  const item =
    "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] font-medium text-text hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent";

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={collapsed ? `${name}, account and settings` : undefined}
        title={collapsed ? name : undefined}
        onClick={() => setOpen((v) => !v)}
        // 3px in: on the rail's 38px row that centres the 32px avatar, and the
        // avatar stays put as the sidebar widens; the name fades in beside it.
        className={cx(
          "flex h-12 w-full items-center gap-2.5 overflow-hidden rounded-lg px-[3px] text-left transition-colors hover:bg-surface2",
          "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-border text-text2">
          <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="currentColor">
            <circle cx="10" cy="7" r="3.5" />
            <path d="M3.5 17.5c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5z" />
          </svg>
        </span>
        <span aria-hidden={collapsed ? true : undefined} className={cx("flex min-w-0 flex-1 items-center gap-2.5 pr-2", FADE, collapsed ? "opacity-0" : FADE_IN)}>
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text">{name}</span>
          <svg aria-hidden viewBox="0 0 20 20" className="size-4 shrink-0 text-text3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 8 10 4.5 13.5 8M6.5 12l3.5 3.5 3.5-3.5" />
          </svg>
        </span>
      </button>
      {/* Mounted throughout so it can fade and rise from the row; closed, it
          is invisible (no focus, no clicks) once the fade has run. */}
      <div
          id={id}
          inert={!open}
          className={cx(
            "absolute z-50 w-60 rounded-2xl border-2 border-border bg-surface p-1.5 shadow-lg",
            // `translate` and `scale` are their own properties in Tailwind 4, not `transform`.
            "transition-[opacity,translate,scale,visibility] duration-150 ease-soft motion-reduce:transition-none",
            collapsed ? "bottom-0 left-full ml-2 origin-bottom-left" : "inset-x-0 bottom-full mb-2 w-auto origin-bottom",
            open ? "visible translate-y-0 scale-100 opacity-100" : "invisible translate-y-1 scale-[0.97] opacity-0",
          )}
        >
          <ul className="flex flex-col gap-0.5">
            <li className="px-1.5 pt-1 pb-2">
              <p id={themeLabel} className="mb-1.5 px-1.5 text-[12px] font-semibold text-text2">
                Theme
              </p>
              <ThemeSwitch size="sm" labelledBy={themeLabel} />
            </li>
            <li>
              <Link href="/settings" className={item} onClick={pick}>
                <Glyph d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" />
                Settings
              </Link>
            </li>
            <li>
              <form method="post" action="/api/auth/sign-out">
                <button type="submit" className={item}>
                  <Glyph d="M8 3.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H8M13 13.5 16.5 10 13 6.5M16.5 10H7.5" />
                  Sign out
                </button>
              </form>
            </li>
          </ul>
        </div>
    </div>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-4 shrink-0 text-text2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
