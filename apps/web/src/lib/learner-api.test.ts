import { afterEach, describe, expect, it, vi } from "vitest";

import { resetRateLimits } from "@gnosia/tutor/guards";
import { BodyTooLarge, handler, MAX_BODY_BYTES, readBodyText, turnRoute } from "./learner-api";

const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => session.signedIn,
}));

// `withLearnerStore` hands the callback `fakeDb`, so the handler's own
// `write(db, input, owner)` runs. `store.write`, when set, stands in for the
// store failing instead.
const fakeDb = vi.hoisted(() => ({ fake: "db" }));
const store = vi.hoisted(() => ({ write: null as null | (() => Promise<unknown>), opened: 0 }));
vi.mock("@/lib/learner-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learner-store")>()),
  withLearnerStore: async (fn: (db: unknown) => Promise<unknown>) =>
    store.write === null ? fn(fakeDb) : store.write(),
  catalogDatabase: async () => {
    store.opened += 1;
    return {};
  },
}));

function streamed(chunks: Uint8Array[]): { request: Request; pulled: () => number } {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[pulled];
      pulled += 1;
      if (next === undefined) controller.close();
      else controller.enqueue(next);
    },
  });
  const request = new Request("http://localhost:3000/api/learner/x", { method: "POST", body, duplex: "half" } as RequestInit & {
    duplex: string;
  });
  return { request, pulled: () => pulled };
}

describe("readBodyText", () => {
  it("reads a body within the limit", async () => {
    const request = new Request("http://localhost:3000/x", { method: "POST", body: '{"a":"γνῶσις"}' });
    await expect(readBodyText(request, 100)).resolves.toBe('{"a":"γνῶσις"}');
  });

  it("refuses a declared length past the limit before reading anything", async () => {
    const declared = new Request("http://localhost:3000/x", { method: "POST", body: "x", headers: { "content-length": "101" } });
    await expect(readBodyText(declared, 100)).rejects.toBeInstanceOf(BodyTooLarge);
    expect(declared.bodyUsed).toBe(false);
  });

  it("stops reading a chunked body as soon as it passes the limit", async () => {
    const chunks = Array.from({ length: 50 }, () => new Uint8Array(40));
    const { request, pulled } = streamed(chunks);
    await expect(readBodyText(request, 100)).rejects.toBeInstanceOf(BodyTooLarge);
    expect(pulled()).toBeLessThan(10);
  });

  it("counts bytes, not characters", async () => {
    // 40 three-byte characters: 40 UTF-16 units, 120 bytes.
    const request = new Request("http://localhost:3000/x", { method: "POST", body: "語".repeat(40) });
    await expect(readBodyText(request, 100)).rejects.toBeInstanceOf(BodyTooLarge);
  });

  it("reads an absent body as empty", async () => {
    await expect(readBodyText(new Request("http://localhost:3000/x", { method: "POST" }), 100)).resolves.toBe("");
  });
});

