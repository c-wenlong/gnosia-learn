import { describe, expect, it } from "vitest";
import {
  isExternalHref,
  parseInline,
  parseNote,
  safeHref,
  standaloneFigure,
  type Block,
} from "./markdown";

/** The blocks of a note, without the frontmatter noise, for readable assertions. */
function blocks(source: string): Block[] {
  return parseNote(source).blocks;
}

describe("frontmatter", () => {
  it("takes the YAML block off the top and does not render it", () => {
    const note = parseNote(
      ["---", "id: self-attention", "tags: [transformers]", "---", "", "# Self-attention"].join(
        "\n",
      ),
    );
    expect(note.frontmatter).toBe("id: self-attention\ntags: [transformers]");
    expect(note.blocks).toEqual([{ kind: "heading", level: 1, text: "Self-attention" }]);
  });

  it("keeps an unclosed block as content rather than swallowing the file", () => {
    const note = parseNote("---\nid: broken\n\n# Still here");
    expect(note.frontmatter).toBeNull();
    expect(note.blocks.at(-1)).toEqual({ kind: "heading", level: 1, text: "Still here" });
  });

  it("leaves a note that starts with prose alone", () => {
    const note = parseNote("Just a sentence.\n\n---\n\nAnd another.");
    expect(note.frontmatter).toBeNull();
    expect(note.blocks.map((b) => b.kind)).toEqual(["paragraph", "rule", "paragraph"]);
  });
});

describe("headings and paragraphs", () => {
  it("reads the six ATX levels", () => {
    expect(blocks("# One\n\n## Two\n\n### Three\n\n###### Six").map((b) => b)).toEqual([
      { kind: "heading", level: 1, text: "One" },
      { kind: "heading", level: 2, text: "Two" },
      { kind: "heading", level: 3, text: "Three" },
      { kind: "heading", level: 6, text: "Six" },
    ]);
  });

  it("joins the soft wrapping notes are written with", () => {
    expect(blocks("The load-bearing detail is that the reasoning trace is\nemitted, not internal.")).toEqual([
      {
        kind: "paragraph",
        text: "The load-bearing detail is that the reasoning trace is emitted, not internal.",
      },
    ]);
  });

  it("ends a paragraph at whatever starts next", () => {
    expect(blocks("Some prose\n## A heading").map((b) => b.kind)).toEqual([
      "paragraph",
      "heading",
    ]);
  });

  it("reads a thematic break", () => {
    expect(blocks("a\n\n---\n\nb")[1]).toEqual({ kind: "rule" });
  });
});

describe("lists", () => {
  it("reads a bullet list with wrapped items", () => {
    const source = [
      "- **Context crowding.** As a run gets long, raw observations pile up",
      "  and squeeze out the original goal.",
      "- **Vague schema descriptions.** A bad one fails silently.",
    ].join("\n");
    const list = blocks(source)[0];
    expect(list.kind).toBe("list");
    if (list.kind !== "list") throw new Error("expected a list");
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toEqual([
      {
        kind: "paragraph",
        text: "**Context crowding.** As a run gets long, raw observations pile up and squeeze out the original goal.",
      },
    ]);
  });

  it("reads a numbered list and keeps where it starts", () => {
    const list = blocks("2. second\n3. third")[0];
    if (list.kind !== "list") throw new Error("expected a list");
    expect(list.ordered).toBe(true);
    expect(list.start).toBe(2);
    expect(list.items).toHaveLength(2);
  });

  it("nests the two-space indented list a session's Close section writes", () => {
    const source = [
      "- Questions answered: 8 (3 correct)",
      "- Concepts touched: 7",
      "  - [[transformer-block]] - 60% shaky",
      "  - [[softmax]] - 61% shaky",
    ].join("\n");
    const list = blocks(source)[0];
    if (list.kind !== "list") throw new Error("expected a list");
    expect(list.items).toHaveLength(2);
    const nested = list.items[1][1];
    expect(nested?.kind).toBe("list");
    if (nested?.kind !== "list") throw new Error("expected a nested list");
    expect(nested.items).toHaveLength(2);
  });

  it("does not fuse a bullet list into a numbered one", () => {
    expect(blocks("- a\n1. b").map((b) => b.kind)).toEqual(["list", "list"]);
  });
});

describe("fenced code", () => {
  it("keeps the info string and the body verbatim", () => {
    const source = ["```check", "q: What does ReAct add?", "a: An explicit trace.", "```"].join(
      "\n",
    );
    expect(blocks(source)).toEqual([
      { kind: "code", info: "check", text: "q: What does ReAct add?\na: An explicit trace." },
    ]);
  });

  it("does not read markdown inside a fence", () => {
    const block = blocks("```\n# not a heading\n- not a list\n```")[0];
    expect(block).toEqual({ kind: "code", info: "", text: "# not a heading\n- not a list" });
  });

  it("runs an unclosed fence to the end instead of dropping it", () => {
    expect(blocks("```check\nq: half written")).toEqual([
      { kind: "code", info: "check", text: "q: half written" },
    ]);
  });
});

