// @vitest-environment jsdom
import { act, createElement, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/Math", async () => {
  const { createElement: h } = await import("react");
  return { MathText: ({ text }: { text: string }) => h("span", null, text) };
});

import { newVerdict, type Verdict } from "@gnosia/tutor/tutor-check";

import { CheckCard, CheckRow, slotPlan, useCheckThread, type CheckItem, type SlotOptions } from "./use-check-thread";

const verdict = (requestId: string) => ({ requestId, question: "Why?" }) as unknown as Verdict;

describe("slotPlan", () => {
  it("places each typed answer's row under the tutor's reply, or under the answer until it comes, in one pass", () => {
    const items: (CheckItem & { concept?: string })[] = [
      { role: "assistant", content: "Q1", check: { question: "Q1", concept: "a" } },
      { role: "user", content: "A1", verdict: verdict("r1") },
      { role: "assistant", content: "Right. Q2", check: { question: "Q2", concept: "b" } },
      { role: "user", content: "A2", verdict: verdict("r2") },
    ];
    const plan = slotPlan(items, (asked) => asked.check?.concept ?? null);
    expect([...plan.rowsAfter]).toEqual([
      [2, { at: 1, verdict: verdict("r1"), concept: "a" }],
      [3, { at: 3, verdict: verdict("r2"), concept: "b" }],
    ]);
    expect(plan.lastVerdict).toBe(3);
  });

  it("leaves a recall card's answer to its card, though it is still the newest verdict", () => {
    const items: CheckItem[] = [
      { role: "assistant", content: "Q", check: { question: "Q" } },
      { role: "user", content: "words", verdict: verdict("r1"), recall: { answer: "words", confidence: 50, thinking: null } },
    ];
    const plan = slotPlan(items, () => "a");
    expect(plan.rowsAfter.size).toBe(0);
    expect(plan.lastVerdict).toBe(1);
  });
});

/**
 * The hook's own write rules, on a thread in a plain store: what a reload cut
 * off is settled on mount, a doubled tap writes once, a retry resends the
 * same request id, and the thread's session closes when the page goes away.
 */
