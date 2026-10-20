import { importLegacyState, type LegacyPayload } from "@gnosia/catalog/state";

import { BadRequest, handler } from "@/lib/learner-api";

/**
 * The one-time import of a browser's `self-learn:v1` document.
 *
 * `LearnerProvider` posts this on first mount when the key is present, and
 * removes the key when it comes back `ok`. The merge rules — the database
 * wins, an unknown curriculum item is skipped rather than fatal — live in
 * `importLegacyState`, so they are testable without HTTP and are the same
 * rules whatever calls them.
 *
 * Almost nothing is validated here beyond "it is an object of the right rough
 * shape". The payload is JSON an older build of this app wrote, possibly a
 * long time ago; the store parses every field defensively and clamps every
 * recap, and rejecting the whole document over one bad key would strand the
 * study record this route exists to rescue.
 */
export const POST = handler(
  "import",
  (body): LegacyPayload => {
    for (const field of ["completed", "notes", "knowledge", "userResources"] as const) {
      const value = body[field];
      if (value !== undefined && (value === null || typeof value !== "object" || Array.isArray(value))) {
        throw new BadRequest(`"${field}" must be an object.`);
      }
    }
    return body as LegacyPayload;
  },
  async (db, payload, owner) => importLegacyState(db, payload, owner),
);
