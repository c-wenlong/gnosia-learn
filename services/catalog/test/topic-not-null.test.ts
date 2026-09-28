import { rm } from "node:fs/promises";
import path from "node:path";

import { concept, topic } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { doctor } from "../src/commands/doctor";
import { conceptsIndexer } from "../src/index/concepts";
import { topicsIndexer } from "../src/index/topics";
import { writeSource } from "../src/index/writer";
import { runIndex } from "../src/index/run";
import { applyMigrations } from "../src/migrations";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { partialMigrations } from "./partial-migrations";
import { createScratchDatabase, probe, sqlMessage, sqlstate, type Scratch } from "./scratch-database";

/**
 * Track C's contract migration (0012): `concept.topic_slug` becomes `NOT
 * NULL` and `RESTRICT`. The migration refuses, naming every concept, while
 * any row has no topic; `catalog doctor` reports the same rows beforehand; and
 * an import that drops a topic concepts are still filed under is refused by
 * name rather than failing on the constraint.
 */

const reachable = await probe();
/** 0000 to 0011: the database as phase 0 left it. */
const THROUGH_0011 = 12;

describe.skipIf(!reachable.ok)("concept.topic_slug NOT NULL", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db, { folder: await partialMigrations(THROUGH_0011) });
    await scratch.db.execute(sql`insert into topic (slug, title, domain) values ('alpha', 'Alpha', 'one')`);
    await scratch.db.execute(sql`
      insert into concept (slug, title, path, topic_slug, archived_at) values
        ('filed', 'Filed', 'learn/concepts/one/filed.md', 'alpha', null),
        ('loose', 'Loose', 'learn/concepts/one/loose.md', null, null),
        ('gone', 'Gone', 'learn/concepts/one/gone.md', null, now())
    `);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("is reported by doctor before the migration, archived rows included", async () => {
    const report = await doctor(scratch.db, "scratch");
    expect(report.migrations.pending).toEqual(["0012_concept_topic_not_null", "0013_asset_blob_contract"]);
    expect(report.conceptsWithoutTopic).toEqual(["gone", "loose"]);
    expect(report.conceptTopicRequired).toBe(false);
  });

  it("refuses to migrate while a concept has no topic, naming every one", async () => {
    const refused = await applyMigrations(scratch.db).then(
      () => null,
      (error: unknown) => error,
    );
    expect(sqlMessage(refused)).toMatch(/these concepts have no topic: gone, loose/);
    const nullable = await scratch.db.execute<{ is_nullable: string }>(sql`
      select is_nullable from information_schema.columns where table_name = 'concept' and column_name = 'topic_slug'
    `);
    expect(nullable.rows[0]?.is_nullable).toBe("YES");
  });

  it("applies once every concept has a topic, and the constraint then holds", async () => {
    await scratch.db.execute(sql`update concept set topic_slug = 'alpha' where topic_slug is null`);
    await applyMigrations(scratch.db);
    const report = await doctor(scratch.db, "scratch");
    expect(report.migrations.pending).toEqual([]);
    expect(report.conceptsWithoutTopic).toEqual([]);
    expect(report.conceptTopicRequired).toBe(true);

    const nullRow = await scratch.db
      .insert(concept)
      .values({ slug: "nowhere", title: "Nowhere", path: "learn/concepts/one/nowhere.md", topicSlug: null as unknown as string })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(sqlstate(nullRow)).toBe("23502");
    const deleted = await scratch.db.delete(topic).where(eq(topic.slug, "alpha")).then(
      () => null,
      (error: unknown) => error,
    );
    expect(sqlstate(deleted)).toBe("23503");
  });
});

describe.skipIf(!reachable.ok)("an import that drops a topic its concepts still use", () => {
  let scratch: Scratch;
  let fixture: Fixture;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["base"] }, { slug: "beta" }]));
    await fixture.write("learn/concepts/testing/base.md", note({ id: "base" }));
    for (const indexer of [topicsIndexer, conceptsIndexer]) {
      const context = await fixture.context();
      const { rows } = await indexer.read(context);
      await writeSource(scratch.db, indexer, rows, [], indexer.root(context));
    }
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    await fixture?.cleanup();
  });

  it("is refused by name when the concepts source does not follow, and moving the concept first lets the topic go", async () => {
    const topics = async () => {
      const context = await fixture.context();
      const { rows } = await topicsIndexer.read(context);
      return writeSource(scratch.db, topicsIndexer, rows, [], topicsIndexer.root(context));
    };
    // The concept moved to beta and alpha removed, in one edit.
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "beta", concepts: ["base"] }]));
    await expect(topics()).rejects.toThrow(
      /no longer lists topics that concepts are still filed under: alpha \(base\)\. Every concept needs a topic, and this import will not move them/,
    );
    expect((await scratch.db.select().from(topic)).map((t) => t.slug).sort()).toEqual(["alpha", "beta"]);

    // The move first, with alpha still listed; then alpha alone.
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha" }, { slug: "beta", concepts: ["base"] }]));
    await topics();
    const context = await fixture.context();
    const { rows } = await conceptsIndexer.read(context);
    await writeSource(scratch.db, conceptsIndexer, rows, [], conceptsIndexer.root(context));
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "beta", concepts: ["base"] }]));
    await topics();
    expect((await scratch.db.select().from(topic)).map((t) => t.slug)).toEqual(["beta"]);
    expect((await scratch.db.select().from(concept))[0]?.topicSlug).toBe("beta");
  });
});

