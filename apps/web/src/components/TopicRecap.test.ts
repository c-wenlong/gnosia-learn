// @vitest-environment jsdom
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Course, Module, Topic } from "@gnosia/content";
import type { TopicKnowledge } from "@gnosia/schema/shared";
import { RecapCard, RecapEditor, TopicRecap } from "./TopicRecap";

// Saving writes the recap where the next render reads it, as the provider does.
const learner = vi.hoisted(() => {
  const state = { knowledge: {} as Record<string, unknown> };
  return {
    state,
    forgetKnowledge: vi.fn(),
    saveKnowledge: vi.fn((topicId: string, input: object) => {
      state.knowledge[topicId] = { ...input, topicId, sessions: 0, updatedAt: "2026-10-30T00:00:00.000Z" };
    }),
  };
});
vi.mock("@/lib/learner-context", () => ({ useLearner: () => learner }));

const mounted: Array<Root> = [];
afterEach(() => {
  while (mounted.length) {
    const root = mounted.pop()!;
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

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
    document.body.append(host);
    const root = createRoot(host);
    mounted.push(root);
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
  });
});

/**
 * Add recap and Edit are swapped for the editor when pressed, and Save and
 * Cancel unmount it, so each move takes focus with it rather than leaving it
 * on a control that is gone.
 */
describe("TopicRecap focus", () => {
  const props = {
    course: { code: "CP4284", slug: "cp4284", title: "Transformers" } as Course,
    module: { slug: "m1", title: "Module", order: 1 } as Module,
    topic: { id: "t1", title: "Attention" } as Topic,
  };

  function mount(knowledge: TopicKnowledge | null = null) {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    learner.state.knowledge = knowledge === null ? {} : { [knowledge.topicId]: knowledge };
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mounted.push(root);
    act(() => root.render(createElement(TopicRecap, props)));
    return { host };
  }

  const button = (host: HTMLElement, text: string) =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement;
  const field = (host: HTMLElement, name: string) => {
    const label = [...host.querySelectorAll("label")].find((l) => l.textContent === name);
    return host.querySelector(`#${CSS.escape(label?.htmlFor ?? "")}`) as HTMLTextAreaElement | null;
  };
  const summary = (host: HTMLElement) => field(host, "Summary");
  const type = (target: HTMLTextAreaElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(target, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  };

  it("moves focus to Summary on opening, and back to Add recap on Cancel", () => {
    const { host } = mount();
    act(() => button(host, "Add recap").focus());
    act(() => button(host, "Add recap").click());
    expect(document.activeElement).toBe(summary(host));
    act(() => button(host, "Cancel").click());
    expect(document.activeElement).toBe(button(host, "Add recap"));
  });

  it("hands focus to the card's Edit after Save, and back to it after editing", () => {
    const { host } = mount();
    act(() => button(host, "Add recap").click());
    act(() => type(summary(host) as HTMLTextAreaElement, "Softmax turns scores into weights."));
    act(() => button(host, "Save recap").click());
    expect(document.activeElement).toBe(button(host, "Edit"));

    act(() => button(host, "Edit").click());
    expect(document.activeElement).toBe(summary(host));
    act(() => button(host, "Save recap").click());
    expect(document.activeElement).toBe(button(host, "Edit"));
  });

  it("saves the typed fields as the topic's own recap, without a session count", () => {
    const { host } = mount();
    act(() => button(host, "Add recap").click());
    act(() => type(summary(host) as HTMLTextAreaElement, "Softmax turns scores into weights."));
    act(() => type(field(host, "Key points") as HTMLTextAreaElement, "- a\n\n* b"));
    act(() => type(field(host, "Misconceptions corrected") as HTMLTextAreaElement, "  * kept wrong  "));
    act(() => button(host, "Save recap").click());

    expect(learner.saveKnowledge).toHaveBeenCalledTimes(1);
    expect(learner.saveKnowledge).toHaveBeenCalledWith(
      "t1",
      {
        summary: "Softmax turns scores into weights.",
        keyPoints: ["a", "b"],
        misconceptions: ["kept wrong"],
        openQuestions: [],
        source: "manual",
      },
      { countSession: false },
    );
  });

  it("forgets the recap on a confirmed Forget", () => {
    const knowledge = {
      topicId: "t1",
      summary: "Softmax.",
      keyPoints: ["Weights are positive"],
      misconceptions: [],
      openQuestions: [],
      source: "manual",
      updatedAt: "2026-10-30T00:00:00.000Z",
      sessions: 1,
    } as TopicKnowledge;
    const { host } = mount(knowledge);
    act(() => button(host, "Forget").click());
    expect(host.textContent).toContain('Delete the recap for "Attention"?');
    act(() => button(host, "Forget it").click());
    expect(learner.forgetKnowledge).toHaveBeenCalledTimes(1);
    expect(learner.forgetKnowledge).toHaveBeenCalledWith("t1");
  });
});
