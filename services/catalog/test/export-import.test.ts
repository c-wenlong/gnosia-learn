import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { TOPIC_RELATION_KINDS as READER_KINDS } from "@self-learn/content";
import { contentRevision, tag, TOPIC_RELATION_KINDS } from "@self-learn/schema";
import { parse, stringify } from "yaml";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { doctor, formatDoctor } from "../src/commands/doctor";
import { runExport } from "../src/commands/export";
import { formatFlip, runFlip } from "../src/commands/flip";
import { runImportCommand } from "../src/commands/index-command";
import { runParity } from "../src/commands/parity";
import { runRenumber } from "../src/commands/renumber";
import { compare } from "../src/content/parity";
import { contentOwnership } from "../src/content/ownership";
import { COMPLETENESS_RULES, setTriggers, triggerStates } from "../src/content/rules";
import { blockScalar, flowList } from "../src/content/yaml-out";
import { makeFixture, note, tagsYaml, type Fixture } from "./fixture-tree";
import { SEED } from "./seed";
import { migratedScratchDatabase, probe, type Scratch, sqlMessage } from "./scratch-database";

/**
 * The round trip that makes the content migration reversible
 * (docs/CONTENT-MIGRATION.md 0.5): files into a database, the database back
 * out as files, and parity between the two, entity by entity.
 *
 * Proved on the seed tree (real content, seed/README.md), read only, into
 * scratch databases, and on small fixture trees for what the seed cannot
 * show: relations, a hand-edited
 * export of a type the database owns, and `flip --strict` refused and then
 * allowed. Every file written goes under the OS temp directory.
 *
 * manimkc is pointed at a directory that does not exist, so its sources skip
 * themselves: its videos never enter the export, and a fixture vocabulary
 * would refuse the real checkout's topic folders.
 */

const reachable = await probe();

/**
 * Point the command runners, which connect through DATABASE_URL as the CLI
 * does, at a scratch database until the returned function is called. Each
 * database gets its own blob store too: a store belongs to the database that
 * first wrote it (`content/blob-owner.ts`), and this file runs several.
 */
