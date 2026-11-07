// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { FOCUS } from "./classes";
import { LinkRow } from "./LinkRow";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let unmount: (() => void) | null = null;
afterEach(() => {
  unmount?.();
  unmount = null;
});

function draw(props: Parameters<typeof LinkRow>[0]): HTMLElement {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(LinkRow, props)));
  unmount = () => act(() => root.unmount());
  return host;
}

describe("LinkRow", () => {
  it("is one link holding the lead, the title and the trailing note", () => {
    const host = draw({
      href: "/learn/softmax",
      lead: createElement("i", { "data-lead": "" }),
      title: "Softmax",
      trailing: createElement("time", null, "Today"),
    });
    const links = host.querySelectorAll("a");
    expect(links).toHaveLength(1);
    const a = links[0];
    expect(a.getAttribute("href")).toBe("/learn/softmax");
    expect(a.querySelector("[data-lead]")).not.toBeNull();
    expect(a.textContent).toBe("SoftmaxToday");
    expect(a.querySelector("time")).not.toBeNull();
  });

  it("takes the kit's focus ring and one padding", () => {
    const a = draw({ href: "/x", title: "X" }).querySelector("a")!;
    for (const c of FOCUS.split(" ")) expect(a.className).toContain(c);
    expect(a.className).toContain("p-2");
    expect(a.className).not.toMatch(/outline-offset-0|-outline-offset-2|px-|py-/);
  });

  it("reads the kind before the title to a screen reader only", () => {
    const a = draw({ href: "/x", title: "TCP vs UDP", srKind: "Conversation" }).querySelector("a")!;
    expect(a.innerHTML).toContain('<span class="sr-only">Conversation: </span>TCP vs UDP');
    expect(a.textContent).toBe("Conversation: TCP vs UDP");
  });

  it("sets the title in medium weight over a meta line, and plain without one", () => {
    const withMeta = draw({ href: "/x", title: "Divide and conquer", meta: "CS3230 · Module 2" }).querySelector("a")!;
    const lines = withMeta.querySelectorAll(":scope > span > span");
    expect(lines[0].className).toContain("font-medium");
    expect(lines[0].textContent).toBe("Divide and conquer");
    expect(lines[1].textContent).toBe("CS3230 · Module 2");
    unmount?.();

    const plain = draw({ href: "/x", title: "Divide and conquer" }).querySelector("a")!;
    expect(plain.querySelector(".font-medium")).toBeNull();
    expect(plain.querySelector(".truncate")?.textContent).toBe("Divide and conquer");
  });

  it("lets a caller override the text size without losing the rest", () => {
    const a = draw({ href: "/x", title: "X", className: "text-[13px]" }).querySelector("a")!;
    expect(a.className).toContain("text-[13px]");
    expect(a.className).not.toContain("text-[14px]");
    expect(a.className).toContain("text-text");
  });
});
