import { describe, expect, it } from "vitest";

import { BlobKeyError, isKey, key, parseKey } from "../src/index";

const HASH = "a".repeat(62) + "0f";

describe("key", () => {
  it("builds <owner_id>/<sha256>.<ext>", () => {
    expect(key("local", HASH, "mp4")).toBe(`local/${HASH}.mp4`);
  });

  it("folds the hash and the extension to lowercase and drops a leading dot", () => {
    expect(key("local", HASH.toUpperCase(), ".SVG")).toBe(`local/${HASH}.svg`);
  });

  it("refuses an owner id it would have to change, rather than folding it", () => {
    for (const owner of ["Local", "", "../x", "a/b", ".tmp", "-lead", "x".repeat(65), "a b"]) {
      expect(() => key(owner, HASH, "bin"), owner).toThrow(BlobKeyError);
    }
  });

  it("refuses a hash that is not 64 hex digits and an extension that is not one short word", () => {
    expect(() => key("local", "xyz", "bin")).toThrow(BlobKeyError);
    expect(() => key("local", HASH.slice(1), "bin")).toThrow(BlobKeyError);
    for (const ext of ["", ".", "tar.gz", "a".repeat(17), "m-p4"]) {
      expect(() => key("local", HASH, ext), ext).toThrow(BlobKeyError);
    }
  });
});

describe("parseKey", () => {
  it("round-trips what key() builds", () => {
    const built = key("owner_1-x", HASH, "json");
    expect(parseKey(built)).toEqual({ ownerId: "owner_1-x", sha256: HASH, ext: "json" });
    expect(isKey(built)).toBe(true);
  });

  it("refuses anything key() could not have built", () => {
    for (const bad of [
      `local/${HASH.toUpperCase()}.bin`,
      `local/${HASH}.BIN`,
      `local/${HASH}`,
      `local//${HASH}.bin`,
      `local/x/${HASH}.bin`,
      `/local/${HASH}.bin`,
      `../${HASH}.bin`,
      `local/${HASH}.bin/`,
      `local/${HASH}.bin\n`,
    ]) {
      expect(() => parseKey(bad), bad).toThrow(BlobKeyError);
      expect(isKey(bad), bad).toBe(false);
    }
  });
});

describe("the database's blob_object_key_check", () => {
  // Copied from migration 0010 as Postgres runs it (`~` is a POSIX regex, and
  // this one reads the same in JavaScript). The package is the stricter of
  // the two; this holds it inside the check, so every key it makes can have
  // a row.
  const DATABASE_KEY = /^[^/]+\/[0-9a-f]{64}([.][a-z0-9]+)?$/;
  const hash = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

  it("accepts every key the package builds", () => {
    for (const [owner, ext] of [
      ["local", "mp4"],
      ["0", "SVG"],
      ["a-b_c", ".json"],
      ["x".repeat(64), "abcdefghij123456"],
      ["3f2c9a1e-5b7d-4c8e-9f10-1a2b3c4d5e6f", "vtt"],
    ] as const) {
      const built = key(owner, hash, ext);
      expect(DATABASE_KEY.test(built), built).toBe(true);
      expect(built.startsWith(`${owner}/${hash}`)).toBe(true);
    }
  });

  it("is looser than the package on the shapes a later contract migration should refuse", () => {
    for (const loose of [`../${hash}.bin`, `Local/${hash}.bin`, `local/${hash}`, `local/${hash}.${"a".repeat(17)}`]) {
      expect(DATABASE_KEY.test(loose), loose).toBe(true);
      expect(isKey(loose), loose).toBe(false);
    }
  });
});
