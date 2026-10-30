// @vitest-environment jsdom
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PANEL_TITLE } from "./classes";
import { DialogHeader } from "./DialogHeader";

/**
 * The kit dialog's header: a 48px bar with a rule under it, the title in the
 * panel role, the caller's actions, and the one Close the studio's focus
 * logic recognises (`data-dialog-close`). The lint rules `gnosia/dialog-header`
 * and `gnosia/dialog-close-mark` fail a dialog header built by hand.
 */

/** The header, parsed: its row element. */
function header(props: Partial<ComponentProps<typeof DialogHeader>> = {}): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(createElement(DialogHeader, { title: "Settings", onClose: () => undefined, ...props }));
  return host.firstElementChild as HTMLElement;
}

const tokens = (element: Element | null) => (element?.getAttribute("class") ?? "").split(" ");
const closeOf = (row: HTMLElement) => row.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
/** Whether `a` comes before `b` in the document. */
const before = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("DialogHeader", () => {
  it("names the dialog in an h2 in the panel title role, truncated to one line", () => {
    const title = header().querySelector("h2")!;
    expect(title.textContent).toBe("Settings");
    expect(tokens(title)).toEqual(expect.arrayContaining([...PANEL_TITLE.split(" "), "min-w-0", "flex-1", "truncate"]));
  });

  it("ends with the kit Close, labelled and marked for the focus logic", () => {
    const row = header();
    const close = closeOf(row);
    expect(close.getAttribute("type")).toBe("button");
    expect(close.getAttribute("title")).toBe("Close");
    expect(close.hasAttribute("data-dialog-close")).toBe(true);
    expect(row.querySelectorAll("button")).toHaveLength(1);
    expect(row.lastElementChild).toBe(close);
  });

  it("draws the leading mark before the title and the actions between the title and Close", () => {
    const row = header({
      leading: createElement("span", { "data-leading": "" }),
      actions: [createElement("a", { key: "raw", href: "/raw" }, "Raw file"), createElement("span", { key: "cost" }, "$0.12")],
    });
    const leading = row.querySelector("[data-leading]")!;
    const title = row.querySelector("h2")!;
    const raw = row.querySelector('a[href="/raw"]')!;
    const cost = [...row.querySelectorAll("span")].find((span) => span.textContent === "$0.12")!;
    expect(before(leading, title)).toBe(true);
    expect(before(title, raw)).toBe(true);
    expect(before(raw, cost)).toBe(true);
    expect(before(cost, closeOf(row))).toBe(true);
  });

  it("holds nothing but the title and Close when given nothing else", () => {
    expect([...header().children].map((child) => child.tagName)).toEqual(["H2", "BUTTON"]);
  });

  it("draws Close as a 36px round button with a 16px glyph by default", () => {
    const row = header();
    const close = closeOf(row);
    expect(tokens(close)).toEqual(expect.arrayContaining(["size-9", "rounded-full"]));
    expect(close.querySelector("svg")?.getAttribute("width")).toBe("16");
    expect(tokens(row)).toContain("pr-2");
  });

  it('closeSize="sm" draws Close as a 28px square with an 18px glyph, the glyph where it was', () => {
    const row = header({ closeSize: "sm", actions: createElement("a", { href: "/raw" }, "Raw file") });
    const close = closeOf(row);
    expect(tokens(close)).toEqual(expect.arrayContaining(["size-7", "rounded-lg"]));
    expect(tokens(close)).not.toContain("rounded-full");
    expect(close.querySelector("svg")?.getAttribute("width")).toBe("18");
    // 12px of padding round a 28px box and 8px round a 36px one put the
    // glyph's centre the same 26px from the edge.
    expect(tokens(row)).toContain("pr-3");
    expect(tokens(row)).not.toContain("pr-2");
    // Only Close changes: still labelled, marked and last.
    expect(close.hasAttribute("data-dialog-close")).toBe(true);
    expect(row.lastElementChild).toBe(close);
  });

  it("is a 48px bar with a hairline under it that clears the notch on a phone, with no inset from 768px", () => {
    for (const closeSize of ["lg", "sm"] as const) {
      expect(tokens(header({ closeSize }))).toEqual(
        expect.arrayContaining(["border-b", "border-hair", "pt-[env(safe-area-inset-top)]", "h-[calc(3rem+env(safe-area-inset-top))]", "md:pt-0", "md:h-12"]),
      );
    }
  });
});
