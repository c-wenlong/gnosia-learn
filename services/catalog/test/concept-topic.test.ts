import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../src/migrations";
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
      courses: []
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
    // The topic rows the concepts index resolves against. Written directly
    // rather than through the topics indexer: this suite is about one flag, and
    // a full index run would drag in the course YAML and the manimkc submodule.
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
      indexed: false,
    });
    await rm(path.join(root, "learn", "concepts", "fixtures", "sprockets.md"), { force: true });
  });
});
