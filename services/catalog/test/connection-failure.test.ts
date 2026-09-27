import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  classifyConnectionFailure,
  describeConnectionFailure,
  EXIT_UNREACHABLE,
} from "../src/connection-failure";

/**
 * The classifier over synthetic errors shaped the way the driver really hands
 * them back. No database is needed: the shapes below were read off `pg` 8 and
 * drizzle 0.45 failing against a dead port, an unresolvable host, an unknown
 * role and a missing database.
 */

/** An error with a Node errno, the way `net` and `dns` build one. */
function errno(code: string, message = ""): Error {
  return Object.assign(new Error(message), { code });
}

/** A server's refusal, the way `pg` builds a `DatabaseError`. */
function sqlstate(code: string, message: string): Error {
  return Object.assign(new Error(message), { code, severity: "FATAL" });
}

/** drizzle's wrapper: a message about the SQL, the driver error on `cause`. */
function wrapped(cause: Error): Error {
  return new DrizzleQueryError("select to_regclass($1) is not null as present", ["x"], cause);
}

describe("nothing there to talk to", () => {
  it("reads a refused connection through drizzle's wrapper and the AggregateError under it", () => {
    // `localhost` resolves to ::1 and 127.0.0.1, so Node tries both and
    // reports an AggregateError whose message is empty.
    const aggregate = Object.assign(
      new AggregateError([errno("ECONNREFUSED"), errno("ECONNREFUSED")], ""),
      { code: "ECONNREFUSED" },
    );
    const error = wrapped(aggregate);
    expect(error.message).toMatch(/^Failed query/);
    expect(classifyConnectionFailure(error)).toEqual({
      unreachable: true,
      reason: "connection refused",
      code: "ECONNREFUSED",
    });
  });

  it("finds the code inside an AggregateError that does not carry one itself", () => {
    const aggregate = new AggregateError([errno("ECONNREFUSED", "connect ECONNREFUSED ::1:1")], "");
    expect(classifyConnectionFailure(wrapped(aggregate))?.unreachable).toBe(true);
  });

  it.each([
    ["ENOTFOUND", "host not found"],
    ["EAI_AGAIN", "host lookup failed"],
  ])("is unreachable on %s", (code, reason) => {
    expect(classifyConnectionFailure(wrapped(errno(code, `getaddrinfo ${code} db.invalid`)))).toEqual({
      unreachable: true,
      reason,
      code,
    });
  });
});

describe("a server that answered and refused", () => {
  it.each([
    ["28P01", 'password authentication failed for user "kaichen"', "authentication failed"],
    ["28000", 'role "nobody" does not exist', "authentication failed"],
    ["3D000", 'database "does_not_exist" does not exist', "database does not exist"],
    ["53300", "sorry, too many clients already", "too many connections"],
    ["57P03", "the database system is starting up", "server is not accepting connections yet"],
  ])("is not unreachable on %s", (code, message, reason) => {
    expect(classifyConnectionFailure(wrapped(sqlstate(code, message)))).toEqual({
      unreachable: false,
      reason,
      code,
    });
  });

  it("treats a timeout as no answer yet, not as nothing there", () => {
    const failure = classifyConnectionFailure(wrapped(errno("ETIMEDOUT", "connect ETIMEDOUT 10.0.0.4:5432")));
    expect(failure).toEqual({ unreachable: false, reason: "connection timed out", code: "ETIMEDOUT" });
  });
});

describe("failures that are not about reaching the database", () => {
  it.each([
    ["a domain error", new Error(`no topic "x" in the catalog`)],
    ["a constraint violation", wrapped(sqlstate("23505", "duplicate key value"))],
    ["a file that is not there", errno("ENOENT", "no such file or directory")],
    ["a string", "something broke"],
    ["null", null],
  ])("is null for %s", (_label, error) => {
    expect(classifyConnectionFailure(error)).toBeNull();
  });

  it("stops on a cause that points back at itself", () => {
    const error = new Error("loop") as Error & { cause?: unknown };
    error.cause = error;
    expect(classifyConnectionFailure(error)).toBeNull();
  });

  it("never reads the message, only the code", () => {
    expect(classifyConnectionFailure(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBeNull();
  });
});

describe("the line the CLI prints", () => {
  it("names the cause and the code", () => {
    expect(
      describeConnectionFailure({ unreachable: true, reason: "connection refused", code: "ECONNREFUSED" }),
    ).toBe("database unreachable: connection refused (ECONNREFUSED)");
    expect(
      describeConnectionFailure({ unreachable: false, reason: "database does not exist", code: "3D000" }),
    ).toBe("database connection failed: database does not exist (3D000)");
  });

  it("uses an exit code the CLI does not already mean something else by", () => {
    expect([0, 1, 2]).not.toContain(EXIT_UNREACHABLE);
  });
});
