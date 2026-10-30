import type { MasteryLabel } from "@gnosia/catalog/state";

import { bucketOf, MASTERY_BUCKET_LABEL, type MasteryBucket } from "@gnosia/tutor/mastery-bucket";
import { ownValue } from "@gnosia/tutor/own-key";
import type { Course } from "@gnosia/tutor/types";

/**
 * The course page's arithmetic: which mark each topic and module carries,
 * which topic is the one to do next, which modules are locked, and which
 * module `/courses/[slug]` opens on.
 *
 * Pure and React-free, so the server page, the client path and a test can all
 * call it. `import type` only from the catalog, the same as
 * `@/lib/mastery-bucket`, so nothing from the database layer reaches the
 * browser bundle.
 *
 * **Where a topic's concepts come from.** A course topic (`cp4284-m1-t1`) is
 * not a topic row: a topic's `maps.courses` names
 * modules, not topics, so it can say which concepts a module is about but not
 * which of the module's topics each one belongs to. The per-topic link is the
 * course row's own `concepts:` list, which `catalog index` writes into
 * `concept_curriculum_item` with the list's order as `position`, and
 * `readKnowledgeBase` returns as `KbConcept.topics` and `KbConcept.positions`.
 * That list is the order the concepts are drawn and studied in. The module's
 * `maps.concepts` list is the tie-break for a concept the row has not placed,
 * and the Guidebook's fallback when no topic of the module has a concept of
 * its own.
 */

/** A concept as the path draws it: the slice of `KbConcept` it needs, plus its bucket. */
export interface PathConcept {
  slug: string;
  title: string;
  pL: number;
  mastery: MasteryLabel;
  observations: number;
  bucket: MasteryBucket;
}

/** The fields of `KbConcept` this module reads. */
export interface KbConceptLike {
  id: string;
  title: string;
  pL: number;
  mastery: MasteryLabel;
  observations: number;
  /** Curriculum item ids (course topic ids) whose `concepts:` list names the concept. */
  topics: readonly string[];
  /** The concept's 1-based place in each of those lists, keyed by item id. */
  positions?: Readonly<Record<string, number>>;
}

/** A topic's standing, from the concepts mapped to it. */
export interface TopicMastery {
  bucket: MasteryBucket;
  /** The weakest mapped concept's p(L): a topic is held only as well as its weakest part. */
  pL: number;
  /** The concept Continue opens. */
  next: string;
  /** Every mapped concept, in authored order. Never empty. */
  concepts: PathConcept[];
}

/**
 * The concepts this course topic's `concepts:` list names, in that list's
 * order.
 *
 * The order is the row's `position`. A concept the row has not placed (a link
 * indexed before positions existed reads as 0) goes after every placed one,
 * ranked by `authored`, the module topic's `maps.concepts` from its topic
 * row, and then by title, so nothing is ever unordered.
 */
export function conceptsForTopic(
  concepts: readonly KbConceptLike[],
  topicId: string,
  authored: readonly string[] = [],
): PathConcept[] {
  const rank = (slug: string) => {
    const at = authored.indexOf(slug);
    return at === -1 ? authored.length : at;
  };
  const placed = new Map<string, number>();
  for (const c of concepts) {
    const at = c.positions?.[topicId] ?? 0;
    placed.set(c.id, at > 0 ? at : Number.POSITIVE_INFINITY);
  }
  const position = (slug: string) => placed.get(slug) ?? Number.POSITIVE_INFINITY;
  return concepts
    .filter((c) => c.topics.includes(topicId))
    .map((c) => ({
      slug: c.id,
      title: c.title,
      pL: c.pL,
      mastery: c.mastery,
      observations: c.observations,
      bucket: bucketOf({ mastery: c.mastery, observations: c.observations }),
    }))
    .sort(
      (a, b) =>
        position(a.slug) - position(b.slug) ||
        rank(a.slug) - rank(b.slug) ||
        a.title.localeCompare(b.title),
    );
}

/**
 * Each curriculum item's concepts, in one pass over the knowledge base, so a
 * page resolving every item of every course hands `conceptsForTopic` only the
 * item's own concepts rather than scanning all of them per item.
 */
