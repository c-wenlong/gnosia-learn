import { describe, expect, it } from "vitest";
import {
  headingIds,
  inlineText,
  isExternalHref,
  parseInline,
  parseNote,
  safeHref,
  slugify,
  standaloneFigure,
  type Block,
} from "../src/markdown";

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
  it("keeps a TeX span as its raw source, for KaTeX to set", () => {
    const nodes = parseInline("compare against $n^{\\log_b a}$");
    expect(nodes).toEqual([
      { kind: "text", text: "compare against " },
      { kind: "math", source: "n^{\\log_b a}", display: false },
    ]);
  });

  it("passes macros through untouched, including ones the old symbol table lacked", () => {
    expect(parseInline("$f(n) \\le c\\,g(n)$")).toEqual([
      { kind: "math", source: "f(n) \\le c\\,g(n)", display: false },
    ]);
    expect(parseInline("$\\frac{a}{b}$")).toEqual([{ kind: "math", source: "\\frac{a}{b}", display: false }]);
  });

  it("does not read currency as a formula", () => {
    expect(parseInline("it costs $5 and saves $3 a month")).toEqual([
      { kind: "text", text: "it costs $5 and saves $3 a month" },
    ]);
    expect(parseInline("$3 and $5")).toEqual([{ kind: "text", text: "$3 and $5" }]);
  });

  it("does not read a price range as a formula, though both dollars hug a digit", () => {
    expect(parseInline("between $5-$10 a month")).toEqual([{ kind: "text", text: "between $5-$10 a month" }]);
  });

  it("reads \\$ as a literal dollar, outside a formula and inside one", () => {
    expect(parseInline("costs \\$5, and $x = \\$3$")).toEqual([
      { kind: "text", text: "costs $5, and " },
      { kind: "math", source: "x = \\$3", display: false },
    ]);
  });

  it("reads $$...$$ mid-line as display maths", () => {
    expect(parseInline("so $$\\sum_{i=1}^{n} i$$ holds")).toEqual([
      { kind: "text", text: "so " },
      { kind: "math", source: "\\sum_{i=1}^{n} i", display: true },
      { kind: "text", text: " holds" },
    ]);
  });

  it("leaves an unclosed $$ as text rather than opening $...$ at its second dollar", () => {
    expect(parseInline("a $$x and $y$")).toEqual([
      { kind: "text", text: "a $$x and " },
      { kind: "math", source: "y", display: false },
    ]);
  });
});

