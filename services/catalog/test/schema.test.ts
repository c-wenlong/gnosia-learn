import {
  asset,
  assetTopic,
  collection,
  collectionItem,
  concept,
  conceptPrerequisite,
  event,
  learner,
  LOCAL_LEARNER_ID,
  session,
  tables,
  topic,
} from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations, migrationStatus } from "../src/migrations";
import {
  createScratchDatabase,
  probe,
  type Scratch,
  sqlMessage,
  SQLSTATE,
  sqlstate,
} from "./scratch-database";
import { storedBlob } from "./stored-blob";

// Decided once, at load, so the suite can name its reason in the title instead
// of failing on a machine with no Postgres.
const reachable = await probe();

describe.skipIf(!reachable.ok)("catalog schema", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
  }, 30_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  describe("migrations", () => {
    it("applies from empty", async () => {
      const before = await migrationStatus(scratch.db);
      expect(before.head).toBeNull();
      expect(before.pending.length).toBeGreaterThan(0);

      await applyMigrations(scratch.db);

      const after = await migrationStatus(scratch.db);
      expect(after.pending).toEqual([]);
      expect(after.head).toBe(after.latest);
      // Every table in the schema package exists, not just the ones the rest of
      // this file touches, and nothing the package does not know about.
      const { rows } = await scratch.db.execute<{ n: number }>(
        sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
      );
      expect(rows[0]?.n).toBe(Object.keys(tables).length);
      expect(rows[0]?.n).toBe(35);
    });

    it("is idempotent", async () => {
      const first = await migrationStatus(scratch.db);
      await expect(applyMigrations(scratch.db)).resolves.toBeUndefined();
      await expect(applyMigrations(scratch.db)).resolves.toBeUndefined();
      const second = await migrationStatus(scratch.db);
      expect(second).toEqual(first);
    });
  });

  describe("constraints", () => {
    beforeAll(async () => {
      await applyMigrations(scratch.db);
      // Migration 0010 seeds the `local` row, so this is a no-op on a fresh
      // database and stays here for the older migrations' sake.
      await scratch.db.insert(learner).values({ id: LOCAL_LEARNER_ID }).onConflictDoNothing();
      await scratch.db
        .insert(topic)
        .values({ slug: "asymptotics", title: "Asymptotics", domain: "algorithms" });
      await scratch.db.insert(concept).values([
        {
          slug: "master-theorem",
          title: "Master Theorem",
          topicSlug: "asymptotics",
          path: "learn/concepts/algorithms/master-theorem.md",
        },
        {
          slug: "recursion-tree-method",
          title: "Recursion tree method",
          topicSlug: "asymptotics",
          path: "learn/concepts/algorithms/recursion-tree-method.md",
        },
      ]);
      await scratch.db.insert(collection).values({
        id: "cs4263",
        kind: "course",
        slug: "cs4263",
        title: "Artificial Intelligence Principles",
      });
      await scratch.db.insert(asset).values({
        id: "manimkc:algorithms/master-theorem/video",
        kind: "video",
        path: "out/algorithms/master-theorem/main.mp4",
        sourceRepo: "manimkc",
        blobKey: await storedBlob(scratch.db, "master-theorem", "mp4"),
      });
    }, 30_000);

    it("refuses an asset_topic row whose topic does not exist", async () => {
      const error = await scratch.db
        .insert(assetTopic)
        .values({
          assetId: "manimkc:algorithms/master-theorem/video",
          topicSlug: "no-such-topic",
        })
        .catch((e: unknown) => e);
      expect(sqlstate(error)).toBe(SQLSTATE.foreignKeyViolation);
    });

    it("accepts an asset_topic row whose topic does exist", async () => {
      await expect(
        scratch.db.insert(assetTopic).values({
          assetId: "manimkc:algorithms/master-theorem/video",
          topicSlug: "asymptotics",
        }),
      ).resolves.toBeDefined();
    });

    it("refuses a prerequisite kind outside requires|assumes", async () => {
      const error = await scratch.db
        .insert(conceptPrerequisite)
        .values({
          conceptSlug: "master-theorem",
          prerequisiteSlug: "recursion-tree-method",
          kind: "implies",
        })
        .catch((e: unknown) => e);
      expect(sqlstate(error)).toBe(SQLSTATE.checkViolation);
    });

    it("accepts requires and assumes", async () => {
      for (const kind of ["requires", "assumes"] as const) {
        await expect(
          scratch.db.insert(conceptPrerequisite).values({
            conceptSlug: "master-theorem",
            prerequisiteSlug: "recursion-tree-method",
            kind,
          }),
        ).resolves.toBeDefined();
      }
    });

    it("refuses a collection_item with no target", async () => {
      const error = await scratch.db
        .insert(collectionItem)
        .values({ collectionId: "cs4263" })
        .catch((e: unknown) => e);
      expect(sqlstate(error)).toBe(SQLSTATE.checkViolation);
    });

    it("refuses a collection_item with two targets", async () => {
      const error = await scratch.db
        .insert(collectionItem)
        .values({
          collectionId: "cs4263",
          topicSlug: "asymptotics",
          conceptSlug: "master-theorem",
        })
        .catch((e: unknown) => e);
      expect(sqlstate(error)).toBe(SQLSTATE.checkViolation);
    });

    it("accepts a collection_item with exactly one target", async () => {
      await expect(
        scratch.db
          .insert(collectionItem)
          .values({ collectionId: "cs4263", topicSlug: "asymptotics" }),
      ).resolves.toBeDefined();
    });
  });

  describe("event is append-only", () => {
    beforeAll(async () => {
      // `event.session_id` is a foreign key since 0006, so the session has to
      // exist before an event can name it.
      await scratch.db.insert(session).values({
        id: "2026-08-20-asymptotic-analysis",
        kind: "tutor",
        learnerId: LOCAL_LEARNER_ID,
        state: "running",
      });
      await scratch.db.insert(event).values({
        learnerId: LOCAL_LEARNER_ID,
        type: "observation",
        conceptSlug: "master-theorem",
        sessionId: "2026-08-20-asymptotic-analysis",
        payload: { correct: true, grade: 3 },
      });
    });

    it("refuses an UPDATE", async () => {
      const error = await scratch.db
        .update(event)
        .set({ type: "void" })
        .where(eq(event.type, "observation"))
        .catch((e: unknown) => e);
      expect(sqlstate(error)).toBe(SQLSTATE.restrictViolation);
      expect(sqlMessage(error)).toContain("event is append-only");
    });

    it("refuses a DELETE", async () => {
      const error = await scratch.db
        .delete(event)
        .where(eq(event.type, "observation"))
        .catch((e: unknown) => e);
      expect(sqlstate(error)).toBe(SQLSTATE.restrictViolation);
    });

    it("still holds the row", async () => {
      const { rows } = await scratch.db.execute<{ n: number }>(
        sql`select count(*)::int as n from ${event}`,
      );
      expect(rows[0]?.n).toBe(1);
    });

    it("does not block deleting an unrelated concept", async () => {
      // Regression for 0003. The guard used to be `FOR EACH STATEMENT`, so the
      // referential `UPDATE ONLY event SET concept_slug = NULL` that Postgres
      // runs when any concept is deleted tripped it even when the statement
      // matched no event at all. Every concept row was permanently
      // undeletable, which breaks the indexers' contract that a derived row
      // goes when the file it came from does.
      //
      // This runs with an event already in the table, so it proves the guard
      // still distinguishes "no event is affected" from "the log is empty".
      await scratch.db.insert(concept).values({
        slug: "deletable",
        title: "Deletable",
        topicSlug: "asymptotics",
        path: "learn/concepts/algorithms/deletable.md",
      });

      await expect(
        scratch.db.delete(concept).where(eq(concept.slug, "deletable")),
      ).resolves.toBeDefined();

      const left = await scratch.db.select().from(concept).where(eq(concept.slug, "deletable"));
      expect(left).toEqual([]);
    });
  });
});

// Vitest reports an empty suite as passing with nothing in it, which reads as
// "no tests exist" rather than "they were skipped and here is why". This makes
// the reason visible in the run output either way.
describe.runIf(!reachable.ok)("catalog schema (skipped)", () => {
  it.skip(`needs Postgres — ${reachable.reason}`, () => {});
});
