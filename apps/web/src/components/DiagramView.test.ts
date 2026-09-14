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
    // The path stays on screen, so the reader can see what was missing.
    expect(host.textContent).toContain(props.src);
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
