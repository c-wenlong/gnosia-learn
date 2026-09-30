import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adding a model when the saved keys cannot be read (the database is down)
 * is a 503 with a retry message, not a 400 saying there is no key
 * (docs/TUTOR-MODELS.md, T5). Everything behind the route is mocked; the
 * database-backed behaviour is in `route.test.ts`.
 */

const openSavedKeys = vi.hoisted(() => vi.fn());
const addChainEntry = vi.hoisted(() => vi.fn());
vi.mock("@/lib/provider-keys/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/provider-keys/store")>()),
  openSavedKeys,
}));
vi.mock("@/lib/tutor-models/store", () => ({ addChainEntry, removeChainEntry: vi.fn(), moveChainEntry: vi.fn() }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

const ORIGIN = "http://localhost:3000";

function add(body: unknown): Request {
  return new Request(`${ORIGIN}/api/learner/tutor-model`, {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "localhost:3000", origin: ORIGIN, "x-forwarded-for": "10.5.0.1" },
    body: JSON.stringify(body),
  });
}

describe("adding a model with the saved keys unreadable", () => {
  beforeEach(() => {
    openSavedKeys.mockReset();
    addChainEntry.mockReset();
  });

  it("is a 503 asking to try again, and stores nothing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    openSavedKeys.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    const { POST } = await import("./route");
    const response = await POST(add({ provider: "gemini", model: "gemini-2.5-flash" }));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { code: string; error: string };
    expect(body.code).toBe("STORE_UNAVAILABLE");
    expect(body.error).toMatch(/Try again/);
    expect(addChainEntry).not.toHaveBeenCalled();
  });
});
