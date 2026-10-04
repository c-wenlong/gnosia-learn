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

describe("custom providers (docs/TUTOR-MODELS.md, T14)", () => {
  it("takes an https base URL, or http to this machine only, trimmed of a trailing slash", async () => {
    const { checkBaseUrl } = await import("./shared");
    expect(checkBaseUrl(" https://api.example.com/v1/ ")).toEqual({ ok: true, url: "https://api.example.com/v1" });
    expect(checkBaseUrl("http://localhost:11434/v1")).toEqual({ ok: true, url: "http://localhost:11434/v1" });
    expect(checkBaseUrl("http://127.0.0.1:1234/v1")).toMatchObject({ ok: true });
    expect(checkBaseUrl("http://[::1]:8080/v1")).toMatchObject({ ok: true });
    for (const bad of [
      "http://api.example.com/v1",
      "http://localhost.evil.example/v1",
      "ftp://api.example.com",
      "https://user:pass@api.example.com/v1",
      "https://api.example.com/v1?key=abc",
      "https://api.example.com/v1#x",
      "not a url",
      "",
      `https://a.example/${"x".repeat(300)}`,
      42,
    ]) {
      const result = checkBaseUrl(bad);
      expect(result.ok, String(bad).slice(0, 40)).toBe(false);
      if (!result.ok && typeof bad === "string" && bad.length > 8) expect(result.reason).not.toContain(bad);
    }
  });

  it("names a custom provider's id from its name, unique among the owner's", async () => {
    const { customProviderId, isCustomProviderId, isProviderName } = await import("./shared");
    expect(customProviderId("My Gateway!", [])).toBe("custom-my-gateway");
    expect(customProviderId("My Gateway", ["custom-my-gateway"])).toBe("custom-my-gateway-2");
    expect(customProviderId("My Gateway", ["custom-my-gateway", "custom-my-gateway-2"])).toBe("custom-my-gateway-3");
    expect(customProviderId("日本語", [])).toBe("custom-provider");
    expect(isCustomProviderId(customProviderId("x".repeat(80), []))).toBe(true);
    expect(isProviderName("openai")).toBe(true);
    expect(isProviderName("custom-ok")).toBe(true);
    for (const bad of ["custom-", "custom--x", "custom-X", "custom-a-", "openai2", "custom_a"]) expect(isProviderName(bad), bad).toBe(false);
  });

  it("takes a name of 1 to 60 printable characters, spaces collapsed", async () => {
    const { checkProviderLabel } = await import("./shared");
    expect(checkProviderLabel("  My   gateway ")).toEqual({ ok: true, label: "My gateway" });
    expect(checkProviderLabel("").ok).toBe(false);
    expect(checkProviderLabel("x".repeat(61)).ok).toBe(false);
    expect(checkProviderLabel("bad\u0007name").ok).toBe(false);
  });
});
