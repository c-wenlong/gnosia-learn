"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";

import { ResetCourseButton } from "@/components/ResetCourseButton";
import { ResourceList } from "@/components/ResourceList";
import { Button } from "@/components/ui/Button";
import { Card, CardAction } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Collapse, CollapseChevron } from "@/components/ui/Collapse";
import { cx, LABEL } from "@/components/ui/classes";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { UnitHeader } from "@/components/ui/UnitHeader";
import { VisitTracker } from "@/components/VisitTracker";
import {
  conceptHref,
  continueHref,
  courseSummaryLine,
  pathStatus,
  unitSubtitle,
  type ModuleStatus,
  type PathStatus,
  type TopicMastery,
} from "@/lib/course-path";
import type { ModuleAssets } from "@/lib/course-assets";
import { useLearner } from "@/lib/learner-context";
import type { Course, Module } from "@/lib/types";

import { AssetThumb } from "./AssetThumb";
import { PathTopicRow } from "./PathTopicRow";

/** What the server resolved per module. */
export interface PathModuleData {
  /** The concept the Guidebook opens, or null to open the module inline. */
  guidebook: string | null;
  /** Null when the catalog could not be asked. */
  assets: ModuleAssets | null;
}

export interface RelatedCourse {
  slug: string;
  code: string;
  title: string;
  shared: string[];
}

/**
 * The course path's interactive half (hi-fi screen 03): one unit card per
 * module on the left, the course header, the module list and the current
 * module's assets in a rail on the right.
 *
 * A client component because which node is active depends on the learner's
 * ticks, and those live in `LearnerProvider`: ticking a topic in a node's
 * panel moves the path at once, with no reload. Mastery is the server's, read
 * from the knowledge base per request and handed in as `mastery`.
 *
 * On a phone the rail's children join the page's column (`contents`), so the
 * course header comes first, then the path, then the lists.
 *
 * **Only the module the learner is on starts open.** Every other unit card is
 * its header alone until opened, so a six-module course reads as its outline
 * with one module unfolded, not six stacked lists. A module a link points at
 * (`#<module-slug>`, the Modules card's rows) opens too, and so does a module
 * that becomes the current one while the page is open.
 */
export function CoursePath({
  course,
  mastery,
  modules,
  assetsReachable,
  related,
}: {
  course: Course;
  /** Topic id to its mastery; a topic with no concept is absent. */
  mastery: Record<string, TopicMastery>;
  /** Module id to what the server resolved for it. */
  modules: Record<string, PathModuleData>;
  assetsReachable: boolean;
  related: RelatedCourse[];
}) {
  const { state } = useLearner();
  const visited = useHashModule(course.modules);
  // A row of the Modules card asks for its module. Counted rather than
  // remembered, so asking again for one the learner has since shut opens it
  // again. Needed besides the hash because a Next `Link` changes the hash
  // with `pushState`, which fires no `hashchange`.
  const [asked, setAsked] = useState<{ slug: string | null; count: number }>({ slug: null, count: 0 });

  const status = useMemo(
    () =>
      pathStatus(
        course.modules.map((m) => ({ id: m.id, topics: m.topics.map((t) => ({ id: t.id, mastery: mastery[t.id] })) })),
        state.completed,
      ),
    [course, mastery, state.completed],
  );

  const activeModule =
    course.modules.find((m) => m.id === status.active?.moduleId) ?? course.modules[course.modules.length - 1];
  const activeTopic = activeModule?.topics.find((t) => t.id === status.active?.topicId);
  const activeHref =
    activeModule && activeTopic
      ? continueHref(course.slug, activeModule.slug, activeTopic.id, mastery[activeTopic.id])
      : null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
      <VisitTracker courseSlug={course.slug} moduleSlug={visited} />

      <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-none lg:flex-1">
        {course.modules.map((m, i) => (
          <UnitCard
            key={m.id}
            course={course}
            module={m}
            status={status.modules[i]!}
            previous={i > 0 ? course.modules[i - 1] : undefined}
            data={modules[m.id]}
            mastery={mastery}
            activeTopicId={status.active?.moduleId === m.id ? status.active.topicId : null}
            current={m.id === activeModule?.id}
            targeted={m.slug === visited}
            asked={asked.slug === m.slug ? asked.count : 0}
          />
        ))}
      </div>

      <aside aria-label="Course" className="contents lg:flex lg:w-[360px] lg:shrink-0 lg:flex-col lg:gap-4">
        <HeaderCard course={course} status={status} continueHref={activeHref} className="order-1 lg:order-none" />
        <ModulesCard
          course={course}
          status={status}
          onPick={(slug) => setAsked((a) => ({ slug, count: a.count + 1 }))}
          className="order-3 lg:order-none"
        />
        <AssetsCard
          module={activeModule}
          assets={activeModule ? (modules[activeModule.id]?.assets ?? null) : null}
          reachable={assetsReachable}
          className="order-4 lg:order-none"
        />
        <AboutCard course={course} related={related} className="order-5 lg:order-none" />
      </aside>
    </div>
  );
}

