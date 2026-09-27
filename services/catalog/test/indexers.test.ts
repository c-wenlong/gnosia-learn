import { afterEach, describe, expect, it } from "vitest";

import { conceptsIndexer } from "../src/index/concepts";
import { selection, withDependents, withPrerequisites } from "../src/index/run";
import { coursesIndexer } from "../src/index/courses";
import { diagramsIndexer } from "../src/index/diagrams";
import { IndexError } from "../src/index/errors";
import { buildRows, type TopicsReport } from "../src/index/manimkc";
import { buildMirrorRows, type MirrorsReport } from "../src/index/mirrors";
import { sessionsIndexer } from "../src/index/sessions";
import { topicsIndexer } from "../src/index/topics";
import { loadVocabulary } from "../src/index/vocabulary";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";

/**
 * The indexers on their own: files in, rows out, no database.
 *
 * That split is the point of the `read`/`write` seam. Everything asserted here
 * is about reading content correctly, and none of it needs Postgres to be
 * running, so these run on any machine. The writer's own behaviour — upserts,
 * pruning, not destroying learner state — is `writer.test.ts`, and the two
 * together meeting the real trees is `catalog.test.ts`.
 *
 * Every source gets one test for the happy path and one for the refusal,
 * because "refuse, never skip" is the rule the whole bundle rests on and a rule
 * with no test is a preference.
 */

let fixture: Fixture;

afterEach(async () => {
  await fixture?.cleanup();
});

describe("topics", () => {
  it("reads the vocabulary into topic rows", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([
        { slug: "alpha", title: "Alpha", domain: "one", summary: "First", aliases: ["a", "first"] },
        { slug: "beta", title: "Beta", domain: "two" },
      ]),
    );

    const { rows } = await topicsIndexer.read(await fixture.context());

    expect(rows.topic).toEqual([
      { slug: "alpha", title: "Alpha", domain: "one", summary: "First", aliases: ["a", "first"], position: 1 },
      { slug: "beta", title: "Beta", domain: "two", summary: null, aliases: [], position: 2 },
    ]);
    expect(rows.topicRelation).toEqual([]);
    expect(rows.manimkcTopic).toEqual([]);
  });

  it("reads relations and maps.manimkc, keeping each list's order", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      [
        "topics:",
        "  - slug: alpha",
        "    title: Alpha",
        "    domain: one",
        "    relations:",
        "      - {kind: precedes, to: gamma}",
        "      - {kind: related, to: beta}",
        "    maps: {manimkc: [one/b, one/a], courses: [], concepts: []}",
        "  - slug: beta",
        "    title: Beta",
        "    domain: one",
        "    relations:",
        "      - {kind: broader, to: alpha}",
        "  - slug: gamma",
        "    title: Gamma",
        "    domain: one",
        "",
      ].join("\n"),
    );

    const { rows } = await topicsIndexer.read(await fixture.context());

    expect(rows.topicRelation).toEqual([
      { fromSlug: "alpha", toSlug: "gamma", kind: "precedes", position: 1 },
      { fromSlug: "alpha", toSlug: "beta", kind: "related", position: 2 },
      { fromSlug: "beta", toSlug: "alpha", kind: "broader", position: 1 },
    ]);
    expect(rows.manimkcTopic).toEqual([
      { path: "one/b", topicSlug: "alpha", position: 1 },
      { path: "one/a", topicSlug: "alpha", position: 2 },
    ]);
  });

  it("refuses a related edge written under the larger slug, where the export would not put it back", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      [
        "topics:",
        "  - slug: alpha",
        "    title: Alpha",
        "    domain: one",
        "  - slug: beta",
        "    title: Beta",
        "    domain: one",
        "    relations:",
        "      - {kind: related, to: alpha}",
        "",
      ].join("\n"),
    );
    await expect(fixture.context()).rejects.toThrow(/"related" to "alpha" belongs under "alpha"/);
  });

  it("refuses a relation to a topic that does not exist, and a kind that is not one", async () => {
    fixture = await makeFixture();
    const one = (relation: string) =>
      ["topics:", "  - slug: alpha", "    title: Alpha", "    domain: one", "    relations:", `      - ${relation}`, ""].join(
        "\n",
      );
    await fixture.write("content/topics.yaml", one("{kind: broader, to: nowhere}"));
    await expect(fixture.context()).rejects.toThrow(/relations names "nowhere", which is not a topic/);
    await fixture.write("content/topics.yaml", one("{kind: sibling, to: alpha}"));
    await expect(fixture.context()).rejects.toThrow(/kind "sibling" is not one of broader, related, precedes/);
  });

  it("refuses a slug claimed by two topics", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([
        { slug: "alpha", concepts: ["shared"] },
        { slug: "beta", concepts: ["shared"] },
      ]),
    );

    await expect(fixture.context()).rejects.toThrow(/"shared" is mapped by two topics/);
  });

  it("refuses a duplicate topic slug", async () => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha" }, { slug: "alpha" }]));
    await expect(fixture.context()).rejects.toThrow(/topic slug "alpha" appears twice/);
  });

  it("refuses a missing vocabulary file", async () => {
    fixture = await makeFixture();
    await expect(loadVocabulary(fixture.root)).rejects.toThrow(/does not exist/);
  });
});