describe("quotes and callouts", () => {
  it("reads a plain quote", () => {
    const quote = blocks("> Live log. The tutor appends here.")[0];
    expect(quote).toEqual({
      kind: "quote",
      callout: null,
      title: "",
      blocks: [{ kind: "paragraph", text: "Live log. The tutor appends here." }],
    });
  });

  it("reads a callout with its kind and its title", () => {
    const source = [
      "> [!success] Correct",
      "> **You answered:** 3",
      ">",
      "> The other three describe architectures the transformer replaced.",
    ].join("\n");
    const quote = blocks(source)[0];
    if (quote.kind !== "quote") throw new Error("expected a quote");
    expect(quote.callout).toBe("success");
    expect(quote.title).toBe("Correct");
    expect(quote.blocks).toHaveLength(2);
  });

  it("titles an untitled callout from its own kind", () => {
    const quote = blocks("> [!warning]\n> Reconstructed after the fact.")[0];
    if (quote.kind !== "quote") throw new Error("expected a quote");
    expect(quote.title).toBe("Warning");
  });

  it("keeps a numbered list of quiz options inside the callout", () => {
    const source = [
      "> [!question] Quiz",
      "> What makes self-attention self?",
      ">",
      "> 1. It attends only to its own output",
      "> 2. Q, K and V all come from the same sequence",
    ].join("\n");
    const quote = blocks(source)[0];
    if (quote.kind !== "quote") throw new Error("expected a quote");
    const list = quote.blocks[1];
    if (list?.kind !== "list") throw new Error("expected a list in the callout");
    expect(list.ordered).toBe(true);
    expect(list.items).toHaveLength(2);
  });

  it("splits a run of quote lines where a callout starts mid-block", () => {
    // The real 2026-08-20 session log opens exactly like this, with no blank
    // line between the preamble and the first quiz.
    const source = ["> Live log.", "> [!question] Quiz", "> What sits inside a block?"].join("\n");
    const parsed = blocks(source);
    expect(parsed).toHaveLength(2);
    if (parsed[0].kind !== "quote" || parsed[1].kind !== "quote") {
      throw new Error("expected two quotes");
    }
    expect(parsed[0].callout).toBeNull();
    expect(parsed[1].callout).toBe("question");
  });

  it("keeps an unknown callout kind rather than dropping the block", () => {
    const quote = blocks("> [!hypothesis] Maybe\n> Worth testing.")[0];
    if (quote.kind !== "quote") throw new Error("expected a quote");
    expect(quote.callout).toBe("hypothesis");
    expect(quote.title).toBe("Maybe");
  });
});

describe("inline", () => {
  it("reads bold, italic and inline code", () => {
    expect(parseInline("**bold** and *thin* and `code()`")).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "bold" }] },
      { kind: "text", text: " and " },
      { kind: "em", children: [{ kind: "text", text: "thin" }] },
      { kind: "text", text: " and " },
      { kind: "code", text: "code()" },
    ]);
  });

  it("leaves markdown inside a code span alone", () => {
    expect(parseInline("`**not bold**`")).toEqual([{ kind: "code", text: "**not bold**" }]);
  });

  it("leaves an unclosed marker as the character it is", () => {
    expect(parseInline("2 * 3 * 4 and a lone **")).toEqual([
      { kind: "text", text: "2 * 3 * 4 and a lone **" },
    ]);
  });

  it("reads a wikilink, with and without an alias", () => {
    expect(parseInline("see [[dot-product]]")).toEqual([
      { kind: "text", text: "see " },
      { kind: "note", target: "dot-product", label: "dot-product" },
    ]);
    expect(parseInline("[[dot-product|the dot product]]")).toEqual([
      { kind: "note", target: "dot-product", label: "the dot product" },
    ]);
  });

  it("reads an embed as an embed, not as a link to !name", () => {
    expect(parseInline("![[vector-as-a-list-of-numbers.svg]]")).toEqual([
      { kind: "embed", target: "vector-as-a-list-of-numbers.svg", caption: null },
    ]);
  });

  it("takes an embed's alias as its caption", () => {
    expect(parseInline("![[a.svg|Two bases, one arrow]]")).toEqual([
      { kind: "embed", target: "a.svg", caption: "Two bases, one arrow" },
    ]);
  });

  it("reads a markdown link", () => {
    expect(parseInline("[the paper](https://arxiv.org/abs/1706.03762)")).toEqual([
      { kind: "link", href: "https://arxiv.org/abs/1706.03762", label: "the paper" },
    ]);
  });

  it("leaves a link with a refused scheme on the page as text", () => {
    expect(parseInline("[click](javascript:alert(1))")).toEqual([
      { kind: "text", text: "[click](javascript:alert(1))" },
    ]);
  });

  it("treats embedded HTML as the text it is", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([
      { kind: "text", text: "<script>alert(1)</script>" },
    ]);
  });

  it("leaves a backslash alone, because the notes are full of TeX", () => {
    expect(parseInline("a \\* b")).toEqual([{ kind: "text", text: "a \\* b" }]);
  });
});

