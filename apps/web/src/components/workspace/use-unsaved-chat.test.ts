// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { useUnsavedChat, type ChatRequest, type UnsavedChat } from "./use-unsaved-chat";

/**
 * The chat behind the open tutor and Ask on an asset: one POST per turn with
 * what the chat is about, Try again resending the same thread, and a turn
 * nobody will see aborted, on unmount and when a new send replaces it.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
afterEach(() => {
  vi.unstubAllGlobals();
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

interface Call {
  body: { messages: Array<{ role: string; content: string }> } & Record<string, unknown>;
  signal: AbortSignal;
  answer: (status: number, payload: unknown) => void;
}

/** A fetch whose every call waits until the test answers it. */
function pendingFetch(): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const signal = init!.signal!;
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          calls.push({
            body: JSON.parse(String(init?.body)),
            signal,
            answer: (status, payload) => resolve(new Response(JSON.stringify(payload), { status })),
          });
        }),
    ),
  );
  return calls;
}

async function settle() {
  for (let at = 0; at < 4; at += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Mounts the hook and returns a live view of it. */
function mount(request: () => ChatRequest) {
  const view: { chat: UnsavedChat } = { chat: undefined as unknown as UnsavedChat };
  function Probe() {
    view.chat = useUnsavedChat(request);
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(createElement(Probe)));
  return view;
}

const reply = (content: string) => ({ message: { role: "assistant", content } });

describe("useUnsavedChat", () => {
  it("posts the question with what the chat is about, read as it is sent, and shows the reply", async () => {
    const calls = pendingFetch();
    let at = 12;
    const view = mount(() => ({ assetId: "video:tlb", at }));
    act(() => view.chat.setDraft("What is the TLB?"));
    act(() => view.chat.ask("  What is the TLB?  "));
    expect(view.chat.busy).toBe(true);
    expect(view.chat.draft).toBe("");
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ assetId: "video:tlb", at: 12, messages: [{ role: "user", content: "What is the TLB?" }] });

    calls[0].answer(200, reply("A cache of translations."));
    await settle();
    expect(view.chat.busy).toBe(false);
    expect(view.chat.error).toBeNull();
    expect(view.chat.turns).toEqual([
      { role: "user", content: "What is the TLB?" },
      { role: "assistant", content: "A cache of translations." },
    ]);

    at = 40;
    act(() => view.chat.ask("Why is it fast?"));
    expect(calls[1].body.at).toBe(40);
    expect(calls[1].body.messages).toHaveLength(3);
  });

  it("refuses a blank question", () => {
    const calls = pendingFetch();
    const view = mount(() => ({ subject: "Bloom filters" }));
    act(() => view.chat.ask("   "));
    expect(calls).toHaveLength(0);
    expect(view.chat.turns).toEqual([]);
  });

  it("shows why a turn failed, and Try again resends the same thread", async () => {
    const calls = pendingFetch();
    const view = mount(() => ({ subject: "Bloom filters" }));
    act(() => view.chat.ask("Where do I start?"));
    calls[0].answer(504, { error: "The tutor took too long" });
    await settle();
    expect(view.chat.busy).toBe(false);
    expect(view.chat.error).not.toBeNull();
    expect(view.chat.turns).toEqual([{ role: "user", content: "Where do I start?" }]);

    act(() => view.chat.retry());
    expect(view.chat.error).toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toEqual(calls[0].body);

    calls[1].answer(200, reply("With hashing."));
    await settle();
    expect(view.chat.error).toBeNull();
    expect(view.chat.turns.map((t) => t.content)).toEqual(["Where do I start?", "With hashing."]);
  });

  it("says the server could not be reached when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const view = mount(() => ({ subject: "Bloom filters" }));
    act(() => view.chat.ask("Hello?"));
    await settle();
    expect(view.chat.error).toBe("The tutor did not answer: the server could not be reached.");
    expect(view.chat.busy).toBe(false);
  });

  it("aborts the turn in flight when the chat unmounts", async () => {
    const calls = pendingFetch();
    const view = mount(() => ({ subject: "Bloom filters" }));
    act(() => view.chat.ask("Where do I start?"));
    expect(calls[0].signal.aborted).toBe(false);

    act(() => root?.unmount());
    root = null;
    expect(calls[0].signal.aborted).toBe(true);
  });

  it("refuses a question while a turn is in flight, and a new send aborts the one it replaces", async () => {
    const calls = pendingFetch();
    const view = mount(() => ({ subject: "Bloom filters" }));
    act(() => view.chat.ask("First?"));
    act(() => view.chat.ask("Second?"));
    expect(calls).toHaveLength(1);
    expect(view.chat.turns).toEqual([{ role: "user", content: "First?" }]);

    // A send that does not go through `ask` (an opening, Try again) replaces the one in flight.
    act(() => view.chat.begin([{ role: "user", content: "Opening" }]));
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].signal.aborted).toBe(false);
    expect(view.chat.busy).toBe(true);
    expect(view.chat.error).toBeNull();

    calls[1].answer(200, reply("Where are you with hashing?"));
    await settle();
    expect(view.chat.busy).toBe(false);
    expect(view.chat.turns.map((t) => t.content)).toEqual(["Opening", "Where are you with hashing?"]);
  });

  it("clears the thread, dropping a turn in flight", async () => {
    const calls = pendingFetch();
    const view = mount(() => ({ subject: "Bloom filters" }));
    act(() => view.chat.ask("First?"));
    act(() => view.chat.clear());
    expect(calls[0].signal.aborted).toBe(true);
    expect(view.chat.busy).toBe(false);
    expect(view.chat.turns).toEqual([]);
    await settle();
    expect(view.chat.turns).toEqual([]);
  });
});
