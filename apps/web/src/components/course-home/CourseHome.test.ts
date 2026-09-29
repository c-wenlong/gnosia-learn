// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Course } from "@/lib/types";

// The learner's ticks decide the current module; none ticked is a new course.
const learner = {
  state: { completed: {} as Record<string, true>, userResources: {}, notes: {}, knowledge: {}, epoch: 0 },
  toggleTopicCompletion: vi.fn(),
  updateNote: vi.fn(),
  addResource: vi.fn(),
  removeResource: vi.fn(),
  resetCourse: vi.fn(),
};
vi.mock("@/lib/learner-context", () => ({ useLearner: () => learner }));
const router = { replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// Children that talk to the server; not what this suite is about.
vi.mock("@/components/VisitTracker", () => ({ VisitTracker: () => null }));
vi.mock("@/components/ResetCourseButton", () => ({ ResetCourseButton: () => null }));
vi.mock("@/components/TopicRecap", () => ({ TopicRecap: () => null }));

const { CourseHome } = await import("./CourseHome");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const topic = (id: string) => ({ id, title: `Topic ${id}`, concepts: [], subtopics: [`${id} covers this`] });
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
  learner.updateNote.mockClear();
  router.replace.mockClear();
  window.location.hash = "";
});

/** Types into a React-controlled textarea: the value setter React tracks, then an input event. */
function type(field: HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function render(moduleSlug?: string) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const draw = () =>
    act(() =>
      root.render(
        createElement(CourseHome, { course, moduleSlug, mastery: {}, modules: {}, assetsReachable: true, related: [] }),
      ),
    );
  draw();
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, draw };
}

const heading = (host: HTMLElement) => host.querySelector("h1")?.textContent;

/** The sidebar's module rows. */
function sidebarRows(host: HTMLElement): HTMLAnchorElement[] {
  return [...host.querySelectorAll<HTMLAnchorElement>("nav[aria-label='Course material'] ol a")];
}

function topicToggle(host: HTMLElement, id: string): HTMLButtonElement {
  return [...host.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].find((b) =>
    b.textContent?.startsWith(`Topic ${id}`),
  )!;
}

const mark = (el: Element) => el.querySelector("[role=img]")?.getAttribute("aria-label");

describe("CourseHome", () => {
  it("shows the module the learner is on at the course's own URL", () => {
    expect(heading(render().host)).toBe("Module 1 title");
    mounted.pop()?.();

    learner.state.completed = { "m1-a": true, "m1-b": true };
    expect(heading(render().host)).toBe("Module 2 title");
  });

  it("keeps the module it opened on when that module is finished while the page is open", () => {
    const { host, draw } = render();
    learner.state.completed = { "m1-a": true, "m1-b": true };
    draw();
    expect(heading(host)).toBe("Module 1 title");
  });

  it("shows the module the URL names, and tints its row in the sidebar", () => {
    learner.state.completed = { "m1-a": true, "m2-a": true };
    const { host } = render("m3");
    expect(heading(host)).toBe("Module 3 title");
    const rows = sidebarRows(host);
    expect(rows.map((a) => a.getAttribute("href"))).toEqual(["/courses/c/m1", "/courses/c/m2", "/courses/c/m3"]);
    expect(rows.map((a) => a.getAttribute("aria-current"))).toEqual([null, null, "page"]);
    expect(rows[2]!.className).toContain("bg-tint");
    expect(rows.map((a) => a.textContent?.trim().slice(-3))).toEqual(["1/2", "1/2", "0/2"]);
  });

  it("marks each module row's standing", () => {
    learner.state.completed = { "m1-a": true, "m1-b": true, "m2-a": true };
    const { host } = render();
    expect(sidebarRows(host).map(mark)).toEqual(["Done", "In progress", "Not started"]);
  });

  it("says which module unlocks a locked one, and still lists its topics", () => {
    const { host } = render("m2");
    const note = [...host.querySelectorAll("p")].find((p) => p.textContent?.startsWith("Opens once you start"));
    expect(note?.querySelector("a")?.getAttribute("href")).toBe("/courses/c/m1");
    expect(topicToggle(host, "m2-a")).toBeTruthy();
    expect(mark(sidebarRows(host)[1]!)).toBe("Locked");
  });

  it("has no locked note on a module that is open", () => {
    const { host } = render("m1");
    expect(host.textContent).not.toContain("Opens once you start");
  });

  it("puts Continue on the active topic's row only, tinted", () => {
    learner.state.completed = { "m1-a": true };
    const { host } = render("m1");
    const active = topicToggle(host, "m1-b").parentElement!;
    expect(active.className).toContain("bg-tint");
    expect([...active.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Continue"]);
    expect(topicToggle(host, "m1-a").parentElement!.querySelector("a")).toBeNull();
    expect(mark(topicToggle(host, "m1-a"))).toBe("Done");
    expect(mark(topicToggle(host, "m1-b"))).toBe("Not started");
  });

  it("opens a topic's tools from its row", () => {
    const { host } = render("m1");
    const toggle = topicToggle(host, "m1-a");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(host.textContent).not.toContain("Mark done");
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = host.querySelector(`#${CSS.escape(toggle.getAttribute("aria-controls")!)}`)!;
    expect(panel.textContent).toContain("Mark done");
    expect(panel.textContent).toContain("m1-a covers this");
  });

  it("links the modules either side of the one on screen", () => {
    const { host } = render("m2");
    const nav = host.querySelector("nav[aria-label='Other modules']")!;
    expect([...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/courses/c/m1", "/courses/c/m3"]);
  });

  it("lists the module's subtopics behind Show learning objectives", () => {
    const { host } = render("m1");
    const toggle = [...host.querySelectorAll("button")].find((b) => b.textContent === "Show learning objectives")!;
    act(() => toggle.click());
    expect(toggle.textContent).toBe("Hide learning objectives");
    const items = host.querySelectorAll(`#${CSS.escape(toggle.getAttribute("aria-controls")!)} li`);
    expect([...items].map((li) => li.textContent)).toEqual(["m1-a covers this", "m1-b covers this"]);
  });

  it("sends an old /courses/<slug>#<module> link to that module's page", () => {
    window.location.hash = "#m3";
    render();
    expect(router.replace).toHaveBeenCalledWith("/courses/c/m3");
  });

  it("leaves a malformed hash alone instead of throwing", () => {
    window.location.hash = "#m1%zz";
    expect(() => render()).not.toThrow();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("leaves a hash that names no module alone", () => {
    window.location.hash = "#resources";
    render();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("saves a note edit still pending when the panel goes away", () => {
    const { host } = render("m1");
    act(() => topicToggle(host, "m1-a").click());
    type(host.querySelector("textarea")!, "remember the heuristic");
    expect(learner.updateNote).not.toHaveBeenCalled();
    act(() => mounted.pop()?.());
    expect(learner.updateNote).toHaveBeenCalledWith("m1-a", "remember the heuristic");
  });

  it("saves a note at once when the field loses focus, and only once", () => {
    const { host } = render("m1");
    act(() => topicToggle(host, "m1-a").click());
    const field = host.querySelector("textarea")!;
    type(field, "draft");
    act(() => field.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(learner.updateNote).toHaveBeenCalledTimes(1);
    act(() => mounted.pop()?.());
    expect(learner.updateNote).toHaveBeenCalledTimes(1);
  });
});