describe("handler", () => {
  afterEach(() => {
    resetRateLimits();
    store.write = null;
    session.signedIn = true;
    vi.restoreAllMocks();
  });

  function post(body: string): Request {
    return new Request("http://localhost:3000/api/learner/x", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body,
    });
  }

  it("hands the write the store's database, the parsed input and the session's owner", async () => {
    const parse = (body: Record<string, unknown>) => ({ parsed: String(body.raw).toUpperCase() });
    const write = vi.fn(async () => "written");
    const route = handler("t", parse, write);
    const answer = await route(post('{"raw":"note"}'));
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ ok: true, result: "written" });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(fakeDb, { parsed: "NOTE" }, "local");
  });

  it("answers a request with no session with a 401 and writes nothing", async () => {
    session.signedIn = false;
    const write = vi.fn(async () => "written");
    const answer = await handler("t", (body) => body, write)(post("{}"));
    expect(answer.status).toBe(401);
    expect(await answer.json()).toMatchObject({ error: "UNAUTHENTICATED" });
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses the 61st write in a minute to one bucket, and not another bucket's", async () => {
    const write = vi.fn(async () => "written");
    const route = handler("bucket-a", (body) => body, write);
    for (let i = 0; i < 60; i += 1) expect((await route(post("{}"))).status).toBe(200);
    const limited = await route(post("{}"));
    expect(limited.status).toBe(429);
    expect(write).toHaveBeenCalledTimes(60);
    expect((await handler("bucket-b", (body) => body, write)(post("{}"))).status).toBe(200);
  });

  it("refuses a JSON body that is not an object before parsing it", async () => {
    const parse = vi.fn((body: Record<string, unknown>) => body);
    const write = vi.fn(async () => "written");
    const route = handler("t", parse, write);
    for (const body of ["[1,2]", "null", '"text"', "7"]) {
      const answer = await route(post(body));
      expect(answer.status).toBe(400);
      expect(await answer.json()).toMatchObject({ error: "Body must be a JSON object.", code: "BAD_REQUEST" });
    }
    expect(parse).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("takes a larger body only where the route asks for one", async () => {
    const big = JSON.stringify({ text: "x".repeat(MAX_BODY_BYTES) });
    const small = handler("t", (body) => body, async () => "written");
    expect((await small(post(big))).status).toBe(400);
    const large = handler("t", (body) => body, async () => "written", { maxBodyBytes: 2 * MAX_BODY_BYTES });
    const answer = await large(post(big));
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ ok: true, result: "written" });
  });

  it("logs a failed write by its code, never the driver's message and its parameters", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    store.write = async () => {
      throw new Error('Failed query: insert into note values (?) params: my private note', { cause: Object.assign(new Error("disk"), { code: "SQLITE_FULL" }) });
    };
    const route = handler("t", (body) => body, async () => undefined);
    const answer = await route(post("{}"));
    expect(answer.status).toBe(503);
    const logged = warn.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("SQLITE_FULL");
    expect(logged).not.toContain("my private note");
  });
});

describe("turnRoute", () => {
  afterEach(() => {
    resetRateLimits();
    store.opened = 0;
    session.signedIn = true;
  });

  const post = (body: string) =>
    new Request("http://localhost:3000/api/learner/x", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body,
    });

  it("hands the turn the session's owner and answers with its reply", async () => {
    const route = turnRoute("t", async (deps, body) => ({ status: 200, body: { ok: true, result: { owner: deps.owner, body } } }));
    const answer = await route(post('{"a":1}'));
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ ok: true, result: { owner: "local", body: { a: 1 } } });
  });

  it("answers a request with no session with a 401 before the turn runs", async () => {
    session.signedIn = false;
    const turn = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    const answer = await turnRoute("t", turn)(post("{}"));
    expect(answer.status).toBe(401);
    expect(await answer.json()).toMatchObject({ error: "UNAUTHENTICATED" });
    expect(turn).not.toHaveBeenCalled();
  });

  it("opens the database only when the turn asks for it", async () => {
    const refusing = turnRoute("t", async () => ({ status: 400, body: { ok: false, error: "no", code: "BAD_REQUEST" } }));
    expect((await refusing(post("{}"))).status).toBe(400);
    expect(store.opened).toBe(0);
    const writing = turnRoute("t", async (deps) => {
      await deps.db;
      return { status: 200, body: { ok: true } };
    });
    expect((await writing(post("{}"))).status).toBe(200);
    expect(store.opened).toBe(1);
  });

  it("refuses a cross-site post and bad JSON before the turn runs", async () => {
    const turn = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    const route = turnRoute("t", turn);
    const crossSite = new Request("http://localhost:3000/api/learner/x", { method: "POST", headers: { "sec-fetch-site": "cross-site" }, body: "{}" });
    expect((await route(crossSite)).status).toBe(403);
    expect((await route(post("{not json"))).status).toBe(400);
    expect(turn).not.toHaveBeenCalled();
  });
});
