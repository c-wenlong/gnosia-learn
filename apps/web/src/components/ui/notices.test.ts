import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Banner } from "./Banner";
import { Callout } from "./Callout";
import { bannerClasses, calloutClasses, CARD_TITLE } from "./classes";
import { Notice } from "./Notice";

/**
 * The three ways the app says a state, as the server renders them: `Notice`
 * in place of content, `Callout` in the flow, `Banner` across a region. The
 * confirms hold focus and are tested in a DOM (`confirm-components.test.ts`).
 */
type BannerProps = ComponentProps<typeof Banner>;
const html = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);

describe("Notice", () => {
  it("is a card with a heading, its words, the command to copy and its actions", () => {
    const out = html(
      createElement(
        Notice,
        {
          title: "The catalog is unreachable",
          command: "npm run catalog -- status",
          role: "alert",
          actions: createElement("button", { type: "button" }, "Try again"),
        },
        "Nothing has been lost.",
      ),
    );
    expect(out).toMatch(/^<section role="alert" class="[^"]*rounded-\[20px\][^"]*p-5/);
    expect(out).toContain(`<h2 class="${CARD_TITLE}">The catalog is unreachable</h2>`);
    expect(out).toContain("Nothing has been lost.");
    expect(out).toMatch(/<code class="[^"]*select-all[^"]*">npm run catalog -- status<\/code>/);
    expect(out.indexOf("<code")).toBeLessThan(out.indexOf("Try again"));
  });

  it("prints several commands one block each, keeping a command's own line breaks", () => {
    const out = html(createElement(Notice, { title: "t", commands: ["one", "two \\\n  --flag"] }));
    expect(out.match(/<code/g)).toHaveLength(2);
    expect(out).toContain("whitespace-pre");
    expect(out).toContain("two \\\n  --flag");
  });

  it("draws the dense form tight, at the level asked, and leaves out what it was not given", () => {
    const out = html(createElement(Notice, { title: "Blocked", dense: true, level: 1 }));
    expect(out).toContain("p-3.5");
    expect(out).toContain('<h1 class="text-[14px] leading-5 font-bold text-text">Blocked</h1>');
    expect(out).not.toContain("<code");
    expect(out).not.toContain("role=");
    expect(out).not.toContain("max-w-prose");
  });
});

describe("Callout", () => {
  it("has one shape for every tone, differing only in its tint and ring", () => {
    const shape = (classes: string) => classes.replace(/\b(?:bg|border)-\S+/g, "").replace(/\s+/g, " ").trim();
    const warn = calloutClasses({ tone: "warn" });
    expect(shape(calloutClasses({ tone: "neutral" }))).toBe(shape(warn));
    expect(shape(calloutClasses({ tone: "danger", bordered: true }))).toBe(shape(warn));
    expect(warn).toContain("bg-warn-tint");
    expect(warn).toContain("text-text");
    expect(warn).not.toContain("border-2");
    expect(calloutClasses({ bordered: true })).toContain("border-2 border-warn");
  });

  it("says a verdict in --text, and a title's detail in --text2, with its actions under the words", () => {
    const plain = html(createElement(Callout, { role: "alert" }, "The tutor could not answer."));
    expect(plain).toMatch(/^<div role="alert" class="[^"]*bg-warn-tint/);
    expect(plain).toContain('<div class="min-w-0 break-words">The tutor could not answer.</div>');

    const titled = html(
      createElement(
        Callout,
        { tone: "neutral", title: "No question for this step", actions: createElement("button", null, "Ask again") },
        "The model is not available.",
      ),
    );
    expect(titled).toContain('<p class="text-[14px] font-semibold text-text">No question for this step</p>');
    expect(titled).toContain('<div class="min-w-0 break-words text-text2">The model is not available.</div>');
    expect(titled.indexOf("The model is not available.")).toBeLessThan(titled.indexOf("Ask again"));
  });

  it("draws no empty body when it has nothing but a title", () => {
    const out = html(createElement(Callout, { title: "Saved" }, null));
    expect(out).not.toContain("break-words");
  });
});

describe("Banner", () => {
  it("is a status strip with a dot in its tone and no dismiss unless asked", () => {
    const out = html(createElement(Banner, null, "Not connected to the catalog."));
    expect(out).toMatch(/^<div role="status" class="[^"]*border-b-2[^"]*border-warn bg-warn-tint/);
    expect(out).toContain('<span aria-hidden="true" class="mt-1.5 size-2 shrink-0 rounded-full bg-warn-lip"></span>');
    expect(out).not.toContain("Dismiss");
  });

  it("dismisses through a link that keeps the scroll, for a message carried in the URL", () => {
    const out = html(createElement(Banner, { tone: "danger", dismissHref: "/studio" } as BannerProps, "Accept: refused"));
    expect(out).toContain('href="/studio"');
    expect(out).toContain(">Dismiss</a>");
    expect(out).toContain("bg-danger/8");
  });

  it("dismisses through a button, named for what goes, and can leave the announcing to its caller", () => {
    const out = html(
      createElement(
        Banner,
        { role: "none", onDismiss: () => undefined, dismissAriaLabel: "Dismiss this message" } as BannerProps,
        "Not saved.",
      ),
    );
    expect(out).not.toContain("role=");
    expect(out).toMatch(/<button type="button" class="[^"]*" aria-label="Dismiss this message">Dismiss<\/button>/);
  });

  it("takes a wider gutter from its caller", () => {
    expect(bannerClasses({ tone: "ok", className: "md:px-7" })).toMatch(/border-ok bg-ok-tint md:px-7$/);
  });
});
