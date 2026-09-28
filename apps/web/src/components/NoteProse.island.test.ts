import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The no-JavaScript guarantee, measured.
 *
 * `NoteProse` is a server component that ships nothing to the browser, and the
 * one client island it may render is `EmbedImage`. In the App Router a client
 * component's chunk is sent only for the client references a render actually
 * emits, so "a note without pictures ships no JavaScript" is exactly "a note
 * without pictures never renders `EmbedImage`". The island is wrapped in a
 * counter here and the note is rendered the way the server renders it, to
 * static markup, with no DOM at all.
 */

const renders = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/components/EmbedImage", async (importOriginal) => {
  const real = await importOriginal<typeof import("./EmbedImage")>();
  return {
    EmbedImage: (props: Parameters<typeof real.EmbedImage>[0]) => {
      renders.count += 1;
      return real.EmbedImage(props);
    },
  };
});

const { NoteProse } = await import("./NoteProse");

const render = (source: string, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(NoteProse, { source, ...props }));

beforeEach(() => {
  renders.count = 0;
});

describe("NoteProse's client island", () => {
  it("is never rendered for a note without pictures, however rich the note is", () => {
    const html = render(
      [
        "---",
        "id: x",
        "---",
        "# A heading",
        "",
        "## Another, with [[a-link]] and **bold** and `code`",
        "",
        "- a list",
        "  - nested",
        "",
        "> [!question] A callout",
        "> with a line",
        "",
        "```check",
        "Q: something?",
        "```",
        "",
        "An embed mid-sentence, ![[named-only.svg]], is named and not loaded.",
        "",
        "$n^{\\log_b a}$",
      ].join("\n"),
      { resolveEmbed: () => "/never-used.svg", resolveNote: () => "/library/x" },
    );
    expect(html).toContain("A heading");
    expect(html).not.toContain("<img");
    expect(renders.count).toBe(0);
  });

  it("is not rendered for an embed the server already knows cannot load", () => {
    const html = render("![[gone.svg]]", {
      resolveEmbed: () => ({ problem: "not-in-catalog" }),
    });
    expect(html).toContain('data-problem="not-in-catalog"');
    expect(renders.count).toBe(0);
  });

  it("is rendered once per picture that will actually be fetched", () => {
    render("![[a.svg]]\n\n![[b.svg]]", { resolveEmbed: (name: string) => `/${name}` });
    expect(renders.count).toBe(2);
  });
});
