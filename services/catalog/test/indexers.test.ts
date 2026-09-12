import { afterEach, describe, expect, it } from "vitest";

import { conceptsIndexer } from "../src/index/concepts";
import { withDependents } from "../src/index/run";
import { coursesIndexer } from "../src/index/courses";
import { diagramsIndexer } from "../src/index/diagrams";
import { IndexError } from "../src/index/errors";
import { buildRows, type TopicsReport } from "../src/index/manimkc";
import { sessionsIndexer } from "../src/index/sessions";
import { topicsIndexer } from "../src/index/topics";
import { loadVocabulary } from "../src/index/vocabulary";
import { makeFixture, note, topicsYaml, type Fixture } from "./fixture-tree";

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
      { slug: "alpha", title: "Alpha", domain: "one", summary: "First", aliases: ["a", "first"] },
      { slug: "beta", title: "Beta", domain: "two", summary: null, aliases: [] },
    ]);
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
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", courses: ["xx1000-m1"] }]));
    await fixture.write("content/courses/xx1000.yaml", COURSE_YAML);

    const { rows } = await coursesIndexer.read(await fixture.context());

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
    expect(rows.collectionItem).toEqual([
      { collectionId: "xx1000-m1", position: 0, topicSlug: "alpha", conceptSlug: null, assetId: null },
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
      },
    ]);
    expect(rows.assetTopic).toEqual([{ assetId: "link:xx1000-m1-r1", topicSlug: "alpha" }]);
  });

  it("refuses a module whose topic is not in the vocabulary", async () => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "beta", courses: ["xx1000-m1"] }]));
    await fixture.write("content/courses/xx1000.yaml", COURSE_YAML);

    await expect(coursesIndexer.read(await fixture.context())).rejects.toThrow(
      /names topic "alpha", which is not in content\/topics\.yaml/,
    );
  });

  it("refuses when the course file and the vocabulary disagree", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha" }, { slug: "beta", courses: ["xx1000-m1"] }]),
    );
    await fixture.write("content/courses/xx1000.yaml", COURSE_YAML);

    await expect(coursesIndexer.read(await fixture.context())).rejects.toThrow(
      /has two different topics.*"alpha".*"beta"/s,
    );
  });

  it("refuses a vocabulary mapping for a module no course defines", async () => {
    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha", courses: ["xx1000-m1", "xx1000-m9"] }]),
    );
    await fixture.write("content/courses/xx1000.yaml", COURSE_YAML);

    await expect(coursesIndexer.read(await fixture.context())).rejects.toThrow(
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
        topics: ["xx1000-m1-t1"],
      }),
    );
    return f;
  }

  it("reads concepts, prerequisites, curriculum links and note assets", async () => {
    fixture = await conceptFixture();
    const context = await fixture.context({
      knownCurriculumItems: async () => new Set(["xx1000-m1-t1"]),
    });

    const { rows } = await conceptsIndexer.read(context);

    expect(rows.concept).toEqual([
      {
        slug: "base",
        title: "Base",
        summary: null,
        topicSlug: "alpha",
        path: "learn/concepts/testing/base.md",
      },
      {
        slug: "derived",
        title: "Derived",
        summary: "Builds on base",
        topicSlug: "alpha",
        path: "learn/concepts/testing/derived.md",
      },
    ]);
    expect(rows.conceptPrerequisite).toEqual([
      { conceptSlug: "derived", prerequisiteSlug: "base", kind: "requires" },
    ]);
    expect(rows.conceptCurriculumItem).toEqual([
      { conceptSlug: "derived", curriculumItemId: "xx1000-m1-t1" },
    ]);

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

  it("refuses a `topics:` entry that is not a curriculum item", async () => {
    fixture = await conceptFixture();
    // The default context knows no curriculum items at all.
    await expect(conceptsIndexer.read(await fixture.context())).rejects.toThrow(
      /topics: "xx1000-m1-t1", which is not a curriculum item/,
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

describe("diagrams", () => {
  it("links an svg to its .tldr source and to the matching concept", async () => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["dot-product"] }]));
    await fixture.write("learn/assets/dot-product.svg", "<svg></svg>");
    await fixture.write("learn/assets/dot-product.tldr", "{}");
    await fixture.write("learn/assets/orphan.svg", "<svg></svg>");

    const { rows } = await diagramsIndexer.read(
      await fixture.context({ knownConcepts: async () => new Set(["dot-product"]) }),
    );

    expect(rows.asset?.map((a) => [a.id, a.kind])).toEqual([
      ["diagram:learn/assets/dot-product.svg", "diagram_svg"],
      ["diagram:learn/assets/dot-product.tldr", "diagram_source"],
      ["diagram:learn/assets/orphan.svg", "diagram_svg"],
    ]);
    expect(rows.assetDerivation).toEqual([
      {
        assetId: "diagram:learn/assets/dot-product.svg",
        sourceAssetId: "diagram:learn/assets/dot-product.tldr",
      },
    ]);
    // Both files matching the concept get the link; the orphan gets neither
    // that nor a topic, and is not an error.
    expect(rows.assetConcept).toHaveLength(2);
    expect(rows.assetTopic).toHaveLength(2);
    expect(rows.assetConcept?.every((r) => r.conceptSlug === "dot-product")).toBe(true);
  });

  it("is an empty result when there are no diagrams", async () => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha" }]));
    const { rows } = await diagramsIndexer.read(await fixture.context());
    expect(rows.asset).toEqual([]);
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

/** A captured `manimkc topics --json` shape, trimmed to what the indexer reads. */
function report(overrides: Partial<TopicsReport["topics"][number]> = {}): TopicsReport {
  return {
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
      report(),
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
      "sessions",
      "topics",
    ]);
  });

  it("pulls concepts, and what points at concepts, in behind courses", () => {
    expect([...withDependents(["courses"])].sort()).toEqual([
      "concepts",
      "courses",
      "diagrams",
      "sessions",
    ]);
  });

  it("leaves the cheap cases cheap: nothing points at what manimkc owns", () => {
    expect([...withDependents(["manimkc"])]).toEqual(["manimkc"]);
    expect([...withDependents(["diagrams"])]).toEqual(["diagrams"]);
    expect([...withDependents(["sessions"])]).toEqual(["sessions"]);
  });
});
