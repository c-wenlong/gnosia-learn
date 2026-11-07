// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { BackLink } from "./BackLink";
import { CLOSE_TITLE, COLUMN_TITLE, CONCEPT_TITLE, LABEL, NOTE, PAGE_TITLE } from "./classes";
import { FocusHeading } from "./FocusHeading";
import { Notice } from "./Notice";
import { PageHeader } from "./PageHeader";

/**
 * The pieces a page is framed with: `PageHeader` (the place line, the `<h1>`,
 * its note and the actions), `FocusHeading` (a focus page's closing title),
 * `BackLink` (the way back, its arrow silent), and `Notice`'s centred form
 * for a focus page's outage.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLElement;

function draw(element: ReturnType<typeof createElement>): HTMLElement {
  if (root === null) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  act(() => root!.render(element));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

const tokens = (element: Element | null) => (element?.getAttribute("class") ?? "").split(" ");
/** Whether `a` comes before `b` in the document. */
const before = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
const header = (props: ComponentProps<typeof PageHeader>) => draw(createElement(PageHeader, props)).querySelector("header")!;

describe("PageHeader", () => {
  it("draws the place line as the kit eyebrow over the page title, with its note and actions", () => {
    const row = header({
      eyebrow: "CS4263 · Module 1 · Informed search",
      title: "A* search",
      note: "3 concepts",
      actions: createElement("button", { type: "button" }, "Teach me"),
    });
    const [eyebrow, title, note] = [...row.querySelectorAll("p, h1")] as HTMLElement[];
    expect(eyebrow!.textContent).toBe("CS4263 · Module 1 · Informed search");
    expect(tokens(eyebrow!)).toEqual(LABEL.split(" "));
    expect(title!.tagName).toBe("H1");
    expect(title!.textContent).toBe("A* search");
    expect(tokens(title!)).toEqual(PAGE_TITLE.split(" "));
    expect(note!.textContent).toBe("3 concepts");
    expect(tokens(note!)).toEqual([...NOTE.split(" "), "basis-full"]);
    const button = row.querySelector("button")!;
    expect(before(title!, button)).toBe(true);
    expect(row.querySelectorAll("h1")).toHaveLength(1);
  });

  it("runs the note under the whole row when there are actions, so a long one is not squeezed beside them", () => {
    const row = header({ title: "Self-attention", note: "A session here asks nothing.", noteId: "asks", actions: createElement("button", null, "Teach me") });
    const note = row.querySelector("#asks")!;
    expect(note.parentElement).toBe(row);
    expect(row.lastElementChild).toBe(note);
    expect(tokens(note)).toContain("basis-full");
    expect(before(row.querySelector("button")!, note)).toBe(true);
  });

  it("keeps the title role its page names", () => {
    expect(tokens(header({ title: "Heaps", titleClass: CONCEPT_TITLE }).querySelector("h1"))).toEqual(CONCEPT_TITLE.split(" "));
    expect(tokens(header({ title: "Search", titleClass: COLUMN_TITLE }).querySelector("h1"))).toEqual(COLUMN_TITLE.split(" "));
  });

  it("holds the title alone when given nothing else, with no empty eyebrow, note or actions row", () => {
    const row = header({ title: "Library", eyebrow: "", note: null, actions: false });
    expect(row.querySelectorAll("p")).toHaveLength(0);
    expect(row.children).toHaveLength(1);
    expect(row.textContent).toBe("Library");
  });

  it("keeps the note under the title when there are no actions", () => {
    const row = header({ title: "quantum tunnelling", note: "This chat is not saved." });
    const note = row.querySelector("p")!;
    expect(note.parentElement).toBe(row.querySelector("h1")!.parentElement);
    expect(tokens(note)).not.toContain("basis-full");
  });

  it("puts the note on the title's baseline when asked, and names it for what it describes", () => {
    const row = header({ title: "Learn", note: "12 concepts", noteBeside: true, noteId: "learn-count" });
    const title = row.querySelector("h1")!;
    const note = row.querySelector("p")!;
    expect(note.id).toBe("learn-count");
    expect(title.parentElement).toBe(note.parentElement);
    expect(tokens(title.parentElement)).toContain("items-baseline");
  });
});

describe("FocusHeading", () => {
  it("is a centred close title that takes the focus without an outline, over its lead", () => {
    const block = draw(createElement(FocusHeading, { title: "Session closed", lead: "Heaps · 4 min", className: "pt-2" })).firstElementChild!;
    expect(tokens(block)).toEqual(expect.arrayContaining(["items-center", "text-center", "pt-2"]));
    const title = block.querySelector("h1")!;
    expect(title.textContent).toBe("Session closed");
    expect(title.getAttribute("tabindex")).toBe("-1");
    expect(tokens(title)).toEqual([...CLOSE_TITLE.split(" "), "outline-none"]);
    const lead = block.querySelector("p")!;
    expect(lead.textContent).toBe("Heaps · 4 min");
    expect(tokens(lead)).toEqual(expect.arrayContaining(["text-[14px]", "text-text2", "max-w-[480px]"]));
  });

  it("draws no lead it was not given", () => {
    expect(draw(createElement(FocusHeading, { title: "Nothing due" })).querySelector("p")).toBeNull();
  });
});

describe("BackLink", () => {
  it("links back with the arrow hidden from a screen reader, so the words alone name it", () => {
    const link = draw(createElement(BackLink, { href: "/courses/cs/m1" } as ComponentProps<typeof BackLink>, "Back to module")).querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/courses/cs/m1");
    const arrow = link.querySelector("span")!;
    expect(arrow.textContent).toBe("←");
    expect(arrow.getAttribute("aria-hidden")).toBe("true");
    // What is left once the hidden arrow is taken out: the accessible name.
    const named = link.cloneNode(true) as HTMLElement;
    named.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
    expect(named.textContent?.trim()).toBe("Back to module");
    expect(tokens(link)).toContain("self-start");
  });
});

describe("Notice, centred", () => {
  it("centres its heading, words, command and actions for a focus page", () => {
    const notice = draw(
      createElement(
        Notice,
        {
          title: "The session cannot start",
          level: 1,
          align: "center",
          command: "npm run catalog -- status",
          actions: createElement("a", { href: "/learn/x" }, "Back to the workspace"),
        },
        "The catalog could not be read.",
      ),
    ).querySelector("section")!;
    expect(tokens(notice)).toEqual(expect.arrayContaining(["items-center", "text-center"]));
    expect(tokens(notice)).not.toContain("items-start");
    expect(notice.querySelector("h1")?.textContent).toBe("The session cannot start");
    expect(tokens(notice.querySelector("code")!.parentElement)).toContain("items-center");
    expect(tokens(notice.querySelector("a")!.parentElement)).toContain("justify-center");
  });

  it("stays start-aligned by default", () => {
    const notice = draw(createElement(Notice, { title: "t", command: "c", actions: createElement("button", null, "b") })).querySelector("section")!;
    expect(tokens(notice)).toContain("items-start");
    expect(tokens(notice)).not.toContain("text-center");
    expect(tokens(notice.querySelector("button")!.parentElement)).not.toContain("justify-center");
  });
});