const COURSE_YAML = `
id: xx1000
slug: xx1000
code: XX1000
title: Test Course
credits: 4
order: 1
inferred: false
tags: [testing]
capstone: Build something
modules:
  - id: xx1000-m1
    slug: m1-first
    title: First Module
    order: 1
    topic: alpha
    topics:
      - id: xx1000-m1-t1
        title: An item
        concepts: [base]
        subtopics: [one, two]
    resources:
      - id: xx1000-m1-r1
        title: A book
        url: https://example.invalid/book
        type: book
`;

describe("courses", () => {
  it("reads collections, curriculum items and link assets", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha", courses: ["xx1000-m1"], concepts: ["base"] }]),
    );
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write("content/courses/xx1000.yaml", COURSE_YAML);

    const { rows } = await coursesIndexer.read(
      await fixture.context({ knownConcepts: async () => new Set(["base"]) }),
    );

    expect(rows.collection).toHaveLength(2);
    expect(rows.collection?.[0]).toMatchObject({ id: "xx1000", kind: "course", parentId: null });
    expect(rows.collection?.[0]?.metadata).toMatchObject({
      code: "XX1000",
      credits: 4,
      inferred: false,
      tags: ["testing"],
      capstone: "Build something",
    });
    expect(rows.collection?.[1]).toMatchObject({ id: "xx1000-m1", kind: "module", parentId: "xx1000" });

    expect(rows.curriculumItem).toEqual([
      {
        id: "xx1000-m1-t1",
        collectionId: "xx1000-m1",
        position: 1,
        title: "An item",
        subtopics: ["one", "two"],
      },
    ]);
    // The module's topic reaches the item, which is how a course row finds the
    // videos and notes about the same subject.
    expect(rows.curriculumItemTopic).toEqual([
      { curriculumItemId: "xx1000-m1-t1", topicSlug: "alpha" },
    ]);
    // The module's topic row, at the module's place in the topic's
    // maps.courses, then each resource at its place in the module's list.
    expect(rows.collectionItem).toEqual([
      { collectionId: "xx1000-m1", position: 0, topicSlug: "alpha", conceptSlug: null, assetId: null, topicPosition: 1 },
      { collectionId: "xx1000-m1", position: 1, topicSlug: null, conceptSlug: null, assetId: "link:xx1000-m1-r1" },
    ]);
    expect(rows.collectionTag).toEqual([{ collectionId: "xx1000", tagId: "testing", position: 1 }]);
    // The row's `concepts:` list, with its order kept as the position.
    expect(rows.conceptCurriculumItem).toEqual([
      { conceptSlug: "base", curriculumItemId: "xx1000-m1-t1", position: 1 },
    ]);

    expect(rows.asset).toEqual([
      {
        id: "link:xx1000-m1-r1",
        kind: "link",
        path: null,
        url: "https://example.invalid/book",
        contentHash: null,
        bytes: null,
        title: "A book",
        sourceRepo: "self-learn",
        resourceType: "book",
      },
    ]);
    expect(rows.assetTopic).toEqual([{ assetId: "link:xx1000-m1-r1", topicSlug: "alpha" }]);
  });

  it("refuses a module whose topic is not in the vocabulary", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "beta", courses: ["xx1000-m1"], concepts: ["base"] }]),
    );
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write("content/courses/xx1000.yaml", COURSE_YAML);

    await expect(coursesIndexer.read(await fixture.context())).rejects.toThrow(
      /names topic "alpha", which is not in content\/topics\.yaml/,
    );
  });

  it("refuses when the course file and the vocabulary disagree", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha", concepts: ["base"] }, { slug: "beta", courses: ["xx1000-m1"] }]),
    );
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write("content/courses/xx1000.yaml", COURSE_YAML);

    await expect(coursesIndexer.read(await fixture.context())).rejects.toThrow(
      /has two different topics.*"alpha".*"beta"/s,
    );
  });

  it("keeps a row's concepts in the list's order, as 1-based positions", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha", courses: ["xx1000-m1"], concepts: ["base", "derived", "third"] }]),
    );
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write(
      "content/courses/xx1000.yaml",
      COURSE_YAML.replace("concepts: [base]", "concepts: [third, base, derived]"),
    );

    const { rows } = await coursesIndexer.read(
      await fixture.context({ knownConcepts: async () => new Set(["base", "derived", "third"]) }),
    );

    expect(rows.conceptCurriculumItem).toEqual([
      { conceptSlug: "third", curriculumItemId: "xx1000-m1-t1", position: 1 },
      { conceptSlug: "base", curriculumItemId: "xx1000-m1-t1", position: 2 },
      { conceptSlug: "derived", curriculumItemId: "xx1000-m1-t1", position: 3 },
    ]);
  });

  it("refuses a concept the course lists but no note defines", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha", courses: ["xx1000-m1"], concepts: ["base"] }]),
    );
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write("content/courses/xx1000.yaml", COURSE_YAML);

    // The default context knows no concepts at all.
    await expect(coursesIndexer.read(await fixture.context())).rejects.toThrow(
      /item "xx1000-m1-t1" lists concept "base", which is not a note in learn\/concepts/,
    );
  });

  it("refuses a vocabulary mapping for a module no course defines", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha", courses: ["xx1000-m1", "xx1000-m9"], concepts: ["base"] }]),
    );
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write("content/courses/xx1000.yaml", COURSE_YAML);

    await expect(coursesIndexer.read(await fixture.context({ knownConcepts: async () => new Set(["base"]) }))).rejects.toThrow(
      /names 1 module\(s\) that no file in content\/courses defines: xx1000-m9/,
    );
  });
});

