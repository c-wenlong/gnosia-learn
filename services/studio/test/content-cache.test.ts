import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadVocabulary } from "../src/brief";
import { cachePath, readThrough } from "../src/content-cache";
import { REPO_ROOT } from "../src/paths";

/**
 * The studio's last-read cache (D13): a read that throws is answered from the
 * last good copy, marked stale with the time it was read.
 *
 * Every test gets its own STUDIO_HOME under the OS temp directory, so nothing
 * here touches a real runner's cache.
 */

let home: string;
beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "studio-cache-"));
  process.env.STUDIO_HOME = home;
});
afterEach(() => {
  delete process.env.STUDIO_HOME;
  rmSync(home, { recursive: true, force: true });
});

const at = (iso: string) => () => new Date(iso);
const down = async (): Promise<never> => {
  throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
};

describe("readThrough", () => {
  it("returns a good read as fresh and keeps a copy under STUDIO_HOME", async () => {
    const read = await readThrough("topics", async () => ["a", "b"], at("2026-09-28T01:00:00.000Z"));
    expect(read).toEqual({ value: ["a", "b"], readAt: "2026-09-28T01:00:00.000Z", stale: false });
    expect(cachePath("topics")).toBe(path.join(home, "cache", "topics.json"));
    expect(JSON.parse(readFileSync(cachePath("topics"), "utf8")).value).toEqual(["a", "b"]);
  });

  it("answers a thrown read from the copy, with the time the copy was read", async () => {
    await readThrough("topics", async () => ["a"], at("2026-09-28T01:00:00.000Z"));
    const read = await readThrough("topics", down, at("2026-09-28T09:00:00.000Z"));
    expect(read.value).toEqual(["a"]);
    expect(read.stale).toBe(true);
    expect(read.readAt).toBe("2026-09-28T01:00:00.000Z");
    expect(read.error).toContain("ECONNREFUSED");
  });

  it("replaces the copy on the next good read, so stale ends when the source answers", async () => {
    await readThrough("topics", async () => ["old"], at("2026-09-28T01:00:00.000Z"));
    await readThrough("topics", down);
    const fresh = await readThrough("topics", async () => ["new"], at("2026-09-28T02:00:00.000Z"));
    expect(fresh.stale).toBe(false);
    const again = await readThrough("topics", down);
    expect(again.value).toEqual(["new"]);
    expect(again.readAt).toBe("2026-09-28T02:00:00.000Z");
  });

  it("throws the source's own error when there is no copy to fall back on", async () => {
    await expect(readThrough("topics", down)).rejects.toThrow("ECONNREFUSED");
  });

  it("treats an unreadable copy as no copy", async () => {
    await mkdir(path.dirname(cachePath("topics")), { recursive: true });
    writeFileSync(cachePath("topics"), "{ half a file");
    await expect(readThrough("topics", down)).rejects.toThrow("ECONNREFUSED");
  });

  it("keeps one type's copy apart from another's", async () => {
    await readThrough("topics", async () => ["t"]);
    await expect(readThrough("tags", down)).rejects.toThrow("ECONNREFUSED");
  });

  it("refuses a type name that could walk out of the cache directory", () => {
    expect(() => cachePath("../topics")).toThrow();
  });
});

describe("loadVocabulary through the seam", () => {
  it("reads the real vocabulary fresh, and says when", async () => {
    const vocabulary = await loadVocabulary();
    expect(vocabulary.stale).toBe(false);
    expect(Number.isNaN(Date.parse(vocabulary.readAt))).toBe(false);
    expect(vocabulary.topics.get("vector-and-linear-algebra-basics")?.concepts).toContain("dot-product");
  });

  it("keeps answering from the cache when the source cannot be read", async () => {
    const good = await loadVocabulary(REPO_ROOT);
    // A root with no content/ in it: the read throws, as a database outage will.
    const empty = mkdtempSync(path.join(tmpdir(), "studio-no-content-"));
    try {
      const offline = await loadVocabulary(empty);
      expect(offline.stale).toBe(true);
      expect(offline.readAt).toBe(good.readAt);
      expect(offline.staleReason).toMatch(/content\/topics\.yaml/);
      expect([...offline.topics.keys()]).toEqual([...good.topics.keys()]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
