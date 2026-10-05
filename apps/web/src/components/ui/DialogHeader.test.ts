import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PANEL_TITLE } from "./classes";
import { DialogHeader } from "./DialogHeader";

/**
 * The kit dialog's header: a 48px bar with a rule under it, the title in the
 * panel role, the caller's actions, and the one Close the studio's focus
 * logic recognises (`data-dialog-close`). Then the guard that fails a dialog
 * header built by hand.
 */

const header = (props: Partial<ComponentProps<typeof DialogHeader>> = {}) =>
  renderToStaticMarkup(createElement(DialogHeader, { title: "Settings", onClose: () => undefined, ...props }));

const classesOf = (html: string) => (html.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");

describe("DialogHeader", () => {
  it("names the dialog in an h2 in the panel title role, truncated to one line", () => {
    const html = header();
    const h2 = html.match(/<h2 class="([^"]*)">Settings<\/h2>/);
    expect(h2).not.toBeNull();
    const classes = h2![1].split(" ");
    expect(classes).toEqual(expect.arrayContaining([...PANEL_TITLE.split(" "), "min-w-0", "flex-1", "truncate"]));
  });

  it("ends with the kit Close, marked for the focus logic", () => {
    const html = header();
    expect(html).toMatch(/<button type="button" aria-label="Close" title="Close" class="[^"]*" data-dialog-close="">/);
    // Close is the last thing in the row.
    expect(html.lastIndexOf("<button")).toBe(html.indexOf("<button"));
    expect(html.endsWith("</button></div>")).toBe(true);
  });

  it("draws the leading mark before the title and the actions between the title and Close", () => {
    const html = header({
      leading: createElement("span", { "data-leading": "" }),
      actions: [createElement("a", { key: "raw", href: "/raw" }, "Raw file"), createElement("span", { key: "cost" }, "$0.12")],
    });
    const at = (needle: string) => html.indexOf(needle);
    expect(at("data-leading")).toBeGreaterThan(-1);
    expect(at("data-leading")).toBeLessThan(at("<h2"));
    expect(at("<h2")).toBeLessThan(at("Raw file"));
    expect(at("Raw file")).toBeLessThan(at("$0.12"));
    expect(at("$0.12")).toBeLessThan(at("data-dialog-close"));
  });

  const closeOf = (html: string) => html.match(/<button [^>]*aria-label="Close"[^>]*class="([^"]*)"[^>]*>(<svg [^>]*>)/);

  it("draws Close as a 36px round button with a 16px glyph by default", () => {
    const html = header();
    const close = closeOf(html);
    expect(close).not.toBeNull();
    const classes = close![1].split(" ");
    expect(classes).toEqual(expect.arrayContaining(["size-9", "rounded-full"]));
    expect(classes).not.toContain("size-7");
    expect(close![2]).toMatch(/width="16"/);
    expect(classesOf(html)).toEqual(expect.arrayContaining(["pr-2"]));
  });

  it('closeSize="sm" draws Close as a 28px square with an 18px glyph, the glyph where it was', () => {
    const html = header({ closeSize: "sm" });
    const close = closeOf(html);
    expect(close).not.toBeNull();
    const classes = close![1].split(" ");
    expect(classes).toEqual(expect.arrayContaining(["size-7", "rounded-lg"]));
    expect(classes).not.toContain("size-9");
    expect(classes).not.toContain("rounded-full");
    expect(close![2]).toMatch(/width="18"/);
    // 12px of padding round a 28px box and 8px round a 36px one put the
    // glyph's centre the same 26px from the edge.
    const row = classesOf(html);
    expect(row).toEqual(expect.arrayContaining(["pr-3"]));
    expect(row).not.toContain("pr-2");
  });

  it('closeSize="sm" changes only Close: still labelled, marked, last, and the row keeps its 48px and notch padding', () => {
    const html = header({ closeSize: "sm", actions: createElement("a", { href: "/raw" }, "Raw file") });
    expect(html).toMatch(/<button type="button" aria-label="Close" title="Close" class="[^"]*" data-dialog-close="">/);
    expect(html.lastIndexOf("<button")).toBe(html.indexOf("<button"));
    expect(html.indexOf("Raw file")).toBeLessThan(html.indexOf("data-dialog-close"));
    expect(classesOf(html)).toEqual(
      expect.arrayContaining([
        "flex",
        "shrink-0",
        "items-center",
        "border-b",
        "border-hair",
        "pl-5",
        "pt-[env(safe-area-inset-top)]",
        "h-[calc(3rem+env(safe-area-inset-top))]",
        "md:pt-0",
        "md:h-12",
      ]),
    );
  });

  it("holds nothing but the title and Close when given nothing else", () => {
    const html = header();
    expect(html).toMatch(/^<div class="[^"]*"><h2 [^>]*>Settings<\/h2><button /);
  });

  it("is a 48px bar with a hairline under it, pinned over the body", () => {
    const classes = classesOf(header());
    expect(classes).toEqual(expect.arrayContaining(["flex", "shrink-0", "items-center", "border-b", "border-hair", "md:h-12"]));
  });

  it("clears the notch on a phone and keeps its 48px under it, and from 768px has no inset", () => {
    const classes = classesOf(header());
    expect(classes).toEqual(
      expect.arrayContaining(["pt-[env(safe-area-inset-top)]", "h-[calc(3rem+env(safe-area-inset-top))]", "md:pt-0", "md:h-12"]),
    );
  });
});