describe("concepts", () => {
  async function conceptFixture(): Promise<Fixture> {
    const f = await makeFixture();
    await f.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha", concepts: ["base", "derived"] }]),
    );
    await f.write("learn/concepts/testing/base.md", note({ id: "base", title: "Base" }));
    await f.write(
      "learn/concepts/testing/derived.md",
      note({
        id: "derived",
        title: "Derived",
        summary: "Builds on base",
        requires: ["base"],
      }),
    );
    return f;
  }

  it("reads concepts, prerequisites and note assets", async () => {
    fixture = await conceptFixture();

    const { rows } = await conceptsIndexer.read(await fixture.context());

    expect(rows.concept).toEqual([
      {
        slug: "base",
        title: "Base",
        summary: null,
        topicSlug: "alpha",
        topicPosition: 1,
        path: "learn/concepts/testing/base.md",
      },
      {
        slug: "derived",
        title: "Derived",
        summary: "Builds on base",
        topicSlug: "alpha",
        topicPosition: 2,
        path: "learn/concepts/testing/derived.md",
      },
    ]);
    expect(rows.conceptPrerequisite).toEqual([
      { conceptSlug: "derived", prerequisiteSlug: "base", kind: "requires", position: 1 },
    ]);
    // The course link is the courses source's row now, never this one's.
    expect(rows.conceptCurriculumItem).toBeUndefined();

    // Each note is a file: kind, path, and a real hash of real bytes.
    expect(rows.asset).toHaveLength(2);
    const base = rows.asset?.find((a) => a.id === "note:learn/concepts/testing/base.md");
    expect(base).toMatchObject({ kind: "note", sourceRepo: "self-learn", url: null });
    expect(base?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(base?.bytes).toBeGreaterThan(0);
    expect(rows.assetTopic).toContainEqual({
      assetId: "note:learn/concepts/testing/base.md",
      topicSlug: "alpha",
    });
  });

  it("refuses a note with no topic in the vocabulary", async () => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["base"] }]));
    await fixture.write("learn/concepts/testing/base.md", note({ id: "base" }));
    await fixture.write("learn/concepts/testing/stray.md", note({ id: "stray" }));

    await expect(conceptsIndexer.read(await fixture.context())).rejects.toThrow(
      /concept "stray" is in no topic's maps\.concepts/,
    );
  });

  it("refuses a prerequisite that is not a concept", async () => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["base"] }]));
    await fixture.write(
      "learn/concepts/testing/base.md",
      note({ id: "base", requires: ["nonexistent"] }),
    );

    await expect(conceptsIndexer.read(await fixture.context())).rejects.toThrow(
      /requires: "nonexistent", which is not a concept/,
    );
  });

  it("refuses a note that still carries the retired `topics:` key, and says where it went", async () => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["base"] }]));
    await fixture.write(
      "learn/concepts/testing/base.md",
      note({ id: "base", topics: ["xx1000-m1-t1"] }),
    );

    await expect(conceptsIndexer.read(await fixture.context())).rejects.toThrow(
      /base\.md: has a `topics:` key.*list the concept under the row's `concepts:` in content\/courses\//s,
    );
  });

  it("refuses the retired key even when its list is empty", async () => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["base"] }]));
    await fixture.write("learn/concepts/testing/base.md", note({ id: "base", topics: [] }));

    await expect(conceptsIndexer.read(await fixture.context())).rejects.toThrow(
      /has a `topics:` key/,
    );
  });

  it("reports every unresolved reference at once, not just the first", async () => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["base"] }]));
    await fixture.write("learn/concepts/testing/base.md", note({ id: "base" }));
    await fixture.write("learn/concepts/testing/one.md", note({ id: "one" }));
    await fixture.write("learn/concepts/testing/two.md", note({ id: "two" }));

    const error = await conceptsIndexer.read(await fixture.context()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IndexError);
    expect((error as Error).message).toMatch(/2 unresolved references/);
    expect((error as Error).message).toContain("one");
    expect((error as Error).message).toContain("two");
  });
});

