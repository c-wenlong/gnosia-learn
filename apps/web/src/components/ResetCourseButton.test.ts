// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A course's Reset asks in place, not in a browser dialog, and gives focus
 * back to Reset.
 */

const learner = vi.hoisted(() => ({ resetCourse: vi.fn() }));
vi.mock("@/lib/learner-context", () => ({ useLearner: () => learner }));

const { ResetCourseButton } = await import("./ResetCourseButton");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  learner.resetCourse.mockReset().mockResolvedValue(true);
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount(element: () => ReactElement) {
  const container = document.createElement("div");
  const main = document.createElement("main");
  main.append(container);
  document.body.append(main);
  const root: Root = createRoot(container);
  const draw = () => act(() => root.render(element()));
  draw();
  mounted.push(() => {
    act(() => root.unmount());
    main.remove();
  });
  return { container, main, draw };
}

describe("ResetCourseButton", () => {
  it("asks in place rather than in a browser dialog, and gives focus back to Reset", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { container } = mount(() => createElement(ResetCourseButton, { topicIds: ["a", "b"], size: "sm" }));
    const reset = [...container.querySelectorAll("button")].find((b) => b.textContent === "Reset")!;
    const fold = document.getElementById(reset.getAttribute("aria-controls")!)!;
    expect(fold.hasAttribute("inert")).toBe(true);

    act(() => reset.click());
    expect(fold.hasAttribute("inert")).toBe(false);
    const go = [...fold.querySelectorAll("button")].find((b) => b.textContent === "Reset course")!;
    act(() => go.click());
    expect(learner.resetCourse).toHaveBeenCalledWith(["a", "b"]);
    expect(fold.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(reset);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
