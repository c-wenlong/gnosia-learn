// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewItem } from "@gnosia/tutor/review-core";
import { OPTIONS_WAIT_MS } from "@gnosia/tutor/session-core";

/**
 * How the review moves from card to card (docs/design/IMPLEMENTATION.md,
 * "Motion"): each card's column mounts afresh and rises in, the focus follows
 * to its prompt, the answer and the rating row rise in when they appear, the
 * focus moves to what appeared when the control that revealed it has gone,
 * and Why? glides open. The keys still work from there. The network is a
 * stand-in: nothing here grades a card anywhere.
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

import { ReviewSession } from "./ReviewSession";

function card(over: Partial<ReviewItem>): ReviewItem {
  return {
    conceptId: "tcp",
    title: "The TCP handshake",
    summary: "",
    domain: "networks",
    kind: "recall",
    prompt: "What opens a TCP connection?",
    answer: "A SYN from the client.",
    why: "It carries the first sequence number.",
    source: null,
    choices: null,
    correct: null,
    checks: 1,
    intervals: [1, 3, 7, 14],
    ease: null,
    repetitions: 0,
    lapses: 0,
    leech: false,
    lastReviewed: null,
    due: null,
    ...over,
  };
}

const RECALL = card({});
const CHECK = card({
  conceptId: "udp",
  title: "UDP",
  kind: "check",
  prompt: "Does UDP retransmit?",
  answer: "No",
  choices: ["Yes", "No", "Sometimes"],
  correct: 1,
  why: null,
});

const NOTE = "Options made without the tutor, from related notes.";

const graded: unknown[] = [];

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  graded.length = 0;
  Element.prototype.scrollIntoView = () => undefined;
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/review/grade") {
        const body = JSON.parse(String(init?.body)) as { grade: number };
        graded.push(body.grade);
        return new Response(JSON.stringify({ ok: true, result: { rating: body.grade } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, nextDue: null, items: [] }), { status: 200 });
    }),
  );
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(items: ReviewItem[]) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(ReviewSession, {
        initial: { reachable: true, items, nextDue: null },
        focus: null,
        asOf: "2026-10-04T00:00:00.000Z",
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
/** A rating, whose label comes first in its button. */
const rating = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll('[role="group"][aria-label="Rate your recall"] button')].find((b) =>
    b.textContent?.startsWith(label),
  ) as HTMLButtonElement;

