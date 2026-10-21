import "server-only";

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { selectContentSource, type SelectedSource } from "@gnosia/tutor/server/content-source";
import type { ContentSource } from "@gnosia/content";

import { catalogDatabase } from "@/lib/learner-store";
import { currentScope } from "@/lib/owner";

export { ContentUnavailableError, notFlippedMessage } from "@gnosia/tutor/server/content-source";

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

export type { ContentSource };
