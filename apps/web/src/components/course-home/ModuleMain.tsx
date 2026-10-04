"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { cx, FOCUS } from "@/components/ui/classes";
import { Collapse, CollapseChevron } from "@/components/ui/Collapse";
import { Panel } from "@/components/ui/Panel";
import { TextLink } from "@/components/ui/TextLink";
import {
  conceptHref,
  moduleConceptCount,
  moduleHref,
  moduleMeta,
  moduleObjectives,
  type ModuleStatus,
  type TopicMastery,
} from "@/lib/course-path";
import type { Course, Module } from "@/lib/types";

import { Glyph, META_GLYPH } from "./icons";
import { ModulePath } from "./ModulePath";
import { ROW_HOVER, ROW_META } from "./rows";
import type { ModuleData } from "./types";

/**
 * The main column: one module, laid out as Coursera lays out a module on its
 * course home. The title with the Guidebook beside it, a meta row of counts
 * with small icons, the module's description, "Show learning objectives",
 * then the module as one ordered path (`ModulePath`: before you start, its
 * material, its topics as lessons with a step per concept, practice), and
 * the links to the modules either side.
 *
 * Coursera's slots with nothing behind them here (time left, item types,
 * deadlines, grades) are left out rather than made up.
 */
export function ModuleMain({
  course,
  module,
  index,
  status,
  data,
  mastery,
  activeTopicId,
  assetsReachable,
  className,
}: {
  course: Course;
  module: Module;
  /** The module's place in `course.modules`. */
  index: number;
  status: ModuleStatus;
  data: ModuleData | undefined;
  mastery: Record<string, TopicMastery>;
  /** The topic Continue belongs to, when it is in this module. */
  activeTopicId: string | null;
  assetsReachable: boolean;
  className?: string;
}) {
  const previous = index > 0 ? course.modules[index - 1] : undefined;
  const next = course.modules[index + 1];
  const assets = data?.assets ?? null;
  const meta = moduleMeta({
    status,
    concepts: moduleConceptCount(module.topics.map((t) => mastery[t.id])),
    assets: assetsReachable ? (assets?.count ?? 0) : null,
  });

  return (
    <Panel as="section" className={className}>
      {/* A new module's words fade in over the panel, which stays put. */}
      <div className="flex animate-fade-in flex-col px-1 py-1 motion-reduce:animate-none sm:px-4 sm:py-2">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] leading-5 text-text2">
              Module {module.order} of {course.modules.length}
            </p>
            <h1 className="mt-1 text-[22px] font-semibold leading-7 text-text">
              {module.title}
            </h1>
          </div>
          {data?.guidebook && (
            <Button href={conceptHref(data.guidebook)} variant="secondary" size="sm">
              Guidebook
            </Button>
          )}
        </div>

        <ul className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] leading-6 text-text">
          {meta.map((part) => (
            <li key={part.icon} className="flex items-center gap-1.5">
              <Glyph name={META_GLYPH[part.icon]} size={16} className="text-text2" />
              {part.text}
            </li>
          ))}
        </ul>

        {status.locked && previous && (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2 text-[14px] text-text">
            <Glyph name="lock" size={16} className="text-text2" />
            <span>
              Opens once you start{" "}
              <TextLink href={moduleHref(course.slug, previous.slug)}>
                Module {previous.order}: {previous.title}
              </TextLink>
              . Its topics are here to read in the meantime.
            </span>
          </p>
        )}

        {data?.description && <p className="mt-4 max-w-[68ch] text-[16px] leading-6 text-text">{data.description}</p>}

        <Objectives items={moduleObjectives(module.topics)} />

        <ModulePath
          course={course}
          module={module}
          data={data}
          mastery={mastery}
          activeTopicId={activeTopicId}
          assetsReachable={assetsReachable}
        />

        {(previous || next) && (
          <nav aria-label="Other modules" className="-mx-2 mt-6 grid gap-2 border-t border-hair pt-4 sm:grid-cols-2">
            {previous ? (
              <NeighbourLink href={moduleHref(course.slug, previous.slug)} direction="previous" module={previous} />
            ) : (
              <span aria-hidden className="max-sm:hidden" />
            )}
            {next && <NeighbourLink href={moduleHref(course.slug, next.slug)} direction="next" module={next} />}
          </nav>
        )}
      </div>
    </Panel>
  );
}

/** "Show learning objectives": the module's subtopics, numbered, behind a toggle. */
function Objectives({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        className={cx(
          "-mx-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 text-[14px] font-semibold leading-5 text-text transition-colors duration-100 hover:bg-surface2 hover:underline motion-reduce:transition-none",
          FOCUS,
        )}
      >
        {open ? "Hide learning objectives" : "Show learning objectives"}
        <CollapseChevron open={open} className="h-4 w-4" />
      </button>
      <Collapse open={open} id={listId}>
        <ol className="mt-2 list-decimal space-y-1 pl-6 text-[16px] leading-6 text-text marker:text-text2">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </Collapse>
    </div>
  );
}

function NeighbourLink({
  href,
  direction,
  module,
}: {
  href: string;
  direction: "previous" | "next";
  module: Module;
}) {
  const next = direction === "next";
  return (
    <Link
      href={href}
      className={cx(
        "flex min-w-0 items-center gap-2 rounded-lg p-2",
        ROW_HOVER,
        FOCUS,
        next && "justify-end text-right sm:col-start-2",
      )}
    >
      {!next && <Glyph name="previous" className="text-text2" />}
      <span className="min-w-0">
        <span className={ROW_META}>{next ? "Next module" : "Previous module"}</span>
        <span className="block truncate text-[16px] font-semibold leading-6 text-text">
          {module.order}. {module.title}
        </span>
      </span>
      {next && <Glyph name="next" className="text-text2" />}
    </Link>
  );
}
