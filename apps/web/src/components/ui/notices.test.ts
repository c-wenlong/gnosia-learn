// @vitest-environment jsdom
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

/** The markup parsed, so a test asks for a heading, a role or an attribute rather than a class string. */
function dom(markup: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host;
}

const tokens = (element: Element | null) => (element?.getAttribute("class") ?? "").split(" ");
/** Whether `a` comes before `b` in the document. */
const before = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

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
    const notice = dom(out).firstElementChild!;
    expect(notice.tagName).toBe("SECTION");
    expect(notice.getAttribute("role")).toBe("alert");
    const heading = notice.querySelector("h2")!;
    expect(heading.textContent).toBe("The catalog is unreachable");
    expect(tokens(heading)).toEqual(CARD_TITLE.split(" "));
    expect(notice.textContent).toContain("Nothing has been lost.");
    const code = notice.querySelector("code")!;
    expect(code.textContent).toBe("npm run catalog -- status");
    // The command selects whole with one click.
    expect(tokens(code)).toContain("select-all");
    expect(before(code, notice.querySelector("button")!)).toBe(true);
  });

  it("prints several commands one block each, keeping a command's own line breaks", () => {
    const codes = dom(html(createElement(Notice, { title: "t", commands: ["one", "two \\\n  --flag"] }))).querySelectorAll("code");
    expect([...codes].map((code) => code.textContent)).toEqual(["one", "two \\\n  --flag"]);
    expect(tokens(codes[1]!)).toContain("whitespace-pre");
  });

  it("draws the dense form tight, at the level asked, and leaves out what it was not given", () => {
    const notice = dom(html(createElement(Notice, { title: "Blocked", dense: true, level: 1 }))).firstElementChild!;
    expect(tokens(notice)).toContain("p-3.5");
    expect(notice.querySelector("h1")?.textContent).toBe("Blocked");
    expect(notice.querySelector("h2")).toBeNull();
    expect(notice.querySelector("code")).toBeNull();
    expect(notice.querySelector("[role]")).toBeNull();
    expect(notice.hasAttribute("role")).toBe(false);
    expect(notice.querySelector(".max-w-prose")).toBeNull();
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
    const plain = dom(html(createElement(Callout, { role: "alert" }, "The tutor could not answer."))).firstElementChild!;
    expect(plain.getAttribute("role")).toBe("alert");
    expect(tokens(plain)).toContain("bg-warn-tint");
    const verdict = [...plain.querySelectorAll("div")].find((div) => div.textContent === "The tutor could not answer.")!;
    expect(tokens(verdict)).not.toContain("text-text2");

    const titled = html(
      createElement(
        Callout,
        { tone: "neutral", title: "No question for this step", actions: createElement("button", null, "Ask again") },
        "The model is not available.",
      ),
    );
    const callout = dom(titled);
    const title = [...callout.querySelectorAll("p")].find((p) => p.textContent === "No question for this step")!;
    expect(tokens(title)).toContain("text-text");
    const detail = [...callout.querySelectorAll("div")].find((div) => div.textContent === "The model is not available.")!;
    expect(tokens(detail)).toContain("text-text2");
    expect(before(title, detail)).toBe(true);
    expect(before(detail, callout.querySelector("button")!)).toBe(true);
  });

  it("draws no empty body when it has nothing but a title", () => {
    const out = html(createElement(Callout, { title: "Saved" }, null));
    expect(out).not.toContain("break-words");
  });
});

describe("Banner", () => {
  it("is a status strip with a dot in its tone and no dismiss unless asked", () => {
    const banner = dom(html(createElement(Banner, null, "Not connected to the catalog."))).firstElementChild!;
    expect(banner.getAttribute("role")).toBe("status");
    expect(tokens(banner)).toEqual(expect.arrayContaining(["border-warn", "bg-warn-tint"]));
    const dot = banner.querySelector('[aria-hidden="true"]')!;
    expect(dot.textContent).toBe("");
    expect(tokens(dot)).toEqual(expect.arrayContaining(["rounded-full", "bg-warn-lip"]));
    expect(banner.querySelector("a, button")).toBeNull();
  });

  it("dismisses through a link that keeps the scroll, for a message carried in the URL", () => {
    const banner = dom(html(createElement(Banner, { tone: "danger", dismissHref: "/studio" } as BannerProps, "Accept: refused"))).firstElementChild!;
    const dismiss = banner.querySelector("a")!;
    expect(dismiss.textContent).toBe("Dismiss");
    expect(dismiss.getAttribute("href")).toBe("/studio");
    expect(tokens(banner)).toContain("bg-danger/8");
  });

  it("draws that link with the caller's link when it names one, with the same props", () => {
    const seen: Array<Record<string, unknown>> = [];
    const Own: NonNullable<BannerProps["dismissLink"]> = (props) => {
      seen.push(props);
      return createElement("a", { href: props.href, "data-own": "", className: props.className }, props.children);
    };
    const banner = dom(html(createElement(Banner, { dismissHref: "/studio", dismissLink: Own } as BannerProps, "Done."))).firstElementChild!;
    const dismiss = banner.querySelector("a")!;
    expect(dismiss.hasAttribute("data-own")).toBe(true);
    expect(dismiss.textContent).toBe("Dismiss");
    expect(seen[0]).toMatchObject({ href: "/studio", scroll: false });
  });

  it("dismisses through a button, named for what goes, and can leave the announcing to its caller", () => {
    const out = html(
      createElement(
        Banner,
        { role: "none", onDismiss: () => undefined, dismissAriaLabel: "Dismiss this message" } as BannerProps,
        "Not saved.",
      ),
    );
    const banner = dom(out).firstElementChild!;
    expect(banner.hasAttribute("role")).toBe(false);
    const dismiss = banner.querySelector("button")!;
    expect(dismiss.textContent).toBe("Dismiss");
    expect(dismiss.getAttribute("aria-label")).toBe("Dismiss this message");
    expect(dismiss.getAttribute("type")).toBe("button");
  });

  it("takes a wider gutter from its caller", () => {
    expect(bannerClasses({ tone: "ok", className: "md:px-7" })).toMatch(/border-ok bg-ok-tint md:px-7$/);
  });
});
