import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { asset, assetDerivation, blobObject } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { doctor } from "../src/commands/doctor";
import { runImportCommand } from "../src/commands/index-command";
import { posterId, uploadAssets } from "../src/content/asset-upload";
import { openBlobStore, uploadBlob } from "../src/content/blob";
import { writeContents } from "../src/content/write";
import { REPO_ROOT } from "../src/env";
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
  let manimkc: string;
  let ffmpeg: string;
  const saved = { url: process.env["DATABASE_URL"], manimkc: process.env["MANIMKC_ROOT"] };

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    work = await mkdtemp(path.join(tmpdir(), "catalog-blob-contract-"));
    tree = path.join(work, "tree");
    await seedWithManimkc(tree);
    manimkc = path.join(work, "manimkc");
    ({ videoFile } = await manimkcStandIn(manimkc, Buffer.from("first render")));
    // Cuts a "frame" from the file after `-i`, so a re-render's poster differs.
    ffmpeg = path.join(work, "ffmpeg");
    await writeFile(
      ffmpeg,
      `#!/bin/sh\nwhile [ $# -gt 0 ]; do if [ "$1" = "-i" ]; then f="$2"; fi; shift; done\nshasum -a 256 "$f" | cut -c1-16\n`,
    );
    await chmod(ffmpeg, 0o755);
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

  const upload = () => uploadAssets(scratch.db, { store: openBlobStore(), repoRoot: REPO_ROOT, manimkcRoot: manimkc, ffmpeg });
  const derivedFrom = async (id: string) =>
    (await scratch.db.select().from(assetDerivation).where(eq(assetDerivation.assetId, id))).map((d) => d.sourceAssetId);

  it("leaves the upload only the poster to make", async () => {
    const first = await upload();
    expect(first.items.map((i) => [i.kind, i.action])).toEqual([
      ["video", "present"],
      ["transcript", "present"],
      ["poster", "made"],
    ]);
    expect(await derivedFrom(posterId("manimkc:out/demo/one/one.mp4"))).toEqual(["manimkc:out/demo/one/one.mp4"]);
  });

  it("stores a re-render under its own key, unhooks the old render's poster, and a second import stores and writes nothing", async () => {
    await writeFile(videoFile, "second render");
    const moved = await runImportCommand({ dir: tree, only: ["manimkc"] });
    const manimkcWrite = moved.sources.find((s) => s.source === "manimkc");
    // The video's revision; the poster's is written through the seam beside it.
    expect(manimkcWrite?.revisions).toEqual({ asset: 1 });
    expect(manimkcWrite?.notes).toContain("1 poster(s) unhooked from a re-rendered video; the next `catalog asset upload` cuts new ones");
    expect((await video())?.blobKey).toBe(`local/${sha("second render")}.mp4`);
    const poster = posterId("manimkc:out/demo/one/one.mp4");
    expect(await derivedFrom(poster)).toEqual([]);
    const posterKey = async () => (await scratch.db.select().from(asset).where(eq(asset.id, poster)))[0]?.blobKey;
    const oldPoster = await posterKey();

    // The next upload cuts the new render's poster and hooks it back up.
    const recut = await upload();
    expect(recut.items.find((i) => i.kind === "poster")?.action).toBe("made");
    expect(await derivedFrom(poster)).toEqual(["manimkc:out/demo/one/one.mp4"]);
    expect(await posterKey()).not.toBe(oldPoster);
    expect((await upload()).rowsWritten).toBe(0);

    const again = await runImportCommand({ dir: tree, only: ["manimkc"] });
    const manimkcRun = again.sources.find((s) => s.source === "manimkc");
    expect(manimkcRun?.revisions).toEqual({});
    expect(manimkcRun?.notes).toContain("2 file(s) in the blob store, 0 uploaded by this run");
    expect(manimkcRun?.notes.some((n) => n.includes("unhooked"))).toBe(false);
  });

  it("unhooks a stale poster an earlier import left derived, from the revisions alone", async () => {
    const poster = posterId("manimkc:out/demo/one/one.mp4");
    const id = "manimkc:out/demo/one/one.mp4";
    await upload();
    expect(await derivedFrom(poster)).toEqual([id]);
    // A re-render whose import linked the bytes and then failed before the
    // unhook: the video's new key committed through the seam, the poster
    // still derived from it.
    await writeFile(videoFile, "third render");
    const stored = await uploadBlob(scratch.db, openBlobStore(), { ownerId: "local", file: videoFile, mime: "video/mp4", ext: "mp4" });
    const row = await video();
    const [latest] = await scratch.db.execute<{ id: number }>(
      sql`select max(id)::int as id from content_revision where entity_type = 'asset' and entity_id = ${id}`,
    ).then((r) => r.rows);
    const rest: Record<string, unknown> = { ...row };
    delete rest["createdAt"];
    delete rest["updatedAt"];
    await writeContents(scratch.db, [
      {
        type: "asset",
        id,
        next: { row: { ...rest, blobKey: stored.key, contentHash: stored.sha256, bytes: stored.bytes }, links: { asset_topic: [{ topicSlug: "agent-tool-use-and-reasoning-loops" }] } },
        base: latest?.id ?? null,
        author: "test",
        authorKind: "import",
        reason: "an import that died before its unhook",
      },
    ]);
    expect(await derivedFrom(poster)).toEqual([id]);
    // The next import changes no row, and still finds the poster was cut from other bytes.
    const retry = await runImportCommand({ dir: tree, only: ["manimkc"] });
    expect(retry.sources.find((s) => s.source === "manimkc")?.revisions).toEqual({});
    expect(retry.sources.find((s) => s.source === "manimkc")?.notes).toContain(
      "1 poster(s) unhooked from a re-rendered video; the next `catalog asset upload` cuts new ones",
    );
    expect(await derivedFrom(poster)).toEqual([]);
  });
});

describe.skipIf(!reachable.ok)("a migration queued behind a held contract", () => {
  let scratch: Scratch;
  let folder: string;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db, { folder: await partialMigrations(BEFORE_BLOB_CONTRACT) });
    await scratch.db.insert(asset).values({ id: "manimkc:out/a/one.mp4", kind: "video", path: "out/a/one.mp4", sourceRepo: "manimkc" });
    // The real folder plus one ordinary migration after 0013.
    folder = await partialMigrations(BEFORE_BLOB_CONTRACT + 1);
    const journal = path.join(folder, "meta", "_journal.json");
    type Entry = { idx: number; tag: string; when: number };
    const parsed = JSON.parse(await readFile(journal, "utf8")) as { entries: Entry[] };
    const last = parsed.entries.at(-1) as Entry;
    parsed.entries.push({ ...last, idx: last.idx + 1, tag: "0014_later", when: last.when + 1 });
    await writeFile(journal, JSON.stringify(parsed));
    await writeFile(path.join(folder, "0014_later.sql"), "CREATE TABLE later_thing (id text PRIMARY KEY);");
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    if (folder !== undefined) await rm(folder, { recursive: true, force: true });
  });

  it("waits with it, and the commands that clear the hold still run", async () => {
    const held = await migrateHolding(scratch.db, { folder });
    expect(held.map((h) => h.tag)).toEqual(["0013_asset_blob_contract", "0014_later"]);
    expect(held[1]?.reason).toBe("waits for 0013_asset_blob_contract, which is held");
    // assertMigrated reads the real folder, where 0013 is the first outstanding.
    await expect(assertMigrated(scratch.db)).resolves.toBeUndefined();
  });
});
