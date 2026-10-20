import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fsStore, key as blobKey, type BlobStore } from "@self-learn/blob";
import { blobObject } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { formatBlobAudit, runBlobAudit, type BlobAuditCommandResult } from "../src/commands/blob-audit";
import { doctor, formatDoctor } from "../src/commands/doctor";
import { formatStatus, runStatus } from "../src/commands/status";
import { auditBlobs } from "../src/content/blob-audit";
import {
  capFailureFields,
  OWNER_BYTES_CAP_ENV,
  OWNER_UPLOADS_PER_DAY_ENV,
  OwnerCapConfigError,
  OwnerCapError,
  ownerCapLock,
  ownerCaps,
  uploadBlob,
} from "../src/content/blob";
import { connect, inTransaction } from "../src/db";
import { ensureLearner } from "../src/state";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * Per-owner caps on the blob store (phase 4 of docs/CONTENT-MIGRATION.md):
 * `SELF_LEARN_OWNER_BYTES_CAP` on what one owner stores and
 * `SELF_LEARN_OWNER_UPLOADS_PER_DAY` on how many new objects one owner
 * uploads in a rolling 24 hours, both measured from `blob_object` by the key's
 * owner prefix and checked in `uploadBlob` before the pending row is written.
 * Unset, which is today, there is no cap and nothing is measured.
 */

const reachable = await probe();
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const B = "tenant-b";

