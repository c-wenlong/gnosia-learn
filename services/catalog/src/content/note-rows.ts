import { concept, conceptPrerequisite } from "@self-learn/schema";
import { and, asc, inArray, isNull } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import type { NoteFields } from "./notes";

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
