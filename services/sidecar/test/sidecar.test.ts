import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { readProviderKeys, type CatalogDatabase } from "@self-learn/catalog/state";
import type { TutorDeps } from "@self-learn/tutor/server/deps";
import { openSavedKeys } from "@self-learn/tutor/server/provider-keys";
import { migratedScratchDatabase, probe, type Scratch } from "../../catalog/test/scratch-database";

import { createApi } from "../src/api";
import { guard } from "../src/guard";

/**
 * The sidecar's transport contract: the loopback guard, the routes, the JSON
 * envelope and the no-key degradation. The deps are stubbed — a rejecting
 * database and an empty env — because what is under test is this service's
 * own behavior, and the tutor core has its own suite.
 */

function stubDeps(env: Record<string, string | undefined> = {}): TutorDeps {
  // A database that never answers: every read degrades on its own terms,
  // which is exactly the no-key path these tests exercise.
  const db = Promise.reject<CatalogDatabase>(new Error("stub: no database"));
  // The turn functions catch the rejection per read; attach a swallow so the
  // driver does not report it unhandled before one does.
  db.catch(() => {});
  return {
    db,
    owner: "local",
    scope: { owner: "local", readable: ["local", "commons"] },
    source: {
      resolution: async () => ({}),
      courses: async () => {
        throw new Error("no courses in the stub");
      },
    } as unknown as TutorDeps["source"],
    blobStore: {} as TutorDeps["blobStore"],
    env,
  };
}

let server: Server;
let base: string;

beforeAll(async () => {
  server = createApi(stubDeps({}));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Any method against the stub-deps server; a body travels as JSON, as the guard wants. */
async function call(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: method === "GET" || method === "HEAD" ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("the loopback guard", () => {
  it("answers health", async () => {
    const response = await fetch(`${base}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, service: "gnosia-sidecar", owner: "local" });
  });

  it("refuses a Host that is not this socket", () => {
    // `fetch` will not send a forged Host, so the check is exercised on the
    // guard itself: the request object only needs the fields it reads.
    const fake = {
      method: "GET",
      headers: { host: "evil.example:1" },
      socket: { localPort: 9 },
    };
    expect(guard(fake as Parameters<typeof guard>[0])).toMatch(/DNS/);
    const own = {
      method: "GET",
      headers: { host: "127.0.0.1:9" },
      socket: { localPort: 9 },
    };
    expect(guard(own as Parameters<typeof guard>[0])).toBeNull();
  });

  it("refuses a non-JSON body on POST", async () => {
    const response = await fetch(`${base}/api/agent/chat`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    expect(response.status).toBe(403);
  });

  it("refuses a foreign Origin", async () => {
    const response = await post("/api/health", null, { origin: "https://evil.example" });
    expect(response.status).toBe(403);
  });
});

describe("the turn routes", () => {
  it("404s an unknown path", async () => {
    const response = await post("/api/agent/nope", {});
    expect(response.status).toBe(404);
  });

  it("400s a body that is not JSON", async () => {
    const response = await fetch(`${base}/api/agent/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{nope",
    });
    expect(response.status).toBe(400);
  });

  it("400s a chat body without messages", async () => {
    const response = await post("/api/agent/chat", { conceptSlug: "x" });
    expect(response.status).toBe(400);
  });

  it("answers MISSING_API_KEY with no keys configured, not a crash", async () => {
    const response = await post("/api/agent/chat", {
      subject: "linear algebra",
      messages: [{ role: "user", content: "teach me" }],
    });
    expect(response.status).toBe(503);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("MISSING_API_KEY");
  }, 30_000);
});

/**
 * The learner write routes against the stub deps (the database never
 * answers): every refusal the routes can give without reaching a row. The
 * happy paths are in the scratch-database suite below.
 */
describe("the learner write routes, database down", () => {
  const KEY = "nvapi-test0123456789abcdef0123456789";

  it("400s a provider-key save for a provider id that is none", async () => {
    const response = await call("/api/learner/provider-key", "POST", { provider: "bogus", key: KEY });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });

  it("400s a key of the wrong shape", async () => {
    const response = await call("/api/learner/provider-key", "POST", { provider: "nvidia", key: "short" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });

  it("503s a save NO_SECRET when the process has no AUTH_SECRET", async () => {
    const kept = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      const response = await call("/api/learner/provider-key", "POST", { provider: "nvidia", key: KEY });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ ok: false, code: "NO_SECRET" });
    } finally {
      if (kept !== undefined) process.env.AUTH_SECRET = kept;
    }
  });

  it("503s a save STORE_UNAVAILABLE when the store is unreachable", async () => {
    const kept = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "sidecar-test-secret-at-least-thirty-two-chars";
    try {
      const response = await call("/api/learner/provider-key", "POST", { provider: "nvidia", key: KEY });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ ok: false, code: "STORE_UNAVAILABLE" });
    } finally {
      if (kept === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = kept;
    }
  });

  it("503s a key removal STORE_UNAVAILABLE", async () => {
    const response = await call("/api/learner/provider-key", "DELETE", { provider: "nvidia" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, code: "STORE_UNAVAILABLE" });
  });

  it("503s a chain add STORE_UNAVAILABLE when the saved keys cannot be read", async () => {
    const response = await call("/api/learner/tutor-model", "POST", { provider: "nvidia", model: "google/gemma-4-31b-it" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, code: "STORE_UNAVAILABLE" });
  });

  it("503s chain remove and 400s a move without a direction", async () => {
    const gone = await call("/api/learner/tutor-model", "DELETE", { provider: "nvidia", model: "m" });
    expect(gone.status).toBe(503);
    const moved = await call("/api/learner/tutor-model", "PATCH", { provider: "nvidia", model: "m", direction: "left" });
    expect(moved.status).toBe(400);
    expect(await moved.json()).toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });

  it("405s a method the path does not have and 404s an unknown path", async () => {
    expect((await call("/api/agent/chat", "GET")).status).toBe(405);
    expect((await call("/api/learner/provider-key", "PUT", { provider: "nvidia" })).status).toBe(405);
    expect((await call("/api/learner/nope", "GET")).status).toBe(404);
  });

  it("answers GET /api/learner/provider-key with the providers and reachable:false", async () => {
    const response = await call("/api/learner/provider-key", "GET");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      reachable: boolean;
      rows: { id: string; saved: unknown; server: boolean; inUse: unknown }[];
    };
    expect(body.ok).toBe(true);
    expect(body.reachable).toBe(false);
    expect(body.rows.map((row) => row.id)).toContain("nvidia");
    expect(body.rows.length).toBeGreaterThanOrEqual(14);
    expect(body.rows.every((row) => row.saved === null && !row.server && row.inUse === null)).toBe(true);
  });

  it("answers GET /api/learner/tutor-model reachable:false with an empty chain", async () => {
    const response = await call("/api/learner/tutor-model", "GET");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, reachable: false, chain: [] });
  });
});

