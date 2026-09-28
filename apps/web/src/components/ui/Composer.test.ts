// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Composer } from "./Composer";

/**
 * The composer's keys, in a DOM: what reaches `onSubmit` and `onModEnter`.
 * The rules themselves are `composer-keys.test.ts`; this pins that the
 * component applies them and that no key gets past a blocked Send.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount(props: Partial<Parameters<typeof Composer>[0]> & { value: string }) {
  const onSubmit = vi.fn();
  const onModEnter = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      createElement(Composer, { onChange: () => {}, onSubmit, onModEnter, label: "Say", ...props }),
    ),
  );
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  const box = host.querySelector("textarea")!;
  const press = (init: KeyboardEventInit & { keyCode?: number }) => {
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init });
    if (init.keyCode !== undefined) Object.defineProperty(event, "keyCode", { value: init.keyCode });
    act(() => {
      box.dispatchEvent(event);
    });
  };
  return { onSubmit, onModEnter, press };
}

describe("Composer keys", () => {
  it("sends on Enter and not on Shift+Enter", () => {
    const { onSubmit, press } = mount({ value: "hello" });
    press({ shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    press({});
    expect(onSubmit).toHaveBeenCalledWith("hello");
  });

  it("does not send on the Enter that commits an IME word in Safari", () => {
    const { onSubmit, press } = mount({ value: "日本" });
    press({ keyCode: 229 });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("gives Cmd+Enter to onModEnter only from an empty field", () => {
    const empty = mount({ value: "" });
    empty.press({ metaKey: true });
    expect(empty.onModEnter).toHaveBeenCalledOnce();
    const typed = mount({ value: "use the other topic" });
    typed.press({ ctrlKey: true });
    expect(typed.onModEnter).not.toHaveBeenCalled();
    expect(typed.onSubmit).toHaveBeenCalledWith("use the other topic");
  });

  it("lets no key past a blocked Send, Cmd+Enter included", () => {
    const { onSubmit, onModEnter, press } = mount({ value: "hello", sendDisabled: true });
    press({});
    press({ metaKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onModEnter).not.toHaveBeenCalled();
  });
});
