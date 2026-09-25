import { describe, expect, it } from "vitest";

import { embedTargets } from "./note-embeds";

describe("embedTargets", () => {
  it("lists every embed that renders as a figure, once each, in order", () => {
    const note = [
      "# Title",
      "",
      "![[first.svg]]",
      "",
      "- a list item",
      "",
      "  ![[in-a-list.svg|with a caption]]",
      "",
      "> [!note] A callout",
      "> ![[in-a-callout.svg]]",
      "",
      "![[first.svg]]",
    ].join("\n");
    expect(embedTargets(note)).toEqual(["first.svg", "in-a-list.svg", "in-a-callout.svg"]);
  });

  it("leaves out an embed mid-sentence, which is named rather than loaded", () => {
    expect(embedTargets("as in ![[a.svg]] above")).toEqual([]);
  });

  it("leaves out a markdown image, which does not come from the asset route", () => {
    expect(embedTargets("![a picture](https://example.com/a.png)")).toEqual([]);
  });

  it("finds nothing in a note without pictures", () => {
    expect(embedTargets("# Just words\n\nAnd [[a-link]].")).toEqual([]);
  });
});
