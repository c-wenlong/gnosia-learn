// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Course } from "@/lib/types";

// The learner's ticks decide the current module; none ticked is a new course.
const learner = {
  state: { completed: {} as Record<string, true>, userResources: {}, notes: {}, epoch: 0 },
  toggleTopicCompletion: vi.fn(),
  updateNote: vi.fn(),
  resetCourse: vi.fn(),
};
vi.mock("@/lib/learner-context", () => ({ useLearner: () => learner }));
// Children that talk to the server; not what this suite is about.
vi.mock("@/components/VisitTracker", () => ({ VisitTracker: () => null }));
vi.mock("@/components/ResetCourseButton", () => ({ ResetCourseButton: () => null }));
vi.mock("@/components/ResourceList", () => ({ ResourceList: () => null }));
vi.mock("@/components/TopicRecap", () => ({ TopicRecap: () => null }));

const { CoursePath } = await import("./CoursePath");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const topic = (id: string) => ({ id, title: id, concepts: [], subtopics: [] });
const mod = (n: number) => ({
  id: `m${n}`,
  slug: `m${n}`,
  title: `Module ${n} title`,
  order: n,
  topic: "t",
  topics: [topic(`m${n}-a`), topic(`m${n}-b`)],
  resources: [],
});
const course = {
  id: "c",
  slug: "c",
  code: "C1",
  title: "Course",
  credits: 4,
  order: 0,
  inferred: false,
  tags: [],
  modules: [mod(1), mod(2), mod(3)],
  capstone: "",
} as unknown as Course;

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  learner.state.completed = {};
});

function render() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const draw = () =>
    act(() =>
      root.render(createElement(CoursePath, { course, mastery: {}, modules: {}, assetsReachable: true, related: [] })),
    );
  draw();
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, draw };
}

/** Each module's body: open when not inert. */
function openModules(host: HTMLElement): boolean[] {
  return [...host.querySelectorAll("section[aria-label^='Module']")].map(
    (section) => !(section.querySelector(":scope > [inert]") !== null),
  );
}

function toggle(host: HTMLElement, n: number): HTMLButtonElement {
  return host.querySelector(`button[aria-label$="Module ${n}: Module ${n} title"]`) as HTMLButtonElement;
}

describe("CoursePath modules", () => {
  it("opens only the current module on a new course", () => {
    const { host } = render();
    expect(openModules(host)).toEqual([true, false, false]);
    expect(toggle(host, 1).getAttribute("aria-expanded")).toBe("true");
    expect(toggle(host, 2).getAttribute("aria-expanded")).toBe("false");
  });

  it("opens and shuts a module from its chevron or its header, but not from its actions", () => {
    const { host } = render();
    act(() => toggle(host, 2).click());
    expect(openModules(host)).toEqual([true, true, false]);

    const header = toggle(host, 1).closest("section")!.querySelector("h2") as HTMLElement;
    act(() => header.click());
    expect(openModules(host)[0]).toBe(false);

    // The Guidebook button keeps its own meaning, and opens a shut card to show it.
    const guidebook = [...toggle(host, 1).closest("section")!.querySelectorAll("button")].find(
      (b) => b.textContent === "Guidebook",
    )!;
    act(() => guidebook.click());
    expect(openModules(host)[0]).toBe(true);
  });

  it("opens the module a row of the Modules card asks for, again after it was shut", () => {
    const { host } = render();
    const row = [...host.querySelectorAll("a")].find((a) => a.textContent?.startsWith("M3 "))!;
    act(() => row.click());
    expect(openModules(host)[2]).toBe(true);
    act(() => toggle(host, 3).click());
    expect(openModules(host)[2]).toBe(false);
    act(() => row.click());
    expect(openModules(host)[2]).toBe(true);
  });

  it("leaves the page as it is on a click that opens the row elsewhere", () => {
    const { host } = render();
    const row = [...host.querySelectorAll("a")].find((a) => a.textContent?.startsWith("M3 "))!;
    act(() => {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }));
    });
    expect(openModules(host)[2]).toBe(false);
  });

  it("opens the module a hash names when the page is arrived at with one", () => {
    window.location.hash = "#m3";
    try {
      const { host } = render();
      expect(openModules(host)).toEqual([true, false, true]);
    } finally {
      window.location.hash = "";
    }
  });

  it("opens the next module when it becomes the current one, and leaves the first as it was", () => {
    const { host, draw } = render();
    learner.state.completed = { "m1-a": true, "m1-b": true };
    draw();
    expect(openModules(host)).toEqual([true, true, false]);
  });
});
