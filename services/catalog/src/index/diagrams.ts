import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { key as blobKey } from "@gnosia/blob";
import {
  LOCAL_LEARNER_ID,
  type NewAsset,
  type NewAssetConcept,
  type NewAssetDerivation,
  type NewAssetTopic,
  type NewDiagram,
} from "@gnosia/schema";

import { DIAGRAM_SLUG, documentBytes, documentProblem, sha256 } from "../content/diagram-document";

import { IndexErrors } from "./errors";
import { fileFacts, type FileFacts, filesIn, relativeTo } from "./files";
import { ASSET_PREFIX, type Indexer, type SourceBlob, type SourceRows } from "./source";
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
 * **Since Track D the document is a row and the SVG is a blob.** Each
 * `.tldr` becomes a `diagram` row holding the parsed document (D6), and each
 * SVG is handed back as a `SourceBlob` for the runner to store before the rows
 * are written, with its asset row naming the key. The asset ids and paths are
 * unchanged, as logical names (D11). A `.tldr` asset's hash is of the
 * document's canonical bytes, the form the export writes, rather than of the
 * file's own key order (`content/diagram-document.ts`).
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
 * One diagram file as an `asset` row, as the import writes it. `catalog
 * diagram put` builds the same row from a document it was handed
 * (`content/diagrams.ts`), and `test/diagrams.test.ts` holds an imported
 * diagram and a put one to the same listing.
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
    sourceRepo: "gnosia",
  };
}

export const diagramsIndexer: Indexer = {
  source: "diagrams",
  owns: ["diagram"],
  assetPrefix: ASSET_PREFIX.diagrams,
  root: () => ASSETS_DIR,

  read: async ({ repoRoot, toolsRoot, knownConcepts, knownDiagrams, vocabulary, owner = LOCAL_LEARNER_ID }) => {
    const directory = path.join(repoRoot, ASSETS_DIR);
    // A tree with no `learn/assets/` has no diagrams. `tldrawkc list` calls a
    // missing directory an error, so it is not asked; the parser says empty.
    const listing = existsSync(directory)
      ? await listDiagrams(toolsRoot ?? repoRoot, directory)
      : { via: "json" as const, diagrams: [], errors: [] };
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
    /** Stem to the document it holds, parsed, with its hash. */
    const documents = new Map<string, { document: Record<string, unknown>; hash: string; bytes: number }>();

    for (const entry of listing.diagrams) {
      const stem = path.basename(entry.path, ".tldr");
      const where = relativeTo(repoRoot, entry.path);
      // The stem is the diagram's slug and the name every embed resolves, so
      // it follows the slug rule the `diagram` table checks.
      if (!DIAGRAM_SLUG.test(stem)) {
        problems.add(
          `${where}: "${stem}" is not a diagram slug (lowercase words joined by hyphens). ` +
            `Rename the file and its SVG.`,
        );
        continue;
      }
      const subject = resolveSubject(entry.meta, where, concepts, vocabulary, problems, notes);
      if (subject === null) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readFile(entry.path, "utf8"));
      } catch (error) {
        problems.add(`${where} could not be read as a tldraw document: ${(error as Error).message}`);
        continue;
      }
      const problem = documentProblem(parsed);
      if (problem !== null) {
        problems.add(`${where} is not a tldraw document: ${problem}`);
        continue;
      }
      const bytes = documentBytes(parsed);
      subjects.set(stem, subject);
      documents.set(stem, { document: parsed as Record<string, unknown>, hash: sha256(bytes), bytes: bytes.length });
    }

    const assets: NewAsset[] = [];
    const assetConcepts: NewAssetConcept[] = [];
    const assetTopics: NewAssetTopic[] = [];
    const derivations: NewAssetDerivation[] = [];
    const blobs: SourceBlob[] = [];
    /** Stem to the key its SVG is stored under. */
    const svgKeys = new Map<string, string>();
    let stamped = 0;
    let legacy = 0;

    for (const file of files) {
      const extension = path.extname(file) as keyof typeof KINDS;
      const stem = path.basename(file, extension);
      const where = relativeTo(repoRoot, file);
      const id = `${ASSET_PREFIX.diagrams}${where}`;
      const subject = subjects.get(stem);

      if (extension === ".tldr") {
        const stored = documents.get(stem);
        // A document that was refused above has its reason recorded already.
        if (stored === undefined || subject === undefined) continue;
        // The document's bytes are its canonical form, which is what the
        // export writes back, so the row's hash is of those and not of the
        // file's own key order (`content/diagram-document.ts`).
        assets.push(diagramAsset(where, extension, { contentHash: stored.hash, bytes: stored.bytes }, subject.title));
        stamped += 1;
      } else {
        const facts = await fileFacts(file);
        const key = blobKey(owner, facts.contentHash, "svg");
        blobs.push({
          file,
          ownerId: owner,
          mime: "image/svg+xml",
          ext: "svg",
          sha256: facts.contentHash,
          bytes: facts.bytes,
        });
        svgKeys.set(stem, key);
        assets.push({ ...diagramAsset(where, extension, facts, subject?.title ?? null), blobKey: key });
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

    // The `diagram` row: the document itself, and its SVG. A file cannot say
    // which document an SVG was exported from. The database can: an SVG whose
    // bytes are the ones it already stores keeps the export record it has, so
    // one a put left stale stays stale; any other SVG on disk is taken as
    // exported from the document beside it, the only claim the layout makes.
    const known = await knownDiagrams();
    const diagrams: NewDiagram[] = [];
    for (const [stem, stored] of documents) {
      const subject = subjects.get(stem) as Subject;
      const svgKey = svgKeys.get(stem) ?? null;
      const before = known.get(stem);
      const exportedFrom =
        svgKey !== null && before?.svgBlobKey === svgKey && before.svgDocumentHash !== null
          ? before.svgDocumentHash
          : stored.hash;
      diagrams.push({
        slug: stem,
        ownerId: owner,
        title: subject.title,
        topicSlug: subject.topicSlug,
        document: stored.document,
        documentHash: stored.hash,
        svgBlobKey: svgKey,
        svgDocumentHash: svgKey === null ? null : exportedFrom,
        archivedAt: null,
      });
      if (svgKey !== null) {
        derivations.push({
          assetId: `${ASSET_PREFIX.diagrams}${ASSETS_DIR}/${stem}.svg`,
          sourceAssetId: `${ASSET_PREFIX.diagrams}${ASSETS_DIR}/${stem}.tldr`,
        });
      }
    }

    problems.throwIfAny(`${ASSETS_DIR} (read by ${listing.via})`);

    const rows: SourceRows = {
      asset: assets,
      diagram: diagrams,
      assetTopic: assetTopics,
      assetConcept: assetConcepts,
      assetDerivation: derivations,
    };
    notes.unshift(
      `${assets.length} diagram files read by ${listing.via}, ${stamped} stamped .tldr, ` +
        `${derivations.length} exported SVG, ${legacy} legacy SVG with no source`,
    );
    return { rows, notes, blobs };
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
