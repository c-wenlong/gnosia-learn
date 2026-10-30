import { describe, expect, it } from "vitest";

import { capitalised, sentence } from "./sentence";

describe("sentence", () => {
  it("makes a sentence of the runner's words", () => {
    expect(sentence("held")).toBe("Held.");
    expect(sentence("Done!")).toBe("Done!");
    expect(sentence("  ")).toBe("");
  });
});

describe("capitalised", () => {
  it("trims and capitalises the first letter, and leaves the end alone", () => {
    expect(capitalised("  the runner  ")).toBe("The runner");
    expect(capitalised("")).toBe("");
  });
});
