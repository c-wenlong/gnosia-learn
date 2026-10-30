// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Remove takes a provider out of the runner's BYOK settings whole: its key,
 * its tier models and the active pick. Like every other press here that
 * cannot be undone, it asks first (S1-27 of the web audit).
 */

const mocks = vi.hoisted(() => ({ getByokSettings: vi.fn(), removeByokProvider: vi.fn(), listByokModels: vi.fn(), saveByokModels: vi.fn() }));

vi.mock("@/lib/studio-byok", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/studio-byok")>()),
  getByokSettings: mocks.getByokSettings,
  removeByokProvider: mocks.removeByokProvider,
  listByokModels: mocks.listByokModels,
  saveByokModels: mocks.saveByokModels,
}));

const { ByokConfig } = await import("./ByokConfig");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

const named = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find((button) => button.textContent === text);

async function mountConnected(): Promise<HTMLElement> {
  mocks.getByokSettings.mockResolvedValue({
    ok: true,
    status: 200,
    data: { configured: true, active: "openrouter", model: "m", providers: [{ provider: "openrouter", last4: "abcd", models: { default: "m" } }] },
  });
  mocks.listByokModels.mockResolvedValue({ ok: true, status: 200, data: { models: [] } });
  mocks.removeByokProvider.mockResolvedValue({ ok: true, status: 200, data: {} });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(ByokConfig, {}));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

describe("ByokConfig's Remove", () => {
  it("cannot be confirmed while Save models is still saving", async () => {
    mocks.saveByokModels.mockReturnValue(new Promise(() => {}));
    const host = await mountConnected();
    await act(async () => named(host, "Remove")!.click());
    await act(async () => named(host, "Save models")!.click());
    expect(named(host, "Remove it")?.disabled).toBe(true);
    expect(mocks.removeByokProvider).not.toHaveBeenCalled();
  });

  it("asks before it removes the stored key, and removes it only on Remove it", async () => {
    mocks.getByokSettings.mockResolvedValue({
      ok: true,
      status: 200,
      data: { configured: true, active: "openrouter", model: "m", providers: [{ provider: "openrouter", last4: "abcd", models: { default: "m" } }] },
    });
    mocks.listByokModels.mockResolvedValue({ ok: true, status: 200, data: { models: [] } });
    mocks.removeByokProvider.mockResolvedValue({ ok: true, status: 200, data: {} });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(ByokConfig, {}));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    mounted.push(() => {
      act(() => root.unmount());
      host.remove();
    });

    await act(async () => named(host, "Remove")!.click());
    expect(mocks.removeByokProvider).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Remove OpenRouter's key from Studio?");

    await act(async () => named(host, "Keep it")!.click());
    expect(mocks.removeByokProvider).not.toHaveBeenCalled();

    await act(async () => named(host, "Remove")!.click());
    await act(async () => named(host, "Remove it")!.click());
    expect(mocks.removeByokProvider).toHaveBeenCalledTimes(1);
    expect(mocks.removeByokProvider).toHaveBeenCalledWith("openrouter");
  });
});
