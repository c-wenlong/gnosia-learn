import type { MasteryLabel } from "@self-learn/catalog/state";

import { bucketOf, masteryCaption, type MasteryBucket } from "@/lib/mastery-bucket";

/**
 * The course path's arithmetic (hi-fi screen 03): which colour each topic
 * node is, which node is the one to do next, and which units are locked.
 *
 * Pure and React-free, so the server page, the client path and a test can all
 * call it. `import type` only from the catalog, the same as
 * `@/lib/mastery-bucket`, so nothing from the database layer reaches the
 * browser bundle.
 *
 * **Where a topic's concepts come from.** A course topic (`cp4284-m1-t1`) is
 * not an entry in `content/topics.yaml`: that file's `maps.courses` names
 * modules, not topics, so it can say which concepts a module is about but not
 * which of the module's topics each one belongs to. The per-topic link is the
 * concept note's own `topics:` frontmatter, which `catalog index` writes into
 * `concept_curriculum_item` and `readKnowledgeBase` returns as
 * `KbConcept.topics`. The module's `maps.concepts` list is still used, as the
 * authored order the concepts are listed and studied in, and as the
 * Guidebook's fallback when no topic of the module has a concept of its own.
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
  /** Curriculum item ids (course topic ids) the concept note says it supports. */
  topics: readonly string[];
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
 * The concepts whose notes name this course topic, in authored order.
 *
 * `authored` is the module's `maps.concepts` from `content/topics.yaml`: a
 * concept listed there sorts by its position, anything else after them by
 * title, so the list reads in the order the topic file teaches it.
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
    .sort((a, b) => rank(a.slug) - rank(b.slug) || a.title.localeCompare(b.title));
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
      const d = topicDone(topic.mastery, Boolean(completed[topic.id]));
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
    percent: total === 0 ? 0 : Math.round((doneCount / total) * 100),
    conceptBacked: statuses.length > 0 && statuses.every((s) => s.total === 0 || s.conceptBacked),
  };
}

/** "4 of 4 mastered", "1 of 5 done", or "locked until Module 1". */
export function unitSubtitle(status: ModuleStatus, previousOrder: number | undefined): string {
  if (status.locked && previousOrder !== undefined) return `locked until Module ${previousOrder}`;
  return `${status.done} of ${status.total} ${status.conceptBacked ? "mastered" : "done"}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "8 modules · 20 topics · 40% mastered", the rail header's line. */
export function courseSummaryLine(status: PathStatus): string {
  return [
    plural(status.modules.length, "module"),
    plural(status.total, "topic"),
    `${status.percent}% ${status.conceptBacked ? "mastered" : "done"}`,
  ].join(" · ");
}

/** The caption under a node: the mastery caption, or the tick's state. */
export function nodeCaption(mastery: TopicMastery | null | undefined, ticked: boolean): string {
  if (!mastery) return ticked ? "Completed" : "Not started";
  const base = masteryCaption(mastery.bucket, mastery.pL);
  return mastery.concepts.length > 1 ? `${base} · ${mastery.concepts.length} concepts` : base;
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
