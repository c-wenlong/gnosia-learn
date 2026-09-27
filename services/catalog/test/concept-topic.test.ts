import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { renderType } from "../src/content/export";
import { fileConceptUnderTopic } from "../src/content/topics";
import { writeThrough } from "../src/content/write-through";
import { runIndex } from "../src/index/run";
import { applyMigrations } from "../src/migrations";
import { addConceptToItem, CourseEditError } from "../src/learn/course-edit";
import { connect } from "../src/db";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * `learn concept add --topic <slug>`: the one workflow gap that made a tutoring
 * session hand-edit `content/topics.yaml`.
 *
 * The topic half used to be a text splice on `content/topics.yaml`. It is a
 * write through the catalog now (`fileConceptUnderTopic`): `concept.topic_slug`
 * through the seam, and the file rewritten from the rows. The course half
 * (`--item`) is still a text edit, tested pure below. The command gets a
 * scratch database and a temporary knowledge base imported into it, and is
 * checked on what a session actually depends on: the slug lands under the
 * right topic and nowhere else, a wrong slug costs nothing, and the `--json`
 * shape says whether the note is queryable yet.
 */

const execFileAsync = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(HERE, "..", "src", "learn", "cli.ts");

const DOCUMENT = `# Shared topic vocabulary.

topics:
  # ---------------- fixtures ----------------
  - slug: fixture-topic
    title: Fixture topic
    domain: fixtures
    summary: The one the seeded rows point at.
    aliases: [fixtures]
    maps:
      manimkc: []
      courses: [xx1000-m1]
      concepts: [alpha, beta, gamma]

  - slug: empty-topic
    title: A topic with nothing under it
    domain: fixtures
    aliases: []
    maps:
      manimkc: []
      courses: []
      concepts: []

  - slug: block-topic
    title: A topic whose concepts are a block list
    domain: fixtures
    maps:
      manimkc: []
      courses: []
      concepts:
        - delta

  - slug: keyless-topic
    title: A topic whose maps has no concepts key
    domain: fixtures
    maps:
      manimkc: []
      courses: []

  - slug: commented-topic
    title: A topic whose concepts key is empty and annotated
    domain: fixtures
    maps:
      manimkc: []
      courses: []
      concepts:   # concept note ids
`;

/** A course file in the block form the real files use, plus the other shapes. */
const COURSE_DOC = `id: xx1000
slug: xx1000
code: XX1000
title: Fixture course
credits: 4
order: 1
inferred: false
tags: [fixtures]
capstone: none
modules:
  - id: xx1000-m1
    slug: m1-first
    title: First
    order: 1
    topic: fixture-topic
    topics:
      - id: xx1000-m1-t1
        title: Block row
        concepts:
          - alpha
        subtopics: [one]
      - id: xx1000-m1-t2
        title: Flow row
        concepts: [beta]   # inline
      - id: xx1000-m1-t3
        title: Bare row
        subtopics: [two]
      - id: xx1000-m1-t4
        title: Empty key row
        concepts:
      - id: xx1000-m1-t5
        title: Spread row
        concepts: [
          gamma,
          delta
        ]  # over lines
      - id: xx1000-m1-t6
        title: Commented spread row
        concepts: [
          gamma,   # first
          delta,   # last, with a trailing comma
        ]
      - id: xx1000-m1-t7
        title: Closing shares a line
        concepts: [gamma,
          delta,]
    resources: []
`;

