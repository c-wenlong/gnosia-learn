// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderKeyRow } from "./ProviderKeys";
import type { TutorModelsView } from "@/lib/tutor-models/settings";

/**
 * The Provider keys and Models cards swap their controls by folding one away
 * as the next unfolds, and focus follows: into the field that opened, back
 * to the button that opened it on Cancel. The key's password field is in the
 * page only while its form is open.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { ProviderKeys } = await import("./ProviderKeys");
const { TutorModels } = await import("./TutorModels");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock
    .mockReset()
    .mockResolvedValue(new Response(JSON.stringify({ ok: true, models: [{ id: "m-1" }] }), { status: 200 }));
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
  [...container.querySelectorAll("button")].find((b) => b.textContent === name)!;

const row = (over: Partial<ProviderKeyRow> = {}): ProviderKeyRow => ({
  id: "openrouter",
  label: "OpenRouter",
  model: "m-default",
  saved: { last4: "abcd", savedOn: "1 Oct 2026", readable: true },
  server: true,
  inUse: "saved",
  test: { model: "m-default", modelFrom: "default", used: true },
  ...over,
});

describe("a provider key row", () => {
  it("opens the key form into its field, and gives focus back to Replace on Cancel", () => {
    const container = mount(createElement(ProviderKeys, { rows: [row()], reachable: true }));
    expect(container.querySelector('input[type="password"]')).toBeNull();

    act(() => button(container, "Replace").click());
    const field = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    expect(field).not.toBeNull();
    expect(document.activeElement).toBe(field);
    // The buttons fold away behind it.
    expect(button(container, "Replace").closest("[inert]")).not.toBeNull();

    act(() => button(container, "Cancel").click());
    expect(document.activeElement).toBe(button(container, "Replace"));
    // Kept for its fold's way out, then gone.
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it("opens the remove confirm onto its Cancel, and Cancel goes back to Remove", () => {
    const container = mount(createElement(ProviderKeys, { rows: [row()], reachable: true }));
    act(() => button(container, "Remove").click());
    const group = container.querySelector('[role="group"]')!;
    expect(group.closest("[inert]")).toBeNull();
    const cancel = [...group.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!;
    expect(document.activeElement).toBe(cancel);
    act(() => cancel.click());
    expect(group.closest("[inert]")).not.toBeNull();
    expect(document.activeElement).toBe(button(container, "Remove"));
  });
});

const view = (over: Partial<TutorModelsView> = {}): TutorModelsView => ({
  reachable: true,
  chain: [],
  providers: [{ id: "openrouter", label: "OpenRouter", key: "saved" }],
  defaults: [],
  ...over,
});

describe("the Models card", () => {
  it("unfolds the add form into its model field, and Cancel folds it back onto Add a model", async () => {
    const container = mount(createElement(TutorModels, { view: view() }));
    const open = button(container, "Add a model");
    const form = container.querySelector('form[aria-label="Add a model"]')!;
    expect(form.closest("[inert]")).not.toBeNull();

    await act(async () => open.click());
    expect(form.closest("[inert]")).toBeNull();
    expect(open.closest("[inert]")).not.toBeNull();
    expect(document.activeElement?.getAttribute("name")).toBe("model");

    act(() => button(container, "Cancel").click());
    expect(form.closest("[inert]")).not.toBeNull();
    expect(document.activeElement).toBe(open);
  });
});
