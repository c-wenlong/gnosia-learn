import { describe, expect, it } from "vitest";

import { nextSuggestion, suggestionsFor } from "./suggestions";

const MODELS = ["openai/gpt-5", "anthropic/claude-sonnet-4", "sonnet-mini", "google/gemini-2.5"].map((id) => ({ value: id, label: id }));

describe("suggestionsFor", () => {
  it("suggests every option for an empty field", () => {
    expect(suggestionsFor(MODELS, "  ").map((o) => o.value)).toEqual(MODELS.map((o) => o.value));
  });

  it("matches anywhere in the label, ignoring case, the ones that start with it first", () => {
    expect(suggestionsFor(MODELS, "SONNET").map((o) => o.value)).toEqual(["sonnet-mini", "anthropic/claude-sonnet-4"]);
  });

  it("suggests nothing for words no option holds", () => {
    expect(suggestionsFor(MODELS, "llama")).toEqual([]);
  });
});

describe("nextSuggestion", () => {
  it("goes from the field to the first row down and the last row up", () => {
    expect(nextSuggestion("ArrowDown", -1, 3)).toBe(0);
    expect(nextSuggestion("ArrowUp", -1, 3)).toBe(2);
  });

  it("goes back to the field past either end", () => {
    expect(nextSuggestion("ArrowDown", 2, 3)).toBe(-1);
    expect(nextSuggestion("ArrowUp", 0, 3)).toBe(-1);
  });

  it("leaves other keys, and an empty list, alone", () => {
    expect(nextSuggestion("Home", 1, 3)).toBeNull();
    expect(nextSuggestion("ArrowDown", -1, 0)).toBeNull();
  });
});
