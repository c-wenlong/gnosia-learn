import { STUDIO_OWNER_HEADER } from "@self-learn/schema/shared";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signedIn = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => signedIn.value,
}));

/**
 * The studio proxy names the signed-in owner to the runner (phase 4 of
 * docs/CONTENT-MIGRATION.md), and only the app's server may: a value the page
 * sent under the same header is dropped before the session's is set, so a
 * page cannot ask the runner to serve somebody else.
 */

describe("/studio/api/* and the owner", () => {
  const seen: Headers[] = [];

  beforeEach(() => {
    vi.stubEnv("STUDIO_ENABLED", "1");
    seen.length = 0;
    signedIn.value = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        seen.push(new Headers(init.headers));
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function get(headers: Record<string, string>): Promise<Response> {
    const { GET } = await import("@/app/(app)/studio/api/[...segments]/route");
    const request = new NextRequest("http://localhost:3000/studio/api/diagrams", {
      headers: { host: "localhost:3000", "sec-fetch-site": "same-origin", ...headers },
    });
    return GET(request, { params: Promise.resolve({ segments: ["diagrams"] }) });
  }

  it("sends the session's owner, whatever the page claimed", async () => {
    const response = await get({ [STUDIO_OWNER_HEADER]: "someone-else" });
    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.get(STUDIO_OWNER_HEADER)).toBe("local");
  });

  it("sends the owner when the page sent none", async () => {
    await get({});
    expect(seen[0]?.get(STUDIO_OWNER_HEADER)).toBe("local");
  });

  it("answers 401 and calls nothing with no session", async () => {
    signedIn.value = false;
    const response = await get({});
    expect(response.status).toBe(401);
    expect(seen).toHaveLength(0);
  });
});