describe("useCheckThread", () => {
  beforeAll(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  const prose = { role: "assistant" as const, content: "Why does a SYN carry a sequence number?", check: { question: "Why a sequence number?" } };
  const choice = {
    role: "assistant" as const,
    content: "Pick one.",
    check: { kind: "choice", question: "What opens a TCP connection?", options: ["SYN", "FIN", "RST"], why: "A SYN asks to open.", answer: "SYN" },
  };
  const savingChoice = (requestId: string): CheckItem => ({
    role: "user",
    content: "<check_answer>SYN</check_answer>",
    choice: { picked: 0, confidence: 70, thinking: null, requestId, correct: true, source: "teach", state: "saving", error: null, recorded: null },
  });

  /** Each observe call's body, and what the next ones answer: a status per call, 200 once they run out. */
  let observed: Array<Record<string, unknown>> = [];
  let closed: Array<Record<string, unknown>> = [];
  let statuses: number[] = [];
  let scopes = 0;
  const mounted: Array<() => void> = [];

  beforeEach(() => {
    observed = [];
    closed = [];
    statuses = [];
    sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        if (url === "/api/learner/session/close") {
          closed.push(body);
          return new Response("{}", { status: 200 });
        }
        if (url === "/api/learner/observe") {
          observed.push(body);
          const status = statuses.shift() ?? 200;
          return status === 200
            ? new Response(JSON.stringify({ ok: true, result: { correct: body.correct, pLBefore: 0.2, pLAfter: 0.4, card: { intervalDays: 1 } } }), { status })
            : new Response(JSON.stringify({ error: "The catalog is busy" }), { status });
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });
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

  /** A thread drawn with its cards and rows, over a store seeded with `seed`. */
  async function mount(seed: CheckItem[]) {
    let items = seed;
    const listeners = new Set<() => void>();
    const store = {
      read: () => items,
      write: (next: CheckItem[]) => {
        items = next;
        listeners.forEach((listener) => listener());
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    };
    const scope = `hook-${(scopes += 1)}`;
    const conceptOf = () => "tcp";
    function Thread() {
      const turns = useSyncExternalStore(store.subscribe, store.read, store.read);
      const thread = useCheckThread<CheckItem>({ store, scope, sessionLabel: scope, conceptOf, newTurn: (fields) => fields });
      const slot: SlotOptions<CheckItem> = {
        disabled: false,
        orderSeed: () => "seed",
        concept: () => ({ title: "TCP", noteHref: "#note" }),
        send: (turn, at) => store.write([...at, turn]),
      };
      const props = { items: turns, thread, conceptOf, slot, plan: slotPlan(turns, conceptOf) };
      return createElement(
        "div",
        null,
        turns.flatMap((_, at) => [createElement(CheckCard<CheckItem>, { key: `c${at}`, at, ...props }), createElement(CheckRow<CheckItem>, { key: `v${at}`, at, ...props })]),
      );
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(Thread)));
    await settle();
    let gone = false;
    const unmount = () => {
      if (gone) return;
      gone = true;
      act(() => root.unmount());
      host.remove();
    };
    mounted.push(unmount);
    return { host, store, unmount };
  }

  const button = (host: HTMLElement, text: string) =>
    [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

  it("settles a write a reload cut off, so its row offers Try again rather than waiting forever", async () => {
    const cut = { ...newVerdict(prose.check.question, "req-cut", "teach"), judged: "ready" as const, state: "saving" as const, tapped: true };
    const { host, store } = await mount([prose, { role: "user", content: "To order the bytes.", verdict: cut }]);
    expect(button(host, "Try again: record as correct")).toBeDefined();
    expect(host.textContent).toContain("The page closed before the answer was confirmed.");
    expect(store.read()[1].verdict?.state).toBe("failed");
    expect(observed).toHaveLength(0);
  });

  it("settles a choice answer a reload cut off the same way", async () => {
    const { host } = await mount([choice, savingChoice("req-choice")]);
    expect(button(host, "Try again")).toBeDefined();
  });

  it("writes once for two taps in one go, whatever the store says in between", async () => {
    const { host } = await mount([choice, savingChoice("req-twice")]);
    const retry = button(host, "Try again")!;
    await act(async () => {
      retry.click();
      retry.click();
    });
    await settle();
    expect(observed).toHaveLength(1);
    expect(observed[0].requestId).toBe("req-twice");
  });

  it("resends a failed write under the same request id", async () => {
    statuses = [503];
    const open = { ...newVerdict(prose.check.question, "req-retry", "teach"), judged: "ready" as const, suggested: true };
    const { host } = await mount([prose, { role: "user", content: "To order the bytes.", verdict: open }]);
    await act(async () => button(host, "Record as correct")!.click());
    await settle();
    expect(observed).toHaveLength(1);
    await act(async () => button(host, "Try again: record as correct")!.click());
    await settle();
    expect(observed).toHaveLength(2);
    expect(observed[1].requestId).toBe(observed[0].requestId);
    expect(observed[1].requestId).toBe("req-retry");
    expect(host.querySelector("[data-recorded]")).not.toBeNull();
  });

  it("closes the session an answer opened when the thread goes away", async () => {
    const open = { ...newVerdict(prose.check.question, "req-close", "teach"), judged: "ready" as const, suggested: true };
    const { host, unmount } = await mount([prose, { role: "user", content: "To order the bytes.", verdict: open }]);
    await act(async () => button(host, "Record as correct")!.click());
    await settle();
    const session = observed[0].sessionId;
    expect(typeof session).toBe("string");
    expect(closed).toHaveLength(0);
    unmount();
    expect(closed).toEqual([{ sessionId: session }]);
  });
});
