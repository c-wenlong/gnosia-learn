import { ContentError } from "./errors";
import {
  CONTENT_TYPES,
  METHOD_TYPES,
  SOURCE_KINDS,
  type ContentSource,
  type ContentType,
  type SourceKind,
} from "./source";

/**
 * Which implementation serves each content type, decided per type.
 *
 * Three inputs, in this order of precedence for a reader:
 *
 * 1. **`CONTENT_SOURCE`**, when it names the type. `files` or `db` sets every
 *    type; `topics=db,courses=files` sets the ones it lists. It is the read
 *    rollback lever and the tests' switch, and it overrides readers only.
 * 2. **The `content_source` row**, through the `ownership` callback, when the
 *    database answers. The row is the authority: `catalog flip` writes it, and
 *    importers and writers obey it whatever the variable says (D18). A reader
 *    follows it unless the variable says otherwise.
 * 3. **`files`**, the default for every type until its track flips it.
 *
 * Why the variable does not decide for writers: a variable set differently in
 * two processes is two truths, and a row is one. For a reader the worst a
 * stale variable can do is show an older copy, and D17's write-through
 * export keeps the files current while any reader can still be pointed at
 * them.
 *
 * An `ownership` callback that throws (the database is down) resolves as if
 * no row existed, so every type falls back to files and a page still renders.
 * That is the degradation the files were always going to give; the reason is
 * reported once through `onOwnershipError`.
 */

export const CONTENT_SOURCE_VAR = "CONTENT_SOURCE";

export type Ownership = Partial<Record<ContentType, SourceKind>>;

export type ResolvedFrom = "variable" | "row" | "default";

export interface Resolution {
  kind: SourceKind;
  from: ResolvedFrom;
}

export type Resolutions = Record<ContentType, Resolution>;

function isKind(value: string): value is SourceKind {
  return (SOURCE_KINDS as readonly string[]).includes(value);
}

function isType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * `CONTENT_SOURCE`, parsed. Unset or blank is no override.
 *
 * A value this cannot read is refused rather than ignored: it is a rollback
 * lever, and a typo that silently did nothing would leave a person believing
 * they had rolled back.
 */
export function parseContentSource(value: string | undefined): Ownership {
  const text = value?.trim() ?? "";
  if (text === "") return {};
  if (isKind(text)) {
    return Object.fromEntries(CONTENT_TYPES.map((type) => [type, text])) as Ownership;
  }

  const out: Ownership = {};
  for (const part of text.split(",")) {
    const pair = part.trim();
    // A trailing or doubled comma is refused like any other malformed entry:
    // `topics=db,` may well mean more was meant to follow.
    if (pair === "") {
      throw new ContentError(`${CONTENT_SOURCE_VAR}="${text}": an entry is empty. Remove the stray comma.`);
    }
    const [rawType, rawKind, ...rest] = pair.split("=").map((s) => s.trim());
    if (rawType === undefined || rawKind === undefined || rest.length > 0) {
      throw new ContentError(
        `${CONTENT_SOURCE_VAR}="${text}": "${pair}" is not <type>=<source>. Use ` +
          `"files", "db", or a list such as "topics=db,courses=files".`,
      );
    }
    if (!isType(rawType)) {
      throw new ContentError(
        `${CONTENT_SOURCE_VAR}="${text}": "${rawType}" is not a content type. Known: ${CONTENT_TYPES.join(", ")}.`,
      );
    }
    if (!isKind(rawKind)) {
      throw new ContentError(
        `${CONTENT_SOURCE_VAR}="${text}": "${rawKind}" is not a source. Known: ${SOURCE_KINDS.join(", ")}.`,
      );
    }
    if (out[rawType] !== undefined) {
      throw new ContentError(`${CONTENT_SOURCE_VAR}="${text}": "${rawType}" is named twice.`);
    }
    out[rawType] = rawKind;
  }
  return out;
}

