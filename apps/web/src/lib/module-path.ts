import type { Family } from "@/components/asset-meta";
import {
  conceptHref,
  conceptSessionHref,
  topicDone,
  type KbConceptLike,
  type TopicMastery,
} from "@/lib/course-path";
import { bucketOf, masteryCaption, type MasteryBucket } from "@/lib/mastery-bucket";
import type { Module, Resource, Topic } from "@/lib/types";
import { weekCheckBound } from "@/lib/week-check";

/**
 * A module as one ordered path (phase 3 of
 * docs/proposals/module-learning-path.md): before you start, the module's
 * own material, one lesson per course item with a step per concept (its
 * note with Quiz me on the same row, then its diagrams and videos), then
 * practice, then the week check (phase 4).
 *
 * Pure and React-free, so the client page, which owns the learner's ticks,
 * and a test can both call it. It imports nothing from the catalog; the
 * server resolves the assets and the check counts (`@/lib/course-assets`)
 * and hands them in as plain data.
 *
 * **Where a video lands.** Once per module page, at the first match of:
 *
 * 1. the course's own list: a lesson's `videos:` (opening that lesson), else
 *    the module's (under Watch), when the id resolves to a video the owner
 *    can read; any other listed id is left off;
 * 2. the step of the first concept of the module its `asset_concept` names;
 * 3. the module's vocabulary topic (`asset_topic`), under Watch after the
 *    listed ones. On a topic another live module also names, only while none
 *    of the videos this module lists resolves, since a topic-only video there
 *    may be the other module's; on a topic it alone names, always.
 *
 * A diagram reaches the path only by rule 2, and is placed once as well.
 */

/** One asset as a module page draws it: the link and the label already resolved. */
export interface PathAsset {
  id: string;
  href: string;
  title: string;
  /** False when `title` is a filename or a host rather than a real title. */
  titled: boolean;
  kindLabel: string;
  /** Which icon the row carries. */
  family: Family;
}

/**
 * A concept of the knowledge base as the path reads it: its title, its
 * mastery and its edges. The slice of `KbConcept` a page sends to the client.
 */
export interface PathKbConcept extends Pick<KbConceptLike, "id" | "title" | "pL" | "mastery" | "observations"> {
  requires: readonly string[];
  assumes: readonly string[];
}

/** What the server resolved about a module's assets. */
export interface ModulePathAssets {
  /** Concept slug to the diagrams and videos whose `asset_concept` names it. */
  byConcept: Readonly<Record<string, readonly PathAsset[]>>;
  /** The listed video ids (the module's and its lessons') that resolved to a video the owner can read. */
  listed: Readonly<Record<string, PathAsset>>;
  /** The videos filed under the module's vocabulary topic. */
  topicVideos: readonly PathAsset[];
  /** Another live module names the same vocabulary topic. */
  topicShared: boolean;
}

export interface ModulePathInput {
  module: Pick<Module, "id" | "topics" | "resources" | "videos">;
  /** The knowledge base, or any slice of it holding the module's concepts and their prerequisites. */
  concepts: readonly PathKbConcept[];
  /** Item id to its mastery, as the course page resolves it; an item with no concept is absent. */
  mastery: Readonly<Record<string, TopicMastery>>;
  /** The learner's ticks. */
  completed: Readonly<Record<string, true | undefined>>;
  /** Null when the catalog did not answer: no video and no diagram is placed. */
  assets: ModulePathAssets | null;
  /** Concept slug to the checks its note holds; a concept absent has none. Null when they could not be read. */
  checks: Readonly<Record<string, number>> | null;
}

export interface PathPrerequisite {
  slug: string;
  title: string;
  edge: "requires" | "assumes";
  bucket: MasteryBucket;
  href: string;
}

export interface ConceptStep {
  slug: string;
  title: string;
  bucket: MasteryBucket;
  /** The concept page, where the note is. */
  href: string;
  /** The diagrams and videos placed on this step. */
  assets: PathAsset[];
  /** How many checks the note holds; null when unknown. */
  checks: number | null;
  /** The concept's p(L), shown once it has been seen, as the concept list it replaced showed it. */
  pL: number | null;
  /**
   * Quiz me, the action on the concept's row: the concept session straight
   * to its checks. Null when the note has none, or none could be counted:
   * the concept workspace offers no Quiz me then either, since with no tutor
   * model the session would ask nothing.
   */
  quizHref: string | null;
}

