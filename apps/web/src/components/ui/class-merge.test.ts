import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Card } from "./Card";
import { THEME_COLOURS, THEME_FONTS } from "./class-merge";
import {
  badgeClasses,
  buttonClasses,
  calloutClasses,
  cardClasses,
  chipClasses,
  CARD_TITLE,
  CLOSE_TITLE,
  COLUMN_TITLE,
  CONCEPT_TITLE,
  cx,
  FIELD_TEXT,
  iconButtonClasses,
  inputClasses,
  LABEL,
  linkClasses,
  menuRowClasses,
  NOTE,
  PAGE_TITLE,
  PANEL_TITLE,
  SECTION_TITLE,
  STATUS_TEXT,
  textareaClasses,
} from "./classes";
import { Placeholder } from "./Placeholder";

const tokens = (c: string) => c.split(/\s+/).filter(Boolean);
/** Every class of each part is in the result: nothing was dropped. */
const keepsAll = (...parts: string[]) => expect(tokens(cx(...parts)).sort()).toEqual(tokens(parts.join(" ")).sort());
const classOf = (html: string) => tokens(/class="([^"]*)"/.exec(html)?.[1] ?? "");

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../app/globals.css"), "utf8");
const themeBlock = (name: string) => [...css.matchAll(new RegExp(`--${name}-([a-z0-9-]+):`, "g"))].map((m) => m[1]);

describe("cx", () => {
  it("lets the last of two classes that set the same thing win, whatever their values", () => {
    expect(cx("rounded-xl", "rounded-none")).toBe("rounded-none");
    expect(cx("rounded-md bg-surface2", "rounded-full")).toBe("bg-surface2 rounded-full");
    expect(cx("gap-3", "gap-2")).toBe("gap-2");
    expect(cx("px-3", "px-1")).toBe("px-1");
    expect(cx("h-5 w-5", "h-4 w-4")).toBe("h-4 w-4");
    expect(cx("text-[14px]", "text-[13px]")).toBe("text-[13px]");
    expect(cx("ps-[var(--shell-row-pad,8px)]", "ps-9")).toBe("ps-9");
    // A side after the whole stays beside it, as the stylesheet orders them; the whole after a side replaces it.
    expect(cx("p-5", "px-4")).toBe("p-5 px-4");
    expect(cx("px-4", "p-5")).toBe("p-5");
  });

  it("reads every theme colour as a colour, so a colour beside a size or a width keeps both", () => {
    for (const c of THEME_COLOURS) {
      keepsAll(`text-${c}`, "text-[14px]");
      keepsAll(`text-${c}`, "text-base");
      keepsAll(`border-2 border-${c}`);
      keepsAll(`ring-2 ring-${c}`);
      keepsAll(`outline-2 outline-${c}`);
      keepsAll(`bg-${c}/90`, "bg-[url(/x.png)]");
      // and two colours are one property, so the later wins
      expect(cx(`text-${c}`, "text-danger")).toBe("text-danger");
      expect(cx("bg-surface", `bg-${c}`)).toBe(`bg-${c}`);
    }
    keepsAll("text-text2 text-[14px]");
    keepsAll("text-accent-text text-[12px]");
    keepsAll("text-warn-text text-[13px] leading-5");
    keepsAll("bg-surface-raised border-hair border");
    keepsAll("bg-diagram-matte shadow-[0_4px_0_var(--btn-lip)]");
    keepsAll("inset-ring inset-ring-border bg-track");
  });

  it("lists the same colours and families globals.css declares", () => {
    const block = css.slice(css.indexOf("@theme inline {"));
    const declared = [...block.slice(0, block.indexOf("\n}")).matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]);
    expect([...THEME_COLOURS].sort()).toEqual([...new Set(declared)].sort());
    for (const font of themeBlock("font")) expect(THEME_FONTS).toContain(font);
  });

  it("keeps a class it does not know, so a word that only looks like a colour is never dropped", () => {
    keepsAll("text-foo", "text-text2");
    keepsAll("bg-unknown", "bg-surface");
    keepsAll("gnosia-glass studio-veil katex prose prose-sm", "rounded-none");
  });

  it("keeps the field size and its desktop size, which differ by variant", () => {
    for (const size of Object.values(FIELD_TEXT)) {
      keepsAll(size);
      keepsAll("leading-5", size);
      keepsAll("text-text", size);
    }
    expect(tokens(textareaClasses())).toEqual(expect.arrayContaining(["leading-5", ...tokens(FIELD_TEXT.px14)]));
  });

  it("keeps a leading before a later size, since in Tailwind v4 the leading wins whatever the order", () => {
    keepsAll("leading-4", "text-[13px]");
    keepsAll("leading-tight", "text-sm");
    // A size that carries its own leading does replace one.
    expect(cx("leading-4", "text-sm/6")).toBe("text-sm/6");
  });

  it("drops nothing of a type role but its colour when a later colour is added", () => {
    for (const role of [PAGE_TITLE, CONCEPT_TITLE, CLOSE_TITLE, SECTION_TITLE, CARD_TITLE, PANEL_TITLE, COLUMN_TITLE, NOTE, LABEL]) {
      const kept = tokens(cx(role, "text-danger"));
      const expected = tokens(role).filter((t) => !/^text-text\d?$/.test(t));
      expect(kept).toEqual([...expected, "text-danger"]);
    }
    expect(cx(STATUS_TEXT, "text-danger")).toBe(`${STATUS_TEXT} text-danger`);
    // and a caller's own spacing or truncation sits beside the role untouched
    keepsAll(PAGE_TITLE, "mt-1 truncate");
  });

  it("keeps classes under a variant beside the same utility without it", () => {
    keepsAll("transition-colors", "motion-reduce:transition-none");
    keepsAll("animate-enter", "motion-safe:animate-pop-in", "motion-reduce:animate-none");
    keepsAll("px-3", "pointer-fine:px-2", "md:pointer-fine:px-1");
    keepsAll("ring-0", "has-[input:focus]:ring-2", "has-[:checked]:bg-tint");
    keepsAll("opacity-100", "starting:opacity-0");
    keepsAll("rotate-0", "open:rotate-180", "group-open:rotate-90");
    keepsAll("bg-surface", "dark:bg-surface2", "[.gnosia_&]:bg-page", "[.gnosia.dark_&]:bg-track");
    keepsAll("pointer-coarse:after:-inset-2", "after:absolute");
    // the same variant on both is a conflict like any other
    expect(cx("motion-reduce:transition-none", "motion-reduce:transition-opacity")).toBe("motion-reduce:transition-opacity");
    expect(cx("hover:bg-surface2", "hover:bg-border/70")).toBe("hover:bg-border/70");
  });

  it("keeps arbitrary properties and values, shadows and important classes", () => {
    keepsAll("w-full", "[field-sizing:content]");
    keepsAll("[mask-image:linear-gradient(black,transparent)]", "overflow-hidden");
    keepsAll("shadow-[0_4px_0_var(--btn-lip)]", "text-white", "bg-btn-face");
    keepsAll("text-[var(--ok-on)]", "text-[12px]");
    keepsAll("rounded-md", "!rounded-full");
    keepsAll("rounded-md", "rounded-full!");
    keepsAll("animate-pop-in", "ease-soft");
    expect(cx("shadow-[0_4px_0_var(--btn-lip)]", "shadow-none")).toBe("shadow-none");
    expect(cx("animate-enter", "animate-none")).toBe("animate-none");
    expect(cx("font-sans", "font-display")).toBe("font-display");
    keepsAll("font-display font-bold");
    keepsAll("font-book font-semibold");
  });
});

