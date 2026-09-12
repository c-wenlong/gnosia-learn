import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { IndexContext } from "../src/index/source";
import { loadVocabulary } from "../src/index/vocabulary";

/**
 * A throwaway content tree, so an indexer test asserts on rows rather than on
 * whatever happens to be in `learn/` today.
 *
 * The real trees are tested too, end to end, in `catalog.test.ts`. These
 * fixtures exist for the cases the real trees cannot show: an unresolved slug,
 * a duplicate mapping, a `.tldr` beside its `.svg`. Every one of those is a
 * refusal, and a refusal is not something to introduce into the repo just to
 * watch it fire.
 */

export interface Fixture {
  root: string;
  write: (relative: string, contents: string) => Promise<void>;
  context: (overrides?: Partial<IndexContext>) => Promise<IndexContext>;
  cleanup: () => Promise<void>;
}

export async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), "catalog-fixture-"));

  const write = async (relative: string, contents: string) => {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents, "utf8");
  };

  return {
    root,
    write,
    context: async (overrides = {}) => ({
      repoRoot: root,
      manimkcRoot: path.join(root, "manimkc"),
      vocabulary: await loadVocabulary(root),
      knownConcepts: async () => new Set<string>(),
      knownCurriculumItems: async () => new Set<string>(),
      ...overrides,
    }),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

/**
 * A minimal `content/tags.yaml`. The course reader checks every course tag
 * against it, so a tree with course files needs one.
 */
export function tagsYaml(ids: string[]): string {
  const lines = ["tags:"];
  for (const id of ids) {
    lines.push(`  - id: ${id}`);
    lines.push(`    label: ${id}`);
    lines.push(`    description: the ${id} theme`);
  }
  return `${lines.join("\n")}\n`;
}

/** A minimal `content/topics.yaml` covering whatever the test needs. */
export function topicsYaml(
  entries: {
    slug: string;
    title?: string;
    domain?: string;
    summary?: string;
    aliases?: string[];
    manimkc?: string[];
    courses?: string[];
    concepts?: string[];
  }[],
): string {
  const lines = ["topics:"];
  for (const entry of entries) {
    lines.push(`  - slug: ${entry.slug}`);
    lines.push(`    title: ${entry.title ?? entry.slug}`);
    lines.push(`    domain: ${entry.domain ?? "testing"}`);
    if (entry.summary !== undefined) lines.push(`    summary: ${entry.summary}`);
    lines.push(`    aliases: [${(entry.aliases ?? []).join(", ")}]`);
    lines.push("    maps:");
    lines.push(`      manimkc: [${(entry.manimkc ?? []).join(", ")}]`);
    lines.push(`      courses: [${(entry.courses ?? []).join(", ")}]`);
    lines.push(`      concepts: [${(entry.concepts ?? []).join(", ")}]`);
  }
  return `${lines.join("\n")}\n`;
}

/** A concept note with the frontmatter subset the indexer reads. */
export function note(fields: {
  id: string;
  title?: string;
  summary?: string;
  requires?: string[];
  assumes?: string[];
  tags?: string[];
  topics?: string[];
  body?: string;
}): string {
  const lines = ["---", `id: ${fields.id}`, `title: ${fields.title ?? fields.id}`];
  if (fields.summary !== undefined) lines.push(`summary: ${fields.summary}`);
  lines.push(`requires: [${(fields.requires ?? []).join(", ")}]`);
  lines.push(`assumes: [${(fields.assumes ?? []).join(", ")}]`);
  lines.push(`tags: [${(fields.tags ?? []).join(", ")}]`);
  lines.push(`topics: [${(fields.topics ?? []).join(", ")}]`);
  lines.push("---", "", fields.body ?? `# ${fields.title ?? fields.id}`, "");
  return lines.join("\n");
}
