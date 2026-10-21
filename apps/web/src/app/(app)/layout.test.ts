import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `(app)` layout fills in a missing motion cookie from the stored row,
 * and for "Always reduce motion" marks <html> with an inline script ahead of
 * the page, so the first page in a new browser does not paint moving.
 */

const env = vi.hoisted(() => ({ cookies: new Map<string, string>(), stored: null as string | null, asked: 0 }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (env.cookies.has(name) ? { value: env.cookies.get(name) } : undefined) }),
}));
vi.mock("@/lib/auth/session", () => ({ requireSignedIn: async () => undefined }));
vi.mock("@/lib/learner-store", () => ({
  loadLearnerSnapshot: async () => ({ state: { theme: "light" }, reachable: true }),
}));
vi.mock("@/lib/motion-preference", () => ({
  readStoredMotion: async () => {
    env.asked += 1;
    return env.stored;
  },
}));
vi.mock("@/lib/studio", () => ({ studioEnabled: () => false }));
vi.mock("@/lib/learner-context", () => ({ LearnerProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
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
});

describe("the (app) layout's motion seed", () => {
  it("marks <html> before the page, and seeds the cookie, for a stored Always in a new browser", async () => {
    env.stored = "always";
    const html = await render();
    expect(html.indexOf('dataset.motion="reduce"')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('dataset.motion="reduce"')).toBeLessThan(html.indexOf("page"));
    expect(html).toContain('data-seed="always"');
  });

  it("seeds a stored system without a script, and asks nothing once the cookie is there", async () => {
    env.stored = "system";
    let html = await render();
    expect(html).not.toContain("<script");
    expect(html).toContain('data-seed="system"');

    env.cookies.set("gnosia-motion", "always");
    html = await render();
    expect(env.asked).toBe(1);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("data-seed");
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