describe("addConceptToItem", () => {
  it("appends to a block list at the item's own indent", () => {
    const after = addConceptToItem(COURSE_DOC, "xx1000-m1-t1", "cogs");
    expect(after).toContain("          - alpha\n          - cogs\n        subtopics: [one]");
  });

  it("appends to a flow list and keeps its comment", () => {
    const after = addConceptToItem(COURSE_DOC, "xx1000-m1-t2", "cogs");
    expect(after).toContain("        concepts: [beta, cogs]  # inline");
  });

  it("adds the key after title: when the row has none", () => {
    const after = addConceptToItem(COURSE_DOC, "xx1000-m1-t3", "cogs");
    expect(after).toContain("        title: Bare row\n        concepts: [cogs]\n        subtopics: [two]");
  });

  it("fills an empty key rather than leaving it to be refused", () => {
    const after = addConceptToItem(COURSE_DOC, "xx1000-m1-t4", "cogs");
    expect(after).toContain("        title: Empty key row\n        concepts: [cogs]\n      - id: xx1000-m1-t5");
  });

  it("appends to a flow list spread over lines, on its closing line", () => {
    const after = addConceptToItem(COURSE_DOC, "xx1000-m1-t5", "cogs");
    expect(after).toContain("          gamma,\n          delta, cogs\n        ]  # over lines");
    expect(addConceptToItem(COURSE_DOC, "xx1000-m1-t5", "delta")).toBe(COURSE_DOC);
  });

  it("puts the new id ahead of a last item's comment, and after its trailing comma", () => {
    const after = addConceptToItem(COURSE_DOC, "xx1000-m1-t6", "cogs");
    expect(after).toContain("          delta, cogs   # last, with a trailing comma\n        ]");
  });

  it("adds one separator when the closing line carries an item and a trailing comma", () => {
    const after = addConceptToItem(COURSE_DOC, "xx1000-m1-t7", "cogs");
    expect(after).toContain("        concepts: [gamma,\n          delta, cogs]");
  });

  it("is idempotent, and touches no other row", () => {
    expect(addConceptToItem(COURSE_DOC, "xx1000-m1-t1", "alpha")).toBe(COURSE_DOC);
    expect(addConceptToItem(COURSE_DOC, "xx1000-m1-t2", "beta")).toBe(COURSE_DOC);
    const once = addConceptToItem(COURSE_DOC, "xx1000-m1-t1", "cogs");
    expect(addConceptToItem(once, "xx1000-m1-t1", "cogs")).toBe(once);
    expect(once.split("\n").length).toBe(COURSE_DOC.split("\n").length + 1);
  });

  it("refuses a row that is not in the file", () => {
    expect(() => addConceptToItem(COURSE_DOC, "xx1000-m9-t1", "cogs")).toThrow(CourseEditError);
  });
});

const reachable = await probe();

