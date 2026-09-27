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