describe("ownerCaps", () => {
  it("is no cap when the variables are unset or empty", () => {
    expect(ownerCaps({})).toEqual({ bytes: null, uploadsPerDay: null });
    expect(ownerCaps({ [OWNER_BYTES_CAP_ENV]: " ", [OWNER_UPLOADS_PER_DAY_ENV]: "" })).toEqual({
      bytes: null,
      uploadsPerDay: null,
    });
  });

  it("reads whole numbers, zero included", () => {
    expect(ownerCaps({ [OWNER_BYTES_CAP_ENV]: "5000000000", [OWNER_UPLOADS_PER_DAY_ENV]: "0" })).toEqual({
      bytes: 5_000_000_000,
      uploadsPerDay: 0,
    });
  });

  it("says a value too large to count exactly is too large, not that it is no number", () => {
    const error = (() => {
      try {
        ownerCaps({ [OWNER_BYTES_CAP_ENV]: "99999999999999999999" });
      } catch (e) {
        return e as Error;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(OwnerCapConfigError);
    expect(error?.message).toContain("is larger than 9007199254740991");
    expect(error?.message).not.toContain("not a whole number");
  });

  it("refuses a value that is not a whole number rather than dropping the cap", () => {
    for (const value of ["5GB", "1.5", "-1", "0x10", "1e9"]) {
      expect(() => ownerCaps({ [OWNER_BYTES_CAP_ENV]: value })).toThrow(OwnerCapConfigError);
    }
    expect(() => ownerCaps({ [OWNER_UPLOADS_PER_DAY_ENV]: "ten" })).toThrow(/SELF_LEARN_OWNER_UPLOADS_PER_DAY/);
  });
});

describe.skipIf(!reachable.ok)("uploadBlob under per-owner caps", () => {
  let scratch: Scratch;
  let base: string;
  let store: BlobStore;
  const saved = { bytes: process.env[OWNER_BYTES_CAP_ENV], uploads: process.env[OWNER_UPLOADS_PER_DAY_ENV] };

  /** A file of `text`, uploaded as `owner`'s. */
  const upload = async (owner: string, text: string) => {
    const file = path.join(base, `${sha256(text)}.bin`);
    await writeFile(file, text);
    return uploadBlob(scratch.db, store, { ownerId: owner, file, mime: "application/octet-stream", ext: "bin" });
  };
  const keyOf = (owner: string, text: string) => blobKey(owner, sha256(text), "bin");
  const rowOf = async (key: string) => (await scratch.db.select().from(blobObject).where(eq(blobObject.key, key)))[0];

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await ensureLearner(scratch.db, B);
  }, 60_000);

  beforeEach(async () => {
    base = await mkdtemp(path.join(tmpdir(), "blob-caps-"));
    store = fsStore(path.join(base, "store"));
    await scratch.db.delete(blobObject);
  });

  afterEach(async () => {
    for (const [variable, value] of [
      [OWNER_BYTES_CAP_ENV, saved.bytes],
      [OWNER_UPLOADS_PER_DAY_ENV, saved.uploads],
    ] as const) {
      if (value === undefined) delete process.env[variable];
      else process.env[variable] = value;
    }
    await rm(base, { recursive: true, force: true });
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it("uploads without measuring anything when no cap is set", async () => {
    delete process.env[OWNER_BYTES_CAP_ENV];
    delete process.env[OWNER_UPLOADS_PER_DAY_ENV];
    for (const text of ["one", "two", "three"]) expect((await upload("local", text)).uploaded).toBe(true);
  });

  it("refuses an upload that would take its owner past the bytes cap, storing and recording nothing", async () => {
    process.env[OWNER_BYTES_CAP_ENV] = "10";
    expect((await upload("local", "123456")).uploaded).toBe(true);
    const error = await upload("local", "abcdef").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OwnerCapError);
    expect(error).toMatchObject({ owner: "local", cap: "bytes", code: "BLOB_CAP" });
    expect(await rowOf(keyOf("local", "abcdef"))).toBeUndefined();
    expect(await store.stat(keyOf("local", "abcdef"))).toBeNull();
    // Exactly at the cap is allowed.
    expect((await upload("local", "wxyz")).uploaded).toBe(true);
  });

  it("measures each owner by its own prefix", async () => {
    process.env[OWNER_BYTES_CAP_ENV] = "10";
    await upload("local", "1234567890");
    expect((await upload(B, "abcdefghij")).uploaded).toBe(true);
    await expect(upload(B, "k")).rejects.toBeInstanceOf(OwnerCapError);
  });

  it("never refuses a key that already has a row, even under a cap lowered below what the owner holds", async () => {
    process.env[OWNER_BYTES_CAP_ENV] = "10";
    process.env[OWNER_UPLOADS_PER_DAY_ENV] = "1";
    await upload("local", "1234567890");
    // Already present: not an upload, whatever the caps say.
    expect((await upload("local", "1234567890")).uploaded).toBe(false);
    // The caps come down below what the owner already holds, and the store
    // loses the object: putting it back adds nothing, so it is not refused.
    process.env[OWNER_BYTES_CAP_ENV] = "5";
    process.env[OWNER_UPLOADS_PER_DAY_ENV] = "0";
    await store.delete(keyOf("local", "1234567890"));
    expect((await upload("local", "1234567890")).uploaded).toBe(true);
    // A new object is still refused.
    await expect(upload("local", "x")).rejects.toBeInstanceOf(OwnerCapError);
  });

  it("counts a row an audit deleted while the upload waited as a new object", async () => {
    process.env[OWNER_UPLOADS_PER_DAY_ENV] = "1";
    await upload("local", "today");
    // A stale pending row from two days ago, for the bytes about to be uploaded.
    await scratch.db.insert(blobObject).values({
      key: keyOf("local", "stale"),
      ownerId: "local",
      sha256: sha256("stale"),
      bytes: 5,
      mime: "application/octet-stream",
      provider: "fs",
      state: "pending",
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    const other = connect({ url: scratch.url, max: 1 });
    try {
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked: () => void = () => {};
      const isLocked = new Promise<void>((resolve) => (locked = resolve));
      // `blob audit --fix` deleting the stale row, holding the owner's lock
      // while the upload has already read the row and is waiting for it.
      const audit = inTransaction(other.db, async (tx) => {
        await tx.execute(sql`select 1`);
        locked();
        await held;
        await tx.delete(blobObject).where(eq(blobObject.key, keyOf("local", "stale")));
      });
      try {
        await isLocked;
        const retry = upload("local", "stale");
        retry.catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 300));
        release();
        await audit;
        await expect(retry).rejects.toMatchObject({ cap: "uploads-per-day" });
      } finally {
        release();
        await audit.catch(() => {});
      }
    } finally {
      await other.close();
    }
  });

  it("never lets a delete between the existence check and the pending write past the day cap", async () => {
    // The reviewer's window: an audit's `--fix` that does not take the owner's
    // lock deletes the stale row after the upload has asked whether it exists
    // and before its pending write. Here the delete is held open across that
    // moment. The upload's check locks the row it asks about, so it waits for
    // the delete, then sees no row and measures a new object.
    process.env[OWNER_UPLOADS_PER_DAY_ENV] = "1";
    await upload("local", "today");
    await scratch.db.insert(blobObject).values({
      key: keyOf("local", "stale"),
      ownerId: "local",
      sha256: sha256("stale"),
      bytes: 5,
      mime: "application/octet-stream",
      provider: "fs",
      state: "pending",
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    const other = connect({ url: scratch.url, max: 1 });
    try {
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      let deleted: () => void = () => {};
      const isDeleted = new Promise<void>((resolve) => (deleted = resolve));
      const audit = inTransaction(other.db, async (tx) => {
        await tx.delete(blobObject).where(eq(blobObject.key, keyOf("local", "stale")));
        deleted();
        await held;
      });
      try {
        await isDeleted;
        let settled = false;
        const retry = upload("local", "stale").finally(() => (settled = true));
        retry.catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 300));
        // Waiting on the row the delete holds, not answering from a snapshot
        // in which the row still exists.
        expect(settled).toBe(false);
        release();
        await audit;
        await expect(retry).rejects.toMatchObject({ cap: "uploads-per-day" });
        expect(await rowOf(keyOf("local", "stale"))).toBeUndefined();
      } finally {
        release();
        await audit.catch(() => {});
      }
    } finally {
      await other.close();
    }
  });

  it("makes the audit's stale-pending delete wait for an upload of the key in flight, and then keep the row", async () => {
    process.env[OWNER_UPLOADS_PER_DAY_ENV] = "5";
    const key = keyOf("local", "stale");
    await scratch.db.insert(blobObject).values({
      key,
      ownerId: "local",
      sha256: sha256("stale"),
      bytes: 5,
      mime: "application/octet-stream",
      provider: "fs",
      state: "pending",
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    const other = connect({ url: scratch.url, max: 1 });
    try {
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked: () => void = () => {};
      const isLocked = new Promise<void>((resolve) => (locked = resolve));
      // An upload of the key between its cap check and its pending write:
      // it holds the owner's lock, and its write refreshes `updated_at`.
      const inFlight = inTransaction(other.db, async (tx) => {
        await tx.execute(sql`select 1`);
        locked();
        await held;
        await tx.update(blobObject).set({ updatedAt: sql`cast(unixepoch('subsec') * 1000 as integer)` }).where(eq(blobObject.key, key));
      });
      try {
        await isLocked;
        let settled = false;
        const audit = auditBlobs(scratch.db, store, { fix: true }).finally(() => (settled = true));
        audit.catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(settled).toBe(false);
        release();
        await inFlight;
        const result = await audit;
        const finding = result.findings.find((f) => f.key === key);
        expect(finding?.fixed).toBeUndefined();
        expect(finding?.detail).toContain("an upload took it up again");
        expect(await rowOf(key)).toBeDefined();
      } finally {
        release();
        await inFlight.catch(() => {});
      }
    } finally {
      await other.close();
    }
  });

  it("checks the day cap under the owner's lock, so an upload in flight is counted", async () => {
    process.env[OWNER_UPLOADS_PER_DAY_ENV] = "1";
    const other = connect({ url: scratch.url, max: 1 });
    try {
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked: () => void = () => {};
      const isLocked = new Promise<void>((resolve) => (locked = resolve));
      const inFlight = inTransaction(other.db, async (tx) => {
        await tx.execute(sql`select 1`);
        locked();
        await held;
        await tx.insert(blobObject).values({
          key: keyOf("local", "first"),
          ownerId: "local",
          sha256: sha256("first"),
          bytes: 5,
          mime: "application/octet-stream",
          provider: "fs",
          state: "pending",
        });
      });
      try {
        await isLocked;
        let settled = false;
        const second = upload("local", "second").finally(() => (settled = true));
        second.catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(settled).toBe(false);
        release();
        await inFlight;
        await expect(second).rejects.toMatchObject({ cap: "uploads-per-day" });
      } finally {
        release();
        await inFlight.catch(() => {});
      }
    } finally {
      await other.close();
    }
  });

  it("refuses the upload past the day's count, and lets it through once the oldest leaves the window", async () => {
    process.env[OWNER_UPLOADS_PER_DAY_ENV] = "2";
    await upload("local", "first");
    await upload("local", "second");
    await expect(upload("local", "third")).rejects.toMatchObject({ cap: "uploads-per-day" });
    expect(await rowOf(keyOf("local", "third"))).toBeUndefined();
    // Another owner's day is its own.
    expect((await upload(B, "third")).uploaded).toBe(true);
    await scratch.db
      .update(blobObject)
      .set({ createdAt: sql`cast(unixepoch('subsec') * 1000 as integer) - interval '25 hours'` })
      .where(eq(blobObject.key, keyOf("local", "first")));
    expect((await upload("local", "third")).uploaded).toBe(true);
  });

  it("refuses every new upload at a cap of zero, with the fields a --json failure carries", async () => {
    process.env[OWNER_UPLOADS_PER_DAY_ENV] = "0";
    const error = await upload("local", "anything").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OwnerCapError);
    expect(capFailureFields(error)).toEqual({ code: "BLOB_CAP", owner: "local", cap: "uploads-per-day" });
    expect(capFailureFields(new Error("other"))).toEqual({});
  });

  it("refuses a new object under a malformed cap before storing anything", async () => {
    process.env[OWNER_BYTES_CAP_ENV] = "5GB";
    await expect(upload("local", "anything")).rejects.toBeInstanceOf(OwnerCapConfigError);
    expect(await scratch.db.select().from(blobObject)).toEqual([]);
    expect(await store.stat(keyOf("local", "anything"))).toBeNull();
  });

  it("lets a key that already has a row through a malformed cap: a re-store, and putting back a lost object", async () => {
    delete process.env[OWNER_BYTES_CAP_ENV];
    await upload("local", "kept");
    process.env[OWNER_BYTES_CAP_ENV] = "5GB";
    // Present and in the store: what every unchanged `catalog import` and
    // `diagram put` does after the contract.
    expect((await upload("local", "kept")).uploaded).toBe(false);
    // Present in the table, gone from the store: put back, never refused.
    await store.delete(keyOf("local", "kept"));
    expect((await upload("local", "kept")).uploaded).toBe(true);
  });

  it("counts a pending row, bytes and day both: an upload in flight is about to be stored", async () => {
    process.env[OWNER_BYTES_CAP_ENV] = "10";
    await scratch.db.insert(blobObject).values({
      key: keyOf("local", "12345678"),
      ownerId: "local",
      sha256: sha256("12345678"),
      bytes: 8,
      mime: "application/octet-stream",
      provider: "fs",
      state: "pending",
    });
    await expect(upload("local", "abc")).rejects.toMatchObject({ cap: "bytes" });
    delete process.env[OWNER_BYTES_CAP_ENV];
    process.env[OWNER_UPLOADS_PER_DAY_ENV] = "1";
    await expect(upload("local", "abc")).rejects.toMatchObject({ cap: "uploads-per-day" });
    expect(await rowOf(keyOf("local", "abc"))).toBeUndefined();
  });

  it("measures the day on the database's clock", async () => {
    process.env[OWNER_UPLOADS_PER_DAY_ENV] = "1";
    await upload("local", "old");
    await scratch.db
      .update(blobObject)
      .set({ createdAt: sql`cast(unixepoch('subsec') * 1000 as integer) - interval '23 hours 59 minutes'` })
      .where(eq(blobObject.key, keyOf("local", "old")));
    await expect(upload("local", "new")).rejects.toMatchObject({ cap: "uploads-per-day" });
    await scratch.db
      .update(blobObject)
      .set({ createdAt: sql`cast(unixepoch('subsec') * 1000 as integer) - interval '24 hours 1 minute'` })
      .where(eq(blobObject.key, keyOf("local", "old")));
    expect((await upload("local", "new")).uploaded).toBe(true);
  });

  it("checks the cap under the owner's lock, so an upload in flight is counted", async () => {
    process.env[OWNER_BYTES_CAP_ENV] = "10";
    const other = connect({ url: scratch.url, max: 1 });
    try {
      // Another upload of this owner's is between its check and its commit:
      // it holds the lock and its pending row is not visible yet.
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked: () => void = () => {};
      const isLocked = new Promise<void>((resolve) => (locked = resolve));
      const inFlight = inTransaction(other.db, async (tx) => {
        await tx.execute(sql`select 1`);
        locked();
        await held;
        await tx.insert(blobObject).values({
          key: keyOf("local", "12345678"),
          ownerId: "local",
          sha256: sha256("12345678"),
          bytes: 8,
          mime: "application/octet-stream",
          provider: "fs",
          state: "pending",
        });
      });
      try {
        await isLocked;
        let settled = false;
        const second = upload("local", "abcdefgh").finally(() => (settled = true));
        second.catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 300));
        // Waiting on the lock rather than checking against what it can see.
        expect(settled).toBe(false);
        release();
        await inFlight;
        await expect(second).rejects.toBeInstanceOf(OwnerCapError);
      } finally {
        // A failed assertion above must not leave the other transaction open,
        // or closing its connection waits on it and the test times out.
        release();
        await inFlight.catch(() => {});
      }
    } finally {
      await other.close();
    }
  });

  it("reports what each owner holds in the audit", async () => {
    delete process.env[OWNER_BYTES_CAP_ENV];
    await upload("local", "1234");
    await upload("local", "56");
    await upload(B, "abcdefgh");
    const audit = await auditBlobs(scratch.db, store);
    expect(audit.byOwner).toEqual([
      { owner: "local", objects: 2, bytes: 6, uploadsLastDay: 2 },
      { owner: B, objects: 1, bytes: 8, uploadsLastDay: 1 },
    ]);
  });
});

describe("the audit's caps and per-owner lines", () => {
  const result = (caps: BlobAuditCommandResult["caps"]): BlobAuditCommandResult => ({
    database: "postgres://localhost:5432/scratch",
    blobRoot: "/tmp/blobs",
    ownRoot: true,
    provider: "fs",
    owner: null,
    rows: 3,
    objects: 3,
    fix: false,
    findings: [],
    outstanding: 0,
    byOwner: [
      { owner: "local", objects: 2, bytes: 6, uploadsLastDay: 2 },
      { owner: B, objects: 1, bytes: 8, uploadsLastDay: 0 },
    ],
    caps,
  });

  it("prints the caps in force and a line per owner", () => {
    const none = formatBlobAudit(result({ bytes: null, uploadsPerDay: null })).split("\n");
    expect(none).toContain("caps       none per owner");
    expect(none).toContain("  local         2 objects, 6 bytes, 2 uploaded in the last 24 hours");
    expect(none).toContain(`  ${B.padEnd(13)} 1 objects, 8 bytes, 0 uploaded in the last 24 hours`);
    expect(formatBlobAudit(result({ bytes: 100, uploadsPerDay: 5 }))).toContain(
      "caps       100 bytes stored, 5 uploads a day per owner",
    );
    expect(formatBlobAudit(result({ bytes: null, uploadsPerDay: 0 }))).toContain("caps       0 uploads a day per owner");
  });

  it("says a malformed cap refuses every upload, rather than hiding it", () => {
    expect(formatBlobAudit(result({ error: "SELF_LEARN_OWNER_BYTES_CAP=\"5GB\" is not a whole number." }))).toContain(
      'caps       unreadable, so every new upload is refused (a re-store of a key with a row is not): SELF_LEARN_OWNER_BYTES_CAP="5GB" is not a whole number.',
    );
  });

  describe.skipIf(!reachable.ok)("from the command", () => {
    let scratch: Scratch;
    let home: string;
    const saved = {
      url: process.env["DATABASE_URL"],
      home: process.env["SELF_LEARN_HOME"],
      bytes: process.env[OWNER_BYTES_CAP_ENV],
    };

    beforeAll(async () => {
      scratch = await migratedScratchDatabase();
      home = await mkdtemp(path.join(tmpdir(), "blob-caps-home-"));
      process.env["DATABASE_URL"] = scratch.url;
      process.env["SELF_LEARN_HOME"] = home;
    }, 60_000);

    afterAll(async () => {
      for (const [variable, value] of [
        ["DATABASE_URL", saved.url],
        ["SELF_LEARN_HOME", saved.home],
        [OWNER_BYTES_CAP_ENV, saved.bytes],
      ] as const) {
        if (value === undefined) delete process.env[variable];
        else process.env[variable] = value;
      }
      await scratch?.drop();
      await rm(home, { recursive: true, force: true });
    });

    it("carries the caps and each owner's totals in its result, the --json shape", async () => {
      process.env[OWNER_BYTES_CAP_ENV] = "5GB";
      const bad = await runBlobAudit({ fix: false });
      expect(bad.caps).toEqual({ error: expect.stringContaining(OWNER_BYTES_CAP_ENV) });
      expect(bad.byOwner).toEqual([]);
      process.env[OWNER_BYTES_CAP_ENV] = "1000";
      expect((await runBlobAudit({ fix: false })).caps).toEqual({ bytes: 1000, uploadsPerDay: null });
    });

    it("says an unreadable cap in doctor and status too, and blob audit exits 1 on it", async () => {
      process.env[OWNER_BYTES_CAP_ENV] = "5GB";
      const status = await runStatus();
      expect(status.caps).toEqual({ error: expect.stringContaining(OWNER_BYTES_CAP_ENV) });
      expect(formatStatus(status)).toContain("blob caps  unreadable, so every new upload is refused");
      const report = await doctor(scratch.db, "scratch");
      expect(report.caps).toEqual({ error: expect.stringContaining(OWNER_BYTES_CAP_ENV) });
      expect(formatDoctor(report)).toContain("blob caps: unreadable");
      const cli = path.resolve(import.meta.dirname, "../src/cli.ts");
      const ran = spawnSync(process.execPath, ["--import", "tsx", cli, "blob", "audit", "--json"], {
        env: { ...process.env },
        encoding: "utf8",
      });
      expect(ran.status).toBe(1);
      expect(JSON.parse(ran.stdout).caps).toEqual({ error: expect.stringContaining(OWNER_BYTES_CAP_ENV) });
      process.env[OWNER_BYTES_CAP_ENV] = "1000";
      expect((await runStatus()).caps).toEqual({ bytes: 1000, uploadsPerDay: null });
    });
  });
});
