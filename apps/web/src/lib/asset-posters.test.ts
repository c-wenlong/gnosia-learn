import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  POSTER_CACHE_ENTRIES,
  POSTER_FAILURE_TTL_MS,
  extractPoster,
  freshPosterFailure,
  prunePosterCache,
} from "./asset-posters";

/**
 * The poster cache's failure markers, with no database: a scratch directory,
 * a handful of shell scripts standing in for ffmpeg, and the cache itself.
 *
 * The rule under test is that a failure is recorded, never inferred, and only
 * from evidence about the video. So each way ffmpeg can fail is run for real
 * and the directory is read afterwards: a clean exit with no frame writes a
 * marker, and a timeout, a spawn error or a death by signal writes nothing.
 */

let base: string;
let dir: string;
const video = () => path.join(base, "video.mp4");

/** A fake ffmpeg: a shell script with this body. */
async function fake(name: string, body: string): Promise<string> {
  const file = path.join(base, name);
  await writeFile(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
}

const key = (n: number) => n.toString(16).padStart(40, "0");
const listing = async () => (await readdir(dir)).sort();

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "poster-markers-"));
  await writeFile(video(), "not a real video");
  // Every one of these runs is expected to warn; the warnings are noise here.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

beforeEach(async () => {
  dir = await mkdtemp(path.join(base, "cache-"));
});

describe("what writes a failure marker", () => {
  it("a clean exit with no frame at every offset writes one, atomically", async () => {
    const ffmpeg = await fake("no-frame", "exit 1");
    const outcome = await extractPoster(key(1), ffmpeg, video(), dir);
    expect(outcome.kind).toBe("no-frame");
    // The marker and nothing else: no temp file left behind by the rename.
    expect(await listing()).toEqual([`${key(1)}.fail`]);
    expect(await freshPosterFailure(path.join(dir, `${key(1)}.fail`))).toBe(true);
  });

  it("a timeout writes nothing", async () => {
    const ffmpeg = await fake("slow", "exec sleep 5");
    const outcome = await extractPoster(key(2), ffmpeg, video(), dir, 100);
    expect(outcome.kind).toBe("inconclusive");
    expect(await listing()).toEqual([]);
  });

  it("an ffmpeg that cannot be run writes nothing", async () => {
    const outcome = await extractPoster(key(3), path.join(base, "no-such-ffmpeg"), video(), dir);
    expect(outcome.kind).toBe("inconclusive");
    expect(await listing()).toEqual([]);
  });

  it("an ffmpeg killed by a signal writes nothing", async () => {
    const ffmpeg = await fake("killed", "kill -9 $$");
    const outcome = await extractPoster(key(4), ffmpeg, video(), dir);
    expect(outcome.kind).toBe("inconclusive");
    expect(await listing()).toEqual([]);
  });

  it("one inconclusive offset among clean misses writes nothing", async () => {
    // Times out on the first offset (15s), exits cleanly with nothing on the
    // rest. A cut-short attempt is not proof the video has no frame.
    const ffmpeg = await fake("mixed", 'case "$*" in *"-ss 15 "*) exec sleep 5;; esac\nexit 1');
    const outcome = await extractPoster(key(5), ffmpeg, video(), dir, 150);
    expect(outcome.kind).toBe("inconclusive");
    expect(await listing()).toEqual([]);
  });

  it("a poster made later removes the marker it supersedes", async () => {
    await writeFile(path.join(dir, `${key(6)}.fail`), "old");
    const ffmpeg = await fake("works", "printf '\\377\\330\\377frame\\377\\331'");
    const outcome = await extractPoster(key(6), ffmpeg, video(), dir);
    expect(outcome.kind).toBe("frame");
    expect(await listing()).toEqual([`${key(6)}.jpg`]);
  });
});

describe("how long a marker is believed", () => {
  it("until its TTL, and not after", async () => {
    const marker = path.join(dir, `${key(7)}.fail`);
    await writeFile(marker, "no frame");
    expect(await freshPosterFailure(marker)).toBe(true);

    const stale = new Date(Date.now() - POSTER_FAILURE_TTL_MS - 60_000);
    await utimes(marker, stale, stale);
    expect(await freshPosterFailure(marker)).toBe(false);
  });

  it("not at all when there is no marker", async () => {
    expect(await freshPosterFailure(path.join(dir, `${key(8)}.fail`))).toBe(false);
  });
});

describe("the pruner", () => {
  it("counts markers against the bounds, oldest first, and removes nothing it does not own", async () => {
    // Over the entry bound by ten, half posters and half markers, each a
    // second older than the next so the order is unambiguous.
    const total = POSTER_CACHE_ENTRIES + 10;
    const start = Date.now() / 1000 - total;
    for (let i = 0; i < total; i += 1) {
      const file = path.join(dir, `${key(1000 + i)}${i % 2 === 0 ? ".jpg" : ".fail"}`);
      await writeFile(file, "x");
      await utimes(file, start + i, start + i);
    }
    // Things that are not ours, some of them deliberately close in shape.
    const foreign = [
      "notes.txt",
      `${key(1)}.jpg.bak`,
      `${key(1).slice(1)}.fail`,
      `${key(1)}.FAIL`,
      `x${key(1)}.fail`,
      ".tmp-something",
    ];
    for (const name of foreign) {
      const file = path.join(dir, name);
      await writeFile(file, "keep me");
      await utimes(file, start - 1_000, start - 1_000);
    }

    await prunePosterCache(dir);

    const left = await listing();
    for (const name of foreign) expect(left).toContain(name);
    const owned = left.filter((name) => !foreign.includes(name));
    expect(owned).toHaveLength(POSTER_CACHE_ENTRIES);
    // The ten oldest went, posters and markers alike.
    for (let i = 0; i < 10; i += 1) {
      expect(owned).not.toContain(`${key(1000 + i)}${i % 2 === 0 ? ".jpg" : ".fail"}`);
    }
    expect(owned).toContain(`${key(1000 + 10)}.jpg`);
    expect(owned).toContain(`${key(1000 + 11)}.fail`);
  });

  it("drops an expired marker even under the bounds, and keeps a fresh one", async () => {
    const expired = path.join(dir, `${key(9)}.fail`);
    const fresh = path.join(dir, `${key(10)}.fail`);
    const poster = path.join(dir, `${key(11)}.jpg`);
    for (const file of [expired, fresh, poster]) await writeFile(file, "x");
    const stale = new Date(Date.now() - POSTER_FAILURE_TTL_MS - 60_000);
    await utimes(expired, stale, stale);
    // An old poster is still a poster; only the bounds evict it.
    await utimes(poster, stale, stale);

    await prunePosterCache(dir);

    expect(await listing()).toEqual([`${key(10)}.fail`, `${key(11)}.jpg`]);
  });
});
