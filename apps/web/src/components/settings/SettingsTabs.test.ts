// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { SettingsTabs, type SettingsSection } from "./SettingsTabs";
import { parseSettingsTab, settingsHref } from "./tabs";

/**
 * The Settings tabs: `?tab=` picks the open one, a press or an arrow moves it
 * and writes the address, and every panel stays mounted.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

function mount(initial: SettingsSection["id"]) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const draw = (tab: SettingsSection["id"]) => act(() => root.render(createElement(SettingsTabs, { sections: SECTIONS, initial: tab })));
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
    expect(parseSettingsTab("tutor")).toBe("tutor");
    expect(parseSettingsTab(undefined)).toBe("general");
    expect(parseSettingsTab("nope")).toBe("general");
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

  it("follows a new tab from the server, as a link to another tab hands it", () => {
    const { draw, shown } = mount("general");
    draw("tutor");
    expect(shown()).toEqual(["tutor body"]);
  });
});
