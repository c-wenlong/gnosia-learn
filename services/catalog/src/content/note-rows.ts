import { createHash } from "node:crypto";

import { concept, conceptPrerequisite, LOCAL_LEARNER_ID } from "@self-learn/schema";
import { and, asc, eq, inArray, isNull, max } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { assertRenderable, notePath, readNote, renderNote, type NoteFields } from "./notes";
import { POSITION_STEP } from "./positions";
import { latestRevisions } from "./revisions";
import { writeContents } from "./write";

/**
 * Concept notes read from their rows: the columns, and `requires:` and
 * `assumes:` from `concept_prerequisite` in the order the note listed them.
 * The export, the database reader behind `/learn/<slug>` and the `learn`
 * CLI's reads once the database owns concepts all come through here.
 */

export interface NoteRow extends Omit<NoteFields, "body"> {
  /** Repo-relative, `learn/concepts/<domain>/<file>.md`, a logical name after the flip (D11). */
  path: string;
  domain: string | null;
  /** Null for a row imported before Track C stored the body. */
  body: string | null;
  topicSlug: string | null;
  topicPosition: number;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/**
 * Live notes (archived ones are left out, as a reader hides them), all of
 * them or the slugs named, sorted by path, the order an export writes them in.
 */
export async function readNoteRows(db: CatalogDatabase, slugs?: readonly string[]): Promise<NoteRow[]> {
  if (slugs !== undefined && slugs.length === 0) return [];
  const live = isNull(concept.archivedAt);
  const rows = await db
    .select()
    .from(concept)
    .where(slugs === undefined ? live : and(live, inArray(concept.slug, [...new Set(slugs)])));
  if (rows.length === 0) return [];
  const edges = await db
    .select()
    .from(conceptPrerequisite)
    .where(inArray(conceptPrerequisite.conceptSlug, rows.map((row) => row.slug)))
    .orderBy(asc(conceptPrerequisite.position), asc(conceptPrerequisite.prerequisiteSlug));
  const lists = new Map<string, { requires: string[]; assumes: string[] }>();
  for (const edge of edges) {
    const entry = lists.get(edge.conceptSlug) ?? { requires: [], assumes: [] };
    (edge.kind === "assumes" ? entry.assumes : entry.requires).push(edge.prerequisiteSlug);
    lists.set(edge.conceptSlug, entry);
  }
  return rows
    .map((row) => ({
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      requires: lists.get(row.slug)?.requires ?? [],
      assumes: lists.get(row.slug)?.assumes ?? [],
      tags: strings(row.tags),
      sources: strings(row.sources),
      created: row.authoredAt,
      body: row.body,
      path: row.path,
      domain: row.domain,
      topicSlug: row.topicSlug,
      topicPosition: row.topicPosition,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** A write the notes writer refuses: the sentence is for the person who ran it. */
export class NoteWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoteWriteError";
  }
}

export interface NoteWrite {
  fields: NoteFields;
  /** The folder a new note is filed under. An existing note stays where it is; a different folder is refused. */
  domain?: string | null;
  /** The topic a new note is filed under. An existing note keeps its own; a different one is refused. */
  topicSlug?: string;
  /**
   * The revision the writer started from: a checkout's, for a commit that
   * must refuse a moved base (edge case 16). Left out, the write is based on
   * whatever is latest, which is what a one-shot command means.
   */
  base?: number | null;
  reason: string;
  author?: string;
  /** The tutoring session that made the write, for its provenance. */
  sessionId?: string;
}

export interface NoteWritten {
  path: string;
  /** The concept's latest revision after the write. */
  revision: number;
  changed: boolean;
}

/** The latest revision of a concept, or null when it has none. */
export async function noteRevision(db: CatalogDatabase, slug: string): Promise<number | null> {
  return (await latestRevisions(db, "concept", [slug])).get(slug)?.id ?? null;
}

/**
 * Write a note as rows, through the seam: the concept with its prerequisites,
 * and its `note:` asset with the links the concepts indexer would give it,
 * in one transaction (`writeContents`), so the note and the asset `/library`
 * finds it by cannot disagree.
 *
 * What a file write could do and this refuses, by name:
 *
 * - a new note with no topic or no folder: `concept.topic_slug` is the
 *   concept's place in the vocabulary, and a note nobody filed is one the
 *   indexer never read either;
 * - moving a note to another folder or topic: the asset's id is its path
 *   (`note:learn/concepts/<domain>/...`), and the seam has no way yet to
 *   retire the old one, so a move would leave it behind;
 * - writing an archived concept, which a restore brings back first;
 * - a prerequisite that is not a live concept, or the note itself.
 */
export async function writeNoteRow(db: CatalogDatabase, input: NoteWrite): Promise<NoteWritten> {
  const fields: NoteFields = { ...input.fields, body: input.fields.body.replace(/^\n+/, "") };
  const slug = fields.slug;
  const [existing] = await db.select().from(concept).where(eq(concept.slug, slug)).limit(1);
  if (existing?.archivedAt !== null && existing?.archivedAt !== undefined) {
    throw new NoteWriteError(`concept "${slug}" is archived; restore it before writing its note`);
  }

  const domain = existing?.domain ?? input.domain ?? null;
  if (existing !== undefined && input.domain !== undefined && (input.domain ?? null) !== existing.domain) {
    throw new NoteWriteError(
      `"${slug}" is filed under ${existing.domain ?? "no folder"}, and moving a note to another folder is not ` +
        `supported once the database owns the notes: its asset id is its path, and nothing can retire the old one yet.`,
    );
  }
  if (domain === null || domain === "") {
    throw new NoteWriteError(`a new note needs a folder to be filed under: pass --domain (e.g. algorithms)`);
  }
  const topicSlug = existing?.topicSlug ?? input.topicSlug ?? null;
  if (existing?.topicSlug !== undefined && existing.topicSlug !== null && input.topicSlug !== undefined && input.topicSlug !== existing.topicSlug) {
    throw new NoteWriteError(`"${slug}" is filed under topic "${existing.topicSlug}", not "${input.topicSlug}"`);
  }
  if (topicSlug === null) {
    throw new NoteWriteError(
      `a new note needs a topic: pass --topic <slug> (pick one with: npm run --silent catalog -- search <term> --json)`,
    );
  }
  let topicPosition = existing?.topicPosition;
  if (topicPosition === undefined) {
    const [row] = await db
      .select({ last: max(concept.topicPosition) })
      .from(concept)
      .where(and(eq(concept.topicSlug, topicSlug), isNull(concept.archivedAt)));
    // One step past the end of the topic's list (D22), so no other concept moves.
    topicPosition = (row?.last ?? 0) + POSITION_STEP;
  }

  assertRenderable(fields, slug);
  const prerequisites = await prerequisiteRows(db, fields);
  const path = existing?.path ?? notePath(domain, slug);

  const rendered = Buffer.from(renderNote(fields), "utf8");
  const assetId = `note:${path}`;
  const latest = await latestRevisions(db, "concept", [slug]);
  const latestAsset = await latestRevisions(db, "asset", [assetId]);
  const by = {
    author: input.author ?? LOCAL_LEARNER_ID,
    authorKind: "person" as const,
    reason: input.reason,
    sessionId: input.sessionId,
  };
  const [written] = await writeContents(db, [
    {
      type: "concept",
      id: slug,
      next: {
        row: {
          slug,
          title: fields.title,
          summary: fields.summary,
          topicSlug,
          path,
          domain,
          body: fields.body,
          tags: fields.tags,
          sources: fields.sources,
          authoredAt: fields.created,
          topicPosition,
          ownerId: existing?.ownerId ?? LOCAL_LEARNER_ID,
        },
        links: { concept_prerequisite: prerequisites },
      },
      base: input.base !== undefined ? input.base : (latest.get(slug)?.id ?? null),
      ...by,
    },
    {
      type: "asset",
      id: assetId,
      next: {
        row: {
          id: assetId,
          kind: "note",
          path,
          url: null,
          contentHash: createHash("sha256").update(rendered).digest("hex"),
          bytes: rendered.length,
          title: fields.title,
          sourceRepo: "self-learn",
        },
        links: { asset_concept: [{ conceptSlug: slug }], asset_topic: [{ topicSlug }] },
      },
      base: latestAsset.get(assetId)?.id ?? null,
      ...by,
    },
  ]);
  if (written === undefined) throw new Error(`concept "${slug}" was not written`);
  return { path, revision: written.revisionId, changed: written.changed };
}

/** `requires:` then `assumes:` as `concept_prerequisite` rows, checked against live concepts. */
async function prerequisiteRows(db: CatalogDatabase, fields: NoteFields): Promise<Record<string, unknown>[]> {
  const named = [...new Set([...fields.requires, ...fields.assumes])];
  const live = new Set(
    named.length === 0
      ? []
      : (
          await db
            .select({ slug: concept.slug })
            .from(concept)
            .where(and(inArray(concept.slug, named), isNull(concept.archivedAt)))
        ).map((row) => row.slug),
  );
  const problems: string[] = [];
  const rows: Record<string, unknown>[] = [];
  for (const kind of ["requires", "assumes"] as const) {
    const seen = new Set<string>();
    for (const target of fields[kind]) {
      if (seen.has(target)) continue;
      seen.add(target);
      if (target === fields.slug) problems.push(`${kind}: itself`);
      else if (!live.has(target)) problems.push(`${kind}: "${target}", which is not a concept`);
      else rows.push({ prerequisiteSlug: target, kind, position: seen.size });
    }
  }
  if (problems.length > 0) throw new NoteWriteError(`${fields.slug}: ${problems.join("; ")}`);
  return rows;
}

/**
 * A note as a checkout hands it out: the file its row renders, and the
 * revision it is based on. With `commitNoteText`, the pair a person or a
 * session edits a note through once the database owns the notes (D15), and
 * the pair phase 2's `learn vault pull|push` is meant to reuse for a whole
 * folder of notes: pull is this for every note, push is the commit for each
 * changed file, with the same moved-base refusal.
 */
export async function noteText(
  db: CatalogDatabase,
  slug: string,
): Promise<{ text: string; revision: number | null; path: string } | null> {
  // One snapshot for the note and its revision: read apart, a write landing
  // between them would pair old text with the new revision, and a commit of
  // that copy would pass the base check and overwrite the write.
  return db.transaction(
    async (tx) => {
      const [row] = await readNoteRows(tx, [slug]);
      if (row === undefined) return null;
      if (row.body === null) {
        throw new NoteWriteError(`concept "${slug}" has no body in the database; re-run \`catalog index\` before the flip`);
      }
      return { text: renderNote({ ...row, body: row.body }), revision: await noteRevision(tx, slug), path: row.path };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/**
 * Write back a whole note, frontmatter and body, as a person edited it. The
 * id inside must still be `slug`: a rename is its own operation. `base` is
 * the revision the text was checked out at, and a note that moved since is
 * refused by the seam, with both revisions named, rather than merged.
 */
export async function commitNoteText(
  db: CatalogDatabase,
  slug: string,
  text: string,
  options: { base: number | null; reason: string; sessionId?: string },
): Promise<NoteWritten> {
  const fields = readNote(text, slug, slug);
  if (fields.slug !== slug) {
    throw new NoteWriteError(`the checkout of "${slug}" now says id: ${fields.slug}; a note cannot be renamed by editing it`);
  }
  return writeNoteRow(db, { fields, base: options.base, reason: options.reason, sessionId: options.sessionId });
}
