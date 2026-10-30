// @vitest-environment jsdom
import { act, createElement, createRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MentionComposer, type MentionComposerHandle, type MentionComposerProps } from "./MentionComposer";
import type { MentionOption, MentionValue } from "./mention-text";

/**
 * The studio's chat field on the real Lexical editor, in a DOM: the value it
 * reports, the keys it answers and what it sends.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  document.body.replaceChildren();
});

const MENTIONS: MentionOption<"diagram" | "video">[] = [
  { id: "diagram", name: "Diagram", description: "A picture on the canvas", icon: "diagram" },
  { id: "video", name: "Video", description: "A narrated video", icon: "video" },
];
const EMPTY: MentionValue<"diagram" | "video"> = { text: "", mentions: [] };

type Props = Partial<MentionComposerProps<"diagram" | "video">>;

async function mount(props: Props = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const handle = createRef<MentionComposerHandle>();
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  const element = (next: Props): ReactElement =>
    createElement(MentionComposer<"diagram" | "video">, {
      value: EMPTY,
      onChange,
      onSubmit,
      label: "Message",
      mentions: MENTIONS,
      handleRef: handle,
      ...props,
      ...next,
    });
  await act(async () => root.render(element({})));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  const field = () => container.querySelector<HTMLElement>('[role="textbox"]')!;
  return {
    container,
    handle,
    onChange,
    onSubmit,
    field,
    draw: (next: Props) => act(async () => root.render(element(next))),
  };
}

/** A key on the field, as a browser reports it: Lexical listens on the editable root. */
async function key(target: HTMLElement, name: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }));
  });
}

describe("MentionComposer", () => {
  it("sends what the field holds on Enter, before the parent's value has caught up", async () => {
    // The parent has not re-rendered with the editor's change yet: its value
    // is still empty when the Enter lands.
    const { handle, onChange, onSubmit, field } = await mount();
    await act(async () => handle.current!.insertMention("video"));
    expect(onChange).toHaveBeenLastCalledWith({ text: "@video ", mentions: [{ kind: "video", start: 0, end: 6 }] });

    await key(field(), "Enter");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ text: "@video ", mentions: [{ kind: "video", start: 0, end: 6 }] });
  });
});
