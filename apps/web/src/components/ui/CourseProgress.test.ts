// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { CourseProgress } from "./CourseProgress";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let unmount: (() => void) | null = null;
afterEach(() => {
  unmount?.();
  unmount = null;
});

function draw(props: ComponentProps<typeof CourseProgress>): HTMLElement {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(CourseProgress, props)));
  unmount = () => act(() => root.unmount());
  return host;
}

const bar = (host: HTMLElement) => host.querySelector('[role="progressbar"]')!;
const fill = (host: HTMLElement) => (bar(host).firstElementChild as HTMLElement).style.width;
const text = (host: HTMLElement) => host.textContent ?? "";

describe("CourseProgress", () => {
  it.each([
    [0, 5, 0],
    [2, 5, 40],
    [5, 5, 100],
  ])("works out %i of %i as %i%% in every variant", (done, total, percent) => {
    for (const host of [
      draw({ variant: "count", code: "CP4284", done, total, lead: "CP4284 LLM Reasoning Agents" }),
      draw({ variant: "percent", code: "CP4284", done, total, lead: "5 topics" }),
      draw({ variant: "headline", code: "CP4284", done, total, conceptBacked: false }),
    ]) {
      expect(bar(host).getAttribute("aria-valuenow")).toBe(String(percent));
      expect(fill(host)).toBe(`${percent}%`);
    }
  });

  it("draws an empty course as 0%, never NaN", () => {
    for (const host of [
      draw({ variant: "count", code: "X1", done: 0, total: 0, lead: "X1" }),
      draw({ variant: "percent", code: "X1", done: 0, total: 0, lead: "0 topics" }),
      draw({ variant: "headline", code: "X1", done: 0, total: 0, conceptBacked: true }),
    ]) {
      expect(bar(host).getAttribute("aria-valuenow")).toBe("0");
      expect(fill(host)).toBe("0%");
      expect(text(host)).not.toContain("NaN");
      expect(text(host)).not.toContain("Infinity");
    }
  });

  it("keeps Home's words: the lead, then the count of topics", () => {
    const host = draw({ variant: "count", code: "CP4284", done: 2, total: 5, lead: createElement("a", { href: "/courses/cp4284" }, "CP4284 LLM") });
    expect(text(host)).toBe("CP4284 LLM2 of 5 topics");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/courses/cp4284");
    expect(bar(host).getAttribute("aria-label")).toBe("CP4284 progress");
  });

  it("keeps Continue learning's words, and names the bar with the counts", () => {
    const host = draw({ variant: "percent", code: "CP4284", done: 2, total: 5, lead: "5 topics · 12 concepts" });
    expect(host.querySelector("p")?.textContent).toBe("5 topics · 12 concepts · 40% done");
    expect(bar(host).getAttribute("aria-label")).toBe("CP4284 progress, 2 of 5 topics");
  });

  it("says done for a course with a ticked topic, and mastered only when every topic has a concept", () => {
    const ticked = draw({ variant: "headline", code: "CP4284", done: 1, total: 4, conceptBacked: false });
    expect(text(ticked)).toBe("25%done1 of 4 topics done");
    expect(bar(ticked).getAttribute("aria-label")).toBe("CP4284 progress");
    unmount?.();

    const backed = draw({ variant: "headline", code: "CP4284", done: 4, total: 4, conceptBacked: true });
    expect(text(backed)).toBe("100%mastered4 of 4 topics mastered");
  });
});
