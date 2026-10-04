"use client";

import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { Collapse, CollapseChevron } from "@/components/ui/Collapse";
import { continueHref, type TopicMastery } from "@/lib/course-path";
import { useLearner } from "@/lib/learner-context";
import { MASTERY_BUCKET_LABEL } from "@/lib/mastery-bucket";
import {
  conceptMeta,
  modulePath,
  weekCheckHref,
  weekCheckMeta,
  type ConceptStep,
  type PathAsset,
  type PathPrerequisite,
} from "@/lib/module-path";
import type { Course, Module } from "@/lib/types";

import { FAMILY_GLYPH, Glyph, type GlyphName } from "./icons";
import { ModuleResources, ResourceRow } from "./ModuleResources";
import { FOCUS_RING, ROW, ROW_BOX, ROW_HOVER, ROW_LIST, ROW_META, ROW_TITLE, STRETCHED } from "./rows";
import { TopicRow } from "./TopicRow";
import type { ModuleData } from "./types";

/**
 * A module's material as one ordered path (`@/lib/module-path`), drawn as
 * Coursera draws a module: groups of item rows in the order to take them.
 *
 * Before you start (only when something is unmastered), Watch (only when a
 * video is placed), Read alongside with the learner's own resources and the
 * add form, then one group per lesson: the lesson's row as the header (its
 * mark from `topicDone`, its tools behind the toggle, Continue on the active
 * one) and its steps under it, each concept's note with Quiz me on the same
 * row, then its diagrams and videos, then the lesson's readings. Practice, when there is any,
 * follows the lessons, then the week check, one row whose title says what it
 * is and whose meta line says how big (no group heading over it to say the
 * same again), and the library link for everything filed under the module's
 * topic comes once, last.
 *
 * Each row carries its kind's icon and nothing that says the same thing
 * again: the group says where a row is, the icon what it is.
 */
