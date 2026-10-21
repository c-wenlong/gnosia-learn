import { type ContentSource, type ContentType, METHOD_TYPES } from "@gnosia/content";

import type { CatalogDatabase } from "../db";
import type { OwnerScope } from "./scope";
import { reader as concept } from "./readers/concepts";
import { reader as courses } from "./readers/courses";
import { reader as diagram } from "./readers/diagrams";
import type { TypeReader } from "./readers/reader";
import { reader as sessionLog } from "./readers/sessions";
import { reader as tags } from "./readers/tags";
import { reader as topics } from "./readers/topics";

export { NotMigratedError } from "./readers/reader";

/**
 * The database implementation of `ContentSource`, composed from one reader
 * per content type.
 *
 * **The layout.** Each type's reader is its own file under `readers/`:
 * `topics.ts` and `tags.ts` (track A), `courses.ts` (B), `concepts.ts` and
 * `sessions.ts` (C), `diagrams.ts` (D). Each exports `reader`, a
 * `{ ready, read }` pair (`readers/reader.ts`), and starts as
 * `{ ready: false, read: notMigrated("<type>") }`, which refuses with
 * `NotMigratedError`. A track implements `read` and sets `ready: true` in its
 * own file and nowhere else: this file composes them, and `flip.ts` derives
 * `DB_READERS` from the flags, so five tracks building at once never edit a
 * shared line.
 *
 * It lives in the catalog because the catalog owns the connection; the
 * interface and the switch that chooses between this and `fileSource` live in
 * `packages/content`. Nothing reaches a refusing reader today: every type
 * resolves to files until `catalog flip` writes its `content_source` row or
 * `CONTENT_SOURCE` names it.
 */
export const READERS: { readonly [M in keyof ContentSource]: TypeReader<M> } = {
  topics,
  tags,
  courses,
  concept,
  sessionLog,
  diagram,
};

/**
 * The seam's database half for one owner: every method answers only from rows
 * `scope.readable` owns. `scope` is required, not defaulted, so a caller
 * cannot read every owner's content by leaving it out; the web app passes
 * `ownerScope(await currentOwner())`, the CLIs `cliScope()`.
 */
export function dbSource(db: CatalogDatabase, scope: OwnerScope): ContentSource {
  return {
    topics: READERS.topics.read(db, scope),
    tags: READERS.tags.read(db, scope),
    courses: READERS.courses.read(db, scope),
    concept: READERS.concept.read(db, scope),
    sessionLog: READERS.sessionLog.read(db, scope),
    diagram: READERS.diagram.read(db, scope),
  };
}

/** The content types whose reader says it is ready. */
export function readyTypes(
  readers: { readonly [M in keyof ContentSource]: { readonly ready: boolean } } = READERS,
): ReadonlySet<ContentType> {
  return new Set(
    (Object.keys(readers) as (keyof ContentSource)[])
      .filter((method) => readers[method].ready)
      .map((method) => METHOD_TYPES[method]),
  );
}
