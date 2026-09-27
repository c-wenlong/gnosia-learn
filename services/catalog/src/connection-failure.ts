/**
 * Why a command could not use the database, read from the error's codes.
 *
 * drizzle wraps every driver error in a `DrizzleQueryError` whose message is
 * `Failed query: <sql>`, whatever went wrong underneath, and hangs the driver's
 * error off `cause`. A refused connection reaches that `cause` as an
 * `AggregateError` with an empty message, one attempt per address `localhost`
 * resolved to. So the message says nothing about the cause at any level, and
 * the `code` is the only honest thing to read: a Node errno for the socket, or
 * a Postgres SQLSTATE for a server that answered.
 *
 * Two kinds of answer, because the studio acts on the difference:
 *
 * - **Unreachable**: there is demonstrably nothing there to talk to. Nothing is
 *   listening, or the name does not resolve. The CLI exits
 *   {@link EXIT_UNREACHABLE}, and the studio carries on without the database
 *   (D16), which is only safe because nothing else can be using it either.
 * - **Refused**: a server answered and said no. Bad credentials, a database
 *   that does not exist, too many clients, a server still starting up. The
 *   database is up, a correctly configured runner may be working against it
 *   right now, so this stays exit 1 and stays a hard stop.
 *
 * A timeout is in the second group on purpose. "No answer yet" is not "nothing
 * there", and a slow server is not a licence to skip the lease.
 */

/** The catalog CLI's exit code for "nothing there to talk to". */
export const EXIT_UNREACHABLE = 3;

export interface ConnectionFailure {
  /** True when nothing is there to talk to; false when a server refused. */
  unreachable: boolean;
  /** A few words a person can act on, e.g. `connection refused`. */
  reason: string;
  /** The errno or SQLSTATE it was read from. */
  code: string;
}

const KNOWN: Record<string, { unreachable: boolean; reason: string }> = {
  // Node socket and resolver errnos.
  ECONNREFUSED: { unreachable: true, reason: "connection refused" },
  ENOTFOUND: { unreachable: true, reason: "host not found" },
  EAI_AGAIN: { unreachable: true, reason: "host lookup failed" },
  ETIMEDOUT: { unreachable: false, reason: "connection timed out" },
  ECONNRESET: { unreachable: false, reason: "connection reset" },
  // Postgres SQLSTATEs a server sends while refusing a connection.
  "28P01": { unreachable: false, reason: "authentication failed" },
  "28000": { unreachable: false, reason: "authentication failed" },
  "3D000": { unreachable: false, reason: "database does not exist" },
  "53300": { unreachable: false, reason: "too many connections" },
  "57P03": { unreachable: false, reason: "server is not accepting connections yet" },
};

/**
 * The recognised code in the error: on the error itself, or down its `cause`
 * chain. Null when there is none, which is every failure that is not about
 * reaching the database.
 *
 * An `AggregateError` is one connection attempt per address the host resolved
 * to, and it is read as a whole rather than by its first match: it is
 * unreachable only when **every** attempt was. One attempt that timed out or
 * was refused by a live server is a server that may be there, so it wins, and
 * an attempt with no recognised code at all makes the whole thing unknown.
 * Anything short of "every address said nothing is here" does not prove that
 * nothing else is using the database, which is what exit 3 promises.
 */
export function classifyConnectionFailure(error: unknown): ConnectionFailure | null {
  return classify(error, new Set());
}

function classify(node: unknown, seen: Set<unknown>): ConnectionFailure | null {
  // Bounded, because `cause` is just a property and nothing stops a cycle.
  if (typeof node !== "object" || node === null || seen.has(node) || seen.size >= 16) return null;
  seen.add(node);

  const errors = (node as { errors?: unknown }).errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const attempts = errors.map((attempt) => classify(attempt, seen));
    const live = attempts.find((attempt) => attempt !== null && !attempt.unreachable);
    if (live !== undefined) return live;
    if (attempts.every((attempt) => attempt !== null)) return attempts[0]!;
    return null;
  }

  const code = (node as { code?: unknown }).code;
  if (typeof code === "string" && Object.hasOwn(KNOWN, code)) {
    return { ...KNOWN[code]!, code };
  }
  return classify((node as { cause?: unknown }).cause, seen);
}

/** The one line the CLI prints for it, e.g. `database unreachable: connection refused (ECONNREFUSED)`. */
export function describeConnectionFailure(failure: ConnectionFailure): string {
  const lead = failure.unreachable ? "database unreachable" : "database connection failed";
  return `${lead}: ${failure.reason} (${failure.code})`;
}
