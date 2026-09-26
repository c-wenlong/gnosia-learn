import { describe, expect, it } from "vitest";

import { asThemeMode, SYSTEM_THEME_SCRIPT, THEME_LABELS, THEME_MODES, themeClass } from "./theme-cookie";

describe("asThemeMode", () => {
  it("accepts exactly the four modes", () => {
    for (const mode of THEME_MODES) expect(asThemeMode(mode)).toBe(mode);
    for (const bad of [undefined, null, "", "Dark", "chartreuse", 1, {}]) expect(asThemeMode(bad)).toBeNull();
  });

  it("has a label for every mode", () => {
    for (const mode of THEME_MODES) expect(THEME_LABELS[mode]).toBeTruthy();
  });
});

describe("themeClass", () => {
  it("resolves the three fixed modes regardless of the device", () => {
    for (const prefersDark of [false, true]) {
      expect(themeClass("light", prefersDark)).toBe("");
      expect(themeClass("gnosia", prefersDark)).toBe("gnosia");
      expect(themeClass("dark", prefersDark)).toBe("dark");
    }
  });

  it("lets the device decide under system", () => {
    expect(themeClass("system", false)).toBe("");
    expect(themeClass("system", true)).toBe("dark");
  });
});

describe("SYSTEM_THEME_SCRIPT", () => {
  const run = (theme: string, matches: boolean | undefined) => {
    const classList = new Set<string>();
    const document = { documentElement: { dataset: { theme }, classList: { add: (c: string) => classList.add(c) } } };
    const window = matches === undefined ? {} : { matchMedia: () => ({ matches }) };
    new Function("document", "window", SYSTEM_THEME_SCRIPT)(document, window);
    return [...classList];
  };

  it("adds dark only for a system mode on a dark device", () => {
    expect(run("system", true)).toEqual(["dark"]);
    expect(run("system", false)).toEqual([]);
    expect(run("light", true)).toEqual([]);
    expect(run("gnosia", true)).toEqual([]);
  });

  it("swallows a browser without matchMedia", () => {
    expect(() => run("system", undefined)).not.toThrow();
  });
});
