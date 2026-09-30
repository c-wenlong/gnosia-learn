import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cachePath, readThrough } from "../src/content-cache";
import { TOPICS, topicListAnswer, topicListDown } from "./vocabulary";

// The catalog CLI is the vocabulary's only source; faked here so the tests read
// no database and no file under content/.
const catalogMock = vi.hoisted(() => ({ topicList: vi.fn() }));
vi.mock("../src/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/catalog")>()),
  ...catalogMock,
}));

const { loadVocabulary } = await import("../src/brief");

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
    const read = await readThrough("topics", async () => ["a", "b"], { now: at("2026-09-28T01:00:00.000Z") });
    expect(read).toEqual({ value: ["a", "b"], readAt: "2026-09-28T01:00:00.000Z", stale: false });
    expect(cachePath("topics")).toBe(path.join(home, "cache", "topics.json"));
    expect(JSON.parse(readFileSync(cachePath("topics"), "utf8")).value).toEqual(["a", "b"]);
  });

  it("answers a thrown read from the copy, with the time the copy was read", async () => {
    await readThrough("topics", async () => ["a"], { now: at("2026-09-28T01:00:00.000Z") });
    const read = await readThrough("topics", down, { now: at("2026-09-28T09:00:00.000Z") });
    expect(read.value).toEqual(["a"]);
    expect(read.stale).toBe(true);
    expect(read.readAt).toBe("2026-09-28T01:00:00.000Z");
    expect(read.error).toContain("ECONNREFUSED");
  });

  it("replaces the copy on the next good read, so stale ends when the source answers", async () => {
    await readThrough("topics", async () => ["old"], { now: at("2026-09-28T01:00:00.000Z") });
    await readThrough("topics", down);
    const fresh = await readThrough("topics", async () => ["new"], { now: at("2026-09-28T02:00:00.000Z") });
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

  it("treats a copy of the wrong shape as no copy when the caller checks it", async () => {
    await readThrough("topics", async () => ({ not: "a list" }));
    const isList = (value: unknown): value is string[] => Array.isArray(value);
    await expect(readThrough("topics", down, { isValue: isList })).rejects.toThrow("ECONNREFUSED");
  });

  it("keeps the newest read when reads finish close together", async () => {
    // Twenty reads resolving in order, each queuing a write before the next
    // resolves; whatever order the renames finish in, the last read is the copy.
    const reads = Array.from({ length: 20 }, (_, i) =>
      readThrough("topics", async () => {
        await new Promise((resolve) => setTimeout(resolve, i));
        return [`read-${i}`];
      }),
    );
    await Promise.all(reads);
    expect((await readThrough("topics", down)).value).toEqual(["read-19"]);
  });

  it("keeps one type's copy apart from another's", async () => {
    await readThrough("topics", async () => ["t"]);
    await expect(readThrough("tags", down)).rejects.toThrow("ECONNREFUSED");
  });

  it("refuses a type name that could walk out of the cache directory", () => {
    expect(() => cachePath("../topics")).toThrow();
  });
});

