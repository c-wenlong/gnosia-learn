import { LOCAL_LEARNER_ID } from "@self-learn/schema/shared";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * What the web app does when the database is not there.
 *
 * Vercel has no database yet, and a laptop's Postgres is not always running,
 * so this is not an edge case: it is the state the app is in on a fresh clone
 * and on every deploy until the cloud database exists. Reads have to degrade
 * to empty and say so, because a page that renders zero progress and a page
 * that could not ask look identical to a learner and are not the same thing.
 *
 * `DATABASE_URL` is set to a port nothing is listening on before the module is
 * imported: the pool is opened once per process, on first use, and reads the
 * connection string then.
 */
describe("the learner store with no database", () => {
  let store: typeof import("@/lib/learner-store");

  beforeAll(async () => {
    process.env.DATABASE_URL = "postgres://localhost:59999/nothing";
    // The connection attempt is expected, and its warning is noise here.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    store = await import("@/lib/learner-store");
  });

  it("returns an empty learner snapshot rather than throwing", async () => {
    const { state, reachable } = await store.readSnapshot(LOCAL_LEARNER_ID);
    expect(reachable).toBe(false);
    expect(state.completed).toEqual({});
    expect(state.knowledge).toEqual({});
    expect(state.theme).toBe("light");
  });

  it("returns an empty knowledge base rather than throwing", async () => {
    const { kb, reachable } = await store.readKb(LOCAL_LEARNER_ID);
    expect(reachable).toBe(false);
    expect(kb.concepts).toEqual([]);
    expect(kb.stats).toEqual({ total: 0, mastered: 0, learning: 0, untouched: 0 });
  });

  it("lets a write fail, because a silent one is worse", async () => {
    await expect(store.withLearnerStore(async (db) => db.execute("select 1"))).rejects.toThrow();
  });
});