async function settle(run: () => void) {
  await act(async () => {
    run();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** A key pressed wherever the focus is, as a browser sends it. */
function key(name: string) {
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
}

describe("ReviewSession moving through the queue", () => {
  it("rises the first card in without taking the focus", async () => {
    const host = await mount([RECALL, CHECK]);
    const column = host.querySelector('[data-step="0"]') as HTMLElement;
    expect(column.classList.contains("animate-enter")).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });

  it("rises the answer and the ratings in, and gives the answer the focus Show answer held", async () => {
    const host = await mount([RECALL, CHECK]);
    const show = button(host, "Show answer");
    show.focus();
    await settle(() => show.click());

    const answer = host.querySelector('section[aria-label="Answer"]') as HTMLElement;
    expect(answer.classList.contains("animate-enter")).toBe(true);
    const ratings = host.querySelector('[role="group"][aria-label="Rate your recall"]') as HTMLElement;
    expect(ratings.parentElement?.classList.contains("animate-enter")).toBe(true);
    expect(document.activeElement).toBe(answer);
  });

  it("keeps Space from rating the card the answer was just shown on", async () => {
    const host = await mount([RECALL, CHECK]);
    await settle(() => key(" "));
    expect(host.querySelector('section[aria-label="Answer"]')).not.toBeNull();
    // Space again, with the focus on the answer, not a rating: nothing is graded.
    await settle(() => key(" "));
    expect(graded).toEqual([]);
  });

  it("glides Why? open, named by the button that opens it", async () => {
    const host = await mount([RECALL, CHECK]);
    await settle(() => button(host, "Show answer").click());
    const why = button(host, "Why?");
    const region = host.querySelector(`#${CSS.escape(why.getAttribute("aria-controls") ?? "")}`) as HTMLElement;
    expect(region.textContent).toContain("first sequence number");
    expect(region.hasAttribute("inert")).toBe(true);
    await settle(() => why.click());
    expect(region.hasAttribute("inert")).toBe(false);
    expect(why.getAttribute("aria-expanded")).toBe("true");
  });

  it("mounts the next card afresh and moves the focus to its prompt, as the rating pressed goes", async () => {
    const host = await mount([RECALL, CHECK]);
    await settle(() => button(host, "Show answer").click());
    const first = host.querySelector('[data-step="0"]');
    const good = rating(host, "Good");
    good.focus();
    await settle(() => good.click());

    expect(graded).toEqual([2]);
    expect(first?.isConnected).toBe(false);
    const column = host.querySelector('[data-step="1"]') as HTMLElement;
    expect(column.classList.contains("animate-enter")).toBe(true);
    const prompt = column.querySelector("h1") as HTMLElement;
    expect(prompt.textContent).toBe("Does UDP retransmit?");
    expect(document.activeElement).toBe(prompt);
  });

  it("moves the focus from the prompt to the answer when Space reveals it on the next card", async () => {
    const host = await mount([RECALL, card({ conceptId: "ip", prompt: "What does IP route?", answer: "Packets." })]);
    await settle(() => button(host, "Show answer").click());
    await settle(() => rating(host, "Good").click());
    const prompt = host.querySelector('[data-step="1"] h1') as HTMLElement;
    expect(document.activeElement).toBe(prompt);

    // The key leaves the focus on the prompt, which is for reading, not a control: the answer takes it.
    await settle(() => key(" "));
    expect(document.activeElement).toBe(host.querySelector('section[aria-label="Answer"]'));
  });

  it("moves the focus from the prompt to the rating row when a number answers a check card", async () => {
    const host = await mount([RECALL, CHECK]);
    await settle(() => button(host, "Show answer").click());
    await settle(() => rating(host, "Good").click());
    await settle(() => key("1"));
    expect(document.activeElement).toBe(host.querySelector('[role="group"][aria-label="Rate your recall"]'));
  });

  it("on a check card moves the focus to the rating row, and Enter still commits the suggestion", async () => {
    const host = await mount([CHECK]);
    await settle(() => key("2"));
    const ratings = host.querySelector('[role="group"][aria-label="Rate your recall"]') as HTMLElement;
    expect(document.activeElement).toBe(ratings);
    const verdict = host.querySelector('[role="status"]') as HTMLElement;
    expect(verdict.classList.contains("animate-enter")).toBe(true);

    await settle(() => key("Enter"));
    expect(graded).toEqual([2]);
    const done = host.querySelector('[data-step="done"]') as HTMLElement;
    expect(done.classList.contains("animate-enter")).toBe(true);
    expect(document.activeElement).toBe(done.querySelector("h1"));
  });
});

describe("ReviewSession reading the state again", () => {
  it("refreshes the page once, at the end, never after each grade", async () => {
    router.refresh.mockClear();
    const second = card({ conceptId: "ip", prompt: "What does IP route?", answer: "Packets." });
    const host = await mount([RECALL, second]);
    await settle(() => button(host, "Show answer").click());
    await settle(() => rating(host, "Good").click());
    expect(router.refresh).not.toHaveBeenCalled();
    await settle(() => button(host, "Show answer").click());
    await settle(() => rating(host, "Good").click());
    expect(graded).toEqual([2, 2]);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("says more cards are due when the session read only the first of them", async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      url === "/api/review/grade"
        ? new Response(JSON.stringify({ ok: true, result: { rating: 2 } }), { status: 200 })
        : new Response(JSON.stringify({ ok: true, nextDue: null, items: Array.from({ length: 50 }, () => ({})), more: true }), {
            status: 200,
          }),
    );
    const host = await mount([RECALL]);
    await settle(() => button(host, "Show answer").click());
    await settle(() => rating(host, "Good").click());
    await settle(() => undefined);
    expect(host.textContent).toContain("1 card reviewed, and over 50 more are due.");
    // The finished queue is fixed: the next batch is a fresh load of All reviews.
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    await settle(() => button(host, "Review the next batch").click());
    expect(assign).toHaveBeenCalledWith("/review");
  });
});

describe("ReviewSession wrong-option line", () => {
  it("says the options were not the tutor's when they came from the notes", async () => {
    const host = await mount([{ ...CHECK, wrong: "notes" }]);
    expect(host.textContent).toContain(NOTE);
  });

  it("draws nothing for the tutor's own options or an unmarked card", async () => {
    const tutor = await mount([{ ...CHECK, wrong: "tutor" }]);
    expect(tutor.textContent).not.toContain("Options made without the tutor");
    const plain = await mount([CHECK]);
    expect(plain.textContent).not.toContain("Options made without the tutor");
  });
});

describe("ReviewSession asking the tutor for a check card's options", () => {
  /** A card whose options came from the notes, with a model to ask: it carries `rewrite`. */
  const asking = (conceptId: string): ReviewItem => ({ ...CHECK, conceptId, wrong: "notes", rewrite: { check: "c1" } });
  const TUTOR = ["Only on a timeout", "Always, after three duplicate acks", "When the checksum fails"];

  /** The check-options requests made, by concept, with a handle to answer each. */
  let asked: Array<{ concept: string; answer: (status: number, body: unknown) => void }> = [];

  beforeEach(() => {
    asked = [];
    const grade = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url !== "/api/agent/check-options") return grade(url, init);
        const { conceptSlug } = JSON.parse(String(init?.body)) as { conceptSlug: string };
        return new Promise<Response>((resolve, reject) => {
          // As a real fetch does, an abort rejects it.
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          asked.push({ concept: conceptSlug, answer: (status, body) => resolve(new Response(JSON.stringify(body), { status })) });
        });
      }),
    );
  });

  const choices = (host: HTMLElement) =>
    [...host.querySelectorAll("button")].map((b) => b.textContent?.trim() ?? "").filter((t) => [...CHECK.choices!, ...TUTOR].some((c) => t.includes(c)));
  const fits = { question: CHECK.prompt, answer: CHECK.answer };

  it("asks for the card on screen and the two after it, never while rendering, then the next as the queue moves", async () => {
    const cards = ["a", "b", "c", "d"].map(asking);
    const html = renderToStaticMarkup(
      createElement(ReviewSession, { initial: { reachable: true, items: cards, nextDue: null }, focus: null, asOf: "2026-10-04T00:00:00.000Z" }),
    );
    expect(asked).toEqual([]);
    expect(html).toContain("The tutor is writing the options…");

    const host = await mount(cards);
    expect(asked.map((a) => a.concept)).toEqual(["a", "b", "c"]);
    expect(host.textContent).toContain("The tutor is writing the options…");
    // While it waits, no key picks an option.
    await settle(() => key("2"));
    expect(host.querySelector('[role="group"][aria-label="Rate your recall"]')).toBeNull();

    await settle(() => asked[0].answer(200, { options: TUTOR, ...fits }));
    await settle(() => key("2"));
    await settle(() => key("Enter"));
    expect(asked.map((a) => a.concept)).toEqual(["a", "b", "c", "d"]);
  });

  it("lays the card out with the tutor's options when they arrive, with no line under them", async () => {
    const host = await mount([asking("a")]);
    await settle(() => asked[0].answer(200, { options: TUTOR, ...fits }));
    expect(host.textContent).not.toContain("The tutor is writing the options…");
    const shown = choices(host);
    expect(shown).toHaveLength(4);
    for (const option of TUTOR) expect(shown.some((t) => t.includes(option))).toBe(true);
    expect(shown.some((t) => t.includes("Sometimes"))).toBe(false);
    expect(host.textContent).not.toContain(NOTE);

    // The right answer is still the one graded right.
    const right = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(CHECK.answer)) as HTMLButtonElement;
    await settle(() => right.click());
    await settle(() => key("Enter"));
    expect(graded).toEqual([2]);
  });

  it("keeps the notes' options and their line when the tutor cannot write them", async () => {
    const host = await mount([asking("a")]);
    await settle(() => asked[0].answer(503, { error: "No key", code: "MISSING_API_KEY" }));
    expect(host.textContent).not.toContain("The tutor is writing the options…");
    expect(choices(host).some((t) => t.includes("Sometimes"))).toBe(true);
    expect(host.textContent).toContain(NOTE);
  });

  it("keeps the notes' options when the tutor's were written for a check the note no longer asks", async () => {
    const host = await mount([asking("a")]);
    await settle(() => asked[0].answer(200, { options: TUTOR, question: "Does TCP retransmit?", answer: CHECK.answer }));
    expect(choices(host).some((t) => t.includes("Sometimes"))).toBe(true);
    expect(host.textContent).toContain(NOTE);
  });

  it("asks with the notes' options once the tutor has not answered in time", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const host = await mount([asking("a")]);
      expect(host.textContent).toContain("The tutor is writing the options…");
      await act(async () => {
        vi.advanceTimersByTime(OPTIONS_WAIT_MS);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(host.textContent).not.toContain("The tutor is writing the options…");
      expect(host.textContent).toContain(NOTE);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks nothing for a card without a rewrite", async () => {
    await mount([{ ...CHECK, wrong: "notes" }, RECALL]);
    expect(asked).toEqual([]);
  });
});
