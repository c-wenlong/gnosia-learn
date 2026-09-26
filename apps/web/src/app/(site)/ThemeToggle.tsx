"use client";

import { useSyncExternalStore } from "react";

import { applyThemeToDocument, writeThemeCookie } from "@/lib/theme-cookie";

import { siteLink } from "./site";

/**
 * The public pages' light and dark switch, in the header.
 *
 * Light is the default: a visitor with no theme cookie is served light by the
 * root layout, since light carries the brighter mood the landing page wants.
 * A click writes the same cookie the app uses, so the choice survives a
 * reload and is this browser's theme everywhere: the signed-in layout lets
 * the cookie win over the saved `preference` row ("what the browser last
 * chose"), so switching here also switches the app on this browser. The row,
 * and so every other device, is left alone: only the app's own theme
 * control (Settings and the avatar menu) saves it.
 *
 * Only two states here. `gnosia` looks the same as light on these pages (the
 * brand tokens are not redefined by it) and `system` resolves to one of the
 * two, so the switch reads what is painted and picks the other.
 *
 * The icon follows the `dark` class through CSS, so it is right on the first
 * paint. `aria-pressed` reads the same class as an external store: the server
 * cannot know it (a `system` mode resolves in the browser), so it is left off
 * until hydration, and a MutationObserver keeps it true to whatever paints.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => undefined);

  function toggle() {
    const next = isDark() ? "light" : "dark";
    applyThemeToDocument(next);
    writeThemeCookie(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Dark theme"
      aria-pressed={dark}
      className={siteLink(
        "grid size-10 place-items-center rounded-full text-brand-ink hover:bg-brand-ink/5 hover:text-brand-teal",
      )}
    >
      {/* A moon in light (switch to dark), a sun in dark (switch back). */}
      <svg viewBox="0 0 24 24" className="size-5 dark:hidden" fill="none" aria-hidden>
        <path
          d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      <svg viewBox="0 0 24 24" className="hidden size-5 dark:block" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
