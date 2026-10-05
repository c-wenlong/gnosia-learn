// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ShellContext, type ShellControls } from "@/components/shell/shell-context";

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

/** Hidden where the panels stack behind tabs (`ws-tabs:`) by a class on the element or any ancestor inside `host`. */
function hiddenOnPhone(el: Element, host: Element): boolean {
  for (let node: Element | null = el; node !== null && node !== host; node = node.parentElement) {
    if (node.classList.contains("ws-tabs:hidden")) return true;
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
    expect(title.classList.contains("ws-tabs:sr-only")).toBe(true);
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
  /** A window wide enough for the panels side by side beside the open sidebar (`ws:`). */
  function wideWindow() {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(min-width: 1160px)",
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
    expect(note.classList.contains("ws:opacity-0")).toBe(true);
    expect(note.classList.contains("ws:invisible")).toBe(true);
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
    expect(grid.className).toContain("ws:transition-[grid-template-columns]");
    expect(grid.className).toContain("motion-reduce:transition-none");
    act(() => button(host, "Collapse Note & sources").click());
    expect(grid.className).toContain("ws:[--note-w:48px]");
    expect(folder(host, "Note & sources").className).toContain("ws:w-[var(--note-open)]");
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
    for (const cell of cells) expect(cell.className).toContain("ws-tabs:starting:opacity-0");
    expect(cells.find((c) => c.dataset.active === "true")?.dataset.panel).toBe("tutor");

    const note = [...host.querySelectorAll('[aria-label="Workspace panels"] button')].find((b) => b.textContent === "Note & sources");
    act(() => (note as HTMLButtonElement).click());
    expect(cells.find((c) => c.dataset.active === "true")?.dataset.panel).toBe("note");
    expect(host.querySelector('section[aria-label="Tutor"]')).not.toBeNull();
  });

  it("is the tabs pattern: each tab controls its panel, and the arrows move and choose", () => {
    const host = panels();
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="Workspace panels"] [role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(["Note & sources", "Tutor", "Studio"]);
    for (const tab of tabs) {
      const panel = host.querySelector(`#${CSS.escape(tab.getAttribute("aria-controls")!)}`) as HTMLElement;
      expect(panel.getAttribute("role")).toBe("tabpanel");
      expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
    }
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);

    act(() => tabs[1].focus());
    act(() => {
      tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(document.activeElement).toBe(tabs[2]);
    expect((host.querySelector('[data-active="true"]') as HTMLElement).dataset.panel).toBe("studio");
  });

  it("drops the panels' tab roles where they sit side by side", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(min-width: 1160px)",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const host = panels();
    expect(host.querySelector('[role="tabpanel"]')).toBeNull();
    expect(host.querySelectorAll("[data-panel][id]")).toHaveLength(3);
  });

  it("puts them side by side at a narrower window once the app sidebar is folded to its rail", () => {
    // A 1000px window: too narrow beside the open sidebar, wide enough beside the rail.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(min-width: 960px)",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const beside = (collapsed: boolean) =>
      mount(
        createElement(
          ShellContext.Provider,
          { value: { collapsed } as ShellControls },
          createElement(WorkspacePanels, {
            note: createElement("p", null, "note body"),
            tutor: createElement("p", null, "tutor body"),
            studio: createElement("p", null, "studio body"),
            initialPanel: "tutor",
          }),
        ),
      );
    expect(beside(false).querySelectorAll('[role="tabpanel"]')).toHaveLength(3);
    expect(beside(true).querySelector('[role="tabpanel"]')).toBeNull();
  });

  it("follows a fold of the sidebar on the same page: tab roles and a folded panel's inert both move", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(min-width: 960px)",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    vi.stubGlobal("requestAnimationFrame", (task: FrameRequestCallback) => {
      task(0);
      return 0;
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const draw = (collapsed: boolean) =>
      act(() =>
        root.render(
          createElement(
            ShellContext.Provider,
            { value: { collapsed } as ShellControls },
            createElement(WorkspacePanels, {
              note: createElement("p", null, "note body"),
              tutor: createElement("p", null, "tutor body"),
              studio: createElement("p", null, "studio body"),
              initialPanel: "tutor",
            }),
          ),
        ),
      );
    mounted.push(() => {
      act(() => root.unmount());
      host.remove();
    });
    const note = () => (host.querySelector('section[aria-label="Note & sources"]') as HTMLElement).parentElement as HTMLElement;

    // Folded to the rail at 1000px: side by side, so the note can fold away, and is inert while it is.
    draw(true);
    expect(host.querySelector('[role="tabpanel"]')).toBeNull();
    act(() => (host.querySelector('button[aria-label="Collapse Note & sources"]') as HTMLButtonElement).click());
    expect(note().hasAttribute("inert")).toBe(true);

    // The sidebar opens on the same page: tabs again, and no panel is left inert behind one.
    draw(false);
    expect(host.querySelectorAll('[role="tabpanel"]')).toHaveLength(3);
    expect(note().hasAttribute("inert")).toBe(false);

    // Folded once more: side by side, and the note's own fold is kept.
    draw(true);
    expect(host.querySelector('[role="tabpanel"]')).toBeNull();
    expect(note().hasAttribute("inert")).toBe(true);
  });
});
