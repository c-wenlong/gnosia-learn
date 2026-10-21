import type { AssetConversation, AssetPlace } from "@gnosia/catalog/state";

import type { GraphEdge } from "@/lib/concept-graph";
import { dayLabel } from "@/lib/day-groups";
import { dayKey } from "@/lib/days";
import { topicOrder } from "@/lib/domain-map";
import { domainTitle } from "@/lib/domain-view";
import { conversationLabel, orderedConcepts, pickPlace } from "@/lib/library-source";
import type { MasteryBucket } from "@/lib/mastery-bucket";

/**
 * The Library's other three groupings (L4 of
 * docs/proposals/library-by-type-and-day.md): by course, a heading per course
 * with its modules in course order inside; by topic, a heading per topic in
 * the Learn map's order (`topicRanks`); and by conversation, a heading per
 * studio conversation, newest first (Manus's Group by task). The day groups
 * are `dayGroups` in `@/lib/day-groups`; all four hand the page the same
 * shape, a key, a label and the rows, so it draws one heading style for each.
 *
 * Each row lands in one group, the one its source line names (`rowSource` in
 * `@/lib/library-source`): the course `pickPlace` picks (the open `?course=`
 * filter's, else the first by code, a module listing ahead of a topic match),
 * and the topic of the first concept in the graph's order. An asset in two
 * courses or under two concepts of different topics is not shown twice, which
 * would make the counts add up to more than the header's. What has no course
 * or no topic goes under a last group, "No course" or "No topic", rather than
 * vanishing.
 *
 * A row's place inside its group (or its module) is kept from the input, so
 * the sort menu still orders the rows, as it does inside a day.
 *
 * Pure and React-free, so the page and a test both call it.
 */

/** One module's rows under its course's heading. */
export interface GroupSection<T> {
  /** The module's slug, or `""` for the rows listed on the course itself. */
  key: string;
  label: string;
  rows: T[];
}

export interface RowGroup<T> {
  /** Unique among the groups: `course:<slug>`, `topic:<slug>`, `conversation:<id>`, or `none`. */
  key: string;
  /** "CS3230", "Divide and conquer", "No course". */
  label: string;
  /** Grey words after the label: the course's title beside its code, a conversation's last day. */
  detail?: string;
  /** A topic heading's mastery (`topicBucket`), for its dot. */
  bucket?: MasteryBucket;
  /** Every row in the group, in its sections' order when it has sections. */
  rows: T[];
  /** A course's modules, in course order; absent for a topic or the last group. */
  sections?: GroupSection<T>[];
}

/** The key of the group that holds what has no parent of the grouping's kind. */
export const NO_GROUP = "none";

/** Rows on the course itself, under no module: the first section, under this label. */
export const WHOLE_COURSE = "Whole course";

const codeOf = (place: AssetPlace) => place.code?.trim() || place.courseTitle;

/**
 * `rows` grouped by the course (and inside it the module) each sits in.
 * Courses by code, then slug; modules by their position in the course, the
 * course's own rows first.
 */
