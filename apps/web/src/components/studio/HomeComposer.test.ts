// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The home composer's wiring (D81 of docs/STUDIO-CHAT-FIRST.md): Send opens
 * the conversation at once with the words in it, makes the draft, and hands
 * the words over as the conversation's opener; a refusal keeps them. The
 * composer is a stand-in exposing its callbacks, since Lexical's editing is
 * not what is under test.
 */

type Value = { text: string; mentions: { kind: string; start: number; end: number }[] };

const mocks = vi.hoisted(() => ({
  createDraft: vi.fn(),
  push: vi.fn(),
  begin: vi.fn(),
  settle: vi.fn(),
  handle: { focus: vi.fn(), insertMention: vi.fn(), keepCaretThrough: vi.fn() },
  composer: null as null | {
    value: Value;
    sendDisabled?: boolean;
    disabledReason?: string;
    quietReason?: boolean;
    layout?: string;
    toolbar?: ReactNode;
    handleRef?: { current: unknown };
    onChange: (value: Value) => void;
    onSubmit: (value: Value) => void;
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function StubComposer(props: NonNullable<typeof mocks.composer>) {
      mocks.composer = props;
      if (props.handleRef) props.handleRef.current = mocks.handle;
      // A form, as the real composer is, so a toggle that submitted it would show.
      return createElement(
        "form",
        {
          "data-composer": JSON.stringify(props.value),
          onSubmit: (event: Event) => {
            event.preventDefault();
            props.onSubmit(props.value);
          },
        },
        props.toolbar,
      );
    },
}));
vi.mock("@/components/studio/panel-host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/studio/panel-host")>()),
  usePanelHost: () => ({ begin: mocks.begin, settle: mocks.settle, navigate: () => false }),
}));
vi.mock("@/lib/studio-drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/studio-drafts")>()),
  createDraft: mocks.createDraft,
}));

const { HomeComposer } = await import("./HomeComposer");
const { takeOpener } = await import("@/lib/studio-extend");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  sessionStorage.clear();
  mocks.composer = null;
  mocks.createDraft.mockReset().mockResolvedValue({ ok: true, status: 201, data: { draftId: "d7", state: "open", note: "" } });
  mocks.begin.mockReset().mockReturnValue(1);
  mocks.settle.mockReset().mockReturnValue(true);
  mocks.push.mockReset();
  mocks.handle.focus.mockReset();
  mocks.handle.keepCaretThrough.mockReset();
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount(video: { ok: boolean; reason: string | null } | null = null) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(createElement(HomeComposer, { path: "/studio?topic=graphs", video })));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

async function send(value: Value) {
  act(() => mocks.composer!.onChange(value));
  await act(async () => mocks.composer!.onSubmit(value));
}

