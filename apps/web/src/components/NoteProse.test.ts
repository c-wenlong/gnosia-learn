// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { NoteProse } from "./NoteProse";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount(element: ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

function render(source: string, props: Record<string, unknown> = {}) {
  return mount(createElement(NoteProse, { source, ...props }));
}

describe("structure", () => {
  it("drops the frontmatter instead of setting it as a paragraph", () => {
    const host = render(
      ["---", "id: self-attention", "tags: [transformers]", "---", "", "# Self-attention"].join(
        "\n",
      ),
    );
    expect(host.textContent).not.toContain("tags: [transformers]");
    expect(host.querySelector("h1")?.textContent).toBe("Self-attention");
  });

  it("renders the heading levels as heading elements", () => {
    const host = render("# One\n\n## Two\n\n### Three");
    expect(host.querySelector("h1")?.textContent).toBe("One");
    expect(host.querySelector("h2")?.textContent).toBe("Two");
    expect(host.querySelector("h3")?.textContent).toBe("Three");
  });

  it("gives a heading more room above it than below it", () => {
    // The rhythm is the whole point of the component, so it is asserted rather
    // than left to a screenshot: a heading has to bind to the section under it.
    const host = render("# One\n\n## Two");
    const heading = host.querySelector("h2")!;
    expect(heading.className).toContain("mt-10");
    expect(heading.className).toContain("mb-3");
  });

  it("renders both kinds of list, nested", () => {
    const host = render("- Concepts touched: 7\n  - [[softmax]]\n\n1. first\n2. second");
    expect(host.querySelectorAll("ul")).toHaveLength(2);
    expect(host.querySelectorAll("ol")).toHaveLength(1);
    expect(host.querySelectorAll("ol > li")).toHaveLength(2);
  });

  it("renders a fence as a code block and keeps its info string as a label", () => {
    const host = render("```check\nq: What does ReAct add?\n```");
    expect(host.querySelector("pre code")?.textContent).toBe("q: What does ReAct add?");
    expect(host.textContent).toContain("check");
  });

  it("renders a callout as an aside carrying its title", () => {
    const host = render("> [!success] Correct\n> **You answered:** 3");
    const aside = host.querySelector("aside");
    expect(aside).not.toBeNull();
    expect(aside?.textContent).toContain("Correct");
    expect(aside?.querySelector("strong")?.textContent).toBe("You answered:");
  });

  it("renders a plain quote as a blockquote, not as a callout", () => {
    const host = render("> Live log. The tutor appends here.");
    expect(host.querySelector("blockquote")).not.toBeNull();
    expect(host.querySelector("aside")).toBeNull();
  });

  it("says so when a note has nothing but frontmatter", () => {
    const host = render("---\nid: stub\n---\n");
    expect(host.textContent).toContain("no body yet");
  });
});

describe("links", () => {
  it("renders a markdown link, and sends an external one to a new tab safely", () => {
    const host = render("See [the paper](https://arxiv.org/abs/1706.03762).");
    const anchor = host.querySelector("a")!;
    expect(anchor.getAttribute("href")).toBe("https://arxiv.org/abs/1706.03762");
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("keeps an in-app link in the same tab", () => {
    const host = render("[the library](/library)");
    const anchor = host.querySelector("a")!;
    expect(anchor.getAttribute("target")).toBeNull();
  });

  it("marks a wikilink up without linking it when nothing resolves it", () => {
    const host = render("- [[dot-product]]");
    expect(host.querySelector("a")).toBeNull();
    expect(host.textContent).toContain("dot-product");
  });

  it("links a wikilink through the resolver it is given", () => {
    const host = render("- [[dot-product]]", {
      resolveNote: (slug: string) => `/library/concept%3A${slug}`,
    });
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/library/concept%3Adot-product");
  });
});

describe("what it will not render", () => {
  it("treats HTML in a note as text, so nothing in it can run", () => {
    const host = render('Then <script>alert(1)</script> and <img src=x onerror="alert(2)">.');
    expect(host.querySelector("script")).toBeNull();
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("<script>alert(1)</script>");
  });

  it("does not build an anchor out of a scheme that can execute", () => {
    const host = render("[click me](javascript:alert(1))");
    expect(host.querySelector("a")).toBeNull();
    expect(host.textContent).toContain("[click me](javascript:alert(1))");
  });

  it("checks the resolver's output too, since its argument came from the note", () => {
    const host = render("[[evil]]", { resolveNote: () => "javascript:alert(1)" });
    expect(host.querySelector("a")).toBeNull();
    expect(host.textContent).toContain("evil");
  });

  it("refuses a data: image and still names the file", () => {
    const host = render("![a picture](data:text/html;base64,PHNjcmlwdD4=)");
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("a picture");
  });
});

describe("embeds", () => {
  it("frames a resolved embed as a figure with the file as its alt text", () => {
    const host = render("![[vector-as-a-list-of-numbers.svg]]", {
      resolveEmbed: (name: string) => `/api/assets/${name}/file`,
    });
    const img = host.querySelector("figure img")!;
    expect(img.getAttribute("src")).toBe("/api/assets/vector-as-a-list-of-numbers.svg/file");
    expect(img.getAttribute("alt")).toBe("vector-as-a-list-of-numbers.svg");
  });

  it("prints a caption only when the note wrote one, never the filename", () => {
    const plain = render("![[a.svg]]", { resolveEmbed: () => "/a.svg" });
    expect(plain.querySelector("figcaption")).toBeNull();

    const captioned = render("![[a.svg|Two bases, one arrow]]", {
      resolveEmbed: () => "/a.svg",
    });
    expect(captioned.querySelector("figcaption")?.textContent).toBe("Two bases, one arrow");
  });

  it("names the gap when nothing resolves the embed", () => {
    const host = render("![[vector-as-a-list-of-numbers.svg]]");
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("vector-as-a-list-of-numbers.svg");
    expect(host.textContent).toContain("not available");
  });

  it("does not put a figure inside a paragraph when the embed is mid-sentence", () => {
    const host = render("as in ![[a.svg]] above", { resolveEmbed: () => "/a.svg" });
    expect(host.querySelector("figure")).toBeNull();
    expect(host.querySelector("p")?.textContent).toContain("a.svg");
  });
});

describe("maths", () => {
  it("sets a TeX span with real sub and superscripts", () => {
    const host = render("Compare $f(n)$ against $n^{\\log_b a}$.");
    expect(host.querySelector("sup")).not.toBeNull();
    expect(host.querySelector("sup sub")?.textContent).toBe("b");
    expect(host.textContent).not.toContain("$");
    expect(host.textContent).not.toContain("\\log");
  });
});
