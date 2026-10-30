import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/owner", () => ({ currentOwner: async () => "local" }));

const { studioApi } = await import("./studio");

/**
 * `studioApi` says whether a failed call certainly never reached the runner,
 * which is what lets a caller repeat a write by another road only when the
 * runner cannot be doing it too.
 */

function failWith(error: unknown): void {
  vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(error)));
}

/** What Node's fetch throws for a socket error: a `TypeError` whose `cause` carries the code. */
function socket(code: string): TypeError {
  return new TypeError("fetch failed", { cause: Object.assign(new Error(code), { code }) });
}

beforeEach(() => vi.stubEnv("STUDIO_PORT", "7299"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("studioApi failures", () => {
  it.each(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"])("%s is undelivered", async (code) => {
    failWith(socket(code));
    expect(await studioApi("/api/x")).toMatchObject({ ok: false, reason: "down", undelivered: true });
  });

  it("a refused localhost tried on two addresses (AggregateError) is undelivered", async () => {
    const both = new AggregateError([Object.assign(new Error("v6"), { code: "ECONNREFUSED" }), Object.assign(new Error("v4"), { code: "ECONNREFUSED" })]);
    failWith(new TypeError("fetch failed", { cause: both }));
    expect(await studioApi("/api/x")).toMatchObject({ ok: false, undelivered: true });
  });

  it("a timeout may have been delivered", async () => {
    failWith(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    expect(await studioApi("/api/x")).toMatchObject({ ok: false, reason: "down", undelivered: false });
  });

  it("a reset connection may have been delivered", async () => {
    failWith(socket("ECONNRESET"));
    expect(await studioApi("/api/x")).toMatchObject({ ok: false, undelivered: false });
  });

  it("gives fetch a signal that follows the caller's, as well as the timeout", async () => {
    const seen: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        seen.push(init.signal as AbortSignal);
        return new Response("{}", { status: 200 });
      }),
    );
    const caller = new AbortController();
    await studioApi("/api/x", { signal: caller.signal });
    await studioApi("/api/x");
    expect(seen).toHaveLength(2);
    expect(seen[0]!.aborted).toBe(false);
    caller.abort();
    expect(seen[0]!.aborted).toBe(true);
    expect(seen[1]!.aborted).toBe(false);
  });

  it("does not read a 2xx that is not JSON as a success with nothing in it (R2-1-05)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>proxy error</html>", { status: 200 })));
    expect(await studioApi("/api/jobs")).toMatchObject({ ok: false, reason: "refused", status: 200, detail: "<html>proxy error</html>" });
  });

  it("reads a body cut off mid-read as a runner that stopped answering, which may have acted", async () => {
    const cut = { ok: true, status: 200, text: () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")) };
    vi.stubGlobal("fetch", vi.fn(async () => cut));
    expect(await studioApi("/api/jobs")).toMatchObject({ ok: false, reason: "down", undelivered: false });
  });

  it("still reads a refusal with no JSON body as the runner's status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    expect(await studioApi("/api/jobs")).toMatchObject({ ok: false, reason: "refused", status: 503, headline: "the runner answered 503", detail: "" });
  });

  it("names the signed-in owner over any the caller passed", async () => {
    const seen: Headers[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        seen.push(new Headers(init.headers));
        return new Response("{}", { status: 200 });
      }),
    );
    await studioApi("/api/x", { headers: { "x-gnosia-owner": "someone-else" } });
    expect(seen[0]!.get("x-gnosia-owner")).toBe("local");
  });
});
