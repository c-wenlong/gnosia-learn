// @vitest-environment jsdom
import { act, createElement, useEffect, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { emptyLearnerState, LEGACY_STORAGE_KEY } from "@gnosia/schema/shared";

/**
 * The one-time import of a browser's old localStorage document. A database
 * that could not be reached keeps the document for the next load; a document
 * the server refuses would be refused on every load, so it is moved aside,
 * still in the browser, and the banner says so once.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/theme-cookie", () => ({
  applyThemeToDocument: vi.fn(),
  followTheme: () => () => undefined,
  writeThemeCookie: vi.fn(),
}));

const { LearnerProvider, useLearner } = await import("./learner-context");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const held: { saveError: string | null } = { saveError: null };
function Probe() {
  const learner = useLearner();
  useEffect(() => {
    held.saveError = learner.saveError;
  });
  return null;
}

async function mount(status: number, body: Record<string, unknown>): Promise<ReturnType<typeof vi.fn>> {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  root = createRoot(document.createElement("div"));
  await act(async () => {
    root!.render(
      createElement(
        LearnerProvider,
        { initialState: emptyLearnerState(), reachable: true } as ComponentProps<typeof LearnerProvider>,
        createElement(Probe),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return fetch;
}

const DOCUMENT = JSON.stringify({ notes: { a: "a long note" } });

describe("the legacy import", () => {
  it("marks a refused document and says so, then does not post it on the next load", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, DOCUMENT);
    const first = await mount(400, { ok: false, error: "Body too large.", code: "BAD_REQUEST" });
    expect(first).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(DOCUMENT);
    expect(window.localStorage.getItem(`${LEGACY_STORAGE_KEY}:refused`)).not.toBeNull();
    await vi.waitFor(() => expect(held.saveError).toMatch(/could not be imported \(Body too large\.\)\. It is kept in this browser\./));

    act(() => root?.unmount());
    const second = await mount(400, { ok: false, error: "Body too large.", code: "BAD_REQUEST" });
    expect(second).not.toHaveBeenCalled();
  });

  it("still keeps the document when even the marker cannot be written", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, DOCUMENT);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    try {
      await mount(400, { ok: false, error: "Body too large.", code: "BAD_REQUEST" });
    } finally {
      setItem.mockRestore();
    }
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(DOCUMENT);
    await vi.waitFor(() => expect(held.saveError).toMatch(/could not be imported/));
  });

  it("keeps the document for the next load when the database could not be reached", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, DOCUMENT);
    await mount(503, { ok: false, error: "Not saved: the database is unreachable.", code: "STORE_UNAVAILABLE" });
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(DOCUMENT);
    expect(held.saveError).toBeNull();
  });
});
