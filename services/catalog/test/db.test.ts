import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { connect } from "../src/db";
import { createScratchDatabase, probe } from "./scratch-database";

/**
 * The pool's `error` event, which is the one nobody asks for.
 *
 * A query that fails rejects the call that made it. A connection that breaks
 * while it is sitting **idle** in the pool belongs to no call, so `pg` has
 * nowhere to report it but `emit("error")` — and Node's rule for an `error`
 * event with no listener is to throw it as an uncaught exception, which ends
 * the process. In vitest that is the worker, and every test in it goes with it,
 * including the ones that were passing.
 *
 * The trigger is ordinary: `createScratchDatabase().drop()` runs
 * `drop database ... with (force)`, which terminates every backend still
 * attached. Postgres tells each one `terminating connection due to
 * administrator command`. Any pool that still held an idle client against that
 * database heard it.
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("a pooled connection killed while it was idle", () => {
  it("is recorded rather than thrown, and the next query fails on its own", async () => {
    const scratch = await createScratchDatabase();

    // A second pool against the same database, the way a second vitest worker
    // or a long-lived caller would hold one. It is the one that gets killed:
    // `scratch.drop()` closes its own pool first and would otherwise have
    // nothing idle left to terminate.
    const bystander = connect({ url: scratch.url });
    // A query, so the pool really holds a live backend and then puts it back
    // rather than opening its first connection lazily on the assertion below.
    await bystander.db.execute(sql`select 1`);
    expect(bystander.pool.idleCount).toBe(1);
    expect(bystander.lastPoolError()).toBeNull();

    // Messages, not the errors: a `pg` error carries the whole client object,
    // and a failing assertion should print the sentence rather than a socket.
    const uncaught: string[] = [];
    const record = (error: unknown): void => {
      uncaught.push(error instanceof Error ? error.message : String(error));
    };
    process.on("uncaughtException", record);
    try {
      await scratch.drop();
      // The termination arrives on the socket, not in reply to anything, so
      // there is nothing to await. A tick is enough for the driver to read it.
      await new Promise((resolve) => setTimeout(resolve, 250));

      // The point of the whole test: the worker is still here.
      expect(uncaught).toEqual([]);
    } finally {
      process.off("uncaughtException", record);
    }

    const noticed = bystander.lastPoolError();
    expect(noticed).toBeInstanceOf(Error);
    expect(noticed?.message).toContain("terminating connection due to administrator command");

    // And the failure is still a failure: the pool discarded the dead client,
    // so the next query opens a fresh one and finds the database gone. A
    // swallowed error that also swallowed this would be worse than the crash.
    await expect(bystander.db.execute(sql`select 1`)).rejects.toThrow();

    await bystander.close();
  }, 30_000);

  it("leaves a pool with no idle clients alone", async () => {
    // The control. Nothing to terminate means nothing to report, which is what
    // says the assertion above is reading a real event and not a default.
    const scratch = await createScratchDatabase();
    const bystander = connect({ url: scratch.url });
    try {
      await scratch.drop();
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(bystander.lastPoolError()).toBeNull();
    } finally {
      await bystander.close();
    }
  }, 30_000);
});
