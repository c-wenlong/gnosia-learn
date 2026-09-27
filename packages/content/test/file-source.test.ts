import { readdirSync, readFileSync, utimesSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  ContentError,
  DIAGRAMS_DIR,
  fileSource,
  loadCourses,
  loadTags,
  loadTopics,
  noteId,
  NOTES_DIR,
  SESSIONS_DIR,
} from "../src/index";
import { courseYaml, makeFixture, tagsYaml, topicsYaml, type Fixture } from "./fixture";

/**
 * `fileSource` against the real tree, read only, and against fixtures for the
 * cases the real tree does not have.
 *
 * The parity half is the promise the seam makes: a reader that moved from the
 * synchronous parsers to `fileSource` sees exactly what it saw before, so the
 * web app's conversion changes nothing a person can see.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = fileSource(ROOT);

describe("fileSource over the real content tree", () => {
  it("returns what the synchronous parsers return", async () => {
    expect(await source.topics()).toEqual(loadTopics({ root: ROOT }));
    expect(await source.tags()).toEqual(loadTags({ root: ROOT }));
    expect(await source.courses()).toEqual(loadCourses({ root: ROOT }));
  });

  it("finds every concept note by its id, byte for byte", async () => {
    const directory = path.join(ROOT, NOTES_DIR);
    const domains = readdirSync(directory, { withFileTypes: true }).filter((d) => d.isDirectory());
    let count = 0;
    for (const domain of domains) {
      for (const name of readdirSync(path.join(directory, domain.name)).filter((n) => n.endsWith(".md"))) {
        const markdown = readFileSync(path.join(directory, domain.name, name), "utf8");
        const slug = noteId(markdown, path.basename(name, ".md"));
        expect(await source.concept(slug)).toEqual({
          slug,
          domain: domain.name,
          path: `${NOTES_DIR}/${domain.name}/${name}`,
          markdown,
        });
        count += 1;
      }
    }
    // The tree held 32 notes when this was written; any is enough to mean
    // something, none would mean the loop proved nothing.
    expect(count).toBeGreaterThan(0);
  });

  it("returns every session log whole", async () => {
    const names = readdirSync(path.join(ROOT, SESSIONS_DIR)).filter((n) => n.endsWith(".md"));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const id = path.basename(name, ".md");
      expect(await source.sessionLog(id)).toEqual({
        id,
        path: `${SESSIONS_DIR}/${name}`,
        markdown: readFileSync(path.join(ROOT, SESSIONS_DIR, name), "utf8"),
      });
    }
  });

  it("returns every committed diagram parsed, with the SVG beside it", async () => {
    const names = readdirSync(path.join(ROOT, DIAGRAMS_DIR)).filter((n) => n.endsWith(".tldr"));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const slug = path.basename(name, ".tldr");
      const got = await source.diagram(slug);
      expect(got?.path).toBe(`${DIAGRAMS_DIR}/${name}`);
      expect(got?.document).toEqual(JSON.parse(readFileSync(path.join(ROOT, DIAGRAMS_DIR, name), "utf8")));
      expect(got?.svgPath).toBe(`${DIAGRAMS_DIR}/${slug}.svg`);
    }
  });

  it("answers null for a slug nothing has, and for one that is not a slug", async () => {
    for (const bad of ["no-such-thing", "../../package", "Dot Product", ""]) {
      expect(await source.concept(bad)).toBeNull();
      expect(await source.sessionLog(bad)).toBeNull();
      expect(await source.diagram(bad)).toBeNull();
    }
  });
});

describe("fileSource over a fixture", () => {
  let fixture: Fixture;
  afterEach(() => fixture?.cleanup());

  function tree(): Fixture {
    fixture = makeFixture();
    fixture.write("content/topics.yaml", topicsYaml(["alpha"]));
    fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    fixture.write("content/courses/xx1000.yaml", courseYaml());
    return fixture;
  }

  it("refuses a broken file with the parser's own sentence, every time", async () => {
    const f = tree();
    f.write("content/courses/xx1000.yaml", courseYaml({ modules: [] }));
    const files = fileSource(f.root);
    const direct = (() => {
      try {
        loadCourses({ root: f.root });
      } catch (error) {
        return (error as Error).message;
      }
      return null;
    })();
    expect(direct).not.toBeNull();
    // Twice: a failed parse must not be remembered as an answer.
    for (let i = 0; i < 2; i++) {
      await expect(files.courses()).rejects.toThrow(ContentError);
      await expect(files.courses()).rejects.toThrow(direct!);
    }
  });

  it("reuses a parse until a file it read changes, then reads again", async () => {
    const f = tree();
    const files = fileSource(f.root);
    const first = await files.courses();
    expect(await files.courses()).toBe(first);

    f.write("content/courses/xx1000.yaml", courseYaml({ title: "Renamed Course" }));
    // Moved to a fixed future time as well, so a coarse clock cannot hide the edit.
    const file = path.join(f.root, "content/courses/xx1000.yaml");
    utimesSync(file, new Date(2030, 0, 1), new Date(2030, 0, 1));
    const second = await files.courses();
    expect(second).not.toBe(first);
    expect(second[0]?.title).toBe("Renamed Course");

    // An edit to the vocabulary is an edit to what a course validates against.
    f.write("content/topics.yaml", topicsYaml(["alpha", "another"]));
    utimesSync(path.join(f.root, "content/topics.yaml"), new Date(2031, 0, 1), new Date(2031, 0, 1));
    expect(await files.courses()).not.toBe(second);
    expect((await files.topics()).map((t) => t.slug)).toEqual(["alpha", "another"]);
  });

  it("files a note under the id it declares, not the name it was saved as", async () => {
    const f = tree();
    f.write(`${NOTES_DIR}/maths/old-name.md`, "---\nid: new-name\ntitle: T\n---\n\nbody\n");
    f.write(`${NOTES_DIR}/maths/plain.md`, "---\ntitle: No id\n---\n\nbody\n");
    const files = fileSource(f.root);
    expect((await files.concept("new-name"))?.path).toBe(`${NOTES_DIR}/maths/old-name.md`);
    expect(await files.concept("old-name")).toBeNull();
    expect((await files.concept("plain"))?.domain).toBe("maths");
  });

  it("finds a note whose declared id is not kebab-case, and builds no path from an unsafe one", async () => {
    const f = tree();
    f.write(`${NOTES_DIR}/maths/dot.md`, "---\nid: dot_product\n---\n\nbody\n");
    const files = fileSource(f.root);
    expect((await files.concept("dot_product"))?.path).toBe(`${NOTES_DIR}/maths/dot.md`);
    expect(await files.concept("maths/dot")).toBeNull();
    expect(await files.sessionLog("../sessions/x")).toBeNull();
    expect(await files.diagram(".candidates")).toBeNull();
  });

  it("refuses a .tldr that is not JSON, naming the file", async () => {
    const f = tree();
    f.write(`${DIAGRAMS_DIR}/broken.tldr`, "{ not json");
    await expect(fileSource(f.root).diagram("broken")).rejects.toThrow(`${DIAGRAMS_DIR}/broken.tldr`);
  });

  it("reports a diagram with no exported SVG as such", async () => {
    const f = tree();
    f.write(`${DIAGRAMS_DIR}/lonely.tldr`, "{}");
    expect(await fileSource(f.root).diagram("lonely")).toEqual({
      slug: "lonely",
      path: `${DIAGRAMS_DIR}/lonely.tldr`,
      document: {},
      svgPath: null,
    });
  });
});

describe("noteId", () => {
  it.each([
    ["---\nid: a-b\n---\n", "stem", "a-b"],
    ['---\nid: "quoted"\n---\n', "stem", "quoted"],
    ["---\nid:\n---\n", "stem", "stem"],
    ["---\nid: ~\n---\n", "stem", "stem"],
    ["---\ntitle: x\n---\n", "stem", "stem"],
    ["no frontmatter\nid: not-this\n", "stem", "stem"],
    ["---\nid: first\ntitle: t\nid: second\n---\n", "stem", "second"],
    ["---\nid: [a, b]\n---\n", "stem", "stem"],
    ["---\n  id: indented\n---\n", "stem", "stem"],
  ])("reads %j as %s's id", (markdown, stem, expected) => {
    expect(noteId(markdown, stem)).toBe(expected);
  });
});
