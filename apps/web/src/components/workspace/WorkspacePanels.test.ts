// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { WorkspacePanels } from "./WorkspacePanels";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount(element: ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

/** Hidden below 900px by a class on the element or any ancestor inside `host`. */
function hiddenOnPhone(el: Element, host: Element): boolean {
  for (let node: Element | null = el; node !== null && node !== host; node = node.parentElement) {
    if (node.classList.contains("max-[899px]:hidden")) return true;
  }
  return false;
}

function panels() {
  return mount(
    createElement(WorkspacePanels, {
      note: createElement("p", null, "note body"),
      tutor: createElement("p", null, "tutor body"),
      tutorAside: createElement("a", { href: "/settings", "data-testid": "style" }, "Learning guide · concise"),
      studio: createElement("p", null, "studio body"),
      initialPanel: "tutor",
    }),
  );
}

describe("WorkspacePanels on a phone", () => {
  it("hides the tutor's title, which the tab row already says, but keeps its style line", () => {
    const host = panels();
    const tutor = host.querySelector('section[aria-label="Tutor"]') as HTMLElement;
    const title = tutor.querySelector("h2") as HTMLElement;
    expect(title.textContent).toBe("Tutor");
    expect(title.classList.contains("max-[899px]:sr-only")).toBe(true);
    const style = tutor.querySelector('[data-testid="style"]') as HTMLElement;
    expect(hiddenOnPhone(style, host)).toBe(false);
  });

  it("drops the note and studio headers, which hold nothing else there", () => {
    const host = panels();
    for (const name of ["Note & sources", "Studio"]) {
      const title = host.querySelector(`section[aria-label="${name}"] h2`) as HTMLElement;
      expect(hiddenOnPhone(title, host), name).toBe(true);
    }
  });
});
