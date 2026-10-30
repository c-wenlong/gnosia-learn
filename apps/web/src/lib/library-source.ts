import type { AssetConversation, AssetParents, AssetPlace } from "@gnosia/catalog/state";

import { assignLayers, type GraphEdge } from "@gnosia/tutor/concept-graph";
import { conversationTitle } from "@/lib/conversation-title";
import type { MasteryBucket } from "@gnosia/tutor/mastery-bucket";

/**
 * The second line of a Library row: where the asset came from (L3 of
 * docs/proposals/library-by-type-and-day.md).
 *
 * Manus's row names the one task a file came out of. Ours can have several
 * parents, so the order is fixed here, once, and the row draws what it is
 * handed:
 *
 * 1. the course and module ("CS3230 · Week 3: Proof of correctness"), and
 *    the concept after it when there is one too;
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
  /** "CS3230 · Week 3: Proof of correctness", when a course holds the asset. */
  place?: string;
  /** The concept, after the place when both are set. */
  concept?: SourceConcept;
  /** A conversation's or a session's title, when neither of the above is set. */
  origin?: { kind: "conversation" | "session"; title: string };
}

/**
 * "CS3230 · Week 3: Proof of correctness", "CS3230" for an asset on the course
 * itself, the course title when it has no code. The module's whole title, as
 * the course page and the sidebar print it: the row truncates the line, and
 * its tooltip carries what the ellipsis hides.
 */
export function placeLabel(place: AssetPlace): string {
  const course = courseCode(place);
  return place.moduleTitle === null ? course : `${course} · ${place.moduleTitle.trim()}`;
}

/**
 * Whether the concept a row names is the row's own title, case and spacing
 * aside: a note explains its own concept, so the line would repeat the title
 * word for word, and the card and the row show the mastery in its place.
 */
export function conceptIsTitle(concept: { title: string } | undefined, title: string): boolean {
  return concept !== undefined && concept.title.trim().toLowerCase() === title.trim().toLowerCase();
}

/**
 * What a place's course is called and sorted by: its code, trimmed, or its
 * title when it has none. One rule for the row's line, its menu and the
 * course headings (`@/lib/library-groups`), which computed it two ways.
 */
export function courseCode(place: Pick<AssetPlace, "code" | "courseTitle">): string {
  return place.code?.trim() || place.courseTitle;
}

const byCode = (a: AssetPlace, b: AssetPlace): number => {
  const ac = courseCode(a);
  const bc = courseCode(b);
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
 * menu's Open the concept and the group by topic all take, so the three
 * name the same concept first.
 */
export function orderedConcepts(slugs: readonly string[], order: ReadonlyMap<string, number>): string[] {
  const rank = (slug: string) => order.get(slug) ?? Number.MAX_SAFE_INTEGER;
  return [...slugs].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The one conversation an asset is located in: the one whose studio job wrote
 * it most recently (`assetParents` lists them that way). The row menu's
 * Locate in conversation, the previewer's Conversation link, the source line
 * and the group by conversation all take this one, so an asset two
 * conversations touched is shown once and points one way.
 */
export function latestConversation(parents: AssetParents | undefined): AssetConversation | null {
  return parents?.conversations[0] ?? null;
}

/**
 * A conversation's name as every page shows it (`conversationTitle`, the rule
 * from #395): the name the owner gave it, else the planner's title. The
 * catalog's row has no first message, so a conversation with neither reads
 * "Studio conversation".
 */
export function conversationLabel(conversation: Pick<AssetConversation, "name" | "title">): string {
  return conversationTitle({ name: conversation.name, title: conversation.title })?.text ?? "Studio conversation";
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
    /**
     * True when the page groups by course: the row's heading and section
     * already name the place, the same one `pickPlace` picks here
     * (`courseGroups` calls it with the same course), so the line leaves it
     * out and says what else it knows, the concept first.
     */
    placeInHeading?: boolean;
  },
): RowSource | null {
  if (parents === undefined) return null;
  const place = options.placeInHeading === true ? null : pickPlace(parents.places, options.course);

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
  const conversation = latestConversation(parents);
  if (conversation !== null) {
    return { origin: { kind: "conversation", title: conversationLabel(conversation) } };
  }
  const session = parents.sessions[0];
  if (session !== undefined) {
    return { origin: { kind: "session", title: session.title?.trim() || "Tutor session" } };
  }
  return null;
}
