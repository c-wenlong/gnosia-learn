// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChainEntry } from "@/lib/agent/providers";
import type { ProviderRowView, ProvidersView } from "@/lib/providers/view";

/**
 * The Providers card folds its controls in and out rather than swapping
 * them, and focus follows: into the field that opened, back to the button
 * that opened it on Cancel. Model selection fetches a provider's model list
 * when the pick lands on it. A key's password field is in the page only
 * while its form is open.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { Providers } = await import("./Providers");
const { ModelSelection } = await import("./ModelSelection");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom's dialog does not open itself. Add custom provider's dialog needs what a
  // browser's does: it opens, and it is already `open` for Close to undo.
  const proto = HTMLDialogElement.prototype as unknown as { showModal: () => void; close: () => void };
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const fetchMock = vi.fn();
/** The model-list fetches — the card also reads `/studio/api/settings/byok` on mount (D95), which is not this test's subject. */
const modelsCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes("tutor-model/models"));
const chainWrites = (method: string) =>
  fetchMock.mock.calls.filter((c) => String(c[0]) === "/api/learner/tutor-model" && (c[1] as RequestInit | undefined)?.method === method);
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock
    .mockReset()
    .mockImplementation((url) =>
      // A fresh body per call: the card's mount read (BYOK status) and a
      // provider's model list are both fetches, and a shared Response's body
      // can be read once.
      Promise.resolve(
        new Response(
          JSON.stringify(
            String(url).includes("/studio/api/settings/byok")
              ? { configured: false, active: null, providers: [] }
              : { ok: true, chain: [], models: [{ id: "m-1" }, { id: "m-2", free: true }] },
          ),
          { status: 200 },
        ),
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mount(element: ReturnType<typeof createElement>) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

const button = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent === name || b.getAttribute("aria-label") === name)!;

const row = (over: Partial<ProviderRowView> = {}): ProviderRowView => ({
  id: "openrouter",
  label: "OpenRouter",
  model: "openrouter/free",
  saved: { last4: "abcd", savedOn: "1 Oct 2026", readable: true },
  server: false,
  inUse: "saved",
  models: ["m-1"],
  ...over,
});

const view = (over: Partial<ProvidersView> = {}): ProvidersView => ({
  keysReachable: true,
  chainReachable: true,
  usingDefaults: false,
  rows: [row()],
  ...over,
});

const selection = (viewOver: Partial<ProvidersView> = {}, chain: ChainEntry[] = [{ provider: "openrouter", model: "m-1" }]) =>
  createElement(ModelSelection, { view: view(viewOver), chain, tutorStyle: "guide-concise", savedForTutor: [], studio: true });

describe("the Providers card", () => {
  it("lists every row it is handed, an unkeyed one with Add key", () => {
    const container = mount(
      createElement(Providers, {
        studio: true,
        view: view({
          rows: [row(), row({ id: "nvidia", label: "NVIDIA NIM", saved: null, inUse: null, models: [] })],
        }),
      }),
    );
    expect(container.textContent).toContain("OpenRouter");
    expect(container.textContent).toContain("NVIDIA NIM");
    expect(container.textContent).toContain("No key yet");
    expect(button(container, "Add key")).not.toBeUndefined();
  });

  it("opens Edit into its key field, and Cancel gives focus back to Edit and drops the field", () => {
    const container = mount(createElement(Providers, { studio: true, view: view() }));
    expect(container.querySelector('input[type="password"]')).toBeNull();

    act(() => button(container, "Edit").click());
    const field = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    expect(field).not.toBeNull();
    expect(document.activeElement).toBe(field);

    act(() => button(container, "Cancel").click());
    expect(document.activeElement).toBe(button(container, "Edit"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it("opens Delete onto its Cancel, saying what goes, and Cancel goes back to Delete", () => {
    const container = mount(createElement(Providers, { studio: true, view: view() }));
    act(() => button(container, "Delete").click());
    const group = container.querySelector('[role="group"][aria-label^="Confirm deleting"]')!;
    expect(group.textContent).toContain("Your key and its 1 model go with it.");
    const keyOnly = mount(createElement(Providers, { studio: true, view: view({ rows: [row({ models: [] })] }) }));
    expect(keyOnly.textContent).toContain("Your key goes with it.");
    const cancel = [...group.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!;
    expect(document.activeElement).toBe(cancel);
    act(() => cancel.click());
    expect(document.activeElement).toBe(button(container, "Delete"));
  });

  it("keeps a built-in's row after its key is deleted, and a custom row leaves to Add custom provider", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mounted.push(() => {
      act(() => root.unmount());
      container.remove();
    });
    act(() => root.render(createElement(Providers, { studio: true, view: view({ rows: [row({ id: "custom-gw", label: "My gateway", custom: { baseUrl: "https://gw.example/v1" }, models: [] })] }) })));
    act(() => button(container, "Delete").click());
    const group = container.querySelector('[role="group"][aria-label^="Confirm deleting"]')!;
    const confirm = [...group.querySelectorAll("button")].find((b) => b.textContent === "Delete")!;
    await act(async () => {
      confirm.focus();
      confirm.click();
    });
    // The refresh's answer: the custom row is gone and Add custom provider takes focus.
    act(() => root.render(createElement(Providers, { studio: true, view: view({ rows: [] }) })));
    expect(document.activeElement).toBe(button(container, "Add custom provider"));
  });

  it("opens Add custom provider as a dialog whose Escape and Close give the button back focus", async () => {
    const container = mount(createElement(Providers, { studio: true, view: view() }));
    const add = button(container, "Add custom provider");
    act(() => add.click());
    const dialog = container.querySelector("dialog")!;
    expect(dialog.getAttribute("open")).not.toBeNull();
    expect(dialog.textContent).toContain("API key");
    expect(dialog.textContent).toContain("Base URL");

    // Escape asks to close; the exit runs, and focus goes back to the button.
    act(() => dialog.dispatchEvent(new Event("cancel", { cancelable: true, bubbles: true })));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(add);

    act(() => add.click());
    const again = container.querySelector("dialog")!;
    act(() => button(container, "Close").click());
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(again.isConnected).toBe(false);
    expect(document.activeElement).toBe(add);
  });

  it("adds a custom provider in one request with its name, base URL and key", async () => {
    const container = mount(createElement(Providers, { studio: true, view: view() }));
    act(() => button(container, "Add custom provider").click());
    const form = container.querySelector<HTMLFormElement>('form[aria-label="Add a custom provider"]')!;
    const inputs = [...form.querySelectorAll("input")];
    const set = (input: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    act(() => {
      set(inputs.find((i) => i.placeholder === "My gateway")!, "My gateway");
      set(inputs.find((i) => i.type === "url")!, "https://gw.example/v1");
      set(inputs.find((i) => i.type === "password")!, "gw-key-0123456789abcdef");
    });
    await act(async () => form.requestSubmit());
    const write = fetchMock.mock.calls.find(([u]) => u === "/api/learner/custom-provider") as [string, RequestInit];
    expect(write[0]).toBe("/api/learner/custom-provider");
    expect(JSON.parse(String(write[1].body))).toEqual({ label: "My gateway", baseUrl: "https://gw.example/v1", key: "gw-key-0123456789abcdef" });
  });

  it("shows a custom provider's base URL, and its Edit takes the name and the URL with the key optional", () => {
    const container = mount(
      createElement(Providers, {
        studio: true,
        view: view({ rows: [row({ id: "custom-my-gateway", label: "My gateway", model: "", custom: { baseUrl: "https://gw.example/v1" }, models: [] })] }),
      }),
    );
    expect(container.textContent).toContain("https://gw.example/v1");
    act(() => button(container, "Edit").click());
    const form = container.querySelector('form[aria-label="My gateway key"]')!;
    expect(form.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe("https://gw.example/v1");
    expect(form.textContent).toContain("Leave it empty to keep the key saved now.");
    // Nothing changed yet: Save waits for a change.
    expect([...form.querySelectorAll("button")].find((b) => b.textContent === "Save")?.disabled).toBe(true);
  });
});

describe("the Model selection card", () => {
  it("says to add a key first when no provider has one", () => {
    const container = mount(selection({ rows: [row({ saved: null, inUse: null, models: [] })] }, []));
    expect(container.textContent).toContain("No provider has a key yet");
  });

  it("with the studio off, draws no Studio chats side and never asks the studio's runner", async () => {
    const chain: ChainEntry[] = [{ provider: "openrouter", model: "m-1" }];
    const container = mount(createElement(ModelSelection, { view: view(), chain, tutorStyle: "guide-concise", savedForTutor: [], studio: false }));
    await act(async () => {});
    expect(container.textContent).not.toContain("Studio chats");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/studio/api/"))).toBe(false);
  });

  it("shows the chain's first entry as the pick and fetches the provider's model list", async () => {
    const container = mount(selection());
    await act(async () => {});
    expect(modelsCalls().length).toBeGreaterThan(0);
    expect(container.textContent).toContain("2 models from OpenRouter");
    expect(button(container, "Use this model")).not.toBeUndefined();
    expect(button(container, "Test")).not.toBeUndefined();
  });

  it("saving a new pick replaces the whole chain in one write", async () => {
    const chain: ChainEntry[] = [
      { provider: "openrouter", model: "m-1" },
      { provider: "openrouter", model: "m-2" },
    ];
    const container = mount(selection({}, chain));
    const input = container.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, "m-9");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button(container, "Use this model").click());
    const writes = chainWrites("PUT");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String((writes[0]?.[1] as RequestInit).body))).toEqual({ provider: "openrouter", model: "m-9" });
  });
});