/**
 * The module the URL points at, if any: `#<module-slug>`, which is where an old
 * module link lands and what the Modules card's rows link to. That, and not the
 * active node, is the module a visit records, since it is the one the learner
 * asked to see.
 */
function useHashModule(modules: readonly Module[]): string | undefined {
  const [slug, setSlug] = useState<string | undefined>(undefined);
  useEffect(() => {
    const read = () => {
      // Decoded when it can be, so a slug with non-ASCII characters still
      // matches; `decodeURIComponent` throws on a hand-typed `#m1%zz`, which
      // then simply names no module.
      const raw = window.location.hash.slice(1);
      let hash = raw;
      try {
        hash = decodeURIComponent(raw);
      } catch {
        // Keep the raw text.
      }
      setSlug(modules.find((m) => m.slug === hash || m.slug === raw)?.slug);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [modules]);
  return slug;
}

function UnitCard({
  course,
  module,
  status,
  previous,
  data,
  mastery,
  activeTopicId,
  current,
  targeted,
  asked,
}: {
  course: Course;
  module: Module;
  status: ModuleStatus;
  previous: Module | undefined;
  data: PathModuleData | undefined;
  mastery: Record<string, TopicMastery>;
  activeTopicId: string | null;
  /** The module the learner is on: open unless they shut it. */
  current: boolean;
  /** The module the URL's hash names: opened when it becomes so. */
  targeted: boolean;
  /** Bumped each time the Modules card asks for this module; 0 when it has not. */
  asked: number;
}) {
  const { state } = useLearner();
  const yours = state.userResources[module.id]?.length ?? 0;
  const [guideOpen, setGuideOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const guideId = useId();
  const bodyId = useId();
  const resourcesId = useId();

  // Open at first for the current module only. Later, becoming the current
  // module or the one a link points at opens the card; neither ever shuts
  // one the learner opened. Adjusted during render, the documented way to
  // follow a prop, so the card never paints shut for a frame first.
  const [open, setOpen] = useState(current || targeted);
  const [seen, setSeen] = useState({ current, targeted, asked });
  if (seen.current !== current || seen.targeted !== targeted || seen.asked !== asked) {
    if ((current && !seen.current) || (targeted && !seen.targeted) || asked > seen.asked) setOpen(true);
    setSeen({ current, targeted, asked });
  }
  const guidebook = data?.guidebook ?? null;
  const assets = data?.assets ?? null;

  const actions = (
    <>
      {guidebook ? (
        <Button href={conceptHref(guidebook)} variant="secondary" size="sm">
          Guidebook
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            // Opening the Guidebook on a shut card opens the card too.
            if (!guideOpen) setOpen(true);
            setGuideOpen((v) => !v);
          }}
          aria-expanded={guideOpen}
          aria-controls={guideId}
        >
          Guidebook
        </Button>
      )}
      {assets && assets.count > 0 && (
        <Chip href={assets.libraryHref} title={`Assets filed under this module's topic`}>
          Assets · {assets.count}
        </Chip>
      )}
    </>
  );

  return (
    <section
      id={module.slug}
      aria-label={`Module ${module.order}: ${module.title}`}
      className="flex scroll-mt-[72px] flex-col rounded-[20px] border-2 border-border bg-surface p-4 md:scroll-mt-[88px]"
    >
      <UnitHeader
        eyebrow={`Module ${module.order}`}
        title={module.title}
        subtitle={unitSubtitle(status, previous?.order)}
        muted={status.locked}
        actions={actions}
        toggle={{
          open,
          onToggle: () => setOpen((v) => !v),
          controls: bodyId,
          label: `Module ${module.order}: ${module.title}`,
        }}
      />

      {/* Spaced by each part's top margin rather than a gap, so a shut card
          (or a shut Guidebook) leaves no empty strip behind. */}
      <Collapse open={open} id={bodyId} className="flex flex-col">
        {!guidebook && (
          <Collapse open={guideOpen} id={guideId}>
            <div className="mt-3.5 rounded-2xl bg-surface2 p-4">
              {/* No "Guidebook" label here: the Guidebook button just opened it. */}
              <p className="text-[14px] text-text2">
                No concept note covers this module yet, so here is what it sets out to teach.
              </p>
              <ol className="mt-3 flex flex-col gap-2.5">
                {module.topics.map((t, i) => (
                  <li key={t.id} className="text-[14px]">
                    <p className="font-semibold text-text">
                      {i + 1}. {t.title}
                    </p>
                    {t.subtopics.length > 0 && <p className="text-text2">{t.subtopics.join(" · ")}</p>}
                  </li>
                ))}
              </ol>
            </div>
          </Collapse>
        )}

        {module.topics.length === 0 ? (
          <p className="mt-3.5 px-2 text-[14px] text-text2">This module has no topics yet.</p>
        ) : (
          <ol className="mt-3.5 flex flex-col px-2">
            {module.topics.map((t, i) => (
              <PathTopicRow
                key={t.id}
                course={course}
                module={module}
                topic={t}
                mastery={mastery[t.id]}
                active={t.id === activeTopicId}
                continueHref={continueHref(course.slug, module.slug, t.id, mastery[t.id])}
                last={i === module.topics.length - 1}
              />
            ))}
          </ol>
        )}

        <div className="mx-2 mt-3.5 border-t border-hair pt-3">
          <button
            type="button"
            onClick={() => setResourcesOpen((v) => !v)}
            aria-expanded={resourcesOpen}
            aria-controls={resourcesId}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm text-left text-[14px] font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span>
              Resources
              <span className="ml-2 font-normal text-text3">
                {module.resources.length} curated{yours > 0 ? ` · ${yours} yours` : ""}
              </span>
            </span>
            <CollapseChevron open={resourcesOpen} className="text-text3" />
          </button>
          <Collapse open={resourcesOpen} id={resourcesId}>
            <div className="pt-3">
              <ResourceList moduleId={module.id} curated={module.resources} />
            </div>
          </Collapse>
        </div>
      </Collapse>
    </section>
  );
}

function HeaderCard({
  course,
  status,
  continueHref: href,
  className,
}: {
  course: Course;
  status: PathStatus;
  continueHref: string | null;
  className?: string;
}) {
  const topicIds = course.modules.flatMap((m) => m.topics.map((t) => t.id));
  return (
    <div className={className}>
      <Card as="div">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[22px] font-bold leading-tight text-text lg:text-[18px]">
            {course.code} {course.title}
          </h1>
          <p className="text-[12px] text-text2">{courseSummaryLine(status)}</p>
        </div>
        <ProgressBar percent={status.percent} label={`${course.code} progress`} />
        <div className="flex flex-wrap items-center gap-2.5">
          {href ? (
            <Button href={href}>Continue</Button>
          ) : (
            <p className="text-[14px] font-semibold text-ok-text">Course complete</p>
          )}
          <ResetCourseButton topicIds={topicIds} />
        </div>
        {course.inferred && (
          <p className="rounded-xl border-l-4 border-warn bg-warn-tint px-3 py-2 text-[12px] text-text">
            <strong className="font-semibold">Inferred roadmap.</strong> The official syllabus is not published yet, so
            these topics are inferred from the course announcement and may change.
          </p>
        )}
      </Card>
    </div>
  );
}

function ModulesCard({
  course,
  status,
  onPick,
  className,
}: {
  course: Course;
  status: PathStatus;
  /** A row was chosen: open that module, as well as scrolling to it. */
  onPick: (slug: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <Card as="div" title="Modules">
        <ol className="flex flex-col gap-3">
          {course.modules.map((m, i) => {
            const s = status.modules[i]!;
            const percent = s.total === 0 ? 0 : (s.done / s.total) * 100;
            return (
              <li key={m.id}>
                <Link
                  href={`#${m.slug}`}
                  onClick={(event) => {
                    // A click that opens the link elsewhere (a new tab or
                    // window) leaves this page as it is.
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    onPick(m.slug);
                  }}
                  className="flex items-center gap-2.5 rounded-sm text-[13px] text-text hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="min-w-0 flex-1 truncate">
                    M{m.order} {m.title}
                  </span>
                  <span className="w-[110px] shrink-0">
                    <ProgressBar percent={percent} size="sm" label={`Module ${m.order} progress`} />
                  </span>
                  <span className="w-8 shrink-0 text-right text-[12px] tabular-nums text-text3">
                    {s.done}/{s.total}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

function AssetsCard({
  module,
  assets,
  reachable,
  className,
}: {
  module: Module | undefined;
  assets: ModuleAssets | null;
  reachable: boolean;
  className?: string;
}) {
  const action = assets && assets.count > 0 ? <CardAction href={assets.libraryHref}>Library</CardAction> : undefined;
  return (
    <div className={className}>
      <Card as="div" title="Assets for this module" action={action}>
        {!reachable ? (
          <p className="text-[13px] text-text2">The catalog did not answer, so the assets cannot be listed.</p>
        ) : !assets || assets.top.length === 0 ? (
          <p className="text-[13px] text-text2">
            Nothing is filed under {module ? `Module ${module.order}` : "this module"}&apos;s topic yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {assets.top.map((a) => (
              <li key={a.id}>
                <Link
                  href={a.href}
                  className="group flex items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <AssetThumb src={a.thumb} statusHref={a.thumbStatus} contain={a.diagram} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={cx(
                        "line-clamp-2 break-words text-[13px] font-medium leading-snug text-text group-hover:text-accent-text",
                        !a.titled && "font-mono text-[12px]",
                      )}
                    >
                      {a.title}
                    </span>
                    <span className="text-[12px] text-text2">{a.kindLabel}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AboutCard({
  course,
  related,
  className,
}: {
  course: Course;
  related: RelatedCourse[];
  className?: string;
}) {
  const facts = [
    `${course.credits} MC`,
    course.track,
    course.prereq ? `Prerequisites: ${course.prereq}` : undefined,
  ].filter((f): f is string => Boolean(f));
  return (
    <div className={className}>
      <Card as="div" title="About this course">
        <p className="text-[13px] text-text2">{facts.join(" · ")}</p>
        {course.notes && <p className="text-[13px] text-text">{course.notes}</p>}
        {course.capstone && (
          <div>
            <p className={LABEL}>Capstone</p>
            <p className="mt-1 text-[13px] text-text">{course.capstone}</p>
          </div>
        )}
        {related.length > 0 && (
          <div>
            <p className={LABEL}>Related courses</p>
            <ul className="mt-1 flex flex-col gap-1">
              {related.map((r) => (
                <li key={r.slug} className="text-[13px]">
                  <Link href={`/courses/${r.slug}`} className="font-medium text-accent-text underline-offset-4 hover:underline">
                    {r.code} {r.title}
                  </Link>
                  <span className="text-text3"> · {r.shared.join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
