import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { collection, concept, curriculumItem, topic } from "@self-learn/schema";
import { eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runIndexCommand } from "../src/commands/index-command";
import { runLs } from "../src/commands/ls";
import { runPath } from "../src/commands/path";
import { runSearch } from "../src/commands/search";
import { runShow, type ShowConcept, type ShowTopic } from "../src/commands/show";
import { runStatus } from "../src/commands/status";
import { REPO_ROOT } from "../src/env";
import { hasManimkcCli } from "../src/index/manimkc";
import { applyMigrations, MIGRATIONS_FOLDER } from "../src/migrations";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * The whole thing, against the repo's real content, once.
 *
 * The unit suites prove the indexers read files correctly and the writer writes
 * them correctly. This proves the two meet the actual trees: that the numbers
 * come out right, that nothing in `content/` or `learn/` currently fails to
 * resolve, and that the read commands an agent will call return what they say.
 *
 * The counts are asserted exactly. A loose `toBeGreaterThan` would pass while a
 * whole course quietly stopped being indexed, which is the failure this bundle
 * is for. When content is added on purpose, these numbers get updated on
 * purpose, in the same commit.
 *
 * manimkc is left out unless the submodule is checked out. The rows it produces
 * depend on which videos happen to be rendered in that checkout, so asserting
 * on them would be asserting on a working directory.
 */

const reachable = await probe();
const withManimkc = hasManimkcCli(REPO_ROOT);

/**
 * A migrations folder holding only the first two migrations, so a scratch
 * database can be left deliberately behind. `index_run` arrives in 0002, which
 * is what makes "head is set but this table does not exist" reachable at all.
 */
async function partialMigrations(count = 2): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), "catalog-partial-"));
  await mkdir(path.join(folder, "meta"), { recursive: true });
  const journal = JSON.parse(
    await readFile(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  const kept = journal.entries.slice(0, count);
  for (const entry of kept) {
    await copyFile(
      path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
      path.join(folder, `${entry.tag}.sql`),
    );
  }
  await writeFile(
    path.join(folder, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: kept }),
    "utf8",
  );
  return folder;
}

/** What `content/` and `learn/` hold today. Update deliberately. */
const EXPECTED = {
  topics: 81,
  domains: 22,
  concepts: 32,
  courses: 10,
  modules: 61,
} as const;

