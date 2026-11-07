// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ChatTurn } from "./ChatTurn";

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
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(createElement(ChatTurn, props)));
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
});
