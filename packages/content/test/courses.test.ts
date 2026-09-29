import { afterEach, describe, expect, it } from "vitest";

import { isSourceUrl, loadCourses, loadTags, loadTopics, parseCourse } from "../src/index";
import { courseYaml, makeFixture, tagsYaml, topicsYaml, type Fixture } from "./fixture";
import { SEED } from "./seed";

/**
 * Two halves.
 *
 * The first is the curriculum integrity suite that used to live in
 * `src/data/courses/index.test.ts` and assert on TypeScript literals. It now
 * asserts on the files, the seed's since phase 2.
 *
 * The second is the refusals: a duplicate id, a module pointing at a topic that
 * does not exist, `inferred` left off. None of those are worth introducing into
 * the repo to watch them fire, so they get a throwaway tree.
 */

let fixture: Fixture | undefined;

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

function tree(
  courses: Record<string, string>,
  slugs = ["alpha"],
  tags = ["testing"],
): string {
  fixture = makeFixture();
  fixture.write("content/topics.yaml", topicsYaml(slugs));
  fixture.write("content/tags.yaml", tagsYaml(tags));
  for (const [name, body] of Object.entries(courses)) {
    fixture.write(`content/courses/${name}`, body);
  }
  return fixture.root;
}

/**
 * A tree whose vocabulary maps `mapped` concepts per topic, and whose one
 * course lists `concepts` on its one checklist row.
 */
function mappedTree(mapped: Record<string, string[]>, concepts: string[]): string {
  const f = (fixture = makeFixture());
  f.write("content/topics.yaml", topicsYaml(Object.keys(mapped), mapped));
  f.write("content/tags.yaml", tagsYaml(["testing"]));
  const course = JSON.parse(courseYaml()) as { modules: { topics: Record<string, unknown>[] }[] };
  course.modules[0]!.topics[0]!.concepts = concepts;
  f.write("content/courses/xx1000.yaml", JSON.stringify(course));
  return f.root;
}

/**
 * The seed's curriculum (seed/README.md): real course data cut from the
 * owner's with `catalog export --subset`, the tree the suites read now that
 * `content/` goes in phase 3. The owner's full shortlist is the database's,
 * checked by `catalog parity` on flip day rather than asserted here.
 */
describe("the seed's curriculum", () => {
  const root = SEED;
  const courses = loadCourses({ root });

  it("is the one course the seed was cut from, with its two modules", () => {
    expect(courses.map((c) => c.code)).toEqual(["CP4284"]);
    expect(courses[0]?.modules.map((m) => m.id)).toEqual(["cp4284-m1", "cp4284-m3"]);
    expect(courses.filter((c) => c.inferred)).toEqual([]);
  });

  it("gives every course modules with unique topic ids", () => {
    const seen = new Set<string>();
    for (const course of courses) {
      expect(course.modules.length).toBeGreaterThan(0);
      for (const mod of course.modules) {
        expect(mod.topics.length).toBeGreaterThan(0);
        for (const topic of mod.topics) {
          expect(seen.has(topic.id)).toBe(false);
          seen.add(topic.id);
        }
      }
    }
  });

  it("names a vocabulary topic on every module", () => {
    const slugs = new Set(loadTopics({ root }).map((t) => t.slug));
    for (const course of courses) {
      for (const mod of course.modules) {
        expect(slugs.has(mod.topic), `${mod.id} names "${mod.topic}"`).toBe(true);
      }
    }
  });

  it("lists an item's concepts under its module topic's maps.concepts", () => {
    // Enforced by the reader; asserted here so the guarantee is visible.
    const mapped = new Map(loadTopics({ root }).map((t) => [t.slug, new Set(t.maps.concepts)]));
    let listed = 0;
    for (const course of courses) {
      for (const mod of course.modules) {
        for (const topic of mod.topics) {
          for (const concept of topic.concepts) {
            listed += 1;
            expect(
              mapped.get(mod.topic)?.has(concept),
              `${topic.id} lists "${concept}" under ${mod.topic}`,
            ).toBe(true);
          }
        }
      }
    }
    expect(listed).toBe(8);
  });

  it("only uses tags that content/tags.yaml defines", () => {
    // Enforced by the reader; asserted here so the guarantee is visible.
    const known = new Set(loadTags({ root }).map((t) => t.id));
    for (const course of courses) {
      for (const tag of course.tags) {
        expect(known.has(tag), `${course.code} is tagged "${tag}"`).toBe(true);
      }
    }
  });
});

