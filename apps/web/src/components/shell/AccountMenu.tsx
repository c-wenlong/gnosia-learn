"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";

import { ThemeSwitch } from "@/components/ThemeSwitch";
import { PixelAvatar } from "@/components/avatar/PixelAvatar";
import { cx, MENU_HEADING, MENU_PANEL, menuRowClasses } from "@/components/ui/classes";
import { Popover } from "@/components/ui/Popover";
import { FADE, FADE_IN } from "./motion";
import { useLearner } from "@/lib/learner-context";

/**
 * The account row at the foot of the sidebar, and the small menu it opens
 * upwards: the theme switch, Settings and Sign out. Folded to the rail it is
 * the avatar alone, and the menu opens to its right.
 *
 * The row shows the learner's sprite (`learner.avatar`) and name
 * (`learner.display_name`), both set on Settings' Profile tab. It says
 * "Account" until there is a name, and shows a plain head and shoulders
 * while the sprite is unknown (the database unreachable).
 *
 * Sign out is a form post rather than a link, so nothing that prefetches or
 * embeds a URL can end the session (see `api/auth/sign-out`).
 *
 * A disclosure (a button that shows a list of links), not an ARIA `menu`:
 * a menu role promises arrow-key navigation, and three items do not need it.
 * Tab walks from the row into it. It is a kit `Popover`, in the top layer
 * over the sidebar's edge: it closes on Escape (focus back on the row, and
 * the press goes no further, so the phone drawer around it stays open), on a
 * click outside, on Tab out of it, and on choosing an item.
 */
export function AccountMenu({ collapsed, onPick }: { collapsed: boolean; onPick: () => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const themeLabel = useId();
  const { displayName, avatar } = useLearner().state;
  const name = displayName ?? "Account";

  const pick = () => {
    setOpen(false);
    onPick();
  };

  const item = menuRowClasses();

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
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
        {avatar === undefined ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-border text-text2">
            <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="currentColor">
              <circle cx="10" cy="7" r="3.5" />
              <path d="M3.5 17.5c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5z" />
            </svg>
          </span>
        ) : (
          <PixelAvatar avatar={avatar} className="size-8" />
        )}
        <span aria-hidden={collapsed ? true : undefined} className={cx("flex min-w-0 flex-1 items-center gap-2.5 pr-2", FADE, collapsed ? "opacity-0" : FADE_IN)}>
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text">{name}</span>
          <svg aria-hidden viewBox="0 0 20 20" className="size-4 shrink-0 text-text3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 8 10 4.5 13.5 8M6.5 12l3.5 3.5 3.5-3.5" />
          </svg>
        </span>
      </button>
      {/* Over the row, as wide as it, in the open sidebar; beside the avatar,
          bottoms flush, on the rail. */}
      <Popover
        anchorRef={button}
        open={open}
        onOpenChange={() => setOpen(false)}
        placement={collapsed ? "right-end" : "top-start"}
        minWidthFromAnchor={!collapsed}
        id={id}
        className={cx(MENU_PANEL, collapsed && "w-60")}
      >
        <ul className="flex flex-col gap-0.5">
          <li className="pb-2">
            <p id={themeLabel} className={MENU_HEADING}>
              Theme
            </p>
            <ThemeSwitch size="sm" labelledBy={themeLabel} className="px-1.5 pt-1" />
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
      </Popover>
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
