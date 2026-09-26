"use client";

import { cx } from "@/components/ui/classes";
import { useLearner } from "@/lib/learner-context";
import { THEME_LABELS, THEME_MODES } from "@/lib/theme-cookie";

/**
 * The appearance control: Light, Gnosia, Dark, System as one segmented
 * radio group. It lives in the avatar menu (small) and on the Settings page
 * (regular); both write through the provider's `setThemeMode`, which sets
 * the classes on `<html>`, the cookie and the preference row.
 *
 * A radio group rather than a toggle because there are four modes and two
 * of them are light: a toggle would have to remember which light to return
 * to, and a select hides the choice behind a click. Arrow keys move between
 * the segments as on any radio group.
 */
export function ThemeSwitch({
  id,
  labelledBy,
  size = "md",
  className,
}: {
  id?: string;
  /** The id of a visible label; without one the group names itself "Theme". */
  labelledBy?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { state, ready, setThemeMode } = useLearner();
  const small = size === "sm";

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={labelledBy === undefined ? "Theme" : undefined}
      aria-labelledby={labelledBy}
      className={cx(
        "grid grid-cols-4 rounded-xl bg-surface2 p-0.5",
        small ? "gap-0.5" : "gap-1",
        className,
      )}
    >
      {THEME_MODES.map((mode) => {
        const on = state.theme === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={!ready}
            onClick={() => setThemeMode(mode)}
            onKeyDown={(event) => {
              const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
              if (step === 0) return;
              event.preventDefault();
              const next = THEME_MODES[(THEME_MODES.indexOf(mode) + step + THEME_MODES.length) % THEME_MODES.length];
              setThemeMode(next);
              (event.currentTarget.parentElement?.querySelector(`[data-mode="${next}"]`) as HTMLElement | null)?.focus();
            }}
            data-mode={mode}
            className={cx(
              "rounded-[10px] font-medium transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:opacity-60",
              small ? "h-8 text-[12px]" : "h-10 text-[14px]",
              on ? "bg-surface text-text shadow-[0_1px_0_var(--lip-shade)]" : "text-text2 hover:text-text",
            )}
          >
            {THEME_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