/** A `.tldr` carrying whatever `meta.tldrawkc` the case needs, or none. */
function tldr(meta?: Record<string, unknown>): string {
  return JSON.stringify({
    tldrawFileFormatVersion: 1,
    schema: { schemaVersion: 2, sequences: {} },
    records: [
      { id: "shape:one", typeName: "shape", type: "geo", meta: {} },
      {
        id: "document:document",
        typeName: "document",
        gridSize: 10,
        name: "",
        meta: meta === undefined ? {} : { tldrawkc: { kc: 1, ...meta } },
      },
    ],
  });
}

describe("diagrams", () => {
  it("takes the topic and concepts from the .tldr's metadata, and shares them with its svg", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha", concepts: ["dot-product"] }]),
    );
    await fixture.write("learn/assets/anything.svg", "<svg></svg>");
    await fixture.write(
      "learn/assets/anything.tldr",
      tldr({ topic: "alpha", concepts: ["dot-product"], title: "The dot product" }),
    );

    const { rows, notes } = await diagramsIndexer.read(
      await fixture.context({ knownConcepts: async () => new Set(["dot-product"]) }),
    );

    // The filename says nothing about the subject any more. It was `stem`
    // before this bundle, and a stem matching no concept was filed nowhere.
    expect(rows.asset?.map((a) => [a.id, a.kind, a.title])).toEqual([
      ["diagram:learn/assets/anything.svg", "diagram_svg", "The dot product"],
      ["diagram:learn/assets/anything.tldr", "diagram_source", "The dot product"],
    ]);
    expect(rows.assetTopic).toEqual([
      { assetId: "diagram:learn/assets/anything.svg", topicSlug: "alpha" },
      { assetId: "diagram:learn/assets/anything.tldr", topicSlug: "alpha" },
    ]);
    expect(rows.assetConcept?.map((r) => r.conceptSlug)).toEqual(["dot-product", "dot-product"]);
    expect(rows.assetDerivation).toEqual([
      {
        assetId: "diagram:learn/assets/anything.svg",
        sourceAssetId: "diagram:learn/assets/anything.tldr",
      },
    ]);
    expect(notes?.[0]).toContain("1 stamped .tldr");
  });

  it("refuses a .tldr with no topic, and names the file", async () => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha" }]));
    await fixture.write("learn/assets/unstamped.tldr", tldr());
    await fixture.write("learn/assets/no-topic.tldr", tldr({ title: "Untitled" }));

    const failure = diagramsIndexer.read(await fixture.context());
    await expect(failure).rejects.toThrow(IndexError);
    await expect(failure).rejects.toThrow(/learn\/assets\/no-topic\.tldr names no topic/);
    await expect(failure).rejects.toThrow(
      /learn\/assets\/unstamped\.tldr carries no tldrawkc metadata/,
    );
    // Both, in one run. Fixing one refusal per run is thirty edits, not one.
    await expect(failure).rejects.toThrow(/2 unresolved references/);
  });

  it("refuses a topic that is not in the vocabulary", async () => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha" }]));
    await fixture.write("learn/assets/wrong.tldr", tldr({ topic: "not-a-topic" }));
    await expect(diagramsIndexer.read(await fixture.context())).rejects.toThrow(
      /names topic "not-a-topic", which is not in/,
    );
  });

  it("refuses a concept with no note, rather than leaving it to the foreign key", async () => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha" }]));
    await fixture.write("learn/assets/x.tldr", tldr({ topic: "alpha", concepts: ["ghost"] }));
    await expect(diagramsIndexer.read(await fixture.context())).rejects.toThrow(
      /names concept "ghost", which has no note/,
    );
  });

  it("files a legacy svg with no .tldr by its filename, and warns that it guessed", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha", concepts: ["dot-product"] }]),
    );
    await fixture.write("learn/assets/dot-product.svg", "<svg></svg>");
    await fixture.write("learn/assets/scribble.svg", "<svg></svg>");

    const { rows, notes } = await diagramsIndexer.read(
      await fixture.context({ knownConcepts: async () => new Set(["dot-product"]) }),
    );

    // There is nothing to stamp: an SVG has no editable source, so refusing it
    // would refuse work that cannot be fixed.
    expect(rows.asset).toHaveLength(2);
    expect(rows.assetConcept).toEqual([
      { assetId: "diagram:learn/assets/dot-product.svg", conceptSlug: "dot-product" },
    ]);
    expect(rows.assetTopic).toEqual([
      { assetId: "diagram:learn/assets/dot-product.svg", topicSlug: "alpha" },
    ]);
    expect(rows.assetDerivation).toEqual([]);
    expect(notes?.join("\n")).toContain("WARNING learn/assets/dot-product.svg");
    expect(notes?.join("\n")).toContain("WARNING learn/assets/scribble.svg");
  });

  it("notes a concept the vocabulary files under a different topic", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha" }, { slug: "beta", concepts: ["dot-product"] }]),
    );
    await fixture.write("learn/assets/x.tldr", tldr({ topic: "alpha", concepts: ["dot-product"] }));

    const { rows, notes } = await diagramsIndexer.read(
      await fixture.context({ knownConcepts: async () => new Set(["dot-product"]) }),
    );
    expect(rows.assetTopic).toEqual([{ assetId: "diagram:learn/assets/x.tldr", topicSlug: "alpha" }]);
    expect(notes?.join("\n")).toContain('puts under "beta"');
  });

  it("is an empty result when there are no diagrams", async () => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha" }]));
    const { rows } = await diagramsIndexer.read(await fixture.context());
    expect(rows.asset).toEqual([]);
  });
});

