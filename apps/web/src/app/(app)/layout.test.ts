import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `(app)` layout brings the motion cookie in line with the stored row,
 * and for "Always reduce motion" the cookie does not know of yet marks
 * <html> with an inline script ahead of the page, so the page does not paint
 * moving. The stored theme wins over the cookie whenever the database
 * answered. With a studio, it looks at the runner's port.
 */

const env = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  stored: null as string | null,
  asked: 0,
  nonce: null as string | null,
  theme: "light",
  reachable: true,
  studio: false,
  runner: false,
  looked: 0,
  signedIn: true,
  /** Every check and read the layout made, in order. */
  calls: [] as string[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (env.cookies.has(name) ? { value: env.cookies.get(name) } : undefined) }),
  headers: async () => new Headers(env.nonce === null ? {} : { "x-nonce": env.nonce }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSignedIn: async () => {
    env.calls.push("auth");
    // As `redirect()` does: it throws, and nothing after it runs.
    if (!env.signedIn) throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/learner-store", () => ({
  loadLearnerSnapshot: async () => {
    env.calls.push("snapshot");
    return { state: { theme: env.theme }, reachable: env.reachable };
  },
}));
vi.mock("@/lib/motion-preference", () => ({
  readStoredMotion: async () => {
    env.calls.push("motion");
    env.asked += 1;
    return env.stored;
  },
}));
vi.mock("@/lib/studio", () => ({ studioEnabled: () => env.studio }));
vi.mock("@/lib/studio-runner", () => ({
  runnerListening: async () => {
    env.calls.push("runner");
    env.looked += 1;
    return env.runner;
  },
}));
vi.mock("@/lib/learner-context", () => ({
  LearnerProvider: ({ initialState, children }: { initialState: { theme: string }; children: ReactNode }) =>
    createElement("div", { "data-theme": initialState.theme }, children),
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ studio, runner, children }: { studio: boolean; runner: boolean; children: ReactNode }) =>
    createElement("section", { "data-studio": String(studio), "data-runner": String(runner) }, children),
}));
vi.mock("@/components/settings/MotionSeed", () => ({
  MotionSeed: ({ mode }: { mode: string }) => createElement("i", { "data-seed": mode }),
}));

const { default: AppLayout } = await import("./layout");

async function render(): Promise<string> {
  return renderToStaticMarkup(await AppLayout({ children: createElement("p", null, "page") }));
}

beforeEach(() => {
  env.cookies.clear();
  env.stored = null;
  env.asked = 0;
  env.nonce = null;
  env.theme = "light";
  env.reachable = true;
  env.studio = false;
  env.runner = false;
  env.looked = 0;
  env.signedIn = true;
  env.calls = [];
});

describe("the (app) layout's sign-in check", () => {
  it("checks the session before it reads anything", async () => {
    env.studio = true;
    await render();
    expect(env.calls[0]).toBe("auth");
    expect(env.calls.slice(1).sort()).toEqual(["motion", "runner", "snapshot"]);
  });

  it("reads nothing when the check sends the visitor to sign in", async () => {
    env.studio = true;
    env.signedIn = false;
    await expect(render()).rejects.toThrow("NEXT_REDIRECT");
    expect(env.calls).toEqual(["auth"]);
  });
});

describe("the (app) layout's motion seed", () => {
  it("marks <html> before the page, and seeds the cookie, for a stored Always in a new browser", async () => {
    env.stored = "always";
    const html = await render();
    expect(html.indexOf('dataset.motion="reduce"')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('dataset.motion="reduce"')).toBeLessThan(html.indexOf("page"));
    expect(html).toContain('data-seed="always"');
  });

  it("stamps the request's CSP nonce on the motion script, so the page policy lets it run", async () => {
    env.stored = "always";
    env.nonce = "abc123";
    expect(await render()).toMatch(/<script nonce="abc123">[^<]*dataset\.motion="reduce"/);
  });

  it("seeds a stored system without a script", async () => {
    env.stored = "system";
    const html = await render();
    expect(html).not.toContain("<script");
    expect(html).toContain('data-seed="system"');
  });

  it("brings a cookie that disagrees in line with the row, on every page", async () => {
    env.stored = "system";
    env.cookies.set("gnosia-motion", "always");
    let html = await render();
    expect(html).not.toContain("<script");
    expect(html).toContain('data-seed="system"');

    env.stored = "always";
    env.cookies.set("gnosia-motion", "always");
    html = await render();
    // The root layout has already marked <html> from the cookie.
    expect(html).not.toContain("<script");
    expect(html).toContain('data-seed="always"');
    expect(env.asked).toBe(2);
  });

  it("keeps the no-JavaScript notice beside the seed", async () => {
    env.stored = "always";
    const html = await render();
    expect(html).toContain("<noscript>");
    expect(html).toContain("Gnosia needs JavaScript");
  });

  it("writes nothing when the row could not be read", async () => {
    const html = await render();
    expect(html).not.toContain("data-seed");
    expect(html).not.toContain("<script");
  });
});

describe("the (app) layout's theme", () => {
  it("takes the stored theme over the cookie when the database answered", async () => {
    env.theme = "gnosia-dark";
    env.cookies.set("gnosia-theme", "light");
    expect(await render()).toContain('data-theme="gnosia-dark"');
  });

  it("keeps the cookie's theme when the database did not answer", async () => {
    env.reachable = false;
    env.cookies.set("gnosia-theme", "dark");
    expect(await render()).toContain('data-theme="dark"');
  });
});

describe("the (app) layout's look at the runner", () => {
  it("tells the shell whether the runner is listening, with a studio", async () => {
    env.studio = true;
    expect(await render()).toContain('data-runner="false"');
    env.runner = true;
    expect(await render()).toContain('data-runner="true"');
  });

  it("does not look without a studio", async () => {
    env.runner = true;
    expect(await render()).toContain('data-runner="false"');
    expect(env.looked).toBe(0);
  });
});
