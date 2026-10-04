import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fileSource } from "@self-learn/content";
import { contentRevision, topic } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runExport } from "../src/commands/export";
import { runFlip } from "../src/commands/flip";
import { runImportCommand } from "../src/commands/index-command";
import { runEnqueue } from "../src/commands/job";
import { runParity } from "../src/commands/parity";
import { runTag, runTopic, TopicUsage } from "../src/commands/topic";
import { addTag, editTag } from "../src/content/tags";
import {
  addTopic,
  archiveTopic,
  type By,
  editTopic,
  listTopics,
  nearMatches,
  readTopicEntries,
  relateTopic,
  renameTopic,
  restampDocument,
  restoreTopic,
} from "../src/content/topics";
import { writeContent } from "../src/content/write";
import { writeThrough } from "../src/content/write-through";
import { makeFixture, note, tagsYaml, type Fixture } from "./fixture-tree";
import { migratedScratchDatabase, probe, type Scratch, sqlMessage } from "./scratch-database";

/**
 * Track A's writers (docs/CONTENT-MIGRATION.md, Track A; edge cases 2 and 17):
 * `catalog topic add|edit|rename|relate|archive|restore|ls` and `catalog tag
 * add|edit`, against a scratch database imported from a small tree under the
 * OS temp directory. Every write goes through the seam, and every write
 * rewrites that tree's `content/topics.yaml` or `content/tags.yaml` from the
 * rows (D17), so after each one an import of the tree must write nothing and
 * parity must be clean.
 */

const reachable = await probe();

const by: By = { author: "local", authorKind: "person", reason: "a test" };

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

/** A tree with three topics in two domains, a course whose module sits under one, and two notes. */
async function tree(): Promise<Fixture> {
  const fixture = await makeFixture();
  await fixture.write(
    "content/topics.yaml",
    [
      "topics:",
      "  - slug: alpha",
      "    title: Hash tables",
      "    domain: one",
      "    aliases: [hashing, hash map]",
      "    relations:",
      "      - {kind: related, to: beta}",
      "    maps:",
      "      manimkc: [one/first]",
      "      courses: [xx1000-m1]",
      "      concepts: [base, derived]",
      "  - slug: beta",
      "    title: Binary search trees",
      "    domain: one",
      "    aliases: [bst]",
      "    relations:",
      "      - {kind: broader, to: gamma}",
      "    maps:",
      "      manimkc: []",
      "      courses: []",
      "      concepts: []",
      "  - slug: gamma",
      "    title: Data structures",
      "    domain: two",
      "    aliases: []",
      "    maps:",
      "      manimkc: []",
      "      courses: []",
      "      concepts: []",
      "",
    ].join("\n"),
  );
  await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
  await fixture.write(
    "content/courses/xx1000.yaml",
    [
      "id: xx1000",
      "slug: xx1000",
      "code: XX1000",
      "title: A test course",
      "credits: 4",
      "order: 1",
      "inferred: false",
      "tags: [testing]",
      "modules:",
      "  - id: xx1000-m1",
      "    slug: m1",
      "    title: Module one",
      "    order: 1",
      "    topic: alpha",
      "    topics:",
      "      - id: xx1000-m1-t1",
      "        title: First item",
      "        concepts:",
      "          - base",
      "        subtopics: []",
      "    resources: []",
      "capstone: Build something",
      "",
    ].join("\n"),
  );
  await fixture.write("learn/concepts/testing/base.md", note({ id: "base", title: "Base" }));
  await fixture.write("learn/concepts/testing/derived.md", note({ id: "derived", title: "Derived", requires: ["base"] }));
  return fixture;
}

const revisionCount = (result: Awaited<ReturnType<typeof runImportCommand>>) =>
  result.sources.reduce((a, s) => a + Object.values(s.revisions).reduce((x, y) => x + y, 0), 0);

