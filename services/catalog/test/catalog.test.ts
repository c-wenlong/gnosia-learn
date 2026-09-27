import {
  asset,
  collection,
  concept,
  curriculumItem,
  indexRun,
  mirror,
  topic,
} from "@self-learn/schema";
import { eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadCourses } from "@self-learn/content";

import { runDoctor } from "../src/commands/doctor";
import { runIndexCommand } from "../src/commands/index-command";
import { formatLs, runLs } from "../src/commands/ls";
import { runPath } from "../src/commands/path";
import { runSearch } from "../src/commands/search";
import {
  runShow,
  type ShowAsset,
  type ShowCollection,
  type ShowConcept,
  type ShowCurriculumItem,
  type ShowTopic,
} from "../src/commands/show";
import { runStatus } from "../src/commands/status";
import { REPO_ROOT } from "../src/env";
import { hasManimkcCli } from "../src/index/manimkc";
import { applyMigrations } from "../src/migrations";
import { partialMigrations } from "./partial-migrations";
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

/** What `content/` and `learn/` hold today. Update deliberately. */
const EXPECTED = {
  topics: 86,
  domains: 23,
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

    // No `only`: the runner drops manimkc by itself when the submodule is not
    // checked out, which is how CI runs and is the path worth exercising.
    await runIndexCommand({});
  }, 120_000);

  afterAll(async () => {
    if (previousUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousUrl;
    await scratch?.drop();
  });

  describe("index", () => {
    it("runs the two manimkc sources, or skips both with a reason", async () => {
      const result = await runIndexCommand({});
      const ran = result.sources.map((s) => s.source);
      // `mirrors` reads the same CLI out of the same submodule, so it is
      // absent for exactly the same reason `manimkc` is and never on its own.
      if (withManimkc) {
        expect(ran).toEqual(expect.arrayContaining(["manimkc", "mirrors"]));
        expect(result.skipped).toEqual([]);
      } else {
        expect(ran).not.toContain("manimkc");
        expect(ran).not.toContain("mirrors");
        expect(result.skipped).toEqual([
          { source: "manimkc", reason: expect.stringContaining("never been indexed") },
          { source: "mirrors", reason: expect.stringContaining("never been indexed") },
        ]);
      }
    });

    it("refuses --only manimkc or --only mirrors when the submodule is absent", async () => {
      if (withManimkc) return;
      // Asked for explicitly, so dropping it silently would answer a different
      // question than the one put to it.
      await expect(runIndexCommand({ only: ["manimkc"] })).rejects.toThrow(
        /submodule is not initialised.*manimkc topics --json/s,
      );
      await expect(runIndexCommand({ only: ["mirrors"] })).rejects.toThrow(
        /submodule is not initialised.*manimkc mirrors --json/s,
      );
    });

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
      const second = await runIndexCommand({});
      expect(second.totals.deleted).toBe(0);
      // Nothing changed, so no entity's snapshot moved and no revision is
      // appended (docs/CONTENT-MIGRATION.md 0.3), and nothing is archived.
      expect(second.sources.map((s) => [s.source, s.revisions])).toEqual(
        second.sources.map((s) => [s.source, {}]),
      );
      expect(second.sources.flatMap((s) => s.archivedKeys)).toEqual([]);
      expect(await scratch.db.select().from(topic)).toHaveLength(EXPECTED.topics);
      expect(await scratch.db.select().from(concept)).toHaveLength(EXPECTED.concepts);
    });
  });

  describe("doctor", () => {
    it("lists every course with no concept on any item, the ones the course files show", async () => {
      // Computed from the files rather than pinned: the owner is filling these
      // in (Track B), and the count is supposed to fall. It was nine when the
      // rule was written down.
      const expected = loadCourses({ root: REPO_ROOT })
        .filter((course) =>
          course.modules.every((mod) => mod.topics.every((item) => item.concepts.length === 0)),
        )
        .map((course) => course.id)
        .sort();

      const result = await runDoctor();
      expect(result.conceptlessCourses).toEqual(expected);
      const rule = result.rules.find((r) => r.name === "item-has-concept");
      expect(rule?.state).toBe("disarmed");
      // Every item of those courses is a violator, plus any stragglers elsewhere.
      const inThem = result.courses
        .filter((row) => expected.includes(row.course))
        .reduce((a, row) => a + row.items, 0);
      expect(rule?.violators).toBeGreaterThanOrEqual(inThem);
      // The two rules the parser already enforces hold on the real tree.
      expect(result.rules.find((r) => r.name === "module-has-item")?.violators).toBe(0);
      expect(result.rules.find((r) => r.name === "item-concept-in-module-topic")?.violators).toBe(0);
      expect(result.conceptsWithoutTopic).toEqual([]);
      expect(result.instance?.role).toBe("primary");
      expect(result.ok).toBe(true);
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
      if (!withManimkc) {
        expect(bySource.get("manimkc")?.lastIndexedAt).toBeNull();
        expect(bySource.get("mirrors")?.lastIndexedAt).toBeNull();
      }
    });

    it("says how many of each course's rows list a concept", async () => {
      const status = await runStatus();
      // Every course on the shortlist, in shortlist order.
      expect(status.coverage.map((c) => c.course)).toEqual([
        "cs2111", "cs4263", "cp4281", "cp4282", "cp4283", "cp4284", "cp4285", "cs3216", "cs3227", "cs3249",
      ]);
      // The one course whose rows list concepts today, and the rest untouched.
      expect(status.coverage.find((c) => c.course === "cp4284")).toEqual({
        course: "cp4284",
        items: 13,
        withConcepts: 3,
      });
      for (const c of status.coverage) {
        if (c.course === "cp4284") continue;
        expect(c.withConcepts, c.course).toBe(0);
        expect(c.items, c.course).toBeGreaterThan(0);
      }
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
        expect(status.coverage).toEqual([]);
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

    /**
     * The module's own resource links, reached through the topic it contains.
     *
     * Worth a golden test because it was wrong and silent: `collection_item`
     * rows written by the courses indexer are all topic-backed, so a query that
     * resolved only `collection_item.asset_id` reported `assets: {}` for every
     * collection in the catalog. Nothing recorded that empty output as expected,
     * which is why no test caught it.
     *
     * The `link` group is asserted exactly and the rest is not: this topic is
     * shared with another module, so which notes and videos hang off it moves
     * with the content and with whether manimkc is checked out. The authored
     * resources do not.
     */
    it("returns a module's assets through the topic it contains", async () => {
      const result = (await runShow("cp4284-m1")) as ShowCollection;
      expect(result.type).toBe("collection");
      expect(result.topicSlug).toBe("transformer-architecture-and-training");
      // `cp4283-m6-r1` is authored under a different module that maps to the
      // same topic. A module's assets are its subject's assets, so it belongs.
      expect(result.assets["link"]?.map((a) => a.id)).toEqual([
        "link:cp4283-m6-r1",
        "link:cp4284-m1-r1",
        "link:cp4284-m1-r2",
      ]);
      expect(result.assets["note"]?.length).toBeGreaterThan(0);
    });

    it("never returns a body, only paths", async () => {
      const result = (await runShow("master-theorem")) as ShowConcept;
      const serialised = JSON.stringify(result);
      // The note's body has an h1; the summary is a legitimate field, the
      // markdown body is not.
      expect(serialised).not.toContain("# Master Theorem");
      expect(serialised).not.toContain("## Worked example");
    });

    it("files the one diagram by what its .tldr says, not by its filename", async () => {
      const svg = (await runShow(
        "diagram:learn/assets/vector-as-a-list-of-numbers.svg",
      )) as ShowAsset;
      expect(svg.topics).toEqual(["vector-and-linear-algebra-basics"]);
      expect(svg.concepts).toEqual(["vector-as-a-list-of-numbers"]);
      expect(svg.title).toBe("A vector as a list of numbers");
      // The SVG was exported from the .tldr, and says so.
      expect(svg.derivedFrom.map((a) => a.path)).toEqual([
        "learn/assets/vector-as-a-list-of-numbers.tldr",
      ]);
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

  describe("archived rows", () => {
    // A module and an item the course file stopped listing: archived by the
    // import (D12), kept for the learner rows under them, on no page. Set
    // directly here and put back, so the cases above see the tree as it is.
    const archive = async (on: boolean) => {
      const at = on ? sql`now()` : sql`null`;
      await scratch.db.execute(sql`update curriculum_item set archived_at = ${at} where id = 'cp4284-m1-t1'`);
      await scratch.db.execute(sql`update collection set archived_at = ${at} where id = 'cs4263-m7'`);
      await scratch.db.execute(sql`update curriculum_item set archived_at = ${at} where collection_id = 'cs4263-m7'`);
    };

    it("leaves them out of status's coverage, ls, and show's lists, and says so when shown directly", async () => {
      const before = await runStatus();
      const cs4263 = (await runLs("cs4263")) as Extract<Awaited<ReturnType<typeof runLs>>, { kind: "collection" }>;
      const m7Items = cs4263.children.find((c) => c.id === "cs4263-m7")?.curriculumItems.length ?? 0;
      expect(m7Items).toBeGreaterThan(0);
      await archive(true);
      try {
        const after = await runStatus();
        const cp4284 = (report: typeof before) => report.coverage.find((c) => c.course === "cp4284");
        const cs = (report: typeof before) => report.coverage.find((c) => c.course === "cs4263");
        expect(cp4284(after)).toEqual({ ...cp4284(before), items: (cp4284(before)?.items ?? 0) - 1, withConcepts: 2 });
        expect(cs(after)?.items).toBe((cs(before)?.items ?? 0) - m7Items);

        const tree = await runLs("cs4263");
        if (tree.kind !== "collection") throw new Error("not a collection");
        expect(tree.children.map((c) => c.id)).not.toContain("cs4263-m7");
        expect(tree.archived).toBe(false);
        // Named directly it still answers, since its id is how the learner
        // rows kept under it are found, and says it is archived.
        const gone = await runLs("cs4263-m7");
        if (gone.kind !== "collection") throw new Error("not a collection");
        expect(gone.archived).toBe(true);
        expect(formatLs(gone)).toContain("archived: its course file no longer lists it");
        const overview = await runLs(undefined);
        if (overview.kind !== "overview") throw new Error("not the overview");
        expect(overview.collections.find((c) => c.id === "cs4263")?.children).toBe(6);

        const shown = (await runShow("cp4284-m1")) as ShowCollection;
        expect(shown.curriculumItems.map((i) => i.id)).not.toContain("cp4284-m1-t1");
        expect(shown.archived).toBe(false);
        const course = (await runShow("cs4263")) as ShowCollection;
        expect(course.children.map((c) => c.id)).not.toContain("cs4263-m7");
        const item = (await runShow("cp4284-m1-t1")) as ShowCurriculumItem;
        expect(item.archived).toBe(true);
        const topic = (await runShow("transformer-architecture-and-training")) as ShowTopic;
        expect(topic.curriculumItems.map((i) => i.id)).not.toContain("cp4284-m1-t1");
      } finally {
        await archive(false);
      }
    });
  });

  describe("archived rows, all of a course's", () => {
    it("keeps a live course whose items are all archived in the coverage, at zero", async () => {
      const courses = (await runStatus()).coverage.map((c) => c.course);
      await scratch.db.execute(
        sql`update curriculum_item set archived_at = now()
            where collection_id in (select id from collection where parent_id = 'cs3249')`,
      );
      try {
        const after = await runStatus();
        expect(after.coverage.map((c) => c.course)).toEqual(courses);
        expect(after.coverage.find((c) => c.course === "cs3249")).toEqual({
          course: "cs3249",
          items: 0,
          withConcepts: 0,
        });
      } finally {
        await scratch.db.execute(
          sql`update curriculum_item set archived_at = null
              where collection_id in (select id from collection where parent_id = 'cs3249')`,
        );
      }
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

/**
 * The mirror ledger, read back through `status` and `show`.
 *
 * Its own database, and rows inserted directly rather than through an index
 * run. The real ledger describes whichever videos happen to be rendered and
 * whichever cloud drives happen to be mounted, so an assertion on it would be
 * an assertion on a laptop. What is worth pinning down is the shape both
 * commands return, and that "nothing audited" and "audited and empty" do not
 * look the same.
 */
describe.skipIf(!reachable.ok)("mirror coverage", () => {
  let scratch: Scratch;
  let previousUrl: string | undefined;

  const VIDEO = "manimkc:out/a/one/one.mp4";
  const checked = new Date("2026-09-13T00:02:57Z");

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    previousUrl = process.env["DATABASE_URL"];
    const url = new URL(previousUrl ?? "postgres://localhost:5432/self_learn");
    url.pathname = `/${scratch.name}`;
    process.env["DATABASE_URL"] = url.toString();
  }, 60_000);

  afterAll(async () => {
    if (previousUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousUrl;
    await scratch?.drop();
  });

  it("reports no destinations before anything has been audited", async () => {
    expect((await runStatus()).mirrors).toEqual({});
  });

  it("counts each status per destination, and dates the audit", async () => {
    await scratch.db.insert(asset).values([
      { id: VIDEO, kind: "video", path: "out/a/one/one.mp4", sourceRepo: "manimkc" },
      { id: "manimkc:out/a/two/two.mp4", kind: "video", path: "out/a/two/two.mp4", sourceRepo: "manimkc" },
      { id: "manimkc:out/a/one/one.vtt", kind: "captions", path: "out/a/one/one.vtt", sourceRepo: "manimkc" },
    ]);
    await scratch.db.insert(mirror).values([
      { assetId: VIDEO, destination: "drive", root: "/mnt/drive", status: "present", compared: "sha256", bytes: 10, mtime: checked, checkedAt: checked },
      { assetId: "manimkc:out/a/two/two.mp4", destination: "drive", root: "/mnt/drive", status: "stale", compared: "bytes", bytes: 9, checkedAt: checked },
      { assetId: "manimkc:out/a/one/one.vtt", destination: "drive", root: "/mnt/drive", status: "unknown", compared: "none", checkedAt: checked },
      { assetId: VIDEO, destination: "seafile", root: "/mnt/seafile", status: "present", compared: "size+mtime", bytes: 10, mtime: checked, checkedAt: new Date("2026-09-06T00:00:00Z") },
    ]);

    const status = await runStatus();
    expect(status.mirrors).toEqual({
      drive: { present: 1, stale: 1, missing: 0, unknown: 1, checked: "2026-09-13T00:02:57.000Z" },
      seafile: { present: 1, stale: 0, missing: 0, unknown: 0, checked: "2026-09-06T00:00:00.000Z" },
    });
    // An older stamp is the point of reporting one: those counts were true a
    // week ago and nothing has confirmed them since.
    expect(status.rows["mirror"]).toBe(4);
  });

  it("lists an asset's mirror rows under show, with the test each rests on", async () => {
    const result = (await runShow(VIDEO)) as ShowAsset;
    expect(result.type).toBe("asset");
    expect(result.mirrors).toEqual([
      {
        destination: "drive",
        root: "/mnt/drive",
        status: "present",
        compared: "sha256",
        bytes: 10,
        mtime: "2026-09-13T00:02:57.000Z",
        checkedAt: "2026-09-13T00:02:57.000Z",
      },
      {
        destination: "seafile",
        root: "/mnt/seafile",
        status: "present",
        compared: "size+mtime",
        bytes: 10,
        mtime: "2026-09-13T00:02:57.000Z",
        checkedAt: "2026-09-06T00:00:00.000Z",
      },
    ]);
  });

  it("keeps a reachable destination that matched nothing, so it does not read as never audited", async () => {
    // The ledger listed only files this catalog has no asset for, so the audit
    // succeeded and wrote no rows. Reading the table alone would drop the
    // destination entirely and say the opposite of what happened.
    const at = new Date("2026-09-13T01:00:00Z");
    await scratch.db.insert(indexRun).values({
      source: "mirrors",
      sourceRoot: "/checkout/manimkc",
      startedAt: at,
      finishedAt: at,
      metadata: {
        destinations: [
          { destination: "drive", root: "/mnt/drive", reachable: true, checked: "2026-09-13T01:00:00Z", files: 3 },
          { destination: "usb", root: "/mnt/usb", reachable: true, checked: "2026-09-13T01:00:00Z", files: 0 },
          { destination: "seafile", root: "/mnt/seafile", reachable: false, checked: null, files: 0 },
        ],
      },
    });

    const { mirrors } = await runStatus();
    expect(mirrors["usb"]).toEqual({
      present: 0,
      stale: 0,
      missing: 0,
      unknown: 0,
      checked: "2026-09-13T01:00:00.000Z",
    });
    // Seafile was not reached, and its rows carry their own older stamp.
    expect(mirrors["seafile"]?.checked).toBe("2026-09-06T00:00:00.000Z");
    expect(mirrors["drive"]?.present).toBe(1);
  });

  it("returns no mirrors for an asset no mirror carries", async () => {
    await scratch.db.insert(asset).values({
      id: "note:learn/concepts/x/a.md",
      kind: "note",
      path: "learn/concepts/x/a.md",
      sourceRepo: "self-learn",
    });
    const result = (await runShow("note:learn/concepts/x/a.md")) as ShowAsset;
    expect(result.mirrors).toEqual([]);
  });
});

describe.runIf(!reachable.ok)("catalog end to end (skipped)", () => {
  it.skip(`needs Postgres — ${reachable.reason}`, () => {});
});
