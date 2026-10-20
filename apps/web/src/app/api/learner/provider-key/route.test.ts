import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";


import {
  migratedScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../../services/catalog/test/scratch-database";

/**
 * Bring your own key (docs/BYOK.md), end to end against a scratch database:
 * the save and remove routes, the Test route, the store behind them, the
 * tutor's resolution and the Settings card's data.
 *
 * What is held here and nowhere else: no answer from any of them carries the
 * key or its ciphertext; owner B never gets owner A's key, even with A's row
 * moved onto B in the database; a rotated AUTH_SECRET turns a key into
 * "missing, re-enter it" rather than a 500; and the server's key still
 * answers once the saved one is gone.
 */

const signedIn = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => signedIn.value,
}));

const reachable = await probe();

const ORIGIN = "http://localhost:3000";
const SECRET = "route-test-secret-at-least-thirty-two-characters-long";
const KEY = "sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef";
let ip = 0;

function request(method: "POST" | "DELETE", body: unknown, origin: string | null = ORIGIN): Request {
  ip += 1;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    host: "localhost:3000",
    "x-forwarded-for": `10.9.0.${ip}`,
  };
  if (origin !== null) headers.origin = origin;
  return new Request(`${ORIGIN}/api/learner/provider-key`, { method, headers, body: JSON.stringify(body) });
}

type Routes = typeof import("./route");
type TestRoute = typeof import("./test/route");
type Store = typeof import("@/lib/provider-keys/store");
type Credentials = typeof import("@/lib/agent/credentials");
type Settings = typeof import("@/lib/provider-keys/settings");