export function courseGroups<T>(
  rows: readonly T[],
  placesOf: (row: T) => readonly AssetPlace[],
  options: { course: string | null },
): RowGroup<T>[] {
  const courses = new Map<string, { place: AssetPlace; modules: Map<string, { place: AssetPlace; rows: T[] }> }>();
  const loose: T[] = [];
  for (const row of rows) {
    const place = pickPlace(placesOf(row), options.course);
    if (place === null) {
      loose.push(row);
      continue;
    }
    let course = courses.get(place.course);
    if (course === undefined) {
      course = { place, modules: new Map() };
      courses.set(place.course, course);
    }
    const moduleKey = place.module ?? "";
    const held = course.modules.get(moduleKey);
    if (held === undefined) course.modules.set(moduleKey, { place, rows: [row] });
    else held.rows.push(row);
  }

  const groups: RowGroup<T>[] = [...courses.entries()]
    .sort(([aSlug, a], [bSlug, b]) => {
      const ac = codeOf(a.place);
      const bc = codeOf(b.place);
      if (ac !== bc) return ac < bc ? -1 : 1;
      return aSlug < bSlug ? -1 : aSlug > bSlug ? 1 : 0;
    })
    .map(([slug, course]) => {
      const sections: GroupSection<T>[] = [...course.modules.entries()]
        .sort(([aKey, a], [bKey, b]) => {
          // The course's own rows (no module) come first.
          if ((aKey === "") !== (bKey === "")) return aKey === "" ? -1 : 1;
          return a.place.position - b.place.position || (aKey < bKey ? -1 : aKey > bKey ? 1 : 0);
        })
        .map(([key, held]) => ({
          key,
          label: key === "" ? WHOLE_COURSE : (held.place.moduleTitle?.trim() || key),
          rows: held.rows,
        }));
      const code = course.place.code?.trim();
      return {
        key: `course:${slug}`,
        label: code || course.place.courseTitle,
        ...(code ? { detail: course.place.courseTitle } : {}),
        rows: sections.flatMap((section) => section.rows),
        sections,
      };
    });
  if (loose.length > 0) groups.push({ key: NO_GROUP, label: "No course", rows: loose });
  return groups;
}

/**
 * A topic's mastery from its concepts' buckets, by the rule a course page's
 * topic row uses (`resolveTopicMastery` in `@/lib/course-path`): mastered
 * only when every concept is, untouched only when none has been started,
 * learning otherwise. Null for a topic with no concepts, which gets no dot.
 */
export function topicBucket(buckets: readonly MasteryBucket[]): MasteryBucket | null {
  if (buckets.length === 0) return null;
  if (buckets.every((b) => b === "mastered")) return "mastered";
  if (buckets.every((b) => b === "untouched")) return "untouched";
  return "learning";
}

/** What a row is grouped by under topic: the concepts it explains and the topics it is filed under. */
export interface TopicParents {
  concepts: readonly string[];
  topics: readonly string[];
}

/**
 * Every topic's place in the topic grouping, the order the Learn map draws
 * them in: domain by domain, the domains by title A to Z, and inside a domain
 * the map's own order (`topicOrder`, D3 of docs/proposals/domain-map.md),
 * prerequisite topics first, then the vocabulary's order. The map puts the
 * most studied domain first; here the domains go by title, so the headings
 * do not move about as the learner studies.
 */
export function topicRanks(
  vocabulary: readonly { slug: string; domain: string }[],
  conceptTopic: ReadonlyMap<string, string>,
  edges: readonly GraphEdge[],
): Map<string, number> {
  const domainOf = new Map(vocabulary.map((t) => [t.slug, t.domain]));
  const domains = new Map<string, { slug: string }[]>();
  for (const t of vocabulary) {
    const list = domains.get(t.domain);
    if (list === undefined) domains.set(t.domain, [{ slug: t.slug }]);
    else list.push({ slug: t.slug });
  }
  const ordered = [...domains.entries()]
    .sort(([a], [b]) => {
      const at = domainTitle(a).toLowerCase();
      const bt = domainTitle(b).toLowerCase();
      return at < bt ? -1 : at > bt ? 1 : a < b ? -1 : a > b ? 1 : 0;
    })
    .flatMap(([domain, topics]) => {
      // The domain's own edges only, as the map orders a domain's topics
      // (`domainLayout`): a prerequisite in another domain does not move a
      // topic here.
      const inside = (concept: string) => {
        const slug = conceptTopic.get(concept);
        return slug !== undefined && domainOf.get(slug) === domain;
      };
      return topicOrder(topics, conceptTopic, edges.filter((e) => inside(e.from) && inside(e.to)));
    });
  return new Map(ordered.map((slug, i) => [slug, i]));
}

/**
 * `rows` grouped by topic: the topic of the first concept each explains, in
 * the prerequisite graph's order (`orderedConcepts`), so the source line, the
 * row menu and the heading agree on the concept. A row whose first concept
 * has no topic, or that explains no concept, goes under the first topic it is
 * itself filed under, and only a row with neither goes under "No topic", last.
 * Topics come in `rank`'s order (`topicRanks`), one it does not hold after
 * those, by slug.
 */
