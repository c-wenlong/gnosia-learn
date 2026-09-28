import { readFile } from "node:fs/promises";
import path from "node:path";

import type { NewAsset, NewAssetConcept, NewAssetTopic } from "@self-learn/schema";

import { type ImportedLog, logAsset } from "../content/session-logs";
import { filesIn, relativeTo } from "./files";
import { parseFrontmatter, readText } from "./frontmatter";
import { ASSET_PREFIX, type Indexer, type SourceRows } from "./source";

/**
 * `learn/sessions/*.md` as session assets, linked to what they covered.
 *
 * A session log is the tutor's live record of one sitting, and it names the
 * concepts it touched as `[[wikilinks]]` in the body — the same links Obsidian
 * follows. That is the only machine-readable statement of what a session was
 * about, so it is what the link rows are built from.
 *
 * **A wikilink that names no concept is not an error.** Sessions link to each
 * other, to `learn/map.md` and to notes that were never written; the tutor
 * writes prose, not a manifest. This differs from every other indexer in the
 * set, and deliberately: elsewhere an unresolved reference means an asset
 * nothing can find, here it means a sentence mentioned something. The
 * unmatched links are counted in the run's notes so the number is visible if
 * it ever looks wrong.
 *
 * Sessions inherit the topics of the concepts they name, which is what puts
 * "when did I study this" under `show <topic>`.
 */

export const SESSIONS_DIR = "learn/sessions";

export const sessionsIndexer: Indexer = {
  source: "sessions",
  owns: [],
  assetPrefix: ASSET_PREFIX.sessions,
  root: () => SESSIONS_DIR,

  read: async ({ repoRoot, knownConcepts, vocabulary }) => {
    const directory = path.join(repoRoot, SESSIONS_DIR);
    const files = await filesIn(directory, [".md"]);
    const concepts = await knownConcepts();

    const assets: NewAsset[] = [];
    const assetConcepts: NewAssetConcept[] = [];
    const assetTopics: NewAssetTopic[] = [];
    const logs: ImportedLog[] = [];
    let covered = 0;
    let unmatched = 0;

    for (const file of files) {
      const where = relativeTo(repoRoot, file);
      const text = await readFile(file, "utf8");
      const found = logAsset(where, text, concepts, (slug) => vocabulary.byConcept.get(slug));
      assets.push(found.asset);
      assetConcepts.push(...found.assetConcepts);
      assetTopics.push(...found.assetTopics);
      covered += found.covered;
      unmatched += found.unmatched;

      // The log itself, for its entries (Track C): the writer appends what
      // the file holds beyond what the database already has.
      const { data } = parseFrontmatter(text);
      const date = readText(data, "date");
      const parsed = date === null ? null : new Date(date);
      logs.push({
        id: path.basename(file, ".md"),
        path: where,
        markdown: text,
        title: readText(data, "title"),
        goal: readText(data, "goal"),
        date: parsed !== null && !Number.isNaN(parsed.getTime()) ? parsed : null,
      });
    }

    const rows: SourceRows = {
      asset: assets,
      assetTopic: assetTopics,
      assetConcept: assetConcepts,
    };
    return {
      rows,
      logs,
      notes: [
        `${assets.length} sessions covering ${covered} concept mentions ` +
          `(${unmatched} wikilink(s) named no concept)`,
      ],
    };
  },
};
