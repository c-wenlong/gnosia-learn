import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { asset, blobObject } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { doctor } from "../src/commands/doctor";
import { runImportCommand } from "../src/commands/index-command";
import { openBlobStore } from "../src/content/blob";
import { applyMigrations, assertMigrated, migrateHolding, migrationStatus } from "../src/migrations";
import { manimkcStandIn, seedWithManimkc } from "./manimkc-standin";
import { BEFORE_BLOB_CONTRACT, partialMigrations } from "./partial-migrations";
import { createScratchDatabase, probe, SQLSTATE, sqlMessage, sqlstate, type Scratch } from "./scratch-database";
import { storedBlob } from "./stored-blob";

/**
 * Phase 2's contract migration, 0013 (docs/CONTENT-MIGRATION.md, "Contract
 * migration"): a video, sidecar, poster or diagram SVG names its blob, and a
 * blob key is one `@self-learn/blob` makes.
 *
 * The migration raises with every offending id rather than failing on the
 * constraint; `catalog doctor` lists the same rows; `catalog migrate` holds
 * it back instead of letting the raise roll the run back; the other commands
 * run on a database it is held on; and once it is in, the manimkc import
 * stores each file before the row that names it, since a row can no longer go
 * in first.
 */

const reachable = await probe();
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe.skipIf(!reachable.ok)("the blob contract, 0013", () => {
  let scratch: Scratch;
  const badKey = `local/${sha("no extension")}`;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db, { folder: await partialMigrations(BEFORE_BLOB_CONTRACT) });
    // A render an import recorded and no upload stored, and a key 0010's
    // check admits and the blob package would never make.
    await scratch.db.insert(asset).values({ id: "manimkc:out/a/one.mp4", kind: "video", path: "out/a/one.mp4", sourceRepo: "manimkc" });
    await scratch.db.insert(blobObject).values({
      key: badKey,
      ownerId: "local",
      sha256: sha("no extension"),
      bytes: 12,
      mime: "application/octet-stream",
      provider: "fs",
    });
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("is reported by doctor before the migration", async () => {
    const report = await doctor(scratch.db, "scratch");
    expect(report.migrations.pending).toEqual(["0013_asset_blob_contract"]);
    expect(report.blobContract).toEqual({
      inForce: false,
      unstored: [{ id: "manimkc:out/a/one.mp4", kind: "video" }],
      unkeyed: [badKey],
    });
  });

  it("raises naming every offending asset when applied anyway, and changes nothing", async () => {
    const refused = await applyMigrations(scratch.db).then(
      () => null,
      (error: unknown) => error,
    );
    expect(sqlMessage(refused)).toMatch(
      /asset_stored_blob_check cannot be added: these assets have no blob: manimkc:out\/a\/one\.mp4 \(video\)\. Run catalog asset upload/,
    );
    expect((await migrationStatus(scratch.db)).pending).toEqual(["0013_asset_blob_contract"]);
  });

  it("is held by catalog migrate, with the reason, and the other commands still run", async () => {
    const held = await migrateHolding(scratch.db);
    expect(held).toEqual([
      {
        tag: "0013_asset_blob_contract",
        reason: expect.stringMatching(/^1 asset\(s\) of a stored kind have no blob .*; 1 blob key\(s\) are not keys/),
      },
    ]);
    await expect(assertMigrated(scratch.db)).resolves.toBeUndefined();
  });

  it("raises naming every bad key once the assets are stored", async () => {
    const key = await storedBlob(scratch.db, "one", "mp4");
    await scratch.db.update(asset).set({ blobKey: key }).where(eq(asset.id, "manimkc:out/a/one.mp4"));
    const refused = await applyMigrations(scratch.db).then(
      () => null,
      (error: unknown) => error,
    );
    expect(sqlMessage(refused)).toMatch(new RegExp(`these keys are not keys @self-learn/blob makes: ${badKey}\\.`));
  });

  it("applies once nothing stands in its way, and the constraints then hold", async () => {
    await scratch.db.delete(blobObject).where(eq(blobObject.key, badKey));
    expect(await migrateHolding(scratch.db)).toEqual([]);
    expect((await migrationStatus(scratch.db)).pending).toEqual([]);
    expect((await doctor(scratch.db, "scratch")).blobContract).toEqual({ inForce: true, unstored: [], unkeyed: [] });

    const unstored = await scratch.db
      .insert(asset)
      .values({ id: "manimkc:out/a/two.vtt", kind: "captions", path: "out/a/two.vtt", sourceRepo: "manimkc" })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(sqlstate(unstored)).toBe(SQLSTATE.checkViolation);
    // A note, a log, a .tldr and a link are not stored kinds: a path, or a URL, still does.
    await scratch.db.insert(asset).values({ id: "note:learn/concepts/x/a.md", kind: "note", path: "learn/concepts/x/a.md", sourceRepo: "self-learn" });

    for (const key of [badKey, `Local/${sha("case")}.mp4`, `local/${sha("long")}.${"x".repeat(17)}`]) {
      const refused = await scratch.db.execute(sql`
        insert into blob_object (key, owner_id, sha256, bytes, mime, provider)
        values (${key}, ${key.slice(0, key.indexOf("/"))}, ${key.slice(key.indexOf("/") + 1, key.indexOf("/") + 65)}, 1, 'x/y', 'fs')`).then(
        () => null,
        (error: unknown) => error,
      );
      expect(sqlstate(refused), key).toBe(SQLSTATE.checkViolation);
    }
  });
});

