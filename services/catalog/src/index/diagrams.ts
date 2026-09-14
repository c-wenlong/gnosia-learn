import path from "node:path";

import type { NewAsset, NewAssetConcept, NewAssetDerivation, NewAssetTopic } from "@self-learn/schema";

import { IndexErrors } from "./errors";
import { fileFacts, type FileFacts, filesIn, relativeTo } from "./files";
import { ASSET_PREFIX, type Indexer, type SourceRows } from "./source";
import { KC_SCHEMA, listDiagrams, type DiagramMeta } from "./tldr";
import { VOCABULARY_FILE } from "./vocabulary";

/**
 * `learn/assets/*.tldr` and the SVGs exported from them.
 *
 * **A diagram says what it is about, and the filename does not.** Up to bundle
 * 6 the topic and concept came from the filename stem, because a `.tldr` had
 * nowhere to put them: `dot-product.tldr` was filed under the `dot-product`
 * concept and a stem matching nothing was filed nowhere, silently. tldrawkc now
 * carries `meta.tldrawkc` on the document record, so the drawing names its own
 * topic and concepts and the stem is back to being a filename. A `.tldr` with
 * no topic in that metadata is refused by name, the same way an unmapped video
 * is: an asset the catalog cannot file is one nothing can find, which is the
 * failure this bundle exists to prevent. `tldrawkc meta set <file> --topic ...`
 * is the fix, and it needs no browser.
 *
 * **The one exception is an SVG with no `.tldr` beside it.** That is a diagram
 * drawn before the tool existed, and there is nothing to stamp: it has no
 * editable source, so `meta set` has nothing to write to. Those keep the old
 * stem-against-a-concept behaviour and each one is reported as a warning,
 * because the guess is exactly as weak as it always was and the run should say
 * so rather than let it pass as a considered answer.
 *
 * `asset_derivation` still links an SVG to the `.tldr` it came from, by stem,
 * which is the layout tldrawkc writes. The SVG inherits its source's topic and
 * concepts rather than being read for its own `data-kc-topic`: the `.tldr` is
 * the source of truth, and an export that fell behind should show up as one
 * file out of date and not as two files disagreeing.
 */

export const ASSETS_DIR = "learn/assets";

export const KINDS = {
  ".svg": "diagram_svg",
  ".tldr": "diagram_source",
} as const;

export type DiagramExtension = keyof typeof KINDS;

/** Is this a file the diagrams source owns? */
export function isDiagramExtension(extension: string): extension is DiagramExtension {
  return extension in KINDS;
}

/** What one `.tldr` resolved to, shared with the `.svg` exported from it. */
export interface Subject {
  topicSlug: string;
  concepts: string[];
  title: string | null;
}

/**
 * One diagram file as an `asset` row: the single definition of that shape.
 *
 * The full index calls it once per file and `catalog assert-output` calls it
 * once, for one file, so a row written by a job and a row written by a sweep
 * cannot drift apart. That is the whole argument for `assert-output` existing
 * rather than the studio shelling out to `index --only diagrams`.
 */
export function diagramAsset(
  where: string,
  extension: DiagramExtension,
  facts: FileFacts,
  title: string | null,
): NewAsset {
  return {
    id: `${ASSET_PREFIX.diagrams}${where}`,
    kind: KINDS[extension],
    path: where,
    url: null,
    contentHash: facts.contentHash,
    bytes: facts.bytes,
    title: title ?? path.basename(where, extension),
    sourceRepo: "self-learn",
  };
}