describe("math", () => {
  it("turns a TeX span into greek, functions and real sub and superscripts", () => {
    const nodes = parseInline("compare against $n^{\\log_b a}$");
    expect(nodes[0]).toEqual({ kind: "text", text: "compare against " });
    expect(nodes[1]).toEqual({
      kind: "math",
      nodes: [
        { kind: "text", text: "n" },
        {
          kind: "sup",
          nodes: [
            { kind: "text", text: "log", roman: true },
            { kind: "sub", nodes: [{ kind: "text", text: "b" }] },
            { kind: "text", text: " a" },
          ],
        },
      ],
    });
  });

  it("maps the symbols the algorithms notes use, and thins the spacing macros", () => {
    const [node] = parseInline("$f(n) \\le c\\,g(n)$");
    if (node.kind !== "math") throw new Error("expected math");
    expect(node.nodes.map((n) => (n.kind === "text" ? n.text : n.kind)).join("")).toBe(
      "f(n) \u2264 c\u2009g(n)",
    );
  });

  it("shows an unknown macro unrendered rather than half-rendered", () => {
    const [node] = parseInline("$\\frac{a}{b}$");
    if (node.kind !== "math") throw new Error("expected math");
    expect(node.nodes).toEqual([{ kind: "text", text: "\\fracab" }]);
  });

  it("does not read currency as a formula", () => {
    expect(parseInline("it costs $5 and saves $3 a month")).toEqual([
      { kind: "text", text: "it costs $5 and saves $3 a month" },
    ]);
  });
});

describe("safeHref", () => {
  it("admits the schemes a note legitimately links with", () => {
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("http://example.com")).toBe("http://example.com");
    expect(safeHref("mailto:someone@example.com")).toBe("mailto:someone@example.com");
  });

  it("admits relative and in-page targets, which carry no scheme", () => {
    expect(safeHref("/library/abc")).toBe("/library/abc");
    expect(safeHref("#the-idea")).toBe("#the-idea");
    expect(safeHref("notes/dot-product.md")).toBe("notes/dot-product.md");
  });

  it("refuses every scheme that can execute or carry a payload", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("JavaScript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(safeHref("vbscript:msgbox(1)")).toBeNull();
    expect(safeHref("blob:https://example.com/x")).toBeNull();
  });

  it("refuses a scheme hidden behind control characters", () => {
    expect(safeHref("java\tscript:alert(1)")).toBeNull();
    expect(safeHref("java\nscript:alert(1)")).toBeNull();
  });

  it("refuses nothing at all", () => {
    expect(safeHref("   ")).toBeNull();
  });

  it("knows which links leave the app", () => {
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("/library/abc")).toBe(false);
    expect(isExternalHref("mailto:a@b.c")).toBe(false);
  });
});

describe("standaloneFigure", () => {
  it("finds an embed sitting on a line of its own", () => {
    expect(standaloneFigure(parseInline("![[a.svg]]"))).toEqual({ kind: "embed", target: "a.svg", caption: null });
  });

  it("does not promote an embed in the middle of a sentence", () => {
    expect(standaloneFigure(parseInline("as in ![[a.svg]] above"))).toBeNull();
  });

  it("ignores surrounding whitespace", () => {
    expect(standaloneFigure(parseInline("  ![[a.svg]]  "))).not.toBeNull();
  });
});

describe("the whole shape of a real note", () => {
  const note = [
    "---",
    "id: react-loop",
    "title: ReAct loop",
    "---",
    "",
    "# ReAct loop",
    "",
    "ReAct interleaves reasoning traces with tool calls, so each observation",
    "can revise the plan mid-flight.",
    "",
    "## Failure modes",
    "",
    "- **Context crowding.** Raw observations pile up.",
    "",
    "## Checks",
    "",
    "```check",
    "q: What does ReAct add?",
    "```",
    "",
    "## Prerequisites",
    "",
    "- [[tool-calling]]",
  ].join("\n");

  it("comes out as the sequence of blocks the file describes", () => {
    expect(blocks(note).map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "list",
      "heading",
      "code",
      "heading",
      "list",
    ]);
  });
});
