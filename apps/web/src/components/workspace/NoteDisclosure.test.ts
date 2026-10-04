// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { NoteDisclosure } from "./NoteDisclosure";

/**
 * "Read the whole note": a native `<details>` in the page as sent, so the
 * note is readable with no script, and a button over a `Collapse` once the
 * script runs, so it glides.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

const note = () => createElement(NoteDisclosure, null, createElement("p", null, "The whole note."));

function host(html = "") {
  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

describe("NoteDisclosure", () => {
  it("sends a <details> holding the note, which opens with no script", () => {
    const html = renderToString(note());
    expect(html).toContain("<details");
    expect(html).toContain("The whole note.");
  });

  it("becomes a button over a shut Collapse once hydrated, and glides the note open", async () => {
    const el = host(renderToString(note()));
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(el, note());
    });
    mounted.push(() => {
      act(() => root?.unmount());
      el.remove();
    });
    expect(el.querySelector("details")).toBeNull();
    const toggle = el.querySelector("button") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const region = el.querySelector(`#${CSS.escape(toggle.getAttribute("aria-controls") ?? "")}`) as HTMLElement;
    expect(region.hasAttribute("inert")).toBe(true);
    // Not mounted until first opened, as a shut <details> never laid it out.
    expect(region.textContent).toBe("");

    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(region.hasAttribute("inert")).toBe(false);
    expect(region.textContent).toBe("The whole note.");
  });

  it("keeps a note open that was opened before the script ran", async () => {
    const el = host(renderToString(note()));
    (el.querySelector("details") as HTMLDetailsElement).open = true;
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(el, note());
    });
    mounted.push(() => {
      act(() => root?.unmount());
      el.remove();
    });
    const toggle = el.querySelector("button") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(el.textContent).toContain("The whole note.");
  });

  it("renders the button at once on a client-side navigation", () => {
    const el = host();
    const root = createRoot(el);
    act(() => root.render(note()));
    mounted.push(() => {
      act(() => root.unmount());
      el.remove();
    });
    expect(el.querySelector("details")).toBeNull();
    expect(el.querySelector("button")?.textContent).toBe("Read the whole note");
  });
});
