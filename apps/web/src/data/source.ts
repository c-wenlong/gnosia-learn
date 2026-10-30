import "server-only";

import { classifyConnectionFailure } from "@gnosia/catalog/state";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { ContentUnavailableError, selectContentSource, type SelectedSource } from "@gnosia/tutor/server/content-source";

import { catalogDatabase } from "@/lib/learner-store";
import { currentScope } from "@/lib/owner";

export { ContentUnavailableError } from "@gnosia/tutor/server/content-source";

/**
 * The content seam's composition root, for this app: `selectContentSource`
 * in `@gnosia/tutor/server` holds the shared logic — every type
 * resolved to files is refused by name — and the hooks below give it the
 * app's own pool, the request's owner scope, Next's `connection()` request
 * marker and `unstable_rethrow` for Next's control-flow errors.
 */
export const contentSource = cache((): SelectedSource =>
  selectContentSource({
    db: catalogDatabase,
    scope: currentScope,
    mark: connection,
    rethrow: unstable_rethrow,
  }),
);


/**
 * `read`, or null when the catalog did not answer, for a page that has its
 * own word for an outage. Only an outage is caught: the seam calls any
 * failure to read its rows "unreachable", a missing table included, so the
 * cause has to be a connection failure (`classifyConnectionFailure`) too. A
 * type nobody flipped, a schema error or anything else still throws, so the
 * error boundary names it.
 */
export async function unlessUnreachable<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch (error) {
    if (
      error instanceof ContentUnavailableError &&
      error.reason === "unreachable" &&
      classifyConnectionFailure(error.cause) !== null
    ) {
      return null;
    }
    throw error;
  }
}
