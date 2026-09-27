import { execFileSync } from "node:child_process";
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

    const { body: stream } = await store.get(k);
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

  it("refuses an owner directory that is a symlink, and writes, reads and deletes nothing through it", async () => {
    const root = tempDir();
    const elsewhere = tempDir();
    const store = fsStore(root);
    const data = bytes(1_000, 9);
    const k = key("local", sha256(data), "bin");
    symlinkSync(elsewhere, path.join(root, "local"));
    writeFileSync(path.join(elsewhere, `${sha256(data)}.bin`), data);

    await expect(store.put(k, chunked(data), meta(data))).rejects.toMatchObject({ code: "BLOB_LINK" });
    await expect(store.head(k)).rejects.toMatchObject({ code: "BLOB_LINK" });
    await expect(store.get(k)).rejects.toMatchObject({ code: "BLOB_LINK" });
    await expect(store.delete(k)).rejects.toMatchObject({ code: "BLOB_LINK" });

    expect(readdirSync(elsewhere)).toEqual([`${sha256(data)}.bin`]);
    expect(readdirSync(path.join(root, ".tmp"))).toEqual([]);
  });

  it("refuses a temp directory that is a symlink before writing into it", async () => {
    const root = tempDir();
    const elsewhere = tempDir();
    const store = fsStore(root);
    const data = bytes(1_000, 10);
    symlinkSync(elsewhere, path.join(root, ".tmp"));

    await expect(
      store.put(key("local", sha256(data), "bin"), chunked(data), meta(data)),
    ).rejects.toMatchObject({ code: "BLOB_LINK" });
    expect(readdirSync(elsewhere)).toEqual([]);
  });

  it("refuses an object that is a symlink, which list does not show either", async () => {
    const root = tempDir();
    const store = fsStore(root);
    const data = bytes(1_000, 11);
    const k = key("local", sha256(data), "bin");
    const target = path.join(tempDir(), "outside.bin");
    writeFileSync(target, data);
    mkdirSync(path.join(root, "local"));
    symlinkSync(target, path.join(root, k));

    await expect(store.head(k)).rejects.toMatchObject({ code: "BLOB_LINK" });
    await expect(store.get(k)).rejects.toMatchObject({ code: "BLOB_LINK" });
    const listed: string[] = [];
    for await (const entry of store.list("")) listed.push(entry.key);
    expect(listed).toEqual([]);

    // A delete removes the link itself, never the file it points at.
    await store.delete(k);
    expect(existsSync(target)).toBe(true);
  });

  it("refuses a FIFO under a key at once, where opening it used to wait for a writer forever", async () => {
    const root = tempDir();
    const store = fsStore(root);
    const k = key("local", sha256(bytes(10, 12)), "bin");
    mkdirSync(path.join(root, "local"));
    execFileSync("mkfifo", [path.join(root, k)]);

    const settled = <T>(promise: Promise<T>) =>
      Promise.race([
        promise.then(
          () => "resolved",
          (error: { code?: string }) => error.code,
        ),
        new Promise((resolve) => setTimeout(() => resolve("still waiting"), 2_000)),
      ]);
    expect(await settled(store.head(k))).toBe("BLOB_NOT_FILE");
    expect(await settled(store.stat(k))).toBe("BLOB_NOT_FILE");
    expect(await settled(store.get(k))).toBe("BLOB_NOT_FILE");
  });

  it("refuses a directory under a key instead of handing back a stream that fails when read", async () => {
    const root = tempDir();
    const store = fsStore(root);
    const k = key("local", sha256(bytes(10, 13)), "bin");
    mkdirSync(path.join(root, k), { recursive: true });

    await expect(store.get(k)).rejects.toMatchObject({ code: "BLOB_NOT_FILE" });
    await expect(store.head(k)).rejects.toMatchObject({ code: "BLOB_NOT_FILE" });
    await expect(store.stat(k)).rejects.toMatchObject({ code: "BLOB_NOT_FILE" });
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

  it("refuses a root inside a directory whose package.json names self-learn, with or without .git", () => {
    const copy = tempDir();
    writeFileSync(path.join(copy, "package.json"), JSON.stringify({ name: "self-learn", private: true }));

    expect(() => fsStore(path.join(copy, "blobs"))).toThrow(/inside the self-learn checkout/);
  });

  it("accepts a root under a package.json that names something else, or is not JSON", () => {
    const other = tempDir();
    writeFileSync(path.join(other, "package.json"), JSON.stringify({ name: "self-learn-fork-of-nothing" }));
    const broken = tempDir();
    writeFileSync(path.join(broken, "package.json"), "{ not json");

    expect(() => fsStore(path.join(other, "blobs"))).not.toThrow();
    expect(() => fsStore(path.join(broken, "blobs"))).not.toThrow();
  });

  it("accepts a root inside some other git repository, such as a home directory of dotfiles", () => {
    const home = tempDir();
    mkdirSync(path.join(home, ".git"));

    expect(() => fsStore(path.join(home, ".self-learn", "blobs"))).not.toThrow();
  });
});
