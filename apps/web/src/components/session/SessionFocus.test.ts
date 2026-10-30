// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { SessionQuestion, SessionStep } from "@/lib/session-core";
import type { WeekCheckPlan } from "@/lib/week-check";

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

const WEEK_PLAN: WeekCheckPlan = {
  concepts: [{ slug: "tcp", title: "The TCP handshake", pL: 0.3, questions: [QUESTION] }],
  modelAvailable: false,
};

async function mount({ weekCheck = false } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(SessionFocus, {
        slug: weekCheck ? "networks-m1" : "tcp",
        title: weekCheck ? "Networks, module 1" : "The TCP handshake",
        mode: weekCheck ? "module" : "learn",
        plan: weekCheck ? [] : PLAN,
        modelAvailable: false,
        nothingToAsk: false,
        teach: createElement("p", null, "Three packets."),
        asset: createElement("div", null, "a diagram"),
        assetCompact: null,
        next: null,
        weekCheck: weekCheck
          ? { moduleId: "networks-m1", plan: WEEK_PLAN, moduleHref: "/courses/networks/m1", reason: null }
          : null,
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

/** Every body the page sent to the observe route, in order. */
const observed = () =>
  (fetch as unknown as Mock).mock.calls
    .filter(([url]) => url === "/api/learner/observe")
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);

const stop = (host: HTMLElement, percent: number) =>
  host.querySelector(`button[role="radio"][data-option="${percent}"]`) as HTMLButtonElement | null;

async function key(target: EventTarget, pressed: string) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: pressed, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function type(field: HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("SessionFocus confidence (docs/proposals/structured-checks.md, phase 3)", () => {
  it("asks how sure only once there is a pick, resting on 50", async () => {
    const host = await mount();
    await press(button(host, "Continue"));
    expect(host.textContent).not.toContain("How sure are you?");
    expect(host.querySelector("textarea")).toBeNull();

    await press(choice(host, "ACK"));
    expect(host.textContent).toContain("How sure are you?");
    expect(stop(host, 50)?.getAttribute("aria-checked")).toBe("true");
    expect([0, 30, 70, 90, 100].map((p) => stop(host, p)?.getAttribute("aria-checked"))).toEqual(Array(5).fill("false"));
    expect(host.querySelector("textarea")?.maxLength).toBe(2_000);
  });

  it("sends the confidence and the trimmed reasoning with the pick", async () => {
    const host = await mount();
    await press(button(host, "Continue"));
    await press(choice(host, "SYN"));
    await press(stop(host, 30) as HTMLElement);
    await type(host.querySelector("textarea") as HTMLTextAreaElement, "  The client speaks first.  ");
    await press(button(host, "Check"));

    expect(observed()).toHaveLength(1);
    expect(observed()[0]).toMatchObject({ chosen: "SYN", answer: "SYN", confidence: 30, thinking: "The client speaks first." });
    // Answered, the stops are gone with the rest of the question's controls.
    expect(host.textContent).not.toContain("How sure are you?");
  });

  it("leaves the reasoning out when none was written", async () => {
    const host = await mount();
    await press(button(host, "Continue"));
    await press(choice(host, "FIN"));
    await press(button(host, "Check"));
    const body = observed()[0] as Record<string, unknown>;
    expect(body.confidence).toBe(50);
    expect("thinking" in body).toBe(false);
  });

  it("sends no confidence with I don't know (K6)", async () => {
    const host = await mount();
    await press(button(host, "Continue"));
    await press(button(host, "I don't know"));
    const body = observed()[0] as Record<string, unknown>;
    expect(body.chosen).toBeNull();
    expect("confidence" in body).toBe(false);
    expect("thinking" in body).toBe(false);
  });

  it("keeps 1 to 4 picking and Enter checking with the focus on a stop, and leaves digits typed in the reasoning alone", async () => {
    const host = await mount();
    await press(button(host, "Continue"));
    await key(document.body, "1");
    expect(choice(host, "SYN").getAttribute("aria-pressed")).toBe("true");

    const ninety = stop(host, 90) as HTMLButtonElement;
    await press(ninety);
    ninety.focus();
    await key(ninety, "2");
    expect(choice(host, "ACK").getAttribute("aria-pressed")).toBe("true");
    await type(host.querySelector("textarea") as HTMLTextAreaElement, "3 packets");
    await key(host.querySelector("textarea") as HTMLTextAreaElement, "3");
    await key(ninety, "Enter");

    expect(observed()).toHaveLength(1);
    expect(observed()[0]).toMatchObject({ chosen: "ACK", confidence: 90, thinking: "3 packets" });
  });

  it("carries the confidence on a week check's answer too, with its module", async () => {
    const host = await mount({ weekCheck: true });
    await press(choice(host, "SYN"));
    await press(stop(host, 100) as HTMLElement);
    await press(button(host, "Check"));
    expect(observed()[0]).toMatchObject({ module: "networks-m1", source: "probe", chosen: "SYN", confidence: 100 });
  });
});

describe("a question the tutor writes", () => {
  it("is abandoned when the page goes away, so nothing waits on a reply nobody will read", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        return new Promise<Response>(() => undefined);
      }),
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(SessionFocus, {
          slug: "tcp",
          title: "The TCP handshake",
          mode: "check",
          plan: [
            { kind: "probe", question: null, fallback: null },
            { kind: "close", question: null, fallback: null },
          ],
          modelAvailable: true,
          nothingToAsk: false,
          teach: createElement("p", null, "Three packets."),
          asset: null,
          assetCompact: null,
          next: null,
        }),
      );
    });
    const asked = vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/agent/session");
    expect(asked).toHaveLength(1);
    expect(signals.some((s) => s.aborted)).toBe(false);
    act(() => root.unmount());
    host.remove();
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});

describe("SessionFocus writing through chat-recall (S4-08)", () => {
  it("sends the answer again under a fresh session when its session was closed elsewhere", async () => {
    const recorded = { concept: "tcp", correct: true, pLBefore: 0.3, pLAfter: 0.5, propagated: [], card: null, replayed: false };
    let first = true;
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url !== "/api/learner/observe") return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (first) {
        first = false;
        // The catalog's refusal for a session `learn session close` ended in another terminal.
        return new Response(JSON.stringify({ error: 'session "s-1" is closed; start a new one.' }), { status: 400 });
      }
      return new Response(JSON.stringify({ ok: true, result: recorded }), { status: 200 });
    });
    const host = await mount();
    await press(button(host, "Continue"));
    await press(choice(host, "SYN"));
    await press(button(host, "Check"));

    const [refused, resent] = observed();
    expect(resent?.requestId).toBe(refused?.requestId);
    expect(resent?.sessionId).not.toBe(refused?.sessionId);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
