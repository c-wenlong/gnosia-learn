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
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadCourses } from "@self-learn/content";

import { runDoctor } from "../src/commands/doctor";
import { runExport } from "../src/commands/export";
import { EXPORT_TYPES, readTypeFiles } from "../src/content/layout";
import { runImportCommand } from "../src/commands/index-command";
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
import { applyMigrations } from "../src/migrations";
import { partialMigrations } from "./partial-migrations";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";
import { storedBlob } from "./stored-blob";

/**
 * The whole thing, against the seed tree, once.
 *
 * The unit suites prove the indexers read files correctly and the writer writes
 * them correctly. This proves the two meet a real tree: that the numbers come
 * out right, that nothing in it fails to resolve, and that the read commands an
 * agent will call return what they say.
 *
 * The tree is `seed/`, not the repository's `content/` and `learn/`: those go
 * in phase 3 (docs/CONTENT-MIGRATION.md, edge case 11), and the seed is real
 * content cut from them with `catalog export --subset` (seed/README.md), so it
 * imports on its own and stays still while the owner's content moves.
 *
 * The counts are asserted exactly. A loose `toBeGreaterThan` would pass while a
 * whole course quietly stopped being imported, which is the failure this suite
 * is for. When the seed is regenerated on purpose, these numbers get updated on
 * purpose, in the same commit.
 *
 * manimkc is always left out: the seed has no videos (D7), and the rows
 * manimkc would produce depend on which videos happen to be rendered on this
 * machine. `MANIMKC_ROOT` points at an empty directory for the suite, which is
 * how a clone with no submodule runs.
 */

const reachable = await probe();

/** The seed, which the test imports and never writes (vitest.setup.ts watches it). */
const SEED = path.join(REPO_ROOT, "seed");

/** What `seed/` holds. Update deliberately, with the seed. */
const EXPECTED = {
  topics: 5,
  domains: 4,
  concepts: 11,
  courses: 1,
  modules: 2,
} as const;

/** Every source the import runs once manimkc is out: the seed's own, in dependency order. */
const importSeed = () => runImportCommand({ dir: SEED });

