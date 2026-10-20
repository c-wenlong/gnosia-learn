import type { ContentSource, ContentType } from "@gnosia/content";

import type { CatalogDatabase } from "../../db";
import type { OwnerScope } from "../scope";

/**
 * The shape every per-type database reader under `readers/` has, and the
 * stub each one starts as.
 *
 * One file per content type, so each phase 1 track edits its own file and no
 * other: it implements `read` from rows and sets `ready: true` in the same
 * change. `../source.ts` composes the six into `dbSource`, and `../flip.ts`
 * derives `DB_READERS` from the `ready` flags, so there is no shared list for
 * two tracks to collide in.
 */
export interface TypeReader<M extends keyof ContentSource> {
  /**
   * True once `read` answers from rows. `catalog flip` refuses a type whose
   * reader is not ready, because every reader follows the flipped row and
   * would fail on the refusal below.
   */
  readonly ready: boolean;
  /**
   * The `ContentSource` method for this type, over one connection, answering
   * only from rows `scope.readable` owns (phase 4): another owner's topic,
   * note or diagram is absent, exactly as a slug nobody holds is.
   */
  readonly read: (db: CatalogDatabase, scope: OwnerScope) => ContentSource[M];
}

/**
 * The refusal a reader answers with until its track fills it in. A refusal
 * rather than an empty answer, because an empty vocabulary or course list
 * would render as a site with nothing in it and no error anywhere.
 */
export class NotMigratedError extends Error {
  readonly type: ContentType;
  constructor(type: ContentType) {
    super(
      `${type} is not migrated yet: nothing reads it from the database until its track lands. ` +
        `Unset CONTENT_SOURCE for ${type}, or set it to files.`,
    );
    this.name = "NotMigratedError";
    this.type = type;
  }
}

/** A `read` that refuses with `NotMigratedError`, and never touches the connection. */
export function notMigrated(type: ContentType): (db: CatalogDatabase, scope: OwnerScope) => () => Promise<never> {
  return () => async () => {
    throw new NotMigratedError(type);
  };
}