/**
 * A ledger shaped like `manimkc mirrors --json`, trimmed to the fields the
 * indexer reads. Captured from the real command's output on 2026-09-13.
 */
const LEDGER: MirrorsReport = {
  // Absolute base the `out/…` keys below hang off. Nothing here joins onto it —
  // the file comparison already happened in manimkc — but the run records which
  // data root it describes, because the mirror rows are about files that need
  // not live under the checkout.
  outRoot: "/Users/x/.self-learn",
  destinations: {
    drive: {
      root: "/Users/x/Google Drive/My Drive",
      target: "/Users/x/Google Drive/My Drive/manimkc",
      reachable: true,
      checked: "2026-09-13T00:02:57Z",
      files: {
        "out/a/one/one.mp4": {
          bytes: 100,
          sha256: "aa",
          mtime: 1_789_000_000,
          status: "present",
          compared: "sha256",
        },
        "out/a/two/two.mp4": {
          bytes: 90,
          sha256: null,
          mtime: 1_789_000_100,
          status: "stale",
          compared: "bytes",
        },
        "out/a/three/three.mp4": {
          bytes: null,
          sha256: null,
          mtime: null,
          status: "missing",
          compared: null,
        },
        "out/a/one/one.vtt": {
          bytes: null,
          sha256: null,
          mtime: null,
          status: "unknown",
          compared: null,
        },
        "out/a/ghost/ghost.mp4": {
          bytes: 5,
          sha256: "bb",
          mtime: 1_789_000_200,
          status: "present",
          compared: "sha256",
        },
      },
    },
    seafile: {
      root: "/Users/x/Seafile/manimkc-mirror",
      target: "/Users/x/Seafile/manimkc-mirror/manimkc",
      reachable: false,
      checked: "2026-09-13T00:03:11Z",
      files: {},
    },
  },
};

/** Every path in the ledger the catalog has an asset for. `ghost` is not one. */
const MANIMKC_ASSETS = new Map([
  ["out/a/one/one.mp4", "manimkc:out/a/one/one.mp4"],
  ["out/a/two/two.mp4", "manimkc:out/a/two/two.mp4"],
  ["out/a/three/three.mp4", "manimkc:out/a/three/three.mp4"],
  ["out/a/one/one.vtt", "manimkc:out/a/one/one.vtt"],
]);