describe("a course's cover:", () => {
  const CREDIT = { photographer: "A Photographer", source: "https://example.com/p", licence: "Unsplash License" };
  const withCover = (cover: unknown) => {
    const course = JSON.parse(courseYaml()) as Record<string, unknown>;
    course.cover = cover;
    return JSON.stringify(course);
  };

  it("is read as the file beside the course and its credit, after the optional keys", () => {
    const course = parseCourse(withCover({ file: "xx1000.cover.webp", ...CREDIT }), "xx1000.yaml");
    expect(course.cover).toEqual({ file: "xx1000.cover.webp", ...CREDIT });
    expect(Object.keys(course).at(-1)).toBe("cover");
    expect(parseCourse(courseYaml(), "xx1000.yaml").cover).toBeUndefined();
  });

  it("is the seed's, on its one course", () => {
    expect(loadCourses({ root: SEED })[0]?.cover).toMatchObject({ file: "cp4284.cover.webp", licence: "Unsplash License" });
  });

  it("refuses a file name that is not the course's own cover, so no path is built from it", () => {
    for (const file of ["../secrets.webp", "other.cover.webp", "xx1000.cover.gif", "xx1000.webp"]) {
      expect(() => parseCourse(withCover({ file, ...CREDIT }), "xx1000.yaml"), file).toThrow(/must be one of xx1000\.cover\.webp/);
    }
  });

  it("takes as a source only an http(s) URL with a host written out", () => {
    for (const url of ["https://unsplash.com/photos/a-b", "http://x.test:8080/p?q=1#h", "https://x"]) expect(isSourceUrl(url), url).toBe(true);
    for (const url of ["https:///", "https:///x", "http://", "https://a b", "https://user@host/", "ftp://x.test", " https://x.test"]) {
      expect(isSourceUrl(url), url).toBe(false);
    }
  });

  it("refuses a missing field, an unknown key and a source that is not a URL", () => {
    expect(() => parseCourse(withCover({ file: "xx1000.cover.png", photographer: "P", source: "https://x.test/p" }), "x")).toThrow(/licence/);
    expect(() => parseCourse(withCover({ file: "xx1000.cover.png", ...CREDIT, license: "typo" }), "x")).toThrow(/unknown key\(s\) license/);
    for (const source of ["example.com/p", "https:///", "https:///x", "https://a b", "ftp://x.test/p"]) {
      expect(() => parseCourse(withCover({ file: "xx1000.cover.png", ...CREDIT, source }), "x"), source).toThrow(/http\(s\) URL/);
    }
    expect(() => parseCourse(withCover(null), "x")).toThrow(/expected a mapping/);
  });
});

