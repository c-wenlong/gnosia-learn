"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { Collapse, CollapseChevron } from "@/components/ui/Collapse";
import { Panel } from "@/components/ui/Panel";
import {
  conceptHref,
  continueHref,
  moduleConceptCount,
  moduleHref,
  moduleMeta,
  moduleObjectives,
  type ModuleStatus,
  type TopicMastery,
} from "@/lib/course-path";
import type { Course, Module } from "@/lib/types";

import { FAMILY_GLYPH, Glyph, META_GLYPH } from "./icons";
import { ModuleResources } from "./ModuleResources";
import { FOCUS_RING, ROW, ROW_HOVER, ROW_LIST, ROW_META, ROW_TITLE } from "./rows";
import { TopicRow } from "./TopicRow";
import type { ModuleData } from "./types";

/**
 * The main column: one module, laid out as Coursera lays out a module on its
 * course home. The title with the Guidebook beside it, a meta row of counts
 * with small icons, the module's description, "Show learning objectives",
 * then the module's items in collapsible groups (its topics, its resources,
 * its assets), and the links to the modules either side.
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
      <div className="flex flex-col px-1 py-1 sm:px-4 sm:py-2">
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
              <Link href={moduleHref(course.slug, previous.slug)} className="font-medium text-accent-text underline-offset-4 hover:underline">
                Module {previous.order}: {previous.title}
              </Link>
              . Its topics are here to read in the meantime.
            </span>
          </p>
        )}

        {data?.description && <p className="mt-4 max-w-[68ch] text-[16px] leading-6 text-text">{data.description}</p>}

        <Objectives items={moduleObjectives(module.topics)} />

        <div className="-mx-2 mt-6 flex flex-col">
          <ItemGroup title="Topics">
            {module.topics.length === 0 ? (
              <p className="px-2 py-3 text-[14px] text-text2">This module has no topics yet.</p>
            ) : (
              <ul className={ROW_LIST}>
                {module.topics.map((t) => (
                  <TopicRow
                    key={t.id}
                    course={course}
                    module={module}
                    topic={t}
                    mastery={mastery[t.id]}
                    active={t.id === activeTopicId}
                    continueHref={continueHref(course.slug, module.slug, t.id, mastery[t.id])}
                  />
                ))}
              </ul>
            )}
          </ItemGroup>

          <ItemGroup title="Resources" divided>
            <ModuleResources moduleId={module.id} curated={module.resources} />
          </ItemGroup>

          {!assetsReachable ? (
            <ItemGroup title="Assets" divided>
              <p className="px-2 py-3 text-[14px] text-text2">The catalog did not answer, so the assets cannot be listed.</p>
            </ItemGroup>
          ) : (
            assets &&
            assets.count > 0 && (
              <ItemGroup title="Assets" divided>
                <ul className={ROW_LIST}>
                  {assets.top.map((a) => (
                    <li key={a.id}>
                      <Link href={a.href} className={cx(ROW, ROW_HOVER, FOCUS_RING)}>
                        <Glyph name={FAMILY_GLYPH[a.family]} className="text-text2" />
                        <span className="min-w-0 flex-1 pl-1">
                          <span className={cx(ROW_TITLE, "break-words", !a.titled && "font-mono text-[14px]")}>{a.title}</span>
                          <span className={ROW_META}>{a.kindLabel}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      href={assets.libraryHref}
                      className={cx(ROW, ROW_HOVER, FOCUS_RING, "min-h-[44px] text-[14px] font-semibold text-text")}
                    >
                      <Glyph name="assets" className="text-text2" />
                      <span className="pl-1">
                        {assets.count > assets.top.length ? `All ${assets.count} in the library` : "Open in the library"}
                      </span>
                    </Link>
                  </li>
                </ul>
              </ItemGroup>
            )
          )}
        </div>

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

/**
 * Coursera's lesson group: a 40px full-width header with a chevron that folds
 * the rows under it, and a hairline between groups.
 */
function ItemGroup({ title, divided = false, children }: { title: string; divided?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <section className={cx(divided && "mt-2 border-t border-hair pt-2")}>
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className={cx(
            "flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg p-2 text-left text-[16px] leading-6 text-text",
            ROW_HOVER,
            FOCUS_RING,
          )}
        >
          {title}
          <CollapseChevron open={open} className="text-text" />
        </button>
      </h2>
      <Collapse open={open} id={bodyId}>
        <div className="pt-1">{children}</div>
      </Collapse>
    </section>
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
          "-mx-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 text-[14px] font-semibold leading-5 text-text hover:bg-surface2 hover:underline",
          FOCUS_RING,
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
        FOCUS_RING,
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
