import { afterEach, describe, expect, it } from "vitest";

import { loadCourses, loadTags, loadTopics } from "../src/index";
import { courseYaml, makeFixture, topicsYaml, type Fixture } from "./fixture";

/**
 * Two halves.
 *
 * The first is the curriculum integrity suite that used to live in
 * `src/data/courses/index.test.ts` and assert on TypeScript literals. It now
 * asserts on the files, which is the thing that ships.
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

function tree(courses: Record<string, string>, slugs = ["alpha"]): string {
  fixture = makeFixture();
  fixture.write("content/topics.yaml", topicsYaml(slugs));
  for (const [name, body] of Object.entries(courses)) {
    fixture.write(`content/courses/${name}`, body);
  }
  return fixture.root;
}

describe("the real curriculum", () => {
  const courses = loadCourses();

  it("includes the full AY2026/27 shortlist", () => {
    expect(courses.map((c) => c.code).sort()).toEqual(
      [
        "CP4281",
        "CP4282",
        "CP4283",
        "CP4284",
        "CP4285",
        "CS2111",
        "CS3216",
        "CS3227",
        "CS3249",
        "CS4263",
      ].sort(),
    );
  });

  it("flags inferred syllabi only for known courses", () => {
    const inferred = courses
      .filter((c) => c.inferred)
      .map((c) => c.code)
      .sort();
    expect(inferred).toEqual(["CS2111", "CS3227", "CS4263"].sort());
  });

  it("renders in the authored order, not filename order", () => {
    expect(courses.map((c) => c.code)).toEqual([
      "CS2111",
      "CS4263",
      "CP4281",
      "CP4282",
      "CP4283",
      "CP4284",
      "CP4285",
      "CS3216",
      "CS3227",
      "CS3249",
    ]);
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
    const slugs = new Set(loadTopics().map((t) => t.slug));
    for (const course of courses) {
      for (const mod of course.modules) {
        expect(slugs.has(mod.topic), `${mod.id} names "${mod.topic}"`).toBe(true);
      }
    }
  });

  it("only uses tags that content/tags.yaml defines", () => {
    const known = new Set(loadTags().map((t) => t.id));
    for (const course of courses) {
      for (const tag of course.tags) {
        expect(known.has(tag), `${course.code} is tagged "${tag}"`).toBe(true);
      }
    }
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

  it("a directory with no course files", () => {
    const f = (fixture = makeFixture());
    f.write("content/topics.yaml", topicsYaml(["alpha"]));
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