/**
 * The same routes end to end against a migrated scratch database — the web
 * contract verbatim: saves and removals, the chain's add/set/move/remove,
 * the provider-block move and delete, and the sealed row decrypting through
 * `openSavedKeys`, which is what the web reads. Skipped without a Postgres,
 * like the catalog suites it borrows `migratedScratchDatabase` from.
 */
const reachable = await probe();

describe.skipIf(!reachable.ok)("the learner write routes, against a scratch database", () => {
  const SECRET = "sidecar-test-secret-at-least-thirty-two-chars";
  const KEY = "nvapi-test0123456789abcdef0123456789";
  const KEY2 = "sk-oai-test0123456789abcdef01234567";
  const MODEL_A = "google/gemma-4-31b-it";
  const MODEL_B = "meta/llama-3.3-70b-instruct";

  let scratch: Scratch;
  let server2: Server;
  let base2: string;
  const kept = { secret: process.env.AUTH_SECRET };

  beforeAll(async () => {
    // Fixed before the catalog's dotenv can supply its own: the rows seal
    // under this secret and the suite reads them back under it.
    process.env.AUTH_SECRET = SECRET;
    scratch = await migratedScratchDatabase();
    server2 = createApi({ ...stubDeps({}), db: Promise.resolve(scratch.db) });
    await new Promise<void>((resolve) => server2.listen(0, "127.0.0.1", resolve));
    base2 = `http://127.0.0.1:${(server2.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    server2?.closeAllConnections();
    await new Promise((resolve) => server2?.close(resolve));
    await scratch?.drop();
    if (kept.secret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = kept.secret;
  });

  async function call2(path: string, method: string, body?: unknown): Promise<Response> {
    return fetch(`${base2}${path}`, {
      method,
      headers: method === "GET" ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it("saves a key, reports its status, removes it", async () => {
    const saved = await call2("/api/learner/provider-key", "POST", { provider: "nvidia", key: KEY });
    expect(saved.status).toBe(200);
    const reply = (await saved.json()) as { ok: boolean; key: { provider: string; last4: string; readable: boolean } };
    expect(reply.ok).toBe(true);
    expect(reply.key).toMatchObject({ provider: "nvidia", last4: KEY.slice(-4), readable: true });

    // The row the web reads: sealed under AUTH_SECRET, opening to the key.
    const rows = await readProviderKeys(scratch.db, "local");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.keyVersion).toBe(1);
    expect(await openSavedKeys(scratch.db, "local", process.env)).toEqual({ nvidia: KEY });

    const status = await call2("/api/learner/provider-key", "GET");
    const view = (await status.json()) as {
      reachable: boolean;
      rows: { id: string; saved: { last4: string; readable: boolean } | null; inUse: string | null }[];
    };
    expect(view.reachable).toBe(true);
    const nvidia = view.rows.find((row) => row.id === "nvidia");
    expect(nvidia).toMatchObject({ saved: { last4: KEY.slice(-4), readable: true }, inUse: "saved" });

    const removed = await call2("/api/learner/provider-key", "DELETE", { provider: "nvidia" });
    expect(await removed.json()).toMatchObject({ ok: true, removed: true });
    expect(await readProviderKeys(scratch.db, "local")).toHaveLength(0);
  });

  it("runs the chain through add, move, set, provider move and remove", async () => {
    // Keys first: an add for a provider nothing holds a key for is NO_KEY.
    const noKey = await call2("/api/learner/tutor-model", "POST", { provider: "openai", model: "gpt-5" });
    expect(noKey.status).toBe(400);
    expect(await noKey.json()).toMatchObject({ ok: false, code: "NO_KEY" });

    await call2("/api/learner/provider-key", "POST", { provider: "nvidia", key: KEY });
    await call2("/api/learner/provider-key", "POST", { provider: "openai", key: KEY2 });

    // A model id that echoes a saved key is refused without repeating it
    // (T11). The key's own shape dodges `looksLikeKey` — short runs only — so
    // it is `echoesKey`, not `checkModelId`, that catches this.
    await call2("/api/learner/provider-key", "POST", { provider: "glm", key: "glm-aaaa-bbbb-cccc-dddd-eeee" });
    const echoed = await call2("/api/learner/tutor-model", "POST", { provider: "openai", model: "m/glm-aaaa-bbbb-cccc-dddd-eeee" });
    expect(echoed.status).toBe(400);
    expect(await echoed.json()).toMatchObject({ ok: false, code: "BAD_REQUEST" });

    const first = await call2("/api/learner/tutor-model", "POST", { provider: "nvidia", model: MODEL_A });
    expect(await first.json()).toMatchObject({ ok: true, chain: [{ provider: "nvidia", model: MODEL_A }] });
    const second = await call2("/api/learner/tutor-model", "POST", { provider: "nvidia", model: MODEL_B });
    expect((await second.json() as { chain: unknown[] }).chain).toHaveLength(2);
    const third = await call2("/api/learner/tutor-model", "POST", { provider: "openai", model: "gpt-5" });
    expect(await third.json()).toMatchObject({
      ok: true,
      chain: [
        { provider: "nvidia", model: MODEL_A },
        { provider: "nvidia", model: MODEL_B },
        { provider: "openai", model: "gpt-5" },
      ],
    });

    // A duplicate is a 409.
    const dup = await call2("/api/learner/tutor-model", "POST", { provider: "nvidia", model: MODEL_A });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ ok: false, code: "DUPLICATE" });

    // An entry moves within its provider's block only.
    const moved = await call2("/api/learner/tutor-model", "PATCH", { provider: "nvidia", model: MODEL_B, direction: "up" });
    expect(await moved.json()).toMatchObject({
      ok: true,
      chain: [
        { provider: "nvidia", model: MODEL_B },
        { provider: "nvidia", model: MODEL_A },
        { provider: "openai", model: "gpt-5" },
      ],
    });

    // A provider's block moves together past the next provider's.
    const block = await call2("/api/learner/tutor-model/provider", "PATCH", { provider: "openai", direction: "up" });
    expect(await block.json()).toMatchObject({
      ok: true,
      chain: [
        { provider: "openai", model: "gpt-5" },
        { provider: "nvidia", model: MODEL_B },
        { provider: "nvidia", model: MODEL_A },
      ],
    });

    // GET reads the chain back, top first.
    const chain = await call2("/api/learner/tutor-model", "GET");
    expect(await chain.json()).toMatchObject({ ok: true, reachable: true, chain: [{ provider: "openai", model: "gpt-5" }, { provider: "nvidia", model: MODEL_B }, { provider: "nvidia", model: MODEL_A }] });

    // PUT replaces the whole chain with one entry (T16).
    const set = await call2("/api/learner/tutor-model", "PUT", { provider: "nvidia", model: MODEL_A });
    expect(await set.json()).toMatchObject({ ok: true, chain: [{ provider: "nvidia", model: MODEL_A }] });

    // DELETE the entry, then a NOT_FOUND for what is no longer there.
    const removed = await call2("/api/learner/tutor-model", "DELETE", { provider: "nvidia", model: MODEL_A });
    expect(await removed.json()).toMatchObject({ ok: true, chain: [] });
    const missing = await call2("/api/learner/tutor-model", "DELETE", { provider: "nvidia", model: MODEL_A });
    expect(missing.status).toBe(404);

    // A provider's delete takes its models and its saved key together (T12).
    await call2("/api/learner/tutor-model", "POST", { provider: "openai", model: "gpt-5" });
    const wiped = await call2("/api/learner/tutor-model/provider", "DELETE", { provider: "openai" });
    expect(await wiped.json()).toMatchObject({ ok: true, chain: [], keyRemoved: true });
    // openai's key went with the provider; nvidia's and glm's stay.
    const keys = await readProviderKeys(scratch.db, "local");
    expect(keys.map((row) => row.provider)).toEqual(["glm", "nvidia"]);
  });
});
