import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button, type ButtonAsButton } from "./Button";

const render = (props: Omit<ButtonAsButton, "children">) =>
  renderToStaticMarkup(createElement(Button, props as ButtonAsButton, "Save"));

describe("Button's disabledReason", () => {
  it("prints the reason beside a disabled button and points the button at it", () => {
    const html = render({ disabled: true, disabledReason: "Not built yet." });
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`<span id="${describedBy}"`);
    expect(html).toContain(">Not built yet.</span>");
    expect(html).toMatch(/<button[^>]* disabled=""/);
  });

  it("keeps an id the caller already described the button with", () => {
    const html = render({ disabled: true, disabledReason: "Not built yet.", "aria-describedby": "hint" });
    expect(html).toMatch(/aria-describedby="hint [^"]+"/);
  });

  it("prints nothing extra for an enabled button, whatever the reason says", () => {
    const html = render({ disabledReason: "Not built yet.", title: "Saves the answer" });
    expect(html).not.toContain("Not built yet.");
    expect(html).not.toContain("aria-describedby");
    expect(html).toMatch(/^<button[^>]* title="Saves the answer"/);
  });

  it("renders a plain disabled button when there is no reason", () => {
    const html = render({ disabled: true });
    expect(html).toMatch(/^<button[^>]* disabled="">Save<\/button>$/);
  });

  it("stretches the pair for a block button", () => {
    const html = render({ disabled: true, block: true, disabledReason: "Not built yet." });
    expect(html).toMatch(/^<span class="flex w-full /);
  });
});

describe("Button at xs", () => {
  it("renders the studio's 28px button with the kit's ring", () => {
    const html = render({ size: "xs", variant: "secondary" });
    expect(html).toMatch(/^<button type="button" class="[^"]*\bh-7\b[^"]*"/);
    expect(html).toContain("text-[12px]");
    expect(html).toContain("focus-visible:outline-accent");
    expect(html).not.toContain("shadow-[");
  });

  it("is a link with href, keeping the scroll when asked", () => {
    const html = renderToStaticMarkup(
      createElement(Button, { href: "/studio", size: "xs", variant: "secondary", scroll: false, children: "Back to the grid" }),
    );
    expect(html).toMatch(/^<a [^>]*href="\/studio"/);
    expect(html).toContain("h-7");
    expect(html).not.toContain("scroll=");
  });
});