export const diagramsIndexer: Indexer = {
  source: "diagrams",
  owns: [],
  assetPrefix: ASSET_PREFIX.diagrams,
  root: () => ASSETS_DIR,

  read: async ({ repoRoot, knownConcepts, vocabulary }) => {
    const directory = path.join(repoRoot, ASSETS_DIR);
    const listing = await listDiagrams(repoRoot, directory);
    const concepts = await knownConcepts();
    const problems = new IndexErrors();
    const notes: string[] = [];

    // Sorted so the rows land in a reproducible order whichever reader ran.
    const files = await filesIn(directory, Object.keys(KINDS));

    for (const failed of listing.errors) {
      problems.add(
        `${relativeTo(repoRoot, failed.path)} could not be read as a tldraw document: ` +
          failed.message,
      );
    }

    /** Stem to what its `.tldr` says, for the `.svg` beside it. */
    const subjects = new Map<string, Subject>();
    /** Stems that have a `.tldr`, so an SVG can find the source it came from. */
    const sources = new Map<string, string>();

    for (const entry of listing.diagrams) {
      const stem = path.basename(entry.path, ".tldr");
      const where = relativeTo(repoRoot, entry.path);
      const subject = resolveSubject(entry.meta, where, concepts, vocabulary, problems, notes);
      if (subject !== null) subjects.set(stem, subject);
    }

    const assets: NewAsset[] = [];
    const assetConcepts: NewAssetConcept[] = [];
    const assetTopics: NewAssetTopic[] = [];
    const derivations: NewAssetDerivation[] = [];
    let stamped = 0;
    let legacy = 0;

    for (const file of files) {
      const extension = path.extname(file) as keyof typeof KINDS;
      const stem = path.basename(file, extension);
      const where = relativeTo(repoRoot, file);
      const id = `${ASSET_PREFIX.diagrams}${where}`;
      const facts = await fileFacts(file);
      const subject = subjects.get(stem);

      assets.push(diagramAsset(where, extension, facts, subject?.title ?? null));
      if (extension === ".tldr") {
        sources.set(stem, id);
        stamped += 1;
      }

      if (subject !== undefined) {
        assetTopics.push({ assetId: id, topicSlug: subject.topicSlug });
        for (const slug of subject.concepts) assetConcepts.push({ assetId: id, conceptSlug: slug });
        continue;
      }

      // No `.tldr` beside this SVG, so nothing carries metadata for it. The
      // stem is all there is, and it is a guess.
      if (extension !== ".svg") continue;
      legacy += 1;
      if (concepts.has(stem)) {
        assetConcepts.push({ assetId: id, conceptSlug: stem });
        const topicSlug = vocabulary.byConcept.get(stem);
        if (topicSlug !== undefined) assetTopics.push({ assetId: id, topicSlug });
        notes.push(
          `WARNING ${where} has no .tldr beside it, so it was filed by its filename ` +
            `against the "${stem}" concept. Nothing checked that guess.`,
        );
      } else {
        notes.push(
          `WARNING ${where} has no .tldr beside it and its filename names no concept, ` +
            `so it is in the catalog under no topic. Redraw it with \`tldrawkc\`, or ` +
            `rename it after a concept.`,
        );
      }
    }

    for (const file of files) {
      if (path.extname(file) !== ".svg") continue;
      const source = sources.get(path.basename(file, ".svg"));
      if (source === undefined) continue;
      derivations.push({
        assetId: `${ASSET_PREFIX.diagrams}${relativeTo(repoRoot, file)}`,
        sourceAssetId: source,
      });
    }

    problems.throwIfAny(`${ASSETS_DIR} (read by ${listing.via})`);

    const rows: SourceRows = {
      asset: assets,
      assetTopic: assetTopics,
      assetConcept: assetConcepts,
      assetDerivation: derivations,
    };
    notes.unshift(
      `${assets.length} diagram files read by ${listing.via}, ${stamped} stamped .tldr, ` +
        `${derivations.length} exported SVG, ${legacy} legacy SVG with no source`,
    );
    return { rows, notes };
  },
};

/**
 * One `.tldr`'s metadata, checked against the vocabulary and the concepts that
 * exist. Returns null and records the reason when it does not hold up.
 *
 * The refusals are all the same shape: the file is named, what is wrong is
 * named, and the command that fixes it is named. An unresolved concept is in
 * here rather than left to the database because the foreign key would fail
 * later with a constraint name and no path, halfway through a run.
 */
export function resolveSubject(
  meta: DiagramMeta | null,
  where: string,
  known: ReadonlySet<string>,
  vocabulary: { bySlug: ReadonlyMap<string, unknown>; byConcept: ReadonlyMap<string, string> },
  problems: IndexErrors,
  notes: string[],
): Subject | null {
  const fix = `\`npm run canvas -- meta set ${where} --topic <slug>\``;
  if (meta === null) {
    problems.add(
      `${where} carries no tldrawkc metadata, so nothing says what it is about. Stamp it ` +
        `with ${fix}.`,
    );
    return null;
  }
  // A newer writer may have added fields this build knows nothing about. The
  // six it does know keep their meaning, so reading it is safe; saying so is
  // still worth a line, because an unexplained row is worse than a warned one.
  if (meta.kc !== undefined && meta.kc > KC_SCHEMA) {
    notes.push(
      `${where} carries tldrawkc metadata version ${meta.kc}, newer than the ${KC_SCHEMA} ` +
        `this build reads. The fields it knows were used; anything that version added was not.`,
    );
  }

  const topicSlug = meta.topic?.trim();
  if (topicSlug === undefined || topicSlug === "") {
    problems.add(`${where} names no topic in its tldrawkc metadata. Stamp it with ${fix}.`);
    return null;
  }
  if (!vocabulary.bySlug.has(topicSlug)) {
    problems.add(
      `${where} names topic "${topicSlug}", which is not in ${VOCABULARY_FILE}. Add the ` +
        `topic there, or restamp the diagram with a slug that exists.`,
    );
    return null;
  }

  const concepts: string[] = [];
  for (const raw of meta.concepts ?? []) {
    const slug = raw.trim();
    if (slug === "") continue;
    if (!known.has(slug)) {
      problems.add(
        `${where} names concept "${slug}", which has no note under learn/concepts/. ` +
          `Write the note, or restamp the diagram.`,
      );
      continue;
    }
    if (concepts.includes(slug)) continue;
    concepts.push(slug);
    // The vocabulary already says which topic a concept sits under. Two
    // answers that differ is not fatal here, because a diagram may reasonably
    // touch a concept filed elsewhere, but it is the kind of thing that turns
    // out to be a typo.
    const under = vocabulary.byConcept.get(slug);
    if (under !== undefined && under !== topicSlug) {
      notes.push(
        `${where} is filed under "${topicSlug}" but names concept "${slug}", which ` +
          `${VOCABULARY_FILE} puts under "${under}".`,
      );
    }
  }

  const title = meta.title?.trim();
  return { topicSlug, concepts, title: title === undefined || title === "" ? null : title };
}
