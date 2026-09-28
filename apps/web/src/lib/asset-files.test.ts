import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BYTE_QUEUE,
  contentTypeFor,
  parseRange,
  safeFilename,
  webStreamFrom,
} from "@/lib/asset-files";

/**
 * The parts of the asset file route that need no database and no filesystem.
 *
 * They are here rather than folded into the route suite because the route
 * suite skips itself without Postgres, and range arithmetic and header
 * hygiene are exactly the things that should still be a gate on a laptop with
 * the database down.
 */

describe("parseRange", () => {
  it("sends the whole file when there is no range, or one it does not speak", () => {
    for (const header of [null, "", "  ", "frames=1-2", "bytes=x-y", "bytes=-", "bytes=0-9,20-29"]) {
      expect(parseRange(header, 100), String(header)).toEqual({ kind: "whole" });
    }
  });

  it("reads a closed range inclusively, as the header and the read stream both do", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ kind: "partial", start: 0, end: 9 });
    expect(parseRange("bytes=99-99", 100)).toEqual({ kind: "partial", start: 99, end: 99 });
  });

  it("clamps an end past the file to the last byte", () => {
    // A player that asks for more than there is gets what there is, which is
    // what makes a first request of `bytes=0-` work on any size of file.
    expect(parseRange("bytes=90-500", 100)).toEqual({ kind: "partial", start: 90, end: 99 });
    expect(parseRange("bytes=0-", 100)).toEqual({ kind: "partial", start: 0, end: 99 });
  });

  it("reads a suffix range from the end", () => {
    expect(parseRange("bytes=-10", 100)).toEqual({ kind: "partial", start: 90, end: 99 });
    // Longer than the file is the whole file, not an error.
    expect(parseRange("bytes=-500", 100)).toEqual({ kind: "partial", start: 0, end: 99 });
  });

  it("calls a range the file cannot satisfy unsatisfiable, not empty", () => {
    expect(parseRange("bytes=100-", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=200-300", 100)).toEqual({ kind: "unsatisfiable" });
    // `bytes=-0` asks for nothing.
    expect(parseRange("bytes=-0", 100)).toEqual({ kind: "unsatisfiable" });
    // An empty file satisfies nothing, and would otherwise compute 0..-1.
    expect(parseRange("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" });
  });
});

describe("contentTypeFor", () => {
  it("names the kinds the indexers produce, and refuses the rest", () => {
    expect(contentTypeFor("a/b/c.mp4")).toBe("video/mp4");
    expect(contentTypeFor("dot-product.SVG")).toBe("image/svg+xml");
    expect(contentTypeFor("clip.vtt")).toBe("text/vtt");
    expect(contentTypeFor("note.md")).toBe("text/markdown; charset=utf-8");
    // Refused rather than guessed at: an unknown extension is an asset kind
    // nobody has thought about, and text/html from this origin is the reason
    // that matters.
    expect(contentTypeFor("page.html")).toBeNull();
    expect(contentTypeFor("canvas.tldr")).toBeNull();
    expect(contentTypeFor("README")).toBeNull();
  });
});

describe("safeFilename", () => {
  it("keeps the basename and drops anything that could break a header", () => {
    expect(safeFilename("/data/out/demo.mp4")).toBe("demo.mp4");
    expect(safeFilename("a/b/we ird\r\nname.mp4")).toBe("we_ird__name.mp4");
    expect(safeFilename("/")).toBe("asset");
    expect(safeFilename("..")).toBe("asset");
  });
});

describe("webStreamFrom", () => {
  const MEGABYTE = 1024 * 1024;
  let dir: string;
  let file: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "asset-stream-"));
    file = path.join(dir, "big.bin");
    await writeFile(file, Buffer.alloc(8 * MEGABYTE, 7));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("stops reading the file when the client stops reading the stream", async () => {
    // The failure this pins: a queuing strategy that counts chunks rather than
    // bytes lets a 64 KiB high-water mark hold 64 KiB *chunks*, so one slow
    // client pulls the whole video into memory. `bytesRead` on the file stream
    // is the only place that is visible from outside.
    const source = createReadStream(file);
    const reader = webStreamFrom(source).getReader();

    await reader.read();
    await delay(200);

    expect(source.bytesRead).toBeLessThan(MEGABYTE);
    expect(source.bytesRead).toBeLessThan(8 * MEGABYTE);

    // Reading on lets the rest through, so the bound is backpressure and not a
    // truncated file.
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
    }
    expect(source.bytesRead).toBe(8 * MEGABYTE);
    expect(total).toBeGreaterThan(7 * MEGABYTE);
  });

  it("measures the queue in bytes", () => {
    expect(BYTE_QUEUE.size(new Uint8Array(4_096))).toBe(4_096);
  });
});
