import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../src/migrations";
import { addConceptToItem, CourseEditError } from "../src/learn/course-edit";
import {
  addConceptToTopic,
  mapConceptToTopic,
  VocabularyEditError,
} from "../src/learn/vocabulary-edit";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * `learn concept add --topic <slug>`: the one workflow gap that made a tutoring
 * session hand-edit `content/topics.yaml`.
 *
 * Two halves, tested apart. The text edit is pure and gets a scratch document
 * with every list shape the file could be in; the command gets a scratch
 * database and a temporary knowledge base, and is checked on what a session
 * actually depends on — the slug lands under the right entry and nowhere else,
 * a wrong slug costs nothing, and the `--json` shape says whether the note is
 * queryable yet.
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

describe("addConceptToTopic", () => {
  /** Lines that changed, so "and nowhere else" is checked rather than assumed. */
  function diff(before: string, after: string): { added: string[]; removed: string[] } {
    const a = before.split("\n");
    const b = after.split("\n");
    return { added: b.filter((l) => !a.includes(l)), removed: a.filter((l) => !b.includes(l)) };
  }

  it("appends to a flow list and touches nothing else", () => {
    const after = addConceptToTopic(DOCUMENT, "fixture-topic", "widgets");
    expect(after).toContain("      concepts: [alpha, beta, gamma, widgets]");
    expect(diff(DOCUMENT, after)).toEqual({
      added: ["      concepts: [alpha, beta, gamma, widgets]"],
      removed: ["      concepts: [alpha, beta, gamma]"],
    });
    // Every other entry is byte-identical.
    expect(after.split("\n").length).toBe(DOCUMENT.split("\n").length);
    expect(after).toContain("  - slug: empty-topic");
  });

  it("fills an empty flow list without a stray space", () => {
    const after = addConceptToTopic(DOCUMENT, "empty-topic", "widgets");
    expect(after).toContain("      concepts: [widgets]");
    expect(after).toContain("      concepts: [alpha, beta, gamma]");
  });

  it("appends an item to a block list at the item's own indent", () => {
    const after = addConceptToTopic(DOCUMENT, "block-topic", "widgets");
    expect(after).toContain("        - delta\n        - widgets");
  });

  it("adds the concepts key when maps has none", () => {
    const after = addConceptToTopic(DOCUMENT, "keyless-topic", "widgets");
    expect(after).toContain("      courses: []\n      concepts: [widgets]");
  });

  it("is idempotent on a flow list", () => {
    const once = addConceptToTopic(DOCUMENT, "fixture-topic", "widgets");
    expect(addConceptToTopic(once, "fixture-topic", "widgets")).toBe(once);
    // And on a slug that was already there before anyone touched it.
    expect(addConceptToTopic(DOCUMENT, "fixture-topic", "beta")).toBe(DOCUMENT);
  });

  it("is idempotent on a block list", () => {
    expect(addConceptToTopic(DOCUMENT, "block-topic", "delta")).toBe(DOCUMENT);
    const once = addConceptToTopic(DOCUMENT, "block-topic", "widgets");
    expect(addConceptToTopic(once, "block-topic", "widgets")).toBe(once);
  });

  it("keeps the inline comment on an empty key", () => {
    const after = addConceptToTopic(DOCUMENT, "commented-topic", "widgets");
    expect(after).toContain("      concepts: [widgets]  # concept note ids");
  });

  it("refuses a slug that is not in the file", () => {
    expect(() => addConceptToTopic(DOCUMENT, "no-such-topic", "widgets")).toThrow(
      VocabularyEditError,
    );
  });

  it("keeps CRLF line endings", () => {
    const crlf = DOCUMENT.replace(/\n/g, "\r\n");
    const after = addConceptToTopic(crlf, "fixture-topic", "widgets");
    expect(after).toContain("\r\n");
    expect(after).not.toMatch(/[^\r]\n/);
  });
});

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
    // The topic rows the concepts index resolves against. Written directly
    // rather than through the topics indexer: this suite is about one flag, and
    // a full index run would drag in the manimkc submodule.
    await scratch.db.execute(
      "insert into topic (slug, title, domain) values " +
        "('fixture-topic', 'Fixture topic', 'fixtures'), " +
        "('empty-topic', 'Empty topic', 'fixtures'), " +
        "('block-topic', 'Block topic', 'fixtures'), " +
        "('keyless-topic', 'Keyless topic', 'fixtures') on conflict do nothing",
    );
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

  it("finishes on a --force re-run without repeating any edit", async () => {
    // The way out of a listing that failed after the mapping landed: every
    // step is idempotent, so the same command again completes the job.
    const courseFile = path.join(root, "content", "courses", "xx1000.yaml");
    const before = await readFile(courseFile, "utf8");
    const vocabulary = await topics();
    const { stdout } = await learn(
      "concept", "add", "--title", "Cogs", "--domain", "fixtures",
      "--item", "xx1000-m1-t2", "--force", "--json",
    );
    expect(JSON.parse(stdout)).toMatchObject({ id: "cogs", item: "xx1000-m1-t2", indexed: true });
    expect(await readFile(courseFile, "utf8")).toBe(before);
    expect(await topics()).toBe(vocabulary);
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

  it("keeps both mappings when two edits race", async () => {
    // Two read-modify-writes over one file. Without the lock the second read
    // sees the first's original and its write drops that mapping, and both
    // calls still report success because each only verifies its own slug.
    await writeFile(path.join(root, "learn", "concepts", "fixtures", "racer-one.md"),
      "---\nid: racer-one\ntitle: Racer one\n---\n", "utf8");
    await writeFile(path.join(root, "learn", "concepts", "fixtures", "racer-two.md"),
      "---\nid: racer-two\ntitle: Racer two\n---\n", "utf8");

    await Promise.all([
      mapConceptToTopic(root, "fixture-topic", "racer-one"),
      mapConceptToTopic(root, "block-topic", "racer-two"),
    ]);

    const after = await topics();
    expect(after).toContain("racer-one");
    expect(after).toContain("racer-two");
    // No lock or temp file left behind.
    await expect(
      readFile(path.join(root, "content", "topics.yaml.lock"), "utf8"),
    ).rejects.toThrow(/ENOENT/);

    for (const slug of ["racer-one", "racer-two"]) {
      await rm(path.join(root, "learn", "concepts", "fixtures", `${slug}.md`), { force: true });
    }
  });

  it("without --topic, names the flag and the exact edit", async () => {
    const { stdout } = await learn(
      "concept", "add", "--title", "Sprockets", "--domain", "fixtures",
    );
    expect(stdout).toContain("--topic <slug>");
    expect(stdout).toContain("maps.concepts");
    expect(stdout).toContain("content/topics.yaml");
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