describe("display math blocks", () => {
  it("takes a $$ paragraph over several lines as one block, newlines kept", () => {
    expect(blocks(["Before.", "", "$$", "\\sum_{i=1}^{n} i", "= \\frac{n(n+1)}{2}", "$$", "", "After."].join("\n"))).toEqual([
      { kind: "paragraph", text: "Before." },
      { kind: "math", source: "\\sum_{i=1}^{n} i\n= \\frac{n(n+1)}{2}" },
      { kind: "paragraph", text: "After." },
    ]);
  });

  it("takes $$...$$ on one line as a block", () => {
    expect(blocks("$$ \\hat{y} = Wx $$")).toEqual([{ kind: "math", source: "\\hat{y} = Wx" }]);
  });

  it("ends the paragraph above it when written without a blank line", () => {
    expect(blocks(["The sum is", "$$", "a + b", "$$"].join("\n"))).toEqual([
      { kind: "paragraph", text: "The sum is" },
      { kind: "math", source: "a + b" },
    ]);
  });

  it("works inside a list item and a callout", () => {
    expect(blocks("- $$x^2$$")).toEqual([
      { kind: "list", ordered: false, start: 1, items: [[{ kind: "math", source: "x^2" }]] },
    ]);
    expect(blocks(["> [!note] Rule", "> $$a \\le b$$"].join("\n"))).toEqual([
      { kind: "quote", callout: "note", title: "Rule", blocks: [{ kind: "math", source: "a \\le b" }] },
    ]);
  });

  it("reads an unclosed block as a paragraph, so the text still shows", () => {
    expect(blocks(["$$", "x^2", "", "Next."].join("\n"))).toEqual([
      { kind: "paragraph", text: "$$ x^2" },
      { kind: "paragraph", text: "Next." },
    ]);
  });

  it("does not let an unclosed $$ swallow a heading, a fence or a rule before a later $$", () => {
    const note = ["$$", "x^2", "## Next section", "Body.", "", "```", "code", "```", "", "---", "", "Ends $$"].join("\n");
    expect(blocks(note)).toEqual([
      { kind: "paragraph", text: "$$ x^2" },
      { kind: "heading", level: 2, text: "Next section" },
      { kind: "paragraph", text: "Body." },
      { kind: "code", info: "", text: "code" },
      { kind: "rule" },
      { kind: "paragraph", text: "Ends $$" },
    ]);
    expect(blocks(["$$", "a", "```", "b", "```", "$$"].join("\n"))[0]).toEqual({ kind: "paragraph", text: "$$ a" });
  });

  it("keeps list-like and quote-like continuation lines inside a formula", () => {
    expect(blocks(["$$", "a", "- b", "> 0", "$$"].join("\n"))).toEqual([{ kind: "math", source: "a\n- b\n> 0" }]);
  });

  it("reads two formulas in one line as a sentence, not one block", () => {
    const [block] = blocks("$$a$$ and $$b$$");
    expect(block).toEqual({ kind: "paragraph", text: "$$a$$ and $$b$$" });
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

  it("treats a protocol-relative URL as leaving the app, however its slashes are written", () => {
    // A browser opens every one of these on evil.example.
    for (const href of ["//evil.example/x", "/\\evil.example/x", "\\\\evil.example/x", "https:\\\\evil.example", "/\t/evil.example", "\u001f//evil.example/x", "\u0000https://evil.example"]) {
      expect(isExternalHref(href), href).toBe(true);
    }
    expect(isExternalHref("/x//y")).toBe(false);
    expect(isExternalHref("./a")).toBe(false);
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

describe("inlineText", () => {
  it("reads the same visible word whether it is code or bold", () => {
    expect(inlineText(parseInline("The `softmax` step"))).toBe("The softmax step");
    expect(inlineText(parseInline("The **softmax** step"))).toBe("The softmax step");
  });

  it("takes a wikilink's label, not its target", () => {
    expect(inlineText(parseInline("[[dot-product|the dot product]]"))).toBe("the dot product");
    expect(inlineText(parseInline("[[dot-product]]"))).toBe("dot-product");
  });

  it("takes an embed's target, never its caption, matching how InlineView names it inline", () => {
    // An embed inside a heading (or mid-sentence anywhere) cannot become the
    // `<figure>` a standalone one gets, so `InlineView` names it by `target`
    // regardless of any `|alias` the note wrote. The id has to agree, or the
    // link's own accessible name would describe text nobody sees on the page.
    expect(inlineText(parseInline("![[a.svg|Two bases]]"))).toBe("a.svg");
    expect(inlineText(parseInline("![[a.svg]]"))).toBe("a.svg");
  });

  it("takes an image's alt, or its src with none, matching how InlineView names it inline", () => {
    expect(inlineText(parseInline("![a picture](x.png)"))).toBe("a picture");
    expect(inlineText(parseInline("![](x.png)"))).toBe("x.png");
  });

  it("reads math as its LaTeX source, which slugify reduces to letters", () => {
    expect(inlineText(parseInline("$\\alpha \\le \\beta$"))).toBe("\\alpha \\le \\beta");
    expect(slugify(inlineText(parseInline("Why $\\Theta(n)$ holds")))).toBe("why-theta-n-holds");
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("The Idea")).toBe("the-idea");
  });

  it("collapses any run of non-alphanumeric characters to one hyphen", () => {
    expect(slugify("A, B & C -- D")).toBe("a-b-c-d");
  });

  it("trims a leading or trailing hyphen rather than keeping it", () => {
    expect(slugify("-- The Idea --")).toBe("the-idea");
  });

  it("keeps an accented letter rather than folding it to its plain form", () => {
    // There used to be an accent fold here (café -> cafe). It is gone: the
    // same decompose-then-strip step that can pull an accent off a Latin
    // letter also strips a combining mark that is part of the word in other
    // scripts, which is the bug the next few tests are about.
    expect(slugify("Café")).toBe("café");
  });

  it("gives a precomposed and a decomposed form of the same accented letter the same id", () => {
    // "\u00e9" is one codepoint, precomposed "e" with an acute accent.
    // "e\u0301" is two codepoints, a plain "e" followed by a combining acute
    // accent - the same visible word, and exactly the kind of difference a
    // note pasted from somewhere else can carry without anyone noticing.
    // normalize("NFC") composes the second form into the first before
    // anything else runs.
    const precomposed = "caf\u00e9";
    const decomposed = "cafe\u0301";
    expect(precomposed).not.toBe(decomposed);
    expect(precomposed.length).not.toBe(decomposed.length);
    expect(slugify(precomposed)).toBe(slugify(decomposed));
    expect(slugify(precomposed)).toBe("caf\u00e9");
  });

  it("falls back to a non-empty id for punctuation-only text", () => {
    expect(slugify("???")).toBe("section");
  });

  it("falls back to a non-empty id for punctuation in a non-Latin script too", () => {
    // Three Japanese full stops: real characters, none of them a letter or a
    // digit, so this exercises the fallback rather than the Unicode keep-list
    // below.
    expect(slugify("。。。")).toBe("section");
  });

  it("keeps a heading written in a non-Latin script instead of folding it away", () => {
    // An HTML id may hold any non-space character, and a browser
    // percent-encodes the fragment, so this is a real, working anchor and not
    // a special case.
    expect(slugify("概要")).toBe("概要");
  });

  it("keeps the Latin word in a heading that mixes scripts, hyphenated onto the rest", () => {
    expect(slugify("第二章 Overview")).toBe("第二章-overview");
  });

  it("keeps a combining vowel sign, since it carries meaning rather than decoration", () => {
    // किताब ("book", Hindi/Devanagari): consonant, vowel sign, consonant,
    // vowel sign, consonant. Every vowel sign is a combining mark (\p{M}), the
    // same general category the old accent fold stripped wholesale off Latin
    // text - here that would delete two of the five characters, not four
    // decorations off a base word.
    expect(slugify("किताब")).toBe("किताब");
  });

  it("keeps a bare consonant and the same consonant plus a vowel sign apart", () => {
    // The bug this guards: stripping \p{M} turned "कि" (क + the vowel sign
    // ि) into the same string as "क" alone, so the second heading's link
    // landed on the first.
    const bare = slugify("क");
    const withVowelSign = slugify("कि");
    expect(bare).not.toBe(withVowelSign);
    expect(bare).toBe("क");
    expect(withVowelSign).toBe("कि");
  });
});

describe("headingIds", () => {
  function headingsOf(source: string): Array<Block & { kind: "heading" }> {
    return parseNote(source).blocks.filter(
      (b): b is Block & { kind: "heading" } => b.kind === "heading",
    );
  }

  it("gives a heading its own text as the id", () => {
    const [heading] = headingsOf("## The idea");
    expect(headingIds([heading]).get(heading)).toBe("the-idea");
  });

  it("gives a repeated heading a distinct, numbered id rather than reusing the first", () => {
    const [first, second, third] = headingsOf("## Probe\n\ntext\n\n## Probe\n\nmore\n\n## Probe");
    const ids = headingIds([first, second, third]);
    expect(ids.get(first)).toBe("probe");
    expect(ids.get(second)).toBe("probe-2");
    expect(ids.get(third)).toBe("probe-3");
  });

  it("produces the same ids for the same note parsed twice over", () => {
    const source = "## The idea\n\nprose\n\n## The idea";
    const first = [...headingIds(parseNote(source).blocks).values()];
    const second = [...headingIds(parseNote(source).blocks).values()];
    expect(first).toEqual(second);
    expect(first).toEqual(["the-idea", "the-idea-2"]);
  });

  it("slugs the reader-visible text, not the markdown source", () => {
    const [code] = headingsOf("## The `softmax` step");
    const [bold] = headingsOf("## The **softmax** step");
    expect(headingIds([code]).get(code)).toBe(headingIds([bold]).get(bold));
  });

  it("never produces an empty id for a punctuation-only heading", () => {
    const [heading] = headingsOf("## ???");
    expect(headingIds([heading]).get(heading)).toBe("section");
  });

  it("defaults to no namespace, so the one note on a page gets a plain id", () => {
    const [heading] = headingsOf("## The idea");
    expect(headingIds([heading]).get(heading)).toBe("the-idea");
  });

  it("namespaces ids under a prefix, so two notes' matching headings do not collide", () => {
    const [a] = headingsOf("## The idea");
    const [b] = headingsOf("## The idea");
    const idA = headingIds([a], "concept:softmax").get(a);
    const idB = headingIds([b], "concept:dot-product").get(b);
    expect(idA).not.toBe(idB);
    expect(idA).toBe("concept:softmax-the-idea");
    expect(idB).toBe("concept:dot-product-the-idea");
  });

  it("keeps two prefixes that would collapse to the same slug apart", () => {
    // "a/b" and "a-b" both slug to "a-b"; the namespace has exactly one job,
    // telling these two notes apart, so it must not use `slugify` for this.
    const [a] = headingsOf("## The idea");
    const [b] = headingsOf("## The idea");
    const idA = headingIds([a], "a/b").get(a);
    const idB = headingIds([b], "a-b").get(b);
    expect(idA).not.toBe(idB);
  });

  it("refuses a prefix with whitespace in it outside production, since an id cannot hold one", () => {
    const [heading] = headingsOf("## The idea");
    expect(() => headingIds([heading], "session 2026-08-20")).toThrow(/whitespace/);
  });

  it("refuses a prefix that does not start with a letter outside production", () => {
    const [heading] = headingsOf("## The idea");
    expect(() => headingIds([heading], "2026-08-20")).toThrow(/letter/);
    expect(() => headingIds([heading], "-session")).toThrow(/letter/);
  });

  it("accepts a prefix that is id-safe: no whitespace, starting with a letter", () => {
    const [heading] = headingsOf("## The idea");
    expect(() => headingIds([heading], "session:2026-08-20")).not.toThrow();
  });

  it("keeps a literal heading and a counted one from colliding", () => {
    // The second "Probe" would naively count to `probe-2`, which is also
    // exactly what "Probe-2" slugs to on its own; `claim` has to notice the
    // clash and move the counted one to `probe-3` rather than handing out an
    // id the literal heading already holds.
    const doc = parseNote("## Probe\n\n## Probe-2\n\n## Probe\n").blocks;
    const ids = [...headingIds(doc).values()];
    expect(ids).toEqual(["probe", "probe-2", "probe-3"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps them apart whichever order the literal and the counted one appear in", () => {
    // Same clash, but the literal `Probe-2` now comes after both repeats of
    // `Probe` instead of between them, so the id it collides with was itself
    // assigned by the counter rather than typed in the note.
    const source = "## Probe\n\n## Probe\n\n## Probe-2\n";
    const ids = [...headingIds(parseNote(source).blocks).values()];
    expect(new Set(ids).size).toBe(ids.length);
    // And still stable: parsing the same note twice gives the same answer.
    expect([...headingIds(parseNote(source).blocks).values()]).toEqual(ids);
  });

  it("finds a heading nested inside a list item", () => {
    const doc = parseNote("- Notes\n  ## Nested heading\n  more text").blocks;
    const list = doc[0];
    if (list.kind !== "list") throw new Error("expected a list");
    const nested = list.items[0].find((b) => b.kind === "heading");
    if (nested === undefined) throw new Error("expected a nested heading");
    expect(headingIds(doc).get(nested)).toBe("nested-heading");
  });

  it("finds a heading nested inside a quote", () => {
    const doc = parseNote("> ## Boxed\n> text").blocks;
    const quote = doc[0];
    if (quote.kind !== "quote") throw new Error("expected a quote");
    const nested = quote.blocks.find((b) => b.kind === "heading");
    if (nested === undefined) throw new Error("expected a nested heading");
    expect(headingIds(doc).get(nested)).toBe("boxed");
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
