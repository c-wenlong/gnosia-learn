import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  readAssetNaming,
  readDisplayName,
  readEvents,
  readModel,
  readPreference,
  readProgress,
  readProviderKeys,
  readReviews,
  type CatalogDatabase,
} from "@gnosia/catalog/state";
import type { TutorDeps } from "@gnosia/tutor/server/deps";
import { openSavedKeys } from "@gnosia/tutor/server/provider-keys";
import { migratedScratchDatabase, probe, type Scratch } from "../../catalog/test/scratch-database";
import { ASSETS, ITEMS, seedAssets, seedContent } from "../../catalog/test/state-fixture";

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
    expect(await response.json()).toMatchObject({ ok: true, service: "gnosia-sidecar", owner: "local", secret: false });
  });

  it("says in health whether it can open saved keys", async () => {
    const withSecret = createApi(stubDeps({ AUTH_SECRET: "s".repeat(32) }));
    await new Promise<void>((resolve) => withSecret.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = withSecret.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(await response.json()).toMatchObject({ secret: true });
    } finally {
      withSecret.closeAllConnections();
      await new Promise((resolve) => withSecret.close(resolve));
    }
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

  it("refuses a custom-provider write the way the web route does", async () => {
    // A non-object body, then a key of the wrong shape: both 400s before any read.
    expect((await call("/api/learner/custom-provider", "POST", "nope")).status).toBe(400);
    const short = await call("/api/learner/custom-provider", "POST", {
      label: "Mine",
      baseUrl: "https://api.example.com/v1",
      key: "short",
    });
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ ok: false, code: "BAD_REQUEST" });

    // PATCH wants a custom-… id, then at least one of name, URL or key.
    const wrong = await call("/api/learner/custom-provider", "PATCH", { provider: "nvidia", label: "x" });
    expect(wrong.status).toBe(400);
    const nothing = await call("/api/learner/custom-provider", "PATCH", { provider: "custom-mine" });
    expect(nothing.status).toBe(400);
    expect(await nothing.json()).toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });

  it("answers a custom-provider add NO_SECRET without AUTH_SECRET, then STORE_UNAVAILABLE with one", async () => {
    const kept = process.env.AUTH_SECRET;
    const body = { label: "My gateway", baseUrl: "https://api.example.com/v1", key: KEY };
    try {
      delete process.env.AUTH_SECRET;
      const secretless = await call("/api/learner/custom-provider", "POST", body);
      expect(secretless.status).toBe(503);
      expect(await secretless.json()).toMatchObject({ ok: false, code: "NO_SECRET" });

      process.env.AUTH_SECRET = "sidecar-test-secret-at-least-thirty-two-chars";
      const down = await call("/api/learner/custom-provider", "POST", body);
      expect(down.status).toBe(503);
      expect(await down.json()).toMatchObject({ ok: false, code: "STORE_UNAVAILABLE" });
      // A rename with no key needs no secret either: the dead store answers.
      const renamed = await call("/api/learner/custom-provider", "PATCH", { provider: "custom-mine", label: "New" });
      expect(renamed.status).toBe(503);
      expect(await renamed.json()).toMatchObject({ ok: false, code: "STORE_UNAVAILABLE" });
    } finally {
      if (kept === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = kept;
    }
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
 * The learner-state writes against the stub deps: every refusal the routes
 * can give without reaching a row — a bad payload is a 400 before any read,
 * a good one is a 503 STORE_UNAVAILABLE the way the web's `handler` answers
 * a dead database.
 */
describe("the learner state writes, database down", () => {
  it("400s bad payloads before touching the database", async () => {
    const cases: [string, unknown][] = [
      ["/api/learner/favorite", { assetId: 42, favorite: true }],
      ["/api/learner/favorite", { assetId: "fx:video", favorite: "yes" }],
      ["/api/learner/watched", {}],
      ["/api/learner/playback", { assetId: "fx:video", duration: 0, position: 1, ranges: [] }],
      ["/api/learner/playback", { assetId: "fx:video", duration: 10, position: 1, ranges: [[1, 2, 3]] }],
      ["/api/learner/progress", { curriculumItemId: "fx-m1-t1" }],
      ["/api/learner/asset-name", { assetId: "fx:video", name: 42 }],
      ["/api/learner/note", { curriculumItemId: "fx-m1-t1", note: "x".repeat(20_001) }],
      ["/api/learner/name", { name: 42 }],
      ["/api/learner/observe", { conceptSlug: "UPPER", correct: true, source: "probe", requestId: "r1" }],
      ["/api/learner/observe", { conceptSlug: "alpha", correct: true, source: "review", requestId: "r1" }],
      ["/api/learner/observe", { conceptSlug: "alpha", correct: true, source: "teach" }],
      ["/api/review/grade", {}],
      ["/api/review/grade", { conceptId: "alpha", grade: 5 }],
      ["/api/review/grade", { conceptId: "alpha", grade: "good" }],
      ["/api/review/grade", { conceptId: "alpha", grade: 2, requestId: "has spaces" }],
      ["/api/learner/session/close", { sessionId: "has spaces" }],
      ["/api/learner/preference", { key: "theme", value: "dark" }],
      ["/api/learner/preference", { key: "lastVisited", value: {} }],
      ["/api/learner/preference", { key: "lastVisited", value: { courseSlug: "c", moduleSlug: 42 } }],
      ["/api/learner/favorite", "not an object"],
    ];
    for (const [path, body] of cases) {
      const response = await call(path, "POST", body);
      expect(response.status, `${path} ${JSON.stringify(body)}`).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, code: "BAD_REQUEST" });
    }
  });

  it("503s good payloads STORE_UNAVAILABLE, as the web's handler does", async () => {
    const cases: [string, unknown][] = [
      ["/api/learner/favorite", { assetId: "fx:video", favorite: true }],
      ["/api/learner/watched", { assetId: "fx:video" }],
      ["/api/learner/playback", { assetId: "fx:video", duration: 10, position: 5, ranges: [[0, 5]] }],
      ["/api/learner/progress", { curriculumItemId: "fx-m1-t1", completed: true }],
      ["/api/learner/asset-name", { assetId: "fx:video", name: "x" }],
      ["/api/learner/note", { curriculumItemId: "fx-m1-t1", note: "x" }],
      ["/api/learner/name", { name: "Ada" }],
      ["/api/learner/observe", { conceptSlug: "alpha", correct: true, source: "teach", requestId: "r1" }],
      ["/api/review/grade", { conceptId: "alpha", grade: 2, requestId: "r1" }],
      ["/api/learner/session/close", { sessionId: "s1" }],
      ["/api/learner/preference", { key: "lastVisited", value: { courseSlug: "cs4263", moduleSlug: "m1" } }],
    ];
    for (const [path, body] of cases) {
      const response = await call(path, "POST", body);
      expect(response.status, `${path}`).toBe(503);
      expect(await response.json()).toMatchObject({ ok: false, code: "STORE_UNAVAILABLE" });
    }
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
    // The content half the state tables' foreign keys need: concepts for
    // observations, curriculum items for ticks and notes, assets for the
    // library writes.
    await seedContent(scratch.db);
    await seedAssets(scratch.db);
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

  it("adds, edits and deletes a provider the owner added", async () => {
    const CUSTOM_KEY = "custom-key-0123456789abcdef";
    const added = await call2("/api/learner/custom-provider", "POST", {
      label: "My gateway",
      baseUrl: "https://gateway.example.com/v1/",
      key: CUSTOM_KEY,
    });
    expect(added.status).toBe(200);
    const created = (await added.json()) as {
      ok: boolean;
      provider: { id: string; label: string; baseUrl: string };
      key: { provider: string; last4: string; readable: boolean };
    };
    expect(created.ok).toBe(true);
    // The id is made from the name; the base URL keeps none of its trailing slash.
    expect(created.provider).toEqual({
      id: "custom-my-gateway",
      label: "My gateway",
      baseUrl: "https://gateway.example.com/v1",
    });
    expect(created.key).toMatchObject({ provider: "custom-my-gateway", last4: CUSTOM_KEY.slice(-4), readable: true });

    // The sealed row is the web's own: it opens under the saved-keys read.
    expect(await openSavedKeys(scratch.db, "local", process.env)).toMatchObject({ "custom-my-gateway": CUSTOM_KEY });

    // The status read lists it with its base URL, keyed.
    const status = await call2("/api/learner/provider-key", "GET");
    const view = (await status.json()) as {
      rows: { id: string; custom?: { baseUrl: string }; inUse: string | null }[];
    };
    expect(view.rows.find((row) => row.id === "custom-my-gateway")).toMatchObject({
      custom: { baseUrl: "https://gateway.example.com/v1" },
      inUse: "saved",
    });

    // Its model joins the chain on the saved key alone — a custom provider
    // has no server key to stand in.
    const chained = await call2("/api/learner/tutor-model", "POST", { provider: "custom-my-gateway", model: "my-model-1" });
    expect(await chained.json()).toMatchObject({ ok: true });

    // The PATCH renames it and moves it; the id and the models stay.
    const renamed = await call2("/api/learner/custom-provider", "PATCH", {
      provider: "custom-my-gateway",
      label: "Renamed gateway",
      baseUrl: "https://gateway2.example.com/v1",
    });
    expect(await renamed.json()).toMatchObject({
      ok: true,
      provider: { id: "custom-my-gateway", label: "Renamed gateway", baseUrl: "https://gateway2.example.com/v1" },
    });

    // A base URL that is neither https nor a local http is refused.
    const bad = await call2("/api/learner/custom-provider", "PATCH", {
      provider: "custom-my-gateway",
      baseUrl: "http://gateway.example.com",
    });
    expect(bad.status).toBe(400);

    // The provider's delete removes it whole: its models and its key too.
    const gone = await call2("/api/learner/tutor-model/provider", "DELETE", { provider: "custom-my-gateway" });
    expect(await gone.json()).toMatchObject({ ok: true, keyRemoved: true });
    const after = await call2("/api/learner/provider-key", "GET");
    const rows = ((await after.json()) as { rows: { id: string }[] }).rows;
    expect(rows.some((row) => row.id === "custom-my-gateway")).toBe(false);
    expect((await readProviderKeys(scratch.db, "local")).some((row) => row.provider === "custom-my-gateway")).toBe(false);
  });

  /**
   * The bridge's half of the app: every write the native LearnerStore makes
   * lands in Postgres through these routes, in the web's own `{ ok, result }`
   * envelope, so a check here reads the row the web would read.
   */
  describe("the learner state writes", () => {
    it("stars and unstars an asset", async () => {
      const starred = await call2("/api/learner/favorite", "POST", { assetId: ASSETS.video, favorite: true });
      expect(starred.status).toBe(200);
      const set = (await starred.json()) as { ok: boolean; result: { assetId: string; favorite: boolean; at: string | null } };
      expect(set.result).toMatchObject({ assetId: ASSETS.video, favorite: true });
      expect(typeof set.result.at).toBe("string");
      expect(await readPreference(scratch.db, `favorite:${ASSETS.video}`, "local")).toEqual({ at: set.result.at });

      const unstarred = await call2("/api/learner/favorite", "POST", { assetId: ASSETS.video, favorite: false });
      expect((await unstarred.json()).result).toMatchObject({ assetId: ASSETS.video, favorite: false, at: null });
      expect(await readPreference(scratch.db, `favorite:${ASSETS.video}`, "local")).toBeUndefined();

      expect((await call2("/api/learner/favorite", "POST", { assetId: "fx:missing", favorite: true })).status).toBe(400);
    });

    it("appends a watched event per press, stamped by the server", async () => {
      const first = await call2("/api/learner/watched", "POST", { assetId: ASSETS.video });
      expect(first.status).toBe(200);
      const second = await call2("/api/learner/watched", "POST", { assetId: ASSETS.link });
      const events = (await readEvents(scratch.db, "local")).filter((e) => e.type === "watched");
      // Two presses, two rows: the log does not dedupe a second viewing.
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.map((e) => e.asset)).toEqual(expect.arrayContaining([ASSETS.video, ASSETS.link]));
      expect((await call2("/api/learner/watched", "POST", { assetId: "fx:missing" })).status).toBe(400);
      expect(second.status).toBe(200);
    });

    it("merges playback saves and appends the watched event on the crossing", async () => {
      const half = await call2("/api/learner/playback", "POST", {
        assetId: ASSETS.video, duration: 100, position: 50, ranges: [[0, 50]],
      });
      expect(half.status).toBe(200);
      const first = (await half.json()) as {
        ok: boolean;
        result: { coverage: number; watchedAt: string | null; watchedDay: string | null; position: number; crossed: boolean };
      };
      expect(first.result).toMatchObject({ coverage: 0.5, watchedAt: null, watchedDay: null, position: 50, crossed: false });

      const second = await call2("/api/learner/playback", "POST", {
        assetId: ASSETS.video, duration: 100, position: 95, ranges: [[50, 95]],
      });
      const done = (await second.json()) as typeof first;
      expect(done.result).toMatchObject({ crossed: true, position: 95 });
      expect(done.result.coverage).toBeGreaterThanOrEqual(0.9);
      expect(done.result.watchedAt).not.toBeNull();
      expect(done.result.watchedDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // The crossing appended exactly one `watched` event for this asset; a
      // later save does not append again.
      const before = (await readEvents(scratch.db, "local")).filter((e) => e.type === "watched" && e.asset === ASSETS.video).length;
      await call2("/api/learner/playback", "POST", { assetId: ASSETS.video, duration: 100, position: 100, ranges: [[95, 100]] });
      const after = (await readEvents(scratch.db, "local")).filter((e) => e.type === "watched" && e.asset === ASSETS.video).length;
      expect(after).toBe(before);

      // A page kind cannot carry a position, and an unknown id is a 400.
      expect((await call2("/api/learner/playback", "POST", { assetId: ASSETS.link, duration: 10, position: 1, ranges: [] })).status).toBe(400);
      expect((await call2("/api/learner/playback", "POST", { assetId: "fx:missing", duration: 10, position: 1, ranges: [] })).status).toBe(400);
    });

    it("ticks and unticks a curriculum item", async () => {
      const tick = await call2("/api/learner/progress", "POST", { curriculumItemId: ITEMS[0], completed: true });
      expect(tick.status).toBe(200);
      expect(await tick.json()).toMatchObject({ ok: true, result: { curriculumItemId: ITEMS[0], completed: true } });
      expect((await readProgress(scratch.db, "local")).find((r) => r.curriculumItemId === ITEMS[0])?.completedAt).not.toBeNull();

      await call2("/api/learner/progress", "POST", { curriculumItemId: ITEMS[0], completed: false });
      expect((await readProgress(scratch.db, "local")).find((r) => r.curriculumItemId === ITEMS[0])).toBeUndefined();
      expect((await call2("/api/learner/progress", "POST", { curriculumItemId: "nope", completed: true })).status).toBe(400);
    });

    it("writes and clears a scratch note", async () => {
      await call2("/api/learner/note", "POST", { curriculumItemId: ITEMS[0], note: "a thought" });
      expect((await readProgress(scratch.db, "local")).find((r) => r.curriculumItemId === ITEMS[0])?.note).toBe("a thought");

      const cleared = await call2("/api/learner/note", "POST", { curriculumItemId: ITEMS[0], note: "" });
      expect((await cleared.json()).result).toMatchObject({ cleared: true });
      expect((await readProgress(scratch.db, "local")).find((r) => r.curriculumItemId === ITEMS[0])).toBeUndefined();
      expect((await call2("/api/learner/note", "POST", { curriculumItemId: "nope", note: "x" })).status).toBe(400);
    });

    it("renames an asset and clears the name back to the source's title", async () => {
      const renamed = await call2("/api/learner/asset-name", "POST", { assetId: ASSETS.link, name: "  Somebody   else's " });
      expect(renamed.status).toBe(200);
      expect((await renamed.json()).result).toEqual({ title: "Somebody else's", name: "Somebody else's", original: "Somebody else's alpha" });
      expect(await readAssetNaming(scratch.db, ASSETS.link, "local")).toMatchObject({ name: "Somebody else's" });

      const cleared = await call2("/api/learner/asset-name", "POST", { assetId: ASSETS.link, name: null });
      expect((await cleared.json()).result).toEqual({ title: "Somebody else's alpha", name: null, original: "Somebody else's alpha" });
      expect((await call2("/api/learner/asset-name", "POST", { assetId: "fx:missing", name: "x" })).status).toBe(400);
    });

    it("stores the display name cleaned and clears it with null", async () => {
      const named = await call2("/api/learner/name", "POST", { name: "  Ada   Lovelace " });
      expect(named.status).toBe(200);
      expect((await named.json()).result).toBe("Ada Lovelace");
      expect(await readDisplayName(scratch.db, "local")).toBe("Ada Lovelace");
      await call2("/api/learner/name", "POST", { name: null });
      expect(await readDisplayName(scratch.db, "local")).toBeNull();
    });

    it("records an answer: the event, the session, the mastery spread and the card", async () => {
      const sessionId = "sidecar-test-session-1";
      const answer = {
        conceptSlug: "gamma",
        correct: true,
        source: "teach",
        requestId: "req-gamma-1",
        sessionId,
        question: "What is gamma?",
        answer: "The third fixture concept",
        chosen: "The third fixture concept",
      };
      const recorded = await call2("/api/learner/observe", "POST", answer);
      expect(recorded.status).toBe(200);
      const result = (await recorded.json()).result as {
        concept: string; correct: boolean; pLBefore: number; pLAfter: number; mastered: boolean;
        propagated: { concept: string; hops: number }[]; card: { created: boolean } | null;
        session: string; replayed: boolean; closed: boolean;
      };
      expect(result).toMatchObject({ concept: "gamma", correct: true, session: sessionId, replayed: false, closed: false });
      expect(result.pLAfter).toBeGreaterThan(result.pLBefore);
      // A correct answer spread to the prerequisites: beta at one hop, alpha at two.
      expect(result.propagated.map((p) => p.concept).sort()).toEqual(["alpha", "beta"]);
      expect(result.card?.created).toBe(true);

      // The session row and its session-start event opened with the answer.
      const events = await readEvents(scratch.db, "local");
      const starts = events.filter((e) => e.type === "session-start" && e.session === sessionId);
      expect(starts).toHaveLength(1);
      const observations = events.filter((e) => e.type === "observation" && e.concept === "gamma");
      expect(observations).toHaveLength(1);

      // Mastery moved on the concept and on a prerequisite it spread to.
      const model = await readModel(scratch.db, "local");
      expect(model.concepts.gamma?.pL).toBeCloseTo(result.pLAfter);
      expect(model.concepts.beta?.pL).toBeGreaterThan(model.params.pL0);
      const reviews = await readReviews(scratch.db, "local");
      expect(reviews.cards.gamma).toBeDefined();

      // A replayed request id records nothing and answers replayed.
      const replay = await call2("/api/learner/observe", "POST", answer);
      const replayed = (await replay.json()).result as { replayed: boolean };
      expect(replayed.replayed).toBe(true);
      expect((await readEvents(scratch.db, "local")).filter((e) => e.type === "observation")).toHaveLength(1);

      // An answer naming a concept the catalog does not hold is a 400.
      expect((await call2("/api/learner/observe", "POST", { ...answer, conceptSlug: "nope", requestId: "req-nope" })).status).toBe(400);
    });

    it("closes a session, once, and says so when there is nothing to close", async () => {
      const answer = { conceptSlug: "alpha", correct: false, source: "probe", requestId: "req-alpha-1", sessionId: "sidecar-close-1" };
      await call2("/api/learner/observe", "POST", answer);

      const closed = await call2("/api/learner/session/close", "POST", { sessionId: "sidecar-close-1" });
      expect(closed.status).toBe(200);
      expect((await closed.json()).result).toMatchObject({ session: "sidecar-close-1", closed: true, answered: 1, correct: 0, concepts: ["alpha"] });

      // Already closed: nothing written, closed:false.
      const again = await call2("/api/learner/session/close", "POST", { sessionId: "sidecar-close-1" });
      expect((await again.json()).result).toMatchObject({ closed: false });
      // Never opened: the same answer.
      const never = await call2("/api/learner/session/close", "POST", { sessionId: "sidecar-close-never" });
      expect((await never.json()).result).toMatchObject({ closed: false });

      // An answer arriving after the close is refused as the web's is: the
      // session has already said which concepts it touched.
      const late = await call2("/api/learner/observe", "POST", { ...answer, requestId: "req-alpha-2" });
      expect(late.status).toBe(400);
    });

    it("a module visit is the web's: the event, the list and the preference", async () => {
      const visit = { courseSlug: "course-alpha", moduleSlug: "m1", at: "2026-10-21T10:00:00.000Z" };
      const response = await call2("/api/learner/preference", "POST", { key: "lastVisited", value: visit });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, result: { key: "lastVisited" } });

      // The web's three writes, all visible in the rows the web reads.
      expect(await readPreference(scratch.db, "lastVisited", "local")).toEqual(visit);
      const recents = await readPreference(scratch.db, "recentModules", "local");
      expect(recents).toEqual([visit]);
      const visits = (await readEvents(scratch.db, "local")).filter((e) => e.type === "visit");
      expect(visits).toHaveLength(1);
      expect(visits[0]).toMatchObject({ course: "course-alpha", module: "m1" });

      // A second visit moves its entry to the front, replacing the first.
      const later = { courseSlug: "course-beta", at: "2026-10-21T11:00:00.000Z" };
      await call2("/api/learner/preference", "POST", { key: "lastVisited", value: later });
      expect(await readPreference(scratch.db, "recentModules", "local")).toEqual([later, visit]);
    });

    it("a review grade is the web's: the event, the card and an idempotent replay", async () => {
      const response = await call2("/api/review/grade", "POST", {
        conceptId: "alpha",
        grade: 2,
        requestId: "req-grade-1",
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        ok: true,
        result: { concept: "alpha", rating: 2, replayed: false },
      });
      expect(body.result.grade).toBe(4); // Good maps onto SM-2's 4.

      const reviews = (await readEvents(scratch.db, "local")).filter((e) => e.type === "review");
      expect(reviews).toHaveLength(1);
      expect(reviews[0]).toMatchObject({ concept: "alpha", grade: 4 });

      // A retry naming the same requestId records nothing and answers the
      // first write's rating — a review event cannot be deleted.
      const retry = await call2("/api/review/grade", "POST", {
        conceptId: "alpha",
        grade: 0,
        requestId: "req-grade-1",
      });
      expect((await retry.json()).result).toMatchObject({ rating: 2, grade: 4, replayed: true });
      expect((await readEvents(scratch.db, "local")).filter((e) => e.type === "review")).toHaveLength(1);

      // A concept the catalog does not know is the web's 400, not a 503.
      expect(
        (await call2("/api/review/grade", "POST", { conceptId: "nope", grade: 2, requestId: "req-nope" })).status,
      ).toBe(400);
    });
  });
});
