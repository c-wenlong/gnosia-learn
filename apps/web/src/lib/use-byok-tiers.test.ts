// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A BYOK conversation's and the home composer's tier models (D94): read when
 * BYOK is the pick and again on every BYOK write, cleared when nothing is
 * configured, and never set by an answer that lands after the read stopped
 * mattering.
 */

const mocks = vi.hoisted(() => ({ getByokSettings: vi.fn() }));

vi.mock("@/lib/studio-byok", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/studio-byok")>()),
  getByokSettings: mocks.getByokSettings,
}));

const { BYOK_SETTINGS_CHANGED } = await import("@/lib/studio-byok");
const { useByokTiers } = await import("./use-byok-tiers");

type Read = ReturnType<typeof useByokTiers>;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => mocks.getByokSettings.mockReset());

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let seen: Read[] = [];
afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  seen = [];
});

function Reader({ enabled, readKey, listen }: { enabled: boolean; readKey?: number; listen?: boolean }): ReactElement | null {
  seen.push(useByokTiers(enabled, readKey, { listen }));
  return null;
}

async function draw(enabled: boolean, readKey?: number, listen?: boolean) {
  if (container === null) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  await act(async () => root!.render(createElement(Reader, { enabled, readKey, listen })));
}

const latest = () => seen.at(-1);

const configured = (tiers: Record<string, string>, active = "openrouter") => ({
  ok: true,
  status: 200,
  data: {
    configured: true,
    active,
    model: tiers.default ?? null,
    providers: [
      { provider: "openrouter", last4: "abcd", models: tiers },
      { provider: "deepseek", last4: "wxyz", models: { default: "deepseek-chat" } },
    ],
  },
});
const unconfigured = { ok: true, status: 200, data: { configured: false, active: null, model: null, providers: [] } };

describe("useByokTiers", () => {
  it("reads nothing while BYOK is not the pick, and has no answer", async () => {
    await draw(false);
    window.dispatchEvent(new Event(BYOK_SETTINGS_CHANGED));
    expect(mocks.getByokSettings).not.toHaveBeenCalled();
    expect(latest()).toBeUndefined();
  });

  it("answers with the active provider's model and tiers", async () => {
    mocks.getByokSettings.mockResolvedValue(configured({ default: "qwen-max", lite: "qwen-turbo" }));
    await draw(true);
    expect(latest()).toEqual({ model: "qwen-max", tiers: { default: "qwen-max", lite: "qwen-turbo" } });
  });

  it("reads again on a BYOK write, and a read saying nothing is configured clears the tiers", async () => {
    mocks.getByokSettings.mockResolvedValue(configured({ default: "qwen-max" }));
    await draw(true);
    mocks.getByokSettings.mockResolvedValue(unconfigured);
    await act(async () => window.dispatchEvent(new Event(BYOK_SETTINGS_CHANGED)));
    expect(mocks.getByokSettings).toHaveBeenCalledTimes(2);
    expect(latest()).toBeNull();
  });

  it("keeps what it had when a read fails", async () => {
    mocks.getByokSettings.mockResolvedValue(configured({ default: "qwen-max" }));
    await draw(true);
    mocks.getByokSettings.mockResolvedValue({ ok: false, status: 502, refusal: { error: "runner down" } });
    await act(async () => window.dispatchEvent(new Event(BYOK_SETTINGS_CHANGED)));
    expect(latest()).toEqual({ model: "qwen-max", tiers: { default: "qwen-max" } });
  });

  it("reads again when the read key changes", async () => {
    mocks.getByokSettings.mockResolvedValue(configured({ default: "qwen-max" }));
    await draw(true, 0);
    mocks.getByokSettings.mockResolvedValue(configured({ default: "deepseek-chat" }, "deepseek"));
    await draw(true, 1);
    expect(mocks.getByokSettings).toHaveBeenCalledTimes(2);
    expect(latest()).toEqual({ model: "deepseek-chat", tiers: { default: "deepseek-chat" } });
  });

  it("drops an answer that lands after BYOK stopped being the pick, and stops listening", async () => {
    let answer: (value: unknown) => void = () => {};
    mocks.getByokSettings.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await draw(true);
    await draw(false);
    await act(async () => answer(configured({ default: "qwen-max" })));
    expect(latest()).toBeUndefined();
    window.dispatchEvent(new Event(BYOK_SETTINGS_CHANGED));
    expect(mocks.getByokSettings).toHaveBeenCalledTimes(1);
  });

  it("leaves a BYOK write to the caller when told not to listen", async () => {
    mocks.getByokSettings.mockResolvedValue(configured({ default: "qwen-max" }));
    await draw(true, 0, false);
    await act(async () => window.dispatchEvent(new Event(BYOK_SETTINGS_CHANGED)));
    expect(mocks.getByokSettings).toHaveBeenCalledTimes(1);
  });
});
