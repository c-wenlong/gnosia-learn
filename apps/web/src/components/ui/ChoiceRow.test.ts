import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChoiceRow, type ChoiceState } from "./ChoiceRow";

type Props = Omit<ComponentProps<typeof ChoiceRow>, "children">;
const row = (props: Props) => renderToStaticMarkup(createElement(ChoiceRow, props as ComponentProps<typeof ChoiceRow>, "TCP"));
const pressed = (html: string) => /aria-pressed="(true|false)"/.exec(html)?.[1];

describe("ChoiceRow", () => {
  it("says on every ungraded row whether it is the pick", () => {
    expect(pressed(row({ state: "selected" }))).toBe("true");
    expect(pressed(row({ state: "idle" }))).toBe("false");
    expect(pressed(row({}))).toBe("false");
  });

  it("says a graded row's part in words, not as a pressed state", () => {
    const tags: Array<[ChoiceState, string]> = [
      ["correct", "correct answer"],
      ["wrong", "your answer"],
    ];
    for (const [state, tag] of tags) {
      const html = row({ state, disabled: true });
      expect(html).not.toContain("aria-pressed");
      expect(html).toContain(tag);
    }
  });

  it("names its number key, kept out of the row's name", () => {
    const html = row({ shortcut: "2" });
    expect(html).toContain('aria-keyshortcuts="2"');
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>2<\/span>/);
  });
});
