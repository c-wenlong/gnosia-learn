// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(nav.query) }));

const { VerbSubmit } = await import("./VerbSubmit");

/**
 * A diagram verb's button holds while its action runs, so a second press
 * cannot queue a second 200-second export in front of every other action on
 * the page (R2-1-04), and the hold is the verb's, not the form's: another
 * button of the same verb holds too, and a form unmounted mid-action (the
 * More menu closing) does not free it (the Greptile review of #595).
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  nav.query = "";
});

const Submit = VerbSubmit as (props: { verb: string; pending: string; row?: boolean }) => ReactElement;

function form(action: () => Promise<void>, row = false, key = "a") {
  return createElement("form", { action, key }, createElement(Submit, { verb: "export", pending: "Exporting", row }, "Export SVG"));
}

function mountRoot() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, root };
}

function slowAction() {
  let finish: () => void = () => undefined;
  let calls = 0;
  const action = () => {
    calls += 1;
    return new Promise<void>((resolve) => (finish = resolve));
  };
  return { action, finish: () => finish(), calls: () => calls };
}

describe("VerbSubmit", () => {
  it.each([false, true])("says what it is doing and takes no second press while the action runs (row: %s)", async (row) => {
    const { host, root } = mountRoot();
    const slow = slowAction();
    await act(async () => root.render(form(slow.action, row)));
    const button = () => host.querySelector("button")!;
    expect(button().textContent).toBe("Export SVG");
    await act(async () => button().click());
    expect(button().textContent).toBe("Exporting");
    expect(button().disabled).toBe(true);
    await act(async () => button().click());
    expect(slow.calls()).toBe(1);
    await act(async () => slow.finish());
    expect(button().textContent).toBe("Export SVG");
    expect(button().disabled).toBe(false);
  });

  it("holds every button of the verb, through a form unmounted mid-action, until the redirect lands", async () => {
    const { host, root } = mountRoot();
    const slow = slowAction();
    const other = vi.fn(async () => {});
    // The strip's Export SVG and the menu's, as two forms.
    await act(async () => root.render(createElement("div", null, form(slow.action, false, "strip"), form(other, true, "menu"))));
    const [strip, menu] = [...host.querySelectorAll("button")];
    await act(async () => strip!.click());
    expect(menu!.disabled).toBe(true);
    expect(menu!.textContent).toBe("Exporting");
    // The pressed form goes (the menu closed, say); a new button of the verb still holds.
    await act(async () => root.render(createElement("div", null, form(other, true, "reopened"))));
    expect(host.querySelector("button")!.disabled).toBe(true);
    // The action's redirect changes the address: the hold ends.
    nav.query = "v=export&ok=1";
    await act(async () => root.render(createElement("div", null, form(other, true, "reopened"))));
    expect(host.querySelector("button")!.disabled).toBe(false);
    expect(other).not.toHaveBeenCalled();
    await act(async () => slow.finish());
  });
});
