import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { LOCAL_LEARNER_ID } from "@gnosia/schema/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * What the web app does when the database cannot be opened.
 *
 * A catalog file in a directory that cannot exist, a file that is locked or
 * not a database: reads have to degrade to empty and say so, because a page
 * that renders zero progress and a page that could not ask look identical to
 * a learner and are not the same thing.
 *
 * `CATALOG_DB` names a path under a regular file before the module is
 * imported, so `connect` cannot create it: the handle is opened once per
 * process, on first use, and resolves the path then. `CATALOG_DB` wins over
 * `DATABASE_URL`, so this is the variable to set, and an inherited
 * `DATABASE_URL` is cleared so nothing real is reachable by accident.
 */
describe("the learner store with no database", () => {
  let store: typeof import("@/lib/learner-store");
  const saved = { catalog: process.env.CATALOG_DB, url: process.env.DATABASE_URL };
  const scratch = mkdtempSync(path.join(tmpdir(), "learner-store-"));

  beforeAll(async () => {
    const notADirectory = path.join(scratch, "file");
    writeFileSync(notADirectory, "");
    process.env.CATALOG_DB = path.join(notADirectory, "catalog.db");
    delete process.env.DATABASE_URL;
    // The failed open is expected, and its warning is noise here.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    store = await import("@/lib/learner-store");
  });

  afterAll(() => {
    if (saved.catalog === undefined) delete process.env.CATALOG_DB;
    else process.env.CATALOG_DB = saved.catalog;
    if (saved.url !== undefined) process.env.DATABASE_URL = saved.url;
    rmSync(scratch, { recursive: true, force: true });
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
