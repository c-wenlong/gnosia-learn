import { checkDistractor, concept, learner, LOCAL_LEARNER_ID } from "@gnosia/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { readCheckDistractors, writeCheckDistractor } from "../src/state";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { seedContent } from "./state-fixture";

/**
 * `check_distractor`: the tutor's wrong options per note check, a cache.
 *
 * Held here: a write replaces the row for its check id (a new hash's options
 * take the old one's place); a read is one learner's rows and never
 * another's, for the same note; the writer and the table both refuse
 * anything but three strings; and deleting the concept takes its rows.
 */

const reachable = await probe();
const OTHER = "owner-b";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe.skipIf(!reachable.ok)("check_distractor", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);
    await scratch.db.insert(learner).values([{ id: LOCAL_LEARNER_ID }, { id: OTHER }]).onConflictDoNothing();
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    await scratch.db.delete(checkDistractor);
  });

  it("stores three options and reads them back for that learner only", async () => {
    await writeCheckDistractor(scratch.db, LOCAL_LEARNER_ID, {
      conceptSlug: "alpha",
      checkId: "c1",
      checkHash: HASH_A,
      options: ["one", "two", "three"],
      model: "m",
      provider: "nvidia",
    });
    expect(await readCheckDistractors(scratch.db, LOCAL_LEARNER_ID, ["alpha", "beta"])).toEqual([
      { conceptSlug: "alpha", checkId: "c1", checkHash: HASH_A, options: ["one", "two", "three"], model: "m", provider: "nvidia" },
    ]);
    // Owner scoping: another learner reading the same note sees none of them.
    expect(await readCheckDistractors(scratch.db, OTHER, ["alpha"])).toEqual([]);
    expect(await readCheckDistractors(scratch.db, LOCAL_LEARNER_ID, [])).toEqual([]);
  });

  it("replaces a check's row when its hash changes, and keeps learners apart", async () => {
    const base = { conceptSlug: "alpha", checkId: "c1" };
    await writeCheckDistractor(scratch.db, LOCAL_LEARNER_ID, { ...base, checkHash: HASH_A, options: ["a1", "a2", "a3"] });
    await writeCheckDistractor(scratch.db, OTHER, { ...base, checkHash: HASH_A, options: ["o1", "o2", "o3"] });
    await writeCheckDistractor(scratch.db, LOCAL_LEARNER_ID, { ...base, checkHash: HASH_B, options: ["b1", "b2", "b3"] });

    const mine = await readCheckDistractors(scratch.db, LOCAL_LEARNER_ID, ["alpha"]);
    expect(mine.map((r) => [r.checkHash, r.options])).toEqual([[HASH_B, ["b1", "b2", "b3"]]]);
    const theirs = await readCheckDistractors(scratch.db, OTHER, ["alpha"]);
    expect(theirs.map((r) => [r.checkHash, r.options])).toEqual([[HASH_A, ["o1", "o2", "o3"]]]);
  });

  it("refuses anything but three non-empty strings, in the writer and in the table", async () => {
    const base = { conceptSlug: "alpha", checkId: "c1", checkHash: HASH_A };
    await expect(writeCheckDistractor(scratch.db, LOCAL_LEARNER_ID, { ...base, options: ["a", "b"] })).rejects.toThrow(RangeError);
    await expect(writeCheckDistractor(scratch.db, LOCAL_LEARNER_ID, { ...base, options: ["a", "b", " "] })).rejects.toThrow(RangeError);
    await expect(
      writeCheckDistractor(scratch.db, LOCAL_LEARNER_ID, { ...base, options: ["a", "b", "x".repeat(401)] }),
    ).rejects.toThrow(RangeError);

    const raw = (values: Partial<typeof checkDistractor.$inferInsert>) =>
      scratch.db
        .insert(checkDistractor)
        .values({ learnerId: LOCAL_LEARNER_ID, conceptSlug: "alpha", checkId: "c1", checkHash: HASH_A, options: '["a","b","c"]', ...values })
        .catch((e: unknown) => e);
    expect(await raw({ options: '["a","b"]' })).toBeInstanceOf(Error);
    expect(await raw({ options: "not json" })).toBeInstanceOf(Error);
    expect(await raw({ checkHash: "short" })).toBeInstanceOf(Error);
    expect(await raw({ checkId: "q1" })).toBeInstanceOf(Error);
    expect(await raw({})).not.toBeInstanceOf(Error);
  });

  it("goes with its concept", async () => {
    await scratch.db.insert(concept).values({ slug: "doomed", title: "Doomed", topicSlug: "fixture-topic", path: "x.md" });
    await writeCheckDistractor(scratch.db, LOCAL_LEARNER_ID, {
      conceptSlug: "doomed",
      checkId: "c2",
      checkHash: HASH_A,
      options: ["a", "b", "c"],
    });
    await scratch.db.delete(concept).where(eq(concept.slug, "doomed"));
    expect(await readCheckDistractors(scratch.db, LOCAL_LEARNER_ID, ["doomed"])).toEqual([]);
  });
});
