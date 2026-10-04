"use client";

import { useId, type KeyboardEvent } from "react";

import { cx } from "@/components/ui/classes";
import { useLearner } from "@/lib/learner-context";
import {
  APPEARANCE_LABELS,
  appearanceOf,
  fadeThemeChange,
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
 *
 * A change crossfades the page's colours (`fadeThemeChange`) instead of
 * snapping, and the pill under the chosen option slides to the new one.
 * Neither moves under reduced motion.
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
        onChange={(next) => {
          fadeThemeChange();
          setThemeMode(themeModeFor(next, appearance));
        }}
        disabled={!ready}
        small={small}
      />
      <Segments
        label="Appearance"
        options={THEME_APPEARANCES}
        labels={APPEARANCE_LABELS}
        value={appearance}
        onChange={(next) => {
          fadeThemeChange();
          setThemeMode(themeModeFor(palette, next));
        }}
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
  const index = Math.max(0, options.indexOf(value));
  // The gap between options, in px, for the pill's width and its slide.
  const gap = small ? 2 : 4;

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
        className={cx("relative grid rounded-xl bg-surface2 p-0.5", small ? "gap-0.5" : "gap-1")}
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {/* The chosen option's face, one pill that slides between options
            rather than a background that jumps. One option's width, moved
            by whole options and gaps. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-[10px] bg-surface shadow-[0_1px_0_var(--lip-shade)] transition-[translate] duration-200 ease-soft motion-reduce:transition-none"
          style={{
            width: `calc((100% - 4px - ${gap * (options.length - 1)}px) / ${options.length})`,
            translate: `calc(${index} * (100% + ${gap}px)) 0`,
          }}
        />
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
                "relative rounded-[10px] font-medium transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:opacity-60",
                small ? "h-8 text-[12px]" : "h-10 text-[14px]",
                on ? "text-text" : "text-text2 hover:text-text",
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
