// @vitest-environment jsdom
import { act, createElement } from "react";
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
  composer: null as null | {
    value: Value;
    sendDisabled?: boolean;
    disabledReason?: string;
    onChange: (value: Value) => void;
    onSubmit: (value: Value) => void;
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function StubComposer(props: NonNullable<typeof mocks.composer>) {
      mocks.composer = props;
      return createElement("div", { "data-composer": JSON.stringify(props.value) });
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
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(createElement(HomeComposer, { path: "/studio?topic=graphs", video: null })));
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
