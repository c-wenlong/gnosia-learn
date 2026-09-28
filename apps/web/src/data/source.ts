import "server-only";

import {
  CONTENT_SOURCE_VAR,
  selectSource,
  type ContentSource,
  type ContentType,
  type Resolutions,
  type SelectedSource,
} from "@self-learn/content";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { catalogDatabase } from "@/lib/learner-store";

/**
 * Where the app's authored content comes from: the composition root of the
 * reader seam (docs/CONTENT-MIGRATION.md 0.6), database only since phase 2.
 *
 * Every content reader in the app (`getCourses`, `getTopics`, `getTags`, the
 * note, log and diagram reads behind the asset routes) asks `contentSource()`
 * and gets rows. There is no file reader here any more: the app does not know
 * where `content/` or `learn/` are, and phase 3 deletes both.
 *
 * **A type the database does not own is refused, loudly.** `selectSource`
 * still decides per type, from the `content_source` row and `CONTENT_SOURCE`,
 * and a type that resolves to `files` (no row, a row that still says files,
 * or the variable pointing it there) reaches `refusingFiles` below, which
 * throws a `ContentUnavailableError` naming `catalog flip <type>`. The failure
 * this replaces was silent: a missing file reader would have rendered an empty
 * page, and an empty course list looks like a catalog with no courses.
 *
 * **An unreachable database is refused too**, where it used to fall back to
 * the files. The page's error boundary (`app/(app)/error.tsx`) renders inside
 * the shell and says the content could not be read; the server log carries
 * which of the two it was. That is edge case 20 of the plan: the one
 * availability property the move to the database gives up. The cause is
 * logged once per outage rather than once per request, and a different cause
 * (a database that was refusing connections and now answers without a
 * `content_source` table) is logged again.
 *
 * **One per request.** `cache()` gives each server render its own selected
 * source, so the `content_source` rows are asked once per request and a flip
 * shows on the next one. Outside a render (a route handler, a test) React's
 * `cache` does not memoise, and each call gets a fresh one.
 *
 * **The database is reached only at request time**: `connection()` marks the
 * read as request work, the rule every other database read in the app
 * follows, and the catalog is imported lazily so nothing constructs a pool
 * during `next build`. During a prerender `connection()` throws Next's own
 * "dynamic server usage" signal, which has to reach Next rather than be taken
 * for an outage: `selectSource` catches whatever the ownership callback throws
 * and hands it to `onOwnershipError`, so that is where it is rethrown.
 */

/** Why a content read was refused. `type` is null when no type was reached. */
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

/**
 * The cause last reported, so each outage is logged once and a different
 * cause is logged again. A successful read clears it.
 */
let warnedCause: string | null = null;

export const contentSource = cache((): SelectedSource => {
  const selected: SelectedSource = selectSource({
    files: refusingFiles(() => selected.resolution()),
    ownership: async () => {
      await connection();
      const { contentOwnership } = await import("@self-learn/catalog/state");
      const rows = await contentOwnership(await catalogDatabase());
      warnedCause = null;
      return rows;
    },
    onOwnershipError: (error) => {
      // Next's control flow, not an outage: a prerender bailing out on
      // `connection()`, a redirect, a not-found. It propagates to Next.
      unstable_rethrow(error);
      const reason = cause(error);
      if (reason !== warnedCause) {
        warnedCause = reason;
        console.warn(`content source: the content_source rows could not be read. ${reason}`);
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
      await connection();
      const { dbSource } = await import("@self-learn/catalog/state");
      return dbSource(await catalogDatabase());
    },
  });
  return selected;
});

/**
 * The innermost message. drizzle wraps a driver error as "Failed query: ..."
 * and keeps what Postgres said (`relation "content_source" does not exist`)
 * on `cause`, and that is the half a person can act on. A refused connection
 * arrives as an error with an empty message and a `code` (`ECONNREFUSED`),
 * so the innermost code is added when no message says it.
 */
function cause(error: unknown): string {
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