function pointAt(name: string): () => void {
  const saved = {
    url: process.env["DATABASE_URL"],
    manimkc: process.env["MANIMKC_ROOT"],
    home: process.env["SELF_LEARN_HOME"],
  };
  process.env["DATABASE_URL"] = name;
  process.env["MANIMKC_ROOT"] = path.join(tmpdir(), "catalog-test-no-manimkc");
  process.env["SELF_LEARN_HOME"] = path.join(tmpdir(), `self-learn-home-${name}`);
  return () => {
    for (const [key, value] of [
      ["DATABASE_URL", saved.url],
      ["MANIMKC_ROOT", saved.manimkc],
      ["SELF_LEARN_HOME", saved.home],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

/** Run `fn` with the command runners pointed at `name`, and put the environment back whatever happens. */
async function against<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const restore = pointAt(name);
  try {
    return await fn();
  } finally {
    restore();
  }
}

async function tempDir(label: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `catalog-${label}-`));
}

/** The newest snapshot hash of every entity, which is the database's content in one map. */
async function latestSnapshots(scratch: Scratch): Promise<Map<string, string>> {
  const { rows } = await scratch.db.execute<{ key: string; hash: string }>(sql`
    select distinct on (entity_type, entity_id) entity_type || ' ' || entity_id as key, snapshot_hash as hash
    from ${contentRevision} order by entity_type, entity_id, seq desc
  `);
  return new Map(rows.map((row) => [row.key, row.hash]));
}

const revisionCount = (result: Awaited<ReturnType<typeof runImportCommand>>) =>
  result.sources.reduce((a, s) => a + Object.values(s.revisions).reduce((x, y) => x + y, 0), 0);

describe("the export's YAML, without a database", () => {
  const awkward = [
    "Tomasulo's algorithm",
    "AIMA — Artificial Intelligence: A Modern Approach",
    "a: b",
    "ends with a colon:",
    "has # a comment marker",
    "#starts with a hash",
    "- looks like a list",
    "[bracketed]",
    "{braced}",
    "true",
    "null",
    "~",
    "5",
    "1.0",
    "0x1f",
    " leading space",
    "trailing space ",
    "*alias",
    "&anchor",
    "!tag",
    "|literal",
    ">folded",
    '"quoted"',
    "'single'",
    "%directive",
    "@at",
    "`tick",
    "comma, inside",
    "line\nbreak",
    "120 units only",
    "This *is* the course",
  ];

  it("writes every scalar so it parses back to the same string, plain where plain is safe", () => {
    for (const value of awkward) {
      expect((parse(`k: ${blockScalar(value)}`) as { k: unknown }).k, value).toBe(value);
    }
    expect(parse(`k: ${flowList(awkward)}`)).toEqual({ k: awkward });
    expect(blockScalar("Tomasulo's algorithm")).toBe("Tomasulo's algorithm");
    expect(blockScalar("AIMA — Artificial Intelligence: A Modern Approach")).toBe(
      '"AIMA — Artificial Intelligence: A Modern Approach"',
    );
  });

  it("knows the relation kinds the database checks", () => {
    expect([...READER_KINDS]).toEqual([...TOPIC_RELATION_KINDS]);
  });
});

describe.skipIf(!reachable.ok)("export, import and parity on the seed tree", () => {
  let first: Scratch;
  let second: Scratch;
  let out: string;
  let again: string;

  beforeAll(async () => {
    first = await migratedScratchDatabase();
    second = await migratedScratchDatabase();
    out = await tempDir("export");
    again = await tempDir("export-again");
  }, 120_000);

  afterAll(async () => {
    await first?.drop();
    await second?.drop();
    for (const dir of [out, again]) if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  });

  it("imports the tree, exports it, and finds zero mismatches against both", async () => {
    await against(first.name, async () => {
      await runImportCommand({ dir: SEED });
      await runExport({ out });
    });

    for (const dir of [out, SEED]) {
      const result = await against(first.name, () => runParity({ dir }));
      const summary = result.types.map((t) => ({
        type: t.type,
        mismatches: t.mismatches.map((m) => `${m.kind} ${m.id}: ${m.detail}`),
        error: t.error,
      }));
      expect(summary.filter((t) => t.mismatches.length > 0 || t.error !== null)).toEqual([]);
      expect(result.clean).toBe(true);
      for (const type of result.types) {
        expect(type.expected, type.type).toBe(type.actual);
        expect(type.counts.expected, type.type).toEqual(type.counts.actual);
      }
      const byType = Object.fromEntries(result.types.map((t) => [t.type, t.expected]));
      // Every type has something in it, so "zero mismatches" is not "zero rows".
      for (const type of ["topics", "tags", "courses", "concepts", "sessions", "diagrams"]) {
        expect(byType[type], type).toBeGreaterThan(0);
      }
    }
  }, 240_000);

  it("keeps the vocabulary's header and one divider per domain", async () => {
    const comments = (text: string) => text.split("\n").filter((line) => line.trimStart().startsWith("#"));
    const source = await readFile(path.join(SEED, "content/topics.yaml"), "utf8");
    const exported = await readFile(path.join(out, "content/topics.yaml"), "utf8");
    const domains = new Set([...source.matchAll(/^ {4}domain: (.+)$/gm)].map((m) => m[1])).size;
    // The five header lines and one divider per domain (edge case 8): derived
    // here rather than hard-coded, so a recut seed is not a test edit.
    expect(comments(source)).toHaveLength(5 + domains);
    expect(comments(exported)).toEqual(comments(source));
    expect(comments(await readFile(path.join(out, "content/tags.yaml"), "utf8"))).toEqual(
      comments(await readFile(path.join(SEED, "content/tags.yaml"), "utf8")),
    );
  });

  it("reads the export back into a second database with the same content, entity by entity", async () => {
    await against(second.name, async () => {
      await runImportCommand({ dir: out });
      await runExport({ out: again });
      expect((await runParity({ dir: out })).clean).toBe(true);
    });

    // The two databases hold the same thing: every entity's newest snapshot
    // hash, which covers its row and its owned links, is equal on both sides.
    const a = await latestSnapshots(first);
    const b = await latestSnapshots(second);
    expect(a.size).toBeGreaterThan(30);
    expect([...b.entries()].sort()).toEqual([...a.entries()].sort());

    // And the second export is the first, byte for byte.
    const files = async (dir: string) => {
      const out: Record<string, string> = {};
      const { readTypeFiles, EXPORT_TYPES } = await import("../src/content/layout");
      for (const type of EXPORT_TYPES) {
        for (const file of await readTypeFiles(dir, type)) out[file.path] = file.bytes.toString("base64");
      }
      return out;
    };
    expect(await files(again)).toEqual(await files(out));
  }, 240_000);

  it("writes zero revisions on a second import of the same tree", async () => {
    const result = await against(first.name, () => runImportCommand({ dir: SEED }));
    expect(revisionCount(result)).toBe(0);
    expect(result.totals.deleted).toBe(0);
  }, 120_000);
});

/** A small tree in the repository's layout, two notes and one course, in the export's house style. */
async function smallTree(options: { secondItemConcepts?: string[] } = {}): Promise<Fixture> {
  const fixture = await makeFixture();
  await fixture.write(
    "content/topics.yaml",
    [
      "topics:",
      "  - slug: alpha",
      "    title: Alpha",
      "    domain: one",
      "    aliases: []",
      "    relations:",
      "      - {kind: precedes, to: gamma}",
      "      - {kind: related, to: beta}",
      "    maps:",
      "      manimkc: [one/second, one/first]",
      "      courses: [xx1000-m1]",
      "      concepts: [derived, base]",
      "  - slug: beta",
      "    title: Beta",
      "    domain: one",
      "    aliases: [b]",
      "    relations:",
      "      - {kind: broader, to: alpha}",
      "    maps:",
      "      manimkc: []",
      "      courses: []",
      "      concepts: []",
      "  - slug: gamma",
      "    title: Gamma",
      "    domain: two",
      "    aliases: []",
      "    maps:",
      "      manimkc: []",
      "      courses: []",
      "      concepts: []",
      "",
    ].join("\n"),
  );
  await fixture.write("content/tags.yaml", tagsYaml(["later", "testing"]));
  const second = options.secondItemConcepts ?? [];
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
      "tags: [testing, later]",
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
      "        subtopics:",
      "          - one",
      "      - id: xx1000-m1-t2",
      "        title: Second item",
      ...(second.length === 0 ? [] : ["        concepts:", ...second.map((c) => `          - ${c}`)]),
      "        subtopics: []",
      "    resources:",
      "      - id: xx1000-m1-r2",
      "        title: Listed first",
      "        url: https://example.invalid/b",
      "        type: paper",
      "      - id: xx1000-m1-r1",
      "        title: Listed second",
      "        url: https://example.invalid/a",
      "        type: book",
      "capstone: Build something",
      "",
    ].join("\n"),
  );
  await fixture.write("learn/concepts/testing/base.md", note({ id: "base", title: "Base" }));
  await fixture.write(
    "learn/concepts/testing/derived.md",
    note({ id: "derived", title: "Derived", requires: ["base"] }),
  );
  return fixture;
}

