"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { cx } from "@/components/ui/classes";
import { CollapseChevron } from "@/components/ui/Collapse";
import { Panel } from "@/components/ui/Panel";
import { moduleHref, moduleMark, type PathStatus } from "@/lib/course-path";
import type { Course } from "@/lib/types";

import { Glyph, ModuleMarkIcon } from "./icons";
import { FOCUS_RING, ROW_HOVER } from "./rows";

/**
 * The left column, after Coursera's course sidebar: the course's code and
 * title, then "Course material", one row per module linking to its own page
 * with a status mark and its done count, the module on screen tinted. Under
 * it, the course's assets in the library when there are any (the top bar's
 * Library is every course's).
 *
 * Below 768px of page (the course grid's container query, the same one that
 * puts it beside the module) it becomes a compact picker over the module:
 * the toggle names the module on screen, and the list opens under it. The
 * two toggles are two buttons, one per width, because which one shows is a
 * container query and the list's open state has to be separate for each.
 *
 * The list glides open and shut the way `Collapse` does (grid rows from 0fr
 * to 1fr, with a fade), written out here because which of the two states
 * applies is a container query, which `Collapse` cannot take. A shut list is
 * `invisible` rather than `inert`, for the same reason: visibility can follow
 * the container query, and it takes the links out of the tab order and the
 * accessibility tree just the same, once the fold has finished.
 */
export function CourseSidebar({
  course,
  status,
  selected,
  libraryHref,
  className,
}: {
  course: Course;
  status: PathStatus;
  /** The index of the module on screen. */
  selected: number;
  /** The library filtered to this course, or null when it holds nothing for it. */
  libraryHref: string | null;
  className?: string;
}) {
  const [wideOpen, setWideOpen] = useState(true);
  const [narrowOpen, setNarrowOpen] = useState(false);
  const listId = useId();
  const current = course.modules[selected];

  return (
    <Panel as="aside" aria-label="Course" className={className}>
      <div className="px-2 pt-1">
        <p className="text-[14px] leading-5 text-text2">{course.code}</p>
        <p className="mt-1 text-[20px] font-semibold leading-6 text-text">{course.title}</p>
      </div>

      <nav aria-label="Course material" className="flex flex-col">
        <button
          type="button"
          onClick={() => setWideOpen((v) => !v)}
          aria-expanded={wideOpen}
          aria-controls={listId}
          className={cx(
            "hidden min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg p-2 text-left text-[16px] leading-6 text-text @3xl:flex",
            ROW_HOVER,
            FOCUS_RING,
          )}
        >
          Course material
          <CollapseChevron open={wideOpen} className="text-text" />
        </button>
        {current && (
          <button
            type="button"
            onClick={() => setNarrowOpen((v) => !v)}
            aria-expanded={narrowOpen}
            aria-controls={listId}
            className={cx(
              "flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-2 border-border px-3 py-2 text-left @3xl:hidden",
              FOCUS_RING,
            )}
          >
            <span className="min-w-0">
              <span className="block text-[12px] leading-4 text-text2">
                Module {current.order} of {course.modules.length}
              </span>
              <span className="block truncate text-[15px] font-semibold leading-6 text-text">{current.title}</span>
            </span>
            <CollapseChevron open={narrowOpen} className="text-text2" />
          </button>
        )}

        <div
          id={listId}
          className={cx(
            "grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-soft motion-reduce:transition-none",
            narrowOpen ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
            wideOpen
              ? "@3xl:visible @3xl:grid-rows-[1fr] @3xl:opacity-100"
              : "@3xl:invisible @3xl:grid-rows-[0fr] @3xl:opacity-0",
          )}
        >
          <div className="min-h-0 overflow-clip [overflow-clip-margin:4px]">
            <ol className="flex flex-col gap-0.5 pt-1">
              {course.modules.map((m, i) => {
                const s = status.modules[i]!;
                const here = i === selected;
                return (
                  <li key={m.id}>
                    <Link
                      href={moduleHref(course.slug, m.slug)}
                      aria-current={here ? "page" : undefined}
                      onClick={() => setNarrowOpen(false)}
                      className={cx(
                        "flex min-h-9 items-center gap-2.5 rounded-lg p-2 text-[14px] leading-5 text-text transition-colors duration-150 motion-reduce:transition-none",
                        here ? "bg-tint font-semibold" : "hover:bg-tint",
                        FOCUS_RING,
                      )}
                    >
                      <ModuleMarkIcon mark={moduleMark(s)} fraction={s.total === 0 ? 0 : s.done / s.total} />
                      <span className="min-w-0 flex-1">
                        {m.order}. {m.title}
                      </span>
                      <span className="shrink-0 text-[12px] font-normal tabular-nums text-text2">
                        {s.done}/{s.total}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </nav>

      {libraryHref && (
        <Link
          href={libraryHref}
          className={cx(
            "flex min-h-10 items-center gap-2.5 rounded-lg p-2 text-[16px] leading-6 text-text",
            ROW_HOVER,
            FOCUS_RING,
          )}
        >
          <Glyph name="assets" className="text-text2" />
          Course assets
        </Link>
      )}
    </Panel>
  );
}