export interface PathLesson {
  item: Topic;
  done: boolean;
  /** Videos the lesson lists that resolved, in the order written. */
  videos: PathAsset[];
  concepts: ConceptStep[];
  /** The readings listed on this lesson, then any practice it closes. */
  readings: Resource[];
}

/** The week check's step: how many concepts it asks about, and the most questions it can ask. */
export interface WeekCheckStep {
  concepts: number;
  questions: number;
}

export interface ModulePath {
  /** The module's id: what the week check's step names. */
  moduleId: string;
  before: PathPrerequisite[];
  watch: PathAsset[];
  readAlongside: Resource[];
  lessons: PathLesson[];
  practice: Resource[];
  /**
   * The last step: the module's concepts the knowledge base holds, as the
   * week check page asks them. Null when there are none, since a check with
   * nothing to ask about is no step.
   */
  check: WeekCheckStep | null;
}

/** `/courses/<slug>/<module>/check`: the module's week check. */
export function weekCheckHref(courseSlug: string, moduleSlug: string): string {
  return `/courses/${courseSlug}/${moduleSlug}/check`;
}

/** The week check row's meta line: "6 concepts · up to 18 questions". */
export function weekCheckMeta(check: WeekCheckStep): string {
  const concepts = `${check.concepts} concept${check.concepts === 1 ? "" : "s"}`;
  return `${concepts} · up to ${check.questions} question${check.questions === 1 ? "" : "s"}`;
}

/** `/learn/<concept>/session?mode=check`: Quiz me, the note's checks and nothing else. */
export function quizHref(slug: string): string {
  return `${conceptSessionHref(slug)}?mode=check`;
}