describe("restampDocument, without a database", () => {
  const document = {
    tldrawFileFormatVersion: 1,
    records: [
      { typeName: "shape", id: "shape:1", meta: { tldrawkc: { topic: "alpha" } } },
      { typeName: "document", id: "document:document", meta: { tldrawkc: { topic: "alpha", concepts: ["base"] } } },
    ],
  };

  it("rewrites the document record's stamp and nothing else", () => {
    const next = restampDocument(document, "alpha", "omega") as typeof document;
    expect(next.records[1]?.meta.tldrawkc).toEqual({ topic: "omega", concepts: ["base"] });
    expect(next.records[0]).toBe(document.records[0]);
    expect(document.records[1]?.meta.tldrawkc.topic).toBe("alpha");
  });

  it("says when nothing names the old slug", () => {
    expect(restampDocument(document, "beta", "omega")).toBeNull();
    expect(restampDocument({ records: "no" }, "alpha", "omega")).toBeNull();
  });
});

describe.skipIf(!reachable.ok)("topic and tag writers", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let restore: () => void;
  const topicsFile = () => readFile(path.join(fixture.root, "content/topics.yaml"), "utf8");

  /** After every write the tree is the database's export: an import writes nothing, parity is clean. */
  async function inStep(): Promise<void> {
    const imported = await runImportCommand({ dir: fixture.root });
    expect(revisionCount(imported)).toBe(0);
    const parity = await runParity({ dir: fixture.root });
    expect(parity.types.flatMap((t) => t.mismatches)).toEqual([]);
    expect(parity.clean).toBe(true);
  }

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    fixture = await tree();
    restore = pointAt(scratch.name);
    await runImportCommand({ dir: fixture.root });
    // The house style: header, dividers. From here the tree is the export.
    await runExport({ out: fixture.root });
    await runImportCommand({ dir: fixture.root });
  }, 60_000);

  afterAll(async () => {
    restore?.();
    await scratch?.drop();
    await fixture?.cleanup();
  });

  it("dry-runs an add: the entry, its place, near matches, and nothing written", async () => {
    const before = await topicsFile();
    const result = await addTopic(
      scratch.db,
      { slug: "hash-maps", title: "Hash maps", domain: "one", aliases: ["hash table"], relations: [{ kind: "broader", to: "gamma" }] },
      by,
      { dryRun: true },
    );
    expect(result.dryRun).toBe(true);
    expect(result.entry).toEqual({
      slug: "hash-maps",
      title: "Hash maps",
      domain: "one",
      summary: null,
      aliases: ["hash table"],
      relations: [{ kind: "broader", to: "gamma" }],
      maps: { manimkc: [], courses: [], concepts: [] },
    });
    expect(result.newDomain).toBe(false);
    // Edge case 17: the proposal looks like "alpha", and the check says so.
    expect(result.nearMatches[0]).toMatchObject({ slug: "alpha" });
    expect(result.nearMatches[0]?.score).toBeGreaterThanOrEqual(result.threshold);
    expect(result.revisions).toEqual([]);
    expect(await topicsFile()).toBe(before);
    expect((await scratch.db.select().from(topic).where(eq(topic.slug, "hash-maps"))).length).toBe(0);
  });

  it("finds nothing near a subject the vocabulary does not have", async () => {
    expect(await nearMatches(scratch.db, ["Photosynthesis in C4 plants"])).toEqual([]);
  });

  it("adds a topic inside its domain's group, with one create revision, and rewrites topics.yaml", async () => {
    const result = await addTopic(
      scratch.db,
      { slug: "tries", title: "Tries", domain: "one", summary: " Prefix trees. ", relations: [{ kind: "broader", to: "gamma" }] },
      by,
    );
    expect(result.revisions).toEqual([expect.objectContaining({ type: "topic", id: "tries", op: "create", changed: true })]);
    const entries = await readTopicEntries(scratch.db);
    expect(entries.map((e) => e.slug)).toEqual(["alpha", "beta", "tries", "gamma"]);
    expect(entries.find((e) => e.slug === "tries")).toMatchObject({ summary: "Prefix trees.", relations: [{ kind: "broader", to: "gamma" }] });
    expect(result.exported).toEqual([expect.objectContaining({ type: "topics", written: ["content/topics.yaml"], recorded: true })]);
    expect(await topicsFile()).toContain("- slug: tries");
    await inStep();
  }, 60_000);

  it("stores a related edge once, under the smaller slug, as a revision of that topic", async () => {
    // "zebra" > "beta": the edge belongs to beta's snapshot.
    const result = await addTopic(
      scratch.db,
      { slug: "zebra", title: "Zebra stripes", domain: "three", relations: [{ kind: "related", to: "beta" }] },
      by,
    );
    expect(result.newDomain).toBe(true);
    expect(result.entry.relations).toEqual([]);
    expect(result.revisions.map((r) => `${r.type} ${r.id} ${r.op}`)).toEqual(["topic zebra create", "topic beta update"]);
    const edges = await scratch.db.execute(sql`select from_slug, to_slug, kind from topic_relation where kind = 'related' order by from_slug`);
    expect(edges.rows).toEqual([
      { from_slug: "alpha", to_slug: "beta", kind: "related" },
      { from_slug: "beta", to_slug: "zebra", kind: "related" },
    ]);
    // Adding it again from the other end is the same edge.
    await expect(relateTopic(scratch.db, { from: "beta", kind: "related", to: "zebra" }, by)).rejects.toThrow(/already recorded/);
    await inStep();
  }, 60_000);

  it("refuses, by name, what the vocabulary cannot hold", async () => {
    const add = (input: Partial<Parameters<typeof addTopic>[1]>) =>
      addTopic(scratch.db, { slug: "new-one", title: "New one", domain: "one", ...input }, by);
    await expect(add({ slug: "alpha" })).rejects.toThrow(/topic "alpha" already exists/);
    await expect(add({ slug: "Not_Kebab" })).rejects.toThrow(/is not kebab-case/);
    await expect(add({ domain: "Two Words" })).rejects.toThrow(/--domain "Two Words" is not kebab-case/);
    await expect(add({ title: "  " })).rejects.toThrow(/--title is required/);
    await expect(add({ title: "hash  TABLES" })).rejects.toThrow(/topic "alpha" already has the title/);
    await expect(add({ aliases: ["x", "x"] })).rejects.toThrow(/alias "x" is given twice/);
    await expect(add({ relations: [{ kind: "broader", to: "nowhere" }] })).rejects.toThrow(/no related topic "nowhere"/);
    await expect(add({ relations: [{ kind: "broader", to: "new-one" }] })).rejects.toThrow(/cannot relate to itself/);
    await expect(relateTopic(scratch.db, { from: "gamma", kind: "broader", to: "beta" }, by)).rejects.toThrow(/would close a loop/);
    await expect(relateTopic(scratch.db, { from: "alpha", kind: "precedes", to: "alpha" }, by)).rejects.toThrow(/itself/);
    await expect(relateTopic(scratch.db, { from: "alpha", kind: "precedes", to: "gamma" }, { ...by, reason: " " })).rejects.toThrow(
      /needs a reason/,
    );
    await inStep();
  }, 60_000);

  it("refuses to write over an edit the database has not seen, and leaves the file alone", async () => {
    const file = path.join(fixture.root, "content/topics.yaml");
    const original = await topicsFile();
    const edited = original.replace("title: Data structures", "title: Data structures, edited by hand");
    await writeFile(file, edited);
    try {
      await expect(editTopic(scratch.db, { slug: "beta", summary: "Ordered." }, by)).rejects.toThrow(
        /content\/topics\.yaml under .* is not what the database holds: content\/topics\.yaml differ/,
      );
      expect(await topicsFile()).toBe(edited);
      const [row] = await scratch.db.select().from(topic).where(eq(topic.slug, "beta"));
      expect(row?.summary).toBeNull();
    } finally {
      await writeFile(file, original);
    }
  });

  it("puts the file back when the commit fails after it was written", async () => {
    // A deferred foreign key fails at commit, after the file is replaced.
    await scratch.db.execute(sql`create table if not exists late_check (
      slug text references topic (slug) deferrable initially deferred)`);
    const before = await topicsFile();
    await expect(
      writeThrough(scratch.db, ["topics"], async (tx) => {
        const [row] = await tx.select().from(topic).where(eq(topic.slug, "beta"));
        await writeContent(tx, {
          owner: "local",
          type: "topic",
          id: "beta",
          next: { row: { ...row, summary: "Written, then rolled back." } },
          base: Number((await tx.execute<{ id: string }>(sql`select max(id) as id from content_revision where entity_type = 'topic' and entity_id = 'beta'`)).rows[0]?.id),
          ...by,
        });
        await tx.execute(sql`insert into late_check values ('no-such-topic')`);
      }),
    ).rejects.toSatisfy((error) => /late_check/.test(sqlMessage(error)));
    expect(await topicsFile()).toBe(before);
    const [row] = await scratch.db.select().from(topic).where(eq(topic.slug, "beta"));
    expect(row?.summary).toBeNull();
    await scratch.db.execute(sql`drop table late_check`);
  });

  it("edits title, aliases and domain, moving the topic into its new group; an edit that changes nothing writes nothing", async () => {
    const result = await editTopic(
      scratch.db,
      { slug: "tries", title: "Tries and radix trees", addAliases: ["prefix tree"], domain: "two" },
      by,
    );
    expect(result.revisions).toEqual([expect.objectContaining({ type: "topic", id: "tries", op: "update" })]);
    const entries = await readTopicEntries(scratch.db);
    expect(entries.map((e) => e.slug)).toEqual(["alpha", "beta", "gamma", "tries", "zebra"]);
    expect(entries.find((e) => e.slug === "tries")).toMatchObject({ domain: "two", aliases: ["prefix tree"] });
    await expect(editTopic(scratch.db, { slug: "tries", dropAliases: ["nope"] }, by)).rejects.toThrow(/has no alias "nope"/);
    const same = await editTopic(scratch.db, { slug: "tries", title: "Tries and radix trees" }, by);
    expect(same.changed).toBe(false);
    expect(same.revisions).toEqual([]);
    expect(same.exported[0]?.written).toEqual([]);
    await inStep();
  }, 60_000);

  it("adds and removes an edge", async () => {
    const added = await relateTopic(scratch.db, { from: "alpha", kind: "precedes", to: "tries" }, by);
    expect(added.stored).toEqual({ from: "alpha", kind: "precedes", to: "tries" });
    expect((await readTopicEntries(scratch.db)).find((e) => e.slug === "alpha")?.relations).toEqual([
      { kind: "related", to: "beta" },
      { kind: "precedes", to: "tries" },
    ]);
    await relateTopic(scratch.db, { from: "alpha", kind: "precedes", to: "tries", remove: true }, by);
    await expect(relateTopic(scratch.db, { from: "alpha", kind: "precedes", to: "tries", remove: true }, by)).rejects.toThrow(
      /no "alpha" precedes "tries" edge/,
    );
    await inStep();
  }, 60_000);

  it("lists every topic with what the planner needs, incoming edges included", async () => {
    const list = await listTopics(scratch.db);
    const alpha = list.topics.find((t) => t.slug === "alpha");
    expect(alpha).toMatchObject({
      title: "Hash tables",
      domain: "one",
      aliases: ["hashing", "hash map"],
      relations: [{ kind: "related", to: "beta" }],
      maps: { concepts: ["base", "derived"], courses: ["xx1000-m1"], manimkc: ["one/first"] },
      incoming: [],
    });
    expect(list.topics.find((t) => t.slug === "beta")?.incoming).toEqual([{ kind: "related", from: "alpha" }]);
    expect(list.counts).toMatchObject({ topics: 5, domains: 3 });
    // The same entries the file reader gives for the file the writes left.
    expect(await fileSource(fixture.root).topics()).toEqual(await readTopicEntries(scratch.db));
  });

  it("refuses to archive while topics are read from files", async () => {
    await expect(archiveTopic(scratch.db, "zebra", by)).rejects.toThrow(/topics are still read from content\/topics\.yaml/);
  });

  it("archives an unused topic once the database owns topics, refuses one in use, and restores", async () => {
    await runFlip({ type: "topics", readers: new Set(["topics"]) });
    await expect(archiveTopic(scratch.db, "alpha", by)).rejects.toThrow(
      /"alpha" is still in use.*2 live concepts filed under it: base, derived.*1 live modules mapped to it: xx1000-m1/s,
    );
    await relateTopic(scratch.db, { from: "zebra", kind: "related", to: "beta", remove: true }, by);
    const archived = await archiveTopic(scratch.db, "zebra", by);
    expect(archived.revisions).toEqual([expect.objectContaining({ op: "archive" })]);
    expect(await topicsFile()).not.toContain("zebra");
    // The database owns topics now: the import skips the file, which is its export.
    const imported = await runImportCommand({ dir: fixture.root });
    expect(imported.skipped.map((s) => s.source)).toContain("topics");
    expect(revisionCount(imported)).toBe(0);
    const restored = await restoreTopic(scratch.db, "zebra", by);
    expect(restored.revisions).toEqual([expect.objectContaining({ op: "restore" })]);
    expect(await topicsFile()).toContain("- slug: zebra");
    await inStep();
  }, 60_000);

  it("renames a topic in one transaction: every reference, the course file, a diagram's stamp, an open job, the alias", async () => {
    // A diagram row stamped with the topic, as Track D stores one. The
    // database owns diagrams first: the diagrams import owns `diagram` rows
    // since Track D, and while it reads files it would prune a row with no
    // `.tldr` behind it, which is not what this test is about.
    await runFlip({ type: "diagrams", readers: new Set(["diagrams"]) });
    const document = {
      records: [{ typeName: "document", id: "document:document", meta: { tldrawkc: { topic: "alpha", concepts: [] } } }],
    };
    await writeContent(scratch.db, {
      owner: "local",
      type: "diagram",
      id: "alpha-picture",
      next: { row: { slug: "alpha-picture", title: "A picture", topicSlug: "alpha", document, documentHash: "seeded" } },
      base: null,
      ...by,
    });
    // Its `.tldr` asset, whose hash is the document's by definition.
    await writeContent(scratch.db, {
      owner: "local",
      type: "asset",
      id: "diagram:learn/assets/alpha-picture.tldr",
      next: {
        row: {
          id: "diagram:learn/assets/alpha-picture.tldr",
          kind: "diagram_source",
          path: "learn/assets/alpha-picture.tldr",
          url: null,
          contentHash: "seeded",
          bytes: 1,
          title: "A picture",
          sourceRepo: "self-learn",
          blobKey: null,
          resourceType: null,
          ownerId: "local",
        },
        links: { asset_topic: [{ topicSlug: "alpha" }], asset_concept: [], asset_derivation: [] },
      },
      base: null,
      ...by,
    });
    const job = await runEnqueue({
      brief: { topic: "alpha", target: "learn/assets/alpha-picture.tldr", idempotencyKey: "rename-test", brief: { topic: "alpha", title: "x" } },
      repoRoot: fixture.root,
    });
    const before = await scratch.db.execute<{ id: number }>(
      sql`select id from content_revision where entity_type = 'topic' and entity_id = 'alpha' order by seq desc limit 1`,
    );

    // "zeta" > "beta": the related edge alpha kept moves to beta.
    const result = await renameTopic(scratch.db, { from: "alpha", to: "zeta" }, { ...by, reason: "a clearer slug" });
    expect(result.revisions.map((r) => `${r.type} ${r.id}`).sort()).toEqual(
      [
        "topic zeta",
        "topic beta",
        "concept base",
        "concept derived",
        "collection xx1000-m1",
        "curriculum_item xx1000-m1-t1",
        "asset note:learn/concepts/testing/base.md",
        "asset note:learn/concepts/testing/derived.md",
        "diagram alpha-picture",
        "asset diagram:learn/assets/alpha-picture.tldr",
      ].sort(),
    );
    expect(result.exported.map((e) => [e.type, e.written])).toEqual([
      ["courses", ["content/courses/xx1000.yaml"]],
      ["topics", ["content/topics.yaml"]],
    ]);
    expect(result.jobs).toEqual([job.job.id]);

    const [row] = await scratch.db.select().from(topic).where(eq(topic.slug, "zeta"));
    expect(row?.aliases).toEqual(["hashing", "hash map", "alpha"]);
    const own = await scratch.db.select().from(contentRevision).where(eq(contentRevision.entityId, "zeta"));
    expect(own).toEqual([expect.objectContaining({ op: "rename", seq: 1, previousId: Number(before.rows[0]?.id), reason: "a clearer slug" })]);
    const refs = await scratch.db.execute(sql`
      select (select topic_slug from concept where slug = 'base') as concept,
             (select topic_slug from collection_item where collection_id = 'xx1000-m1' and topic_slug is not null) as module,
             (select topic_slug from diagram where slug = 'alpha-picture') as diagram,
             (select document #>> '{records,0,meta,tldrawkc,topic}' from diagram where slug = 'alpha-picture') as stamp,
             (select brief ->> 'topic' from job where id = ${job.job.id}) as brief,
             (select topic_slug from job where id = ${job.job.id}) as job`);
    expect(refs.rows[0]).toEqual({ concept: "zeta", module: "zeta", diagram: "zeta", stamp: "zeta", brief: "zeta", job: "zeta" });
    const hashes = await scratch.db.execute(sql`
      select (select document_hash from diagram where slug = 'alpha-picture') as document,
             (select content_hash from asset where id = 'diagram:learn/assets/alpha-picture.tldr') as asset`);
    expect(hashes.rows[0]?.asset).toBe(hashes.rows[0]?.document);
    expect(
      (await scratch.db.execute(sql`select from_slug, to_slug from topic_relation where kind = 'related'`)).rows,
    ).toEqual([{ from_slug: "beta", to_slug: "zeta" }]);
    expect(await readFile(path.join(fixture.root, "content/courses/xx1000.yaml"), "utf8")).toContain("topic: zeta");
    await expect(renameTopic(scratch.db, { from: "zeta", to: "beta" }, by)).rejects.toThrow(/topic "beta" already exists/);
    await expect(renameTopic(scratch.db, { from: "alpha", to: "omega" }, by)).rejects.toThrow(/no topic "alpha"/);
    // Once the database owns diagrams a write reaches no file (D17); the tree
    // is back in step with it after an export, which is what parity checks.
    await runExport({ out: fixture.root, only: ["diagrams"] });
    await inStep();
  }, 60_000);

  it("adds and edits a tag, rewriting tags.yaml", async () => {
    const added = await addTag(scratch.db, { id: "networks", label: "Networks", description: "Protocols" }, by);
    expect(added.revisions).toEqual([expect.objectContaining({ type: "tag", id: "networks", op: "create" })]);
    expect(await readFile(path.join(fixture.root, "content/tags.yaml"), "utf8")).toMatch(/- id: networks\n\s+label: Networks/);
    await expect(addTag(scratch.db, { id: "networks", label: "N", description: "d" }, by)).rejects.toThrow(/already exists/);
    await expect(addTag(scratch.db, { id: "empty", label: "E", description: "" }, by)).rejects.toThrow(/--description is required/);
    const edited = await editTag(scratch.db, { id: "networks", label: "Networking" }, by);
    expect(edited.tag).toEqual({ id: "networks", label: "Networking", description: "Protocols" });
    await expect(editTag(scratch.db, { id: "nope", label: "x" }, by)).rejects.toThrow(/no tag "nope"/);
    await inStep();
  }, 60_000);

  it("wants a reason and the right arguments at the command line, before touching the database", async () => {
    await expect(runTopic(["topic", "add"], { slug: "x", title: "X", domain: "one" })).rejects.toBeInstanceOf(TopicUsage);
    await expect(runTopic(["topic", "edit", "beta"], { title: "B" })).rejects.toThrow(/needs --reason/);
    await expect(runTopic(["topic", "relate", "beta"], { reason: ["r"] })).rejects.toBeInstanceOf(TopicUsage);
    await expect(runTag(["tag", "add"], { id: "x", reason: ["r"] })).rejects.toBeInstanceOf(TopicUsage);
    await expect(runTopic(["topic", "fly"], {})).rejects.toBeInstanceOf(TopicUsage);
    // Malformed values are usage errors too, found before the database is asked anything.
    const never = async () => {
      throw new Error("the database was reached");
    };
    const usage = async (run: Promise<unknown>, message: RegExp) => {
      const error = await run.then(() => null, (e: unknown) => e);
      expect(error).toBeInstanceOf(TopicUsage);
      expect((error as Error).message).toMatch(message);
    };
    await usage(runTopic(["topic", "relate", "beta", "above", "gamma"], { reason: ["r"] }, never), /relation kind must be one of/);
    await usage(runTopic(["topic", "add"], { slug: "Bad Slug", title: "X", domain: "one", reason: ["r"] }, never), /not kebab-case/);
    await usage(runTopic(["topic", "add"], { slug: "x", title: "X", domain: "one", relate: ["sideways:y"], reason: ["r"] }, never), /kind:slug/);
    await usage(runTopic(["topic", "rename"], { from: "a", to: "a", reason: ["r"] }, never), /same slug/);
    await usage(runTopic(["topic", "edit", "beta"], { domain: "Not Kebab", reason: ["r"] }, never), /not kebab-case/);
    await usage(runTag(["tag", "add"], { id: "x", label: "X", description: " ", reason: ["r"] }, never), /--description is required/);
    // A dry run needs no reason: it writes nothing.
    const dry = await runTopic(["topic", "add"], { slug: "heaps", title: "Heaps", domain: "two", "dry-run": true });
    expect(dry).toMatchObject({ verb: "add", dryRun: true });
  });
});

