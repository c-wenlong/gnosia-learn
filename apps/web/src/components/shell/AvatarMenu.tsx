"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { ThemeSwitch } from "@/components/ThemeSwitch";

/**
 * The avatar at the right of the top bar, and the small menu behind it:
 * the theme switch, Settings, Studio when this deployment has one (on a phone
 * only: from 768px up it is a destination in the top bar and is not listed
 * twice), and Sign out. Sign out is a form post rather than a link, so nothing that prefetches
 * or embeds a URL can end the session (see `api/auth/sign-out`).
 *
 * A disclosure (a button that shows a list of links), not an ARIA `menu`:
 * a menu role promises arrow-key navigation, and three items do not need it.
 * It closes on Escape (focus back on the avatar), on a click outside, and on
 * choosing an item.
 */
export function AvatarMenu({ studio }: { studio: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const themeLabel = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] font-medium text-text hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent";

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label="Account and settings"
        onClick={() => setOpen((v) => !v)}
        className="flex size-[34px] items-center justify-center rounded-full bg-border text-text2 transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="currentColor">
          <circle cx="10" cy="7" r="3.5" />
          <path d="M3.5 17.5c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5z" />
        </svg>
      </button>
      {open && (
        <div
          id={id}
          className="absolute top-full right-0 z-40 mt-2 w-56 rounded-2xl border-2 border-border bg-surface p-1.5"
        >
          <ul className="flex flex-col gap-0.5">
            <li className="px-1.5 pt-1 pb-2">
              <p id={themeLabel} className="mb-1.5 px-1.5 text-[12px] font-semibold text-text2">
                Theme
              </p>
              <ThemeSwitch size="sm" labelledBy={themeLabel} />
            </li>
            <li>
              <Link href="/settings" className={item} onClick={() => setOpen(false)}>
                <Glyph d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" />
                Settings
              </Link>
            </li>
            {/* Only when the server says there is one: every route under
                /studio 404s with STUDIO_ENABLED unset (D11), so an
                unconditional entry would be broken on the deployed site.
                `md:hidden`: from 768px up the top bar carries it. */}
            {studio && (
              <li className="md:hidden">
                <Link href="/studio" className={item} onClick={() => setOpen(false)}>
                  <Glyph d="M4 16l2.5-.5L15 7l-2-2-8.5 8.5zM12 6l2 2" />
                  Studio
                </Link>
              </li>
            )}
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
      )}
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
