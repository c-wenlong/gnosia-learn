import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { CatalogDatabase } from "@self-learn/catalog/state";
import type { TutorDeps } from "@self-learn/tutor/server/deps";

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
