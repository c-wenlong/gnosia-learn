"use client";

import { useLearner } from "@/lib/learner-context";

/**
 * Flip between light and dark. Lives in the avatar menu, so it is styled by
 * the caller as one of that menu's rows; the cookie and the preference row
 * are written by `setThemeMode`.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { state, ready, setThemeMode } = useLearner();
  const isDark = state.theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setThemeMode(isDark ? "light" : "dark")}
      className={className}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      disabled={!ready}
    >
      <span aria-hidden className="w-4 text-center text-base leading-none text-text2">
        {isDark ? "☀" : "☾"}
      </span>
      {isDark ? "Light theme" : "Dark theme"}
    </button>
  );
}
