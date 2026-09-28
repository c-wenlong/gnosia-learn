"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "@/components/ui/classes";

export type TabItem = {
  id: string;
  label: ReactNode;
  /** A small number beside the label, such as how many rows the panel lists. */
  count?: number;
  content: ReactNode;
};

/**
 * One card with a row of tabs across its top, for sections that would
 * otherwise stack as separate cards.
 *
 * Every panel stays mounted and only the chosen one is shown, so a panel with
 * state of its own (the transcript following playback, a scroll position)
 * keeps it while another tab is open. The tab row follows the WAI-ARIA tabs
 * pattern: one tab in the tab order, arrows, Home and End move between them,
 * and moving selects.
 */
export function Tabs({ items, label, className }: { items: TabItem[]; label: string; className?: string }) {
  const base = useId();
  const [selected, setSelected] = useState(items[0]?.id ?? "");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = items.some((item) => item.id === selected) ? selected : (items[0]?.id ?? "");

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.id === current);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    setSelected(items[next].id);
    buttons.current[next]?.focus();
  }

  return (
    <section
      className={cx("flex min-w-0 flex-col rounded-[20px] border-2 border-border bg-surface", className)}
      aria-label={label}
    >
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b-2 border-border px-3 sm:px-4"
      >
        {items.map((item, i) => {
          const active = item.id === current;
          return (
            <button
              key={item.id}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.id}`}
              aria-selected={active}
              aria-controls={`${base}-panel-${item.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setSelected(item.id)}
              className={cx(
                "relative -mb-0.5 flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-[14px] font-semibold whitespace-nowrap transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent motion-reduce:transition-none",
                active ? "border-accent text-text" : "border-transparent text-text2 hover:text-text",
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span className="text-[12px] font-normal tabular-nums text-text3">{item.count}</span>
              )}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${base}-panel-${item.id}`}
          aria-labelledby={`${base}-tab-${item.id}`}
          hidden={item.id !== current}
          className="px-3 py-4 sm:px-5"
        >
          {item.content}
        </div>
      ))}
    </section>
  );
}
