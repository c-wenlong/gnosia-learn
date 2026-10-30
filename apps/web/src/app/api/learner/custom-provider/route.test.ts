import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { isCallable } from "@/lib/agent/providers";

import {
  migratedScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../../services/catalog/test/scratch-database";

/**
 * A provider the owner adds (docs/TUTOR-MODELS.md, T14), end to end against
 * a scratch database: made with its key in one request, refused whole when
 * its URL or key is bad, its key and models filed under its id, called by
 * the tutor at its own base URL with its own key only, renamed, and deleted
 * whole. `fetch` is stubbed; no answer carries the key.
 */

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

const reachable = await probe();
const ORIGIN = "http://localhost:3000";
const SECRET = "custom-provider-test-secret-at-least-thirty-two-chars";
const KEY = "gw-key-fedcba9876543210fedcba9876543210";
let ip = 0;

function request(url: string, method: string, body: unknown, origin: string | null = ORIGIN): Request {
  ip += 1;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    host: "localhost:3000",
    "x-forwarded-for": `10.9.0.${ip % 250}`,
  };
  if (origin !== null) headers.origin = origin;
  return new Request(`${ORIGIN}${url}`, { method, headers, body: JSON.stringify(body) });
}

describe.skipIf(!reachable.ok)("custom provider routes", () => {
  let scratch: Scratch;
  let route: typeof import("./route");
  let keys: typeof import("../provider-key/route");
  let chain: typeof import("../tutor-model/route");
  let providerRoute: typeof import("../tutor-model/provider/route");
  let models: typeof import("../tutor-model/models/route");
  let credentials: typeof import("@/lib/agent/credentials");
  const saved = { url: process.env.DATABASE_URL, secret: process.env.AUTH_SECRET };

  async function json(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    expect(text).not.toContain(KEY);
    return JSON.parse(text) as Record<string, unknown>;
  }

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    process.env.DATABASE_URL = scratch.url;
    process.env.AUTH_SECRET = SECRET;
    [route, keys, chain, providerRoute, models, credentials] = await Promise.all([
      import("./route"),
      import("../provider-key/route"),
      import("../tutor-model/route"),
      import("../tutor-model/provider/route"),
      import("../tutor-model/models/route"),
      import("@/lib/agent/credentials"),
    ]);
  }, 60_000);

  afterAll(async () => {
    if (saved.url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved.url;
    if (saved.secret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = saved.secret;
    await scratch?.drop();
  });

  beforeEach(async () => {
    process.env.AUTH_SECRET = SECRET;
    await scratch.pool.query("delete from tutor_model; delete from provider_key; delete from custom_provider");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes a provider with its key in one request, and refuses a bad URL, name or key storing nothing", async () => {
    for (const body of [
      { label: "Gateway", baseUrl: "http://gw.example/v1", key: KEY },
      { label: "", baseUrl: "https://gw.example/v1", key: KEY },
      { label: "Gateway", baseUrl: "https://gw.example/v1", key: "short" },
      { label: "Studio", baseUrl: "http://127.0.0.1:7250/v1", key: KEY },
      { label: "Itself", baseUrl: "http://localhost:3000/api", key: KEY },
    ]) {
      const response = await route.POST(request("/api/learner/custom-provider", "POST", body));
      expect(response.status, JSON.stringify(body).slice(0, 60)).toBe(400);
      await json(response);
    }
    expect((await scratch.pool.query("select 1 from custom_provider")).rowCount).toBe(0);
    expect((await scratch.pool.query("select 1 from provider_key")).rowCount).toBe(0);

    const made = await json(await route.POST(request("/api/learner/custom-provider", "POST", { label: "Gateway", baseUrl: "https://gw.example/v1/", key: KEY })));
    expect(made).toMatchObject({ ok: true, provider: { id: "custom-gateway", label: "Gateway", baseUrl: "https://gw.example/v1" } });
    expect((await scratch.pool.query("select provider, last4 from provider_key")).rows).toEqual([{ provider: "custom-gateway", last4: KEY.slice(-4) }]);
    expect((await route.POST(request("/api/learner/custom-provider", "POST", { label: "x", baseUrl: "https://gw.example", key: KEY }, "https://evil.example"))).status).toBe(403);
  });

  it("files a key only under a custom id the owner has", async () => {
    const response = await keys.POST(request("/api/learner/provider-key", "POST", { provider: "custom-nobody", key: KEY }));
    expect(response.status).toBe(404);
    expect((await scratch.pool.query("select 1 from provider_key")).rowCount).toBe(0);
  });

  it("refuses a custom provider's key pasted into a model field, as for a built-in's", async () => {
    // Shaped like a model id, so only the key comparison can catch it.
    const modelShaped = "gateway/llama-3-70b-instruct-q4";
    expect((await route.POST(request("/api/learner/custom-provider", "POST", { label: "Gateway", baseUrl: "https://gw.example/v1", key: modelShaped }))).status).toBe(200);
    const response = await chain.POST(request("/api/learner/tutor-model", "POST", { provider: "custom-gateway", model: modelShaped }));
    expect(response.status).toBe(400);
    const body = JSON.stringify(await json(response));
    expect(body).toContain("one of your API keys");
    expect(body).not.toContain(modelShaped);
    expect((await scratch.pool.query("select 1 from tutor_model")).rowCount).toBe(0);
  });

  it("calls a custom provider's models at its own base URL with its own key, and nothing else's", async () => {
    await route.POST(request("/api/learner/custom-provider", "POST", { label: "Gateway", baseUrl: "https://gw.example/v1", key: KEY }));
    expect((await chain.POST(request("/api/learner/tutor-model", "POST", { provider: "custom-gateway", model: "gw/fast" }))).status).toBe(200);

    const steps = await credentials.tutorCredentials("local", {});
    expect(steps.map((s) => (isCallable(s) ? [s.config.id, s.config.baseUrl, s.config.model, s.source] : s))).toEqual([
      ["custom-gateway", "https://gw.example/v1", "gw/fast", "saved"],
    ]);
    const step = steps[0];
    expect(step !== undefined && isCallable(step) && step.apiKey).toBe(KEY);

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "gw/fast" }, { id: "gw/slow" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const listed = await json(await models.POST(request("/api/learner/tutor-model/models", "POST", { provider: "custom-gateway" })));
    expect(listed).toMatchObject({ ok: true, models: [{ id: "gw/fast" }, { id: "gw/slow" }] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gw.example/v1/models");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });

  it("renames and moves a provider, keeping its key and models, and Delete removes it whole", async () => {
    await route.POST(request("/api/learner/custom-provider", "POST", { label: "Gateway", baseUrl: "https://gw.example/v1", key: KEY }));
    await chain.POST(request("/api/learner/tutor-model", "POST", { provider: "custom-gateway", model: "gw/fast" }));
    const changed = await json(
      await route.PATCH(request("/api/learner/custom-provider", "PATCH", { provider: "custom-gateway", label: "Work", baseUrl: "https://gw2.example/v1" })),
    );
    expect(changed).toMatchObject({ ok: true, provider: { id: "custom-gateway", label: "Work", baseUrl: "https://gw2.example/v1" } });
    expect((await route.PATCH(request("/api/learner/custom-provider", "PATCH", { provider: "custom-nobody", label: "x" }))).status).toBe(404);
    expect((await route.PATCH(request("/api/learner/custom-provider", "PATCH", { provider: "custom-gateway", baseUrl: "http://gw.example" }))).status).toBe(400);
    // A refused key leaves the name and URL alone; a good one lands with them in one write.
    expect((await route.PATCH(request("/api/learner/custom-provider", "PATCH", { provider: "custom-gateway", label: "Moved", key: "x" }))).status).toBe(400);
    expect((await scratch.pool.query("select label from custom_provider")).rows).toEqual([{ label: "Work" }]);
    const NEW_KEY = `${KEY.slice(0, -4)}zzzz`;
    const both = await json(await route.PATCH(request("/api/learner/custom-provider", "PATCH", { provider: "custom-gateway", label: "Moved", key: NEW_KEY })));
    expect(both).toMatchObject({ ok: true, provider: { label: "Moved" }, key: { provider: "custom-gateway", last4: "zzzz" } });
    expect(JSON.stringify(both)).not.toContain(NEW_KEY);

    const gone = await json(await providerRoute.DELETE(request("/api/learner/tutor-model/provider", "DELETE", { provider: "custom-gateway" })));
    expect(gone).toMatchObject({ ok: true, keyRemoved: true, chain: [] });
    for (const table of ["custom_provider", "provider_key", "tutor_model"]) {
      expect((await scratch.pool.query(`select 1 from ${table}`)).rowCount, table).toBe(0);
    }
  });
});