describe("mirrors", () => {
  it("turns the ledger into one row per audited file", () => {
    const { rows } = buildMirrorRows(LEDGER, MANIMKC_ASSETS);
    expect(
      rows.mirror?.map((r) => [r.assetId, r.destination, r.status, r.compared, r.bytes]),
    ).toEqual([
      ["manimkc:out/a/one/one.mp4", "drive", "present", "sha256", 100],
      ["manimkc:out/a/two/two.mp4", "drive", "stale", "bytes", 90],
      ["manimkc:out/a/three/three.mp4", "drive", "missing", "none", null],
      ["manimkc:out/a/one/one.vtt", "drive", "unknown", "none", null],
    ]);
    // The ledger's mtime is a float of epoch seconds; the column is an instant.
    expect(rows.mirror?.[0]?.mtime?.toISOString()).toBe(
      new Date(1_789_000_000 * 1000).toISOString(),
    );
    expect(rows.mirror?.[0]?.checkedAt.toISOString()).toBe("2026-09-13T00:02:57.000Z");
  });

  it("leaves an unreachable destination out of the replace scope entirely", () => {
    const result = buildMirrorRows(LEDGER, MANIMKC_ASSETS);
    // Not "seafile has nothing". Seafile was not looked at, so its rows must
    // survive, and the writer only clears the destinations named here.
    expect(result.scope?.mirrorDestinations).toEqual(["drive"]);
    expect(result.rows.mirror?.some((r) => r.destination === "seafile")).toBe(false);
    expect(result.notes?.join("\n")).toContain("seafile");
    expect(result.notes?.join("\n")).toContain("left as the last audit wrote them");
  });

  it("records what each destination was, in index_run metadata", () => {
    const { metadata } = buildMirrorRows(LEDGER, MANIMKC_ASSETS);
    expect(metadata?.["destinations"]).toEqual([
      {
        destination: "drive",
        root: "/Users/x/Google Drive/My Drive",
        reachable: true,
        checked: "2026-09-13T00:02:57Z",
        files: 4,
      },
      {
        destination: "seafile",
        root: "/Users/x/Seafile/manimkc-mirror",
        reachable: false,
        checked: null,
        files: 0,
      },
    ]);
  });

  it("records which data root the audit describes", () => {
    const { metadata } = buildMirrorRows(LEDGER, MANIMKC_ASSETS);
    expect(metadata?.["outRoot"]).toBe("/Users/x/.self-learn");
    // A ledger from a CLI predating the field records null rather than a guess.
    const older = buildMirrorRows({ destinations: LEDGER.destinations }, MANIMKC_ASSETS);
    expect(older.metadata?.["outRoot"]).toBeNull();
  });

  it("skips a ledger path with no asset, and says how many", () => {
    const { rows, notes } = buildMirrorRows(LEDGER, MANIMKC_ASSETS);
    expect(rows.mirror?.some((r) => r.assetId.includes("ghost"))).toBe(false);
    expect(notes?.join("\n")).toContain("1 ledger path(s) match no manimkc asset");
    expect(notes?.join("\n")).toContain("out/a/ghost/ghost.mp4");
    // Some matched, so this is the ordinary "no render yet" case, not the
    // two-reports-disagree-about-their-base one.
    expect(notes?.join("\n")).not.toContain("disagree about");
  });

  it("says nothing is indexed when no manimkc assets exist at all", () => {
    // A fresh database or a data root with no renders. Every ledger path is
    // unmatched, but blaming a base disagreement would send the reader after a
    // bug that is not there.
    const { rows, notes } = buildMirrorRows(LEDGER, new Map());
    expect(rows.mirror).toEqual([]);
    expect(notes?.join("\n")).toContain("No manimkc assets are indexed at all");
    expect(notes?.join("\n")).not.toContain("base disagreement");
  });

  it("names a base disagreement when assets exist and none of them match", () => {
    // The real mismatch: assets are there, and not one ledger key reaches them.
    // The only base the two sides can disagree about is manimkc's data root.
    const elsewhere = new Map([["out/somewhere/else/other.mp4", "manimkc:other"]]);
    const { rows, notes } = buildMirrorRows(LEDGER, elsewhere);
    expect(rows.mirror).toEqual([]);
    expect(notes?.join("\n")).toContain("base disagreement");
    expect(notes?.join("\n")).toContain("different data roots");
  });

  it("says so when the checkout has no destinations configured", () => {
    const { rows, notes, scope } = buildMirrorRows({ destinations: {} }, MANIMKC_ASSETS);
    expect(rows.mirror).toEqual([]);
    expect(scope?.mirrorDestinations).toEqual([]);
    expect(notes?.join("\n")).toContain("no destinations configured");
  });

  it("reads an unrecognised status or comparison as the safe answer", () => {
    // A ledger from a newer manimkc, or a hand-edited one. The column has a
    // CHECK, so a value straight through would fail the whole transaction.
    const { rows } = buildMirrorRows(
      {
        destinations: {
          drive: {
            root: "/x",
            reachable: true,
            checked: "2026-09-13T00:00:00Z",
            files: {
              "out/a/one/one.mp4": { bytes: 1, status: "partial", compared: "vibes", mtime: 1 },
            },
          },
        },
      },
      MANIMKC_ASSETS,
    );
    expect(rows.mirror?.[0]).toMatchObject({ status: "unknown", compared: "none" });
  });
});

describe("sessions", () => {
  it("links a session to the concepts its wikilinks name", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha", concepts: ["base"] }, { slug: "beta", concepts: ["other"] }]),
    );
    await fixture.write(
      "learn/sessions/2026-01-01-a-session.md",
      [
        "---",
        "title: A session",
        "goal: base",
        "---",
        "",
        "We covered [[other]] and [[base]] and also [[2026-01-02-another]].",
        "A second mention of [[other]] is still one link.",
        "",
      ].join("\n"),
    );

    const { rows, notes } = await sessionsIndexer.read(
      await fixture.context({ knownConcepts: async () => new Set(["base", "other"]) }),
    );

    expect(rows.asset).toHaveLength(1);
    expect(rows.asset?.[0]).toMatchObject({ kind: "session", title: "A session" });
    expect(rows.assetConcept?.map((r) => r.conceptSlug).sort()).toEqual(["base", "other"]);
    // Both topics, once each, reached through the concepts.
    expect(rows.assetTopic?.map((r) => r.topicSlug).sort()).toEqual(["alpha", "beta"]);
    // A wikilink to another session is not a failure, only a number.
    expect(notes?.[0]).toContain("1 wikilink(s) named no concept");
  });
});

/**
 * A captured `manimkc topics --json` shape, trimmed to what the indexer reads.
 *
 * `outRoot` is the absolute base every `out/…` string below resolves against,
 * and it defaults to the checkout in a manimkc with no `$MANIMKC_HOME` set —
 * so most cases pass the checkout and get the pre-data-root behaviour, and the
 * one case that cares passes somewhere else.
 */
