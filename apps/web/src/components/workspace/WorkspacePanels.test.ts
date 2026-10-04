// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { WorkspacePanels } from "./WorkspacePanels";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.unstubAllGlobals();
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

describe("WorkspacePanels folding a side panel", () => {
  /** A window 900px or wider, where the panels sit side by side. */
  function wideWindow() {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(min-width: 900px)",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    // Run the focus hand-off at once.
    vi.stubGlobal("requestAnimationFrame", (task: FrameRequestCallback) => {
      task(0);
      return 0;
    });
  }
  const button = (host: HTMLElement, name: string) => host.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;
  const folder = (host: HTMLElement, name: string) =>
    (host.querySelector(`section[aria-label="${name}"]`) as HTMLElement).parentElement as HTMLElement;

  it("keeps the panel and its rail mounted, and swaps which one is away", () => {
    wideWindow();
    const host = panels();
    const rail = button(host, "Expand Note & sources");
    expect(rail.dataset.rail).toBe("away");
    expect(rail.hasAttribute("inert")).toBe(true);
    expect(folder(host, "Note & sources").dataset.folded).toBe("false");

    act(() => button(host, "Collapse Note & sources").click());

    // Still in the document, faded and inert, rather than unmounted: so it can animate out.
    const note = folder(host, "Note & sources");
    expect(note.dataset.folded).toBe("true");
    expect(note.hasAttribute("inert")).toBe(true);
    expect(note.classList.contains("min-[900px]:opacity-0")).toBe(true);
    expect(note.classList.contains("min-[900px]:invisible")).toBe(true);
    expect(rail.dataset.rail).toBe("shown");
    expect(rail.hasAttribute("inert")).toBe(false);
  });

  it("hands the focus to the control that undoes it", () => {
    wideWindow();
    const host = panels();
    act(() => button(host, "Collapse Studio").click());
    expect(document.activeElement).toBe(button(host, "Expand Studio"));
    act(() => button(host, "Expand Studio").click());
    expect(document.activeElement).toBe(button(host, "Collapse Studio"));
  });

  it("animates the columns, and keeps the folded panel at its open width so its text does not re-wrap", () => {
    wideWindow();
    const host = panels();
    const grid = folder(host, "Note & sources").closest(".grid") as HTMLElement;
    expect(grid.className).toContain("min-[900px]:transition-[grid-template-columns]");
    expect(grid.className).toContain("motion-reduce:transition-none");
    act(() => button(host, "Collapse Note & sources").click());
    expect(grid.className).toContain("min-[900px]:[--note-w:48px]");
    expect(folder(host, "Note & sources").className).toContain("min-[900px]:w-[var(--note-open)]");
  });

  it("never leaves a folded panel inert on a phone, where there is no rail to open it", () => {
    // No matchMedia: taken to be narrow, as on the server.
    const host = panels();
    act(() => button(host, "Collapse Note & sources").click());
    expect(folder(host, "Note & sources").hasAttribute("inert")).toBe(false);
  });
});

describe("WorkspacePanels tabs on a phone", () => {
  it("keeps every panel mounted, and fades in the one a tab brings up", () => {
    const host = panels();
    const cells = [...host.querySelectorAll("[data-panel]")] as HTMLElement[];
    expect(cells.map((c) => c.dataset.panel)).toEqual(["note", "tutor", "studio"]);
    for (const cell of cells) expect(cell.className).toContain("max-[899px]:starting:opacity-0");
    expect(cells.find((c) => c.dataset.active === "true")?.dataset.panel).toBe("tutor");

    const note = [...host.querySelectorAll('[aria-label="Workspace panels"] button')].find((b) => b.textContent === "Note & sources");
    act(() => (note as HTMLButtonElement).click());
    expect(cells.find((c) => c.dataset.active === "true")?.dataset.panel).toBe("note");
    expect(host.querySelector('section[aria-label="Tutor"]')).not.toBeNull();
  });
});