describe.skipIf(!reachable.ok)("provider key routes and store", () => {
  let scratch: Scratch;
  let routes: Routes;
  let testRoute: TestRoute;
  let store: Store;
  let credentials: Credentials;
  let settings: Settings;
  /**
   * Every provider's server-key variable. The suite's answers depend on none
   * being set — a developer shell carrying a real `GEMINI_API_KEY` would make
   * "no key anywhere" untestable, so all of them are stowed, not just the one
   * a test happens to name.
   */
  const PROVIDER_ENVS = ["NVIDIA_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY"] as const;
  const saved = {
    url: process.env.DATABASE_URL,
    secret: process.env.AUTH_SECRET,
    keys: PROVIDER_ENVS.map((name) => [name, process.env[name]] as const),
  };

  /** Every ciphertext in the table, in each form a response could carry it in. */
  async function storedForms(): Promise<string[]> {
    const { rows } = await scratch.pool.query<{ ciphertext: Buffer; iv: Buffer; auth_tag: Buffer }>(
      "select ciphertext, iv, auth_tag from provider_key",
    );
    return rows.flatMap((r) => [r.ciphertext, r.iv, r.auth_tag].flatMap((b) => [b.toString("hex"), b.toString("base64")]));
  }

  async function expectNoSecret(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(KEY.slice(9, 30));
    for (const form of await storedForms()) expect(text).not.toContain(form);
    return JSON.parse(text) as Record<string, unknown>;
  }

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    process.env.DATABASE_URL = scratch.url;
    process.env.AUTH_SECRET = SECRET;
    for (const name of PROVIDER_ENVS) delete process.env[name];
    [routes, testRoute, store, credentials, settings] = await Promise.all([
      import("./route"),
      import("./test/route"),
      import("@/lib/provider-keys/store"),
      import("@/lib/agent/credentials"),
      import("@/lib/provider-keys/settings"),
    ]);
  }, 60_000);

  afterAll(async () => {
    for (const [name, value] of [
      ["DATABASE_URL", saved.url],
      ["AUTH_SECRET", saved.secret],
      ...saved.keys,
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await scratch?.drop();
  });

  beforeEach(async () => {
    signedIn.value = true;
    process.env.AUTH_SECRET = SECRET;
    for (const name of PROVIDER_ENVS) delete process.env[name];
    await scratch.pool.query("delete from provider_key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves a key sealed, answers with its last four characters only, and opens it again on the server", async () => {
    const response = await routes.POST(request("POST", { provider: "openrouter", key: `  ${KEY}\n` }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await expectNoSecret(response);
    expect(body).toMatchObject({ ok: true, key: { provider: "openrouter", last4: KEY.slice(-4), readable: true } });

    const { rows } = await scratch.pool.query<{ owner_id: string; ciphertext: Buffer; last4: string; key_version: number }>(
      "select owner_id, ciphertext, last4, key_version from provider_key",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ owner_id: "local", last4: KEY.slice(-4), key_version: 1 });
    expect(rows[0]!.ciphertext.toString("utf8")).not.toContain(KEY.slice(0, 12));

    expect(await store.openSavedKeys("local")).toEqual({ openrouter: KEY });
    // A saved key alone gives the tutor nothing — the chain alone does (T15).
    expect(await credentials.tutorCredentials("local", {})).toEqual([]);
  });

  it("refuses a key of the wrong shape without repeating it, and stores nothing", async () => {
    for (const body of [
      { provider: "openrouter", key: "short" },
      { provider: "openrouter", key: `${KEY} ${KEY}` },
      { provider: "openrouter" },
      { provider: "not-a-provider", key: KEY },
    ]) {
      const response = await routes.POST(request("POST", body));
      expect(response.status).toBe(400);
      await expectNoSecret(response);
    }
    expect((await scratch.pool.query("select 1 from provider_key")).rowCount).toBe(0);
  });

  it("is the same-origin, signed-in owner's alone", async () => {
    const crossSite = await routes.POST(request("POST", { provider: "gemini", key: KEY }, "https://evil.example"));
    expect(crossSite.status).toBe(403);
    signedIn.value = false;
    expect((await routes.POST(request("POST", { provider: "gemini", key: KEY }))).status).toBe(401);
    expect((await routes.DELETE(request("DELETE", { provider: "gemini" }))).status).toBe(401);
    expect((await testRoute.POST(request("POST", { provider: "gemini" }))).status).toBe(401);
    expect((await scratch.pool.query("select 1 from provider_key")).rowCount).toBe(0);
  });

  it("removes a key, and says so only once", async () => {
    await routes.POST(request("POST", { provider: "gemini", key: KEY }));
    const first = await routes.DELETE(request("DELETE", { provider: "gemini" }));
    expect(await first.json()).toEqual({ ok: true, removed: true });
    const second = await routes.DELETE(request("DELETE", { provider: "gemini" }));
    expect(await second.json()).toEqual({ ok: true, removed: false });
    expect(await store.openSavedKeys("local")).toEqual({});
  });

  it("never hands owner B owner A's key, even with A's row moved onto B", async () => {
    await scratch.pool.query("insert into learner (id) values ('owner-b') on conflict do nothing");
    await store.saveProviderKey("local", "nvidia", KEY);
    expect(await store.openSavedKeys("owner-b")).toEqual({});
    expect(await store.savedKeyStatuses("owner-b")).toEqual([]);
    expect(await credentials.tutorCredentials("owner-b", {})).toEqual([]);

    // Someone with write access to the database alone moves the row.
    await scratch.pool.query("update provider_key set owner_id = 'owner-b' where owner_id = 'local'");
    expect(await store.openSavedKeys("owner-b")).toEqual({});
    expect(await store.savedKeyStatuses("owner-b")).toMatchObject([{ provider: "nvidia", readable: false }]);
    expect(await credentials.tutorCredentials("owner-b", {})).toEqual([]);
  });

  it("treats a key sealed under a rotated AUTH_SECRET as missing, asks for it again, and falls back to the server's", async () => {
    await routes.POST(request("POST", { provider: "openrouter", key: KEY }));
    process.env.AUTH_SECRET = `${SECRET}-rotated`;

    expect(await store.openSavedKeys("local")).toEqual({});
    expect(await store.savedKeyStatuses("local")).toMatchObject([{ provider: "openrouter", readable: false }]);
    const view = await settings.loadProviderKeys("local");
    expect(view.rows.find((r) => r.id === "openrouter")).toMatchObject({ saved: { readable: false }, inUse: null });

    // Rotated or not, a key by itself is not a model — nothing is callable (T15).
    expect(await credentials.tutorCredentials("local", { OPENROUTER_API_KEY: "server-openrouter-key-0123456789" })).toEqual([]);

    // Re-entering it under the new secret makes it the owner's again.
    await routes.POST(request("POST", { provider: "openrouter", key: KEY }));
    expect(await store.openSavedKeys("local")).toEqual({ openrouter: KEY });
  });

  it("tests the key with one call and reports the provider's refusal with the key taken out", async () => {
    await routes.POST(request("POST", { provider: "openrouter", key: KEY }));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: `No auth credentials found for ${KEY} (sk-or-v1-0123...cdef)`, code: 401 } }), {
        status: 401,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await testRoute.POST(request("POST", { provider: "openrouter" }));
    expect(response.status).toBe(200);
    const body = await expectNoSecret(response);
    expect(body).toMatchObject({ ok: false, provider: "openrouter", source: "saved", status: 401 });
    expect(String(body.message)).toContain("No auth credentials found");
    expect(String(body.message)).toContain("[redacted]");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(new Response(JSON.stringify({ model: "openrouter/free-model" }), { status: 200 }));
    const ok = await testRoute.POST(request("POST", { provider: "openrouter" }));
    expect(await expectNoSecret(ok)).toEqual({
      ok: true,
      provider: "openrouter",
      source: "saved",
      model: "openrouter/free-model",
      tested: "openrouter/free",
    });
  });

  it("says there is nothing to test when neither the owner nor the server has a key", async () => {
    const response = await testRoute.POST(request("POST", { provider: "gemini" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "NO_KEY" });
  });

  it("hands the Settings card the last four characters and a date, never the key or its ciphertext", async () => {
    await routes.POST(request("POST", { provider: "gemini", key: KEY }));
    const view = await settings.loadProviderKeys("local");
    const text = JSON.stringify(view);
    expect(text).not.toContain(KEY);
    for (const form of await storedForms()) expect(text).not.toContain(form);
    expect(view.rows.find((r) => r.id === "gemini")).toMatchObject({
      saved: { last4: KEY.slice(-4), readable: true },
      inUse: "saved",
    });
    expect(view.order[0]).toMatchObject({ id: "gemini", source: "saved" });
  });
});
