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
});

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock
    .mockReset()
    .mockResolvedValue(new Response(JSON.stringify({ ok: true, models: [{ id: "m-1" }, { id: "m-2", free: true }] }), { status: 200 }));
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
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => arrow.click());
    expect(arrow.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(container.textContent).toContain("m-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/learner/tutor-model/models");
    expect(container.textContent).toContain("2 models from OpenRouter");
  });

  it("asks for the list again when the key changes while the row is open, and keeps only the newest answer", async () => {
    let answer!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
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
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, models: [{ id: "new-account" }] }), { status: 200 }));
    await act(async () =>
      root.render(createElement(Providers, { view: view({ rows: [row({ saved: { last4: "wxyz", savedOn: "5 Oct 2026", readable: true } })] }) })),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it("offers only the providers not listed in Add provider, and hides the button when none is left", () => {
    const container = mount(createElement(Providers, { view: view() }));
    act(() => button(container, "Add provider").click());
    const form = container.querySelector('form[aria-label="Add a provider"]')!;
    expect(form).not.toBeNull();
    expect(form.textContent).toContain("Google Gemini");

    const none = mount(createElement(Providers, { view: view({ addable: [] }) }));
    expect(button(none, "Add provider")).toBeUndefined();
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
