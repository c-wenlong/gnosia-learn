import type { AssetPlace } from "@self-learn/catalog/state";

import { orderedConcepts, pickPlace } from "@/lib/library-source";
import type { MasteryBucket } from "@/lib/mastery-bucket";

/**
 * The Library's other two groupings (L4 of
 * docs/proposals/library-by-type-and-day.md): by course, a heading per course
 * with its modules in course order inside, and by concept, a heading per
 * concept in the prerequisite graph's order. The day groups are
 * `dayGroups` in `@/lib/day-groups`; all three hand the page the same shape,
 * a key, a label and the rows, so it draws one heading style for each.
 *
 * Each row lands in one group, the one its source line names (`rowSource` in
 * `@/lib/library-source`): the course `pickPlace` picks (the open `?course=`
 * filter's, else the first by code, a module listing ahead of a topic match),
 * and the first concept in the graph's order. An asset in two courses or
 * under two concepts is not shown twice, which would make the counts add up
 * to more than the header's. What has no course or no concept goes under a
 * last group, "No course" or "No concept", rather than vanishing.
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
  /** Unique among the groups: `course:<slug>`, `concept:<slug>`, or `none`. */
  key: string;
  /** "CS3230", "Master theorem", "No course". */
  label: string;
  /** Grey words after the label: the course's title beside its code. */
  detail?: string;
  /** A concept heading's mastery, for its dot. */
  bucket?: MasteryBucket;
  /** Every row in the group, in its sections' order when it has sections. */
  rows: T[];
  /** A course's modules, in course order; absent for a concept or the last group. */
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
 * `rows` grouped by the first concept each explains, the concepts in the
 * prerequisite graph's order (`conceptOrder`), one the graph does not hold
 * after those by slug, and "No concept" last.
 */
export function conceptGroups<T>(
  rows: readonly T[],
  conceptsOf: (row: T) => readonly string[],
  order: ReadonlyMap<string, number>,
  concept: (slug: string) => { title: string; bucket: MasteryBucket } | null,
): RowGroup<T>[] {
  const held = new Map<string, T[]>();
  const loose: T[] = [];
  for (const row of rows) {
    const [first] = orderedConcepts(conceptsOf(row), order);
    if (first === undefined) {
      loose.push(row);
      continue;
    }
    const list = held.get(first);
    if (list === undefined) held.set(first, [row]);
    else list.push(row);
  }
  const groups: RowGroup<T>[] = orderedConcepts([...held.keys()], order).map((slug) => {
    const known = concept(slug);
    return {
      key: `concept:${slug}`,
      label: known?.title ?? slug,
      bucket: known?.bucket ?? "untouched",
      rows: held.get(slug) ?? [],
    };
  });
  if (loose.length > 0) groups.push({ key: NO_GROUP, label: "No concept", rows: loose });
  return groups;
}
