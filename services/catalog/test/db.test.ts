import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { connect } from "../src/db";
import { createScratchDatabase } from "./scratch-database";

/**
 * What the Postgres pool's `error` event taught, translated to a file.
 *
 * On Postgres, a pooled connection that broke while it was idle belonged to
 * no call and was thrown as an uncaught exception — which ended the vitest
 * worker, passing tests and all. A better-sqlite3 handle has no sockets and
 * no idle clients: there is no asynchronous error to emit, so the question
 * this file still answers is simpler. When the file under a connection goes
 * away (the scratch database is dropped), the next statement fails where it
 * runs, `lastPoolError` reports nothing, and the process stands.
 */

describe("a connection whose file was dropped under it", () => {
  it("fails the next query and reports no pool error", async () => {
    const scratch = await createScratchDatabase();

    // A second handle on the same file, the way a second vitest worker or a
    // long-lived caller would hold one. It is the one that loses its file.
    const bystander = connect({ url: scratch.url });
    try {
      await bystander.db.execute(sql`select 1`);
      expect(bystander.lastPoolError()).toBeNull();

      await scratch.drop();

      // SQLite only finds out the file is gone at the next statement; WAL
      // deletion is what it trips on, so the failure lands here, by name.
      await expect(bystander.db.execute(sql`select 1`)).rejects.toThrow();
      expect(bystander.lastPoolError()).toBeNull();
    } finally {
      await bystander.close().catch(() => undefined);
    }
  }, 30_000);

  it("leaves a handle that never queried alone", async () => {
    // The control: nothing was ever said on this handle, so nothing is owed.
    const scratch = await createScratchDatabase();
    const bystander = connect({ url: scratch.url });
    try {
      await scratch.drop();
      await expect(bystander.db.execute(sql`select 1`)).rejects.toThrow();
      expect(bystander.lastPoolError()).toBeNull();
    } finally {
      await bystander.close().catch(() => undefined);
    }
  }, 30_000);
});
