import { describe, expect, it } from "vitest";

import {
  appearanceOf,
  asThemeMode,
  paletteOf,
  THEME_APPEARANCES,
  THEME_MODES,
  THEME_PALETTES,
  themeModeFor,
} from "./shared";

describe("theme modes", () => {
  it("keeps the four stored names meaning what they meant", () => {
    expect([paletteOf("light"), appearanceOf("light")]).toEqual(["classic", "light"]);
    expect([paletteOf("dark"), appearanceOf("dark")]).toEqual(["classic", "dark"]);
    expect([paletteOf("system"), appearanceOf("system")]).toEqual(["classic", "system"]);
    expect([paletteOf("gnosia"), appearanceOf("gnosia")]).toEqual(["gnosia", "light"]);
  });

  it("names the two Gnosia modes that follow a dark or a device appearance", () => {
    expect(themeModeFor("gnosia", "dark")).toBe("gnosia-dark");
    expect(themeModeFor("gnosia", "system")).toBe("gnosia-system");
    expect([paletteOf("gnosia-dark"), appearanceOf("gnosia-dark")]).toEqual(["gnosia", "dark"]);
    expect([paletteOf("gnosia-system"), appearanceOf("gnosia-system")]).toEqual(["gnosia", "system"]);
  });

  it("is a bijection between the modes and every palette and appearance pair", () => {
    const seen = new Set<string>();
    for (const palette of THEME_PALETTES) {
      for (const appearance of THEME_APPEARANCES) {
        const mode = themeModeFor(palette, appearance);
        expect(asThemeMode(mode)).toBe(mode);
        expect(paletteOf(mode)).toBe(palette);
        expect(appearanceOf(mode)).toBe(appearance);
        seen.add(mode);
      }
    }
    expect([...seen].sort()).toEqual([...THEME_MODES].sort());
    for (const mode of THEME_MODES) expect(themeModeFor(paletteOf(mode), appearanceOf(mode))).toBe(mode);
  });

  it("accepts exactly the six modes", () => {
    for (const mode of THEME_MODES) expect(asThemeMode(mode)).toBe(mode);
    for (const bad of [undefined, null, "", "classic", "gnosia-light", "Gnosia-dark", "dark ", 1, {}]) {
      expect(asThemeMode(bad)).toBeNull();
    }
  });
});
