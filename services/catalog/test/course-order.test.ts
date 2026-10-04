import {
  collection,
  concept,
  conceptCurriculumItem,
  conceptPrerequisite,
  curriculumItem,
  topic,
} from "@self-learn/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { doctor } from "../src/commands/doctor";
import { COMPLETENESS_RULES, setTriggers } from "../src/content/rules";
import { applyMigrations } from "../src/migrations";
import { createScratchDatabase, probe, type Scratch, sqlMessage, sqlstate } from "./scratch-database";

/**
 * Phase 1 of docs/proposals/module-learning-path.md: a course may not teach a
 * concept before a concept it `requires`. The rule reads each concept's first
 * appearance in the course, ordered by module, item and position in the item.
 * `assumes` is soft, so it is a warning in the doctor and never refused.
 */

const reachable = await probe();
const RULE = "course-order-respects-requires";
const CHECK_VIOLATION = "23514";

/**
 * Course zz2000, two modules on topic `alpha`:
 *   m1: t1 [a, b]    t2 [c]
 *   m2: t1 [d]
 * so the teaching order is a, b, c, d.
 */
async function seedCourse(db: Scratch["db"]): Promise<void> {
  await db.insert(topic).values({ slug: "alpha", title: "Alpha", domain: "one" });
  await db.insert(concept).values(
    ["a", "b", "c", "d", "elsewhere"].map((slug) => ({
      slug,
      title: slug,
      topicSlug: "alpha",
      path: `learn/concepts/one/${slug}.md`,
    })),
  );
  await db.insert(collection).values([
    { id: "zz2000", kind: "course", slug: "zz2000", title: "ZZ", parentId: null, position: 1 },
    { id: "zz2000-m1", kind: "module", slug: "m1", title: "M1", parentId: "zz2000", position: 1 },
    { id: "zz2000-m2", kind: "module", slug: "m2", title: "M2", parentId: "zz2000", position: 2 },
  ]);
  // Each module's topic row, which the item-concept-in-module-topic rule reads.
  await db.execute(
    sql`insert into collection_item (collection_id, topic_slug) values ('zz2000-m1', 'alpha'), ('zz2000-m2', 'alpha')`,
  );
  await db.insert(curriculumItem).values([
    { id: "zz2000-m1-t1", collectionId: "zz2000-m1", position: 1, title: "t1" },
    { id: "zz2000-m1-t2", collectionId: "zz2000-m1", position: 2, title: "t2" },
    { id: "zz2000-m2-t1", collectionId: "zz2000-m2", position: 1, title: "t1" },
  ]);
  await db.insert(conceptCurriculumItem).values([
    { conceptSlug: "a", curriculumItemId: "zz2000-m1-t1", position: 1 },
    { conceptSlug: "b", curriculumItemId: "zz2000-m1-t1", position: 2 },
    { conceptSlug: "c", curriculumItemId: "zz2000-m1-t2", position: 1 },
    { conceptSlug: "d", curriculumItemId: "zz2000-m2-t1", position: 1 },
  ]);
  // Edges that agree with the order.
  await db.insert(conceptPrerequisite).values([
    { conceptSlug: "b", prerequisiteSlug: "a", kind: "requires", position: 1 },
    { conceptSlug: "d", prerequisiteSlug: "c", kind: "requires", position: 1 },
  ]);
}

const orderRule = () => {
  const rule = COMPLETENESS_RULES.find((r) => r.name === RULE);
  if (rule === undefined) throw new Error(`no rule named ${RULE}`);
  return rule;
};

const refusedForOrder = (e: unknown) =>
  sqlstate(e) === CHECK_VIOLATION && /is taught before "[a-z-]+", which it requires/.test(sqlMessage(e));

