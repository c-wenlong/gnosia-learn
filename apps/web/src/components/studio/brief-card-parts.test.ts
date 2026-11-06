// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { useHoldAction } from "./brief-card-parts";

/**
 * Use this brief on a card put on hold: the press says "Saving…" while its
 * action runs, and an action that rejects must end that as surely as one that
 * resolves (R3-2-07).
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function mount(action: () => Promise<string | null>) {
  const seen: { using: boolean; useError: string | null; use: (a: typeof action) => Promise<void> } = {
    using: false,
    useError: null,
    use: async () => {},
  };
  function Probe() {
    Object.assign(seen, useHoldAction());
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(Probe)));
  cleanups.push(() => act(() => root.unmount()));
  return { seen, press: () => act(async () => seen.use(action)) };
}

describe("useHoldAction", () => {
  it("says the refusal an action resolves with, and is free again", async () => {
    const { seen, press } = mount(async () => "A newer brief replaced this one.");
    await press();
    expect(seen).toMatchObject({ using: false, useError: "A newer brief replaced this one." });
  });

  it("is free again, and says so, when the action rejects", async () => {
    const { seen, press } = mount(async () => {
      throw new TypeError("Failed to fetch");
    });
    await press();
    expect(seen).toMatchObject({ using: false, useError: "It could not be put back. Try again." });
  });
});
