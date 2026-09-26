"use client";

import { useId, type KeyboardEvent } from "react";

import { cx } from "@/components/ui/classes";
import { useLearner } from "@/lib/learner-context";
import {
  APPEARANCE_LABELS,
  appearanceOf,
  PALETTE_LABELS,
  paletteOf,
  THEME_APPEARANCES,
  THEME_PALETTES,
  themeModeFor,
} from "@/lib/theme-cookie";

/**
 * The theme control: two segmented radio groups, Palette (Classic, Gnosia)
 * and Appearance (Light, Dark, System), stacked under one label. It lives in
 * the avatar menu (small) and on the Settings page (regular); both write
 * through the provider's `setThemeMode`, which sets the classes on `<html>`,
 * the cookie and the preference row. The stored value stays one mode
 * (`themeModeFor` joins the two choices), so choosing a palette keeps the
 * appearance and the other way round.
 *
 * Radio groups rather than toggles because each axis is a choice among named
 * options, and a select would hide them behind a click. Arrow keys move
 * within a group as on any radio group; Tab moves between the two.
 */
export function ThemeSwitch({
  id,
  labelledBy,
  size = "md",
  className,
}: {
  id?: string;
  /** The id of a visible label; without one the control names itself "Theme". */
  labelledBy?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { state, ready, setThemeMode } = useLearner();
  const palette = paletteOf(state.theme);
  const appearance = appearanceOf(state.theme);
  const small = size === "sm";

  return (
    <div
      id={id}
      role="group"
      aria-label={labelledBy === undefined ? "Theme" : undefined}
      aria-labelledby={labelledBy}
      className={cx("flex flex-col", small ? "gap-2" : "gap-3", className)}
    >
      <Segments
        label="Palette"
        options={THEME_PALETTES}
        labels={PALETTE_LABELS}
        value={palette}
        onChange={(next) => setThemeMode(themeModeFor(next, appearance))}
        disabled={!ready}
        small={small}
      />
      <Segments
        label="Appearance"
        options={THEME_APPEARANCES}
        labels={APPEARANCE_LABELS}
        value={appearance}
        onChange={(next) => setThemeMode(themeModeFor(palette, next))}
        disabled={!ready}
        small={small}
      />
    </div>
  );
}

/** One axis: a visible caption and a segmented radio group labelled by it. */
function Segments<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
  disabled,
  small,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (next: T) => void;
  disabled: boolean;
  small: boolean;
}) {
  const captionId = useId();

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, option: T) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = options[(options.indexOf(option) + step + options.length) % options.length] as T;
    onChange(next);
    (event.currentTarget.parentElement?.querySelector(`[data-option="${next}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div className="flex flex-col gap-1">
      <span id={captionId} className={cx("font-medium text-text2", small ? "px-0.5 text-[11px]" : "text-[12px]")}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={captionId}
        className={cx("grid rounded-xl bg-surface2 p-0.5", small ? "gap-0.5" : "gap-1")}
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const on = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(option)}
              onKeyDown={(event) => onKeyDown(event, option)}
              data-option={option}
              className={cx(
                "rounded-[10px] font-medium transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:opacity-60",
                small ? "h-8 text-[12px]" : "h-10 text-[14px]",
                on ? "bg-surface text-text shadow-[0_1px_0_var(--lip-shade)]" : "text-text2 hover:text-text",
              )}
            >
              {labels[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
