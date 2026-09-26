import { describe, expect, it } from "vitest";

import { renderMath, splitMath } from "@/lib/math";

describe("renderMath", () => {
  it("writes KaTeX HTML with a MathML copy, the visual half hidden from screen readers", () => {
    const html = renderMath("f(n) \\le c \\cdot g(n)", false);
    expect(html).toContain('class="katex"');
    expect(html).toContain("<math");
    expect(html).toContain('<annotation encoding="application/x-tex">f(n) \\le c \\cdot g(n)</annotation>');
    expect(html).toContain('class="katex-html" aria-hidden="true"');
    expect(html).not.toContain("katex-display");
    expect(html).not.toContain('role="math"');
  });

  it("wraps display maths in katex-display", () => {
    expect(renderMath("\\sum_{i=1}^{n} i", true)).toContain('class="katex-display"');
  });

  it("shows a formula it cannot parse as its escaped source, in the palette's danger colour", () => {
    const html = renderMath("\\frac{a}{<b>", false);
    expect(html).toContain('class="katex-error"');
    expect(html).toContain("\\frac{a}{&lt;b&gt;");
    expect(html).toContain("var(--danger, currentColor)");
  });

  it("escapes markup in the source rather than emitting it", () => {
    const html = renderMath("<script>alert(1)</script>", false);
    expect(html).not.toContain("<script");
  });

  it("refuses the commands that would build a link or load a resource", () => {
    const html = renderMath("\\href{javascript:alert(1)}{x} \\includegraphics{https://example.com/x.png}", false);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript');
  });

  it("gives the same string for the same source, inline and display apart", () => {
    expect(renderMath("x^2", false)).toBe(renderMath("x^2", false));
    expect(renderMath("x^2", true)).not.toBe(renderMath("x^2", false));
  });
});

describe("splitMath", () => {
  it("cuts a summary into prose and inline formulas", () => {
    expect(splitMath("when there exist $c > 0$ and $n_0$ with $f(n) \\ge c\\,g(n)$.")).toEqual([
      { kind: "text", value: "when there exist " },
      { kind: "inline", value: "c > 0" },
      { kind: "text", value: " and " },
      { kind: "inline", value: "n_0" },
      { kind: "text", value: " with " },
      { kind: "inline", value: "f(n) \\ge c\\,g(n)" },
      { kind: "text", value: "." },
    ]);
  });

  it("does not read prices as a formula", () => {
    expect(splitMath("$3 and $5")).toEqual([{ kind: "text", value: "$3 and $5" }]);
    expect(splitMath("it costs $5 and saves $3 a month")).toEqual([
      { kind: "text", value: "it costs $5 and saves $3 a month" },
    ]);
    expect(splitMath("between $5-$10")).toEqual([{ kind: "text", value: "between $5-$10" }]);
  });

  it("needs the dollars to hug the formula, and no newline inside", () => {
    expect(splitMath("$ x$ and $x $")).toEqual([{ kind: "text", value: "$ x$ and $x $" }]);
    expect(splitMath("$a\nb$")).toEqual([{ kind: "text", value: "$a\nb$" }]);
  });

  it("reads \\$ as a literal dollar", () => {
    expect(splitMath("costs \\$5 or \\$6")).toEqual([{ kind: "text", value: "costs $5 or $6" }]);
    expect(splitMath("$\\$5 = x$")).toEqual([{ kind: "inline", value: "\\$5 = x" }]);
  });

  it("finds $$...$$ as display maths, over several lines if need be", () => {
    expect(splitMath("Solve $$\n\\frac{a}{b}\n$$ now.")).toEqual([
      { kind: "text", value: "Solve " },
      { kind: "display", value: "\\frac{a}{b}" },
      { kind: "text", value: " now." },
    ]);
  });

  it("leaves an empty or unclosed $$ as text", () => {
    expect(splitMath("empty $$ $$ here")).toEqual([{ kind: "text", value: "empty $$ $$ here" }]);
    expect(splitMath("a $$x and $y$")).toEqual([
      { kind: "text", value: "a $$x and " },
      { kind: "inline", value: "y" },
    ]);
  });

  it("returns one text part for a string with no maths, and nothing for an empty one", () => {
    expect(splitMath("plain words")).toEqual([{ kind: "text", value: "plain words" }]);
    expect(splitMath("")).toEqual([]);
  });
});