describe.skipIf(!reachable.ok)("the manimkc import under the contract", () => {
  let scratch: Scratch;
  let work: string;
  let tree: string;
  let videoFile: string;
  const saved = { url: process.env["DATABASE_URL"], manimkc: process.env["MANIMKC_ROOT"] };

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    work = await mkdtemp(path.join(tmpdir(), "catalog-blob-contract-"));
    tree = path.join(work, "tree");
    await seedWithManimkc(tree);
    const manimkc = path.join(work, "manimkc");
    ({ videoFile } = await manimkcStandIn(manimkc, Buffer.from("first render")));
    process.env["DATABASE_URL"] = scratch.url;
    process.env["MANIMKC_ROOT"] = manimkc;
  }, 60_000);

  afterAll(async () => {
    for (const [key, value] of [["DATABASE_URL", saved.url], ["MANIMKC_ROOT", saved.manimkc]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await scratch?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  const video = async () =>
    (await scratch.db.select().from(asset).where(eq(asset.id, "manimkc:out/demo/one/one.mp4")))[0];

  it("stores each file before the row that names it", async () => {
    await runImportCommand({ dir: tree });
    const row = await video();
    expect(row?.blobKey).toBe(`local/${sha("first render")}.mp4`);
    const [blob] = await scratch.db.select().from(blobObject).where(eq(blobObject.key, row?.blobKey ?? ""));
    expect(blob).toMatchObject({ state: "present", mime: "video/mp4", bytes: "first render".length });
    expect(await openBlobStore().stat(row?.blobKey ?? "")).toMatchObject({ bytes: "first render".length });
    const transcript = (await scratch.db.select().from(asset).where(eq(asset.kind, "transcript")))[0];
    expect(transcript?.blobKey).toMatch(/^local\/[0-9a-f]{64}\.json$/);
  });

  it("stores a re-render under its own key, and a second import stores and writes nothing", async () => {
    await writeFile(videoFile, "second render");
    const moved = await runImportCommand({ dir: tree, only: ["manimkc"] });
    expect(moved.sources.find((s) => s.source === "manimkc")?.revisions).toEqual({ asset: 1 });
    expect((await video())?.blobKey).toBe(`local/${sha("second render")}.mp4`);

    const again = await runImportCommand({ dir: tree, only: ["manimkc"] });
    const manimkc = again.sources.find((s) => s.source === "manimkc");
    expect(manimkc?.revisions).toEqual({});
    expect(manimkc?.notes).toContain("2 file(s) in the blob store, 0 uploaded by this run");
  });
});