describe.skipIf(!reachable.ok)("the round trip on a small tree", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let out: string;
  let restore: () => void;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    fixture = await smallTree();
    out = await tempDir("small-export");
    restore = pointAt(scratch.url);
  }, 60_000);

  afterAll(async () => {
    restore?.();
    await scratch?.drop();
    await fixture?.cleanup();
    if (out !== undefined) await rm(out, { recursive: true, force: true });
  });

  it("writes every authored order back as it was written, relations included", async () => {
    await runImportCommand({ dir: fixture.root });
    const relations = await scratch.db.execute<{ from_slug: string; to_slug: string; kind: string }>(
      sql`select from_slug, to_slug, kind from topic_relation order by from_slug, position`,
    );
    expect(relations.rows).toEqual([
      { from_slug: "alpha", to_slug: "gamma", kind: "precedes" },
      { from_slug: "alpha", to_slug: "beta", kind: "related" },
      { from_slug: "beta", to_slug: "alpha", kind: "broader" },
    ]);

    await runExport({ out });
    for (const file of ["content/topics.yaml", "content/courses/xx1000.yaml", "learn/concepts/testing/base.md"]) {
      const exported = await readFile(path.join(out, file), "utf8");
      const source = await readFile(path.join(fixture.root, file), "utf8");
      // The fixture has no header or dividers, which the export adds; the
      // rest is the file as written, in its order.
      const data = (text: string) => text.split("\n").filter((l) => !l.trimStart().startsWith("#") && l !== "");
      expect(data(exported), file).toEqual(data(source));
    }
    const result = await runParity({ dir: fixture.root });
    expect(result.types.flatMap((t) => t.mismatches)).toEqual([]);
    expect(result.clean).toBe(true);
    const topics = result.types.find((t) => t.type === "topics");
    expect(topics?.counts.expected).toMatchObject({ relations: 3, "manimkc paths": 2, "concept mappings": 2, domains: 2 });
  }, 60_000);

  it("refuses a tag gone from tags.yaml that a course file still names, before writing anything", async () => {
    const file = path.join(fixture.root, "content/tags.yaml");
    const original = await readFile(file, "utf8");
    await writeFile(file, tagsYaml(["testing"]));
    try {
      await expect(runImportCommand({ dir: fixture.root })).rejects.toThrow(
        /course "XX1000" is tagged "later", which is not in content\/tags\.yaml/,
      );
      // The tags source would have pruned "later" and its links, and committed,
      // before the courses source refused. Checked first, nothing moved.
      const links = await scratch.db.execute(sql`select tag_id from collection_tag order by position`);
      expect(links.rows).toEqual([{ tag_id: "testing" }, { tag_id: "later" }]);
      const tags = await scratch.db.execute(sql`select id from tag order by position`);
      expect(tags.rows).toEqual([{ id: "later" }, { id: "testing" }]);
    } finally {
      await writeFile(file, original);
    }
  }, 60_000);

  it("names what differs, by entity and by field", async () => {
    const topics = await readFile(path.join(out, "content/topics.yaml"));
    const edited = Buffer.from(topics.toString("utf8").replace("{kind: precedes, to: gamma}", "{kind: precedes, to: beta}"));
    const course = await readFile(path.join(out, "content/courses/xx1000.yaml"));
    const result = compare(
      "topics",
      [{ path: "content/topics.yaml", bytes: topics }],
      [{ path: "content/topics.yaml", bytes: edited }],
    );
    expect(result.mismatches).toEqual([
      {
        type: "topics",
        id: "topic alpha",
        kind: "changed",
        detail: 'relations[0].to: database "gamma", directory "beta"',
      },
    ]);
    const courses = compare(
      "courses",
      [{ path: "content/courses/xx1000.yaml", bytes: course }],
      [{ path: "content/courses/xx9999.yaml", bytes: course }],
    );
    expect(courses.mismatches.map((m) => `${m.kind} ${m.id}`)).toEqual([
      "missing course content/courses/xx1000.yaml",
      "extra course content/courses/xx9999.yaml",
    ]);
  });

  it("reports a whole type the database has none of, rather than calling it clean", async () => {
    const empty = await tempDir("small-empty");
    try {
      const result = await runParity({ dir: empty, only: ["courses"] });
      expect(result.clean).toBe(false);
      expect(result.types[0]?.mismatches).toEqual([
        expect.objectContaining({ kind: "missing", id: "course content/courses/xx1000.yaml" }),
      ]);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

/** The types these tests flip, whatever readers the tracks have built by now. */
const READERS = new Set(["tags", "courses"] as const);

describe.skipIf(!reachable.ok)("flip, and importing a type the database owns", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let out: string;
  let restore: () => void;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    fixture = await smallTree();
    out = await tempDir("flip-export");
    restore = pointAt(scratch.url);
    await runImportCommand({ dir: fixture.root });
  }, 60_000);

  afterAll(async () => {
    restore?.();
    await scratch?.drop();
    await fixture?.cleanup();
    if (out !== undefined) await rm(out, { recursive: true, force: true });
  });

  it("refuses a type whose database reader is not built, since every reader would then fail", async () => {
    await expect(runFlip({ type: "tags", readers: new Set() })).rejects.toThrow(/tags has no database reader yet/);
  });

  it("refuses manimkc, which has no export and so no parity", async () => {
    await expect(runFlip({ type: "manimkc", readers: new Set(["manimkc"]) })).rejects.toThrow(/cannot be flipped yet/);
  });

  it("refuses while the files the type was imported from say something the database does not", async () => {
    const file = path.join(fixture.root, "content/tags.yaml");
    const original = await readFile(file, "utf8");
    await writeFile(file, original.replace("label: later", "label: edited after the import"));
    try {
      await expect(runFlip({ type: "tags", readers: READERS })).rejects.toThrow(
        /tags is not the same in the database as in .*changed tag later: label/s,
      );
      expect((await contentOwnership(scratch.db)).tags).toBeUndefined();
    } finally {
      await writeFile(file, original);
    }
  });

  it("flips tags when parity is clean, arms its guard, and hands readers the row", async () => {
    const result = await runFlip({ type: "tags", readers: READERS });
    expect(result).toMatchObject({ type: "tags", source: "db", already: false, guardsArmed: ["tag"] });
    expect(result.parity).toMatchObject({ clean: true, dir: fixture.root, expected: 2, actual: 2 });
    expect((await triggerStates(scratch.db, ["tag_write_guard", "topic_write_guard"])).get("tag_write_guard")).toBe(true);
    // A write that did not come through the seam is refused now.
    await expect(
      scratch.db.insert(tag).values({ id: "raw", label: "Raw", description: "not through the seam" }),
    ).rejects.toSatisfy((error) => /content write seam/.test(sqlMessage(error)));
    // The row is what `selectSource` reads for a reader; a type with no row stays on files.
    const owners = await contentOwnership(scratch.db);
    expect(owners.tags).toBe("db");
    expect(owners.topics).toBeUndefined();
  });

  it("records the tree's export hash at the flip, so the next import of that tree skips the type", async () => {
    // Before this, a flip recorded no hash and every import of the type was
    // refused ("No export of tags is recorded") until someone exported.
    const [row] = (
      await scratch.db.execute<{ export_hash: string | null }>(sql`select export_hash from content_source where type = 'tags'`)
    ).rows;
    expect(row?.export_hash).toMatch(/^[0-9a-f]{64}$/);
    const result = await runImportCommand({ dir: fixture.root });
    expect(result.skipped).toContainEqual({
      source: "tags",
      reason: expect.stringMatching(/the database owns tags .* its own last export/),
    });
    expect(revisionCount(result)).toBe(0);
  }, 60_000);

  it("refuses an import of the owned type when no export is recorded and the files are not the database's", async () => {
    const file = path.join(fixture.root, "content/tags.yaml");
    const original = await readFile(file, "utf8");
    const [saved] = (
      await scratch.db.execute<{ export_hash: string | null }>(sql`select export_hash from content_source where type = 'tags'`)
    ).rows;
    await scratch.db.execute(sql`update content_source set export_hash = null where type = 'tags'`);
    await writeFile(file, original.replace("label: later", "label: Later, edited by hand"));
    try {
      await expect(runImportCommand({ dir: fixture.root })).rejects.toThrow(
        /No export of tags is recorded, and they are not what the database would export now: content\/tags\.yaml/,
      );
    } finally {
      await writeFile(file, original);
      await scratch.db.execute(sql`update content_source set export_hash = ${saved?.export_hash ?? null} where type = 'tags'`);
    }
  });

  it("skips the owned type with a named line when its files are the database's own export", async () => {
    await runExport({ out });
    const result = await runImportCommand({ dir: out });
    expect(result.skipped).toContainEqual({
      source: "tags",
      reason: expect.stringMatching(/the database owns tags .* its own (last|current) export/),
    });
    expect(result.sources.map((s) => s.source)).not.toContain("tags");
    expect(revisionCount(result)).toBe(0);
  }, 60_000);

  it("records an export's hash only at the tree the type was imported from, so an export elsewhere breaks no index", async () => {
    // The last import read `out` (the test above), so `out` is the root now.
    // An export anywhere else used to overwrite the recorded hash with its
    // own, and every `catalog index` of the root after it failed with "Edited
    // since the last export" although nobody had touched the root.
    const hashOf = async () =>
      (await scratch.db.execute<{ export_hash: string | null }>(sql`select export_hash from content_source where type = 'tags'`))
        .rows[0]?.export_hash;
    await scratch.db.execute(sql`update content_source set export_hash = 'stale' where type = 'tags'`);
    const elsewhere = await tempDir("export-elsewhere");
    try {
      const away = await runExport({ out: elsewhere, only: ["tags"] });
      expect(away.types[0]?.recorded).toBe(false);
      expect(await hashOf()).toBe("stale");
      const home = await runExport({ out, only: ["tags"] });
      expect(home.types[0]?.recorded).toBe(true);
      expect(await hashOf()).toBe(home.types[0]?.hash);
      expect(home.types[0]?.hash).toBe(away.types[0]?.hash);
      const result = await runImportCommand({ dir: out });
      expect(result.skipped).toContainEqual({ source: "tags", reason: expect.stringMatching(/its own last export/) });
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  }, 60_000);

  it("refuses a hand-edited export of the owned type, naming the file, and writes nothing", async () => {
    const file = path.join(out, "content/tags.yaml");
    const original = await readFile(file, "utf8");
    await writeFile(file, original.replace("label: later", "label: Later, edited by hand"));
    try {
      const before = await latestSnapshots(scratch);
      await expect(runImportCommand({ dir: out })).rejects.toThrow(
        /content\/tags\.yaml: the database owns tags.*Changed since the last export: content\/tags\.yaml \(edited\)/s,
      );
      expect(await latestSnapshots(scratch)).toEqual(before);
    } finally {
      await writeFile(file, original);
    }
  }, 60_000);

  it("refuses --strict while doctor lists violators, and names them", async () => {
    await expect(runFlip({ type: "courses", strict: true, readers: READERS })).rejects.toThrow(
      /--strict would arm rules that 1 row\(s\) break.*item-has-concept: xx1000-m1-t2/s,
    );
    // Refused means nothing moved: no row, no guard, no rule armed.
    expect((await contentOwnership(scratch.db)).courses).not.toBe("db");
    const states = await triggerStates(scratch.db, ["collection_write_guard", "curriculum_item_item_has_concept"]);
    expect([...states.values()]).toEqual([false, false]);
  });

  it("allows --strict once the violators are fixed and imported, and arms the rules", async () => {
    // The last import read `out`; the fix goes there, where the tags file is
    // the database's own export.
    const course = path.join(out, "content/courses/xx1000.yaml");
    await writeFile(
      course,
      (await readFile(course, "utf8")).replace(
        "        title: Second item\n",
        "        title: Second item\n        concepts:\n          - derived\n",
      ),
    );
    await runImportCommand({ dir: out });
    const result = await runFlip({ type: "courses", strict: true, readers: READERS });
    expect(result.rulesArmed).toEqual(["module-has-item", "item-has-concept", "item-concept-in-module-topic", "course-order-respects-requires"]);
    const report = await doctor(scratch.db, "scratch");
    expect(report.rules.map((r) => [r.name, r.state, r.violators])).toEqual([
      ["module-has-item", "armed", 0],
      ["item-has-concept", "armed", 0],
      ["item-concept-in-module-topic", "armed", 0],
      ["course-order-respects-requires", "armed", 0],
    ]);
    expect(report.ok).toBe(true);
  }, 60_000);

  it("disarms a rule an earlier flip armed when a later one waives it", async () => {
    const result = await runFlip({
      type: "courses",
      strict: true,
      readers: READERS,
      waive: [{ rule: "item-has-concept", reason: "testing the escape hatch" }],
    });
    expect(result.already).toBe(true);
    const report = await doctor(scratch.db, "scratch");
    expect(report.rules.find((r) => r.name === "item-has-concept")).toMatchObject({
      state: "disarmed",
      waived: { type: "courses", reason: "testing the escape hatch" },
    });
    expect(report.rules.find((r) => r.name === "module-has-item")?.state).toBe("armed");
  });

  it("takes a waiver off the record when a later strict flip arms the rule", async () => {
    // Waive here, not in the test before, so the removal is exercised whatever
    // that test did. (The whole block is one story on `out`, which the first
    // export writes, so no test in it runs alone.) Arming the rule again must
    // clear the waiver: on the owner's database the record stayed, and doctor
    // read the rule as armed and waived at once.
    await runFlip({
      type: "courses",
      strict: true,
      readers: READERS,
      waive: [{ rule: "item-has-concept", reason: "waived, to be armed by the next flip" }],
    });
    expect((await doctor(scratch.db, "scratch")).rules.find((r) => r.name === "item-has-concept")).toMatchObject({
      state: "disarmed",
      waived: { type: "courses", reason: "waived, to be armed by the next flip" },
    });
    const result = await runFlip({ type: "courses", strict: true, readers: READERS });
    expect(result.rulesArmed).toEqual(["module-has-item", "item-has-concept", "item-concept-in-module-topic", "course-order-respects-requires"]);
    expect(result.waivers).toEqual([]);
    const report = await doctor(scratch.db, "scratch");
    expect(report.rules.find((r) => r.name === "item-has-concept")).toMatchObject({
      state: "armed",
      violators: 0,
      waived: null,
    });
  });

  it("--rearm arms an owned type's rules, a rule added after its flip included, without reading its old tree", async () => {
    // The tree the type was last imported from no longer matches the
    // database, which owns the type: a re-flip's parity would refuse, and its
    // hint ("import them") would undo the database's own edits.
    const course = path.join(out, "content/courses/xx1000.yaml");
    const original = await readFile(course, "utf8");
    await writeFile(course, original.replace("title: Second item", "title: Edited in a tree nobody imports"));
    const later = COMPLETENESS_RULES.find((r) => r.name === "course-order-respects-requires");
    await setTriggers(scratch.db, later?.triggers ?? [], false);
    try {
      await expect(runFlip({ type: "courses", strict: true, readers: READERS })).rejects.toThrow(/is not the same in the database/);
      const result = await runFlip({ type: "courses", strict: true, rearm: true, readers: READERS });
      expect(result).toMatchObject({ already: true, rearmed: true, parity: null });
      expect(result.export.recorded).toBe(false);
      expect(result.rulesArmed).toContain("course-order-respects-requires");
      const report = await doctor(scratch.db, "scratch");
      expect(report.rules.filter((r) => r.type === "courses").every((r) => r.state === "armed")).toBe(true);
      expect(formatFlip(result)).toMatch(/re-armed without reading a tree/);
    } finally {
      await writeFile(course, original);
    }
  });

  it("--rearm refuses a type the database does not own yet", async () => {
    await expect(runFlip({ type: "topics", strict: true, rearm: true, readers: new Set(["topics"]) })).rejects.toThrow(
      /--rearm is for a type the database already owns/,
    );
  });

  it("records no tree for an owned type when a later owned type refuses the import", async () => {
    // Tags and courses are both owned here, and tags is checked first. A
    // refused import used to have recorded the refused tree as tags' root
    // already, so the next write-through went to a tree nobody imported.
    const rootOf = async () =>
      (await scratch.db.execute<{ root: string | null }>(sql`select metadata->>'root' as root from index_run where source = 'tags'`))
        .rows[0]?.root;
    await runExport({ out });
    await runImportCommand({ dir: out });
    const before = await rootOf();
    const edited = await tempDir("refused-root");
    try {
      await cp(out, edited, { recursive: true });
      await rm(path.join(edited, "content/courses/xx1000.yaml"));
      await expect(runImportCommand({ dir: edited })).rejects.toThrow(
        /the database owns courses.*Changed since the last export: content\/courses\/xx1000\.yaml \(deleted\)/s,
      );
      expect(await rootOf()).toBe(before);
    } finally {
      await rm(edited, { recursive: true, force: true });
    }
  }, 60_000);
});

describe.skipIf(!reachable.ok)("a tag gone from tags.yaml while the database owns courses", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let out: string;
  let restore: () => void;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    fixture = await smallTree({ secondItemConcepts: ["derived"] });
    out = await tempDir("owned-courses");
    restore = pointAt(scratch.url);
    await runImportCommand({ dir: fixture.root });
    await runExport({ out });
    await runImportCommand({ dir: out });
    await runFlip({ type: "courses", readers: READERS });
  }, 60_000);

  afterAll(async () => {
    restore?.();
    await scratch?.drop();
    await fixture?.cleanup();
    if (out !== undefined) await rm(out, { recursive: true, force: true });
  });

  it("is refused by name, since nothing in the import would put the course's tag back", async () => {
    const file = path.join(out, "content/tags.yaml");
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replace(/\n {2}- id: later\n[^\n]*\n[^\n]*\n/, "\n"));
    expect(await readFile(file, "utf8")).not.toMatch(/id: later/);
    await expect(runImportCommand({ dir: out })).rejects.toThrow(
      /no longer lists tags that courses still wear: later \(xx1000\)/,
    );
    const links = await scratch.db.execute(sql`select tag_id from collection_tag order by position`);
    expect(links.rows).toEqual([{ tag_id: "testing" }, { tag_id: "later" }]);
  }, 60_000);
});

