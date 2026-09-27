import { tmpdir } from "node:os";
import path from "node:path";

import { fileSource, selectSource } from "@self-learn/content";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runFlip } from "../src/commands/flip";
import { runImportCommand } from "../src/commands/index-command";
import { runParity } from "../src/commands/parity";
import { DB_READERS } from "../src/content/flip";
import { contentOwnership } from "../src/content/ownership";
import { dbSource } from "../src/content/source";
import { REPO_ROOT } from "../src/env";
import { applyMigrations } from "../src/migrations";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * Track A's database readers (docs/CONTENT-MIGRATION.md, Track A): `topics`
 * and `tags` from rows, on the real tree imported into a scratch database.
 *
 * The bar is equality with the file reader, value for value: whatever a page
 * renders from `fileSource(REPO_ROOT).topics()` it must render the same from
 * the rows, maps and relations included. Then the flip, and the same answer
 * through `selectSource` once the `content_source` row says `db`. The tree is
 * only read; manimkc is pointed at nothing, so its sources skip.
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("topics and tags from rows, on the real tree", () => {
  let scratch: Scratch;
  const saved = { url: process.env["DATABASE_URL"], manimkc: process.env["MANIMKC_ROOT"] };

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    const url = new URL(process.env["DATABASE_URL"] ?? "postgres://localhost:5432/self_learn");
    url.pathname = `/${scratch.name}`;
    process.env["DATABASE_URL"] = url.toString();
    process.env["MANIMKC_ROOT"] = path.join(tmpdir(), "catalog-test-no-manimkc");
    await runImportCommand({ dir: REPO_ROOT });
  }, 120_000);

  afterAll(async () => {
    for (const [key, value] of [["DATABASE_URL", saved.url], ["MANIMKC_ROOT", saved.manimkc]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await scratch?.drop();
  });

  it("are ready, so catalog flip accepts them", () => {
    expect(DB_READERS.has("topics")).toBe(true);
    expect(DB_READERS.has("tags")).toBe(true);
  });

  it("return what the file reader returns, value for value", async () => {
    const files = fileSource(REPO_ROOT);
    const rows = dbSource(scratch.db);
    expect(await rows.topics()).toEqual(await files.topics());
    expect(await rows.tags()).toEqual(await files.tags());
  });

  it("hold the vocabulary the plan measured", async () => {
    const topics = await dbSource(scratch.db).topics();
    const count = (pick: (t: (typeof topics)[number]) => readonly unknown[]) => topics.reduce((a, t) => a + pick(t).length, 0);
    // docs/CONTENT-MIGRATION.md, Track A's parity line. A count that moves
    // because content was added is expected; update it with the reason.
    expect({
      topics: topics.length,
      domains: new Set(topics.map((t) => t.domain)).size,
      aliases: count((t) => t.aliases),
      manimkc: count((t) => t.maps.manimkc),
      concepts: count((t) => t.maps.concepts),
      modules: count((t) => t.maps.courses),
      tags: (await dbSource(scratch.db).tags()).length,
    }).toEqual({ topics: 86, domains: 23, aliases: 294, manimkc: 35, concepts: 32, modules: 61, tags: 8 });
  });

  it("flip with parity clean, and the seam then reads them from rows", async () => {
    const parity = await runParity({ dir: REPO_ROOT, only: ["topics", "tags"] });
    expect(parity.clean).toBe(true);
    for (const type of ["topics", "tags"] as const) {
      const flipped = await runFlip({ type });
      expect(flipped).toMatchObject({ type, source: "db" });
      expect(flipped.parity).toMatchObject({ clean: true, mismatches: 0 });
    }
    const owners = await contentOwnership(scratch.db);
    expect(owners).toMatchObject({ topics: "db", tags: "db" });

    const files = fileSource(REPO_ROOT);
    const selected = selectSource({
      files,
      variable: "",
      ownership: () => contentOwnership(scratch.db),
      db: async () => dbSource(scratch.db),
    });
    expect(await selected.topics()).toEqual(await files.topics());
    expect(await selected.tags()).toEqual(await files.tags());
    const resolved = await selected.resolution();
    expect(resolved.topics).toEqual({ kind: "db", from: "row" });
    expect(resolved.tags).toEqual({ kind: "db", from: "row" });
    // And the override still points readers back at the files.
    const overridden = selectSource({
      files,
      variable: "topics=files,tags=files",
      ownership: () => contentOwnership(scratch.db),
      db: async () => {
        throw new Error("the database was asked for a type the override sent to files");
      },
    });
    expect(await overridden.topics()).toEqual(await files.topics());
    expect(await overridden.tags()).toEqual(await files.tags());
    const back = await overridden.resolution();
    expect(back.topics).toEqual({ kind: "files", from: "variable" });
    expect(back.tags).toEqual({ kind: "files", from: "variable" });
  }, 60_000);
});
