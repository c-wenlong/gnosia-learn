import { createHash, randomBytes } from "node:crypto";
import { PassThrough, Readable } from "node:stream";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BlobIntegrityError,
  BlobKeyError,
  BlobNotFoundError,
  BlobRangeError,
  key,
  type BlobListing,
  type BlobMeta,
  type BlobStore,
} from "../src/index";

/**
 * The contract every `BlobStore` adapter must keep, as tests.
 *
 * An adapter is correct when this passes against it unchanged. The `fs`
 * adapter runs it in `fs.test.ts`; a cloud adapter adds one file beside that
 * one calling `conformance("r2", () => r2Store(...), { skip })`, with `skip`
 * set to a named reason when its token is absent, the way the Postgres suites
 * skip on a laptop with no database.
 *
 * Everything the suite writes sits under two owner ids unique to the run, so
 * it can share a bucket with real data and still clean up exactly what it
 * made. Nothing here reaches into an adapter's storage directly: a check that
 * needs to look at the disk belongs in that adapter's own test file.
 */

export interface ConformanceOptions {
  /** Why the suite cannot run here. Unset means it runs. */
  skip?: string;
  /** Runs after the suite has deleted its own objects. */
  teardown?: () => Promise<void> | void;
}

export function conformance(
  name: string,
  makeStore: () => Promise<BlobStore> | BlobStore,
  options: ConformanceOptions = {},
): void {
  const title = options.skip ? `BlobStore conformance: ${name} (skipped: ${options.skip})` : `BlobStore conformance: ${name}`;

  describe.skipIf(Boolean(options.skip))(title, () => {
    const run = `conf-${randomBytes(4).toString("hex")}`;
    const ownerA = `${run}-a`;
    const ownerB = `${run}-b`;
    let store: BlobStore;

    beforeAll(async () => {
      store = await makeStore();
    });

    afterAll(async () => {
      if (store !== undefined) {
        for await (const { key: listed } of store.list(`${run}-`)) await store.delete(listed);
      }
      await options.teardown?.();
    });

    /** Puts `data` under `owner` with honest meta, and returns the key. */
    async function putHonest(owner: string, data: Buffer, ext = "bin"): Promise<string> {
      const k = key(owner, sha256(data), ext);
      await store.put(k, chunked(data), meta(data));
      return k;
    }

    it("names its provider with a value blob_object.provider accepts", () => {
      expect(["fs", "vercel-blob", "r2"]).toContain(store.provider);
    });

    it("round-trips bytes streamed in many chunks, and head reports their size", async () => {
      const data = bytes(300_000, 1);
      const k = await putHonest(ownerA, data);

      expect(await collect(await store.get(k))).toEqual(data);
      const head = await store.head(k);
      expect(head?.bytes).toBe(data.length);
      if (head?.sha256 !== undefined) expect(head.sha256).toBe(sha256(data));
    });

    it("round-trips an empty object", async () => {
      const empty = Buffer.alloc(0);
      const k = await putHonest(ownerA, empty, "txt");

      expect(await collect(await store.get(k))).toEqual(empty);
      expect((await store.head(k))?.bytes).toBe(0);
    });

    it("reads a range inclusive at both ends, clamping an end past the object", async () => {
      const data = bytes(1_000, 2);
      const k = await putHonest(ownerA, data);

      const read = async (start: number, end: number) => collect(await store.get(k, { start, end }));
      expect(await read(0, 0)).toEqual(data.subarray(0, 1));
      expect(await read(10, 19)).toEqual(data.subarray(10, 20));
      expect(await read(999, 999)).toEqual(data.subarray(999));
      expect(await read(0, 999)).toEqual(data);
      expect(await read(990, 5_000)).toEqual(data.subarray(990));
    });

    it("refuses a range it cannot serve", async () => {
      const data = bytes(1_000, 3);
      const k = await putHonest(ownerA, data);
      const empty = await putHonest(ownerA, Buffer.alloc(0), "txt");

      for (const range of [
        { start: 1_000, end: 1_000 },
        { start: 5, end: 4 },
        { start: -1, end: 3 },
        { start: 0.5, end: 3 },
      ]) {
        await expect(store.get(k, range)).rejects.toBeInstanceOf(BlobRangeError);
      }
      await expect(store.get(empty, { start: 0, end: 0 })).rejects.toBeInstanceOf(BlobRangeError);
    });

    it("answers null for head, and BlobNotFoundError for get, on a key never put", async () => {
      const absent = key(ownerA, sha256(bytes(10, 4)), "bin");
      expect(await store.head(absent)).toBeNull();
      await expect(store.get(absent)).rejects.toBeInstanceOf(BlobNotFoundError);
      await expect(store.get(absent, { start: 0, end: 0 })).rejects.toBeInstanceOf(BlobNotFoundError);
    });

    it("refuses a body whose hash is not the declared one, and keeps nothing", async () => {
      const data = bytes(50_000, 5);
      const claimed = bytes(50_000, 6);
      const k = key(ownerA, sha256(claimed), "bin");

      await expect(store.put(k, chunked(data), meta(claimed))).rejects.toBeInstanceOf(BlobIntegrityError);
      await expectAbsent(k);
    });

    it("refuses a body longer or shorter than declared, and keeps nothing", async () => {
      const data = bytes(50_000, 7);
      const k = key(ownerA, sha256(data), "bin");

      for (const declared of [data.length - 1, data.length + 1]) {
        await expect(store.put(k, chunked(data), { ...meta(data), bytes: declared })).rejects.toBeInstanceOf(
          BlobIntegrityError,
        );
        await expectAbsent(k);
      }
    });

    it("stops reading a body once it runs past the declared length", async () => {
      const declared = bytes(1_000, 19);
      const k = key(ownerA, sha256(declared), "bin");
      const piece = Buffer.alloc(64 * 1024, 1);
      const ceiling = 256 * 1024 * 1024;
      let pulled = 0;
      // Far longer than declared. An adapter that reads to the end before
      // counting pulls all of it; the contract is to refuse at the overrun,
      // with slack for an adapter that buffers a multipart chunk first.
      const endless = new Readable({
        read() {
          if (pulled >= ceiling) {
            this.push(null);
            return;
          }
          pulled += piece.length;
          this.push(piece);
        },
      });

      await expect(store.put(k, endless, meta(declared))).rejects.toBeInstanceOf(BlobIntegrityError);
      expect(pulled).toBeLessThan(64 * 1024 * 1024);
      await expectAbsent(k);
    });

    it("refuses meta whose hash is not the key's, even when the bytes match the meta", async () => {
      const data = bytes(1_000, 8);
      const k = key(ownerA, sha256(bytes(1_000, 9)), "bin");

      await expect(store.put(k, chunked(data), meta(data))).rejects.toBeInstanceOf(BlobIntegrityError);
      await expectAbsent(k);
    });

    it("refuses a body that fails partway, and keeps nothing", async () => {
      const data = bytes(20_000, 10);
      const k = key(ownerA, sha256(data), "bin");
      const failing = new Readable({
        read() {
          this.push(data.subarray(0, 10_000));
          this.destroy(new Error("the source went away"));
        },
      });

      await expect(store.put(k, failing, meta(data))).rejects.toThrow("the source went away");
      await expectAbsent(k);
    });

    it("keeps an object invisible until its put has finished", async () => {
      const data = bytes(200_000, 11);
      const k = key(ownerA, sha256(data), "bin");
      const body = new PassThrough();

      const putting = store.put(k, body, meta(data));
      body.write(data.subarray(0, 100_000));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(await store.head(k)).toBeNull();
      expect(await keys(`${ownerA}/`)).not.toContain(k);

      body.end(data.subarray(100_000));
      await putting;
      expect((await store.head(k))?.bytes).toBe(data.length);
    });

    it("accepts the same key again, concurrently too, and keeps the bytes", async () => {
      const data = bytes(100_000, 12);
      const k = key(ownerA, sha256(data), "bin");

      await Promise.all([
        store.put(k, chunked(data), meta(data)),
        store.put(k, chunked(data), meta(data)),
      ]);
      await store.put(k, chunked(data), meta(data));
      expect(await collect(await store.get(k))).toEqual(data);
    });

    it("refuses a malformed key from every method, and destroys a refused body", async () => {
      const data = bytes(10, 13);
      const hash = sha256(data);
      for (const bad of [
        `../${hash}.bin`,
        `/${ownerA}/${hash}.bin`,
        `${ownerA}/sub/${hash}.bin`,
        `${ownerA}/${hash}`,
        `${ownerA}/${hash}.tar.gz`,
        `${ownerA}/${hash.toUpperCase()}.bin`,
        `${ownerA.toUpperCase()}/${hash}.bin`,
        `.tmp/${hash}.bin`,
        `${ownerA}/not-a-hash.bin`,
        "",
      ]) {
        const body = chunked(data);
        await expect(store.put(bad, body, meta(data))).rejects.toBeInstanceOf(BlobKeyError);
        expect(body.destroyed).toBe(true);
        await expect(store.head(bad)).rejects.toBeInstanceOf(BlobKeyError);
        await expect(store.get(bad)).rejects.toBeInstanceOf(BlobKeyError);
        await expect(store.signedUrl(bad, 60)).rejects.toBeInstanceOf(BlobKeyError);
        await expect(store.delete(bad)).rejects.toBeInstanceOf(BlobKeyError);
      }
    });

    it("gives a signed URL that serves the bytes and a Range of them, or null", async () => {
      const data = bytes(5_000, 14);
      const k = await putHonest(ownerA, data);
      const url = await store.signedUrl(k, 300);
      if (url === null) return;

      const whole = await fetch(url);
      expect(whole.ok).toBe(true);
      expect(Buffer.from(await whole.arrayBuffer())).toEqual(data);

      const part = await fetch(url, { headers: { Range: "bytes=10-19" } });
      expect(part.status).toBe(206);
      expect(Buffer.from(await part.arrayBuffer())).toEqual(data.subarray(10, 20));
    });

    it("deletes an object, and deleting it again succeeds", async () => {
      const data = bytes(1_000, 15);
      const k = await putHonest(ownerA, data);

      await store.delete(k);
      await expectAbsent(k);
      await expect(store.get(k)).rejects.toBeInstanceOf(BlobNotFoundError);
      await expect(store.delete(k)).resolves.toBeUndefined();
    });

    it("lists by plain string prefix, so one owner's objects come back alone", async () => {
      const a1 = bytes(100, 16);
      const a2 = bytes(200, 17);
      const b1 = bytes(300, 18);
      const ka1 = await putHonest(ownerA, a1, "svg");
      const ka2 = await putHonest(ownerA, a2, "mp4");
      const kb1 = await putHonest(ownerB, b1, "mp4");

      const listedA = await listing(`${ownerA}/`);
      expect(listedA.map(({ key: listed, bytes: size }) => ({ key: listed, bytes: size }))).toEqual(
        expect.arrayContaining([
          { key: ka1, bytes: a1.length },
          { key: ka2, bytes: a2.length },
        ]),
      );
      expect(listedA.map((entry) => entry.key)).not.toContain(kb1);
      expect(listedA.every((entry) => entry.key.startsWith(`${ownerA}/`))).toBe(true);

      const listedB = await listing(`${ownerB}/`);
      expect(listedB.map((entry) => [entry.key, entry.bytes])).toEqual([[kb1, b1.length]]);
      // A wall-clock upload time, so an audit can leave a fresh orphan alone.
      // The window allows for a cloud store's clock disagreeing with ours.
      const uploadedAt = listedB[0]?.uploadedAt;
      expect(uploadedAt).toBeInstanceOf(Date);
      expect(Math.abs(Date.now() - (uploadedAt?.getTime() ?? 0))).toBeLessThan(10 * 60 * 1000);
      // A prefix that stops inside an owner id, and one that runs into a hash.
      expect(await keys(`${run}-`)).toEqual(expect.arrayContaining([ka1, ka2, kb1]));
      expect(await keys(ka1.slice(0, ownerA.length + 3))).toContain(ka1);
      expect(await keys(ka1)).toEqual([ka1]);
      expect(await keys(`${run}-nobody/`)).toEqual([]);
    });

    async function expectAbsent(k: string): Promise<void> {
      expect(await store.head(k)).toBeNull();
      expect(await keys(k.slice(0, k.indexOf("/") + 1))).not.toContain(k);
    }

    async function listing(prefix: string) {
      const out: BlobListing[] = [];
      for await (const entry of store.list(prefix)) out.push(entry);
      return out.sort((x, y) => (x.key < y.key ? -1 : 1));
    }

    async function keys(prefix: string): Promise<string[]> {
      return (await listing(prefix)).map((entry) => entry.key);
    }
  });
}

/** Deterministic, so a failure reproduces; varied, so a stuck offset shows. */
export function bytes(length: number, seed: number): Buffer {
  const out = Buffer.alloc(length);
  let state = (seed * 2_654_435_761) >>> 0 || 1;
  for (let i = 0; i < length; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    out[i] = state & 0xff;
  }
  return out;
}

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function meta(data: Buffer): BlobMeta {
  return { sha256: sha256(data), bytes: data.length, mime: "application/octet-stream" };
}

/** A stream of `data` in small pieces, so an adapter cannot assume one chunk. */
export function chunked(data: Buffer, size = 7_001): Readable {
  const pieces: Buffer[] = [];
  for (let i = 0; i < data.length; i += size) pieces.push(data.subarray(i, i + size));
  return Readable.from(pieces);
}

export async function collect(stream: Readable): Promise<Buffer> {
  const pieces: Buffer[] = [];
  for await (const chunk of stream) pieces.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(pieces);
}