export function conceptsByItem<C extends Pick<KbConceptLike, "topics">>(concepts: readonly C[]): ReadonlyMap<string, C[]> {
  const byItem = new Map<string, C[]>();
  for (const c of concepts) {
    for (const item of new Set(c.topics)) {
      const list = byItem.get(item);
      if (list === undefined) byItem.set(item, [c]);
      else list.push(c);
    }
  }
  return byItem;
}

/** A share of done as a whole percent, 0 when there is nothing to do: one rounding for the path and the cards. */
export function percentOf(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/**
 * A topic's bucket, p(L) and next concept, or null when no concept is mapped.
 *
 * - **Bucket.** Mastered only when every mapped concept is; untouched only
 *   when none of them has been observed or mastered; learning otherwise. A
 *   topic with one mastered concept and one untouched is being learnt, which
 *   the bucket of the weakest concept alone (untouched) would hide.
 * - **p(L)** is the minimum across the mapped concepts.
 * - **Next** is the first unmastered concept on the knowledge base's
 *   frontier (its prerequisites are held, so it is teachable now), else the
 *   weakest unmastered one, else the weakest of all. Ties keep authored order.
 */
export function resolveTopicMastery(
  concepts: readonly PathConcept[],
  frontier: readonly string[] = [],
): TopicMastery | null {
  if (concepts.length === 0) return null;

  const buckets = concepts.map((c) => c.bucket);
  const bucket: MasteryBucket = buckets.every((b) => b === "mastered")
    ? "mastered"
    : buckets.every((b) => b === "untouched")
      ? "untouched"
      : "learning";

  const weakest = (list: readonly PathConcept[]) =>
    list.reduce((min, c) => (c.pL < min.pL ? c : min), list[0]!);
  const open = concepts.filter((c) => c.bucket !== "mastered");
  const onFrontier = frontier
    .map((slug) => open.find((c) => c.slug === slug))
    .find((c): c is PathConcept => c !== undefined);
  const next = onFrontier ?? (open.length > 0 ? weakest(open) : weakest(concepts));

  return { bucket, pL: weakest(concepts).pL, next: next.slug, concepts: [...concepts] };
}

/**
 * Done, for the path's purposes. A topic with concepts is done when it is
 * mastered: a tick in the old checklist does not teach anything, so it does
 * not move the path. A topic with none has nothing else to go on, so the tick
 * is the answer.
 */
export function topicDone(mastery: TopicMastery | null | undefined, ticked: boolean): boolean {
  return mastery ? mastery.bucket === "mastered" : ticked;
}

/**
 * The same rule, split so a screen that does not draw the path can apply it.
 *
 * The server knows mastery and the client owns the ticks (they change on an
 * optimistic tick or a course reset without a round trip), so the server sends
 * the two id sets and the client combines them with `state.completed`. Plain
 * arrays, because the sets travel in a page payload.
 */
export interface ItemStanding {
  /** Curriculum items whose concepts are all mastered. */
  mastered: readonly string[];
  /** Curriculum items with at least one concept, whose tick therefore says nothing. */
  withConcepts: readonly string[];
}

export const EMPTY_STANDING: ItemStanding = { mastered: [], withConcepts: [] };

export function itemStanding(
  concepts: readonly KbConceptLike[],
  itemIds: readonly string[],
): ItemStanding {
  const mastered: string[] = [];
  const withConcepts: string[] = [];
  const byItem = conceptsByItem(concepts);
  for (const id of itemIds) {
    const mastery = resolveTopicMastery(conceptsForTopic(byItem.get(id) ?? [], id));
    if (mastery === null) continue;
    withConcepts.push(id);
    if (mastery.bucket === "mastered") mastered.push(id);
  }
  return { mastered, withConcepts };
}

/** `topicDone` over a standing and the learner's ticks, as a predicate. */
export function itemDoneWith(
  standing: ItemStanding,
  completed: Readonly<Record<string, true>>,
): (itemId: string) => boolean {
  const mastered = new Set(standing.mastered);
  const withConcepts = new Set(standing.withConcepts);
  return (itemId) =>
    mastered.has(itemId) || (!withConcepts.has(itemId) && completed[itemId] === true);
}

/**
 * The lock rule: a unit is locked while the unit before it has topics and
 * none of them is done. A soft lock: the unit is drawn, its nodes stay
 * readable and its notes open, and only the header says to start the one
 * before. An empty previous unit locks nothing, since there is nothing in it
 * to start.
 */
export function isLocked(previous: { done: number; total: number } | undefined): boolean {
  return previous !== undefined && previous.total > 0 && previous.done === 0;
}

export interface PathTopicInput {
  id: string;
  mastery: TopicMastery | null | undefined;
}

export interface PathModuleInput {
  id: string;
  topics: readonly PathTopicInput[];
}

export interface ModuleStatus {
  id: string;
  done: number;
  total: number;
  locked: boolean;
  /** Every topic has a concept, so "done" means mastered and may be called that. */
  conceptBacked: boolean;
}

export interface PathStatus {
  modules: ModuleStatus[];
  /** Topic id to done. */
  done: Record<string, boolean>;
  /** The first topic not done, in an unlocked unit; null when the course is finished. */
  active: { moduleId: string; topicId: string } | null;
  doneCount: number;
  total: number;
  percent: number;
  conceptBacked: boolean;
}

/** Everything the path draws that depends on the learner, from the mastery and the ticks. */
export function pathStatus(
  modules: readonly PathModuleInput[],
  completed: Readonly<Record<string, true | undefined>>,
): PathStatus {
  const done: Record<string, boolean> = {};
  const statuses: ModuleStatus[] = [];
  let active: PathStatus["active"] = null;
  let doneCount = 0;
  let total = 0;

  for (const [i, mod] of modules.entries()) {
    let moduleDone = 0;
    for (const topic of mod.topics) {
      const d = topicDone(topic.mastery, Boolean(ownValue(completed, topic.id)));
      done[topic.id] = d;
      if (d) moduleDone += 1;
    }
    const status: ModuleStatus = {
      id: mod.id,
      done: moduleDone,
      total: mod.topics.length,
      locked: isLocked(i > 0 ? statuses[i - 1] : undefined),
      conceptBacked: mod.topics.length > 0 && mod.topics.every((t) => Boolean(t.mastery)),
    };
    statuses.push(status);
    doneCount += moduleDone;
    total += mod.topics.length;

    if (active === null && !status.locked) {
      const first = mod.topics.find((t) => !done[t.id]);
      if (first) active = { moduleId: mod.id, topicId: first.id };
    }
  }

  return {
    modules: statuses,
    done,
    active,
    doneCount,
    total,
    percent: percentOf(doneCount, total),
    conceptBacked: statuses.length > 0 && statuses.every((s) => s.total === 0 || s.conceptBacked),
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * The module a course page shows at `/courses/[slug]`: the one holding the
 * active topic, else the first. A finished course (no active topic) opens on
 * its first module, as a course home does once everything is done.
 */
export function defaultModuleIndex(modules: readonly { id: string }[], status: Pick<PathStatus, "active">): number {
  const at = status.active ? modules.findIndex((m) => m.id === status.active!.moduleId) : -1;
  return at === -1 ? 0 : at;
}

/** Every curriculum item id of a course, in module then topic order: the ids a tick, a reset and the path key on. */
export function courseTopicIds(course: Pick<Course, "modules">): string[] {
  return course.modules.flatMap((m) => m.topics.map((t) => t.id));
}

/** `/courses/<course>/<module>`: one module of a course, on a page of its own. */
export function moduleHref(courseSlug: string, moduleSlug: string): string {
  return `/courses/${courseSlug}/${moduleSlug}`;
}

/** How a module row in the sidebar marks its standing. */
export type ModuleMark = "done" | "progress" | "todo" | "locked";

export function moduleMark(status: ModuleStatus): ModuleMark {
  if (status.locked) return "locked";
  if (status.total > 0 && status.done === status.total) return "done";
  return status.done > 0 ? "progress" : "todo";
}

/** "mastered" when every topic of the scope has a concept, else "done": a tick is not mastery. */
export function doneWord(conceptBacked: boolean): string {
  return conceptBacked ? "mastered" : "done";
}

/** "2 of 5 done", "4 of 4 mastered": a module's or a course's count of finished topics. */
export function doneLine(done: number, total: number, conceptBacked: boolean): string {
  return `${done} of ${total} ${doneWord(conceptBacked)}`;
}

/** One part of a module's meta row, with the icon it is drawn beside. */
export interface ModuleMetaPart {
  icon: "topics" | "concepts" | "assets" | "done";
  text: string;
}

/**
 * The line under a module's title ("5 topics · 12 concepts · 3 assets · 2 of 5
 * done"). A count of nothing is left out, except the topics and the done
 * count, which say what the module is and how far along it is.
 */
export function moduleMeta({
  status,
  concepts,
  assets,
}: {
  status: ModuleStatus;
  /** Distinct concepts across the module's topics. */
  concepts: number;
  /** Assets filed under the module's topic; null when the catalog did not answer. */
  assets: number | null;
}): ModuleMetaPart[] {
  const parts: ModuleMetaPart[] = [{ icon: "topics", text: plural(status.total, "topic") }];
  if (concepts > 0) parts.push({ icon: "concepts", text: plural(concepts, "concept") });
  if (assets) parts.push({ icon: "assets", text: plural(assets, "asset") });
  if (status.total > 0) parts.push({ icon: "done", text: doneLine(status.done, status.total, status.conceptBacked) });
  return parts;
}

/** How a topic row marks its standing: mastery when it has concepts, the tick when not. */
export type TopicMark = "done" | "learning" | "untouched";

export function topicMark(mastery: TopicMastery | null | undefined, ticked: boolean): TopicMark {
  if (topicDone(mastery, ticked)) return "done";
  return mastery?.bucket === "learning" ? "learning" : "untouched";
}

/** The grey line under a topic's title: "3 concepts · Learning", "Done", "Not started". */
export function topicMeta(mastery: TopicMastery | null | undefined, ticked: boolean): string {
  if (!mastery) return ticked ? "Done" : "Not started";
  return `${plural(mastery.concepts.length, "concept")} · ${MASTERY_BUCKET_LABEL[mastery.bucket]}`;
}

/**
 * What the module sets out to teach, for "Show learning objectives": every
 * topic's subtopics in order, each once.
 */
export function moduleObjectives(topics: readonly { subtopics: readonly string[] }[]): string[] {
  return [...new Set(topics.flatMap((t) => t.subtopics.map((s) => s.trim()).filter(Boolean)))];
}

/** The distinct concepts behind a module's topics. */
export function moduleConceptCount(mastery: readonly (TopicMastery | null | undefined)[]): number {
  return new Set(mastery.flatMap((m) => m?.concepts.map((c) => c.slug) ?? [])).size;
}

/** `/learn/<concept>`: the concept workspace, where a Guidebook opens. */
export function conceptHref(slug: string): string {
  return `/learn/${encodeURIComponent(slug)}`;
}

/** `/learn/<concept>/session`: the focus-mode session for one concept. */
export function conceptSessionHref(slug: string): string {
  return `${conceptHref(slug)}/session`;
}

/** The topic's own tutor session, the page every topic had before concepts. */
export function topicSessionHref(courseSlug: string, moduleSlug: string, topicId: string): string {
  return `/courses/${courseSlug}/${moduleSlug}/session?topic=${encodeURIComponent(topicId)}`;
}

/**
 * Where a node's Continue goes: the concept session when the topic has a
 * concept, else the topic session, so a course with no concept notes loses
 * nothing it had.
 */
export function continueHref(
  courseSlug: string,
  moduleSlug: string,
  topicId: string,
  mastery: TopicMastery | null | undefined,
): string {
  return mastery ? conceptSessionHref(mastery.next) : topicSessionHref(courseSlug, moduleSlug, topicId);
}

/**
 * The concept a unit's Guidebook opens, or null to show the module inline.
 *
 * The first concept of the first topic that has one; failing that, the first
 * of the module's `maps.concepts` that the knowledge base knows (all of them
 * when it could not be asked, since the file is still the authority on what
 * exists).
 */
export function guidebookConcept(
  topics: readonly { mastery: TopicMastery | null | undefined }[],
  authored: readonly string[],
  known: ReadonlySet<string> | null,
): string | null {
  for (const topic of topics) {
    const first = topic.mastery?.concepts[0];
    if (first) return first.slug;
  }
  return authored.find((slug) => known === null || known.has(slug)) ?? null;
}
