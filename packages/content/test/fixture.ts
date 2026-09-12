import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** A throwaway `content/` tree, so a refusal can be tested without authoring one. */
export interface Fixture {
  root: string;
  write: (relative: string, contents: string) => void;
  cleanup: () => void;
}

export function makeFixture(): Fixture {
  const root = mkdtempSync(path.join(tmpdir(), "content-fixture-"));
  return {
    root,
    write: (relative, contents) => {
      const file = path.join(root, relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, contents, "utf8");
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function topicsYaml(slugs: string[]): string {
  const lines = ["topics:"];
  for (const slug of slugs) {
    lines.push(`  - slug: ${slug}`);
    lines.push(`    title: ${slug}`);
    lines.push("    domain: testing");
  }
  return `${lines.join("\n")}\n`;
}

export function courseYaml(overrides: Record<string, unknown> = {}): string {
  const course = {
    id: "xx1000",
    slug: "xx1000",
    code: "XX1000",
    title: "Test Course",
    credits: 4,
    order: 1,
    inferred: false,
    tags: ["testing"],
    capstone: "Build something",
    modules: [
      {
        id: "xx1000-m1",
        slug: "m1-first",
        title: "First Module",
        order: 1,
        topic: "alpha",
        topics: [{ id: "xx1000-m1-t1", title: "An item", subtopics: ["one", "two"] }],
        resources: [
          {
            id: "xx1000-m1-r1",
            title: "A book",
            url: "https://example.invalid/book",
            type: "book",
          },
        ],
      },
    ],
    ...overrides,
  };
  // JSON is valid YAML, which keeps the fixture readable as data rather than
  // as indentation.
  return `${JSON.stringify(course, null, 2)}\n`;
}
