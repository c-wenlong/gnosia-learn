import type { Course, TagMeta, TopicEntry } from "./types";

/**
 * Where a reader gets authored content from, without knowing where it lives.
 *
 * Today every type is a file under `content/` or `learn/`. The migration in
 * docs/CONTENT-MIGRATION.md moves them into Postgres one type at a time, and
 * this interface is the seam that lets it: `fileSource` reads the files,
 * `dbSource` in `@gnosia/catalog` reads the rows, and `selectSource` picks
 * one per type. A caller holds a `ContentSource` and never learns which.
 *
 * Every method is async because a database read is, and a synchronous
 * interface cannot be served from `pg` (D9). The file implementation is async
 * only in signature; it still parses with the synchronous functions the
 * catalog indexers call, so both sides refuse exactly the same files.
 *
 * The three single-item methods return `null` for a slug nothing answers to,
 * which is a 404 for the caller. They return the stored text rather than a
 * parsed note: the notes are written in a frontmatter dialect of their own
 * (`services/catalog/src/index/frontmatter.ts`), and a second parser here
 * would be a third reading of one format.
 */
export interface ContentSource {
  /** The shared topic vocabulary, in authored order. */
  topics(): Promise<TopicEntry[]>;
  /** The cross-course themes, in authored order. */
  tags(): Promise<TagMeta[]>;
  /** Every course, validated against the vocabulary and the themes, in `order:`. */
  courses(): Promise<Course[]>;
  /** One concept note by its id, or null when no note has that id. */
  concept(slug: string): Promise<ConceptNoteSource | null>;
  /** One session log by its id (the file stem today), or null. */
  sessionLog(id: string): Promise<SessionLogSource | null>;
  /** One diagram's tldraw document by its slug, or null. */
  diagram(slug: string): Promise<DiagramSource | null>;
}

/**
 * The content types a source can be chosen for, one per method family.
 *
 * These are the names `CONTENT_SOURCE` takes (`topics=db,courses=files`), and
 * the same names `catalog index --only` uses for the indexers that read them,
 * so one word means one type everywhere a person types it.
 */
export const CONTENT_TYPES = ["topics", "tags", "courses", "concepts", "sessions", "diagrams"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Which implementation serves a type. */
export const SOURCE_KINDS = ["files", "db"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Which `ContentSource` method each type answers. */
export const METHOD_TYPES = {
  topics: "topics",
  tags: "tags",
  courses: "courses",
  concept: "concepts",
  sessionLog: "sessions",
  diagram: "diagrams",
} as const satisfies Record<keyof ContentSource, ContentType>;

/**
 * A concept note as stored: the whole file, frontmatter included.
 *
 * `path` is the repo-relative name the catalog already uses for the note's
 * asset row, and it stays that string after the file is gone (D11), so a
 * database implementation returns the same value.
 */
export interface ConceptNoteSource {
  slug: string;
  /** The folder under `learn/concepts/` today; a `concept.domain` column after track C. */
  domain: string;
  path: string;
  /** Frontmatter and body, exactly as written. */
  markdown: string;
}

/** A session log as stored: frontmatter and every entry, as one document. */
export interface SessionLogSource {
  id: string;
  path: string;
  markdown: string;
}

/**
 * A diagram's editable source.
 *
 * `document` is the parsed `.tldr` JSON and is not validated here: its shape
 * is tldrawkc's, and the catalog's `tldr.ts` is where the stamp is read.
 * `svgPath` is the exported SVG beside it, or null when there is none; after
 * track D the SVG is a blob and this becomes its logical path.
 */
export interface DiagramSource {
  slug: string;
  path: string;
  document: unknown;
  svgPath: string | null;
}
