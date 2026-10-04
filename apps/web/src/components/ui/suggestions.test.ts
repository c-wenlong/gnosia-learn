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

  it("matches each of several words, in the label or the detail, in any order", () => {
    const options = [
      { value: "a", label: "deepseek/deepseek-chat:free" },
      { value: "b", label: "deepseek/deepseek-r1" },
      { value: "c", label: "deepseek/deepseek-v3", detail: "free" },
      { value: "d", label: "meta/llama-free" },
    ];
    expect(suggestionsFor(options, "deepseek free").map((o) => o.value)).toEqual(["a", "c"]);
    expect(suggestionsFor(options, "free  deepseek").map((o) => o.value)).toEqual(["a", "c"]);
    // One word reads the label only, as it always has.
    expect(suggestionsFor(options, "free").map((o) => o.value)).toEqual(["a", "d"]);
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
