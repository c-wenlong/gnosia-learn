import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /studio/made/<draft>` (D89 of docs/STUDIO-CHAT-FIRST.md): the catalog's
 * `conversationMade`, read as the signed-in owner, behind the studio's gate,
 * and an empty answer rather than an error when the database is down. The
 * read itself is `services/catalog/test/conversation-made.test.ts`.
 */

const mocks = vi.hoisted(() => ({
  signedIn: true,
  made: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => mocks.signedIn,
}));
vi.mock("@self-learn/catalog/state", () => ({ conversationMade: mocks.made }));
vi.mock("@/lib/learner-store", () => ({ catalogDatabase: async () => ({ db: true }) }));

const { GET } = await import("./route");

let ip = 0;
function call(draft: string) {
  ip += 1;
  const req = new Request(`http://localhost:3000/studio/made/${draft}`, { headers: { "x-forwarded-for": `10.9.0.${ip}` } });
  return GET(req, { params: Promise.resolve({ draft }) });
}

beforeEach(() => {
  mocks.signedIn = true;
  mocks.made.mockReset();
  vi.stubEnv("STUDIO_ENABLED", "1");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /studio/made/<draft>", () => {
  it("answers with what the conversation made, read as the signed-in owner and the commons", async () => {
    const item = { id: "video:x", kind: "video", title: "X", name: "x", jobId: "j", madeAt: "2026-10-05T00:00:00.000Z", thumbnail: true };
    mocks.made.mockResolvedValue([item]);
    const response = await call("48cb177e-5902");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, reachable: true, made: [item] });
    const [, draft, scope] = mocks.made.mock.calls[0];
    expect(draft).toBe("48cb177e-5902");
    expect(JSON.stringify(scope)).toContain("local");
  });

  it("is empty, and says the catalog was not reached, when the read fails", async () => {
    mocks.made.mockRejectedValue(Object.assign(new Error("Failed query: select ... $1"), { code: "ECONNREFUSED" }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await call("d1");
    expect(await response.json()).toEqual({ ok: true, reachable: false, made: [] });
    // By code only: the message carries the statement.
    expect(warn.mock.calls[0][0]).toContain("ECONNREFUSED");
    expect(warn.mock.calls[0][0]).not.toContain("select");
    warn.mockRestore();
  });

  it("refuses an id that is not one, and a request with no session, before reading", async () => {
    expect((await call("..%2Fx")).status).toBe(400);
    mocks.signedIn = false;
    expect((await call("d1")).status).toBe(401);
    expect(mocks.made).not.toHaveBeenCalled();
  });

  it("does not exist where the studio is off", async () => {
    vi.stubEnv("STUDIO_ENABLED", "");
    await expect(call("d1")).rejects.toThrow();
    expect(mocks.made).not.toHaveBeenCalled();
  });
});