describe.skipIf(!reachable.ok)("the course order rule, disarmed", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    await seedCourse(scratch.db);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("is registered as a courses rule, created disabled by its migration", async () => {
    const rule = orderRule();
    expect(rule.type).toBe("courses");
    const report = await doctor(scratch.db, "scratch");
    const row = report.rules.find((r) => r.name === RULE);
    expect(row).toMatchObject({ state: "disarmed", violators: 0 });
  });

  it("lists a requires edge pointing at a concept taught later, naming the course and both concepts", async () => {
    // c (m1-t2) requires d (m2-t1): d comes later.
    await scratch.db.insert(conceptPrerequisite).values({ conceptSlug: "c", prerequisiteSlug: "d", kind: "requires", position: 1 });
    try {
      const report = await doctor(scratch.db, "scratch");
      const row = report.rules.find((r) => r.name === RULE);
      expect(row?.violators).toBe(1);
      expect(row?.sample).toEqual([{ id: "zz2000", detail: "c before d" }]);
      // Disarmed with a violator is the expected state, not a contradiction.
      expect(report.ok).toBe(true);
    } finally {
      await scratch.db
        .delete(conceptPrerequisite)
        .where(and(eq(conceptPrerequisite.conceptSlug, "c"), eq(conceptPrerequisite.prerequisiteSlug, "d")));
    }
  });

  it("reports an assumes edge out of order as a warning, not a violator", async () => {
    await scratch.db.insert(conceptPrerequisite).values({ conceptSlug: "a", prerequisiteSlug: "b", kind: "assumes", position: 1 });
    try {
      const report = await doctor(scratch.db, "scratch");
      expect(report.rules.find((r) => r.name === RULE)?.violators).toBe(0);
      expect(report.orderWarnings).toEqual([{ course: "zz2000", concept: "a", prerequisite: "b" }]);
    } finally {
      await scratch.db
        .delete(conceptPrerequisite)
        .where(and(eq(conceptPrerequisite.conceptSlug, "a"), eq(conceptPrerequisite.prerequisiteSlug, "b")));
    }
  });

  it("ignores a prerequisite the course does not teach, and an archived item", async () => {
    await scratch.db.insert(conceptPrerequisite).values({ conceptSlug: "a", prerequisiteSlug: "elsewhere", kind: "requires", position: 1 });
    await scratch.db.update(curriculumItem).set({ archivedAt: new Date() }).where(eq(curriculumItem.id, "zz2000-m2-t1"));
    await scratch.db.insert(conceptPrerequisite).values({ conceptSlug: "c", prerequisiteSlug: "d", kind: "requires", position: 2 });
    try {
      const report = await doctor(scratch.db, "scratch");
      expect(report.rules.find((r) => r.name === RULE)?.violators).toBe(0);
    } finally {
      await scratch.db
        .delete(conceptPrerequisite)
        .where(and(eq(conceptPrerequisite.conceptSlug, "c"), eq(conceptPrerequisite.prerequisiteSlug, "d")));
      await scratch.db
        .delete(conceptPrerequisite)
        .where(and(eq(conceptPrerequisite.conceptSlug, "a"), eq(conceptPrerequisite.prerequisiteSlug, "elsewhere")));
      await scratch.db.update(curriculumItem).set({ archivedAt: null }).where(eq(curriculumItem.id, "zz2000-m2-t1"));
    }
  });

  it("reads each concept's first appearance, so a concept taught again later is not out of order", async () => {
    // a is taught again in m2-t1, after d; d requires a, whose first appearance is m1-t1.
    await scratch.db.insert(conceptCurriculumItem).values({ conceptSlug: "a", curriculumItemId: "zz2000-m2-t1", position: 2 });
    await scratch.db.insert(conceptPrerequisite).values({ conceptSlug: "d", prerequisiteSlug: "a", kind: "requires", position: 2 });
    try {
      const report = await doctor(scratch.db, "scratch");
      expect(report.rules.find((r) => r.name === RULE)?.violators).toBe(0);
    } finally {
      await scratch.db
        .delete(conceptPrerequisite)
        .where(and(eq(conceptPrerequisite.conceptSlug, "d"), eq(conceptPrerequisite.prerequisiteSlug, "a")));
      await scratch.db
        .delete(conceptCurriculumItem)
        .where(and(eq(conceptCurriculumItem.conceptSlug, "a"), eq(conceptCurriculumItem.curriculumItemId, "zz2000-m2-t1")));
    }
  });
});

