// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionQuestion, SessionStep } from "@/lib/session-core";

/**
 * How the session moves from step to step (docs/design/IMPLEMENTATION.md,
 * "Motion"): each step's column mounts afresh and rises in, the focus follows
 * to its heading, the verdict rises in, Why? glides open, and the page scrolls
 * back up smoothly unless the reader asked for less movement. The network is
 * a stand-in: nothing here records an answer anywhere.
 */

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
  };
});
vi.mock("@/components/Math", async () => {
  const { createElement } = await import("react");
  return { MathText: ({ text }: { text: string }) => createElement("span", null, text) };
});

import { SessionFocus } from "./SessionFocus";

const QUESTION: SessionQuestion = {
  id: "c1",
  prompt: "Which packet opens the handshake?",
  choices: ["SYN", "ACK", "FIN"],
  correct: 0,
  reason: "The client opens with a SYN.",
  explanation: "SYN carries the client's first sequence number.",
  source: "RFC 9293",
  origin: "note",
};

const PLAN: SessionStep[] = [
  { kind: "teach", question: null, fallback: null },
  { kind: "check", question: QUESTION, fallback: null },
  { kind: "close", question: null, fallback: null },
];

const scrolls: Array<ScrollToOptions | undefined> = [];

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function reducedMotion(on: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: on && query.includes("reduce"), media: query }));
}

beforeEach(() => {
  scrolls.length = 0;
  reducedMotion(false);
  vi.spyOn(window, "scrollTo").mockImplementation(((options?: ScrollToOptions) => {
    scrolls.push(options);
  }) as typeof window.scrollTo);
  Element.prototype.scrollIntoView = () => undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/learner/observe") {
        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              concept: "tcp",
              correct: true,
              pLBefore: 0.3,
              pLAfter: 0.5,
              propagated: [],
              card: null,
              replayed: false,
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(SessionFocus, {
        slug: "tcp",
        title: "The TCP handshake",
        mode: "learn",
        plan: PLAN,
        modelAvailable: false,
        nothingToAsk: false,
        teach: createElement("p", null, "Three packets."),
        asset: createElement("div", null, "a diagram"),
        assetCompact: null,
        next: null,
      }),
    );
  });
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const button = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

/** An option, whose text follows its number badge. */
const choice = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll("button[aria-keyshortcuts]")].find((b) => b.textContent?.endsWith(text)) as HTMLButtonElement;

async function press(el: HTMLElement) {
  await act(async () => {
    el.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("SessionFocus moving between steps", () => {
  it("rises the first step in without taking the focus", async () => {
    const host = await mount();
    const column = host.querySelector('[data-step="0"]') as HTMLElement;
    expect(column.classList.contains("animate-enter")).toBe(true);
    expect(column.classList.contains("motion-reduce:animate-none")).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });

  it("mounts the next step afresh and moves the focus to its heading, as the Continue pressed goes", async () => {
    const host = await mount();
    const first = host.querySelector('[data-step="0"]');
    button(host, "Continue").focus();
    await press(button(host, "Continue"));

    expect(first?.isConnected).toBe(false);
    const column = host.querySelector('[data-step="1"]') as HTMLElement;
    expect(column.classList.contains("animate-enter")).toBe(true);
    const heading = column.querySelector("h1") as HTMLElement;
    expect(heading.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(heading);
  });

  it("scrolls back to the top smoothly, and at once under reduced motion", async () => {
    const host = await mount();
    await press(button(host, "Continue"));
    expect(scrolls.at(-1)).toEqual({ top: 0, behavior: "smooth" });

    reducedMotion(true);
    await press(choice(host, "SYN"));
    await press(button(host, "Check"));
    await press(button(host, "Continue"));
    expect(scrolls.at(-1)).toEqual({ top: 0, behavior: "auto" });
  });

  it("rises the verdict in and glides Why? open, named by the button that opens it", async () => {
    const host = await mount();
    await press(button(host, "Continue"));
    await press(choice(host, "SYN"));
    await press(button(host, "Check"));

    const verdict = host.querySelector('[role="status"]') as HTMLElement;
    expect(verdict.textContent).toContain("Correct");
    expect(verdict.classList.contains("animate-enter")).toBe(true);

    const why = button(host, "Why?");
    const region = host.querySelector(`#${CSS.escape(why.getAttribute("aria-controls") ?? "")}`) as HTMLElement;
    // Mounted and shut: it can glide open rather than appear.
    expect(region.textContent).toContain("first sequence number");
    expect(region.hasAttribute("inert")).toBe(true);
    expect(why.getAttribute("aria-expanded")).toBe("false");

    await press(why);
    expect(region.hasAttribute("inert")).toBe(false);
    expect(why.getAttribute("aria-expanded")).toBe("true");
  });

  it("brings the close screen in the same way, its heading taking the focus", async () => {
    const host = await mount();
    await press(button(host, "Continue"));
    await press(choice(host, "SYN"));
    await press(button(host, "Check"));
    await press(button(host, "Continue"));

    const column = host.querySelector('[data-step="2"]') as HTMLElement;
    expect(column.classList.contains("animate-enter")).toBe(true);
    const heading = column.querySelector("h1") as HTMLElement;
    expect(heading.textContent).toBe("Session closed");
    expect(document.activeElement).toBe(heading);
  });
});
