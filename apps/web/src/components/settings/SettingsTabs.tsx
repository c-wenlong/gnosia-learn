"use client";

import { useSearchParams } from "next/navigation";
import { useId, useState, type ReactNode } from "react";

import type { GlyphName } from "@/components/ui/Glyph";
import { tabIds } from "@/components/ui/roving";
import { TabList } from "@/components/ui/TabList";

import { parseSettingsTab, settingsHref, type SettingsTab } from "./tabs";

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
 * step through tabs. The address is what decides: Next keeps
 * `useSearchParams` in step with `replaceState`, so a link to the page
 * already open (the account menu's bare `/settings` while Tutor shows)
 * changes the tab too. The tab row is the kit's `TabList` with
 * `orientation="responsive"`: the WAI-ARIA tabs pattern, either pair of
 * arrows (since the row turns into a column), Home and End, moving selects.
 */
export function SettingsTabs({ sections }: { sections: SettingsSection[] }) {
  const base = useId();
  const asked = parseSettingsTab(useSearchParams()?.getAll("tab") ?? []);
  // A press sets the tab at once rather than waiting for the address to come
  // back round; any change of address after that (a link, the press's own
  // `replaceState`) sets it again.
  const [selected, setSelected] = useState(asked);
  const [seen, setSeen] = useState(asked);
  if (asked !== seen) {
    setSeen(asked);
    setSelected(asked);
  }

  function choose(id: SettingsTab) {
    setSelected(id);
    window.history.replaceState(null, "", settingsHref(id));
  }

  return (
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-8">
      <TabList label="Settings" items={sections} value={selected} onChange={choose} idBase={base} orientation="responsive" />
      {sections.map((section) => {
        const ids = tabIds(base, section.id);
        return (
          <div
            key={section.id}
            role="tabpanel"
            id={ids.panel}
            aria-labelledby={ids.tab}
            hidden={section.id !== selected}
            className="settings-panel flex min-w-0 flex-1 flex-col gap-4"
          >
            {section.content}
          </div>
        );
      })}
    </div>
  );
}
