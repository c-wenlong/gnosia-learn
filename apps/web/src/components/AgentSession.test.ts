// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Course, Module, Topic } from "@/lib/types";

/**
 * The course topic tutor's check cards (docs/proposals/structured-checks.md,
 * phase 3): a choice block or a recall block naming one of the topic's
 * concepts draws the same card the concept tutor does, and its answer is
 * recorded against that concept under the topic's session.
 */

const learner = { state: { notes: {}, knowledge: {} }, ready: true, saveKnowledge: vi.fn(), saveError: null };
vi.mock("@/lib/learner-context", () => ({ useLearner: () => learner }));
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/TopicRecap", () => ({ RecapCard: () => null, RecapEditor: () => null }));
vi.mock("@/components/Math", async () => {
  const { createElement: h } = await import("react");
  return { MathText: ({ text }: { text: string }) => h("span", null, text) };
});

const { AgentSession } = await import("./AgentSession");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value() {} });
});

const topic = { id: "t1", title: "Attention", concepts: ["dot-product", "softmax"], subtopics: ["Scores"] } as unknown as Topic;
const mod = { id: "m1", slug: "m1", title: "Module", order: 1, topic: "attn", topics: [topic], resources: [] } as unknown as Module;
const course = {
  id: "cp4284",
  slug: "cp4284",
  code: "CP4284",
  title: "Transformers",
  credits: 4,
  order: 0,
  inferred: false,
  tags: [],
  modules: [mod],
  capstone: "",
} as unknown as Course;

const choice = {
  kind: "choice",
  concept: "softmax",
  question: "Why does softmax exponentiate the scores?",
  options: ["To make every weight positive", "To sort the scores", "To round the scores"],
  why: "exp is positive everywhere and keeps the order, so the weights can be normalised.",
  answer: "To make every weight positive",
};
const recall = {
  kind: "recall",
  concept: "dot-product",
  question: "What does a zero dot product say about two vectors?",
  answer: "They are orthogonal: neither has a component along the other.",
};

let replies: Array<{ content: string; check?: unknown }> = [];
const fetched: Array<{ url: string; body: Record<string, unknown> }> = [];

beforeEach(() => {
  fetched.length = 0;
  router.refresh.mockClear();
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body === undefined ? {} : (JSON.parse(String(init.body)) as Record<string, unknown>);
      fetched.push({ url, body });
      if (url === "/api/learner/observe") {
        return new Response(
          JSON.stringify({ ok: true, result: { correct: body.correct, pLBefore: 0.25, pLAfter: 0.41, card: { intervalDays: 1 } } }),
          { status: 200 },
        );
      }
      if (url === "/api/agent/judge") {
        return new Response(JSON.stringify({ verdict: { correct: true, feedback: "Names orthogonality." } }), { status: 200 });
      }
      const next = replies.shift() ?? { content: "Carry on." };
      return new Response(JSON.stringify({ message: { content: next.content }, check: next.check ?? null }), { status: 200 });
    }),
  );
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.unstubAllGlobals();
});

async function settle() {
  for (let at = 0; at < 6; at += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(AgentSession, { course, module: mod, topic, conceptTitles: { softmax: "Softmax", "dot-product": "Dot product" } }),
    );
  });
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
async function click(el: HTMLElement | undefined) {
  expect(el).toBeDefined();
  await act(async () => el!.click());
  await settle();
}
async function type(box: HTMLTextAreaElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const card = (host: HTMLElement) => host.querySelector<HTMLElement>("section[aria-labelledby]");
const chats = () => fetched.filter((c) => c.url === "/api/agent/chat");

describe("the topic tutor's choice card", () => {
  it("records the pick against the concept the block names, under the topic's session, and tells the tutor", async () => {
    replies = [{ content: "One check on the scores.", check: choice }, { content: "Right." }];
    const host = await mount();
    await click(button(host, "Start Socratic dialogue"));

    const box = card(host)!;
    expect(box.textContent).toContain(choice.question);
    await click(button(box, "To make every weight positive"));
    await click(button(box, "30%"));
    await click(button(box, "Submit"));

    const observed = fetched.filter((c) => c.url === "/api/learner/observe");
    expect(observed).toHaveLength(1);
    expect(observed[0].body).toMatchObject({
      conceptSlug: "softmax",
      correct: true,
      answer: choice.answer,
      chosen: choice.answer,
      confidence: 30,
      sessionTitle: "CP4284 · Attention",
      sessionGoal: "t1",
    });
    const sent = chats().at(-1)!.body.messages as Array<{ role: string; content: string }>;
    // The asking turn goes back with its block; the answer is the data block.
    expect(sent.at(-2)?.content).toContain("```check");
    expect(sent.at(-1)?.content).toContain('Picked: "To make every weight positive" (correct)');

    const recorded = card(host)!.querySelector<HTMLElement>("[data-recorded]");
    expect(recorded?.textContent).toContain("Softmax");
    expect(recorded?.querySelector("a")?.getAttribute("href")).toBe("/learn/softmax");
    // No bubble draws the data block (the system prompt, folded in a <pre>, names it).
    const bubbles = [...host.querySelectorAll("p, span, div")].filter((el) => !el.closest("pre") && el.children.length === 0);
    expect(bubbles.some((el) => el.textContent?.includes("<check_answer>"))).toBe(false);
  });

  it("folds to Not answered when the learner types instead, and records nothing", async () => {
    replies = [{ content: "One check.", check: choice }, { content: "Sure." }];
    const host = await mount();
    await click(button(host, "Start Socratic dialogue"));
    const composer = [...host.querySelectorAll("textarea")].at(-1)!;
    await type(composer, "Can you explain the scores first?");
    await act(async () => {
      composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();
    expect(host.textContent).toContain("Not answered");
    expect(fetched.filter((c) => c.url === "/api/learner/observe")).toHaveLength(0);
    expect(host.querySelector('[aria-label="Record this answer"]')).toBeNull();
  });
});

describe("the topic tutor's recall card", () => {
  it("judges the words against the commitment and records them on the learner's tap", async () => {
    replies = [{ content: "In your own words, please.", check: recall }, { content: "Good." }];
    const host = await mount();
    await click(button(host, "Start Socratic dialogue"));

    const box = card(host)!;
    await type(box.querySelector<HTMLTextAreaElement>("textarea")!, "They are at right angles.");
    await click(button(box, "70%"));
    await click(button(box, "Submit"));

    const judged = fetched.find((c) => c.url === "/api/agent/judge");
    expect(judged?.body).toMatchObject({ conceptSlug: "dot-product", answer: "They are at right angles.", commitment: recall.answer });
    expect(card(host)!.textContent).toContain(recall.answer);

    await click(button(card(host)!, "Record as correct"));
    const observed = fetched.filter((c) => c.url === "/api/learner/observe");
    expect(observed).toHaveLength(1);
    expect(observed[0].body).toMatchObject({
      conceptSlug: "dot-product",
      correct: true,
      answer: recall.answer,
      chosen: "They are at right angles.",
      confidence: 70,
    });
    expect(card(host)!.querySelector("[data-recorded]")?.textContent).toContain("Dot product");
  });
});
