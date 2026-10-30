import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/settings` with the studio on: how long every tab waits on the studio
 * runner's BYOK answer, and what the Model selection card is handed.
 *
 * The page is an async server component, awaited into an element tree and
 * rendered to static markup. The reads are mocked, and the cards are stood
 * in for, so a test reads only what the page handed the Model selection card.
 */
const studioApi = vi.hoisted(() => vi.fn());
const modelSelection = vi.hoisted(() => vi.fn());

vi.mock("@/lib/studio", () => ({ studioEnabled: () => true, studioApi }));
vi.mock("@/lib/owner", () => ({ currentOwner: async () => "local" }));
vi.mock("@/lib/settings", () => ({ loadSettings: async () => ({ tutorStyle: "socratic" }) }));
vi.mock("@/data/courses", () => ({ getCourses: async () => [], getAllTopicIds: () => [] }));
vi.mock("@/lib/provider-keys/settings", () => ({ loadProviderKeys: async () => ({ rows: [] }) }));
vi.mock("@/lib/tutor-models/settings", () => ({ loadTutorModels: async () => ({ chain: [], reachable: true }) }));
vi.mock("@/lib/providers/view", () => ({ providersView: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/components/settings/SettingsTabs", () => ({
  SettingsTabs: ({ sections }: { sections: Array<{ id: string; content: ReactNode }> }) =>
    createElement("div", null, ...sections.map((section) => createElement("section", { key: section.id }, section.content))),
}));
vi.mock("@/components/settings/ModelSelection", () => ({
  ModelSelection: (props: { byok?: unknown }) => {
    modelSelection(props);
    return null;
  },
}));
vi.mock("@/components/settings/Providers", () => ({ Providers: () => null }));
vi.mock("@/components/settings/ShortcutsCard", () => ({ ShortcutsCard: () => null }));
vi.mock("@/components/settings/SettingsForm", () => ({
  DataSettings: () => null,
  GeneralSettings: () => null,
  ProfileSettings: () => null,
}));

const { default: SettingsPage } = await import("./page");

beforeEach(() => {
  vi.useFakeTimers();
  studioApi.mockReset();
  modelSelection.mockReset();
});
afterEach(() => vi.useRealTimers());

/** The page, awaited and drawn, with what the Model selection card was handed. */
async function draw(page: Promise<ReactNode>) {
  renderToStaticMarkup(createElement("div", null, await page));
  return modelSelection.mock.calls.at(-1)?.[0] as { byok?: unknown };
}

describe("Settings and the studio runner", () => {
  it("draws after a second without the runner's answer, leaving a slow runner to the card", async () => {
    let signal: AbortSignal | undefined;
    // A runner that took the connection and has not answered.
    studioApi.mockImplementation((_path: string, init: { signal?: AbortSignal }) => {
      signal = init.signal;
      return new Promise((resolve) => {
        init.signal?.addEventListener("abort", () =>
          resolve({ ok: false, reason: "down", status: null, undelivered: false, headline: "", detail: "" }),
        );
      });
    });
    let done = false;
    const page = SettingsPage().then((tree) => {
      done = true;
      return tree;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    // Undefined, so the card asks for itself; not `down`, which it would show as such.
    expect((await draw(page)).byok).toBeUndefined();
    expect(signal?.aborted).toBe(true);
  });

  it("hands the card an answer that came in time", async () => {
    const data = { provider: "anthropic" };
    studioApi.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, data }), 200)),
    );
    const page = SettingsPage();
    await vi.advanceTimersByTimeAsync(200);
    expect((await draw(page)).byok).toEqual({ state: "up", data });
  });

  it("hands the card a runner that is down", async () => {
    studioApi.mockResolvedValue({ ok: false, reason: "down", status: null, undelivered: true, headline: "", detail: "" });
    const page = SettingsPage();
    await vi.advanceTimersByTimeAsync(0);
    expect((await draw(page)).byok).toEqual({ state: "down" });
  });
});
