/**
 * A state write that the data, not the database, refused.
 *
 * Kept apart from `IndexError` because the two are read by different people in
 * different situations: an `IndexError` is a content author's typo, a
 * `StateError` is a learner's write that could not be recorded. The CLI prints
 * one as `learn: <message>` and the API routes turn it into a 400.
 */
export class StateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateError";
  }
}

/** Postgres SQLSTATE codes this layer reads rather than just reporting. */
export const SQLSTATE = {
  foreignKeyViolation: "23503",
  checkViolation: "23514",
  /** What the append-only trigger raises. */
  restrictViolation: "23001",
} as const;

/**
 * The SQLSTATE of a failed query. drizzle-orm wraps driver errors in a
 * `DrizzleQueryError` and hangs the original off `cause`, so the code is one or
 * more levels down rather than on the error it hands back.
 */
/**
 * better-sqlite3's `code`s onto the SQLSTATE the same failure carried on
 * Postgres, so the rest of the codebase still reads `23503` and friends.
 */
const SQLITE_TO_SQLSTATE: Record<string, string> = {
  SQLITE_CONSTRAINT_FOREIGNKEY: "23503",
  SQLITE_CONSTRAINT_UNIQUE: "23505",
  SQLITE_CONSTRAINT_PRIMARYKEY: "23505",
  SQLITE_CONSTRAINT_CHECK: "23514",
  SQLITE_CONSTRAINT_NOTNULL: "23502",
  SQLITE_BUSY: "55P03",
};

export function sqlstate(error: unknown): string | undefined {
  // The SQLSTATE a raise() carried sits at the head of its message, deeper
  // than the drizzle wrapper's `code` — which is SQLITE_ERROR for every one
  // of them — so messages are read before codes.
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string") {
      const embedded = /^([0-9A-Z]{5}):/.exec(message)?.[1];
      if (embedded !== undefined) return embedded;
    }
    current = (current as { cause?: unknown }).cause;
  }
  current = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") {
      // SQLite folds several distinct SQLSTATEs into generic codes, so the
      // message carries what the code cannot: a RESTRICT foreign key answers
      // SQLITE_CONSTRAINT_TRIGGER, and a missing table or column is a bare
      // SQLITE_ERROR ("no such table"/"no such column" = 42P01/42703).
      const message = (current as { message?: unknown }).message;
      if (typeof message === "string") {
        if (/foreign key constraint failed/i.test(message)) return "23503";
        if (/no such table/i.test(message)) return "42P01";
        if (/no such column/i.test(message)) return "42703";
      }
      return SQLITE_TO_SQLSTATE[code] ?? code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * The name of the constraint a failed query violated, when it named one.
 * Postgres sent the constraint's own name; SQLite's message names the
 * constraint for CHECKs but the column for UNIQUEs and NOT NULLs
 * (`UNIQUE constraint failed: job.target_path`) and nothing for foreign keys,
 * so callers compare the `<table>.<column>` spelling too.
 */
export function constraintName(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    const name = (current as { constraint?: unknown }).constraint;
    if (typeof name === "string") return name;
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string") {
      const named = /constraint failed: ([A-Za-z_][\w.]*)/.exec(message)?.[1];
      if (named !== undefined) return named;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
