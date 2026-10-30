import { STUDIO_OWNER_HEADER } from "@gnosia/schema/shared";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

import { GET, POST } from "./route";

/**
 * The proxy's own checks (who may call it), what it forwards to the runner
 * (an allow list of headers and a bounded body), and what it hands back.
 */

const ORIGIN = "http://localhost:3000";

interface Seen {
  url: string;
  headers: Headers;
  body: string | undefined;
}

describe("/studio/api/*", () => {
  const seen: Seen[] = [];
  let reply: () => Response;

  beforeEach(() => {
    vi.stubEnv("STUDIO_ENABLED", "1");
    seen.length = 0;
    reply = () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        seen.push({ url, headers: new Headers(init.headers), body: init.body as string | undefined });
        return reply();
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const context = { params: Promise.resolve({ segments: ["jobs"] }) };

  function request(method: string, headers: Record<string, string>, body?: BodyInit): NextRequest {
    return new NextRequest(`${ORIGIN}/studio/api/jobs`, {
      method,
      headers: { host: "localhost:3000", ...headers },
      ...(body === undefined ? {} : { body, duplex: "half" }),
    } as ConstructorParameters<typeof NextRequest>[1]);
  }

  it("refuses a cross-site or same-site browser, a foreign Origin and Origin null, and calls nothing", async () => {
    const refused: Record<string, string>[] = [
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
      { origin: "https://evil.example" },
      { origin: "null" },
    ];
    for (const headers of refused) {
      const response = await POST(request("POST", { ...headers, "content-type": "application/json" }, "{}"), context);
      expect(response.status, JSON.stringify(headers)).toBe(403);
    }
    expect(seen).toHaveLength(0);
  });

  it("refuses a body that is not JSON, the simple request a page elsewhere could send", async () => {
    const response = await POST(request("POST", { "sec-fetch-site": "same-origin", "content-type": "text/plain" }, "{}"), context);
    expect(response.status).toBe(403);
    expect(seen).toHaveLength(0);
  });

  it("forwards only the headers the runner reads, plus the owner", async () => {
    await GET(
      request("GET", {
        "sec-fetch-site": "same-origin",
        accept: "text/event-stream",
        "last-event-id": "7",
        "if-none-match": '"abc"',
        authorization: "Bearer stolen",
        cookie: "gnosia_session=x",
        "x-forwarded-for": "10.0.0.1",
        "x-forwarded-host": "evil.example",
        "proxy-authorization": "x",
        te: "trailers",
        "x-custom": "anything",
      }),
      context,
    );
    expect(seen).toHaveLength(1);
    const names = [...seen[0].headers.keys()].sort();
    expect(names).toEqual(["accept", "if-none-match", "last-event-id", STUDIO_OWNER_HEADER].sort());
    expect(seen[0].headers.get(STUDIO_OWNER_HEADER)).toBe("local");
  });

  it("forwards a JSON body and refuses one over the runner's limit, declared or streamed", async () => {
    const ok = await POST(request("POST", { "sec-fetch-site": "same-origin", "content-type": "application/json; charset=utf-8" }, '{"a":1}'), context);
    expect(ok.status).toBe(200);
    expect(seen[0].body).toBe('{"a":1}');
    expect(seen[0].headers.get("content-type")).toBe("application/json");

    const big = "x".repeat(1_000_001);
    const declared = await POST(request("POST", { "sec-fetch-site": "same-origin", "content-type": "application/json" }, big), context);
    expect(declared.status).toBe(413);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 20; i += 1) controller.enqueue(new Uint8Array(100_000));
        controller.close();
      },
    });
    const chunked = await POST(request("POST", { "sec-fetch-site": "same-origin", "content-type": "application/json" }, stream), context);
    expect(chunked.status).toBe(413);
    expect(seen).toHaveLength(1);
  });

  it("drops a Location and a Set-Cookie from the runner, and sandboxes what it hands back", async () => {
    reply = () =>
      new Response("<svg/>", {
        status: 302,
        headers: {
          "content-type": "image/svg+xml",
          location: "http://127.0.0.1:7250/api/elsewhere",
          "set-cookie": "a=b",
          etag: '"v1"',
        },
      });
    const response = await GET(request("GET", { "sec-fetch-site": "same-origin" }), context);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("etag")).toBe('"v1"');
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("answers 502 naming the runner when nothing listens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    );
    const response = await GET(request("GET", { "sec-fetch-site": "same-origin" }), context);
    expect(response.status).toBe(502);
  });
});
