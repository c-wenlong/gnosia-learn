"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { cx } from "@/components/ui/classes";

import { settingsHref, type SettingsTab } from "./tabs";

export type SettingsSection = { id: SettingsTab; label: string; glyph: GlyphName; content: ReactNode };

/**
 * The Settings page's sections as tabs, so the page is one short group at a
 * time rather than every card stacked. From 1280px the tabs are a column at
 * the left, as ChatGPT's settings draw them; below that, a row across the
 * top that scrolls sideways on a phone.
 *
 * Every panel stays mounted and only the chosen one is shown, so a key half
 * typed or a model list being edited survives a look at another tab. The
 * open tab is in the address (`?tab=`, General as the bare path) through
 * `replaceState`, so a reload or a link opens it and the back button does not
 * step through tabs. The tab row follows the WAI-ARIA tabs pattern: one tab
 * in the tab order, the arrows (either pair, since the row turns into a
 * column), Home and End move between them, and moving selects.
 */
export function SettingsTabs({ sections, initial }: { sections: SettingsSection[]; initial: SettingsTab }) {
  const base = useId();
  const [selected, setSelected] = useState(initial);
  // A link to another tab while the page is open (`/settings?tab=tutor` from
  // the tutor's style link) hands a new `initial`; follow it.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setSelected(initial);
  }
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function choose(id: SettingsTab) {
    setSelected(id);
    window.history.replaceState(null, "", settingsHref(id));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = sections.findIndex((section) => section.id === selected);
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % sections.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + sections.length) % sections.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = sections.length - 1;
    if (next < 0) return;
    event.preventDefault();
    choose(sections[next].id);
    buttons.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-8">
      <div
        role="tablist"
        aria-label="Settings"
        onKeyDown={onKeyDown}
        className={cx(
          "flex gap-1 overflow-x-auto border-b-2 border-border [scrollbar-width:none]",
          "xl:sticky xl:top-6 xl:w-[200px] xl:shrink-0 xl:flex-col xl:overflow-visible xl:border-b-0",
        )}
      >
        {sections.map((section, i) => {
          const active = section.id === selected;
          return (
            <button
              key={section.id}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${section.id}`}
              aria-selected={active}
              aria-controls={`${base}-panel-${section.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => choose(section.id)}
              className={cx(
                "relative -mb-0.5 flex shrink-0 items-center gap-2.5 border-b-2 px-3 py-3 text-[14px] whitespace-nowrap",
                "transition-colors duration-150 motion-reduce:transition-none",
                "focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent",
                "xl:mb-0 xl:h-10 xl:rounded-lg xl:border-b-0 xl:px-2.5 xl:py-0",
                active
                  ? "border-accent font-semibold text-text xl:bg-surface2"
                  : "border-transparent text-text2 hover:text-text xl:hover:bg-surface2",
              )}
            >
              <Glyph name={section.glyph} size={18} className={active ? "text-text" : "text-text2"} />
              {section.label}
            </button>
          );
        })}
      </div>
      {sections.map((section) => (
        <div
          key={section.id}
          role="tabpanel"
          id={`${base}-panel-${section.id}`}
          aria-labelledby={`${base}-tab-${section.id}`}
          hidden={section.id !== selected}
          className="settings-panel flex min-w-0 flex-1 flex-col gap-4"
        >
          {section.content}
        </div>
      ))}
    </div>
  );
}
