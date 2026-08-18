import { describe, expect, it } from "vitest";
import {
  appendCheck,
  extractWikilinks,
  parseChecks,
  parseFrontmatter,
  slugify,
  stringifyCheck,
  stringifyFrontmatter,
} from "./markdown.mjs";

describe("parseFrontmatter", () => {
  it("returns an empty object when there is no frontmatter", () => {
    const { data, body } = parseFrontmatter("# Title\n\ntext");
    expect(data).toEqual({});
    expect(body).toBe("# Title\n\ntext");
  });

  it("parses scalars with their types", () => {
    const { data } = parseFrontmatter(
      "---\ntitle: Softmax\ncount: 3\nratio: 0.5\ndone: true\nempty: null\n---\n\nbody",
    );
    expect(data.title).toBe("Softmax");
    expect(data.count).toBe(3);
    expect(data.ratio).toBe(0.5);
    expect(data.done).toBe(true);
    expect(data.empty).toBeNull();
  });

  it("parses inline and block arrays", () => {
    const { data } = parseFrontmatter(
      "---\ntags: [a, b]\nrequires:\n  - x\n  - y\n---\n\nbody",
    );
    expect(data.tags).toEqual(["a", "b"]);
    expect(data.requires).toEqual(["x", "y"]);
  });

  it("treats an empty inline array as empty", () => {
    expect(parseFrontmatter("---\ntags: []\n---\n").data.tags).toEqual([]);
  });

  it("strips quotes and keeps colons inside quoted values", () => {
    const { data } = parseFrontmatter('---\ntitle: "A: B"\n---\n');
    expect(data.title).toBe("A: B");
  });

  it("separates the body cleanly", () => {
    expect(parseFrontmatter("---\nid: x\n---\n\n# Heading\n").body).toBe("# Heading\n");
  });
});

describe("stringifyFrontmatter", () => {
  it("round-trips through the parser", () => {
    const data = { id: "softmax", title: "Softmax", tags: ["a", "b"], count: 2 };
    const parsed = parseFrontmatter(stringifyFrontmatter(data, "# Body\n")).data;
    expect(parsed).toEqual(data);
  });

  it("quotes values that would otherwise read as structure", () => {
    const text = stringifyFrontmatter({ title: "A: B" }, "");
    expect(text).toContain('"A: B"');
    expect(parseFrontmatter(text).data.title).toBe("A: B");
  });

  it("omits undefined values", () => {
    expect(stringifyFrontmatter({ a: 1, b: undefined }, "")).not.toContain("b:");
  });
});

describe("extractWikilinks", () => {
  it("finds plain links", () => {
    expect(extractWikilinks("see [[softmax]] and [[attention]]")).toEqual([
      "softmax",
      "attention",
    ]);
  });

  it("resolves aliased and heading links to the target note", () => {
    expect(extractWikilinks("[[softmax|the softmax]]")).toEqual(["softmax"]);
    expect(extractWikilinks("[[softmax#Temperature]]")).toEqual(["softmax"]);
  });

  it("returns an empty list when there are none", () => {
    expect(extractWikilinks("no links here")).toEqual([]);
  });
});

describe("checks", () => {
  const body = [
    "## Checks",
    "",
    "```check",
    "q: Why exponentiate?",
    "a: To keep every term positive.",
    "why: Common misconception.",
    "```",
    "",
    "```check",
    "q: What is the limit at zero temperature?",
    "a: A one-hot argmax.",
    "```",
  ].join("\n");

  it("parses every check block in order", () => {
    const checks = parseChecks(body);
    expect(checks).toHaveLength(2);
    expect(checks[0]).toMatchObject({
      id: "c1",
      question: "Why exponentiate?",
      answer: "To keep every term positive.",
      why: "Common misconception.",
    });
    expect(checks[1].id).toBe("c2");
  });

  it("joins wrapped continuation lines", () => {
    const wrapped = "```check\nq: A long question\nthat wrapped\na: Yes.\n```";
    expect(parseChecks(wrapped)[0].question).toBe("A long question that wrapped");
  });

  it("ignores a block with no question", () => {
    expect(parseChecks("```check\na: orphaned answer\n```")).toEqual([]);
  });

  it("returns nothing for a note with no checks", () => {
    expect(parseChecks("# Just prose\n")).toEqual([]);
  });

  it("round-trips through stringifyCheck", () => {
    const check = { question: "Q?", answer: "A.", why: "", source: "" };
    const parsed = parseChecks(stringifyCheck(check))[0];
    expect(parsed.question).toBe("Q?");
    expect(parsed.answer).toBe("A.");
  });

  it("appends into an existing Checks section without duplicating it", () => {
    const next = appendCheck(body, { question: "Third?", answer: "Yes." });
    expect(parseChecks(next)).toHaveLength(3);
    expect(next.match(/## Checks/g)).toHaveLength(1);
  });

  it("creates the Checks section when the note has none", () => {
    const next = appendCheck("# Softmax\n\nProse.", { question: "Q?", answer: "A." });
    expect(next).toContain("## Checks");
    expect(parseChecks(next)).toHaveLength(1);
  });
});

describe("slugify", () => {
  it("produces filesystem-safe ids", () => {
    expect(slugify("Multi-Head Attention!")).toBe("multi-head-attention");
    expect(slugify("  spaced  out  ")).toBe("spaced-out");
  });

  it("strips diacritics", () => {
    expect(slugify("Schrödinger")).toBe("schrodinger");
  });

  it("caps the length", () => {
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});
