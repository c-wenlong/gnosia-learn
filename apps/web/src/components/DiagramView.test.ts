// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DiagramView } from "./DiagramView";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

const roots = new WeakMap<HTMLElement, ReturnType<typeof createRoot>>();

function mount(element: ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.set(host, root);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

/** Re-renders into the same root, which is what a soft navigation does: the
    component instance and its state are kept, only the props change. */
function rerender(host: HTMLElement, element: ReactElement) {
  act(() => roots.get(host)?.render(element));
}

const props = { src: "/assets/bkt-update.svg", title: "How BKT updates a belief" };

describe("DiagramView", () => {
  it("shows the drawing as an image, titled and described", () => {
    const host = mount(createElement(DiagramView, props));
    const img = host.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(props.src);
    expect(img.getAttribute("alt")).toBe(props.title);
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(host.querySelector("h3")?.textContent).toBe(props.title);
  });

  it("offers the file itself at full size", () => {
    const host = mount(createElement(DiagramView, props));
    const link = host.querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(props.src);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("holds a placeholder until the file arrives, then drops it", () => {
    const host = mount(createElement(DiagramView, props));
    const img = host.querySelector("img") as HTMLImageElement;
    expect(host.querySelector("[aria-hidden]")).not.toBeNull();

    act(() => img.dispatchEvent(new Event("load")));
    expect(host.querySelector("[aria-hidden]")).toBeNull();
    // The picture was never hidden behind the placeholder, so a page whose
    // script never runs still shows the diagram.
    expect(host.querySelector("img")).not.toBeNull();
  });

  it("says the diagram did not load rather than leaving a broken box", () => {
    const host = mount(createElement(DiagramView, props));
    const img = host.querySelector("img") as HTMLImageElement;

    act(() => img.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("This diagram did not load.");
    // The URL is not repeated in the panel: it names an asset id, and the
    // reason (asked of the status route) is what the reader acts on. The
    // header's Full size link still points at the file.
    expect(host.querySelector("[role=status]")?.textContent).not.toContain(props.src);
  });

  it("tries again when it is handed a different diagram", () => {
    const host = mount(createElement(DiagramView, props));
    act(() => (host.querySelector("img") as HTMLImageElement).dispatchEvent(new Event("error")));
    expect(host.textContent).toContain("This diagram did not load.");

    rerender(host, createElement(DiagramView, { ...props, src: "/assets/bkt-decay.svg" }));

    const next = host.querySelector("img");
    expect(next).not.toBeNull();
    expect(next?.getAttribute("src")).toBe("/assets/bkt-decay.svg");
    expect(host.textContent).not.toContain("This diagram did not load.");
  });

  it("puts the placeholder back while the next diagram loads", () => {
    const host = mount(createElement(DiagramView, props));
    act(() => (host.querySelector("img") as HTMLImageElement).dispatchEvent(new Event("load")));
    expect(host.querySelector("[aria-hidden]")).toBeNull();

    rerender(host, createElement(DiagramView, { ...props, src: "/assets/bkt-decay.svg" }));

    expect(host.querySelector("[aria-hidden]")).not.toBeNull();
  });

  it("renders a caption only when it is given one", () => {
    const bare = mount(createElement(DiagramView, props));
    expect(bare.querySelector("figcaption")).toBeNull();

    const captioned = mount(
      createElement(DiagramView, { ...props, caption: "From the session on 12 Sep." }),
    );
    expect(captioned.querySelector("figcaption")?.textContent).toContain("12 Sep");
  });
});
