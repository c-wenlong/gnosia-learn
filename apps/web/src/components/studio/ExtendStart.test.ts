// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { openerSend, openerValue } from "@/lib/studio-cards";
import { EXTEND_OPENER, leavePrefill, takeOpener } from "@/lib/studio-extend";

/**
 * The Extend panel's wiring, in a DOM, against a mocked client module: what a
 * person types while the diagram is read (chips included) and what goes with
 * the hand-off (docs/STUDIO-MENTIONS.md; #179 and #204 for the races). The
 * composer is a stand-in that shows the value it is handed and exposes the
 * callbacks, since Lexical's editing is not what is under test here.
 */

type Value = { text: string; mentions: Array<{ kind: "diagram" | "video"; start: number; end: number }> };

const mocks = vi.hoisted(() => ({
  createDraft: vi.fn(),
  replace: vi.fn(),
  focus: vi.fn(),
  isClosing: vi.fn(() => false),
  composer: null as null | {
    value: Value;
    disabled?: boolean;
    sendDisabled?: boolean;
    disabledReason?: string;
    mentions: Array<{ id: string; disabledReason?: string | null }>;
    onChange: (value: Value) => void;
    onSubmit: (value: Value) => void;
  },
}));

// One object for every render, as Next's is: a new one each time would remake
// the panel's post effect, which runs the press again after a refusal.
vi.mock("next/navigation", () => {
  const router = { replace: mocks.replace, push: vi.fn() };
  return { useRouter: () => router };
});
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/dynamic", () => ({
  default: () =>
    function StubComposer(props: NonNullable<typeof mocks.composer> & { handleRef?: { current: unknown } }) {
      mocks.composer = props;
      if (props.handleRef) props.handleRef.current = { focus: mocks.focus, insertMention: vi.fn() };
      return createElement("div", { "data-composer": JSON.stringify(props.value) });
    },
}));
vi.mock("@/components/studio/StudioDialog", () => ({
  DialogHeader: ({ title }: { title: ReactNode }) => createElement("h2", null, title),
  useStudioDialog: () => ({ close: vi.fn(), isClosing: mocks.isClosing }),
}));
vi.mock("@/components/studio/PinnedDiagram", () => ({ PinnedDiagram: () => null }));
vi.mock("@/lib/studio-drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/studio-drafts")>()),
  createDraft: mocks.createDraft,
}));

const { ExtendStart } = await import("./ExtendStart");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

/** The post to `POST /api/drafts { source }`, answered when the test says. */
let answer: (result: unknown) => void = () => {};
const draftMade = { ok: true, status: 201, data: { draftId: "d9", state: "open", note: "" } };

