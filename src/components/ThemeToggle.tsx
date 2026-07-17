"use client";

import { useLearner } from "@/lib/learner-context";

export function ThemeToggle() {
  const { state, ready, setThemeMode } = useLearner();
  const isDark = state.theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setThemeMode(isDark ? "light" : "dark")}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      disabled={!ready}
    >
      <span aria-hidden className="text-base leading-none">
        {isDark ? "☀" : "☾"}
      </span>
      <span className="hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
