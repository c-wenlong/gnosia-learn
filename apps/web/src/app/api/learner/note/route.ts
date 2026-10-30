import { noteTurn } from "@gnosia/tutor/server/learner-writes";

import { turnRoute } from "@/lib/learner-api";

/**
 * Write or clear the learner's scratch note on one curriculum item.
 *
 * The parse and the write are `noteTurn` in
 * `@gnosia/tutor/server/learner-writes`, which the sidecar runs too.
 */
export const POST = turnRoute("note", noteTurn);