describe.skipIf(!reachable.ok)("flip --waive", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let restore: () => void;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    fixture = await smallTree();
    restore = pointAt(scratch.url);
    await runImportCommand({ dir: fixture.root });
  }, 60_000);

  afterAll(async () => {
    restore?.();
    await scratch?.drop();
    await fixture?.cleanup();
  });

  it("reports every rule as unsettled before a strict flip, the cut-over's distance", async () => {
    const report = await doctor(scratch.db, "scratch");
    expect(report.unsettled).toEqual(["module-has-item", "item-has-concept", "item-concept-in-module-topic", "course-order-respects-requires"]);
    expect(formatDoctor(report)).toContain(
      "neither armed nor waived: module-has-item, item-has-concept, item-concept-in-module-topic, course-order-respects-requires",
    );
  });

  it("refuses a waiver with no reason, or for another type's rule", async () => {
    await expect(
      runFlip({ type: "courses", strict: true, readers: READERS, waive: [{ rule: "item-has-concept", reason: " " }] }),
    ).rejects.toThrow(/needs a --reason/);
    await expect(
      runFlip({ type: "tags", readers: READERS, waive: [{ rule: "item-has-concept", reason: "because" }] }),
    ).rejects.toThrow(/armed by courses, not tags/);
  });

  it("leaves a waived rule disarmed, arms the rest, and puts the reason on record", async () => {
    const result = await runFlip({
      type: "courses",
      strict: true,
      readers: READERS,
      waive: [{ rule: "item-has-concept", reason: "nine courses are still being filled in" }],
    });
    expect(result.rulesArmed).toEqual(["module-has-item", "item-concept-in-module-topic", "course-order-respects-requires"]);
    const report = await doctor(scratch.db, "scratch");
    const rule = report.rules.find((r) => r.name === "item-has-concept");
    expect(rule).toMatchObject({
      state: "disarmed",
      violators: 1,
      waived: { type: "courses", reason: "nine courses are still being filled in" },
    });
    // Armed or waived: what phase 3's cut-over requires of every rule.
    expect(report.unsettled).toEqual([]);
    expect(formatDoctor(report)).toContain("every rule is armed or waived");
  });
});

