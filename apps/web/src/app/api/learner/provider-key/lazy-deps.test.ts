import { describe, expect, it, vi } from "vitest";

import { migratedScratchDatabase } from "../../../../../../../services/catalog/test/scratch-database";

/**
 * The Settings writes run on the learner writes' lazy deps: a body refused
 * before the write opens no database (so no rejected promise is left with
 * nobody awaiting it), and a blob store that cannot open never reaches
 * them, since none of them uses one.
 */

const catalogDatabase = vi.hoisted(() => vi.fn(() => Promise.reject(new Error("stub: no database"))));
const assetBlobStore = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("stub: blob store refused");
  }),
);
vi.mock("@/lib/learner-store", () => ({ catalogDatabase }));
vi.mock("@/lib/blob-store", () => ({ assetBlobStore }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

const ORIGIN = "http://localhost:3000";

function post(path: string, body: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "localhost:3000", origin: ORIGIN },
    body: JSON.stringify(body),
  });
}

describe("the Settings write routes' deps", () => {
  it("refuse a bad body without opening the database or the blob store", async () => {
    const { POST } = await import("./route");
    const response = await POST(post("/api/learner/provider-key", { provider: "nobody", key: "x" }));
    expect(response.status).toBe(400);
    expect(catalogDatabase).not.toHaveBeenCalled();
    expect(assetBlobStore).not.toHaveBeenCalled();
  });

  it("answer a chain write with the blob store unable to open", async () => {
    // A database that answers, so the reply comes from the write itself: with
    // the database refused too, a 503 would say nothing about the blob store.
    const scratch = await migratedScratchDatabase();
    try {
      catalogDatabase.mockResolvedValue(scratch.db as never);
      // The server's key, so the write has a key to file the model under.
      vi.stubEnv("GEMINI_API_KEY", "AIza-lazy-deps-test-key-0123456789");
      const { POST } = await import("../tutor-model/route");
      const response = await POST(post("/api/learner/tutor-model", { provider: "gemini", model: "gemini-2.5-flash" }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
      expect(catalogDatabase).toHaveBeenCalled();
      expect(assetBlobStore).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      catalogDatabase.mockReset();
      await scratch.drop();
    }
  });
});