describe("kit pieces take a caller's override", () => {
  it("radius", () => {
    expect(tokens(badgeClasses({ className: "rounded-md" }))).not.toContain("rounded-full");
    expect(tokens(chipClasses({ className: "rounded-lg" }))).not.toContain("rounded-full");
    expect(tokens(inputClasses({ className: "rounded-full" }))).not.toContain("rounded-lg");
    expect(tokens(cardClasses({ className: "rounded-xl" }))).not.toContain("rounded-[20px]");
    const cover = classOf(renderToStaticMarkup(createElement(Placeholder, { label: "CS3230", className: "rounded-none" })));
    expect(cover).toContain("rounded-none");
    expect(cover).not.toContain("rounded-xl");
  });

  it("gap", () => {
    for (const gap of ["gap-1.5", "gap-2"]) {
      const card = classOf(renderToStaticMarkup(createElement(Card, { as: "div", className: gap }, "x")));
      expect(card).toContain(gap);
      expect(card).not.toContain("gap-3");
    }
    expect(tokens(calloutClasses({ className: "gap-1" }))).not.toContain("gap-2");
    expect(tokens(menuRowClasses({ className: "gap-1" }))).not.toContain("gap-2.5");
  });

  it("padding", () => {
    const square = tokens(buttonClasses({ variant: "secondary", size: "sm", className: "w-9 px-0" }));
    expect(square).toEqual(expect.arrayContaining(["w-9", "px-0"]));
    expect(square).not.toContain("px-[18px]");
    expect(tokens(chipClasses({ className: "w-[34px] px-0" }))).not.toContain("px-3.5");
    expect(tokens(cardClasses({ className: "p-3" }))).not.toContain("p-5");
    const label = classOf(renderToStaticMarkup(createElement(Placeholder, { label: "Video", className: "px-1" })));
    expect(label).toContain("px-1");
    expect(label).not.toContain("px-3");
  });

  it("size", () => {
    expect(tokens(iconButtonClasses({ size: "lg", className: "size-6" }))).not.toContain("size-9");
    expect(tokens(inputClasses({ className: "h-9" }))).not.toContain("h-11");
    expect(tokens(buttonClasses({ className: "text-[13px]" }))).not.toContain("text-[15px]");
    expect(tokens(linkClasses({ size: "sm", className: "text-[12px]" }))).not.toContain("text-[13px]");
  });
});
