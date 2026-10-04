import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Checkbox } from "./Checkbox";
import { FormRow } from "./FormRow";
import { Input } from "./Input";
import { SearchField } from "./SearchField";
import { Textarea } from "./Textarea";

/**
 * The kit's fill-in fields as the server renders them: what each is wired to
 * and which face it takes. The Combobox's keyboard is `Combobox.test.ts`.
 */

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

type RowProps = Parameters<typeof FormRow>[0];
/** A `FormRow` with its control, which is a render prop rather than an element. */
const row = (props: Omit<RowProps, "children">, control: RowProps["children"]) =>
  // eslint-disable-next-line react/no-children-prop -- the child is a function of the row, not an element
  html(createElement(FormRow, { ...props, children: control }));

describe("Input", () => {
  it("takes every size inputClasses has, and the size attribute as htmlSize", () => {
    const inline = html(createElement(Input, { size: "inline", htmlSize: 8, "aria-label": "Label" }));
    expect(inline).toContain('size="8"');
    expect(inline).toContain("h-7");
    expect(inline).toContain("[field-sizing:content]");
    expect(/class="([^"]*)"/.exec(inline)![1].split(" ")).not.toContain("w-full");
    expect(html(createElement(Input, { size: "compact", "aria-label": "Why" }))).toContain("h-8");
    expect(html(createElement(Input, { size: "lg", "aria-label": "Ask" }))).toContain("h-12");
  });
});

describe("Textarea", () => {
  it("is the field's face at three lines or more, resizable in height only", () => {
    const out = html(createElement(Textarea, { "aria-label": "Note", rows: 3 }));
    expect(out).toContain("<textarea");
    expect(out).toContain("border-2");
    expect(out).toContain("min-h-20");
    expect(out).toContain("resize-y");
    expect(out).toContain("focus:border-accent");
    expect(out).not.toContain("h-11");
  });
});

describe("Checkbox", () => {
  it("is a real checkbox inside a 44px label, drawn by the kit rather than the platform", () => {
    const props = { checked: true, onChange: () => undefined } as unknown as Parameters<typeof Checkbox>[0];
    const out = html(createElement(Checkbox, props, "Mark done"));
    expect(out).toMatch(/^<label[^>]*min-h-11/);
    expect(out).toContain('type="checkbox"');
    expect(out).toContain("appearance-none");
    expect(out).toContain("checked:bg-accent");
    expect(out).toContain("focus-visible:outline-accent");
    expect(out).toContain("Mark done");
  });
});

describe("SearchField", () => {
  it("hides the browser's own clear button", () => {
    expect(html(createElement(SearchField, { label: "Search" }))).toContain("[&amp;::-webkit-search-cancel-button]:hidden");
  });

  it("draws the kit's clear button only once the field holds words", () => {
    const empty = html(createElement(SearchField, { label: "Search", value: "", onChange: () => undefined, onClear: () => undefined }));
    expect(empty).not.toContain("Clear the search");
    const full = html(createElement(SearchField, { label: "Search", value: "tcp", onChange: () => undefined, onClear: () => undefined }));
    expect(full).toContain('aria-label="Clear the search"');
    // The words leave it room whether or not it shows, so they never move.
    expect(empty).toContain("pr-10");
  });

  it("is 48px at the 16px-on-touch size when large, with no size of its own on top", () => {
    const out = html(createElement(SearchField, { label: "Ask", size: "lg" }));
    expect(out).toContain("h-12");
    expect(out).toContain("text-base md:pointer-fine:text-[15px]");
    expect(out).not.toContain(" text-[15px]");
  });

  it("has a filled face with no border, ringed as a whole on focus", () => {
    const out = html(createElement(SearchField, { label: "Search conversations", face: "filled" }));
    expect(out).toContain("bg-surface2");
    expect(out).toContain("focus-within:outline-accent");
    expect(out).toContain("text-base md:pointer-fine:text-[14px]");
    expect(out).not.toContain("border-2");
  });
});

describe("FormRow", () => {
  it("names the control with its label and describes it with its hint and error", () => {
    const out = row({ id: "name", label: "Name", hint: "Shown in the sidebar.", error: "At most 60 characters." }, (field) =>
      createElement(Input, { id: field.id, "aria-describedby": field.describedBy, "aria-invalid": field.invalid }),
    );
    expect(out).toContain('<label id="name-label" for="name"');
    expect(out).toContain('aria-describedby="name-hint name-error"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('<p id="name-hint"');
    expect(out).toMatch(/<p id="name-error" role="alert"[^>]*>At most 60 characters\.<\/p>/);
  });

  it("describes nothing when there is neither hint nor error", () => {
    const out = row({ id: "model", label: "Model" }, (field) =>
      createElement(Input, { id: field.id, "aria-describedby": field.describedBy }),
    );
    expect(out).not.toContain("aria-describedby");
  });

  it("lays a settings row out in columns from 768px, with a status line", () => {
    const out = row({ layout: "inline", label: "Motion", status: { text: "Saved", tone: "ok" } }, (field) =>
      createElement(Input, { id: field.id }),
    );
    expect(out).toContain("md:flex-row");
    expect(out).toContain("md:w-[320px]");
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain("Saved");
  });
});
