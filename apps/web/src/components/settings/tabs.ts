/**
 * The Settings page's tabs, in the order they are shown, and the `?tab=`
 * value that opens each. React-free so the server page and the tests can
 * read it without the client component.
 */
export const SETTINGS_TABS = ["general", "profile", "tutor", "data"] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** The tab a `?tab=` value names; anything else, a repeated one included, is General. */
export function parseSettingsTab(value: string | string[] | undefined): SettingsTab {
  return SETTINGS_TABS.find((tab) => tab === value) ?? "general";
}

/** The page's address with `tab` open. General is the bare path, so the plain link stays the canonical one. */
export function settingsHref(tab: SettingsTab): string {
  return tab === "general" ? "/settings" : `/settings?tab=${tab}`;
}
