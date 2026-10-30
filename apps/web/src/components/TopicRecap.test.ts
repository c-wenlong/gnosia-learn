// @vitest-environment jsdom
import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Course, Module, Topic, TopicKnowledge } from "@/lib/types";
import { RecapCard, RecapEditor } from "./TopicRecap";

vi.mock("@/lib/learner-context", () => ({ useLearner: () => ({ forgetKnowledge: () => {} }) }));

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

describe("RecapCard", () => {
  it("draws two identical lines as two items, each with a key of its own", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const knowledge = {
      topicId: "t1",
      summary: "Softmax.",
      keyPoints: ["Weights are positive", "Weights are positive"],
      misconceptions: [],
      openQuestions: [],
      source: "agent",
      updatedAt: "2026-10-30T00:00:00.000Z",
      sessions: 1,
    } as TopicKnowledge;
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    const root = createRoot(host);
    // A client render: React names a repeated key there, where a server render says nothing.
    act(() =>
      root.render(
        createElement(RecapCard, {
          knowledge,
          course: { code: "CP4284", slug: "cp4284", title: "Transformers" } as Course,
          module: { slug: "m1", title: "Module", order: 1 } as Module,
          topic: { id: "t1", title: "Attention" } as Topic,
        }),
      ),
    );
    expect([...host.querySelectorAll("li")].filter((li) => li.textContent === "Weights are positive")).toHaveLength(2);
    expect(errors.mock.calls.some((call) => String(call[0]).includes("same key"))).toBe(false);
    act(() => root.unmount());
    errors.mockRestore();
  });
});
