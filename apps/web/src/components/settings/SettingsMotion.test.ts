// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { SettingsSnapshot } from "@/lib/settings";

/**
 * Settings' motion choice is applied, not only stored: the cookie the root
 * layout reads and `data-motion` on <html>, at once, and brought in line with
 * the stored row on the page's first render. And the Reset progress confirm
 * folds open and shut, with focus coming back to the button that opened it.
 */

const learner = vi.hoisted(() => ({ resetCourse: vi.fn() }));
vi.mock("@/lib/learner-context", () => ({
  useLearner: () => ({
    state: { theme: "light", displayName: undefined },
    ready: true,
    setThemeMode: vi.fn(),
    setDisplayName: vi.fn(),
    resetCourse: learner.resetCourse,
  }),
}));

const { SettingsForm } = await import("./SettingsForm");
const { MOTION_COOKIE, readMotionCookie } = await import("@/lib/motion");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  learner.resetCourse.mockReset().mockResolvedValue(true);
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.motion;
  document.cookie = `${MOTION_COOKIE}=; Path=/; Max-Age=0`;
});

function settings(over: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
  return { reachable: true, tutorStyle: "guide-concise", motion: "system", bkt: null, ...over };
}

function mount(snapshot: SettingsSnapshot) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(createElement(SettingsForm, { settings: snapshot, providers: [], chain: false, topicIds: ["t1"] })));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

function choose(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const motionSelect = (container: HTMLElement) =>
  [...container.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "always"))!;

describe("the motion setting", () => {
  it("applies Always reduce motion at once, as the cookie and data-motion, and saves it", async () => {
    const container = mount(settings());
    choose(motionSelect(container), "always");
    expect(document.documentElement.dataset.motion).toBe("reduce");
    expect(readMotionCookie()).toBe("always");
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith("/api/learner/preference", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ key: "reducedMotion", value: "always" });

    choose(motionSelect(container), "system");
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    expect(readMotionCookie()).toBe("system");
  });

  it("no longer says the choice is not applied", () => {
    const container = mount(settings());
    expect(container.textContent).not.toContain("not applied");
    expect(container.textContent).toContain("Always reduce motion stops the app's animations");
  });

  it("brings a browser's cookie in line with the stored row, and leaves it when the row was not read", () => {
    mount(settings({ motion: "always" }));
    expect(readMotionCookie()).toBe("always");
    expect(document.documentElement.dataset.motion).toBe("reduce");

    document.cookie = `${MOTION_COOKIE}=; Path=/; Max-Age=0`;
    delete document.documentElement.dataset.motion;
    mount(settings({ reachable: false, motion: "system" }));
    expect(readMotionCookie()).toBeNull();
  });
});

describe("Reset progress", () => {
  it("folds the confirm open and shut, and gives focus back to the button on Cancel", () => {
    const container = mount(settings());
    const toggle = [...container.querySelectorAll("button")].find((b) => b.textContent === "Reset progress")!;
    const fold = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(fold.hasAttribute("inert")).toBe(true);

    act(() => toggle.click());
    expect(fold.hasAttribute("inert")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    const cancel = [...fold.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!;
    act(() => cancel.focus());
    act(() => cancel.click());
    expect(fold.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it("says the reset in a live line, and closes the confirm", async () => {
    const container = mount(settings());
    const toggle = [...container.querySelectorAll("button")].find((b) => b.textContent === "Reset progress")!;
    act(() => toggle.click());
    const go = [...container.querySelectorAll("button")].find((b) => b.textContent === "Reset every course")!;
    await act(async () => go.click());
    expect(learner.resetCourse).toHaveBeenCalledWith(["t1"]);
    const live = [...container.querySelectorAll('[aria-live="polite"]')].map((p) => p.textContent);
    expect(live).toContain("Progress reset. Ticks and notes are cleared.");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
