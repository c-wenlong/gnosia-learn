"use client";

import { useId, useState, type ReactNode } from "react";

import { cx } from "./classes";
import { tabIds } from "./roving";
import { TabList } from "./TabList";

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
 * keeps it while another tab is open. The tab row is the kit's `TabList`, so
 * its keys (the WAI-ARIA tabs pattern) and its look are the ones Settings and
 * the workspace's phone tabs have.
 *
 * A panel fades in as it is shown (`animate-fade-in`: a CSS animation runs
 * again whenever an element goes from `hidden` to shown), and the underline
 * crossfades from the old tab to the new with the colours.
 */
export function Tabs({ items, label, className }: { items: TabItem[]; label: string; className?: string }) {
  const base = useId();
  const [selected, setSelected] = useState(items[0]?.id ?? "");
  const current = items.some((item) => item.id === selected) ? selected : (items[0]?.id ?? "");

  return (
    <section
      className={cx("flex min-w-0 flex-col rounded-[20px] border-2 border-border bg-surface", className)}
      aria-label={label}
    >
      <TabList label={label} items={items} value={current} onChange={setSelected} idBase={base} className="px-3 sm:px-4" />
      {items.map((item) => {
        const ids = tabIds(base, item.id);
        return (
          <div
            key={item.id}
            role="tabpanel"
            id={ids.panel}
            aria-labelledby={ids.tab}
            hidden={item.id !== current}
            className="animate-fade-in px-3 py-4 motion-reduce:animate-none sm:px-5"
          >
            {item.content}
          </div>
        );
      })}
    </section>
  );
}
