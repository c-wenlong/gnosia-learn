import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FilterMenu } from "./FilterMenu";
import { Select } from "./Select";
import type { FilterOption } from "./filter-menu";

/**
 * The closed trigger, as the server renders it. The open listbox needs a
 * browser (focus, measuring, listeners), so the keyboard model is tested
 * through the pure helpers in `filter-menu.test.ts` and the page flows in
 * `npm run e2e`.
 */
const OPTIONS: FilterOption[] = [
  { value: "", label: "All kinds", short: "All" },
  { value: "video", label: "Video", count: 30 },
];

function render(value: string): string {
  return renderToStaticMarkup(
    createElement(FilterMenu, { label: "Type", options: OPTIONS, value, defaultValue: "", onChange: () => {} }),
  );
}

describe("FilterMenu, closed", () => {
  it("renders a listbox trigger reading the default value, with no list", () => {
    const html = render("");
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Type: All");
    expect(html).not.toContain('role="listbox"');
    // Not filled: the default value is not a filter.
    expect(html).not.toContain("bg-accent");
  });

  it("fills the trigger with the accent once a value is chosen", () => {
    const html = render("video");
    expect(html).toContain("Type: Video");
    expect(html).toContain("bg-accent");
  });
});

describe("Select, closed", () => {
  const field = (value: string) =>
    renderToStaticMarkup(
      createElement(Select<string>, { id: "motion", label: "Motion", options: OPTIONS, value, placeholder: "Pick one", onChange: () => {} }),
    );

  it("is a field the label points at, printing the value alone and never filled", () => {
    const html = field("video");
    expect(html).toContain('id="motion"');
    expect(html).toContain('aria-label="Motion: Video"');
    expect(html).toContain(">Video</span>");
    expect(html).toContain("h-11");
    expect(html).not.toContain("bg-accent");
  });

  it("points a screen reader at why a refused value was refused, not only at its border", () => {
    const html = renderToStaticMarkup(
      createElement(Select<string>, { label: "Arrow 1 from", options: OPTIONS, value: "", invalid: true, describedBy: "why", onChange: () => {} }),
    );
    expect(html).toContain('aria-describedby="why"');
    expect(html).toContain("border-danger");
  });

  it("prints its placeholder, muted, while the value is none of the options", () => {
    const html = field("missing");
    expect(html).toContain(">Pick one</span>");
    expect(html).toContain("text-text3");
  });
});
