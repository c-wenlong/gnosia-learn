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
export function sqlstate(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** The name of the constraint a failed query violated, when it named one. */
export function constraintName(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    const name = (current as { constraint?: unknown }).constraint;
    if (typeof name === "string") return name;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
