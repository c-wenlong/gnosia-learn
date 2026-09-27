import { concept, topic } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { doctor } from "../src/commands/doctor";
import { conceptsIndexer } from "../src/index/concepts";
import { topicsIndexer } from "../src/index/topics";
import { writeSource } from "../src/index/writer";
import { applyMigrations } from "../src/migrations";
import { makeFixture, note, topicsYaml, type Fixture } from "./fixture-tree";
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
    expect(report.migrations.pending).toEqual(["0012_concept_topic_not_null"]);
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

  it("is refused by name, and moving the concept first lets the topic go", async () => {
    const topics = async () => {
      const context = await fixture.context();
      const { rows } = await topicsIndexer.read(context);
      return writeSource(scratch.db, topicsIndexer, rows, [], topicsIndexer.root(context));
    };
    // The concept moved to beta and alpha removed, in one edit.
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "beta", concepts: ["base"] }]));
    await expect(topics()).rejects.toThrow(
      /no longer lists topics that concepts are still filed under: alpha \(base\)/,
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