export function topicGroups<T>(
  rows: readonly T[],
  parentsOf: (row: T) => TopicParents,
  options: {
    /** `conceptOrder`, which picks a row's first concept. */
    order: ReadonlyMap<string, number>;
    /** The topic a concept is filed under, or null. */
    topicOf: (concept: string) => string | null;
    /** `topicRanks`. */
    rank: ReadonlyMap<string, number>;
    /** The heading's title and dot; null when the topic is not known. */
    topic: (slug: string) => { title: string; bucket: MasteryBucket | null } | null;
  },
): RowGroup<T>[] {
  const held = new Map<string, T[]>();
  const loose: T[] = [];
  for (const row of rows) {
    const parents = parentsOf(row);
    const [first] = orderedConcepts(parents.concepts, options.order);
    const slug = (first === undefined ? null : options.topicOf(first)) ?? parents.topics[0] ?? null;
    if (slug === null) {
      loose.push(row);
      continue;
    }
    const list = held.get(slug);
    if (list === undefined) held.set(slug, [row]);
    else list.push(row);
  }

  const rankOf = (slug: string) => options.rank.get(slug) ?? Number.MAX_SAFE_INTEGER;
  const groups: RowGroup<T>[] = [...held.entries()]
    .sort(([a], [b]) => rankOf(a) - rankOf(b) || (a < b ? -1 : a > b ? 1 : 0))
    .map(([slug, list]) => {
      const known = options.topic(slug);
      const bucket = known?.bucket ?? null;
      return {
        key: `topic:${slug}`,
        label: known?.title ?? slug,
        ...(bucket === null ? {} : { bucket }),
        rows: list,
      };
    });
  if (loose.length > 0) groups.push({ key: NO_GROUP, label: "No topic", rows: loose });
  return groups;
}

/**
 * `rows` grouped by the studio conversation that made each (`conversationOf`,
 * `latestConversation`: of two, the one whose job wrote the asset last, so an
 * asset is shown once). A heading is the conversation's name by the shared
 * rule (`conversationLabel`), with the day it was last written to in grey
 * ("4 Oct", the year when it is not this one, in `timeZone`). The newest
 * conversation comes first, one whose instant did not read after those, by
 * id; what no conversation made (a note, a link, a course file) goes under
 * "No conversation", last.
 */
export function conversationGroups<T>(
  rows: readonly T[],
  conversationOf: (row: T) => AssetConversation | null,
  options: { now: Date; timeZone?: string },
): RowGroup<T>[] {
  const held = new Map<string, { conversation: AssetConversation; rows: T[] }>();
  const loose: T[] = [];
  for (const row of rows) {
    const conversation = conversationOf(row);
    if (conversation === null) {
      loose.push(row);
      continue;
    }
    const entry = held.get(conversation.id);
    if (entry === undefined) held.set(conversation.id, { conversation, rows: [row] });
    else entry.rows.push(row);
  }

  const time = (c: AssetConversation) => {
    const at = c.updatedAt === null ? Number.NaN : Date.parse(c.updatedAt);
    return Number.isNaN(at) ? null : at;
  };
  const today = dayKey(options.now, options.timeZone);
  const groups: RowGroup<T>[] = [...held.values()]
    .sort((a, b) => {
      const at = time(a.conversation);
      const bt = time(b.conversation);
      if (at !== bt) {
        if (at === null) return 1;
        if (bt === null) return -1;
        return bt - at;
      }
      const ai = a.conversation.id;
      const bi = b.conversation.id;
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    })
    .map(({ conversation, rows: list }) => {
      const at = time(conversation);
      return {
        key: `conversation:${conversation.id}`,
        label: conversationLabel(conversation),
        ...(at === null ? {} : { detail: dayLabel(dayKey(new Date(at), options.timeZone), today) }),
        rows: list,
      };
    });
  if (loose.length > 0) groups.push({ key: NO_GROUP, label: "No conversation", rows: loose });
  return groups;
}
