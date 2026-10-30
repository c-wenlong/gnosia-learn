// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ASK_START_KEY } from "@/lib/ask-core";

import { OpenTutorChat } from "./OpenTutorChat";

/**
 * The open tutor's request: every turn is paid for with the owner's keys, so
 * the turn in flight is aborted when the chat goes away (a new subject
 * remounts it), and a question typed after a failed one takes its place
 * rather than going out as a second learner turn in a row.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function settle() {
  for (let at = 0; at < 4; at += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount({ strict = false }: { strict?: boolean } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const chat = createElement(OpenTutorChat, { subject: "Bloom filters" });
  await act(async () => root?.render(strict ? createElement(StrictMode, null, chat) : chat));
  await settle();
  return host;
}

const button = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

async function send(host: HTMLElement, text: string) {
  const box = host.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => box.form!.requestSubmit());
  await settle();
}

describe("the open tutor's request", () => {
  it("is aborted when the chat goes away", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        return new Promise<Response>(() => {});
      }),
    );
    const host = await mount();
    await act(async () => button(host, "Start")!.click());
    await settle();
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    act(() => root?.unmount());
    root = null;
    expect(signals[0].aborted).toBe(true);
  });

  it("opens on its own from the Ask box, even under React's development double effect", async () => {
    sessionStorage.setItem(ASK_START_KEY, "Bloom filters");
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        return new Response(JSON.stringify({ message: { role: "assistant", content: "Where are you with hashing?" } }), { status: 200 });
      }),
    );
    const host = await mount({ strict: true });
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);
    expect(host.textContent).toContain("Where are you with hashing?");
  });

  it("sends a question typed after a failed one in its place", async () => {
    const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    let status = 504;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return status === 200
          ? new Response(JSON.stringify({ message: { role: "assistant", content: "Good start." } }), { status })
          : new Response(JSON.stringify({ error: "The tutor took too long" }), { status });
      }),
    );
    const host = await mount();
    await act(async () => button(host, "Start")!.click());
    await settle();
    expect(button(host, "Try again")).toBeDefined();

    status = 200;
    await send(host, "I know what a hash function is.");
    expect(bodies[1].messages).toEqual([{ role: "user", content: "I know what a hash function is." }]);
    expect(host.textContent).toContain("Good start.");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