export function modulePath(input: ModulePathInput): ModulePath {
  const { module, concepts, mastery, completed, assets, checks } = input;
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const placed = new Set<string>();

  // The module's concepts in teaching order: lesson by lesson, each in its lesson's order.
  const taught: string[] = [];
  for (const item of module.topics) for (const slug of item.concepts) if (!taught.includes(slug)) taught.push(slug);
  const inModule = new Set(taught);

  // Before you start: every requires edge out of the module, then every assumes edge.
  const before: PathPrerequisite[] = [];
  const named = new Set<string>();
  for (const edge of ["requires", "assumes"] as const) {
    for (const slug of taught) {
      for (const prerequisite of byId.get(slug)?.[edge] ?? []) {
        if (inModule.has(prerequisite) || named.has(prerequisite)) continue;
        const target = byId.get(prerequisite);
        if (target === undefined) continue; // not one the owner can read: nothing to link to
        const bucket = bucketOf(target);
        if (bucket === "mastered") continue;
        named.add(prerequisite);
        before.push({ slug: prerequisite, title: target.title, edge, bucket, href: conceptHref(prerequisite) });
      }
    }
  }

  // The course's own lists first: a listed video is placed where it is listed.
  const resolve = (ids: readonly string[] | undefined): PathAsset[] => {
    const out: PathAsset[] = [];
    for (const id of ids ?? []) {
      const found = assets?.listed[id];
      if (found === undefined || placed.has(found.id)) continue;
      placed.add(found.id);
      out.push(found);
    }
    return out;
  };
  const watch = resolve(module.videos);
  const lessonVideos = module.topics.map((item) => resolve(item.videos));
  const listsOne = placed.size > 0;

  // Readings: module material, a lesson's, or practice. A lesson id the
  // module does not hold is ignored, so a reading naming only such ids is
  // placed as though it named none.
  const position = new Map(module.topics.map((item, i) => [item.id, i]));
  const readAlongside: Resource[] = [];
  const practice: Resource[] = [];
  const lessonReadings: Resource[][] = module.topics.map(() => []);
  const closing: Resource[][] = module.topics.map(() => []);
  for (const resource of module.resources) {
    const at = (resource.lessons ?? []).map((id) => position.get(id)).filter((i): i is number => i !== undefined);
    if (resource.type === "practice") {
      // The last lesson it lists in the path's order, not in the list's.
      if (at.length === 0) practice.push(resource);
      else closing[Math.max(...at)]!.push(resource);
    } else if (at.length === 0) readAlongside.push(resource);
    else for (const i of new Set(at)) lessonReadings[i]!.push(resource);
  }

  // Lessons, one step per concept; a concept-linked asset on the first step that names it.
  const lessons = module.topics.map(
    (item, i): PathLesson => ({
      item,
      done: topicDone(mastery[item.id], Boolean(completed[item.id])),
      videos: lessonVideos[i] ?? [],
      concepts: item.concepts.map((slug): ConceptStep => {
        const kb = byId.get(slug);
        const own: PathAsset[] = [];
        for (const asset of assets?.byConcept[slug] ?? []) {
          if (placed.has(asset.id)) continue;
          placed.add(asset.id);
          own.push(asset);
        }
        return {
          slug,
          title: kb?.title ?? slug,
          bucket: kb ? bucketOf(kb) : "untouched",
          href: conceptHref(slug),
          assets: own,
          checks: checks === null ? null : (checks[slug] ?? 0),
          pL: kb?.pL ?? null,
          quizHref: checks !== null && (checks[slug] ?? 0) > 0 ? quizHref(slug) : null,
        };
      }),
      readings: [...(lessonReadings[i] ?? []), ...(closing[i] ?? [])],
    }),
  );

  // The topic's videos last, as the fallback.
  if (assets !== null && !(assets.topicShared && listsOne)) {
    for (const asset of assets.topicVideos) {
      if (placed.has(asset.id)) continue;
      placed.add(asset.id);
      watch.push(asset);
    }
  }

  // The week check asks what the knowledge base holds, as its page does.
  const checked = taught.filter((slug) => byId.has(slug)).length;
  const check = checked === 0 ? null : { concepts: checked, questions: weekCheckBound(checked) };

  return { moduleId: module.id, before, watch, readAlongside, lessons, practice, check };
}

/** One step of the path, flattened. */
export interface PathSequenceStep {
  /** `before`, `watch`, `read`, a lesson's item id, `practice`, or `check`. */
  section: string;
  kind: "prerequisite" | "video" | "reading" | "lesson" | "note" | "asset" | "check";
  id: string;
}

/** The path as one list, in the order a learner meets it. */
export function pathSequence(path: ModulePath): PathSequenceStep[] {
  const out: PathSequenceStep[] = [];
  for (const p of path.before) out.push({ section: "before", kind: "prerequisite", id: p.slug });
  for (const v of path.watch) out.push({ section: "watch", kind: "video", id: v.id });
  for (const r of path.readAlongside) out.push({ section: "read", kind: "reading", id: r.id });
  for (const lesson of path.lessons) {
    const section = lesson.item.id;
    out.push({ section, kind: "lesson", id: section });
    for (const v of lesson.videos) out.push({ section, kind: "video", id: v.id });
    for (const step of lesson.concepts) {
      out.push({ section, kind: "note", id: step.slug });
      for (const a of step.assets) out.push({ section, kind: "asset", id: a.id });
    }
    for (const r of lesson.readings) out.push({ section, kind: "reading", id: r.id });
  }
  for (const r of path.practice) out.push({ section: "practice", kind: "reading", id: r.id });
  if (path.check !== null) out.push({ section: "check", kind: "check", id: path.moduleId });
  return out;
}

/**
 * A concept row's meta line: "Note · Learning · p(L) 0.62", with
 * " · 3 checks" only when the note has checks. Quiz me sits on the row only
 * then.
 */
export function conceptMeta(step: Pick<ConceptStep, "bucket" | "checks" | "pL">): string {
  const base = `Note · ${masteryCaption(step.bucket, step.pL)}`;
  if (!step.checks) return base;
  return `${base} · ${step.checks} check${step.checks === 1 ? "" : "s"}`;
}
