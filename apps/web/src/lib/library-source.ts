import type { AssetParents, AssetPlace } from "@self-learn/catalog/state";

import { assignLayers, type GraphEdge } from "@/lib/concept-graph";
import type { MasteryBucket } from "@/lib/mastery-bucket";

/**
 * The second line of a Library row: where the asset came from (L3 of
 * docs/proposals/library-by-type-and-day.md).
 *
 * Manus's row names the one task a file came out of. Ours can have several
 * parents, so the order is fixed here, once, and the row draws what it is
 * handed:
 *
 * 1. the course and module ("CS3230 · Week 3"), and the concept after it
 *    when there is one too ("CS3230 · Week 3 · Master theorem");
 * 2. else the concept alone, with its mastery dot;
 * 3. else the studio conversation it was drawn or rendered in;
 * 4. else the tutor session it is the log of.
 *
 * Two places: the course the open `?course=` filter names, else the first by
 * code, a module listing the asset by id ahead of one whose topic it is filed
 * under. Two concepts: the first in the prerequisite graph's order, with
 * "+1". The parents come from one query for the page (`assetParents`); this
 * part is pure, so the precedence has a golden test.
 */

/** A concept as the line shows it: its title, its mastery and how many more there are. */
export interface SourceConcept {
  title: string;
  bucket: MasteryBucket;
  more: number;
}

export interface RowSource {
  /** "CS3230 · Week 3", when a course holds the asset. */
  place?: string;
  /** The concept, after the place when both are set. */
  concept?: SourceConcept;
  /** A conversation's or a session's title, when neither of the above is set. */
  origin?: { kind: "conversation" | "session"; title: string };
}

/**
 * A module's title as the line names it: the part before a colon, which is
 * how the course files number their weeks ("Week 3: Divide and conquer" is
 * "Week 3"), or the whole title when there is no colon to cut at.
 */
export function moduleShortTitle(title: string): string {
  const at = title.indexOf(":");
  const head = at > 0 ? title.slice(0, at).trim() : "";
  return head === "" ? title.trim() : head;
}

/** "CS3230 · Week 3", "CS3230" for an asset on the course itself, the course title when it has no code. */
export function placeLabel(place: AssetPlace): string {
  const course = place.code?.trim() || place.courseTitle;
  return place.moduleTitle === null ? course : `${course} · ${moduleShortTitle(place.moduleTitle)}`;
}

const byCode = (a: AssetPlace, b: AssetPlace): number => {
  const ac = a.code ?? a.courseTitle;
  const bc = b.code ?? b.courseTitle;
  if (ac !== bc) return ac < bc ? -1 : 1;
  return a.position - b.position;
};

/**
 * The one place a row names. The filter's course wins wherever it is found,
 * since the reader is looking at that course; otherwise the module listings
 * (`item`), and only without one the topic matches, each first by code.
 */
export function pickPlace(places: readonly AssetPlace[], course: string | null): AssetPlace | null {
  const ordered = [...places].sort((a, b) => (a.via === b.via ? byCode(a, b) : a.via === "item" ? -1 : 1));
  if (course !== null) {
    const chosen = ordered.find((p) => p.course === course);
    if (chosen !== undefined) return chosen;
  }
  return ordered[0] ?? null;
}

/**
 * Every concept's place in the prerequisite graph: its layer (a concept sits
 * one below its deepest prerequisite, `assignLayers`), then its slug, as one
 * rank number. Both kinds of edge order it, since a background concept still
 * comes first. Built once per page and handed to `rowSource`.
 */
export function conceptOrder(concepts: readonly { id: string; requires: readonly string[]; assumes: readonly string[] }[]): Map<string, number> {
  const edges: GraphEdge[] = concepts.flatMap((c) =>
    [...c.requires, ...c.assumes].map((from) => ({ from, to: c.id, kind: "requires" as const })),
  );
  const layer = assignLayers(concepts, edges);
  const ranked = [...concepts].sort(
    (a, b) => (layer.get(a.id) ?? 0) - (layer.get(b.id) ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return new Map(ranked.map((c, i) => [c.id, i]));
}

/**
 * Concept slugs in the prerequisite graph's order (`conceptOrder`), a slug
 * the graph does not hold last, by slug. The order the source line, the row
 * menu's Open the concept and the group by concept all take, so the three
 * name the same concept first.
 */
export function orderedConcepts(slugs: readonly string[], order: ReadonlyMap<string, number>): string[] {
  const rank = (slug: string) => order.get(slug) ?? Number.MAX_SAFE_INTEGER;
  return [...slugs].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * What the row's second line says, or null when the asset has no parent at
 * all (the page then names its topic, as the card does).
 */
export function rowSource(
  parents: AssetParents | undefined,
  options: {
    /** The open `?course=` filter. */
    course: string | null;
    /** `conceptOrder` of the knowledge base; a concept it does not hold sorts last, by slug. */
    order: ReadonlyMap<string, number>;
    /** The concept's title and mastery; null when the knowledge base does not hold it. */
    concept: (slug: string) => { title: string; bucket: MasteryBucket } | null;
  },
): RowSource | null {
  if (parents === undefined) return null;
  const place = pickPlace(parents.places, options.course);

  const slugs = orderedConcepts(parents.concepts, options.order);
  const first = slugs[0];
  const known = first === undefined ? null : options.concept(first);
  const concept: SourceConcept | undefined =
    first === undefined
      ? undefined
      : { title: known?.title ?? first, bucket: known?.bucket ?? "untouched", more: slugs.length - 1 };

  if (place !== null || concept !== undefined) {
    return { ...(place === null ? {} : { place: placeLabel(place) }), ...(concept === undefined ? {} : { concept }) };
  }
  const conversation = parents.conversations[0];
  if (conversation !== undefined) {
    return { origin: { kind: "conversation", title: conversation.title?.trim() || "Studio conversation" } };
  }
  const session = parents.sessions[0];
  if (session !== undefined) {
    return { origin: { kind: "session", title: session.title?.trim() || "Tutor session" } };
  }
  return null;
}
