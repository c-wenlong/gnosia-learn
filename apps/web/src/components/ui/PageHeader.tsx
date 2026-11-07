import type { ReactNode } from "react";

import { type COLUMN_TITLE, type CONCEPT_TITLE, cx, NOTE, PAGE_TITLE } from "./classes";
import { Eyebrow } from "./Eyebrow";

/**
 * Kit `PageHeader`: a page's `<h1>` with what sits around it. An optional
 * place line over it (the kit `Eyebrow`: "CS4263 · Module 1 · Informed
 * search"), an optional note under it (`NOTE`), and the page's actions at the
 * right, wrapping under the title when the row is too narrow for both (on a
 * phone they take the whole row, so a search there is full width). With
 * actions, the note runs under the whole row rather than the title alone.
 *
 * `titleClass` is the title's role, `PAGE_TITLE` by default. The roles differ
 * on purpose, so a page keeps its own: a concept is `CONCEPT_TITLE`, a
 * module in the course column `COLUMN_TITLE`. `noteBeside` puts the note on
 * the title's baseline instead of under it, for a short title with a count
 * after it (Learn). `noteId` names the note, for a control in `actions` that
 * it describes.
 *
 * No state and no hooks, so a server component draws it.
 */
/** The title roles a page header takes; the close screen's is `FocusHeading`'s. */
export type PageTitleRole = typeof PAGE_TITLE | typeof CONCEPT_TITLE | typeof COLUMN_TITLE;

export function PageHeader({
  eyebrow,
  title,
  titleClass = PAGE_TITLE,
  note,
  noteId,
  noteBeside = false,
  actions,
  className,
}: {
  /** Where the page sits, drawn as the kit `Eyebrow`. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** The title's type role: `PAGE_TITLE`, `CONCEPT_TITLE` or `COLUMN_TITLE`. */
  titleClass?: PageTitleRole;
  /** A line about the page, in `NOTE`. */
  note?: ReactNode;
  noteId?: string;
  /** The note on the title's baseline rather than under it. */
  noteBeside?: boolean;
  /** Buttons, a search, a status: in a row at the right. */
  actions?: ReactNode;
  className?: string;
}) {
  const heading = <h1 className={titleClass}>{title}</h1>;
  const hasActions = present(actions);
  // With actions beside the title, a stacked note runs under the whole row,
  // so a long one is not squeezed into the title's column.
  const noteRow = present(note) && !noteBeside && hasActions;
  const line = present(note) ? (
    <p id={noteId} className={cx(NOTE, noteRow && "basis-full")}>
      {note}
    </p>
  ) : null;
  return (
    <header className={cx("flex flex-wrap items-center gap-x-4 gap-y-3", className)}>
      <div className="flex min-w-0 flex-1 basis-[18rem] flex-col gap-1">
        {present(eyebrow) && <Eyebrow>{eyebrow}</Eyebrow>}
        {noteBeside && line !== null ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {heading}
            {line}
          </div>
        ) : (
          <>
            {heading}
            {!noteRow && line}
          </>
        )}
      </div>
      {hasActions && <div className="flex flex-wrap items-center gap-3.5 max-sm:w-full">{actions}</div>}
      {noteRow && line}
    </header>
  );
}

function present(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== "";
}
