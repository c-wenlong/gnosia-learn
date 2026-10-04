import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { isCallable } from "@/lib/agent/providers";

import {
  migratedScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../../services/catalog/test/scratch-database";

/**
 * The model chain's routes (docs/TUTOR-MODELS.md), end to end against a
 * scratch database: add, remove, move, Test and the model list, the store
 * behind them and the tutor's resolution.
 *
 * Held here: every route has the provider-key routes' guards; owner B never
 * sees owner A's chain; an entry's Test calls exactly that entry and redacts
 * the provider's words; the model list goes only to the provider's configured
 * base URL; and no answer carries a key. `fetch` is stubbed throughout.
 */

const signedIn = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => signedIn.value,
}));

const reachable = await probe();

const ORIGIN = "http://localhost:3000";
const SECRET = "tutor-model-test-secret-at-least-thirty-two-characters";
const KEY = "sk-or-v1-fedcba9876543210fedcba9876543210fedcba9876543210";
const SERVER_NVIDIA = "nvapi-ServerKeyExample0123456789abcdef";
let ip = 0;

function request(
  path: "" | "/test" | "/models",
  method: "POST" | "DELETE" | "PATCH",
  body: unknown,
  options: { origin?: string | null; ip?: string } = {},
): Request {
  ip += 1;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    host: "localhost:3000",
    "x-forwarded-for": options.ip ?? `10.8.0.${ip % 250}`,
  };
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin !== null) headers.origin = origin;
  return new Request(`${ORIGIN}/api/learner/tutor-model${path}`, { method, headers, body: JSON.stringify(body) });
}

type Routes = typeof import("./route");
type TestRoute = typeof import("./test/route");
type ModelsRoute = typeof import("./models/route");
type KeyRoutes = typeof import("../provider-key/route");
type Store = typeof import("@/lib/tutor-models/store");
type Credentials = typeof import("@/lib/agent/credentials");
type Cache = typeof import("@/lib/tutor-models/model-list");

