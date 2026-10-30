// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { VerbSubmit } from "./VerbSubmit";

/**
 * A diagram verb's button holds while its action runs, so a second press
 * cannot queue a second 200-second export in front of every other action on
 * the page (R2-1-04).
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

async function mount(row: boolean) {
  let finish: () => void = () => undefined;
  let calls = 0;
  const action = () => {
    calls += 1;
    return new Promise<void>((resolve) => (finish = resolve));
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement("form", { action }, createElement(VerbSubmit as (props: { pending: string; row: boolean }) => ReturnType<typeof VerbSubmit>, { pending: "Exporting", row }, "Export SVG")));
  });
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, finish: () => finish(), calls: () => calls };
}

describe("VerbSubmit", () => {
  it.each([false, true])("says what it is doing and takes no second press while the action runs (row: %s)", async (row) => {
    const { host, finish, calls } = await mount(row);
    const button = () => host.querySelector("button")!;
    expect(button().textContent).toBe("Export SVG");
    await act(async () => button().click());
    expect(button().textContent).toBe("Exporting");
    expect(button().disabled).toBe(true);
    await act(async () => button().click());
    expect(calls()).toBe(1);
    await act(async () => finish());
    expect(button().textContent).toBe("Export SVG");
    expect(button().disabled).toBe(false);
  });
});