describe.skipIf(!reachable.ok)("the course order rule, armed", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    await seedCourse(scratch.db);
    await setTriggers(scratch.db, orderRule().triggers, true);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("is armed with no violators", async () => {
    const report = await doctor(scratch.db, "scratch");
    expect(report.rules.find((r) => r.name === RULE)).toMatchObject({ state: "armed", violators: 0 });
  });

  it("refuses a new requires edge to a concept the course teaches later", async () => {
    const write = scratch.db.insert(conceptPrerequisite).values({ conceptSlug: "a", prerequisiteSlug: "c", kind: "requires", position: 1 });
    await expect(write).rejects.toSatisfy(refusedForOrder);
    expect(
      await scratch.db.select().from(conceptPrerequisite).where(eq(conceptPrerequisite.conceptSlug, "a")),
    ).toEqual([]);
  });

  it("accepts the same edge as assumes", async () => {
    await scratch.db.insert(conceptPrerequisite).values({ conceptSlug: "a", prerequisiteSlug: "c", kind: "assumes", position: 1 });
    await scratch.db
      .delete(conceptPrerequisite)
      .where(and(eq(conceptPrerequisite.conceptSlug, "a"), eq(conceptPrerequisite.prerequisiteSlug, "c")));
  });

  it("refuses turning an assumes edge out of order into requires", async () => {
    await scratch.db.insert(conceptPrerequisite).values({ conceptSlug: "a", prerequisiteSlug: "c", kind: "assumes", position: 1 });
    try {
      const write = scratch.db
        .update(conceptPrerequisite)
        .set({ kind: "requires" })
        .where(and(eq(conceptPrerequisite.conceptSlug, "a"), eq(conceptPrerequisite.prerequisiteSlug, "c")));
      await expect(write).rejects.toSatisfy(refusedForOrder);
    } finally {
      await scratch.db
        .delete(conceptPrerequisite)
        .where(and(eq(conceptPrerequisite.conceptSlug, "a"), eq(conceptPrerequisite.prerequisiteSlug, "c")));
    }
  });

  it("refuses reordering items so a prerequisite comes after the concept that needs it", async () => {
    // Swap the modules: m2 [d] before m1 [c], and d requires c.
    const swap = scratch.db.transaction(async (t) => {
      await t.update(collection).set({ position: 3 }).where(eq(collection.id, "zz2000-m1"));
      await t.update(collection).set({ position: 1 }).where(eq(collection.id, "zz2000-m2"));
    });
    await expect(swap).rejects.toSatisfy(refusedForOrder);
    const [m1] = await scratch.db.select().from(collection).where(eq(collection.id, "zz2000-m1"));
    expect(m1?.position).toBe(1);
  });

  it("refuses moving a concept within its item to before its prerequisite", async () => {
    const swap = scratch.db.transaction(async (t) => {
      await t
        .update(conceptCurriculumItem)
        .set({ position: 3 })
        .where(and(eq(conceptCurriculumItem.conceptSlug, "a"), eq(conceptCurriculumItem.curriculumItemId, "zz2000-m1-t1")));
    });
    await expect(swap).rejects.toSatisfy(refusedForOrder);
  });

  it("refuses deleting a live item when that moves a prerequisite's first appearance after a concept needing it", async () => {
    // a is taught in m1-t1 and again in m2-t2; d (m2-t1) requires a. Deleting
    // m1-t1 cascades its links away, and a's first appearance becomes m2-t2.
    await scratch.db.insert(curriculumItem).values({ id: "zz2000-m2-t2", collectionId: "zz2000-m2", position: 2, title: "t2" });
    await scratch.db.insert(conceptCurriculumItem).values({ conceptSlug: "a", curriculumItemId: "zz2000-m2-t2", position: 1 });
    await scratch.db.insert(conceptPrerequisite).values({ conceptSlug: "d", prerequisiteSlug: "a", kind: "requires", position: 2 });
    try {
      const remove = scratch.db.transaction(async (t) => {
        await t.delete(curriculumItem).where(eq(curriculumItem.id, "zz2000-m1-t1"));
      });
      await expect(remove).rejects.toSatisfy(refusedForOrder);
      expect(await scratch.db.select().from(curriculumItem).where(eq(curriculumItem.id, "zz2000-m1-t1"))).toHaveLength(1);
    } finally {
      await scratch.db
        .delete(conceptPrerequisite)
        .where(and(eq(conceptPrerequisite.conceptSlug, "d"), eq(conceptPrerequisite.prerequisiteSlug, "a")));
      await scratch.db.delete(curriculumItem).where(eq(curriculumItem.id, "zz2000-m2-t2"));
    }
  });

  it("accepts a reorder that keeps every requires edge", async () => {
    // b requires a, d requires c: putting m1-t2 [c] first keeps both.
    await scratch.db.transaction(async (t) => {
      await t.update(curriculumItem).set({ position: 3 }).where(eq(curriculumItem.id, "zz2000-m1-t1"));
      await t.update(curriculumItem).set({ position: 1 }).where(eq(curriculumItem.id, "zz2000-m1-t2"));
    });
    const report = await doctor(scratch.db, "scratch");
    expect(report.rules.find((r) => r.name === RULE)?.violators).toBe(0);
  });
});
