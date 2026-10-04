/**
 * The Settings page's tabs, in the order they are shown, and the `?tab=`
 * value that opens each. React-free so the server page and the tests can
 * read it without the client component.
 */
export const SETTINGS_TABS = ["general", "profile", "tutor", "data"] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

/**
 * The tab the address's `tab` values name (`URLSearchParams.getAll`): one
 * known value opens that tab; none, an unknown one or a repeated `tab` is
 * General.
 */
export function parseSettingsTab(values: string[]): SettingsTab {
  if (values.length !== 1) return "general";
  return SETTINGS_TABS.find((tab) => tab === values[0]) ?? "general";
}

/** The page's address with `tab` open. General is the bare path, so the plain link stays the canonical one. */
export function settingsHref(tab: SettingsTab): string {
  return tab === "general" ? "/settings" : `/settings?tab=${tab}`;
}
