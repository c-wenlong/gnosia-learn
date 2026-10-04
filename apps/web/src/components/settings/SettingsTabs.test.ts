// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { parseSettingsTab, settingsHref } from "./tabs";

// The address as Next's router reports it, which Next keeps in step with
// `replaceState`; here it is read straight from jsdom's location.
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

const { SettingsTabs } = await import("./SettingsTabs");
type SettingsSection = import("./SettingsTabs").SettingsSection;

/**
 * The Settings tabs: `?tab=` picks the open one, a press or an arrow moves it
 * and writes the address, and every panel stays mounted.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no matchMedia; a narrow screen, which never changes.
  window.matchMedia = ((query: string) =>
    ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
});

const SECTIONS: SettingsSection[] = [
  { id: "general", label: "General", glyph: "sliders", content: "general body" },
  { id: "profile", label: "Profile", glyph: "person", content: "profile body" },
  { id: "tutor", label: "Tutor", glyph: "chat", content: "tutor body" },
  { id: "data", label: "Data", glyph: "data", content: "data body" },
];

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  window.history.replaceState(null, "", "/settings");
});

/** Mount at `/settings?tab=<initial>`; `draw(tab)` is a navigation to that tab's address while the page is open. */
function mount(initial: SettingsSection["id"]) {
  window.history.replaceState(null, "", settingsHref(initial));
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const draw = (tab: SettingsSection["id"]) => {
    window.history.replaceState(null, "", settingsHref(tab));
    act(() => root.render(createElement(SettingsTabs, { sections: SECTIONS })));
  };
  draw(initial);
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const shown = () => [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter((p) => !p.hidden).map((p) => p.textContent);
  return { container, draw, tabs, shown };
}

describe("parseSettingsTab", () => {
  it("reads a known tab and falls back to General for anything else", () => {
    expect(parseSettingsTab(["tutor"])).toBe("tutor");
    expect(parseSettingsTab([])).toBe("general");
    expect(parseSettingsTab(["nope"])).toBe("general");
    expect(parseSettingsTab(["tutor", "data"])).toBe("general");
  });

  it("keeps General at the bare path", () => {
    expect(settingsHref("general")).toBe("/settings");
    expect(settingsHref("data")).toBe("/settings?tab=data");
  });
});

describe("SettingsTabs", () => {
  it("opens the tab it is given and keeps every panel mounted", () => {
    const { tabs, shown, container } = mount("tutor");
    expect(shown()).toEqual(["tutor body"]);
    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(4);
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, -1, 0, -1]);
    expect(tabs()[2].getAttribute("aria-selected")).toBe("true");
  });

  it("switches on a press and writes the address", () => {
    const { tabs, shown } = mount("general");
    act(() => tabs()[3].click());
    expect(shown()).toEqual(["data body"]);
    expect(window.location.pathname + window.location.search).toBe("/settings?tab=data");
    act(() => tabs()[0].click());
    expect(window.location.search).toBe("");
  });

  it("moves with either pair of arrows, Home and End, wrapping at the ends", () => {
    const { tabs, shown } = mount("general");
    const press = (key: string) =>
      act(() => {
        document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
    act(() => tabs()[0].focus());
    press("ArrowDown");
    expect(shown()).toEqual(["profile body"]);
    expect(document.activeElement).toBe(tabs()[1]);
    press("ArrowRight");
    expect(shown()).toEqual(["tutor body"]);
    press("End");
    expect(shown()).toEqual(["data body"]);
    press("ArrowDown");
    expect(shown()).toEqual(["general body"]);
    press("ArrowUp");
    expect(shown()).toEqual(["data body"]);
    press("Home");
    expect(shown()).toEqual(["general body"]);
  });

  it("follows a link to another tab while the page is open", () => {
    const { draw, shown } = mount("general");
    draw("tutor");
    expect(shown()).toEqual(["tutor body"]);
  });

  it("goes back to General on a link to the bare path after a press chose another tab", () => {
    const { draw, tabs, shown } = mount("general");
    act(() => tabs()[2].click());
    expect(shown()).toEqual(["tutor body"]);
    draw("general");
    expect(shown()).toEqual(["general body"]);
  });

  it("opens General for a repeated tab in the address", () => {
    window.history.replaceState(null, "", "/settings?tab=tutor&tab=data");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(createElement(SettingsTabs, { sections: SECTIONS })));
    mounted.push(() => {
      act(() => root.unmount());
      container.remove();
    });
    const shown = [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter((p) => !p.hidden);
    expect(shown.map((p) => p.textContent)).toEqual(["general body"]);
  });

  it("says the row is horizontal when the screen is narrow", () => {
    const { container } = mount("general");
    expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-orientation")).toBe("horizontal");
  });
});