/** Every revision the import wrote, as `type id op`, sorted. */
const revisionsWritten = async (scratch: Scratch, since: number) =>
  (
    await scratch.db.execute<{ line: string }>(sql`
      select entity_type || ' ' || entity_id || ' ' || op as line from ${contentRevision}
      where id > ${since} order by 1
    `)
  ).rows.map((row) => row.line);

const lastRevisionId = async (scratch: Scratch) =>
  Number(
    (await scratch.db.execute<{ id: string | null }>(sql`select max(id) as id from ${contentRevision}`)).rows[0]?.id ??
      0,
  );

describe.skipIf(!reachable.ok)("sparse positions (D22) on a copy of the seed tree", () => {
  let scratch: Scratch;
  let copy: string;
  let restore: () => void;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    copy = await tempDir("sparse-copy");
    for (const dir of ["content", "learn"]) {
      await cp(path.join(SEED, dir), path.join(copy, dir), { recursive: true });
    }
    restore = pointAt(scratch.url);
    await runImportCommand({ dir: copy });
  }, 120_000);

  afterAll(async () => {
    restore?.();
    await scratch?.drop();
    if (copy !== undefined) await rm(copy, { recursive: true, force: true });
  });

  const topicsFile = () => path.join(copy, "content/topics.yaml");

  it("stores the vocabulary in steps of 1000, in file order", async () => {
    const { rows } = await scratch.db.execute<{ slug: string; position: number }>(
      sql`select slug, position from topic order by position`,
    );
    const inFile = (parse(await readFile(topicsFile(), "utf8")) as { topics: { slug: string }[] }).topics;
    expect(rows.map((row) => row.slug)).toEqual(inFile.map((topic) => topic.slug));
    expect(rows.map((row) => row.position)).toEqual(inFile.map((_, i) => (i + 1) * 1000));
  });

  it("writes one revision, for the new topic, when a topic is added at the top", async () => {
    const text = await readFile(topicsFile(), "utf8");
    const block = [
      "  - slug: zz-added-at-the-top",
      "    title: Added at the top",
      "    domain: computer-architecture",
      "    aliases: []",
      "    maps:",
      "      manimkc: []",
      "      courses: []",
      "      concepts: []",
      "",
    ].join("\n");
    await writeFile(topicsFile(), text.replace("topics:\n", `topics:\n${block}\n`));

    // Parity sees the new entry before the import does.
    const before = await runParity({ dir: copy, only: ["topics"] });
    expect(before.types[0]?.mismatches.map((m) => `${m.kind} ${m.id}`)).toEqual([
      "changed content/topics.yaml (order)",
      "extra topic zz-added-at-the-top",
    ]);

    const since = await lastRevisionId(scratch);
    const result = await runImportCommand({ dir: copy });
    expect(revisionCount(result)).toBe(1);
    expect(await revisionsWritten(scratch, since)).toEqual(["topic zz-added-at-the-top import"]);
    const { rows } = await scratch.db.execute<{ slug: string; position: number }>(
      sql`select slug, position from topic order by position limit 2`,
    );
    expect(rows).toEqual([
      { slug: "zz-added-at-the-top", position: 0 },
      { slug: expect.any(String), position: 1000 },
    ]);
    expect((await runParity({ dir: copy })).clean).toBe(true);
  }, 120_000);

  it("writes one revision, for the moved topic, when a topic moves, and parity names the reorder first", async () => {
    const doc = parse(await readFile(topicsFile(), "utf8")) as { topics: { slug: string }[] };
    // The last topic moves up between the first two.
    const [moved] = doc.topics.splice(doc.topics.length - 1, 1);
    doc.topics.splice(1, 0, moved as { slug: string });
    await writeFile(topicsFile(), stringify(doc));

    const before = await runParity({ dir: copy, only: ["topics"] });
    expect(before.types[0]?.mismatches).toEqual([
      expect.objectContaining({ id: "content/topics.yaml (order)", kind: "changed", detail: expect.stringMatching(/^position 2:/) }),
    ]);

    const since = await lastRevisionId(scratch);
    const result = await runImportCommand({ dir: copy });
    expect(revisionCount(result)).toBe(1);
    expect(await revisionsWritten(scratch, since)).toEqual([`topic ${moved?.slug} import`]);
    expect((await runParity({ dir: copy })).clean).toBe(true);
  }, 120_000);
});