/** The precedence above, as a pure function: variable, then row, then files. */
export function resolveOwnership(input: { variable: Ownership; rows: Ownership }): Resolutions {
  const out = {} as Resolutions;
  for (const type of CONTENT_TYPES) {
    const fromVariable = input.variable[type];
    const fromRow = input.rows[type];
    out[type] =
      fromVariable !== undefined
        ? { kind: fromVariable, from: "variable" }
        : fromRow !== undefined && isKind(fromRow)
          ? { kind: fromRow, from: "row" }
          : { kind: "files", from: "default" };
  }
  return out;
}

export interface SelectSourceOptions {
  /** The file implementation, always present: it is the default and the fallback. */
  files: ContentSource;
  /**
   * Builds the database implementation. Called at most once, and only when
   * some type resolves to `db`, so a process that never needs the database
   * never connects to it.
   */
  db?: () => ContentSource | Promise<ContentSource>;
  /** The `content_source` rows. The catalog wires this in 0.5; absent means no rows. */
  ownership?: () => Ownership | Promise<Ownership>;
  /** `CONTENT_SOURCE`'s value. Defaults to `process.env.CONTENT_SOURCE`. */
  variable?: string | undefined;
  /** Told why the rows could not be read. Defaults to one `console.warn`. */
  onOwnershipError?: (error: unknown) => void;
}

export interface SelectedSource extends ContentSource {
  /** What each type resolved to and why, for a doctor line or a test. */
  resolution(): Promise<Resolutions>;
}

/**
 * One `ContentSource` that routes each method to the implementation its type
 * resolved to.
 *
 * The variable is read now, so a bad value fails at the first call site rather
 * than on some later read. The rows are read on the first method call and kept
 * for the life of the returned object, which is why a caller makes one per
 * request (the web app wraps this in React's `cache()`): a flip is then seen on
 * the next request, and one request never mixes two answers.
 */
export function selectSource(options: SelectSourceOptions): SelectedSource {
  const variable = parseContentSource(
    "variable" in options ? options.variable : process.env[CONTENT_SOURCE_VAR],
  );
  const report =
    options.onOwnershipError ??
    ((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`content source: the content_source rows could not be read, reading files. ${message}`);
    });

  let resolved: Promise<Resolutions> | null = null;
  const resolution = (): Promise<Resolutions> => {
    resolved ??= (async () => {
      let rows: Ownership = {};
      if (options.ownership !== undefined) {
        try {
          rows = await options.ownership();
        } catch (error) {
          report(error);
        }
      }
      return resolveOwnership({ variable, rows });
    })();
    return resolved;
  };

  let database: Promise<ContentSource> | null = null;
  const sourceFor = async (type: ContentType): Promise<ContentSource> => {
    const { kind, from } = (await resolution())[type];
    if (kind === "files") return options.files;
    const build = options.db;
    if (build === undefined) {
      throw new ContentError(
        `${type} is to be read from the database (${from === "variable" ? CONTENT_SOURCE_VAR : "its content_source row"}), ` +
          `and this process was given no database source.`,
      );
    }
    if (database === null) {
      const pending = Promise.resolve().then(build);
      database = pending;
      // A failed connection is not kept, so the next read tries again.
      pending.catch(() => {
        if (database === pending) database = null;
      });
    }
    return database;
  };

  return {
    resolution,
    topics: async () => (await sourceFor(METHOD_TYPES.topics)).topics(),
    tags: async () => (await sourceFor(METHOD_TYPES.tags)).tags(),
    courses: async () => (await sourceFor(METHOD_TYPES.courses)).courses(),
    concept: async (slug) => (await sourceFor(METHOD_TYPES.concept)).concept(slug),
    sessionLog: async (id) => (await sourceFor(METHOD_TYPES.sessionLog)).sessionLog(id),
    diagram: async (slug) => (await sourceFor(METHOD_TYPES.diagram)).diagram(slug),
  };
}
