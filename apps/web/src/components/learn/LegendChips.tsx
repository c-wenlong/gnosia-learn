"use client";

import { useState } from "react";

import { cx } from "@/components/ui/classes";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { LEGEND_GROUPS, type IndexFilter, type LegendGroup } from "@/lib/learn-index";

/**
 * The legend over a domain's picture (D9 of docs/proposals/domain-map.md): a
 * chip per group with its swatch and its count. Hovering or focusing one
 * previews its group in the picture, as a topic's title does (D5); pressing
 * one sets the Status filter to it, and pressing it again clears the filter.
 * `useLegendPreview` holds the preview; `DomainView` turns it into the set
 * of concepts the picture keeps lit.
 */

/**
 * Which chip the picture previews. A pointer's hover and a keyboard's focus
 * are kept apart, as the concept list keeps them (D7), so the pointer leaving
 * one chip does not take a focused chip's preview with it; whichever moved
 * last wins. A press settles both: the filter it commits shows on its own,
 * and the preview comes back only when the pointer or the focus does.
 */
export function useLegendPreview() {
  const [pointer, setPointer] = useState<LegendGroup | null>(null);
  const [focus, setFocus] = useState<LegendGroup | null>(null);
  const [last, setLast] = useState<"pointer" | "focus">("pointer");
  return {
    group: last === "focus" ? (focus ?? pointer) : (pointer ?? focus),
    enter: (group: LegendGroup) => {
      setPointer(group);
      setLast("pointer");
    },
    leave: () => setPointer(null),
    focus: (group: LegendGroup) => {
      setFocus(group);
      setLast("focus");
    },
    blur: () => setFocus(null),
    settle: () => {
      setPointer(null);
      setFocus(null);
    },
  };
}

export type LegendPreview = ReturnType<typeof useLegendPreview>;

/** The ready-to-learn swatch: the dashed accent ring the picture draws round a ready concept. */
function ReadyRing() {
  return (
    <svg aria-hidden="true" width={12} height={12} viewBox="0 0 12 12" className="shrink-0">
      <circle cx={6} cy={6} r={4.75} fill="none" className="stroke-accent" strokeWidth={1.5} strokeDasharray="3 2" />
    </svg>
  );
}

export function LegendChips({
  counts,
  filter,
  preview,
  onPress,
}: {
  counts: Readonly<Record<LegendGroup, number>>;
  /** The Status filter: a chip whose group it is shows pressed. */
  filter: IndexFilter;
  preview: LegendPreview;
  onPress: (group: LegendGroup) => void;
}) {
  return (
    <div role="group" aria-label="Show on the map" data-legend className="flex flex-wrap items-center gap-1.5">
      {LEGEND_GROUPS.map(({ key, label }) => {
        const on = filter === key;
        return (
          <button
            key={key}
            type="button"
            data-legend-chip={key}
            aria-pressed={on}
            aria-label={`${label}, ${counts[key]}`}
            onClick={() => {
              preview.settle();
              onPress(key);
            }}
            onMouseEnter={() => preview.enter(key)}
            onMouseLeave={preview.leave}
            onFocus={() => preview.focus(key)}
            onBlur={preview.blur}
            className={cx(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium whitespace-nowrap",
              "transition-[color,background-color,border-color] duration-150 motion-reduce:transition-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              on ? "border-accent bg-tint text-accent-text" : "border-border bg-surface text-text hover:bg-surface2",
            )}
          >
            {key === "ready" ? (
              <ReadyRing />
            ) : (
              <span aria-hidden="true" className="inline-flex">
                <MasteryDot bucket={key} size={10} />
              </span>
            )}
            <span>{label}</span>
            <span className={cx("tabular-nums", on ? "text-accent-text" : "text-text2")}>{counts[key]}</span>
          </button>
        );
      })}
    </div>
  );
}
