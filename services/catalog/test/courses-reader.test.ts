import { tmpdir } from "node:os";
import path from "node:path";

import { fileSource } from "@self-learn/content";
import { collection, curriculumItem } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import type { PgTransactionConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_READERS } from "../src/content/flip";
import { readCourses } from "../src/content/readers/courses";
import { dbSource } from "../src/content/source";
import { runIndex } from "../src/index/run";
import { applyMigrations } from "../src/migrations";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";
import { SEED } from "./seed";
import { LOCAL_LEARNER_ID, ownerScope } from "@self-learn/schema";

/** Who these reads are for: the one owner there is today (phase 4 scoping). */
const LOCAL = ownerScope(LOCAL_LEARNER_ID);

/**
 * Track B's database reader (docs/CONTENT-MIGRATION.md, phase 1): the courses
 * `fileSource` reads from `content/courses/`, read back from the rows an
 * import of the same tree wrote.
 *
 * "The same" means `JSON.stringify` equal, not just deep equal: the pages hand
 * courses to client components as props, React serialises them in key order,
 * and the flip is checked by the server HTML being byte-identical between the
 * two sources. The seed tree is imported read only into a scratch database.
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("the courses reader", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    await runIndex(scratch.db, {
      repoRoot: SEED,
      only: ["topics", "tags", "concepts", "courses"],
      manimkcRoot: path.join(tmpdir(), "catalog-test-no-manimkc"),
    });
  }, 120_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("is ready, so `catalog flip courses` accepts it", () => {
    expect(DB_READERS.has("courses")).toBe(true);
  });

  it("returns what fileSource returns for the seed, key for key and in order", async () => {
    const files = await fileSource(SEED).courses();
    const rows = await dbSource(scratch.db, LOCAL).courses();
    expect(rows.length).toBe(1);
    expect(rows.reduce((n, c) => n + c.modules.length, 0)).toBe(2);
    expect(rows.reduce((n, c) => n + c.modules.reduce((m, mod) => m + mod.topics.length, 0), 0)).toBe(5);
    expect(rows.reduce((n, c) => n + c.modules.reduce((m, mod) => m + mod.resources.length, 0), 0)).toBe(4);
    expect(JSON.stringify(rows)).toBe(JSON.stringify(files));
  });

  it("reads the whole tree from one snapshot", async () => {
    const statements: string[] = [];
    const logged = new Proxy(scratch.db, {
      get(target, key, receiver) {
        if (key !== "transaction") return Reflect.get(target, key, receiver);
        return (fn: never, config: PgTransactionConfig) => {
          statements.push(`${config.isolationLevel ?? ""} ${config.accessMode ?? ""}`);
          return target.transaction(fn, config);
        };
      },
    });
    await readCourses(logged);
    expect(statements).toEqual(["repeatable read read only"]);
  });

  it("leaves out archived items, modules and courses", async () => {
    const [first] = await readCourses(scratch.db);
    const mod = first?.modules[0];
    const item = mod?.topics[0];
    const other = first?.modules[1];
    if (first === undefined || mod === undefined || item === undefined || other === undefined) {
      throw new Error("the seed has no course with two modules");
    }
    await scratch.db.update(curriculumItem).set({ archivedAt: sql`now()` }).where(eq(curriculumItem.id, item.id));
    await scratch.db.update(collection).set({ archivedAt: sql`now()` }).where(eq(collection.id, other.id));
    try {
      const [again] = await readCourses(scratch.db);
      expect(again?.modules.map((m) => m.id)).not.toContain(other.id);
      expect(again?.modules[0]?.topics.map((t) => t.id)).not.toContain(item.id);

      await scratch.db.update(collection).set({ archivedAt: sql`now()` }).where(eq(collection.id, first.id));
      expect((await readCourses(scratch.db)).map((c) => c.id)).not.toContain(first.id);
    } finally {
      await scratch.db.update(curriculumItem).set({ archivedAt: null }).where(eq(curriculumItem.id, item.id));
      await scratch.db
        .update(collection)
        .set({ archivedAt: null })
        .where(sql`${collection.id} in (${first.id}, ${other.id})`);
    }
    expect(JSON.stringify(await readCourses(scratch.db))).toBe(JSON.stringify(await fileSource(SEED).courses()));
  });
});
