import { createHash } from "node:crypto";

import { concept, conceptPrerequisite, LOCAL_LEARNER_ID } from "@self-learn/schema";
import { and, asc, eq, inArray, isNull, max } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { parseFrontmatter, strayFrontmatterLines } from "../index/frontmatter";
import { assertRenderable, notePath, readNote, renderNote, type NoteFields } from "./notes";
import { POSITION_STEP } from "./positions";
import { ownedBy, type Owners, CLI_OWNER, cliScope } from "./scope";
import { latestRevisions } from "./revisions";
import { writeContents } from "./write";
import { bytewise } from "../sql-order";

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
 * `owners` scopes it (phase 4): another owner's note is absent, as a slug
 * nobody holds is, and so is a `requires:` or `assumes:` entry naming one.
 * Omitted, every owner's notes are read, with every edge (the export).
 */
export async function readNoteRows(
  db: CatalogDatabase,
  slugs?: readonly string[],
  owners?: Owners,
): Promise<NoteRow[]> {
  if (slugs !== undefined && slugs.length === 0) return [];
  const live = and(isNull(concept.archivedAt), ownedBy(concept.ownerId, owners));
  const rows = await db
    .select()
    .from(concept)
    .where(slugs === undefined ? live : and(live, inArray(concept.slug, [...new Set(slugs)])));
  if (rows.length === 0) return [];
  // Scoped, an edge is kept only when its far end is readable too, as
  // `readableEdges` keeps the graph's: a note's `requires:` naming another
  // owner's concept would put that slug on the page, in the tutor's prompt
  // and behind `/api/concepts/<slug>`. Unscoped (the export), every edge.
  const readableFarEnd =
    owners === undefined
      ? undefined
      : inArray(
          conceptPrerequisite.prerequisiteSlug,
          db.select({ slug: concept.slug }).from(concept).where(ownedBy(concept.ownerId, owners)),
        );
  const edges = await db
    .select()
    .from(conceptPrerequisite)
    .where(and(inArray(conceptPrerequisite.conceptSlug, rows.map((row) => row.slug)), readableFarEnd))
    .orderBy(asc(conceptPrerequisite.position), asc(bytewise(conceptPrerequisite.prerequisiteSlug)));
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
   * The revision the writer read the note at, in the same snapshot as the
   * fields it started from: a checkout's for a commit, the read's for a
   * one-shot command. A note that moved since is refused (edge case 16), so a
   * write landing between the read and this one is never overwritten. There
   * is no default: "whatever is latest now" is exactly the lost update.
   */
  base: number | null;
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
  /** sha256 of the note as that revision renders it, which is also its `note:` asset's `content_hash`. */
  hash: string;
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
  const hash = createHash("sha256").update(rendered).digest("hex");
  const assetId = `note:${path}`;
  const latestAsset = await latestRevisions(db, "asset", [assetId]);
  const by = {
    author: input.author ?? LOCAL_LEARNER_ID,
    authorKind: "person" as const,
    reason: input.reason,
    sessionId: input.sessionId,
  };
  const [written] = await writeContents(db, [
    {
      owner: CLI_OWNER,
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
      base: input.base,
      ...by,
    },
    {
      owner: CLI_OWNER,
      type: "asset",
      id: assetId,
      next: {
        row: {
          id: assetId,
          kind: "note",
          path,
          url: null,
          contentHash: hash,
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
  return { path, revision: written.revisionId, changed: written.changed, hash };
}

/**
 * `requires:` then `assumes:` as `concept_prerequisite` rows, checked against
 * live concepts the CLI's owner may read: another owner's concept is "not a
 * concept" here, as it is on every page that owner's reader sees (phase 4).
 */
async function prerequisiteRows(db: CatalogDatabase, fields: NoteFields): Promise<Record<string, unknown>[]> {
  const named = [...new Set([...fields.requires, ...fields.assumes])];
  const live = new Set(
    named.length === 0
      ? []
      : (
          await db
            .select({ slug: concept.slug })
            .from(concept)
            .where(and(inArray(concept.slug, named), isNull(concept.archivedAt), ownedBy(concept.ownerId, cliScope().readable)))
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
  owners?: Owners,
): Promise<{ text: string; revision: number | null; path: string } | null> {
  // One snapshot for the note and its revision: read apart, a write landing
  // between them would pair old text with the new revision, and a commit of
  // that copy would pass the base check and overwrite the write.
  return db.transaction(
    async (tx) => {
      const [row] = await readNoteRows(tx, [slug], owners);
      if (row === undefined) return null;
      if (row.body === null) {
        throw new NoteWriteError(`concept "${slug}" has no body in the database; re-run \`catalog import\` before the flip`);
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
  options: { base: number | null; reason: string; sessionId?: string; where?: string },
): Promise<NoteWritten> {
  assertFrontmatter(text, options.where ?? `the text of "${slug}"`);
  const fields = readNote(text, slug, slug);
  if (fields.slug !== slug) {
    throw new NoteWriteError(`the checkout of "${slug}" now says id: ${fields.slug}; a note cannot be renamed by editing it`);
  }
  return writeNoteRow(db, { fields, base: options.base, reason: options.reason, sessionId: options.sessionId });
}

/**
 * Refuse a whole-note text whose frontmatter did not parse, before anything
 * is read from it. `readNote` treats a note with no frontmatter as a body
 * alone, which is right for a file nobody has stamped yet and wrong for an
 * edit: a damaged `---` fence would be committed as a note whose title is its
 * id, with no summary, tags, prerequisites or `created`, and the old values
 * would survive only as a revision. Every note the database renders carries
 * `id:`, so text without one is not a note that came out of it. And a block
 * holding a line that is no `key:` and no `- item` (a heading, a paragraph) is
 * a closing fence that broke, with the block run on to a later `---` in the
 * body: everything before that line would be dropped from the body.
 */
export function assertFrontmatter(text: string, where: string): void {
  const { data } = parseFrontmatter(text);
  if (Object.keys(data).length === 0) {
    throw new NoteWriteError(
      `${where} has no frontmatter that parses (is its opening or closing --- line damaged?), so its title, ` +
        `tags, prerequisites and created date would all be dropped. Nothing was written; restore the frontmatter ` +
        `and commit again.`,
    );
  }
  const stray = strayFrontmatterLines(text);
  const prose = stray.filter((line) => !line.trim().startsWith("#"));
  if (prose.length > 0) {
    throw new NoteWriteError(
      `${where} has a frontmatter block holding ${JSON.stringify(prose[0])}, which is not a key: line: its closing --- ` +
        `is probably damaged, and the block runs on to a later --- in the body, which would be dropped. Nothing was ` +
        `written; repair the closing --- and commit again.`,
    );
  }
  // A `#` line the parser skips as a comment. Named for what it is rather
  // than as a damaged fence, and still refused: the row has no place for a
  // comment, so the database would drop it, the same reason an unknown key is
  // refused. And a run-on block of nothing but headings would look the same.
  if (stray.length > 0) {
    throw new NoteWriteError(
      `${where} has ${JSON.stringify(stray[0])} in its frontmatter. A comment there has no column in the database and ` +
        `would be dropped (and a # heading there means the closing --- is damaged). Nothing was written; move it ` +
        `into the body and commit again.`,
    );
  }
  const id = data["id"];
  if (id === undefined || id === null || String(id).trim() === "") {
    throw new NoteWriteError(`${where} has frontmatter with no id:. Nothing was written; put back the id: line and commit again.`);
  }
}
