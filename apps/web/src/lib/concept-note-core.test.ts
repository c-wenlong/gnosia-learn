import { describe, expect, it } from "vitest";

import { parseChecks, parseConceptNote, parseFrontmatterFields } from "@/lib/concept-note-core";

const NOTE = `---
id: attention-weights
title: Attention weights
summary: "Attention weights are a softmax: over scaled scores."
requires: [dot-product, softmax]
assumes:
  - vector-as-a-list-of-numbers
tags: []
sources: [https://example.org/attention, Lecture 4 slides.pdf]
---

# Attention weights

## Checks

\`\`\`check
q: Why divide by the square root of the key dimension?
a: Without it, dot products grow with dimension and push softmax into
   saturation, where gradients vanish.
why: Catches treating the scale factor as arbitrary.
\`\`\`

\`\`\`check
a: An answer with no question is not a check.
\`\`\`

- \`\`\`check
  q: One inside a list still counts
  \`\`\`

\`\`\`js
q: not a check, wrong fence
\`\`\`
`;

describe("concept note parsing", () => {
  it("reads the frontmatter fields, inline and block lists alike", () => {
    const { frontmatter } = parseConceptNote(NOTE);
    expect(frontmatter.title).toBe("Attention weights");
    expect(frontmatter.summary).toBe("Attention weights are a softmax: over scaled scores.");
    expect(frontmatter.requires).toEqual(["dot-product", "softmax"]);
    expect(frontmatter.assumes).toEqual(["vector-as-a-list-of-numbers"]);
    expect(frontmatter.tags).toEqual([]);
    expect(frontmatter.sources).toEqual(["https://example.org/attention", "Lecture 4 slides.pdf"]);
  });

  it("reads checks as the CLI does: ids count only blocks with a question, continuation lines join", () => {
    const checks = parseChecks(NOTE);
    expect(checks).toHaveLength(2);
    expect(checks[0]).toEqual({
      id: "c1",
      question: "Why divide by the square root of the key dimension?",
      answer:
        "Without it, dot products grow with dimension and push softmax into saturation, where gradients vanish.",
      why: "Catches treating the scale factor as arbitrary.",
      source: "",
    });
    expect(checks[1]).toMatchObject({ id: "c2", question: "One inside a list still counts" });
  });

  it("treats a note with no frontmatter as all empty lists", () => {
    const fields = parseFrontmatterFields(null);
    expect(fields).toEqual({ title: null, summary: null, requires: [], assumes: [], tags: [], topics: [], sources: [] });
  });
});