export function ModulePath({
  course,
  module,
  data,
  mastery,
  activeTopicId,
  assetsReachable,
}: {
  course: Course;
  module: Module;
  data: ModuleData | undefined;
  mastery: Record<string, TopicMastery>;
  activeTopicId: string | null;
  assetsReachable: boolean;
}) {
  const { state } = useLearner();
  const path = useMemo(
    () =>
      modulePath({
        module,
        concepts: data?.concepts ?? [],
        mastery,
        completed: state.completed,
        assets: data?.path ?? null,
        checks: data?.checks ?? null,
      }),
    [module, data, mastery, state.completed],
  );
  const library = data?.assets ?? null;

  return (
    <div className="-mx-2 mt-6 flex flex-col">
      {path.before.length > 0 && (
        <ItemGroup title="Before you start">
          <ol className={ROW_LIST}>
            {path.before.map((p) => (
              <Prerequisite key={p.slug} prerequisite={p} />
            ))}
          </ol>
        </ItemGroup>
      )}

      {path.watch.length > 0 && (
        <ItemGroup title="Watch" divided={path.before.length > 0}>
          <ol className={ROW_LIST}>
            {path.watch.map((a) => (
              <AssetRow key={a.id} asset={a} />
            ))}
          </ol>
        </ItemGroup>
      )}

      <ItemGroup title="Read alongside" divided={path.before.length > 0 || path.watch.length > 0}>
        <ModuleResources moduleId={module.id} curated={path.readAlongside} />
      </ItemGroup>

      {module.topics.length === 0 ? (
        <p className="mt-2 border-t border-hair px-2 pb-3 pt-4 text-[14px] text-text2">This module has no topics yet.</p>
      ) : (
        <ol aria-label="Topics" className="flex flex-col">
          {path.lessons.map((lesson) => (
            <li key={lesson.item.id} className="mt-2 border-t border-hair pt-2">
              <ul className={ROW_LIST}>
                <TopicRow
                  course={course}
                  module={module}
                  topic={lesson.item}
                  mastery={mastery[lesson.item.id]}
                  active={lesson.item.id === activeTopicId}
                  continueHref={continueHref(course.slug, module.slug, lesson.item.id, mastery[lesson.item.id])}
                />
              </ul>
              {(lesson.videos.length > 0 || lesson.concepts.length > 0 || lesson.readings.length > 0) && (
                <ol className={cx(ROW_LIST, "ml-[17px] border-l border-hair pl-[11px] max-sm:ml-[9px] max-sm:pl-[7px]")}>
                  {lesson.videos.map((a) => (
                    <AssetRow key={a.id} asset={a} />
                  ))}
                  {lesson.concepts.map((step) => (
                    <ConceptSteps key={step.slug} step={step} />
                  ))}
                  {lesson.readings.map((r) => (
                    <ResourceRow key={r.id} resource={r} />
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}

      {path.practice.length > 0 && (
        <ItemGroup title="Practice" divided>
          <ol className={ROW_LIST}>
            {path.practice.map((r) => (
              <ResourceRow key={r.id} resource={r} />
            ))}
          </ol>
        </ItemGroup>
      )}

      {path.check !== null && (
        <ol className={cx(ROW_LIST, "mt-2 border-t border-hair pt-2")}>
          <StepRow
            href={weekCheckHref(course.slug, module.slug)}
            glyph="check"
            title="Week check"
            meta={weekCheckMeta(path.check)}
          />
        </ol>
      )}

      {!assetsReachable ? (
        <p className="mt-2 border-t border-hair px-2 pb-1 pt-4 text-[14px] text-text2">
          The catalog did not answer, so the videos and diagrams cannot be placed.
        </p>
      ) : (
        library &&
        library.count > 0 && (
          <div className="mt-2 border-t border-hair pt-2">
            <Link href={library.libraryHref} className={cx(ROW, ROW_HOVER, FOCUS_RING, "min-h-[44px] text-[14px] font-semibold text-text")}>
              <Glyph name="assets" className="text-text2" />
              <span className="pl-1">All {library.count} in the library</span>
            </Link>
          </div>
        )
      )}
    </div>
  );
}

/** One linked row: the kind's icon, the title, the meta line. */
function StepRow({
  href,
  glyph,
  title,
  meta,
  mono = false,
  label,
}: {
  href: string;
  glyph: GlyphName;
  title: string;
  meta: string;
  mono?: boolean;
  label?: string;
}) {
  return (
    <li>
      <Link href={href} aria-label={label} className={cx(ROW, ROW_HOVER, FOCUS_RING)}>
        <Glyph name={glyph} className="text-text2" />
        <span className="min-w-0 flex-1 pl-1">
          <span className={cx(ROW_TITLE, "break-words", mono && "font-mono text-[14px]")}>{title}</span>
          <span className={ROW_META}>{meta}</span>
        </span>
      </Link>
    </li>
  );
}

const EDGE_LABEL: Record<PathPrerequisite["edge"], string> = {
  requires: "Needed first",
  assumes: "Background",
};

function Prerequisite({ prerequisite: p }: { prerequisite: PathPrerequisite }) {
  return (
    <StepRow href={p.href} glyph="concepts" title={p.title} meta={`${EDGE_LABEL[p.edge]} · ${MASTERY_BUCKET_LABEL[p.bucket]}`} />
  );
}

function AssetRow({ asset: a }: { asset: PathAsset }) {
  return <StepRow href={a.href} glyph={FAMILY_GLYPH[a.family]} title={a.title} meta={a.kindLabel} mono={!a.titled} />;
}

/**
 * A concept's step: one row for the note, with Quiz me at its end (under the
 * title on a phone), then a row for each diagram and video placed on it.
 * The note link stretches over the row; Quiz me is raised above it and keeps
 * its own click.
 */
function ConceptSteps({ step }: { step: ConceptStep }) {
  return (
    <>
      <li>
        <div
          className={cx(
            ROW_BOX,
            ROW_HOVER,
            "grid grid-cols-[minmax(0,1fr)] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_auto]",
          )}
        >
          <Link href={step.href} className={cx("flex min-w-0 items-center gap-2", STRETCHED)}>
            <Glyph name="text" className="text-text2" />
            <span className="min-w-0 flex-1 pl-1">
              <span className={cx(ROW_TITLE, "break-words")}>{step.title}</span>
              <span className={ROW_META}>{conceptMeta(step)}</span>
            </span>
          </Link>
          {step.quizHref !== null && (
            <Button
              href={step.quizHref}
              variant="secondary"
              size="sm"
              aria-label={`Quiz me on ${step.title}`}
              className="relative z-10 ml-8 mt-2 justify-self-start sm:ml-0 sm:mt-0"
            >
              Quiz me
            </Button>
          )}
        </div>
      </li>
      {step.assets.map((a) => (
        <AssetRow key={a.id} asset={a} />
      ))}
    </>
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
