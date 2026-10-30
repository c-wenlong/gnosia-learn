import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { filesLike, preflightExists, rehearse, reportOf } from "./flip-rehearsal-helpers";
import { manimkcStandIn, seedWithManimkc } from "./manimkc-standin";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { storedBlob } from "./stored-blob";

const reachable = await probe();

/**
 * `scripts/flip-rehearsal.mjs` on a tree whose import would remove rows: the
 * import into a throwaway copy stops it before the copy under test is
 * touched, the safeguard a `--real` run relies on.
 */

describe.skipIf(!reachable.ok)("scripts/flip-rehearsal.mjs on a tree that would remove rows", () => {
  let template: Scratch;
  let work: string;
  let tree: string;
  let manimkc: string;

  beforeAll(async () => {
    template = await migratedScratchDatabase();
    // Two renders recorded, and a manimkc checkout that reports only one:
    // the import would remove the other, as a worktree without the owner's
    // untracked files would remove theirs.
    for (const name of ["one", "gone"]) {
      const key = await storedBlob(template.db, name, "mp4");
      await template.db.execute(sql`
        insert into asset (id, kind, path, source_repo, blob_key)
        values (${`manimkc:out/demo/one/${name}.mp4`}, 'video', ${`out/demo/one/${name}.mp4`}, 'manimkc', ${key})`);
    }
    work = await mkdtemp(path.join(tmpdir(), "catalog-flip-rehearsal-removes-"));
    tree = path.join(work, "tree");
    await seedWithManimkc(tree);
    manimkc = path.join(work, "manimkc");
    await manimkcStandIn(manimkc, randomBytes(64));
  }, 60_000);

  afterAll(async () => {
    await template?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  it("stops at the import into a throwaway copy, naming the row, before the copy under test is imported", async () => {
    const name = path.join(work, "removes.db");
    const ran = await rehearse(["--from", template.url, "--name", name, "--tree-from", tree, "--json"], {
      MANIMKC_ROOT: manimkc,
    });
    const report = reportOf(ran);
    expect(ran.code).toBe(1);
    expect(report.ok).toBe(false);
    expect(report.steps.map((s) => [s.name, s.ok])).toEqual([
      ["back up the database", true],
      ["migrate", true],
      ["doctor", true],
      ["import into a throwaway copy", false],
    ]);
    expect(report.steps.at(-1)?.gist).toMatch(/^on a copy, before touching .*: the import removed 1 row\(s\).*manimkc:out\/demo\/one\/gone\.mp4/);
    // Both copies are removed, without --keep.
    expect(report.copy).toMatchObject({ name, kept: false, dropped: true });
    expect(filesLike(name)).toEqual([]);
    expect(report.preflight).toMatch(/^gnosia_preflight_\d+_[0-9a-z]+$/);
    expect(preflightExists(report)).toBe(false);
  }, 120_000);
});