describe("dialog headers", () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const sources = (): Array<{ path: string; text: string }> => {
    const found: Array<{ path: string; text: string }> = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) found.push({ path: relative(src, path), text: readFileSync(path, "utf8") });
      }
    };
    walk(src);
    return found;
  };

  it("marks a Close with data-dialog-close only in the kit's DialogHeader", () => {
    // Written as a JSX attribute, a createElement prop or setAttribute; a
    // reader (`hasAttribute`, a selector) is fine.
    const writes = /data-dialog-close\s*=|["']data-dialog-close["']\s*:|setAttribute\(\s*["']data-dialog-close["']/;
    const offenders = sources()
      .filter(({ path, text }) => path !== "components/ui/DialogHeader.tsx" && writes.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("leaves no other Close drawn by hand inside a kit Dialog", () => {
    // A file that renders the kit `Dialog` and a button named Close, an
    // `IconButton`'s `label` or a `<button>`'s `aria-label`, as a string
    // either way, has built its own header. The attributes are read up to the
    // next tag, past an arrow function's `>`. A name held in a variable is
    // beyond a file scan and left to review. The previewer, whose row of 28px
    // tools was the last, now draws `DialogHeader` with `closeSize="sm"` (`PreviewerHeader`).
    const closeButton = /<(?:IconButton|button)\b(?:(?!<[A-Za-z])[\s\S]){0,400}?\b(?:aria-)?label=\{?\s*["'`]Close["'`]/;
    const offenders = sources()
      .filter(({ text }) => /<Dialog\b/.test(text) && closeButton.test(text))
      .map(({ path }) => path)
      .sort();
    expect(offenders).toEqual([]);
    // The forms it is meant to catch, and the kit's own call, which it is not.
    expect(closeButton.test('<IconButton onClick={() => close()} label="Close">')).toBe(true);
    expect(closeButton.test("<IconButton label={'Close'} size=\"sm\">")).toBe(true);
    expect(closeButton.test('<button type="button" aria-label="Close" onClick={close}>')).toBe(true);
    expect(closeButton.test('<DialogHeader title="Settings" onClose={close} />')).toBe(false);
    expect(closeButton.test('<IconButton label="Expand" /><span label="Close" />')).toBe(false);
  });

  it("draws the previewer's header with the kit's, its Close sized to the row of 28px tools", () => {
    const text = sources().find(({ path }) => path === "components/library/PreviewerHeader.tsx")?.text ?? "";
    expect(text).toMatch(/<DialogHeader\b[^>]*\bcloseSize="sm"/);
  });
});
