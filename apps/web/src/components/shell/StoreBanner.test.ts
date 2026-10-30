// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The store banner folds in and out with its last words and sends focus to
 * the page on Dismiss.
 */

const learner = vi.hoisted(() => ({
  reachable: true,
  saveError: null as string | null,
  dismissSaveError: vi.fn(),
  resetCourse: vi.fn(),
}));
vi.mock("@/lib/learner-context", () => ({ useLearner: () => learner }));

const { StoreBanner } = await import("./StoreBanner");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  learner.reachable = true;
  learner.saveError = null;
  learner.dismissSaveError.mockReset();
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

describe("StoreBanner", () => {
  it("folds open with the message, keeps it while it folds shut, and focuses the page on Dismiss", () => {
    const { container, main, draw } = mount(() => createElement(StoreBanner));
    // The fold is the Collapse after the live region.
    const fold = container.querySelector('[role="status"]')!.nextElementSibling!;
    expect(fold.hasAttribute("inert")).toBe(true);

    learner.saveError = "Not saved: the database did not answer.";
    draw();
    expect(fold.hasAttribute("inert")).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(learner.saveError);

    const dismiss = container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss this message"]')!;
    act(() => dismiss.click());
    expect(learner.dismissSaveError).toHaveBeenCalled();
    expect(document.activeElement).toBe(main);

    learner.saveError = null;
    draw();
    expect(fold.hasAttribute("inert")).toBe(true);
    expect(fold.textContent).toContain("Not saved: the database did not answer.");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("");
  });
});
