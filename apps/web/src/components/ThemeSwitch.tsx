"use client";

import { useId } from "react";

import { cx } from "@/components/ui/classes";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
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
 * Each axis is the kit's `SegmentedControl` in its radio mode. A change
 * crossfades the page's colours (`fadeThemeChange`) instead of snapping, and
 * the face under the chosen option slides to the new one. Neither moves under
 * reduced motion.
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

/** One axis: a visible caption and the kit's segmented radio group labelled by it. */
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
  return (
    <div className="flex flex-col gap-1">
      <span id={captionId} className={cx("font-medium text-text2", "text-[12px]", small && "px-0.5")}>
        {label}
      </span>
      <SegmentedControl
        label={label}
        labelledBy={captionId}
        items={options.map((option) => ({ id: option, label: labels[option] }))}
        value={value}
        onChange={onChange}
        disabled={disabled}
        size={small ? "sm" : "md"}
        block
      />
    </div>
  );
}
