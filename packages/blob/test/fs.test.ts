import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { BlobError, BlobIntegrityError, defaultBlobRoot, fsStore, key } from "../src/index";
import { bytes, chunked, collect, conformance, meta, sha256 } from "./conformance";

/**
 * The `fs` adapter: the shared contract first, then what only a disk can show.
 * Every store here is rooted under the OS temp directory, never the checkout,
 * and the last block proves the adapter itself refuses a root inside one.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let conformanceRoot: string | undefined;
conformance(
  "fs",
  () => {
    conformanceRoot = mkdtempSync(path.join(tmpdir(), "self-learn-blob-conformance-"));
    return fsStore(conformanceRoot);
  },
  {
    teardown: () => {
      if (conformanceRoot !== undefined) rmSync(conformanceRoot, { recursive: true, force: true });
    },
  },
);

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "self-learn-blob-fs-"));
  temps.push(dir);
  return dir;
}

/** Every file under `root`, relative, with directories marked by a trailing slash. */
function tree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        out.push(`${prefix}${entry.name}/`);
        walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      } else {
        out.push(`${prefix}${entry.name}`);
      }
    }
  };
  walk(root, "");
  return out.sort();
}

describe("fsStore on disk", () => {
  it("writes an object to <root>/<owner>/<sha256>.<ext> and nothing else", async () => {
    const root = tempDir();
    const store = fsStore(root);
    const data = bytes(10_000, 1);
    const hash = sha256(data);

    await store.put(key("local", hash, "svg"), chunked(data), meta(data));

    expect(tree(root)).toEqual([".tmp/", "local/", `local/${hash}.svg`]);
  });

  it("leaves no temp file and no owner directory behind a refused put", async () => {
    const root = tempDir();
    const store = fsStore(root);
    const data = bytes(10_000, 2);
    const claimed = bytes(10_000, 3);

    await expect(
      store.put(key("local", sha256(claimed), "bin"), chunked(data), meta(claimed)),
    ).rejects.toBeInstanceOf(BlobIntegrityError);
    await expect(
      store.put(key("local", sha256(data), "bin"), chunked(data), { ...meta(data), bytes: 5 }),
    ).rejects.toBeInstanceOf(BlobIntegrityError);

    expect(tree(root)).toEqual([".tmp/"]);
  });

  it("hashes the file in head, so bytes changed on disk are reported rather than the key's claim", async () => {
    const root = tempDir();
    const store = fsStore(root);
    const data = bytes(4_000, 4);
    const k = key("local", sha256(data), "bin");
    await store.put(k, chunked(data), meta(data));

    const rotted = bytes(3_000, 5);
    writeFileSync(path.join(root, k), rotted);

    expect(await store.head(k)).toEqual({ bytes: rotted.length, sha256: sha256(rotted) });
  });

  it("keeps serving a stream it opened when the object is deleted mid-read", async () => {
    const root = tempDir();
    const store = fsStore(root);
    const data = bytes(1_000_000, 6);
    const k = key("local", sha256(data), "mp4");
    await store.put(k, chunked(data), meta(data));

    const stream = await store.get(k);
    await store.delete(k);

    expect(await collect(stream)).toEqual(data);
    expect(await store.head(k)).toBeNull();
  });

  it("lists neither in-flight temp files nor names that are not keys", async () => {
    const root = tempDir();
    const store = fsStore(root);
    const data = bytes(100, 7);
    const k = key("local", sha256(data), "bin");
    await store.put(k, chunked(data), meta(data));

    writeFileSync(path.join(root, ".tmp", "interrupted.part"), "half");
    writeFileSync(path.join(root, "local", "notes.txt"), "stray");
    mkdirSync(path.join(root, "Upper"));
    writeFileSync(path.join(root, "Upper", `${sha256(data)}.bin`), "stray");
    writeFileSync(path.join(root, "loose-file"), "stray");

    const listed: string[] = [];
    for await (const entry of store.list("")) listed.push(entry.key);
    expect(listed).toEqual([k]);
  });

  it("answers an empty listing, null heads and not-found gets before anything was ever put", async () => {
    const store = fsStore(path.join(tempDir(), "never-created"));
    const k = key("local", sha256(bytes(1, 8)), "bin");

    const listed: string[] = [];
    for await (const entry of store.list("")) listed.push(entry.key);
    expect(listed).toEqual([]);
    expect(await store.head(k)).toBeNull();
    await expect(store.get(k)).rejects.toMatchObject({ code: "BLOB_NOT_FOUND" });
    await expect(store.delete(k)).resolves.toBeUndefined();
  });
});

describe("the fs root", () => {
  it("defaults to ~/.self-learn/blobs", () => {
    expect(defaultBlobRoot({})).toBe(path.join(homedir(), ".self-learn", "blobs"));
    expect(defaultBlobRoot({ SELF_LEARN_HOME: "   " })).toBe(path.join(homedir(), ".self-learn", "blobs"));
  });

  it("puts blobs under $SELF_LEARN_HOME, expanding a leading ~", () => {
    expect(defaultBlobRoot({ SELF_LEARN_HOME: "/data/self-learn" })).toBe(path.join("/data/self-learn", "blobs"));
    expect(defaultBlobRoot({ SELF_LEARN_HOME: "~/elsewhere" })).toBe(path.join(homedir(), "elsewhere", "blobs"));
    expect(defaultBlobRoot({ SELF_LEARN_HOME: "~" })).toBe(path.join(homedir(), "blobs"));
  });

  it("refuses a relative $SELF_LEARN_HOME rather than resolving it against the working directory", () => {
    expect(() => defaultBlobRoot({ SELF_LEARN_HOME: "data/blobs" })).toThrow(BlobError);
    expect(() => defaultBlobRoot({ SELF_LEARN_HOME: "data/blobs" })).toThrow(/absolute/);
  });

  it("refuses a root inside this checkout, and creates nothing there", () => {
    const inside = path.join(REPO_ROOT, "blob-root-that-must-not-exist");

    expect(() => fsStore(inside)).toThrow(/inside the self-learn checkout/);
    expect(existsSync(inside)).toBe(false);
  });

  it("refuses a root inside any self-learn checkout, including through a symlink", () => {
    const outer = tempDir();
    const checkout = path.join(outer, "checkout");
    mkdirSync(path.join(checkout, ".git"), { recursive: true });
    mkdirSync(path.join(checkout, "packages", "blob"), { recursive: true });
    writeFileSync(path.join(checkout, "packages", "blob", "package.json"), "{}");
    symlinkSync(checkout, path.join(outer, "link"));

    expect(() => fsStore(path.join(checkout, "data", "blobs"))).toThrow(/inside the self-learn checkout/);
    expect(() => fsStore(path.join(outer, "link", "blobs"))).toThrow(/inside the self-learn checkout/);
  });

  it("accepts a root inside some other git repository, such as a home directory of dotfiles", () => {
    const home = tempDir();
    mkdirSync(path.join(home, ".git"));

    expect(() => fsStore(path.join(home, ".self-learn", "blobs"))).not.toThrow();
  });
});
