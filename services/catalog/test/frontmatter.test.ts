import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "../src/env";
import { extractWikilinks, parseFrontmatter } from "../src/index/frontmatter";

/**
 * The catalog parses the knowledge base's frontmatter with its own TypeScript
 * port of `scripts/learn/lib/markdown.mjs`. Two parsers for one dialect is a
 * drift risk, and this is what makes it a safe one: both are run over every
 * real note and session in the repo and must agree exactly.
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
  const concepts = path.join(REPO_ROOT, "learn", "concepts");
  for (const domain of await readdir(concepts, { withFileTypes: true })) {
    if (!domain.isDirectory()) continue;
    const dir = path.join(concepts, domain.name);
    for (const entry of await readdir(dir)) {
      if (entry.endsWith(".md")) files.push(path.join(dir, entry));
    }
  }
  const sessions = path.join(REPO_ROOT, "learn", "sessions");
  for (const entry of await readdir(sessions)) {
    if (entry.endsWith(".md")) files.push(path.join(sessions, entry));
  }
  return files.sort();
}

describe("frontmatter parity with the learn CLI", () => {
  it("agrees on every note and session in the repo", async () => {
    const files = await everyNote();
    expect(files.length).toBeGreaterThan(30);

    for (const file of files) {
      const text = await readFile(file, "utf8");
      const mine = parseFrontmatter(text);
      const theirs = learn.parseFrontmatter(text);
      const where = path.relative(REPO_ROOT, file);

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
      expect(extractWikilinks(body), path.relative(REPO_ROOT, file)).toEqual([
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
