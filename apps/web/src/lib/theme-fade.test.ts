// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fadeThemeChange, THEME_FADE_MS } from "@/lib/theme-cookie";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.documentElement.classList.remove("theme-fade");
  delete document.documentElement.dataset.motion;
});

describe("fadeThemeChange", () => {
  it("puts theme-fade on <html> for one beat and takes it off again", () => {
    fadeThemeChange();
    expect(document.documentElement.classList.contains("theme-fade")).toBe(true);
    vi.advanceTimersByTime(THEME_FADE_MS - 1);
    // A second change inside the beat extends it rather than cutting it short.
    fadeThemeChange();
    vi.advanceTimersByTime(THEME_FADE_MS - 1);
    expect(document.documentElement.classList.contains("theme-fade")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(document.documentElement.classList.contains("theme-fade")).toBe(false);
  });

  it("does nothing when motion is reduced", () => {
    document.documentElement.dataset.motion = "reduce";
    fadeThemeChange();
    expect(document.documentElement.classList.contains("theme-fade")).toBe(false);
  });
});