describe.skipIf(!reachable.ok)("sparse positions (D22) inside a module, and renumbering", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let restore: () => void;
  const course = () => path.join(fixture.root, "content/courses/xx1000.yaml");

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    fixture = await smallTree();
    restore = pointAt(scratch.url);
    await runImportCommand({ dir: fixture.root });
  }, 60_000);

  afterAll(async () => {
    restore?.();
    await scratch?.drop();
    await fixture?.cleanup();
  });

  const items = async () =>
    (
      await scratch.db.execute<{ id: string; position: number }>(
        sql`select id, position from curriculum_item where archived_at is null order by position`,
      )
    ).rows;

  const addItem = async (id: string, before: string) => {
    const text = await readFile(course(), "utf8");
    const at = text.indexOf(`      - id: ${before}\n`);
    expect(at).toBeGreaterThan(0);
    await writeFile(
      course(),
      `${text.slice(0, at)}      - id: ${id}\n        title: ${id}\n        subtopics: []\n${text.slice(at)}`,
    );
  };

  it("writes one revision, for the new item, when an item is added at the top of a module", async () => {
    expect(await items()).toEqual([
      { id: "xx1000-m1-t1", position: 1000 },
      { id: "xx1000-m1-t2", position: 2000 },
    ]);
    await addItem("xx1000-m1-t0", "xx1000-m1-t1");
    const since = await lastRevisionId(scratch);
    await runImportCommand({ dir: fixture.root });
    expect(await revisionsWritten(scratch, since)).toEqual(["curriculum_item xx1000-m1-t0 import"]);
    expect(await items()).toEqual([
      { id: "xx1000-m1-t0", position: 0 },
      { id: "xx1000-m1-t1", position: 1000 },
      { id: "xx1000-m1-t2", position: 2000 },
    ]);
  }, 60_000);

  it("refuses an item that has no room left between its neighbours, and names the renumber", async () => {
    // Two neighbours one apart, as ten insertions at one spot would leave them.
    await scratch.db.execute(sql`update curriculum_item set position = 1001 where id = 'xx1000-m1-t2'`);
    await addItem("xx1000-m1-t15", "xx1000-m1-t2");
    const since = await lastRevisionId(scratch);
    await expect(runImportCommand({ dir: fixture.root })).rejects.toThrow(
      /the items of module "xx1000-m1": no room for "xx1000-m1-t15" between "xx1000-m1-t1" and "xx1000-m1-t2".*renumber items --module xx1000-m1 --reason/s,
    );
    expect(await revisionsWritten(scratch, since)).toEqual([]);
  }, 60_000);

  it("renumbers the list with one revision per row it moves, after which the import goes through", async () => {
    const since = await lastRevisionId(scratch);
    const result = await runRenumber({ list: "items", module: "xx1000-m1", reason: "make room after t1" });
    expect(result.moved.map(({ id, from, to }) => ({ id, from, to }))).toEqual([
      { id: "xx1000-m1-t0", from: 0, to: 1000 },
      { id: "xx1000-m1-t1", from: 1000, to: 2000 },
      { id: "xx1000-m1-t2", from: 1001, to: 3000 },
    ]);
    expect(await revisionsWritten(scratch, since)).toEqual([
      "curriculum_item xx1000-m1-t0 update",
      "curriculum_item xx1000-m1-t1 update",
      "curriculum_item xx1000-m1-t2 update",
    ]);
    const [revision] = (
      await scratch.db.execute<{ reason: string; author_kind: string }>(
        sql`select reason, author_kind from ${contentRevision} where id > ${since} limit 1`,
      )
    ).rows;
    expect(revision).toEqual({ reason: "make room after t1", author_kind: "person" });

    const again = await lastRevisionId(scratch);
    await runImportCommand({ dir: fixture.root });
    expect(await revisionsWritten(scratch, again)).toEqual(["curriculum_item xx1000-m1-t15 import"]);
    expect((await items()).map((row) => row.id)).toEqual([
      "xx1000-m1-t0",
      "xx1000-m1-t1",
      "xx1000-m1-t15",
      "xx1000-m1-t2",
    ]);
    // A list already evenly spread has nothing to move.
    await runRenumber({ list: "tags", reason: "nothing to do" });
    const none = await runRenumber({ list: "tags", reason: "still nothing" });
    expect(none.moved).toEqual([]);
  }, 60_000);

  it("renumbers a topic's maps.courses through the module's revision, links and all", async () => {
    // A number off the steps, which the next import keeps (its place did not
    // change) and records as the module's latest revision.
    await scratch.db.execute(
      sql`update collection_item set topic_position = 7 where collection_id = 'xx1000-m1' and topic_slug is not null`,
    );
    const imported = await lastRevisionId(scratch);
    await runImportCommand({ dir: fixture.root });
    expect(await revisionsWritten(scratch, imported)).toEqual(["collection xx1000-m1 import"]);

    const since = await lastRevisionId(scratch);
    const result = await runRenumber({ list: "modules", topic: "alpha", reason: "tidy" });
    expect(result.moved.map(({ id, from, to }) => ({ id, from, to }))).toEqual([{ id: "xx1000-m1", from: 7, to: 1000 }]);
    expect(await revisionsWritten(scratch, since)).toEqual(["collection xx1000-m1 update"]);
    // The module's resource rows came through the rewrite of its links.
    const links = await scratch.db.execute<{ n: number }>(
      sql`select count(*) as n from collection_item where collection_id = 'xx1000-m1'`,
    );
    expect(links.rows[0]?.n).toBe(3);
    expect((await runParity({ dir: fixture.root })).clean).toBe(true);
  }, 60_000);
});