describe.skipIf(!reachable.ok)("learn concept add --topic", () => {
  let scratch: Scratch;
  let root: string;

  async function learn(...args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(process.execPath, ["--import", "tsx", ENTRY, ...args], {
      env: { ...process.env, LEARN_ROOT: root, DATABASE_URL: scratch.url },
    });
  }

  async function topics(): Promise<string> {
    return readFile(path.join(root, "content", "topics.yaml"), "utf8");
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);

    root = await mkdtemp(path.join(tmpdir(), "concept-topic-"));
    await mkdir(path.join(root, "content"), { recursive: true });
    await mkdir(path.join(root, "learn", "concepts", "fixtures"), { recursive: true });
    await writeFile(path.join(root, "content", "topics.yaml"), DOCUMENT, "utf8");
    const notes: Record<string, string> = {
      alpha: "---\nid: alpha\ntitle: Alpha\n---\n\n# Alpha\n",
      beta: "---\nid: beta\ntitle: Beta\nrequires: [alpha]\n---\n\n# Beta\n",
      gamma: "---\nid: gamma\ntitle: Gamma\nrequires: [beta]\n---\n\n# Gamma\n",
      delta: "---\nid: delta\ntitle: Delta\n---\n\n# Delta\n",
    };
    for (const [slug, body] of Object.entries(notes)) {
      await writeFile(path.join(root, "learn", "concepts", "fixtures", `${slug}.md`), body, "utf8");
    }
    // `learn index` runs the courses source behind concepts, since a course
    // row's `concepts:` list points at concept rows, so the tree needs one
    // course for that run to read. The smallest one that resolves.
    await mkdir(path.join(root, "content", "courses"), { recursive: true });
    await writeFile(
      path.join(root, "content", "tags.yaml"),
      "tags:\n  - id: fixtures\n    label: Fixtures\n    description: the fixture theme\n",
      "utf8",
    );
    await writeFile(
      path.join(root, "content", "courses", "xx1000.yaml"),
      [
        "id: xx1000",
        "slug: xx1000",
        "code: XX1000",
        "title: Fixture course",
        "credits: 4",
        "order: 1",
        "inferred: false",
        "tags: [fixtures]",
        "capstone: none",
        "modules:",
        "  - id: xx1000-m1",
        "    slug: m1-first",
        "    title: First",
        "    order: 1",
        "    topic: fixture-topic",
        "    topics:",
        "      - id: xx1000-m1-t1",
        "        title: An item",
        "        concepts: [alpha]",
        "      - id: xx1000-m1-t2",
        "        title: Another item",
        "    resources: []",
        "",
      ].join("\n"),
      "utf8",
    );
    // The tree imported, as `catalog index` would: the topic is a row and the
    // flag writes through the catalog, which rewrites the vocabulary file from
    // the rows, so it refuses a file the database has never seen. manimkc is
    // pointed at nothing, and has never been indexed here, so it is skipped.
    await runIndex(scratch.db, { repoRoot: root, manimkcRoot: path.join(root, "no-manimkc") });
    // The file in the house style the rows export, as `catalog export` leaves it.
    const [vocabulary] = await renderType(scratch.db, "topics");
    if (vocabulary !== undefined) {
      await writeFile(path.join(root, vocabulary.path), vocabulary.bytes);
    }
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  });

  it("adds the slug under the named entry, and nowhere else", async () => {
    const before = await topics();
    const { stdout } = await learn(
      "concept", "add", "--title", "Widgets", "--domain", "fixtures",
      "--topic", "empty-topic", "--json",
    );

    expect(JSON.parse(stdout)).toEqual({
      id: "widgets",
      path: "learn/concepts/fixtures/widgets.md",
      topic: "empty-topic",
      item: null,
      indexed: true,
    });

    const after = await topics();
    expect(after).toContain("      concepts: [widgets]");
    // Once, in one entry. A second occurrence would mean the edit found the
    // wrong `concepts:` key, which is the failure this flag exists to remove.
    expect(after.match(/widgets/g)).toHaveLength(1);
    expect(after.replace("      concepts: [widgets]", "      concepts: []")).toBe(before);

    // Indexed means queryable: `observe` refuses a concept the catalog has
    // never seen, and that refusal is the next thing a session would hit.
    const { rows } = await scratch.db.execute<{ slug: string; topic_slug: string }>(
      "select slug, topic_slug from concept where slug = 'widgets'",
    );
    expect(rows).toEqual([{ slug: "widgets", topic_slug: "empty-topic" }]);
  });

  it("writes the note's prerequisites with the concept, so the index after it adds no revision", async () => {
    const { stdout } = await learn(
      "concept", "add", "--title", "Gears", "--domain", "fixtures",
      "--topic", "fixture-topic", "--requires", "alpha,beta", "--assumes", "gamma", "--json",
    );
    expect(JSON.parse(stdout)).toMatchObject({ id: "gears", topic: "fixture-topic", indexed: true });
    const { rows } = await scratch.db.execute<{ op: string; author: string }>(
      "select op, author from content_revision where entity_type = 'concept' and entity_id = 'gears' order by seq",
    );
    expect(rows).toEqual([{ op: "create", author: "local" }]);
    const links = await scratch.db.execute(
      "select prerequisite_slug, kind, position from concept_prerequisite where concept_slug = 'gears' order by kind, position",
    );
    expect(links.rows).toEqual([
      { prerequisite_slug: "gamma", kind: "assumes", position: 1 },
      { prerequisite_slug: "alpha", kind: "requires", position: 1 },
      { prerequisite_slug: "beta", kind: "requires", position: 2 },
    ]);
  });

  it("refuses an unknown slug before writing anything", async () => {
    const before = await topics();
    const failure = await learn(
      "concept", "add", "--title", "Gadgets", "--domain", "fixtures", "--topic", "no-such-topic",
    ).then(
      () => null,
      (error: { stderr: string; code: number }) => error,
    );

    expect(failure?.code).toBe(1);
    expect(failure?.stderr).toContain('no topic "no-such-topic"');
    expect(failure?.stderr).toContain("catalog -- search");
    expect(await topics()).toBe(before);
    await expect(
      readFile(path.join(root, "learn", "concepts", "fixtures", "gadgets.md"), "utf8"),
    ).rejects.toThrow(/ENOENT/);
  });

  it("refuses a vocabulary file edited since the import, before writing anything", async () => {
    const file = path.join(root, "content", "topics.yaml");
    const before = await topics();
    await writeFile(file, before.replace("title: Fixture topic", "title: Edited by hand"), "utf8");
    try {
      const failure = await learn(
        "concept", "add", "--title", "Gizmos", "--domain", "fixtures", "--topic", "empty-topic",
      ).then(
        () => null,
        (error: { stderr: string; code: number }) => error,
      );
      expect(failure?.code).toBe(1);
      expect(failure?.stderr).toContain("is not what the database holds");
      await expect(
        readFile(path.join(root, "learn", "concepts", "fixtures", "gizmos.md"), "utf8"),
      ).rejects.toThrow(/ENOENT/);
    } finally {
      await writeFile(file, before, "utf8");
    }
  });

  it("refuses a concept another topic already claims", async () => {
    const before = await topics();
    const failure = await learn(
      "concept", "add", "--title", "Delta", "--domain", "fixtures",
      "--topic", "empty-topic", "--force",
    ).then(
      () => null,
      (error: { stderr: string }) => error,
    );

    expect(failure?.stderr).toContain('already mapped to topic "block-topic"');
    expect(await topics()).toBe(before);
  });

  it("with --item, lists the note on the row and takes the topic from its module", async () => {
    const courseFile = path.join(root, "content", "courses", "xx1000.yaml");
    const before = await readFile(courseFile, "utf8");
    const { stdout } = await learn(
      "concept", "add", "--title", "Cogs", "--domain", "fixtures",
      "--item", "xx1000-m1-t2", "--json",
    );

    expect(JSON.parse(stdout)).toEqual({
      id: "cogs",
      path: "learn/concepts/fixtures/cogs.md",
      topic: "fixture-topic",
      item: "xx1000-m1-t2",
      indexed: true,
    });

    const after = await readFile(courseFile, "utf8");
    expect(after).toContain("        title: Another item\n        concepts: [cogs]\n");
    expect(after.replace("        concepts: [cogs]\n", "")).toBe(before);
    expect(await topics()).toContain("cogs");

    // Indexed, with the link the course run writes from the row.
    const { rows } = await scratch.db.execute<{ curriculum_item_id: string; position: number }>(
      "select curriculum_item_id, position from concept_curriculum_item where concept_slug = 'cogs'",
    );
    expect(rows).toEqual([{ curriculum_item_id: "xx1000-m1-t2", position: 1 }]);
  });

  it("finishes on a --force re-run without repeating any edit or losing one", async () => {
    // The way out of a listing that failed after the mapping landed: the same
    // command again completes the job, and a field the re-run's flags do not
    // name keeps what the note has by then.
    const courseFile = path.join(root, "content", "courses", "xx1000.yaml");
    const noteFile = path.join(root, "learn", "concepts", "fixtures", "cogs.md");
    const before = await readFile(courseFile, "utf8");
    const vocabulary = await topics();
    await learn("concept", "edit", "cogs", "--summary", "Edited by hand", "--requires", "alpha");

    const { stdout } = await learn(
      "concept", "add", "--title", "Cogs", "--domain", "fixtures",
      "--item", "xx1000-m1-t2", "--force", "--json",
    );
    expect(JSON.parse(stdout)).toMatchObject({ id: "cogs", item: "xx1000-m1-t2", indexed: true });
    expect(await readFile(courseFile, "utf8")).toBe(before);
    expect(await topics()).toBe(vocabulary);
    const note = await readFile(noteFile, "utf8");
    expect(note).toContain("summary: Edited by hand");
    expect(note).toContain("requires: [alpha]");
  });

  it("refuses --item with a --topic that is not the row's module topic, before writing", async () => {
    const failure = await learn(
      "concept", "add", "--title", "Sprockets", "--domain", "fixtures",
      "--item", "xx1000-m1-t2", "--topic", "empty-topic",
    ).then(
      () => null,
      (error: { stderr: string; code: number }) => error,
    );
    expect(failure?.code).toBe(1);
    expect(failure?.stderr).toContain('whose topic is "fixture-topic", not "empty-topic"');
    await expect(
      readFile(path.join(root, "learn", "concepts", "fixtures", "sprockets.md"), "utf8"),
    ).rejects.toThrow(/ENOENT/);
  });

  it("refuses an unknown item before writing anything", async () => {
    const failure = await learn(
      "concept", "add", "--title", "Flanges", "--domain", "fixtures", "--item", "xx9999-m1-t1",
    ).then(
      () => null,
      (error: { stderr: string; code: number }) => error,
    );
    expect(failure?.code).toBe(1);
    expect(failure?.stderr).toContain('no curriculum item "xx9999-m1-t1"');
    await expect(
      readFile(path.join(root, "learn", "concepts", "fixtures", "flanges.md"), "utf8"),
    ).rejects.toThrow(/ENOENT/);
  });

  it("makes a second writer wait for the first, so neither drops the other's mapping", async () => {
    // Two writers, two topics, one vocabulary file. The first holds the
    // export lock with its row written and its commit pending; the second,
    // on its own connection, must wait rather than render the file without
    // the first's row and write over it.
    const by = { author: "local", authorKind: "person" as const, reason: "race" };
    const file = (slug: string) => ({ title: slug, summary: null, path: `learn/concepts/fixtures/${slug}.md` });
    for (const slug of ["racer-one", "racer-two"]) {
      await writeFile(path.join(root, "learn", "concepts", "fixtures", `${slug}.md`), `---\nid: ${slug}\ntitle: ${slug}\n---\n`, "utf8");
    }
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let entered = () => {};
    const holding = new Promise<void>((resolve) => (entered = resolve));

    const other = connect({ url: scratch.url });
    try {
      const first = writeThrough(scratch.db, ["topics"], async (tx) => {
        await fileConceptUnderTopic(tx, { concept: "racer-one", topic: "fixture-topic", row: file("racer-one") }, by);
        entered();
        await gate;
      });
      await holding;
      let settled = false;
      const second = fileConceptUnderTopic(other.db, { concept: "racer-two", topic: "block-topic", row: file("racer-two") }, by).finally(
        () => (settled = true),
      );
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(settled).toBe(false);
      release();
      await first;
      expect((await second).changed).toBe(true);
    } finally {
      release();
      await other.close();
    }

    const after = await topics();
    expect(after).toContain("racer-one");
    expect(after).toContain("racer-two");
    const [rendered] = await renderType(scratch.db, "topics");
    expect(after).toBe(rendered?.bytes.toString("utf8"));
    const { rows } = await scratch.db.execute<{ slug: string; topic_slug: string }>(
      "select slug, topic_slug from concept where slug like 'racer-%' order by slug",
    );
    expect(rows).toEqual([
      { slug: "racer-one", topic_slug: "fixture-topic" },
      { slug: "racer-two", topic_slug: "block-topic" },
    ]);
  });

  it("without --topic, names the flag and the exact edit", async () => {
    const { stdout } = await learn(
      "concept", "add", "--title", "Sprockets", "--domain", "fixtures",
    );
    expect(stdout).toContain("--topic <slug>");
    expect(stdout).toContain("maps.concepts");
    expect(stdout).toContain("content/topics.yaml");
    expect(stdout).toContain("catalog -- search");
    expect(await topics()).not.toContain("sprockets");

    const { stdout: asJson } = await learn(
      "concept", "add", "--title", "Sprockets", "--domain", "fixtures", "--force", "--json",
    );
    expect(JSON.parse(asJson)).toEqual({
      id: "sprockets",
      path: "learn/concepts/fixtures/sprockets.md",
      topic: null,
      item: null,
      indexed: false,
    });
    await rm(path.join(root, "learn", "concepts", "fixtures", "sprockets.md"), { force: true });
  });
});