describe.skipIf(!reachable.ok)("renaming a topic a diagram file stamps, while diagrams are files", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let restore: () => void;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    fixture = await tree();
    const stamped = {
      tldrawFileFormatVersion: 1,
      schema: {},
      records: [{ typeName: "document", id: "document:document", meta: { tldrawkc: { topic: "gamma", concepts: [] } } }],
    };
    await fixture.write("learn/assets/gamma-map.tldr", JSON.stringify(stamped));
    restore = pointAt(scratch.name);
    await runImportCommand({ dir: fixture.root });
    await runExport({ out: fixture.root, only: ["topics", "tags", "courses"] });
  }, 60_000);

  afterAll(async () => {
    restore?.();
    await scratch?.drop();
    await fixture?.cleanup();
  });

  it("refuses by name, and goes ahead listing the files to restamp when told to", async () => {
    await expect(renameTopic(scratch.db, { from: "gamma", to: "structures" }, by)).rejects.toThrow(
      /1 diagram file\(s\) stamp "gamma".*learn\/assets\/gamma-map\.tldr.*--restamp-diagrams-later/s,
    );
    expect((await scratch.db.select().from(topic).where(eq(topic.slug, "gamma"))).length).toBe(1);
    const result = await renameTopic(scratch.db, { from: "gamma", to: "structures", restampDiagramsLater: true }, by);
    expect(result.restamp).toEqual(["learn/assets/gamma-map.tldr"]);
    // Untouched, and the next import says so rather than filing it under nothing.
    expect(await readFile(path.join(fixture.root, "learn/assets/gamma-map.tldr"), "utf8")).toContain('"topic":"gamma"');
    await expect(runImportCommand({ dir: fixture.root })).rejects.toThrow(/names topic "gamma"/);
    await rm(path.join(fixture.root, "learn/assets/gamma-map.tldr"));
  }, 60_000);
});
