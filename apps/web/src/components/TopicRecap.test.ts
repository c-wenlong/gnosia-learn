import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RecapEditor } from "./TopicRecap";

/**
 * The recap form on the kit (#359): each field a `FormRow` over a `Textarea`,
 * the label tied to its field and its hint read with it, and ids of the
 * row's own, so two topics' editors open on one module page never share one.
 */
describe("RecapEditor", () => {
  const editor = () => createElement(RecapEditor, { onSave: () => {}, onCancel: () => {} });

  it("ties every label and hint to its field", () => {
    const html = renderToStaticMarkup(editor());
    const fields = [...html.matchAll(/<textarea[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    expect(fields).toHaveLength(4);
    for (const id of fields) expect(html).toContain(`for="${id}"`);
    expect(html.match(/aria-describedby="[^"]+-hint"/g)).toHaveLength(3);
    expect(html).not.toContain("<textarea class=\"mt-1");
  });

  it("gives two editors on one page different ids", () => {
    const html = renderToStaticMarkup(createElement(Fragment, null, editor(), editor()));
    const ids = [...html.matchAll(/<textarea[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(8);
  });

  it("keeps Save off until something is written", () => {
    expect(renderToStaticMarkup(editor())).toMatch(/<button[^>]*disabled=""[^>]*>Save recap<\/button>/);
    const filled = createElement(RecapEditor, { initial: { summary: "Big-O bounds above" }, onSave: () => {}, onCancel: () => {} });
    expect(renderToStaticMarkup(filled)).not.toMatch(/<button[^>]*disabled=""[^>]*>Save recap<\/button>/);
  });
});