describe("the home composer", () => {
  it("opens the conversation with the words, then hands them to the new draft as its first turn", async () => {
    mount();
    const words: Value = { text: "@diagram how a raft log stays in step", mentions: [{ kind: "diagram", start: 0, end: 8 }] };
    await send(words);

    expect(mocks.begin).toHaveBeenCalledWith(words);
    expect(mocks.createDraft).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledWith(1, "/studio?topic=graphs&draft=d7");
    expect(takeOpener(sessionStorage, "d7")).toMatchObject({ send: words.text, sendMentions: words.mentions, compose: "", source: null });
    // Sent, so the box is empty for the next one.
    expect(mocks.composer!.value.text).toBe("");
  });

  it("sends nothing for a bare tag, which gives the planner nothing to go on", async () => {
    mount();
    await send({ text: "@video", mentions: [{ kind: "video", start: 0, end: 6 }] });
    expect(mocks.composer!.sendDisabled).toBe(true);
    expect(mocks.createDraft).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it("gives a bare tag's reason to a screen reader without a line under the box", () => {
    mount();
    act(() => mocks.composer!.onChange({ text: "@diagram", mentions: [{ kind: "diagram", start: 0, end: 8 }] }));
    expect(mocks.composer!.disabledReason).toBe("Say what it should show");
    expect(mocks.composer!.quietReason).toBe(true);
  });

  it("keeps the words and says why when the draft could not be made", async () => {
    mocks.createDraft.mockResolvedValue({ ok: false, status: 503, refusal: { error: "the runner is busy" } });
    const container = mount();
    await send({ text: "a picture of TCP", mentions: [] });
    expect(mocks.settle).toHaveBeenCalledWith(1, null);
    expect(mocks.composer!.value.text).toBe("a picture of TCP");
    expect(container.querySelector("[role=alert]")?.textContent).toContain("the runner is busy");
    expect(takeOpener(sessionStorage, "d7")).toBeNull();
  });

  it("keeps the words when the person went elsewhere before the draft arrived", async () => {
    mocks.settle.mockReturnValue(false);
    mount();
    await send({ text: "a picture of UDP", mentions: [] });
    expect(mocks.composer!.value.text).toBe("a picture of UDP");
  });
});

describe("the Diagram and Video toggles (D88)", () => {
  const toggle = (container: HTMLElement, name: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((button) => button.textContent === name)!;

  it("sit in the box's row, and the box is the home composer's layout", () => {
    const container = mount();
    expect(mocks.composer!.layout).toBe("box");
    expect(toggle(container, "Diagram").getAttribute("aria-pressed")).toBe("false");
    expect(toggle(container, "Video").getAttribute("aria-pressed")).toBe("false");
  });

  it("put the chip in on one press and take it out on the next, and never send", () => {
    const container = mount();
    act(() => mocks.composer!.onChange({ text: "how raft keeps a log in step", mentions: [] }));

    act(() => toggle(container, "Diagram").click());
    expect(mocks.composer!.value).toEqual({
      text: "@diagram how raft keeps a log in step",
      mentions: [{ kind: "diagram", start: 0, end: 8 }],
    });
    expect(toggle(container, "Diagram").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[role=status]")?.textContent).toBe("Diagram tag added.");
    // The field keeps the person's caret, moved past the chip, and takes focus.
    expect(mocks.handle.keepCaretThrough).toHaveBeenLastCalledWith(mocks.composer!.value, { at: 0, removed: 0, inserted: 9 });
    expect(mocks.handle.focus).toHaveBeenCalled();

    act(() => toggle(container, "Diagram").click());
    expect(mocks.composer!.value).toEqual({ text: "how raft keeps a log in step", mentions: [] });
    expect(mocks.handle.keepCaretThrough).toHaveBeenLastCalledWith(mocks.composer!.value, { at: 0, removed: 9, inserted: 0 });
    expect(toggle(container, "Diagram").getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector("[role=status]")?.textContent).toBe("Diagram tag removed.");

    expect(mocks.createDraft).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it("shows pressed for a tag typed with @, and a press takes that chip out", () => {
    const container = mount();
    act(() => mocks.composer!.onChange({ text: "a @video of tcp", mentions: [{ kind: "video", start: 2, end: 8 }] }));
    expect(toggle(container, "Video").getAttribute("aria-pressed")).toBe("true");
    expect(toggle(container, "Diagram").getAttribute("aria-pressed")).toBe("false");

    act(() => toggle(container, "Video").click());
    expect(mocks.composer!.value).toEqual({ text: "a of tcp", mentions: [] });
  });

  it("say why a kind cannot be made, and add nothing when pressed", () => {
    const container = mount({ ok: false, reason: "ffmpeg is missing" });
    const video = toggle(container, "Video");
    expect(video.getAttribute("aria-disabled")).toBe("true");
    expect(video.title).toBe("Videos are unavailable: ffmpeg is missing");
    expect(document.getElementById(video.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Videos are unavailable: ffmpeg is missing",
    );

    act(() => video.click());
    expect(mocks.composer!.value.mentions).toEqual([]);
    expect(mocks.handle.keepCaretThrough).not.toHaveBeenCalled();
    expect(video.getAttribute("aria-pressed")).toBe("false");
    // The other kind is unaffected.
    expect(toggle(container, "Diagram").getAttribute("aria-disabled")).toBeNull();
  });
});
