// The order flip day flips the six content types in, grouped by the export
// that follows each group, as docs/CONTENT-MIGRATION.md ("Flip day, as a
// script") lists it. scripts/flip-rehearsal.mjs runs it, and anything else
// that flips a database (the e2e --seed build) imports it rather than keeping
// a copy, so a rehearsal and a test cannot flip in two different orders.
export const FLIP_GROUPS = Object.freeze([
  Object.freeze(['topics', 'tags']),
  Object.freeze(['concepts', 'sessions']),
  Object.freeze(['courses']),
  Object.freeze(['diagrams']),
]);

export const FLIP_ORDER = Object.freeze(FLIP_GROUPS.flat());
