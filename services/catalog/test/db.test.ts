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
 * away (the scratch database is dropped), the open handle keeps answering —
 * POSIX holds the inode — and `lastPoolError` reports nothing either way.
 */

describe("a connection whose file was dropped under it", () => {
  it("keeps answering on the open handle and reports no pool error", async () => {
    const scratch = await createScratchDatabase();

    // A second handle on the same file, the way a second vitest worker or a
    // long-lived caller would hold one. It is the one that loses its file.
    const bystander = connect({ url: scratch.url });
    try {
      await bystander.db.execute(sql`select 1`);
      expect(bystander.lastPoolError()).toBeNull();

      await scratch.drop();

      // POSIX keeps the unlinked file alive for a handle already on it: only a
      // reopen would find the path gone, so nothing fails and nothing is owed.
      expect((await bystander.db.execute<{ "1": number }>(sql`select 1`)).rows).toEqual([{ "1": 1 }]);
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
      expect((await bystander.db.execute<{ "1": number }>(sql`select 1`)).rows).toEqual([{ "1": 1 }]);
      expect(bystander.lastPoolError()).toBeNull();
    } finally {
      await bystander.close().catch(() => undefined);
    }
  }, 30_000);
});