describe.skipIf(!reachable.ok)("one catalog index that moves a topic's concepts and drops the topic", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  const vocabulary = (entries: Parameters<typeof topicsYaml>[0]) => fixture.write("content/topics.yaml", topicsYaml(entries));
  const index = () => runIndex(scratch.db, { repoRoot: fixture.root, manimkcRoot: path.join(fixture.root, "none") });

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    fixture = await makeFixture();
    await vocabulary([
      { slug: "alpha", concepts: ["base", "spare"], manimkc: ["one/first"] },
      { slug: "beta", courses: ["xx1000-m1"] },
    ]);
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write(
      "content/courses/xx1000.yaml",
      [
        "id: xx1000", "slug: xx1000", "code: XX1000", "title: A test course", "credits: 4", "order: 1",
        "inferred: false", "tags: [testing]", "modules:", "  - id: xx1000-m1", "    slug: m1",
        "    title: Module one", "    order: 1", "    topic: beta", "    topics:", "      - id: xx1000-m1-t1",
        "        title: First item", "        subtopics: []", "    resources: []", "capstone: Build something", "",
      ].join("\n"),
    );
    await fixture.write("learn/concepts/testing/base.md", note({ id: "base" }));
    await fixture.write("learn/concepts/testing/spare.md", note({ id: "spare" }));
    await index();
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    await fixture?.cleanup();
  });

  it("writes nothing when the notes the held topic waits on would be refused", async () => {
    // alpha goes and base moves to beta, but spare's note stays with no topic.
    await vocabulary([{ slug: "beta", courses: ["xx1000-m1"], concepts: ["base"] }]);
    await expect(index()).rejects.toThrow(/concept "spare" is in no topic's maps\.concepts/);
    expect((await scratch.db.select().from(topic)).map((t) => t.slug).sort()).toEqual(["alpha", "beta"]);
    const { rows } = await scratch.db.execute<{ path: string }>(sql`select path from manimkc_topic where topic_slug = 'alpha'`);
    expect(rows).toEqual([{ path: "one/first" }]);
  }, 60_000);

  it("holds the topic for the concepts source to empty, then prunes it whole in the same run", async () => {
    // spare's note goes too, so the edit is complete.
    await rm(path.join(fixture.root, "learn/concepts/testing/spare.md"));
    const run = await index();

    expect((await scratch.db.select().from(topic)).map((t) => t.slug)).toEqual(["beta"]);
    expect((await scratch.db.select({ slug: concept.slug, topic: concept.topicSlug }).from(concept))).toEqual([
      { slug: "base", topic: "beta" },
    ]);
    const topics = run.sources.find((s) => s.source === "topics");
    expect(topics?.deletedKeys).toContain("topic alpha");
    expect(topics?.deferred).toBeUndefined();
    expect(topics?.revisions["topic"]).toBe(1);
    // The delete revision records alpha as it was, its manimkc path included.
    const { rows } = await scratch.db.execute<{ op: string; snapshot: { links: Record<string, unknown[]> } }>(
      sql`select op, snapshot from content_revision where entity_type = 'topic' and entity_id = 'alpha' order by seq desc limit 1`,
    );
    expect(rows[0]?.op).toBe("delete");
    expect(rows[0]?.snapshot.links["manimkc_topic"]).toHaveLength(1);
    const [runRow] = (await scratch.db.execute<{ deleted: number }>(sql`select deleted from index_run where source = 'topics'`)).rows;
    expect(runRow?.deleted).toBe(1);
  }, 60_000);
});

describe.skipIf(!reachable.ok)("a held topic with a relation, and a manimkc path moving off it", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  const index = () => runIndex(scratch.db, { repoRoot: fixture.root, manimkcRoot: path.join(fixture.root, "none") });

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      [
        "topics:",
        "  - slug: alpha", "    title: Alpha", "    domain: one", "    aliases: []",
        "    relations:", "      - {kind: precedes, to: beta}",
        "    maps:", "      manimkc: [one/first, one/second]", "      courses: []", "      concepts: [base]",
        "  - slug: beta", "    title: Beta", "    domain: one", "    aliases: []",
        "    maps:", "      manimkc: []", "      courses: [xx1000-m1]", "      concepts: []",
        "",
      ].join("\n"),
    );
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write(
      "content/courses/xx1000.yaml",
      [
        "id: xx1000", "slug: xx1000", "code: XX1000", "title: A test course", "credits: 4", "order: 1",
        "inferred: false", "tags: [testing]", "modules:", "  - id: xx1000-m1", "    slug: m1",
        "    title: Module one", "    order: 1", "    topic: beta", "    topics:", "      - id: xx1000-m1-t1",
        "        title: First item", "        subtopics: []", "    resources: []", "capstone: Build something", "",
      ].join("\n"),
    );
    await fixture.write("learn/concepts/testing/base.md", note({ id: "base" }));
    await index();
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    await fixture?.cleanup();
  });

  it("deletes the topic with its relation, and files the moved path under the topic that took it", async () => {
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "beta", domain: "one", courses: ["xx1000-m1"], concepts: ["base"], manimkc: ["one/first"] }]),
    );
    await index();
    expect((await scratch.db.select().from(topic)).map((t) => t.slug)).toEqual(["beta"]);
    const paths = await scratch.db.execute<{ path: string; topic_slug: string }>(sql`select path, topic_slug from manimkc_topic`);
    expect(paths.rows).toEqual([{ path: "one/first", topic_slug: "beta" }]);
    const { rows } = await scratch.db.execute<{ snapshot: { links: Record<string, { path?: string }[]> } }>(
      sql`select snapshot from content_revision where entity_type = 'topic' and entity_id = 'alpha' and op = 'delete'`,
    );
    // Recorded as it was when it went: its relation, and the path it still held.
    expect(rows[0]?.snapshot.links["topic_relation"]).toHaveLength(1);
    expect(rows[0]?.snapshot.links["manimkc_topic"]?.map((l) => l.path)).toEqual(["one/second"]);
  }, 60_000);
});