describe.skipIf(!reachable.ok)("catalog end to end", () => {
  let scratch: Scratch;
  let previousUrl: string | undefined;
  let previousManimkc: string | undefined;
  let noManimkc: string;

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
    previousManimkc = process.env["MANIMKC_ROOT"];
    noManimkc = await mkdtemp(path.join(tmpdir(), "catalog-no-manimkc-"));
    process.env["MANIMKC_ROOT"] = noManimkc;

    await importSeed();
  }, 120_000);

  afterAll(async () => {
    if (previousUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousUrl;
    if (previousManimkc === undefined) delete process.env["MANIMKC_ROOT"];
    else process.env["MANIMKC_ROOT"] = previousManimkc;
    await rm(noManimkc, { recursive: true, force: true });
    await scratch?.drop();
  });

  describe("import", () => {
    it("skips the manimkc, remotionkc and revideokc sources with a reason, since there is no CLI to run", async () => {
      const result = await importSeed();
      const ran = result.sources.map((s) => s.source);
      // `mirrors` reads the same CLI out of the same checkout, so it is
      // absent for exactly the same reason `manimkc` is and never on its own.
      expect(ran).not.toContain("manimkc");
      expect(ran).not.toContain("mirrors");
      // remotionkc's and revideokc's roots are directories that do not exist
      // (vitest.setup.ts), so each is left out the same way, and says which
      // submodule is missing.
      expect(ran).not.toContain("remotionkc");
      expect(ran).not.toContain("revideokc");
      expect(result.skipped).toEqual([
        { source: "manimkc", reason: expect.stringContaining("never been indexed") },
        { source: "remotionkc", reason: "the remotionkc submodule is not initialised, and it has never been indexed here" },
        { source: "revideokc", reason: "the revideokc submodule is not initialised, and it has never been indexed here" },
        { source: "mirrors", reason: expect.stringContaining("never been indexed") },
      ]);
    });

    it("refuses --only manimkc, mirrors, remotionkc or revideokc when its CLI is not there", async () => {
      // Asked for explicitly, so dropping it silently would answer a different
      // question than the one put to it.
      await expect(runImportCommand({ dir: SEED, only: ["manimkc"] })).rejects.toThrow(
        /submodule is not initialised.*manimkc topics --json/s,
      );
      await expect(runImportCommand({ dir: SEED, only: ["mirrors"] })).rejects.toThrow(
        /submodule is not initialised.*manimkc mirrors --json/s,
      );
      await expect(runImportCommand({ dir: SEED, only: ["remotionkc"] })).rejects.toThrow(
        /the remotionkc submodule is not initialised, so `remotionkc topics --json` cannot run\. Run `git submodule update --init tools\/remotionkc`, or set REMOTIONKC_ROOT/,
      );
      await expect(runImportCommand({ dir: SEED, only: ["revideokc"] })).rejects.toThrow(
        /the revideokc submodule is not initialised, so `revideokc topics --json` cannot run\. Run `git submodule update --init tools\/revideokc`, or set REVIDEOKC_ROOT/,
      );
    });

    it("holds every other count the seed has", async () => {
      const count = async (table: string) =>
        (await scratch.db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)}`)).rows[0]?.n;
      expect({
        tags: await count("tag"),
        items: await count("curriculum_item"),
        conceptLinks: await count("concept_curriculum_item"),
        prerequisites: await count("concept_prerequisite"),
        sessions: await count("session_log_entry"),
        diagrams: await count("diagram"),
        videos: (await scratch.db.select().from(asset).where(eq(asset.kind, "video"))).length,
      }).toEqual({ tags: 2, items: 5, conceptLinks: 8, prerequisites: 13, sessions: 1, diagrams: 1, videos: 0 });
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

    it("reads back as its own export, byte for byte", async () => {
      // The seed is `catalog export --subset` output, so exporting what it
      // imported writes the same files. A seed edited by hand, or cut by an
      // older exporter, fails here rather than drifting from what the
      // database would write.
      const out = await mkdtemp(path.join(tmpdir(), "catalog-seed-export-"));
      try {
        await runExport({ out });
        const files = async (root: string) =>
          (await Promise.all(EXPORT_TYPES.map((type) => readTypeFiles(root, type)))).flat();
        const exported = await files(out);
        const seed = await files(SEED);
        expect(exported.map((f) => f.path)).toEqual(seed.map((f) => f.path));
        for (const [i, file] of exported.entries()) {
          expect(file.bytes.equals(seed[i]?.bytes ?? Buffer.alloc(0)), file.path).toBe(true);
        }
      } finally {
        await rm(out, { recursive: true, force: true });
      }
    });

    it("is idempotent: a second run changes nothing", async () => {
      const second = await importSeed();
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
      const expected = loadCourses({ root: SEED })
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
      // The two rules the parser already enforces hold on the seed.
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
      expect(bySource.get("manimkc")?.lastIndexedAt).toBeNull();
      expect(bySource.get("mirrors")?.lastIndexedAt).toBeNull();
    });

    it("says how many of each course's rows list a concept", async () => {
      const status = await runStatus();
      // The seed's one course, cut to the two modules under its topics: three
      // of its five rows list concepts (m1-t1 and m3-t1, m3-t2), and one of
      // its four readings (the ReAct paper) is placed on a lesson.
      // Its five rows teach eight concepts, three of whose notes hold checks.
      expect(status.coverage).toEqual([
        { course: "cp4284", items: 5, withConcepts: 3, readings: 4, readingsOnLessons: 1, concepts: 8, conceptsWithChecks: 3 },
      ]);
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
      const result = await runLs("machine-learning");
      expect(result.kind).toBe("domain");
      if (result.kind !== "domain") return;
      expect(result.topics.map((t) => t.slug)).toContain("transformer-architecture-and-training");
      const transformers = result.topics.find((t) => t.slug === "transformer-architecture-and-training");
      expect(transformers?.concepts).toBe(7);
    });

    it("walks a course's tree", async () => {
      const result = await runLs("cp4284");
      expect(result.kind).toBe("collection");
      if (result.kind !== "collection") return;
      expect(result.children).toHaveLength(2);
      expect(result.children[0]?.topicSlug).toBe("transformer-architecture-and-training");
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
      const result = (await runShow("attention-weights")) as ShowConcept;
      expect(result.type).toBe("concept");
      expect(result.topicSlug).toBe("transformer-architecture-and-training");
      expect(result.path).toBe("learn/concepts/transformers/attention-weights.md");
      expect(result.requires.map((r) => r.slug).sort()).toEqual([
        "dot-product",
        "query-key-value-projections",
        "softmax",
      ]);
      expect(result.requiredBy.map((r) => r.slug)).toContain("self-attention");
      // The note itself is an asset, so an agent is told which file to read.
      expect(result.assets["note"]?.[0]?.path).toBe("learn/concepts/transformers/attention-weights.md");
    });

    it("returns a topic with its concepts and curriculum items", async () => {
      const result = (await runShow("transformer-architecture-and-training")) as ShowTopic;
      expect(result.type).toBe("topic");
      expect(result.domain).toBe("machine-learning");
      expect(result.concepts).toHaveLength(7);
      expect(result.aliases).toContain("multi-head attention");
      expect(result.curriculumItems.map((i) => i.id)).toEqual(["cp4284-m1-t1", "cp4284-m1-t2"]);
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
     * The seed keeps one module per topic, so the links are this module's own
     * two. (In the full tree `cp4283-m6-r1`, authored under another module on
     * the same topic, is listed too: a module's assets are its subject's.)
     */
    it("returns a module's assets through the topic it contains", async () => {
      const result = (await runShow("cp4284-m1")) as ShowCollection;
      expect(result.type).toBe("collection");
      expect(result.topicSlug).toBe("transformer-architecture-and-training");
      expect(result.assets["link"]?.map((a) => a.id)).toEqual(["link:cp4284-m1-r1", "link:cp4284-m1-r2"]);
      expect(result.assets["note"]).toHaveLength(7);
    });

    it("never returns a body, only paths", async () => {
      const result = (await runShow("self-attention")) as ShowConcept;
      const serialised = JSON.stringify(result);
      // The note's body has an h1; the summary is a legitimate field, the
      // markdown body is not.
      expect(serialised).not.toContain("# Self-attention");
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
      const result = await runPath("vector-as-a-list-of-numbers", "transformer-block");
      expect(result.found).toBe(true);
      expect(result.path[0]?.slug).toBe("vector-as-a-list-of-numbers");
      expect(result.path.at(-1)?.slug).toBe("transformer-block");
    });

    it("says there is no path, and offers the reverse when there is one", async () => {
      const result = await runPath("self-attention", "vector-as-a-list-of-numbers");
      expect(result.found).toBe(false);
      expect(result.path).toEqual([]);
      expect(result.hint).toMatch(/catalog path vector-as-a-list-of-numbers self-attention/);
    });

    it("refuses a slug that is not a concept", async () => {
      await expect(runPath("self-attention", "transformer-architecture-and-training")).rejects.toThrow(
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
      await scratch.db.execute(sql`update curriculum_item set archived_at = ${at} where id = 'cp4284-m3-t1'`);
      await scratch.db.execute(sql`update collection set archived_at = ${at} where id = 'cp4284-m1'`);
      await scratch.db.execute(sql`update curriculum_item set archived_at = ${at} where collection_id = 'cp4284-m1'`);
    };

    it("leaves them out of status's coverage, ls, and show's lists, and says so when shown directly", async () => {
      const before = await runStatus();
      const cp4284 = (await runLs("cp4284")) as Extract<Awaited<ReturnType<typeof runLs>>, { kind: "collection" }>;
      const m1Items = cp4284.children.find((c) => c.id === "cp4284-m1")?.curriculumItems.length ?? 0;
      expect(m1Items).toBe(2);
      await archive(true);
      try {
        const after = await runStatus();
        const course = (report: typeof before) => report.coverage.find((c) => c.course === "cp4284");
        // Five rows, less m3-t1 (react-loop) and m1's two (one with concepts):
        // two left, and only m3-t2 (tool-calling) names a concept.
        // m1's two readings go with their module, and the ReAct paper's one
        // lesson is m3-t1, archived, so none of the two left is placed.
        expect(course(after)).toEqual({
          ...course(before),
          items: 5 - 1 - m1Items,
          withConcepts: 1,
          readings: 2,
          readingsOnLessons: 0,
          concepts: 1,
          conceptsWithChecks: 1,
        });

        const tree = await runLs("cp4284");
        if (tree.kind !== "collection") throw new Error("not a collection");
        expect(tree.children.map((c) => c.id)).toEqual(["cp4284-m3"]);
        expect(tree.archived).toBe(false);
        // Named directly it still answers, since its id is how the learner
        // rows kept under it are found, and says it is archived.
        const gone = await runLs("cp4284-m1");
        if (gone.kind !== "collection") throw new Error("not a collection");
        expect(gone.archived).toBe(true);
        expect(formatLs(gone)).toContain("archived: its course file no longer lists it");
        const overview = await runLs(undefined);
        if (overview.kind !== "overview") throw new Error("not the overview");
        expect(overview.collections.find((c) => c.id === "cp4284")?.children).toBe(1);

        const shown = (await runShow("cp4284-m3")) as ShowCollection;
        expect(shown.curriculumItems.map((i) => i.id)).toEqual(["cp4284-m3-t2", "cp4284-m3-t3"]);
        expect(shown.archived).toBe(false);
        const whole = (await runShow("cp4284")) as ShowCollection;
        expect(whole.children.map((c) => c.id)).toEqual(["cp4284-m3"]);
        const item = (await runShow("cp4284-m3-t1")) as ShowCurriculumItem;
        expect(item.archived).toBe(true);
        const topic = (await runShow("agent-tool-use-and-reasoning-loops")) as ShowTopic;
        expect(topic.curriculumItems.map((i) => i.id)).not.toContain("cp4284-m3-t1");
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
            where collection_id in (select id from collection where parent_id = 'cp4284')`,
      );
      try {
        const after = await runStatus();
        expect(after.coverage.map((c) => c.course)).toEqual(courses);
        expect(after.coverage.find((c) => c.course === "cp4284")).toEqual({
          course: "cp4284",
          items: 0,
          withConcepts: 0,
          readings: 4,
          readingsOnLessons: 0,
          concepts: 0,
          conceptsWithChecks: 0,
        });
      } finally {
        await scratch.db.execute(
          sql`update curriculum_item set archived_at = null
              where collection_id in (select id from collection where parent_id = 'cp4284')`,
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
      const result = await runSearch("multi-head attention");
      expect(result.hits.map((h) => h.id)).toContain("multi-head-attention");
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
    const blob = (id: string) => storedBlob(scratch.db, id);
    await scratch.db.insert(asset).values([
      { id: VIDEO, kind: "video", path: "out/a/one/one.mp4", sourceRepo: "manimkc", blobKey: await blob(VIDEO) },
      { id: "manimkc:out/a/two/two.mp4", kind: "video", path: "out/a/two/two.mp4", sourceRepo: "manimkc", blobKey: await blob("two") },
      { id: "manimkc:out/a/one/one.vtt", kind: "captions", path: "out/a/one/one.vtt", sourceRepo: "manimkc", blobKey: await blob("vtt") },
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
