// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ChatTurn, TutorThinking } from "./ChatTurn";

/** A chat turn in the kit's two voices, the tutor's with an optional provider line. */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function render(props: Parameters<typeof ChatTurn>[0]) {
  return draw(createElement(ChatTurn, props));
}

function draw(element: ReturnType<typeof createElement>) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
  return host;
}

describe("ChatTurn", () => {
  it("draws the tutor's markdown, an image as a link, and the provider line when given", () => {
    const host = render({
      turn: { role: "assistant", content: "## Caches\n\n![chart](https://attacker.example/p.png)" },
      idPrefix: "t0-",
      meta: "Anthropic",
    });
    expect(host.querySelector("h2")?.id.startsWith("t0-")).toBe(true);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector('a[href^="https://attacker.example/"]')?.textContent).toBe("chart");
    expect(host.textContent).toContain("Anthropic");
  });

  it("draws the learner's words as text, not markdown, with no provider line", () => {
    const host = render({ turn: { role: "user", content: "## not a heading" }, idPrefix: "t1-", meta: "Anthropic" });
    expect(host.querySelector("h2")).toBeNull();
    expect(host.textContent).toContain("## not a heading");
    expect(host.textContent).not.toContain("Anthropic");
  });

  it("draws a tutor turn with no meta as the prose alone, with no provider line", () => {
    const host = render({ turn: { role: "assistant", content: "A cache of translations." }, idPrefix: "t2-" });
    const turn = host.querySelector("article")!;
    expect(turn.textContent).toBe("A cache of translations.");
    // The provider line is a paragraph of its own above the prose; there is none.
    expect(turn.querySelectorAll("p")).toHaveLength(1);
  });

  it("draws a tutor turn's cites and actions on the row under it, and takes a caller's entry class", () => {
    const host = render({
      turn: { role: "assistant", content: "Pages map to frames [1]." },
      idPrefix: "t3-",
      cites: createElement("a", { href: "#note", "data-cite": "" }, "1"),
      actions: createElement("button", { type: "button" }, "Why?"),
      className: "fade-only",
    });
    const turn = host.querySelector("article")!;
    expect(turn.className).toContain("fade-only");
    expect(turn.querySelector("[data-cite]")?.textContent).toBe("1");
    expect(turn.querySelector("button")?.textContent).toBe("Why?");
  });
});

describe("TutorThinking", () => {
  it("is a status line, so it is announced outside any live region", () => {
    const line = draw(createElement(TutorThinking)).querySelector("p")!;
    expect(line.getAttribute("role")).toBe("status");
    expect(line.textContent).toBe("The tutor is thinking…");
  });
});