describe("loadCourses refuses", () => {
  it("a module whose topic is not in the vocabulary", () => {
    const root = tree({ "xx1000.yaml": courseYaml() }, ["beta"]);
    expect(() => loadCourses({ root })).toThrow(
      /names topic "alpha", which is not in content\/topics\.yaml/,
    );
  });

  it("a module with no topic at all", () => {
    const course = JSON.parse(courseYaml()) as { modules: Record<string, unknown>[] };
    delete course.modules[0]!.topic;
    const root = tree({ "xx1000.yaml": JSON.stringify(course) });
    expect(() => loadCourses({ root })).toThrow(/has no `topic:` slug/);
  });

  it("every unresolved topic at once, not the first", () => {
    const course = JSON.parse(courseYaml()) as { modules: Record<string, unknown>[] };
    course.modules.push({
      ...course.modules[0],
      id: "xx1000-m2",
      slug: "m2-second",
      order: 2,
      topic: "nope",
      topics: [{ id: "xx1000-m2-t1", title: "Another", subtopics: [] }],
      resources: [],
    });
    course.modules[0]!.topic = "also-nope";
    const root = tree({ "xx1000.yaml": JSON.stringify(course) });
    expect(() => loadCourses({ root })).toThrow(/2 unresolved references/);
  });

  it("a topic id used twice, across files", () => {
    const root = tree({
      "xx1000.yaml": courseYaml(),
      "xx2000.yaml": courseYaml({
        id: "xx2000",
        slug: "xx2000",
        code: "XX2000",
        order: 2,
        modules: [
          {
            id: "xx2000-m1",
            slug: "m1-first",
            title: "First",
            order: 1,
            topic: "alpha",
            topics: [{ id: "xx1000-m1-t1", title: "Stolen", subtopics: [] }],
            resources: [],
          },
        ],
      }),
    });
    expect(() => loadCourses({ root })).toThrow(
      /topic id "xx1000-m1-t1" is already used in content\/courses\/xx1000\.yaml/,
    );
  });

  it("two courses claiming one order", () => {
    const root = tree({
      "xx1000.yaml": courseYaml(),
      "xx2000.yaml": courseYaml({
        id: "xx2000",
        slug: "xx2000",
        code: "XX2000",
        modules: [
          {
            id: "xx2000-m1",
            slug: "m1-first",
            title: "First",
            order: 1,
            topic: "alpha",
            topics: [{ id: "xx2000-m1-t1", title: "An item", subtopics: [] }],
            resources: [],
          },
        ],
      }),
    });
    expect(() => loadCourses({ root })).toThrow(/order 1 is already used by/);
  });

  it("a missing slug", () => {
    const course = JSON.parse(courseYaml()) as Record<string, unknown>;
    delete course.slug;
    const root = tree({ "xx1000.yaml": JSON.stringify(course) });
    expect(() => loadCourses({ root })).toThrow(
      /content\/courses\/xx1000\.yaml: slug is required/,
    );
  });

  it("inferred left off, rather than reading it as false", () => {
    const course = JSON.parse(courseYaml()) as Record<string, unknown>;
    delete course.inferred;
    const root = tree({ "xx1000.yaml": JSON.stringify(course) });
    expect(() => loadCourses({ root })).toThrow(
      /inferred is required and must be true or false/,
    );
  });

  it("inferred written as a string", () => {
    const root = tree({ "xx1000.yaml": courseYaml({ inferred: "true" }) });
    expect(() => loadCourses({ root })).toThrow(/must be true or false, not "true"/);
  });

  it("a resource type it does not know", () => {
    const course = JSON.parse(courseYaml()) as {
      modules: { resources: Record<string, unknown>[] }[];
    };
    course.modules[0]!.resources[0]!.type = "podcast";
    const root = tree({ "xx1000.yaml": JSON.stringify(course) });
    expect(() => loadCourses({ root })).toThrow(/type "podcast" is not one of/);
  });

  it("a tag that content/tags.yaml does not define", () => {
    const root = tree({ "xx1000.yaml": courseYaml() }, ["alpha"], ["something-else"]);
    expect(() => loadCourses({ root })).toThrow(
      /is tagged "testing", which is not in content\/tags\.yaml/,
    );
  });

  it("a collection that is a mapping rather than a list", () => {
    const course = JSON.parse(courseYaml()) as { modules: Record<string, unknown>[] };
    course.modules[0]!.topics = {};
    const root = tree({ "xx1000.yaml": JSON.stringify(course) });
    expect(() => loadCourses({ root })).toThrow(/topics must be a list, not object/);
  });

  it("a null entry inside a collection", () => {
    const course = JSON.parse(courseYaml()) as { modules: unknown[] };
    course.modules.push(null);
    const root = tree({ "xx1000.yaml": JSON.stringify(course) });
    expect(() => loadCourses({ root })).toThrow(/modules\[1\] must be a mapping/);
  });

  it("a module with no topics at all", () => {
    const course = JSON.parse(courseYaml()) as { modules: Record<string, unknown>[] };
    course.modules[0]!.topics = [];
    const root = tree({ "xx1000.yaml": JSON.stringify(course) });
    expect(() => loadCourses({ root })).toThrow(/has no topics/);
  });

  it("two modules of one course sharing a slug", () => {
    const course = JSON.parse(courseYaml()) as { modules: Record<string, unknown>[] };
    course.modules.push({
      ...course.modules[0],
      id: "xx1000-m2",
      order: 2,
      topics: [{ id: "xx1000-m2-t1", title: "Another", subtopics: [] }],
      resources: [],
    });
    const root = tree({ "xx1000.yaml": JSON.stringify(course) });
    expect(() => loadCourses({ root })).toThrow(
      /module slug id "m1-first" is already used in/,
    );
  });

  it("but allows two courses to share a module slug", () => {
    const root = tree({
      "xx1000.yaml": courseYaml(),
      "xx2000.yaml": courseYaml({
        id: "xx2000",
        slug: "xx2000",
        code: "XX2000",
        order: 2,
        modules: [
          {
            id: "xx2000-m1",
            slug: "m1-first",
            title: "First",
            order: 1,
            topic: "alpha",
            topics: [{ id: "xx2000-m1-t1", title: "An item", subtopics: [] }],
            resources: [],
          },
        ],
      }),
    });
    expect(loadCourses({ root })).toHaveLength(2);
  });

  it("an item's concepts written as a mapping", () => {
    const course = JSON.parse(courseYaml()) as { modules: { topics: Record<string, unknown>[] }[] };
    course.modules[0]!.topics[0]!.concepts = { first: true };
    const root = tree({ "xx1000.yaml": JSON.stringify(course) });
    expect(() => loadCourses({ root })).toThrow(/topic "xx1000-m1-t1": concepts must be a list/);
  });

  it("an item's concepts key left empty", () => {
    const course = JSON.parse(courseYaml()) as { modules: { topics: Record<string, unknown>[] }[] };
    course.modules[0]!.topics[0]!.concepts = null;
    const root = tree({ "xx1000.yaml": JSON.stringify(course) });
    expect(() => loadCourses({ root })).toThrow(/concepts is present but empty/);
  });

  it("a concept listed twice on one item", () => {
    const root = mappedTree({ alpha: ["one", "two"] }, ["one", "two", "one"]);
    expect(() => loadCourses({ root })).toThrow(/concepts lists "one" twice/);
  });

  it("a concept its module topic does not map, naming every one", () => {
    const root = mappedTree({ alpha: ["one"] }, ["one", "two", "three"]);
    expect(() => loadCourses({ root })).toThrow(
      /2 unresolved references[\s\S]*lists concept "two", which is not in maps\.concepts of topic "alpha"[\s\S]*lists concept "three"/,
    );
  });

  it("but keeps a mapped list in its authored order", () => {
    const root = mappedTree({ alpha: ["one", "two", "three"] }, ["three", "one"]);
    const [course] = loadCourses({ root });
    expect(course!.modules[0]!.topics[0]!.concepts).toEqual(["three", "one"]);
  });

  it("and reads a row with no concepts as an empty list", () => {
    const root = tree({ "xx1000.yaml": courseYaml() });
    expect(loadCourses({ root })[0]!.modules[0]!.topics[0]!.concepts).toEqual([]);
  });

  it("a directory with no course files", () => {
    const f = (fixture = makeFixture());
    f.write("content/topics.yaml", topicsYaml(["alpha"]));
    f.write("content/tags.yaml", tagsYaml(["testing"]));
    f.write("content/courses/README.md", "# not a course\n");
    expect(() => loadCourses({ root: f.root })).toThrow(/no course YAML files found/);
  });
});

describe("loadTags refuses", () => {
  it("a duplicate id", () => {
    const f = (fixture = makeFixture());
    f.write(
      "content/tags.yaml",
      "tags:\n  - id: a\n    label: A\n    description: d\n  - id: a\n    label: B\n    description: d\n",
    );
    expect(() => loadTags({ root: f.root })).toThrow(/tag id "a" appears twice/);
  });

  it("a missing file", () => {
    const f = (fixture = makeFixture());
    expect(() => loadTags({ root: f.root })).toThrow(
      /content\/tags\.yaml does not exist/,
    );
  });
});
