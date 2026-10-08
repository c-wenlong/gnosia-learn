// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderRowView, ProvidersView } from "@/lib/providers/view";

/**
 * The Providers card folds its controls in and out rather than swapping
 * them, and focus follows: into the field that opened, back to the button
 * that opened it on Cancel. Rows start closed and the arrow opens one onto
 * its models, fetching the provider's model list the first time. A key's
 * password field is in the page only while its form is open.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { Providers } = await import("./Providers");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom's dialog does not open itself. Add provider's dialog needs what a
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
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock
    .mockReset()
    .mockImplementation(() =>
      // A fresh body per call: the card's mount read (BYOK status) and a
      // row's model list are both fetches, and a shared Response's body can
      // be read once.
      Promise.resolve(new Response(JSON.stringify({ ok: true, models: [{ id: "m-1" }, { id: "m-2", free: true }] }), { status: 200 })),
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
  addable: [{ id: "gemini", label: "Google Gemini" }],
  full: false,
  ...over,
});

describe("the Providers card", () => {
  it("starts a row closed, and the arrow opens it onto its models, fetching the list once", async () => {
    const container = mount(createElement(Providers, { view: view() }));
    const arrow = button(container, "Show OpenRouter models");
    const panel = document.getElementById(arrow.getAttribute("aria-controls")!)!;
    expect(arrow.getAttribute("aria-expanded")).toBe("false");
    expect(panel.closest("[inert]") ?? panel.hasAttribute("inert")).toBeTruthy();
    expect(modelsCalls()).toHaveLength(0);

    await act(async () => arrow.click());
    expect(arrow.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(container.textContent).toContain("m-1");
    expect(modelsCalls()).toHaveLength(1);
    expect(container.textContent).toContain("2 models from OpenRouter");
  });

  it("asks for the list again when the key changes while the row is open, and keeps only the newest answer", async () => {
    let answer!: (r: Response) => void;
    let held = false;
    fetchMock.mockImplementation((url) =>
      !held && String(url).includes("tutor-model/models")
        ? ((held = true), new Promise<Response>((resolve) => (answer = resolve)))
        : Promise.resolve(new Response(JSON.stringify({ ok: true, models: [{ id: "m-1" }] }), { status: 200 })),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mounted.push(() => {
      act(() => root.unmount());
      container.remove();
    });
    act(() => root.render(createElement(Providers, { view: view() })));
    await act(async () => button(container, "Show OpenRouter models").click());
    // The key is replaced while the first ask is still out: the row asks again.
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, models: String(url).includes("tutor-model/models") ? [{ id: "new-account" }] : [] }), { status: 200 }),
      ),
    );
    await act(async () =>
      root.render(createElement(Providers, { view: view({ rows: [row({ saved: { last4: "wxyz", savedOn: "5 Oct 2026", readable: true } })] }) })),
    );
    expect(modelsCalls()).toHaveLength(2);
    expect(container.textContent).toContain("1 model from OpenRouter");
    // The first, slower answer arrives last and is dropped.
    await act(async () => answer(new Response(JSON.stringify({ ok: true, models: [{ id: "old-1" }, { id: "old-2" }] }), { status: 200 })));
    expect(container.textContent).toContain("1 model from OpenRouter");
  });

  it("opens Edit into its key field, and Cancel gives focus back to Edit and drops the field", () => {
    const container = mount(createElement(Providers, { view: view() }));
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
    const container = mount(createElement(Providers, { view: view() }));
    act(() => button(container, "Delete").click());
    const group = container.querySelector('[role="group"][aria-label^="Confirm deleting"]')!;
    expect(group.textContent).toContain("Your key and its 1 model go with it.");
    const keyOnly = mount(createElement(Providers, { view: view({ rows: [row({ models: [] })] }) }));
    expect(keyOnly.textContent).toContain("Your key goes with it.");
    const cancel = [...group.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!;
    expect(document.activeElement).toBe(cancel);
    act(() => cancel.click());
    expect(document.activeElement).toBe(button(container, "Delete"));
  });

  it("gives focus to Add provider once a deleted row has left with the refresh", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mounted.push(() => {
      act(() => root.unmount());
      container.remove();
    });
    act(() => root.render(createElement(Providers, { view: view() })));
    act(() => button(container, "Delete").click());
    const group = container.querySelector('[role="group"][aria-label^="Confirm deleting"]')!;
    const confirm = [...group.querySelectorAll("button")].find((b) => b.textContent === "Delete")!;
    await act(async () => {
      confirm.focus();
      confirm.click();
    });
    // The refresh's answer: the row is gone and the provider can be added again.
    act(() => root.render(createElement(Providers, { view: view({ rows: [], addable: [{ id: "openrouter", label: "OpenRouter" }] }) })));
    expect(document.activeElement).toBe(button(container, "Add provider"));
  });

  it("offers only the providers not listed in Add provider, and hides the button when none is left", () => {
    const container = mount(createElement(Providers, { view: view() }));
    act(() => button(container, "Add provider").click());
    const form = container.querySelector('form[aria-label="Add a provider"]')!;
    expect(form).not.toBeNull();
    expect(form.textContent).toContain("Google Gemini");

    // With every built-in listed, Add provider still offers a custom one: the form opens on its fields.
    const none = mount(createElement(Providers, { view: view({ addable: [] }) }));
    act(() => button(none, "Add provider").click());
    const custom = none.querySelector('form[aria-label="Add a provider"]')!;
    expect(custom.textContent).toContain("Base URL");
    expect(custom.textContent).toContain("Name");
  });

  it("adds a custom provider in one request with its name, base URL and key", async () => {
    const container = mount(createElement(Providers, { view: view({ addable: [] }) }));
    act(() => button(container, "Add provider").click());
    const form = container.querySelector<HTMLFormElement>('form[aria-label="Add a provider"]')!;
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
        view: view({ rows: [row({ id: "custom-my-gateway", label: "My gateway", model: "", custom: { baseUrl: "https://gw.example/v1" }, models: [] })] }),
      }),
    );
    expect(container.textContent).toContain("https://gw.example/v1");
    expect(container.textContent).toContain("No models");
    expect(container.textContent).not.toContain("Built-in default");
    act(() => button(container, "Edit").click());
    const form = container.querySelector('form[aria-label="My gateway key"]')!;
    expect(form.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe("https://gw.example/v1");
    expect(form.textContent).toContain("Leave it empty to keep the key saved now.");
    // Nothing changed yet: Save waits for a change.
    expect([...form.querySelectorAll("button")].find((b) => b.textContent === "Save")?.disabled).toBe(true);
  });

  it("moves a provider only where there is a provider with models to pass", () => {
    const container = mount(
      createElement(Providers, {
        view: view({ rows: [row(), row({ id: "nvidia", label: "NVIDIA NIM", models: ["n-1"] }), row({ id: "gemini", label: "Google Gemini", models: [] })] }),
      }),
    );
    expect(button(container, "Move OpenRouter up").disabled).toBe(true);
    expect(button(container, "Move OpenRouter down").disabled).toBe(false);
    // NVIDIA is the last with models: Gemini, below it, has none and no place to swap with.
    expect(button(container, "Move NVIDIA NIM down").disabled).toBe(true);
    expect(button(container, "Move Google Gemini up")).toBeUndefined();
  });

  it("names the built-in default while the tutor has no models", () => {
    const container = mount(createElement(Providers, { view: view({ usingDefaults: true, rows: [row({ models: [] })] }) }));
    expect(container.textContent).toContain("Built-in default: openrouter/free");
  });
});
