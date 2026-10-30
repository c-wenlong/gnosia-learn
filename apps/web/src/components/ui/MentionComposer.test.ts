// @vitest-environment jsdom
import { $getRoot, $getSelection, $isRangeSelection, type LexicalEditor } from "lexical";
import { act, createElement, createRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MentionComposer, type MentionComposerHandle, type MentionComposerProps } from "./MentionComposer";
import type { MentionOption, MentionValue } from "@/lib/mentions";

/**
 * The studio's chat field on the real Lexical editor, in a DOM: the value it
 * reports, the keys it answers and what it sends.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom lays nothing out; Lexical measures the caret to keep it in view.
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
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

/** The editor behind a field: Lexical hangs it on its root element. */
const editorOf = (field: HTMLElement) => (field as unknown as { __lexicalEditor: LexicalEditor }).__lexicalEditor;

/** Words typed at the caret (the end of a field with none), as one update. `tag` marks it, as Lexical marks a paste. */
async function typeText(field: HTMLElement, text: string, tag?: string) {
  await act(async () => {
    editorOf(field).update(
      () => {
        if (!$isRangeSelection($getSelection())) $getRoot().selectEnd();
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(text);
      },
      tag === undefined ? undefined : { tag },
    );
  });
}

const listbox = (container: HTMLElement) => container.querySelector<HTMLElement>('[role="listbox"][id]');
const rows = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[role="listbox"][id] [role="option"]')];
const chips = (field: HTMLElement) => field.querySelectorAll("[data-lexical-decorator]");
const said = (container: HTMLElement) => container.querySelector('[role="status"]')?.textContent;
const VIDEO = { text: "@video ", mentions: [{ kind: "video", start: 0, end: 6 }] };

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

  it("opens the menu on @, filters it as the query grows, and puts a chip where the @ was on Enter", async () => {
    const { container, onChange, onSubmit, field } = await mount();
    await typeText(field(), "@");
    expect(rows(container).map((row) => row.textContent)).toEqual([expect.stringContaining("Diagram"), expect.stringContaining("Video")]);
    expect(field().getAttribute("aria-controls")).toBe(listbox(container)!.id);
    expect(said(container)).toMatch(/^2 options\. Diagram/);

    await typeText(field(), "vi");
    expect(rows(container)).toHaveLength(1);
    expect(field().getAttribute("aria-activedescendant")).toBe(rows(container)[0]!.id);

    await key(field(), "Enter");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(VIDEO);
    expect(chips(field())).toHaveLength(1);
    expect(listbox(container)).toBeNull();
    expect(field().hasAttribute("aria-controls")).toBe(false);
    expect(said(container)).toBe("Video tag added.");
  });

  it("picks with Tab, and with a press on a row", async () => {
    const { container, onChange, field } = await mount();
    await typeText(field(), "@d");
    await key(field(), "Tab");
    expect(onChange).toHaveBeenLastCalledWith({ text: "@diagram ", mentions: [{ kind: "diagram", start: 0, end: 8 }] });

    await typeText(field(), "@");
    const video = rows(container).find((row) => row.textContent?.includes("Video"))!;
    await act(async () => video.click());
    expect(onChange).toHaveBeenLastCalledWith({
      text: "@diagram @video ",
      mentions: [
        { kind: "diagram", start: 0, end: 8 },
        { kind: "video", start: 9, end: 15 },
      ],
    });
  });

  it("steps over a disabled row with the arrows, and will not pick it", async () => {
    const mentions = [MENTIONS[0]!, { ...MENTIONS[1]!, disabledReason: "Videos are off" }];
    const { container, field } = await mount({ mentions });
    await typeText(field(), "@");
    const active = () => rows(container).findIndex((row) => row.getAttribute("aria-selected") === "true");
    expect(active()).toBe(0);
    await key(field(), "ArrowDown");
    expect(active()).toBe(0);
    expect(rows(container)[1]!.getAttribute("aria-disabled")).toBe("true");
    await act(async () => rows(container)[1]!.click());
    expect(chips(field())).toHaveLength(0);
  });

  it("keeps one chip per kind: a second pick of the same kind takes the query away and adds nothing", async () => {
    const { onChange, field, handle } = await mount();
    await act(async () => handle.current!.insertMention("video"));
    await act(async () => handle.current!.insertMention("video"));
    expect(chips(field())).toHaveLength(1);
    await typeText(field(), "@vid");
    await key(field(), "Enter");
    expect(chips(field())).toHaveLength(1);
    expect(onChange).toHaveBeenLastCalledWith(VIDEO);
  });

  it("closes only the menu on Escape, so a dialog around the field stays open", async () => {
    const { container, field } = await mount();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    try {
      await typeText(field(), "@");
      expect(listbox(container)).not.toBeNull();
      const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      await act(async () => {
        field().dispatchEvent(escape);
      });
      expect(escape.defaultPrevented).toBe(true);
      expect(outer).not.toHaveBeenCalled();
      expect(listbox(container)).toBeNull();
    } finally {
      document.removeEventListener("keydown", outer);
    }
  });

  it("opens no menu for a pasted @word, which stays words", async () => {
    const { container, onChange, field } = await mount();
    await typeText(field(), "see @video", "paste");
    expect(listbox(container)).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({ text: "see @video", mentions: [] });
  });

  it("rebuilds the field from a value the parent sets, without reporting it back", async () => {
    const { onChange, field, draw } = await mount();
    await draw({ value: { text: "@diagram of TCP", mentions: [{ kind: "diagram", start: 0, end: 8 }] } });
    expect(chips(field())).toHaveLength(1);
    expect(field().textContent).toContain("of TCP");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("gives Cmd+Enter to onModEnter only from an empty field, and sends otherwise", async () => {
    const onModEnter = vi.fn();
    const { onSubmit, field } = await mount({ onModEnter });
    vi.useFakeTimers();
    try {
      await key(field(), "Enter", { metaKey: true });
      act(() => vi.runAllTimers());
      expect(onModEnter).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
    await typeText(field(), "tcp");
    await key(field(), "Enter", { metaKey: true });
    expect(onSubmit).toHaveBeenCalledWith({ text: "tcp", mentions: [] });
    expect(onModEnter).toHaveBeenCalledTimes(1);
  });

  it("sends nothing from an empty field, or while Send is held", async () => {
    const { onSubmit, field, draw } = await mount();
    await key(field(), "Enter");
    await typeText(field(), "tcp");
    await draw({ sendDisabled: true });
    await key(field(), "Enter");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
