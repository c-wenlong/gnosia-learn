import { readdirSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * D11's gate, by behaviour: with `STUDIO_ENABLED` unset, which is what
 * production looks like, every entry point under app/(app)/studio answers 404
 * before it asks the runner, the owner or the network anything. The lint rule
 * `gnosia/studio-gate` holds each exported function to calling
 * `requireStudio()` first; this calls each one and watches what it reaches.
 */

const mocks = vi.hoisted(() => ({
  studioApi: vi.fn(),
  currentOwner: vi.fn(async () => "kai"),
  fetch: vi.fn(),
}));

vi.mock("@/lib/studio", async (original) => ({ ...(await original<typeof import("@/lib/studio")>()), studioApi: mocks.studioApi }));
vi.mock("@/lib/owner", async (original) => ({ ...(await original<typeof import("@/lib/owner")>()), currentOwner: mocks.currentOwner }));

const STUDIO_DIR = import.meta.dirname;
const ENTRY = /^(page|layout|route|default|template)\.tsx?$|^actions\.ts$/;

function entryPoints(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entryPoints(full);
    return ENTRY.test(entry.name) ? [path.relative(STUDIO_DIR, full)] : [];
  });
}

/** Arguments that would carry a call past the gate if it were missing: a page's props, a request, a form. */
function argumentsFor(name: string): unknown[] {
  const params = Promise.resolve({ name: "tcp-handshake", draft: "d-1", segments: ["health"] });
  if (/^(GET|POST|PUT|DELETE|PATCH)$/.test(name)) return [new Request("http://127.0.0.1/studio/api/health", { method: name === "GET" ? "GET" : "POST" }), { params }];
  if (name === "default" || name === "generateMetadata") return [{ params, searchParams: Promise.resolve({}), children: null }];
  return [new FormData()];
}

const saved = process.env.STUDIO_ENABLED;
beforeEach(() => {
  delete process.env.STUDIO_ENABLED;
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  if (saved === undefined) delete process.env.STUDIO_ENABLED;
  else process.env.STUDIO_ENABLED = saved;
  vi.unstubAllGlobals();
});

describe("every studio entry point with the studio off", () => {
  const files = entryPoints(STUDIO_DIR);

  it("finds the routes at all, so a broken walk cannot pass by finding nothing", () => {
    expect(files).toEqual(expect.arrayContaining(["page.tsx", "layout.tsx", "actions.ts", path.join("api", "[...segments]", "route.ts")]));
  });

  it.each(files)("%s is a 404 before it reaches anything", async (file) => {
    const loaded = (await import(/* @vite-ignore */ path.join(STUDIO_DIR, file))) as Record<string, unknown>;
    const entries = Object.entries(loaded).filter((entry): entry is [string, (...args: unknown[]) => unknown] => typeof entry[1] === "function");
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, call] of entries) {
      await expect(Promise.resolve().then(() => call(...argumentsFor(name))), `${file} ${name}`).rejects.toMatchObject({
        digest: expect.stringMatching(/;404$/),
      });
    }
    expect(mocks.studioApi).not.toHaveBeenCalled();
    expect(mocks.currentOwner).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
