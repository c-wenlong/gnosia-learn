import { learner, LOCAL_LEARNER_ID, TUTOR_MODEL_LIMITS, tutorModel } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  addTutorModel,
  deleteTutorProvider,
  moveTutorModel,
  moveTutorProvider,
  readTutorModels,
  removeTutorModel,
  type StoredTutorModel,
  TutorModelError,
} from "../src/state";
import { migratedScratchDatabase, probe, type Scratch, sqlstate } from "./scratch-database";

/**
 * `tutor_model` (docs/TUTOR-MODELS.md): the owner's ordered model chain.
 *
 * Held here: positions stay 0 to n-1 through every add, remove and move; the
 * chain refuses duplicates, a full chain and a malformed id, in the function
 * and in the table; and owner B never reads, moves or removes owner A's
 * entries.
 */

const reachable = await probe();
const OTHER = "owner-b";

function shape(rows: StoredTutorModel[]): string[] {
  return rows.map((r) => `${r.position}:${r.provider}/${r.model}`);
}

describe.skipIf(!reachable.ok)("tutor_model", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await scratch.db.insert(learner).values([{ id: LOCAL_LEARNER_ID }, { id: OTHER }]).onConflictDoNothing();
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    await scratch.db.delete(tutorModel);
  });

  it("adds at the bottom, and a new owner's chain is empty", async () => {
    expect(await readTutorModels(scratch.db, LOCAL_LEARNER_ID)).toEqual([]);
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "google/gemma-4-31b-it");
    const rows = await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "openrouter", " openrouter/free\n");
    expect(shape(rows)).toEqual(["0:nvidia/google/gemma-4-31b-it", "1:openrouter/openrouter/free"]);
  });

  it("keeps positions contiguous after a remove, and keeps each entry's createdAt through a rewrite", async () => {
    for (const model of ["a", "b", "c", "d"]) await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "gemini", model);
    const before = await readTutorModels(scratch.db, LOCAL_LEARNER_ID);
    const rows = await removeTutorModel(scratch.db, LOCAL_LEARNER_ID, "gemini", "b");
    expect(shape(rows)).toEqual(["0:gemini/a", "1:gemini/c", "2:gemini/d"]);
    expect(rows.find((r) => r.model === "d")?.createdAt.getTime()).toBe(before.find((r) => r.model === "d")?.createdAt.getTime());

    const top = await removeTutorModel(scratch.db, LOCAL_LEARNER_ID, "gemini", "a");
    expect(shape(top)).toEqual(["0:gemini/c", "1:gemini/d"]);
    await expect(removeTutorModel(scratch.db, LOCAL_LEARNER_ID, "gemini", "a")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("moves an entry one place, and moving past either end changes nothing", async () => {
    for (const model of ["a", "b", "c"]) await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "gemini", model);
    expect(shape(await moveTutorModel(scratch.db, LOCAL_LEARNER_ID, "gemini", "c", "up"))).toEqual([
      "0:gemini/a",
      "1:gemini/c",
      "2:gemini/b",
    ]);
    expect(shape(await moveTutorModel(scratch.db, LOCAL_LEARNER_ID, "gemini", "a", "down"))).toEqual([
      "0:gemini/c",
      "1:gemini/a",
      "2:gemini/b",
    ]);
    expect(shape(await moveTutorModel(scratch.db, LOCAL_LEARNER_ID, "gemini", "c", "up"))).toEqual([
      "0:gemini/c",
      "1:gemini/a",
      "2:gemini/b",
    ]);
    expect(shape(await moveTutorModel(scratch.db, LOCAL_LEARNER_ID, "gemini", "b", "down"))).toEqual([
      "0:gemini/c",
      "1:gemini/a",
      "2:gemini/b",
    ]);
    await expect(moveTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "a", "up")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps each provider's models together: an add joins its provider, a move stays inside it", async () => {
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "a");
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "openrouter", "x");
    const rows = await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "b");
    expect(shape(rows)).toEqual(["0:nvidia/a", "1:nvidia/b", "2:openrouter/x"]);
    // b is the last of NVIDIA's: moving it down does not cross into OpenRouter's.
    expect(shape(await moveTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "b", "down"))).toEqual([
      "0:nvidia/a",
      "1:nvidia/b",
      "2:openrouter/x",
    ]);
    expect(shape(await moveTutorModel(scratch.db, LOCAL_LEARNER_ID, "openrouter", "x", "up"))).toEqual([
      "0:nvidia/a",
      "1:nvidia/b",
      "2:openrouter/x",
    ]);
  });

  it("groups a chain stored before the grouping on its next write", async () => {
    await scratch.db.insert(tutorModel).values([
      { ownerId: LOCAL_LEARNER_ID, position: 0, provider: "nvidia", model: "a" },
      { ownerId: LOCAL_LEARNER_ID, position: 1, provider: "gemini", model: "g" },
      { ownerId: LOCAL_LEARNER_ID, position: 2, provider: "nvidia", model: "b" },
    ]);
    const rows = await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "openrouter", "x");
    expect(shape(rows)).toEqual(["0:nvidia/a", "1:nvidia/b", "2:gemini/g", "3:openrouter/x"]);
  });

  it("moves a provider's models together, and removes them together", async () => {
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "a");
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "b");
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "openrouter", "x");
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "gemini", "g");
    expect(shape(await moveTutorProvider(scratch.db, LOCAL_LEARNER_ID, "openrouter", "up"))).toEqual([
      "0:openrouter/x",
      "1:nvidia/a",
      "2:nvidia/b",
      "3:gemini/g",
    ]);
    expect(shape(await moveTutorProvider(scratch.db, LOCAL_LEARNER_ID, "nvidia", "down"))).toEqual([
      "0:openrouter/x",
      "1:gemini/g",
      "2:nvidia/a",
      "3:nvidia/b",
    ]);
    // Already last: nothing changes.
    expect(shape(await moveTutorProvider(scratch.db, LOCAL_LEARNER_ID, "nvidia", "down"))).toHaveLength(4);
    const deleted = await deleteTutorProvider(scratch.db, LOCAL_LEARNER_ID, "nvidia");
    expect(shape(deleted.chain)).toEqual(["0:openrouter/x", "1:gemini/g"]);
    expect(deleted.keyRemoved).toBe(false);
    // A provider with no models: deleting is a no-op, moving is NOT_FOUND.
    expect((await deleteTutorProvider(scratch.db, LOCAL_LEARNER_ID, "nvidia")).chain).toHaveLength(2);
    await expect(moveTutorProvider(scratch.db, LOCAL_LEARNER_ID, "nvidia", "up")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(moveTutorProvider(scratch.db, LOCAL_LEARNER_ID, "bogus", "up")).rejects.toMatchObject({ code: "INVALID" });
    // Another owner's providers are not touched.
    expect((await deleteTutorProvider(scratch.db, OTHER, "openrouter")).chain).toEqual([]);
    expect(await readTutorModels(scratch.db, LOCAL_LEARNER_ID)).toHaveLength(2);
  });

  it("refuses an add whose provider lost its saved key by the time it holds the lock", async () => {
    await expect(
      addTutorModel(scratch.db, LOCAL_LEARNER_ID, "openrouter", "x", { requireKey: { server: false } }),
    ).rejects.toMatchObject({ code: "NO_KEY" });
    // A server key needs no saved row.
    expect(shape(await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "a", { requireKey: { server: true } }))).toEqual([
      "0:nvidia/a",
    ]);
  });

  it("stays contiguous when many changes race", async () => {
    for (const model of ["a", "b", "c", "d", "e"]) await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", model);
    await Promise.allSettled([
      moveTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "e", "up"),
      removeTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "b"),
      moveTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "a", "down"),
      addTutorModel(scratch.db, LOCAL_LEARNER_ID, "gemini", "f"),
      removeTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "d"),
    ]);
    const rows = await readTutorModels(scratch.db, LOCAL_LEARNER_ID);
    expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i));
    expect(rows).toHaveLength(4);
  });

  it("refuses a duplicate, a full chain and a malformed entry, without repeating the value", async () => {
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "gemini", "gemini-2.5-flash");
    await expect(addTutorModel(scratch.db, LOCAL_LEARNER_ID, "gemini", "gemini-2.5-flash")).rejects.toMatchObject({ code: "DUPLICATE" });
    // The same id under another provider is another entry.
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "openrouter", "gemini-2.5-flash");

    for (const [provider, model] of [
      ["openai", "gpt"],
      ["gemini", ""],
      ["gemini", "has space"],
      ["gemini", "tab\there"],
      ["gemini", "ünïcode"],
      ["gemini", "x".repeat(TUTOR_MODEL_LIMITS.maxModelChars + 1)],
      ["gemini", 42],
      // A key pasted as a model id would be stored in the clear (T11).
      ["nvidia", "nvapi-Zk3xQ9vB7mW2pL5tR8yN4cH6dF1gJ0sAqWeRtYuIo"],
      ["openrouter", "sk-or-v1-0123456789abcdef0123456789abcdef"],
    ] as const) {
      const error = await addTutorModel(scratch.db, LOCAL_LEARNER_ID, provider, model).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TutorModelError);
      expect((error as TutorModelError).code).toBe("INVALID");
      if (typeof model === "string" && model.length > 3) expect((error as Error).message).not.toContain(model);
    }

    await scratch.db.delete(tutorModel);
    for (let i = 0; i < TUTOR_MODEL_LIMITS.maxEntries; i += 1) await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", `m${i}`);
    await expect(addTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "one-more")).rejects.toMatchObject({ code: "FULL" });
    expect(await readTutorModels(scratch.db, LOCAL_LEARNER_ID)).toHaveLength(TUTOR_MODEL_LIMITS.maxEntries);
  });

  it("holds its shape in the table whatever a writer sends", async () => {
    const base = { ownerId: LOCAL_LEARNER_ID, position: 0, provider: "gemini", model: "ok" };
    for (const values of [
      { ...base, provider: "openai" },
      { ...base, model: "" },
      { ...base, model: "has space" },
      { ...base, model: "x".repeat(TUTOR_MODEL_LIMITS.maxModelChars + 1) },
      { ...base, position: -1 },
      { ...base, position: TUTOR_MODEL_LIMITS.maxEntries },
    ]) {
      const error = await scratch.db.insert(tutorModel).values(values).catch((e: unknown) => e);
      expect(sqlstate(error), JSON.stringify(values).slice(0, 80)).toBe("23514");
    }
    await scratch.db.insert(tutorModel).values(base);
    // Two entries cannot share a place, and one entry cannot be listed twice.
    const samePlace = await scratch.db.insert(tutorModel).values({ ...base, model: "other" }).catch((e: unknown) => e);
    expect(sqlstate(samePlace)).toBe("23505");
    const twice = await scratch.db.insert(tutorModel).values({ ...base, position: 1 }).catch((e: unknown) => e);
    expect(sqlstate(twice)).toBe("23505");
    // No default owner.
    const noOwner = await scratch.db
      .execute(sql`insert into tutor_model (position, provider, model) values (3, 'gemini', 'x')`)
      .catch((e: unknown) => e);
    expect(sqlstate(noOwner)).toBe("23502");
  });

  it("never crosses owners: B reads none of A's chain and cannot move or remove it", async () => {
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "a");
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "b");
    expect(await readTutorModels(scratch.db, OTHER)).toEqual([]);
    await expect(removeTutorModel(scratch.db, OTHER, "nvidia", "a")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(moveTutorModel(scratch.db, OTHER, "nvidia", "b", "up")).rejects.toMatchObject({ code: "NOT_FOUND" });

    // B's own chain has its own positions, starting at 0, beside A's.
    expect(shape(await addTutorModel(scratch.db, OTHER, "nvidia", "a"))).toEqual(["0:nvidia/a"]);
    expect(shape(await readTutorModels(scratch.db, LOCAL_LEARNER_ID))).toEqual(["0:nvidia/a", "1:nvidia/b"]);
    await removeTutorModel(scratch.db, OTHER, "nvidia", "a");
    expect(shape(await readTutorModels(scratch.db, LOCAL_LEARNER_ID))).toEqual(["0:nvidia/a", "1:nvidia/b"]);
  });

  it("goes with its owner", async () => {
    await scratch.db.insert(learner).values({ id: "owner-gone" });
    await addTutorModel(scratch.db, "owner-gone", "gemini", "a");
    await scratch.db.delete(learner).where(eq(learner.id, "owner-gone"));
    expect(await readTutorModels(scratch.db, "owner-gone")).toEqual([]);
  });
});
