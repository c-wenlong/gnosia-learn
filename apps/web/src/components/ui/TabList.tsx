"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "./classes";
import { Glyph, type GlyphName } from "./Glyph";
import { tabIds, tabKeyIndex } from "./roving";
import { useMediaQuery } from "./use-media-query";

export type TabListItem<T extends string = string> = {
  id: T;
  label: ReactNode;
  /** A mark before the label (Settings' sections). */
  glyph?: GlyphName;
  /** A small number beside the label, such as how many rows the panel lists. */
  count?: number;
};

/**
 * `horizontal`, a row (Left, Right, Home, End). `responsive`, a row that
 * becomes a column from 1280px, a rail of rounded rows at the page's left
 * (Settings): either pair of arrows moves, since which pair reads as "next"
 * changes with the width, and `aria-orientation` follows the width.
 */
export type TabListOrientation = "horizontal" | "responsive";

/** The `xl` breakpoint, where a `responsive` row becomes a column. */
const WIDE = "(min-width: 1280px)";

/**
 * Kit `TabList`: the row of tabs, and nothing under it. The caller draws the
 * panels (each `role="tabpanel"`, with the ids `tabIds(idBase, id)` gives),
 * since where they sit and how they hide differs: `Tabs` keeps them in a
 * card, Settings beside the rail, the workspace in its three-column grid.
 *
 * The WAI-ARIA tabs pattern: one tab in the tab order, the arrows, Home and
 * End move between them, and moving selects (`onChange`, then the focus).
 * The look is the kit's underline: a 2px accent line under the chosen tab,
 * crossfading with the colours to the next. Every label is one weight
 * (medium), so choosing a tab never shifts the row; the chosen one is told by
 * its line and its ink. From 1280px a `responsive` row is a 200px column
 * whose chosen row takes the `--surface2` face instead of the line.
 */
export function TabList<T extends string>({
  label,
  items,
  value,
  onChange,
  idBase,
  orientation = "horizontal",
  className,
}: {
  /** The row's accessible name. */
  label: string;
  items: readonly TabListItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** One `useId()` the caller shares with its panels, through `tabIds`. */
  idBase: string;
  orientation?: TabListOrientation;
  className?: string;
}) {
  const responsive = orientation === "responsive";
  const vertical = useMediaQuery(WIDE, false) && responsive;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.id === value);
    const next = tabKeyIndex(event.key, index, items.length, responsive ? "both" : "horizontal", true);
    if (next < 0) return;
    event.preventDefault();
    onChange(items[next].id);
    buttons.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      onKeyDown={onKeyDown}
      className={cx(
        "flex gap-1 overflow-x-auto border-b-2 border-border [scrollbar-width:none]",
        responsive && "xl:sticky xl:top-6 xl:w-[200px] xl:shrink-0 xl:flex-col xl:overflow-visible xl:border-b-0",
        className,
      )}
    >
      {items.map((item, i) => {
        const active = item.id === value;
        const ids = tabIds(idBase, item.id);
        return (
          <button
            key={item.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="tab"
            id={ids.tab}
            aria-selected={active}
            aria-controls={ids.panel}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cx(
              "relative -mb-0.5 flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-[14px] font-medium whitespace-nowrap",
              "transition-colors duration-150 motion-reduce:transition-none",
              "focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent",
              responsive && "xl:mb-0 xl:h-10 xl:gap-2.5 xl:rounded-lg xl:border-b-0 xl:px-2.5 xl:py-0",
              active ? "border-accent text-text" : "border-transparent text-text2 hover:text-text",
              responsive && (active ? "xl:bg-surface2" : "xl:hover:bg-surface2"),
            )}
          >
            {item.glyph !== undefined && (
              <Glyph name={item.glyph} size={18} className={cx("shrink-0", active ? "text-text" : "text-text2")} />
            )}
            {item.label}
            {item.count !== undefined && (
              <span className="text-[12px] font-normal tabular-nums text-text3">{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