describe.skipIf(!reachable.ok)("tutor model routes", () => {
  let scratch: Scratch;
  let routes: Routes;
  let testRoute: TestRoute;
  let modelsRoute: ModelsRoute;
  let keyRoutes: KeyRoutes;
  let store: Store;
  let credentials: Credentials;
  let cache: Cache;
  const saved = {
    url: process.env.DATABASE_URL,
    secret: process.env.AUTH_SECRET,
    nvidia: process.env.NVIDIA_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  };

  async function json(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(KEY.slice(9, 30));
    expect(text).not.toContain(SERVER_NVIDIA);
    return JSON.parse(text) as Record<string, unknown>;
  }

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    process.env.DATABASE_URL = scratch.url;
    process.env.AUTH_SECRET = SECRET;
    [routes, testRoute, modelsRoute, keyRoutes, store, credentials, cache] = await Promise.all([
      import("./route"),
      import("./test/route"),
      import("./models/route"),
      import("../provider-key/route"),
      import("@/lib/tutor-models/store"),
      import("@/lib/agent/credentials"),
      import("@/lib/tutor-models/model-list"),
    ]);
  }, 60_000);

  afterAll(async () => {
    for (const [name, value] of [
      ["DATABASE_URL", saved.url],
      ["AUTH_SECRET", saved.secret],
      ["NVIDIA_API_KEY", saved.nvidia],
      ["GEMINI_API_KEY", saved.gemini],
      ["OPENROUTER_API_KEY", saved.openrouter],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await scratch?.drop();
  });

  beforeEach(async () => {
    signedIn.value = true;
    process.env.AUTH_SECRET = SECRET;
    process.env.NVIDIA_API_KEY = SERVER_NVIDIA;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    cache.clearModelListCache();
    await scratch.pool.query("delete from tutor_model");
    await scratch.pool.query("delete from provider_key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds, moves and removes, answering with the whole chain and keeping its positions contiguous", async () => {
    await keyRoutes.POST(
      new Request(`${ORIGIN}/api/learner/provider-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "localhost:3000", origin: ORIGIN, "x-forwarded-for": "10.7.0.1" },
        body: JSON.stringify({ provider: "openrouter", key: KEY }),
      }),
    );
    for (const [provider, model] of [
      ["nvidia", "a/one"],
      ["openrouter", "b/two:free"],
      ["nvidia", "c/three"],
    ]) {
      const response = await routes.POST(request("", "POST", { provider, model }));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    const moved = await json(await routes.PATCH(request("", "PATCH", { provider: "nvidia", model: "c/three", direction: "up" })));
    expect(moved.chain).toEqual([
      { provider: "nvidia", model: "a/one" },
      { provider: "nvidia", model: "c/three" },
      { provider: "openrouter", model: "b/two:free" },
    ]);
    const removed = await json(await routes.DELETE(request("", "DELETE", { provider: "nvidia", model: "a/one" })));
    expect(removed.chain).toEqual([
      { provider: "nvidia", model: "c/three" },
      { provider: "openrouter", model: "b/two:free" },
    ]);
    const { rows } = await scratch.pool.query<{ position: number }>("select position from tutor_model order by position");
    expect(rows.map((r) => r.position)).toEqual([0, 1]);

    const steps = await credentials.tutorCredentials("local");
    expect(steps.map((s) => (isCallable(s) ? [s.config.id, s.config.model, s.source] : s))).toEqual([
      ["nvidia", "c/three", "server"],
      ["openrouter", "b/two:free", "saved"],
    ]);
  });

  it("refuses a bad body, a duplicate, a missing entry and a provider with no key, by code and without echoing", async () => {
    const cases: [Request, number, string][] = [
      [request("", "POST", { provider: "openai", model: "x" }), 400, "BAD_REQUEST"],
      [request("", "POST", { provider: "nvidia", model: "has space" }), 400, "BAD_REQUEST"],
      [request("", "POST", { provider: "nvidia", model: "x".repeat(201) }), 400, "BAD_REQUEST"],
      [request("", "POST", { provider: "gemini", model: "gemini-2.5-flash" }), 400, "NO_KEY"],
      [request("", "PATCH", { provider: "nvidia", model: "a", direction: "sideways" }), 400, "BAD_REQUEST"],
      [request("", "DELETE", { provider: "nvidia", model: "not-there" }), 404, "NOT_FOUND"],
      [request("", "PATCH", { provider: "nvidia", model: "not-there", direction: "up" }), 404, "NOT_FOUND"],
    ];
    for (const [req, status, code] of cases) {
      const method = req.method as "POST" | "DELETE" | "PATCH";
      const response = await routes[method](req);
      expect(response.status, `${method} ${code}`).toBe(status);
      const body = await json(response);
      expect(body.code).toBe(code);
      expect(String(body.error)).not.toContain("x".repeat(40));
    }
    await routes.POST(request("", "POST", { provider: "nvidia", model: "a" }));
    const twice = await routes.POST(request("", "POST", { provider: "nvidia", model: "a" }));
    expect(twice.status).toBe(409);
    expect((await twice.json()).code).toBe("DUPLICATE");
  });

  it("refuses a model id that is, holds or is part of one of the owner's keys, and never repeats it", async () => {
    // A key with no key-like shape, so only the comparison with the stored key can catch it.
    const plain = "my-own-gateway-token-for-gemini";
    await store.addChainEntry("local", "nvidia", "a/one");
    const { saveProviderKey } = await import("@/lib/provider-keys/store");
    await saveProviderKey("local", "gemini", plain);
    for (const model of [plain, `prefix/${plain}`, plain.slice(3, 20), SERVER_NVIDIA, KEY]) {
      const response = await routes.POST(request("", "POST", { provider: "nvidia", model }));
      expect(response.status, model).toBe(400);
      const text = await response.text();
      expect(text).not.toContain(model);
      expect(text).toMatch(/API key/);
    }
    expect(await store.readChain("local")).toEqual([{ provider: "nvidia", model: "a/one" }]);
  });

  it("has the provider-key routes' guards: same origin, a session, and a rate limit", async () => {
    const body = { provider: "nvidia", model: "a" };
    expect((await routes.POST(request("", "POST", body, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await routes.POST(request("", "POST", body, { origin: null }))).status).toBe(403);
    expect((await testRoute.POST(request("/test", "POST", body, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await modelsRoute.POST(request("/models", "POST", { provider: "nvidia" }, { origin: "https://evil.example" }))).status).toBe(403);

    signedIn.value = false;
    expect((await routes.POST(request("", "POST", body))).status).toBe(401);
    expect((await routes.DELETE(request("", "DELETE", body))).status).toBe(401);
    expect((await routes.PATCH(request("", "PATCH", { ...body, direction: "up" }))).status).toBe(401);
    expect((await testRoute.POST(request("/test", "POST", body))).status).toBe(401);
    expect((await modelsRoute.POST(request("/models", "POST", { provider: "nvidia" }))).status).toBe(401);
    expect((await scratch.pool.query("select 1 from tutor_model")).rowCount).toBe(0);

    signedIn.value = true;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      statuses.push((await testRoute.POST(request("/test", "POST", body, { ip: "10.6.6.6" }))).status);
    }
    expect(statuses.slice(-1)).toEqual([429]);
  });

  it("keeps owner B off owner A's chain: B reads none of it, and B's tutor uses the defaults", async () => {
    await scratch.pool.query("insert into learner (id) values ('owner-b') on conflict do nothing");
    await store.addChainEntry("local", "nvidia", "a/one");
    expect(await store.readChain("owner-b")).toEqual([]);
    await expect(store.removeChainEntry("owner-b", "nvidia", "a/one")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const steps = await credentials.tutorCredentials("owner-b");
    expect(steps.map((s) => (isCallable(s) ? [s.config.id, s.config.model] : s))).toEqual([["nvidia", "google/gemma-4-31b-it"]]);
    expect(await store.readChain("local")).toEqual([{ provider: "nvidia", model: "a/one" }]);
  });

  it("keeps an entry whose key went away, skipped, and says so in the tutor's attempts", async () => {
    await routes.POST(request("", "POST", { provider: "nvidia", model: "a/one" }));
    delete process.env.NVIDIA_API_KEY;
    const steps = await credentials.tutorCredentials("local");
    expect(steps).toEqual([{ skipped: true, provider: "nvidia", model: "a/one", reason: "no key for NVIDIA NIM", keyed: [] }]);
    // Nothing to test it with, and nothing to list.
    const tested = await testRoute.POST(request("/test", "POST", { provider: "nvidia", model: "a/one" }));
    expect(tested.status).toBe(400);
    expect((await tested.json()).code).toBe("NO_KEY");
  });

  it("tests exactly that entry with one call and redacts the provider's words", async () => {
    await routes.POST(request("", "POST", { provider: "nvidia", model: "a/one" }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: `Model a/one refused for ${SERVER_NVIDIA}` }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ model: "a/one-served" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const refused = await json(await testRoute.POST(request("/test", "POST", { provider: "nvidia", model: "a/one" })));
    expect(refused).toMatchObject({ ok: false, provider: "nvidia", model: "a/one", source: "server", status: 404 });
    expect(String(refused.message)).toBe("Model a/one refused for [redacted]");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "a/one", max_tokens: 1 });

    const worked = await json(await testRoute.POST(request("/test", "POST", { provider: "nvidia", model: "a/one" })));
    expect(worked).toEqual({ ok: true, provider: "nvidia", model: "a/one", source: "server", served: "a/one-served" });

    // Only an entry in the chain: no request spent on an id a caller names.
    fetchMock.mockClear();
    const other = await testRoute.POST(request("/test", "POST", { provider: "nvidia", model: "something/else" }));
    expect(other.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists a provider's models from its configured base URL alone, cached, with the key kept on the server", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify({ data: [{ id: "z/two" }, { id: "a/one" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = { provider: "nvidia", url: "https://evil.example/steal", baseUrl: "https://evil.example" };
    const first = await json(await modelsRoute.POST(request("/models", "POST", body)));
    expect(first).toEqual({ ok: true, provider: "nvidia", models: [{ id: "a/one" }, { id: "z/two" }], cached: false });
    const second = await json(await modelsRoute.POST(request("/models", "POST", body)));
    expect(second.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://integrate.api.nvidia.com/v1/models");

    fetchMock.mockImplementation(async () => new Response(`denied ${SERVER_NVIDIA}`, { status: 403 }));
    cache.clearModelListCache();
    const refused = await json(await modelsRoute.POST(request("/models", "POST", { provider: "nvidia" })));
    expect(refused).toEqual({ ok: false, provider: "nvidia", status: 403, message: "denied [redacted]" });

    const none = await modelsRoute.POST(request("/models", "POST", { provider: "gemini" }));
    expect(none.status).toBe(400);
    expect((await none.json()).code).toBe("NO_KEY");
  });
});
