import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  asset,
  collectionItem,
  COMMONS_OWNER,
  concept,
  contentRevision,
  curriculumItem,
  diagram,
  job,
  LOCAL_LEARNER_ID,
  manimkcTopic,
  progress,
  session,
  topic,
  topicRelation,
} from "@self-learn/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { doctor } from "../src/commands/doctor";
import { runExport } from "../src/commands/export";
import { runImportCommand } from "../src/commands/index-command";
import { JobError, runAccept, runClaim, runDiscard, runEnqueue, runFinish, runList, runShow } from "../src/commands/job";
import { importCourse } from "../src/content/courses";
import { archiveItem, purgeItem } from "../src/content/items";
import { linkOwners } from "../src/content/link-owners";
import { type By, relateTopic, renameTopic, TopicError } from "../src/content/topics";
import { ContentWriteError, deleteContent, writeContent } from "../src/content/write";
import { applyMigrations } from "../src/migrations";
import { endSession, ensureLearner, ensureSession, readSession, StateError } from "../src/state";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * The write verbs the phase 4 review found going around the seam's owner
 * check, one case each ("Phase 4 review fixes, slice 1" in
 * docs/CONTENT-MIGRATION.md), and D24: a link belongs to its parent's owner.
 *
 * The CLI writes as `local`. A second owner, `other`, holds a topic, a course
 * item, a link asset and a job; the commons holds a topic anyone may link to.
 * The tree is a small fixture under the OS temp directory, imported first, so
 * the writers keep it in step as they would the owner's.
 */

const reachable = await probe();

const OTHER = "other";
const by: By = { author: "local", authorKind: "person", reason: "a test" };

const COURSE = [
  "id: lc1000",
  "slug: lc1000",
  "code: LC1000",
  "title: The owner's course",
  "credits: 4",
  "order: 1",
  "inferred: false",
  "tags: [mine]",
  "modules:",
  "  - id: lc1000-m1",
  "    slug: m1",
  "    title: Module one",
  "    order: 1",
  "    topic: alpha",
  "    topics:",
  "      - id: lc1000-m1-t1",
  "        title: First item",
  "        concepts:",
  "          - base",
  "        subtopics: []",
  "      - id: lc1000-m1-t2",
  "        title: Second item",
  "        concepts:",
  "          - base",
  "        subtopics: []",
  "    resources:",
  "      - id: lc1000-m1-r1",
  "        title: A link",
  "        url: https://example.com/one",
  "        type: docs",
  "capstone: Build something.",
  "",
].join("\n");