function report(
  overrides: Partial<TopicsReport["topics"][number]> = {},
  outRoot?: string,
): TopicsReport {
  return {
    outRoot,
    topics: [
      {
        path: "algorithms/example",
        title: "An example",
        topic: null,
        out_dir: "out/algorithms/example",
        sections: [
          {
            section: "narrated",
            output: "example.mp4",
            deliverable: {
              path: "out/algorithms/example/example.mp4",
              exists: true,
              duration: 120,
              sidecars: {
                transcript: {
                  path: "out/algorithms/example/example.transcript.json",
                  exists: true,
                },
                chapters: { path: "out/algorithms/example/example.chapters.json", exists: true },
                vtt: { path: "out/algorithms/example/example.vtt", exists: false },
              },
            },
          },
        ],
        ...overrides,
      },
    ],
    drift: { orphans: [], unrendered: [] },
  };
}

describe("manimkc", () => {
  async function withDeliverables(): Promise<Fixture> {
    const f = await makeFixture();
    await f.write("manimkc/out/algorithms/example/example.mp4", "not really an mp4");
    await f.write("manimkc/out/algorithms/example/example.transcript.json", "[]");
    await f.write("manimkc/out/algorithms/example/example.chapters.json", "[]");
    return f;
  }

  it("turns a deliverable and its sidecars into linked assets", async () => {
    fixture = await withDeliverables();
    const root = `${fixture.root}/manimkc`;

    const { rows } = await buildRows(
      report({}, root),
      root,
      new Map([["algorithms/example", "alpha"]]),
      new Map([["alpha", {}]]),
    );

    expect(rows.asset?.map((a) => [a.id, a.kind])).toEqual([
      ["manimkc:out/algorithms/example/example.mp4", "video"],
      ["manimkc:out/algorithms/example/example.transcript.json", "transcript"],
      ["manimkc:out/algorithms/example/example.chapters.json", "chapters"],
    ]);
    // The .vtt said exists: false, so there is no captions asset.
    expect(rows.asset?.some((a) => a.kind === "captions")).toBe(false);
    expect(rows.asset?.every((a) => a.sourceRepo === "manimkc")).toBe(true);
    expect(rows.asset?.[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);

    // Every sidecar points back at the video it came from.
    expect(rows.assetDerivation).toEqual([
      {
        assetId: "manimkc:out/algorithms/example/example.transcript.json",
        sourceAssetId: "manimkc:out/algorithms/example/example.mp4",
      },
      {
        assetId: "manimkc:out/algorithms/example/example.chapters.json",
        sourceAssetId: "manimkc:out/algorithms/example/example.mp4",
      },
    ]);
    expect(rows.assetTopic).toHaveLength(3);
  });

  it("refuses a topic folder with no vocabulary mapping", async () => {
    fixture = await withDeliverables();
    await expect(
      buildRows(report(), `${fixture.root}/manimkc`, new Map(), new Map()),
    ).rejects.toThrow(/"algorithms\/example" is in no topic's maps\.manimkc/);
  });

  it("refuses when topic.yml and the vocabulary name different topics", async () => {
    fixture = await withDeliverables();
    await expect(
      buildRows(
        report({ topic: "beta" }),
        `${fixture.root}/manimkc`,
        new Map([["algorithms/example", "alpha"]]),
        new Map([
          ["alpha", {}],
          ["beta", {}],
        ]),
      ),
    ).rejects.toThrow(/declares topic "beta".*maps it to "alpha"/s);
  });

  it("accepts a topic.yml that agrees with the vocabulary", async () => {
    fixture = await withDeliverables();
    const { rows } = await buildRows(
      report({ topic: "alpha" }),
      `${fixture.root}/manimkc`,
      new Map([["algorithms/example", "alpha"]]),
      new Map([["alpha", {}]]),
    );
    expect(rows.asset).toHaveLength(3);
  });

  it("reports, without refusing, a mapping this checkout has no folder for", async () => {
    fixture = await withDeliverables();
    const { notes } = await buildRows(
      report(),
      `${fixture.root}/manimkc`,
      new Map([
        ["algorithms/example", "alpha"],
        ["networking/elsewhere", "beta"],
      ]),
      new Map([
        ["alpha", {}],
        ["beta", {}],
      ]),
    );
    expect(notes.join("\n")).toContain("networking/elsewhere");
  });

  it("resolves deliverables against the report's outRoot, not the checkout", async () => {
    // The state a manimkc with $MANIMKC_HOME set is in: source in the checkout,
    // rendered files somewhere that survives the checkout being deleted. Before
    // outRoot existed this threw ENOENT, because the join assumed the checkout.
    fixture = await makeFixture();
    const checkout = `${fixture.root}/manimkc`;
    const dataRoot = `${fixture.root}/manimkc-data`;
    await fixture.write("manimkc-data/out/algorithms/example/example.mp4", "not really an mp4");
    await fixture.write("manimkc-data/out/algorithms/example/example.transcript.json", "[]");
    await fixture.write("manimkc-data/out/algorithms/example/example.chapters.json", "[]");

    const { rows, notes } = await buildRows(
      report({}, dataRoot),
      checkout,
      new Map([["algorithms/example", "alpha"]]),
      new Map([["alpha", {}]]),
    );

    expect(rows.asset).toHaveLength(3);
    expect(rows.asset?.[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // The stored path is unchanged: it is the mirror ledger's join key and the
    // unique key on the asset row. Only the base it resolves against moved.
    expect(rows.asset?.[0]?.path).toBe("out/algorithms/example/example.mp4");
    expect(rows.asset?.[0]?.id).toBe("manimkc:out/algorithms/example/example.mp4");
    expect(notes.join("\n")).toContain(`rendered output read from ${dataRoot}`);
  });

  it("falls back to the checkout when a report carries no outRoot", async () => {
    // Defensive parsing, and also the honest answer: with no data root
    // configured manimkc reports its checkout, so the two are the same path.
    fixture = await withDeliverables();
    const { rows, notes } = await buildRows(
      report(),
      `${fixture.root}/manimkc`,
      new Map([["algorithms/example", "alpha"]]),
      new Map([["alpha", {}]]),
    );
    expect(rows.asset).toHaveLength(3);
    expect(notes.join("\n")).not.toContain("rendered output read from");
  });

  it("passes manimkc's own orphan drift through as a note", async () => {
    fixture = await withDeliverables();
    const withOrphan = report();
    withOrphan.drift.orphans = [{ path: "out/networking/gone", videos: ["gone.mp4"] }];
    const { notes } = await buildRows(
      withOrphan,
      `${fixture.root}/manimkc`,
      new Map([["algorithms/example", "alpha"]]),
      new Map([["alpha", {}]]),
    );
    expect(notes.join("\n")).toContain("ORPHAN out/networking/gone");
  });
});

describe("source selection", () => {
  /**
   * Pruning cascades, so running a source without the sources that point at
   * what it owns leaves rows silently unlinked. These assert the expansion
   * rather than the graph, because the graph is the thing likely to be edited.
   */
  it("pulls in everything downstream of the vocabulary", () => {
    expect([...withDependents(["topics"])].sort()).toEqual([
      "concepts",
      "courses",
      "diagrams",
      "manimkc",
      "mirrors",
      "sessions",
      "topics",
    ]);
  });

  it("pulls courses, and what else points at concepts, in behind concepts", () => {
    // A course row's `concepts:` list is a row pointing at a concept, so a
    // concept prune cascades into it and the courses source has to rewrite it.
    expect([...withDependents(["concepts"])].sort()).toEqual([
      "concepts",
      "courses",
      "diagrams",
      "sessions",
    ]);
  });

  it("leaves courses alone: nothing another source owns points at a course row", () => {
    expect([...withDependents(["courses"])]).toEqual(["courses"]);
  });

  it("pulls mirrors in behind manimkc, whose assets its rows hang off", () => {
    // A mirror row cascades away with the asset it points at, so re-reading
    // manimkc alone after a rename would silently empty the ledger for it.
    expect([...withDependents(["manimkc"])]).toEqual(["manimkc", "mirrors"]);
  });

  it("leaves the cheap cases cheap: nothing points at what these own", () => {
    expect([...withDependents(["diagrams"])]).toEqual(["diagrams"]);
    expect([...withDependents(["sessions"])]).toEqual(["sessions"]);
    expect([...withDependents(["mirrors"])]).toEqual(["mirrors"]);
  });

  it("pulls manimkc in ahead of mirrors, because mirrors joins on what it stored", () => {
    // Upstream, not downstream. `--only mirrors` against a different
    // $MANIMKC_HOME than the last manimkc run would match every path by string
    // and attach the audit to assets hashed somewhere else, in silence.
    expect([...withPrerequisites(["mirrors"])].sort()).toEqual(["manimkc", "mirrors"]);
    expect([...withPrerequisites(["manimkc"])]).toEqual(["manimkc"]);
    expect([...withPrerequisites(["topics"])]).toEqual(["topics"]);
  });

  it("pulls concepts in ahead of courses, because a course row's concepts resolve against them", () => {
    // `--only courses` after a note was added and listed on a row would
    // otherwise check the list against concept rows the note is not in yet,
    // and refuse a course file that is right.
    expect([...withPrerequisites(["courses"])].sort()).toEqual(["concepts", "courses", "tags"]);
  });

  it("closes over both directions until nothing changes", () => {
    // `--only concepts` pulls courses in as a dependent, and courses cannot
    // write its `collection_tag` rows before tags has written the tags. One
    // pass of each closure would miss tags entirely.
    expect([...selection(["concepts"])].sort()).toEqual(["concepts", "courses", "diagrams", "sessions", "tags"]);
    // Tags go first and courses follow, because pruning a tag clears links
    // only the courses source writes back.
    expect([...selection(["tags"])].sort()).toEqual(["concepts", "courses", "diagrams", "sessions", "tags"]);
  });
});
