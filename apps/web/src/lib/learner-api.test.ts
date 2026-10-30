import { afterEach, describe, expect, it, vi } from "vitest";

import { resetRateLimits } from "@gnosia/tutor/guards";
import { BodyTooLarge, handler, MAX_BODY_BYTES, readBodyText } from "./learner-api";

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

// The write runs against whatever this hands it; no database is opened.
const store = vi.hoisted(() => ({ write: null as null | (() => Promise<unknown>) }));
vi.mock("@/lib/learner-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learner-store")>()),
  withLearnerStore: async () => (store.write as () => Promise<unknown>)(),
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
    vi.restoreAllMocks();
  });

  function post(body: string): Request {
    return new Request("http://localhost:3000/api/learner/x", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body,
    });
  }

  it("takes a larger body only where the route asks for one", async () => {
    store.write = async () => "written";
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
