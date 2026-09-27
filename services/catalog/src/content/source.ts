import type { ContentSource, ContentType } from "@self-learn/content";

import type { CatalogDatabase } from "../db";

/**
 * The database implementation of `ContentSource`, one method per track.
 *
 * Every method refuses until its track fills it in (docs/CONTENT-MIGRATION.md,
 * phase 1): track A answers `topics` and `tags`, B `courses`, C `concept` and
 * `sessionLog`, D `diagram`. It lives in the catalog because the catalog owns
 * the connection; the interface and the switch that chooses between this and
 * `fileSource` live in `packages/content`.
 *
 * A refusal rather than an empty answer, because an empty vocabulary or course
 * list would render as a site with nothing in it and no error anywhere. Nothing
 * reaches these today: every type resolves to files until `catalog flip`
 * writes its `content_source` row or `CONTENT_SOURCE` names it.
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

export function dbSource(db: CatalogDatabase): ContentSource {
  // Held for the tracks that fill these in; no query runs yet.
  void db;
  const refuse = (type: ContentType) => async (): Promise<never> => {
    throw new NotMigratedError(type);
  };
  return {
    topics: refuse("topics"),
    tags: refuse("tags"),
    courses: refuse("courses"),
    concept: refuse("concepts"),
    sessionLog: refuse("sessions"),
    diagram: refuse("diagrams"),
  };
}