describe.skipIf(!reachable.ok)("catalog end to end", () => {
  let scratch: Scratch;
  let previousUrl: string | undefined;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    // The commands connect through DATABASE_URL, which is the same path the
    // CLI takes. Pointing it at the scratch database exercises that path
    // rather than a test-only one.
    previousUrl = process.env["DATABASE_URL"];
    const url = new URL(process.env["DATABASE_URL"] ?? "postgres://localhost:5432/self_learn");
    url.pathname = `/${scratch.name}`;
    process.env["DATABASE_URL"] = url.toString();

    await runIndexCommand({
      only: withManimkc
        ? undefined
        : ["topics", "courses", "concepts", "diagrams", "sessions"],
    });
  }, 120_000);

  afterAll(async () => {
    if (previousUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousUrl;
    await scratch?.drop();
  });

  describe("index", () => {
    it("indexes the whole shared vocabulary", async () => {
      const rows = await scratch.db.select().from(topic);
      expect(rows).toHaveLength(EXPECTED.topics);
      expect(new Set(rows.map((r) => r.domain)).size).toBe(EXPECTED.domains);
    });

    it("indexes every course and module", async () => {
      const courses = await scratch.db.select().from(collection).where(eq(collection.kind, "course"));
      const modules = await scratch.db.select().from(collection).where(eq(collection.kind, "module"));
      expect(courses).toHaveLength(EXPECTED.courses);
      expect(modules).toHaveLength(EXPECTED.modules);
      // Every module hangs off a course; nothing is orphaned at the top level
      // except the courses themselves.
      const roots = await scratch.db.select().from(collection).where(isNull(collection.parentId));
      expect(roots).toHaveLength(EXPECTED.courses);
    });

    it("indexes every concept note, and gives every one a topic", async () => {
      const rows = await scratch.db.select().from(concept);
      expect(rows).toHaveLength(EXPECTED.concepts);
      // The point of the vocabulary: a note with no topic cannot be reached
      // from a course or a video about the same subject.
      expect(rows.filter((r) => r.topicSlug === null)).toEqual([]);
    });

    it("gives every module a topic, and every curriculum item its module's", async () => {
      const { rows } = await scratch.db.execute<{ n: number }>(sql`
        select count(*)::int as n from collection c
         where c.kind = 'module'
           and not exists (
             select 1 from collection_item ci
              where ci.collection_id = c.id and ci.topic_slug is not null)
      `);
      expect(rows[0]?.n).toBe(0);

      const items = await scratch.db.select().from(curriculumItem);
      const untagged = await scratch.db.execute<{ n: number }>(sql`
        select count(*)::int as n from curriculum_item ci
         where not exists (
           select 1 from curriculum_item_topic cit where cit.curriculum_item_id = ci.id)
      `);
      expect(items.length).toBeGreaterThan(0);
      expect(untagged.rows[0]?.n).toBe(0);
    });

    it("is idempotent: a second run changes nothing", async () => {
      const second = await runIndexCommand({
        only: withManimkc ? undefined : ["topics", "courses", "concepts", "diagrams", "sessions"],
      });
      expect(second.totals.deleted).toBe(0);
      expect(await scratch.db.select().from(topic)).toHaveLength(EXPECTED.topics);
      expect(await scratch.db.select().from(concept)).toHaveLength(EXPECTED.concepts);
    });
  });

  describe("status", () => {
    it("says when each source was last indexed", async () => {
      const status = await runStatus();
      const bySource = new Map(status.sources.map((s) => [s.source, s]));
      for (const source of ["topics", "courses", "concepts", "diagrams", "sessions"]) {
        expect(bySource.get(source)?.lastIndexedAt, source).not.toBeNull();
      }
      expect(bySource.get("topics")?.counts).toMatchObject({ topic: EXPECTED.topics });
      if (!withManimkc) expect(bySource.get("manimkc")?.lastIndexedAt).toBeNull();
    });

    it("reports pending migrations instead of failing on a table that does not exist yet", async () => {
      // `index_run` arrives in 0002, so a database stopped at 0000 or 0001 has
      // a non-null head and no such table. Counting there used to throw
      // "relation does not exist" rather than saying the obvious thing.
      const partial = await createScratchDatabase();
      const saved = process.env["DATABASE_URL"];
      try {
        await applyMigrations(partial.db, { folder: await partialMigrations() });
        const url = new URL(saved ?? "postgres://localhost:5432/self_learn");
        url.pathname = `/${partial.name}`;
        process.env["DATABASE_URL"] = url.toString();

        const status = await runStatus();
        expect(status.migrations.head).not.toBeNull();
        expect(status.migrations.pending.length).toBeGreaterThan(0);
        expect(status.rows).toEqual({});
        expect(status.sources.every((s) => s.lastIndexedAt === null)).toBe(true);
      } finally {
        if (saved !== undefined) process.env["DATABASE_URL"] = saved;
        await partial.drop();
      }
    }, 60_000);
  });

  describe("ls", () => {
    it("lists domains and courses, and nothing else", async () => {
      const result = await runLs(undefined);
      expect(result.kind).toBe("overview");
      if (result.kind !== "overview") return;
      expect(result.domains).toHaveLength(EXPECTED.domains);
      expect(result.collections).toHaveLength(EXPECTED.courses);
      // Counted with a real query, not a correlated subquery that silently
      // returns zero. Every course has modules.
      expect(result.collections.every((c) => c.children > 0)).toBe(true);
    });

    it("lists one domain's topics with counts", async () => {
      const result = await runLs("algorithms");
      expect(result.kind).toBe("domain");
      if (result.kind !== "domain") return;
      expect(result.topics.map((t) => t.slug)).toContain("recurrence-relations");
      const recurrences = result.topics.find((t) => t.slug === "recurrence-relations");
      expect(recurrences?.concepts).toBe(5);
    });

    it("walks a course's tree", async () => {
      const result = await runLs("cs4263");
      expect(result.kind).toBe("collection");
      if (result.kind !== "collection") return;
      expect(result.children).toHaveLength(7);
      expect(result.children[0]?.topicSlug).toBe("search-algorithms");
      expect(result.children[0]?.curriculumItems.length).toBeGreaterThan(0);
      // Modules contain curriculum items, which are not collections, so there
      // is nothing a level further down to omit.
      expect(result.children.every((c) => c.children === 0)).toBe(true);
    });

    it("refuses a target that is neither a domain nor a collection", async () => {
      await expect(runLs("not-a-thing")).rejects.toThrow(/neither a domain nor a collection/);
    });
  });

  describe("show", () => {
    it("returns a concept with its prerequisites both ways and its path", async () => {
      const result = (await runShow("master-theorem")) as ShowConcept;
      expect(result.type).toBe("concept");
      expect(result.topicSlug).toBe("recurrence-relations");
      expect(result.path).toBe("learn/concepts/algorithms/master-theorem.md");
      expect(result.requires.map((r) => r.slug).sort()).toEqual([
        "comparing-growth-rates",
        "recurrence-for-recursive-running-time",
        "recursion-tree-method",
      ]);
      expect(result.requiredBy.map((r) => r.slug)).toContain("master-theorem-limits");
      // The note itself is an asset, so an agent is told which file to read.
      expect(result.assets["note"]?.[0]?.path).toBe("learn/concepts/algorithms/master-theorem.md");
    });

    it("returns a topic with its concepts and curriculum items", async () => {
      const result = (await runShow("recurrence-relations")) as ShowTopic;
      expect(result.type).toBe("topic");
      expect(result.domain).toBe("algorithms");
      expect(result.concepts).toHaveLength(5);
      expect(result.aliases).toContain("master theorem");
    });

    it("never returns a body, only paths", async () => {
      const result = (await runShow("master-theorem")) as ShowConcept;
      const serialised = JSON.stringify(result);
      // The note's body has an h1; the summary is a legitimate field, the
      // markdown body is not.
      expect(serialised).not.toContain("# Master Theorem");
      expect(serialised).not.toContain("## Worked example");
    });

    it("reports a target that does not exist", async () => {
      await expect(runShow("no-such-slug")).rejects.toThrow(/nothing in the catalog is called/);
    });
  });

  describe("path", () => {
    it("returns the chain in learning order", async () => {
      const result = await runPath("comparing-growth-rates", "master-theorem-limits");
      expect(result.found).toBe(true);
      expect(result.path[0]?.slug).toBe("comparing-growth-rates");
      expect(result.path.at(-1)?.slug).toBe("master-theorem-limits");
    });

    it("says there is no path, and offers the reverse when there is one", async () => {
      const result = await runPath("master-theorem", "comparing-growth-rates");
      expect(result.found).toBe(false);
      expect(result.path).toEqual([]);
      expect(result.hint).toMatch(/catalog path comparing-growth-rates master-theorem/);
    });

    it("refuses a slug that is not a concept", async () => {
      await expect(runPath("master-theorem", "recurrence-relations")).rejects.toThrow(
        /is not a concept/,
      );
    });
  });

  describe("search", () => {
    it("finds a topic by an alias that is nowhere in its title", async () => {
      const result = await runSearch("common data bus");
      expect(result.hits[0]).toMatchObject({
        type: "topic",
        id: "tomasulo-algorithm",
        matched: "common data bus",
      });
    });

    it("finds concepts by title", async () => {
      const result = await runSearch("master theorem");
      expect(result.hits.map((h) => h.id)).toContain("master-theorem");
      expect(result.hits.length).toBeLessThanOrEqual(20);
    });

    it("returns nothing for a term that matches nothing", async () => {
      expect((await runSearch("zzzzz-no-such-thing")).hits).toEqual([]);
    });
  });
});

describe.runIf(!reachable.ok)("catalog end to end (skipped)", () => {
  it.skip(`needs Postgres — ${reachable.reason}`, () => {});
});
