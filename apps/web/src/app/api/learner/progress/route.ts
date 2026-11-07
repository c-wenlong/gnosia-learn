import { progressTurn } from "@gnosia/tutor/server/learner-writes";

import { turnRoute } from "@/lib/learner-api";

/**
 * Tick or untick one curriculum item.
 *
 * The parse and the write are `progressTurn` in
 * `@gnosia/tutor/server/learner-writes`.
 */
export const POST = turnRoute("progress", progressTurn);