function pointAt(name: string): () => void {
  const saved = { url: process.env["DATABASE_URL"], manimkc: process.env["MANIMKC_ROOT"] };
  const url = new URL(process.env["DATABASE_URL"] ?? "postgres://localhost:5432/self_learn");
  url.pathname = `/${name}`;
  process.env["DATABASE_URL"] = url.toString();
  process.env["MANIMKC_ROOT"] = path.join(tmpdir(), "catalog-test-no-manimkc");
  return () => {
    for (const [key, value] of [["DATABASE_URL", saved.url], ["MANIMKC_ROOT", saved.manimkc]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

describe.skipIf(!reachable.ok)("write verbs and owners", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let dir: string;
  let restore: () => void;
  const courseFile = () => path.join(fixture.root, "content/courses/lc1000.yaml");

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    const db = scratch.db;
    await applyMigrations(db);
    dir = await mkdtemp(path.join(tmpdir(), "scope-writes-"));
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([
        { slug: "alpha", courses: ["lc1000-m1"], concepts: ["base"], manimkc: ["one/other-folder"] },
        { slug: "beta" },
        { slug: "other-topic", concepts: ["other-concept"] },
        { slug: "shared-topic" },
      ]),
    );
    await fixture.write("content/tags.yaml", tagsYaml(["mine"]));
    await fixture.write("content/courses/lc1000.yaml", COURSE);
    await fixture.write("learn/concepts/one/base.md", note({ id: "base" }));
    await fixture.write("learn/concepts/two/other-concept.md", note({ id: "other-concept" }));
    restore = pointAt(scratch.name);
    await runImportCommand({ dir: fixture.root });

    // Then the owners, as the review's seed set them: `other` holds a topic
    // and a concept, the commons a topic, and two of the owner's topic's
    // links carry `other`'s name (D24's mixed state).
    await ensureLearner(db, LOCAL_LEARNER_ID);
    await ensureLearner(db, OTHER);
    await ensureLearner(db, COMMONS_OWNER);
    await db.update(topic).set({ ownerId: OTHER }).where(eq(topic.slug, "other-topic"));
    await db.update(topic).set({ ownerId: COMMONS_OWNER }).where(eq(topic.slug, "shared-topic"));
    await db.update(concept).set({ ownerId: OTHER }).where(eq(concept.slug, "other-concept"));
    await db.insert(topicRelation).values([
      { fromSlug: "alpha", toSlug: "beta", kind: "precedes", position: 1 },
      { fromSlug: "alpha", toSlug: "shared-topic", kind: "precedes", position: 2, ownerId: OTHER },
    ]);
    await db.update(manimkcTopic).set({ ownerId: OTHER }).where(eq(manimkcTopic.path, "one/other-folder"));
    // The files the write-through keeps in step are the database's own export.
    await runExport({ out: fixture.root, only: ["topics", "tags", "courses", "concepts"] });
  }, 120_000);

  afterAll(async () => {
    restore?.();
    await scratch?.drop();
    await fixture?.cleanup();
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  });

  it("refuses to rename another owner's topic, and moves nothing", async () => {
    const rename = renameTopic(scratch.db, { from: "other-topic", to: "renamed-topic" }, by);
    await expect(rename).rejects.toBeInstanceOf(TopicError);
    await expect(rename).rejects.toMatchObject({ code: "foreign-owner" });
    expect(await scratch.db.select().from(topic).where(eq(topic.slug, "other-topic"))).toHaveLength(1);
    expect(await scratch.db.select().from(contentRevision).where(eq(contentRevision.entityId, "renamed-topic"))).toEqual([]);
  });

  it("refuses a relation to another owner's topic as missing, and takes the commons'", async () => {
    await expect(relateTopic(scratch.db, { from: "beta", kind: "precedes", to: "other-topic" }, by)).rejects.toMatchObject({
      code: "missing",
    });
    await expect(relateTopic(scratch.db, { from: "beta", kind: "precedes", to: "shared-topic" }, by)).resolves.toMatchObject({
      changed: true,
    });
  });

  it("reports the mixed links, and lets the owner write its own topic, which restamps them (D24)", async () => {
    const before = await linkOwners(scratch.db);
    expect(before.mixed.map((row) => `${row.table} ${row.parent} ${row.far}`)).toEqual([
      "manimkc_topic alpha one/other-folder",
      "topic_relation alpha shared-topic",
    ]);
    // Adding to a list holding another owner's row used to be refused.
    await relateTopic(scratch.db, { from: "alpha", kind: "broader", to: "beta" }, by);
    const rows = await scratch.db.select().from(topicRelation).where(eq(topicRelation.fromSlug, "alpha"));
    expect(new Set(rows.map((row) => row.ownerId))).toEqual(new Set([LOCAL_LEARNER_ID]));
    expect(rows).toHaveLength(3);
    // The mapping is still mixed until doctor --fix restamps it.
    expect((await linkOwners(scratch.db)).mixed.map((row) => row.table)).toEqual(["manimkc_topic"]);
    const report = await doctor(scratch.db, "scratch", { fix: true });
    expect(report.links.restamped).toEqual(["alpha"]);
    expect(report.links.mixed).toEqual([]);
    const [mapping] = await scratch.db.select().from(manimkcTopic).where(eq(manimkcTopic.path, "one/other-folder"));
    expect(mapping?.ownerId).toBe(LOCAL_LEARNER_ID);
  });

  it("refuses a new link to a row its owner cannot read, and carries an old one over", async () => {
    const latestOf = async () => {
      const [latest] = await scratch.db
        .select({ id: contentRevision.id })
        .from(contentRevision)
        .where(and(eq(contentRevision.entityType, "concept"), eq(contentRevision.entityId, "base")))
        .orderBy(sql`seq desc`)
        .limit(1);
      return latest?.id ?? null;
    };
    const write = async (topicSlug: string) =>
      writeContent(scratch.db, {
        owner: LOCAL_LEARNER_ID,
        type: "concept",
        id: "base",
        base: await latestOf(),
        next: { row: { slug: "base", title: "Base", topicSlug, path: "learn/concepts/one/base.md", body: "x\n" } },
        ...by,
      });
    await expect(write("other-topic")).rejects.toMatchObject({ code: "foreign-owner" });
    await expect(write("shared-topic")).resolves.toMatchObject({ changed: true });
    // A concept of the owner's already filed under another owner's topic (the
    // review's seed did this) can still be written, keeping that topic.
    await scratch.db.execute(sql`update concept set topic_slug = 'other-topic' where slug = 'base'`);
    await expect(
      writeContent(scratch.db, {
        owner: LOCAL_LEARNER_ID,
        type: "concept",
        id: "base",
        base: await latestOf(),
        next: { row: { slug: "base", title: "Base, retitled", topicSlug: "other-topic", path: "learn/concepts/one/base.md", body: "x\n" } },
        ...by,
      }),
    ).resolves.toMatchObject({ changed: true });
    expect((await linkOwners(scratch.db)).unreadable.map((row) => `${row.table} ${row.parent} ${row.far}`)).toContain(
      "concept.topic_slug base other-topic",
    );
    await scratch.db.execute(sql`update concept set topic_slug = 'alpha' where slug = 'base'`);
  });

  it("deletes through the seam only what the owner holds", async () => {
    await scratch.db.insert(asset).values({
      id: "link:theirs",
      kind: "link",
      url: "https://example.com/t",
      title: "Their link",
      resourceType: "docs",
      sourceRepo: "self-learn",
      ownerId: OTHER,
    });
    await expect(
      deleteContent(scratch.db, { type: "asset", id: "link:theirs", owner: LOCAL_LEARNER_ID, base: null, ...by }),
    ).rejects.toMatchObject({ code: "foreign-owner" });
    expect(await scratch.db.select().from(asset).where(eq(asset.id, "link:theirs"))).toHaveLength(1);
  });

  it("drops another owner's link from the owner's module on a course import, and leaves the link itself", async () => {
    // Grafted into the owner's module around the seam, as the review's seed did.
    await scratch.db.insert(collectionItem).values({ collectionId: "lc1000-m1", position: 99, assetId: "link:theirs" });
    await runExport({ out: fixture.root, only: ["courses"] });
    const file = path.join(dir, "lc1000.yaml");
    const edited = (await readFile(courseFile(), "utf8"))
      .replace("title: Module one", "title: Module one, retitled")
      .replace(/ {4}resources:\n(?: {6}.*\n)+/, "    resources: []\n");
    expect(edited).toContain("resources: []");
    await writeFile(file, edited);
    const dropped = await importCourse(scratch.db, { file, reason: "drop the links" });
    // The owner's own link is deleted through the seam; theirs is not the course's to delete.
    expect(dropped.deletedLinks).toEqual(["link:lc1000-m1-r1"]);
    expect(await scratch.db.select().from(asset).where(eq(asset.id, "link:theirs"))).toHaveLength(1);
    expect(await scratch.db.select().from(collectionItem).where(eq(collectionItem.assetId, "link:theirs"))).toEqual([]);
  });

  it("purges only the owner's item, and only the purging learner's rows", async () => {
    await scratch.db
      .insert(curriculumItem)
      .values({ id: "their-item", collectionId: "lc1000-m1", position: 5000, title: "Theirs", ownerId: OTHER, archivedAt: new Date() });
    await runExport({ out: fixture.root, only: ["courses"] });
    await expect(purgeItem(scratch.db, { id: "their-item", reason: "tidy", withLearnerData: true })).rejects.toThrow(/belongs to other/);
    expect(await scratch.db.select().from(curriculumItem).where(eq(curriculumItem.id, "their-item"))).toHaveLength(1);

    await archiveItem(scratch.db, { id: "lc1000-m1-t2", reason: "off the path" });
    await scratch.db.insert(progress).values([
      { learnerId: LOCAL_LEARNER_ID, curriculumItemId: "lc1000-m1-t2", completedAt: new Date() },
      { learnerId: OTHER, curriculumItemId: "lc1000-m1-t2", note: "theirs" },
    ]);
    await expect(purgeItem(scratch.db, { id: "lc1000-m1-t2", reason: "tidy", withLearnerData: true })).rejects.toThrow(
      /other learners/,
    );
    expect(await scratch.db.select().from(progress).where(eq(progress.curriculumItemId, "lc1000-m1-t2"))).toHaveLength(2);
    await scratch.db.delete(progress).where(eq(progress.learnerId, OTHER));
    const purged = await purgeItem(scratch.db, { id: "lc1000-m1-t2", reason: "tidy", withLearnerData: true });
    expect(purged.detail).toEqual([`progress of ${LOCAL_LEARNER_ID}`]);
  });

  it("acts on a job only for its owner", async () => {
    const brief = (key: string, target: string, topicSlug = "alpha") => ({
      topic: topicSlug,
      target,
      idempotencyKey: key,
      brief: { prompt: "draw" },
    });
    const mine = await runEnqueue({ brief: brief("k-mine", "learn/assets/mine.tldr"), repoRoot: dir });
    const id = mine.job.id;
    expect((await scratch.db.select({ ownerId: job.ownerId }).from(job).where(eq(job.id, id)))[0]?.ownerId).toBe(LOCAL_LEARNER_ID);

    // To another owner the job is no job, on every verb.
    await expect(runShow(id, OTHER)).rejects.toThrow(`no job "${id}"`);
    await expect(runClaim({ jobId: id, owner: OTHER })).rejects.toThrow(`no job "${id}"`);
    await expect(runFinish({ jobId: id, state: "failed", owner: OTHER })).rejects.toThrow(`no job "${id}"`);
    await expect(runAccept({ jobId: id, owner: OTHER })).rejects.toThrow(`no job "${id}"`);
    await expect(runDiscard({ jobId: id, owner: OTHER })).rejects.toThrow(`no job "${id}"`);
    expect((await runList({ owner: OTHER })).jobs).toEqual([]);
    expect((await runClaim({ owner: OTHER })).claimed).toBe(false);
    expect((await runList({})).jobs.map((j) => j.id)).toEqual([id]);

    // A key another owner used is refused without handing their job back.
    await expect(runEnqueue({ brief: brief("k-mine", "learn/assets/else.tldr"), repoRoot: dir, owner: OTHER })).rejects.toThrow(
      /already taken by another job/,
    );
    // Another owner's topic reads as missing, and another owner's diagram slug as taken.
    await expect(runEnqueue({ brief: brief("k-2", "learn/assets/x.tldr", "other-topic"), repoRoot: dir })).rejects.toThrow(
      /no topic "other-topic"/,
    );
    await scratch.db.insert(diagram).values({ slug: "their-diagram", ownerId: OTHER, topicSlug: "other-topic", document: { records: [] }, documentHash: "a".repeat(64) });
    await expect(runEnqueue({ brief: brief("k-3", "learn/assets/their-diagram.tldr"), repoRoot: dir })).rejects.toBeInstanceOf(JobError);

    // The owner's own verbs are unchanged.
    await expect(runFinish({ jobId: id, state: "cancelled" })).resolves.toMatchObject({ to: "cancelled" });
  });

  it("neither adopts nor ends another learner's session", async () => {
    await scratch.db.insert(session).values({ id: "their-session", kind: "tutor", learnerId: OTHER, state: "running" });
    await expect(ensureSession(scratch.db, { id: "their-session" }, LOCAL_LEARNER_ID)).rejects.toBeInstanceOf(StateError);
    expect(await endSession(scratch.db, "their-session", "failed", {}, LOCAL_LEARNER_ID)).toEqual({ moved: false, from: null });
    expect((await readSession(scratch.db, "their-session"))?.state).toBe("running");
    expect(await readSession(scratch.db, "their-session", LOCAL_LEARNER_ID)).toBeUndefined();
    expect(await endSession(scratch.db, "their-session", "failed", {}, OTHER)).toMatchObject({ moved: true, from: "running" });
  });

  it("keeps a ContentWriteError a ContentWriteError", () => {
    expect(new ContentWriteError("foreign-owner", "x")).toBeInstanceOf(Error);
  });
});
