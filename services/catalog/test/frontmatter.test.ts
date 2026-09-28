import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "../src/env";
import { noteId } from "@self-learn/content";
import { SEED } from "./seed";

import { extractWikilinks, parseFrontmatter, readText } from "../src/index/frontmatter";

/**
 * The catalog parses the knowledge base's frontmatter with its own TypeScript
 * port of `scripts/learn/lib/markdown.mjs`. Two parsers for one dialect is a
 * drift risk, and this is what makes it a safe one: both are run over every
 * real note and session in the seed tree and must agree exactly.
 *
 * If the `learn` CLI's dialect changes, this fails here rather than the catalog
 * quietly reading the same files a different way.
 */

interface LearnParser {
  parseFrontmatter: (text: string) => { data: Record<string, unknown>; body: string };
  extractWikilinks: (text: string) => string[];
}

const learn = (await import(
  path.join(REPO_ROOT, "scripts", "learn", "lib", "markdown.mjs")
)) as LearnParser;

async function everyNote(): Promise<string[]> {
  const files: string[] = [];
  const concepts = path.join(SEED, "learn", "concepts");
  for (const domain of await readdir(concepts, { withFileTypes: true })) {
    if (!domain.isDirectory()) continue;
    const dir = path.join(concepts, domain.name);
    for (const entry of await readdir(dir)) {
      if (entry.endsWith(".md")) files.push(path.join(dir, entry));
    }
  }
  const sessions = path.join(SEED, "learn", "sessions");
  for (const entry of await readdir(sessions)) {
    if (entry.endsWith(".md")) files.push(path.join(sessions, entry));
  }
  return files.sort();
}

describe("frontmatter parity with the learn CLI", () => {
  it("agrees on every note and session in the seed", async () => {
    const files = await everyNote();
    expect(files.length).toBe(12);

    for (const file of files) {
      const text = await readFile(file, "utf8");
      const mine = parseFrontmatter(text);
      const theirs = learn.parseFrontmatter(text);
      const where = path.relative(SEED, file);

      expect(mine.data, `${where} frontmatter`).toEqual(theirs.data);
      expect(mine.body, `${where} body`).toEqual(theirs.body);
    }
  });

  it("agrees on wikilinks, up to the catalog's deduplication", async () => {
    for (const file of await everyNote()) {
      const text = await readFile(file, "utf8");
      const { body } = parseFrontmatter(text);
      // The catalog deduplicates, because two mentions of a concept are still
      // one `asset_concept` row. Order and membership must still match.
      expect(extractWikilinks(body), path.relative(SEED, file)).toEqual([
        ...new Set(learn.extractWikilinks(body)),
      ]);
    }
  });
});

describe("frontmatter dialect", () => {
  it("reads inline arrays, block arrays and quoted scalars", () => {
    const { data, body } = parseFrontmatter(
      [
        "---",
        "id: example",
        'summary: "a colon: inside quotes"',
        "requires: [one, two]",
        "assumes:",
        "  - three",
        "  - four",
        "empty:",
        "count: 42",
        "flag: true",
        "---",
        "",
        "Body starts here.",
        "",
      ].join("\n"),
    );

    expect(data).toEqual({
      id: "example",
      summary: "a colon: inside quotes",
      requires: ["one", "two"],
      assumes: ["three", "four"],
      empty: [],
      count: 42,
      flag: true,
    });
    expect(body).toBe("Body starts here.\n");
  });

  it("treats a file with no frontmatter as all body", () => {
    expect(parseFrontmatter("# Just a heading\n")).toEqual({
      data: {},
      body: "# Just a heading\n",
    });
  });

  it("reads a wikilink's target, not its alias or heading", () => {
    expect(extractWikilinks("see [[target|the alias]] and [[other#heading]] and [[target]]")).toEqual(
      ["target", "other"],
    );
  });
});

/**
 * `noteId` in `packages/content` reads a note's `id:` without this parser
 * (the package cannot import the catalog), and `fileSource.concept(slug)`
 * finds notes by it, so it must name the same id the concepts indexer does:
 * `readText(data, "id") ?? stem`. Held to that here on the shapes where a
 * pattern and a line parser can part, not on the real notes, whose ids are
 * all plain and would pass either way.
 */
describe("noteId agrees with the catalog's frontmatter parser", () => {
  const stem = "file-stem";
  const fixtures: Record<string, string> = {
    plain: "---\nid: a-b\ntitle: T\n---\nbody\n",
    "empty id, then another key": "---\nid:\ntitle: not-the-id\n---\nbody\n",
    "empty id with trailing spaces, then another key": "---\nid:   \ntitle: not-the-id\n---\n",
    "a multi-line list": "---\nid:\n  - first\n  - second\ntitle: T\n---\n",
    "a list under a scalar id": "---\nid: scalar\n  - item\n---\n",
    "a list under the next key": "---\nid: kept\ntags:\n  - a\n---\n",
    "blank and comment lines in a list": "---\nid:\n\n# note\n  - a\n---\n",
    "CRLF": "---\r\nid: crlf-id\r\ntitle: T\r\n---\r\n",
    "CRLF empty id": "---\r\nid:\r\ntitle: not-the-id\r\n---\r\n",
    "the last id wins": "---\nid: first\nid: second\n---\n",
    "a later empty id clears it": "---\nid: first\nid:\n---\n",
    quoted: '---\nid: "  spaced  "\n---\n',
    "quoted empty": '---\nid: ""\n---\n',
    "single quotes": "---\nid: 'single'\n---\n",
    number: "---\nid: 007\n---\n",
    decimal: "---\nid: 1.50\n---\n",
    boolean: "---\nid: true\n---\n",
    null: "---\nid: null\n---\n",
    tilde: "---\nid: ~\n---\n",
    "inline list": "---\nid: [a, b]\n---\n",
    indented: "---\n  id: indented\n---\n",
    "no space after the colon": "---\nid:tight\n---\n",
    "no frontmatter": "id: not-frontmatter\n",
    "empty frontmatter": "---\n\n---\n",
  };

  it.each(Object.entries(fixtures))("%s", (_, markdown) => {
    const expected = readText(parseFrontmatter(markdown).data, "id") ?? stem;
    expect(noteId(markdown, stem)).toBe(expected);
  });

  it("does not take the next line as the id when id: is empty", () => {
    expect(noteId(fixtures["empty id, then another key"] as string, stem)).toBe(stem);
    expect(noteId(fixtures["a multi-line list"] as string, stem)).toBe(stem);
  });
});
