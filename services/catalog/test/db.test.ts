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

/** Poll `check` until it holds, or fail by name. No fixed delay: see below. */
async function until(check: () => boolean, what: string, budgetMs = 10_000): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(what);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe.skipIf(!reachable.ok)("a pooled connection killed while it was idle", () => {
  it("is recorded rather than thrown, and the next query fails on its own", async () => {
    const scratch = await createScratchDatabase();

    // A second pool against the same database, the way a second vitest worker
    // or a long-lived caller would hold one. It is the one that gets killed:
    // `scratch.drop()` closes its own pool first and would otherwise have
    // nothing idle left to terminate.
    const bystander = connect({ url: scratch.url });
    // Messages, not the errors: a `pg` error carries the whole client object,
    // and a failing assertion should print the sentence rather than a socket.
    const uncaught: string[] = [];
    const record = (error: unknown): void => {
      uncaught.push(error instanceof Error ? error.message : String(error));
    };
    let dropped = false;
    process.on("uncaughtException", record);
    try {
      // A query, so the pool really holds a live backend and then puts it back
      // rather than opening its first connection lazily further down.
      await bystander.db.execute(sql`select 1`);
      expect(bystander.pool.idleCount).toBe(1);
      expect(bystander.lastPoolError()).toBeNull();

      await scratch.drop();
      dropped = true;
      // Polled, not slept on. `drop` waits for Postgres to run the drop, not
      // for the termination to cross this process's socket, and how long that
      // takes is exactly what a loaded machine changes. A fixed delay here
      // would be the same bet this PR is about.
      await until(
        () => bystander.lastPoolError() !== null,
        "the pool never reported the terminated client",
      );

      // The point of the whole test: the worker is still here.
      expect(uncaught).toEqual([]);

      const noticed = bystander.lastPoolError();
      expect(noticed).toBeInstanceOf(Error);
      expect(noticed?.message).toContain("terminating connection due to administrator command");

      // And the failure is still a failure: the pool discarded the dead client,
      // so the next query opens a fresh one and finds the database gone. A
      // listener that swallowed this too would be worse than the crash.
      await expect(bystander.db.execute(sql`select 1`)).rejects.toThrow();
    } finally {
      process.off("uncaughtException", record);
      await bystander.close().catch(() => undefined);
      // An assertion that failed before the drop would otherwise leave the
      // scratch database behind on the developer's server.
      if (!dropped) await scratch.drop().catch(() => undefined);
    }
  }, 30_000);

  it("leaves a pool with no idle clients alone", async () => {
    // The control. Nothing to terminate means nothing to report, which is what
    // says the assertion above is reading a real event and not a default.
    const scratch = await createScratchDatabase();
    // Never queried, so it has opened nothing: `pg.Pool` connects lazily.
    const bystander = connect({ url: scratch.url });
    try {
      await scratch.drop();
      // An absence has no event to wait for, so this waits on a different
      // observable instead of on a clock: the first query after the drop has
      // to fail, and by the time it has, anything the drop was going to say to
      // this pool has been said.
      await expect(bystander.db.execute(sql`select 1`)).rejects.toThrow();
      expect(bystander.lastPoolError()).toBeNull();
    } finally {
      await bystander.close().catch(() => undefined);
    }
  }, 30_000);
});