describe("loadVocabulary through the catalog", () => {
  beforeEach(() => {
    catalogMock.topicList.mockReset().mockResolvedValue(topicListAnswer());
  });

  it("reads the topics from catalog topic ls, fresh, and says when", async () => {
    const vocabulary = await loadVocabulary();
    expect(catalogMock.topicList).toHaveBeenCalledTimes(1);
    expect(vocabulary.stale).toBe(false);
    expect(Number.isNaN(Date.parse(vocabulary.readAt))).toBe(false);
    expect(vocabulary.topics.get("vector-and-linear-algebra-basics")?.concepts).toContain("dot-product");
    // The entries a screen shows keep title and domain, and drop the planner's edges.
    expect(vocabulary.entries.map((e) => e.slug)).toEqual(TOPICS.map((t) => t.slug));
    expect(vocabulary.entries[1]).toMatchObject({ title: "TCP congestion control", domain: "networking" });
    expect(vocabulary.entries[0]).not.toHaveProperty("incoming");
  });

  it("keeps answering from the cache, marked stale with its readAt, when the catalog is down", async () => {
    const good = await loadVocabulary();
    catalogMock.topicList.mockResolvedValue(topicListDown());
    const offline = await loadVocabulary();
    expect(offline.stale).toBe(true);
    expect(offline.readAt).toBe(good.readAt);
    expect(offline.staleReason).toMatch(/exited 3/);
    expect([...offline.topics.keys()]).toEqual([...good.topics.keys()]);
  });

  it("falls back on a listing it cannot read, as on an outage", async () => {
    await loadVocabulary();
    catalogMock.topicList.mockResolvedValue(topicListAnswer([{ slug: "no-title", maps: { concepts: [] } }]));
    const read = await loadVocabulary();
    expect(read.stale).toBe(true);
    expect(read.staleReason).toMatch(/without a slug, a title or a concepts list/);
  });

  it("falls back when the CLI itself cannot run", async () => {
    await loadVocabulary();
    catalogMock.topicList.mockRejectedValue(new Error("spawn npm ENOENT"));
    const read = await loadVocabulary();
    expect(read.stale).toBe(true);
    expect(read.staleReason).toMatch(/ENOENT/);
  });

  it("throws the catalog's own reason when there is no copy to fall back on", async () => {
    catalogMock.topicList.mockResolvedValue(topicListDown());
    await expect(loadVocabulary()).rejects.toThrow(/ECONNREFUSED/);
  });

  it("will not stand in a cached copy that is not a topic list", async () => {
    await mkdir(path.dirname(cachePath("topics.local")), { recursive: true });
    writeFileSync(
      cachePath("topics.local"),
      JSON.stringify({ version: 1, type: "topics.local", readAt: "2026-09-28T01:00:00.000Z", value: [{ slug: 1 }] }),
    );
    catalogMock.topicList.mockResolvedValue(topicListDown());
    await expect(loadVocabulary()).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe("the cached vocabulary and owners", () => {
  /** A good copy of `topics` under a cache name, as a runner would have written it. */
  async function copy(type: string, slugs: string[]): Promise<void> {
    await mkdir(path.dirname(cachePath(type)), { recursive: true });
    const value = TOPICS.map((topic, i) => ({ ...topic, slug: slugs[i] ?? topic.slug, incoming: undefined }));
    writeFileSync(cachePath(type), JSON.stringify({ version: 1, type, readAt: "2026-09-28T01:00:00.000Z", value }));
  }

  beforeEach(() => {
    catalogMock.topicList.mockReset().mockResolvedValue(topicListAnswer());
  });
  afterEach(() => {
    delete process.env.STUDIO_OWNER;
  });

  it("is one copy per owner", async () => {
    process.env.STUDIO_OWNER = "someone";
    await loadVocabulary();
    expect(JSON.parse(readFileSync(cachePath("topics.someone"), "utf8")).value).toHaveLength(TOPICS.length);
    expect(() => readFileSync(cachePath("topics"), "utf8")).toThrow();
    expect(() => readFileSync(cachePath("topics.local"), "utf8")).toThrow();
  });

  it("never stands in the unscoped copy a runner from before topic ls --owner wrote, nor another owner's", async () => {
    // Both were read from topics this owner may not see.
    await copy("topics", ["every-owners-topic"]);
    await copy("topics.local", ["locals-topic"]);
    process.env.STUDIO_OWNER = "someone";
    catalogMock.topicList.mockResolvedValue(topicListDown());
    await expect(loadVocabulary()).rejects.toThrow(/ECONNREFUSED/);
  });

  it("stands in this owner's own copy", async () => {
    await copy("topics.someone", ["their-topic"]);
    process.env.STUDIO_OWNER = "someone";
    catalogMock.topicList.mockResolvedValue(topicListDown());
    const read = await loadVocabulary();
    expect(read.stale).toBe(true);
    expect(read.topics.has("their-topic")).toBe(true);
  });
});