beforeEach(() => {
  mocks.composer = null;
  mocks.focus.mockClear();
  mocks.replace.mockClear();
  mocks.isClosing.mockReturnValue(false);
  sessionStorage.clear();
  mocks.createDraft.mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

async function settle() {
  for (let at = 0; at < 5; at += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(props: { talk?: boolean; video?: { ok: boolean; reason: string | null } | null } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(ExtendStart, { name: "tcp-handshake", title: "TCP handshake", path: "/studio?extend=tcp-handshake", listed: true, ...props }),
    );
  });
  await settle();
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const type = (value: Value) => act(async () => mocks.composer!.onChange(value));
const send = (value: Value) => act(async () => mocks.composer!.onSubmit(value));
const resolve = async (result: unknown) => {
  await act(async () => answer(result));
  await settle();
};
const handedOver = () => takeOpener(sessionStorage, "d9");

const VIDEO_OF_IT: Value = { text: "A @video of the close", mentions: [{ kind: "video", start: 2, end: 8 }] };
const DIAGRAM_OF_IT: Value = { text: "then a @diagram of it", mentions: [{ kind: "diagram", start: 7, end: 15 }] };

describe("the composer", () => {
  it("is the conversation's: both tags in its menu, Video following the doctor, focused when it arrives", async () => {
    await mount({ video: { ok: false, reason: "no ffmpeg" } });
    expect(mocks.composer!.mentions.map((option) => option.id)).toEqual(["diagram", "video"]);
    expect(mocks.composer!.mentions[0]!.disabledReason).toBeNull();
    expect(mocks.composer!.mentions[1]!.disabledReason).toBe("Videos are unavailable: no ffmpeg");
    expect(mocks.focus).toHaveBeenCalled();
  });

  it("blocks a bare tag, as an empty conversation does, and an over-long message", async () => {
    await mount();
    await type({ text: "@video", mentions: [{ kind: "video", start: 0, end: 6 }] });
    expect(mocks.composer!.sendDisabled).toBe(true);
    expect(mocks.composer!.disabledReason).toBe("Say what it should show");
    await send({ text: "@video", mentions: [{ kind: "video", start: 0, end: 6 }] });
    expect(mocks.composer!.value.text).toBe("@video");
    await type({ text: "x".repeat(8_500), mentions: [] });
    expect(mocks.composer!.disabled).toBe(false);
    expect(mocks.composer!.sendDisabled).toBe(true);
    expect(mocks.composer!.disabledReason).toBe("8,500 of 8,000 characters. Cut it down to send.");
  });
});

describe("a chip typed while the diagram is read", () => {
  it("goes into the conversation's composer as a chip where it was typed, and sends only the opener", async () => {
    await mount();
    await type(DIAGRAM_OF_IT);
    await resolve(draftMade);
    const opener = handedOver()!;
    expect(opener.send).toBe(EXTEND_OPENER);
    expect(opener.sendMentions).toEqual([]);
    // What the conversation does with it on arrival (DraftPanel's own reads).
    expect(openerValue(opener)).toEqual(DIAGRAM_OF_IT);
    expect(openerSend(opener)).toEqual({ text: EXTEND_OPENER, mentions: [] });
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it("goes as the first turn with its chip when the message was sent, and the unsent words keep theirs", async () => {
    const host = await mount();
    await type(VIDEO_OF_IT);
    await send({ ...VIDEO_OF_IT, text: `${VIDEO_OF_IT.text}  ` });
    // Shown as a bubble with a chip in it, the composer emptied and Send held.
    expect(host.textContent).toContain("Video");
    expect(host.textContent).toContain("of the close");
    expect(mocks.composer!.value).toEqual({ text: "", mentions: [] });
    expect(mocks.composer!.sendDisabled).toBe(true);
    expect(mocks.composer!.disabledReason).toBe("Your message goes as soon as the diagram is read.");
    await type(DIAGRAM_OF_IT);
    await resolve(draftMade);
    const opener = handedOver()!;
    expect(openerSend(opener)).toEqual(VIDEO_OF_IT);
    expect(openerValue(opener)).toEqual(DIAGRAM_OF_IT);
  });

  it("ignores a second message while one is waiting", async () => {
    await mount();
    await send(VIDEO_OF_IT);
    await send(DIAGRAM_OF_IT);
    await resolve(draftMade);
    expect(openerSend(handedOver()!)).toEqual(VIDEO_OF_IT);
  });

  it("closes the composer once the draft exists, so what it holds is all there is to carry", async () => {
    await mount();
    await resolve(draftMade);
    expect(mocks.composer!.disabled).toBe(true);
    expect(mocks.composer!.disabledReason).toBe("Opening the conversation. What is here goes with it.");
    expect(handedOver()!.compose).toBe("");
  });

  it("comes back into the composer with its chip, ahead of what was typed since, when the press is refused", async () => {
    const host = await mount();
    await send(VIDEO_OF_IT);
    await type(DIAGRAM_OF_IT);
    await resolve({ ok: false, status: 502, refusal: { error: "inspect failed", detail: "" } });
    expect(host.querySelector("[role=alert]")).not.toBeNull();
    // The composer goes while refused and returns with Try again, holding both.
    const retry = [...host.querySelectorAll("button")].find((button) => button.textContent === "Try again")!;
    await act(async () => retry.click());
    await settle();
    expect(mocks.composer!.value).toEqual({
      text: "A @video of the close\nthen a @diagram of it",
      mentions: [
        { kind: "video", start: 2, end: 8 },
        { kind: "diagram", start: 29, end: 37 },
      ],
    });
    // A refusal left nothing behind for a conversation that never opened.
    expect(handedOver()).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("stays a chip only once when the same kind was typed in both", async () => {
    await mount();
    await send(VIDEO_OF_IT);
    await type({ text: "@video again", mentions: [{ kind: "video", start: 0, end: 6 }] });
    await resolve({ ok: false, status: 503, refusal: { error: "down", detail: "" } });
    const retry = [...document.querySelectorAll("button")].find((button) => button.textContent === "Try again")!;
    await act(async () => retry.click());
    await settle();
    // prependValue's rule: the second chip of a kind reads as text.
    expect(mocks.composer!.value.mentions.map((mention) => mention.kind)).toEqual(["video"]);
  });
});

describe("Talk it through", () => {
  it("sends nothing on the person's behalf, and hands over what was left, chips included", async () => {
    await mount({ talk: true });
    await type(DIAGRAM_OF_IT);
    await resolve(draftMade);
    const opener = handedOver()!;
    expect(opener.send).toBeNull();
    expect(openerSend(opener)).toBeNull();
    expect(openerValue(opener)).toEqual(DIAGRAM_OF_IT);
  });

  it("puts its prefill in the composer, and still sends nothing", async () => {
    leavePrefill(sessionStorage, "tcp-handshake", "A drawing failed and I want to change its brief.");
    await mount({ talk: true });
    expect(mocks.composer!.value).toEqual({ text: "A drawing failed and I want to change its brief.", mentions: [] });
    await resolve(draftMade);
    const opener = handedOver()!;
    expect(opener.send).toBeNull();
    expect(opener.compose).toBe("A drawing failed and I want to change its brief.");
  });

  it("still sends a message the person queued during the read", async () => {
    await mount({ talk: true });
    await send(VIDEO_OF_IT);
    await resolve(draftMade);
    expect(openerSend(handedOver()!)).toEqual(VIDEO_OF_IT);
  });

  it("leaves a stale prefill alone on an ordinary press", async () => {
    leavePrefill(sessionStorage, "tcp-handshake", "stale");
    await mount();
    expect(mocks.composer!.value.text).toBe("");
  });
});

describe("an ordinary press", () => {
  it("sends the opener when nothing was typed, and not into a conversation the person closed", async () => {
    await mount();
    await resolve(draftMade);
    expect(openerSend(handedOver()!)).toEqual({ text: EXTEND_OPENER, mentions: [] });
    sessionStorage.clear();
    mocks.replace.mockClear();
    mocks.isClosing.mockReturnValue(true);
    await mount();
    await resolve(draftMade);
    expect(handedOver()).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
