"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { VisitTracker } from "@/components/VisitTracker";
import { continueHref, defaultModuleIndex, pathStatus, type TopicMastery } from "@/lib/course-path";
import { libraryHref } from "@/lib/library";
import { useLearner } from "@/lib/learner-context";
import type { Course } from "@/lib/types";

import { CourseRail } from "./CourseRail";
import { CourseSidebar } from "./CourseSidebar";
import { ModuleMain } from "./ModuleMain";
import type { ModuleData, RelatedCourse } from "./types";

/**
 * A course page in the layout of Coursera's course home: the course sidebar
 * with its module list on the left, one module in the main column, and a rail
 * of cards on the right. One module per URL: `/courses/[slug]/[module]` names
 * it, and `/courses/[slug]` shows the module the learner is on.
 *
 * A client component because the marks, the counts and which topic carries
 * Continue depend on the learner's ticks, which live in `LearnerProvider`:
 * ticking a topic moves them at once, with no reload. Mastery is the
 * server's, handed in as `mastery`.
 *
 * `/courses/[slug]` picks its module once, from the ticks the page was served
 * with, and keeps it: finishing the module's last topic moves Continue to the
 * next module without pulling the page out from under the learner.
 *
 * From 1280px the three columns sit side by side (sidebar 300, rail 360, the
 * module between), from 1024px the rail drops under the module, and below
 * that the sidebar turns into a picker above the module and the rail follows
 * it.
 */
export function CourseHome({
  course,
  moduleSlug,
  mastery,
  modules,
  assetsReachable,
  related,
}: {
  course: Course;
  /** The module the URL names, or undefined at `/courses/[slug]`. */
  moduleSlug?: string;
  /** Topic id to its mastery; a topic with no concept is absent. */
  mastery: Record<string, TopicMastery>;
  /** Module id to what the server resolved for it. */
  modules: Record<string, ModuleData>;
  assetsReachable: boolean;
  related: RelatedCourse[];
}) {
  const { state } = useLearner();

  const status = useMemo(
    () =>
      pathStatus(
        course.modules.map((m) => ({ id: m.id, topics: m.topics.map((t) => ({ id: t.id, mastery: mastery[t.id] })) })),
        state.completed,
      ),
    [course, mastery, state.completed],
  );

  // A link from before module pages, `/courses/<slug>#<module>` (bookmarks,
  // old notes), names its module in the hash, which the server never sees:
  // send it to that module's own page instead of the learner's current one.
  const router = useRouter();
  useEffect(() => {
    if (moduleSlug !== undefined) return;
    let hash: string;
    try {
      hash = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return; // a malformed escape ("#m1%zz") names no module
    }
    const target = hash ? course.modules.find((m) => m.slug === hash || m.id === hash) : undefined;
    if (target) router.replace(`/courses/${course.slug}/${target.slug}`);
  }, [course, moduleSlug, router]);

  const [landing] = useState(() => defaultModuleIndex(course.modules, status));
  const named = moduleSlug === undefined ? -1 : course.modules.findIndex((m) => m.slug === moduleSlug);
  const index = named === -1 ? landing : named;
  const shown = course.modules[index];

  const activeModule = course.modules.find((m) => m.id === status.active?.moduleId);
  const activeTopic = activeModule?.topics.find((t) => t.id === status.active?.topicId);
  const activeHref =
    activeModule && activeTopic ? continueHref(course.slug, activeModule.slug, activeTopic.id, mastery[activeTopic.id]) : null;

  // The course's assets, each topic counted once (two modules may share one).
  const assetTotal = [...new Map(course.modules.map((m) => [m.topic, modules[m.id]?.assets?.count ?? 0])).values()].reduce(
    (sum, n) => sum + n,
    0,
  );

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[272px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
      <VisitTracker courseSlug={course.slug} moduleSlug={moduleSlug === undefined ? undefined : shown?.slug} />

      <CourseSidebar
        course={course}
        status={status}
        selected={index}
        libraryHref={assetTotal > 0 ? libraryHref({ course: course.slug }) : null}
        className="lg:sticky lg:top-[88px] lg:row-span-2 lg:max-h-[calc(100dvh-112px)] lg:overflow-y-auto xl:row-span-1"
      />

      {shown ? (
        <ModuleMain
          key={shown.id}
          course={course}
          module={shown}
          index={index}
          status={status.modules[index]!}
          data={modules[shown.id]}
          mastery={mastery}
          activeTopicId={status.active?.moduleId === shown.id ? status.active.topicId : null}
          assetsReachable={assetsReachable}
          className="lg:col-start-2"
        />
      ) : (
        <Panel as="section" className="lg:col-start-2">
          <h1 className="px-4 py-2 text-[22px] font-semibold text-text">{course.title}</h1>
          <p className="px-4 text-[14px] text-text2">This course has no modules yet.</p>
        </Panel>
      )}

      <CourseRail
        course={course}
        status={status}
        mastery={mastery}
        next={activeModule && activeTopic ? { module: activeModule, topic: activeTopic } : null}
        continueHref={activeHref}
        showNext={Boolean(activeModule && activeModule.id !== shown?.id)}
        related={related}
        className="lg:col-start-2 xl:col-start-3 xl:row-start-1"
      />
    </div>
  );
}
