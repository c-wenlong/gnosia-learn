import {
  contentOwnership,
  dbSource,
  type CatalogDatabase,
} from "@gnosia/catalog/state";
import {
  CONTENT_SOURCE_VAR,
  selectSource,
  type ContentSource,
  type ContentType,
  type Resolutions,
  type SelectedSource,
} from "@gnosia/content";
import type { OwnerScope } from "@gnosia/schema/shared";

/**
 * The content seam's composition root, moved out of
 * `apps/web/src/data/source.ts` so the sidecar composes the same seam the web
 * app does: every type resolved to files is refused by name, because both
 * processes read authored content from the database only.
 *
 * The three hooks are the difference between the two processes:
 * `mark` is Next's `connection()` for the web app and a no-op for the
 * sidecar; `rethrow` is `unstable_rethrow`, which keeps Next's control-flow
 * errors (redirects, prerender bailouts) out of the outage path; `warn` is
 * each host's own logging. `warnedCause` lives inside, so each outage is
 * reported once per cause, and a successful read clears it.
 */

export class ContentUnavailableError extends Error {
  constructor(
    readonly reason: "not-flipped" | "unreachable",
    readonly type: ContentType | null,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ContentUnavailableError";
  }
}

/** The sentence for a type that resolved to files, by where that came from. */
export function notFlippedMessage(type: ContentType, from: Resolutions[ContentType]["from"]): string {
  const flip = `npm run catalog -- flip ${type}`;
  if (from === "variable") {
    return (
      `${CONTENT_SOURCE_VAR} sends ${type} to files, and the web app reads the database only. ` +
      `Unset ${CONTENT_SOURCE_VAR}, or set it to db.`
    );
  }
  const why =
    from === "row"
      ? `its content_source row on this database still says files`
      : `this database has no content_source row for it, so nothing has flipped it`;
  return (
    `The web app reads ${type} from the database only, and ${why}. ` +
    `Run \`${flip}\` against this database (docs/CONTENT-MIGRATION.md, flip day).`
  );
}

/**
 * What `selectSource` hands a type that resolved to files. It has to be a
 * `ContentSource`, since the seam is shaped for two implementations; every
 * method refuses with the reason the type ended up here, read back from the
 * same resolution the router used.
 */
function refusingFiles(resolution: () => Promise<Resolutions>): ContentSource {
  const refuse = async (type: ContentType): Promise<never> => {
    const { from } = (await resolution())[type];
    throw new ContentUnavailableError("not-flipped", type, notFlippedMessage(type, from));
  };
  return {
    topics: () => refuse("topics"),
    tags: () => refuse("tags"),
    courses: () => refuse("courses"),
    concept: () => refuse("concepts"),
    sessionLog: () => refuse("sessions"),
    diagram: () => refuse("diagrams"),
  };
}

export interface ContentSourceHooks {
  /** The pool handle, on demand — the callers' own, shared with everything else they read. */
  db: () => Promise<CatalogDatabase>;
  /** The requesting owner's scope (the owner plus the commons). */
  scope: () => Promise<OwnerScope>;
  /** The host's per-request marker: Next's `connection()`, or a no-op. */
  mark?: () => Promise<void>;
  /** Rethrow the host's control-flow errors before the outage path (Next's `unstable_rethrow`). */
  rethrow?: (error: unknown) => void;
  /** The host's outage reporting; the default warns on `console.warn` once per cause. */
  warn?: (reason: string) => void;
}

/**
 * The last cause reported, at module level like the web file's was: a process
 * reports each outage cause once no matter how many request-scoped seams the
 * `cache()` wrapper mints, and a successful read clears it so a later outage
 * of the same cause is news again.
 */
let warnedCause: string | null = null;

export function selectContentSource(hooks: ContentSourceHooks): SelectedSource {
  const warn =
    hooks.warn ??
    ((reason: string) => {
      console.warn(`content source: the content_source rows could not be read. ${reason}`);
    });
  const selected: SelectedSource = selectSource({
    files: refusingFiles(() => selected.resolution()),
    ownership: async () => {
      await hooks.mark?.();
      const rows = await contentOwnership(await hooks.db());
      warnedCause = null;
      return rows;
    },
    onOwnershipError: (error) => {
      hooks.rethrow?.(error);
      const reason = cause(error);
      if (reason !== warnedCause) {
        warnedCause = reason;
        warn(reason);
      }
      // Thrown rather than returned: a reporter that throws fails the read,
      // where one that returns would let every type fall back to files.
      throw new ContentUnavailableError(
        "unreachable",
        null,
        `The catalog database could not be read, and the web app reads its content from the database only. ${reason}`,
        { cause: error },
      );
    },
    db: async () => {
      await hooks.mark?.();
      return dbSource(await hooks.db(), await hooks.scope());
    },
  });
  return selected;
}

/**
 * The innermost message. drizzle wraps a driver error as "Failed query: ..."
 * and keeps what Postgres said (`relation "content_source" does not exist`)
 * on `cause`, and that is the half a person can act on. A refused connection
 * arrives as an error with an empty message and a `code` (`ECONNREFUSED`),
 * so the innermost code is added when no message says it.
 */
export function cause(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  let code: string | null = null;
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current instanceof Error; depth += 1) {
    if (current.message !== "") message = current.message;
    const found = (current as { code?: unknown }).code;
    if (typeof found === "string" && found !== "") code = found;
    current = current.cause;
  }
  return code !== null && !message.includes(code) ? `${message} (${code})` : message;
}

export type { SelectedSource };
