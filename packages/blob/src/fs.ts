import { createHash, randomUUID } from "node:crypto";
import { constants, createWriteStream, existsSync, realpathSync } from "node:fs";
import { lstat, mkdir, open, readdir, rename, rm, stat, type FileHandle } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { checkMeta, isKey, isOwnerId, parseKey, resolveRange, type ParsedKey } from "./key";
import {
  BlobError,
  BlobIntegrityError,
  BlobNotFoundError,
  type BlobHead,
  type BlobListing,
  type BlobMeta,
  type BlobRange,
  type BlobStore,
} from "./store";

/**
 * In-flight writes live here, under the root, so the final `rename` never
 * crosses a filesystem and is atomic. A dot name can never be an owner id, so
 * `list` cannot mistake it for one. Anything left in it is a write a crash
 * interrupted; nothing reads it, and it is safe to delete once no upload is
 * running.
 */
const TEMP_DIR = ".tmp";

/**
 * Opens without following a symlink at the last component; the directory
 * above it is checked by `realDirectory`. See `fsStore` for why links are
 * refused rather than followed.
 */
const READ_NO_FOLLOW = constants.O_RDONLY | constants.O_NOFOLLOW;

/**
 * Where the laptop's blobs live: `$SELF_LEARN_HOME/blobs`, or
 * `~/.self-learn/blobs` when the variable is unset.
 *
 * Outside the repository for the reason `$MANIMKC_HOME` exists: moving the
 * manimkc submodule on 2026-09-13 deleted 25 rendered videos, because git does
 * not carry gitignored files across a move. Blobs are the only copy of what
 * they hold, so they cannot live anywhere a checkout operation can reach.
 *
 * A leading `~` is expanded, since `.env` files get no shell expansion. A
 * relative value is refused rather than resolved: the variable is read by
 * commands run from wherever the author happens to be, so a relative path
 * would name a different directory each time, and one of them is the repo.
 */
export function defaultBlobRoot(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.SELF_LEARN_HOME?.trim();
  if (!raw) return path.join(homedir(), ".self-learn", "blobs");
  const expanded = raw === "~" || raw.startsWith("~/") ? path.join(homedir(), raw.slice(1)) : raw;
  if (!path.isAbsolute(expanded)) {
    throw new BlobError(
      "BLOB_ROOT",
      `SELF_LEARN_HOME must be absolute or start with ~/, not ${JSON.stringify(raw)}`,
    );
  }
  return path.join(expanded, "blobs");
}

/**
 * The content-addressed store on local disk (D5, and "Decided by the owner":
 * everything local for now).
 *
 * `root` defaults to `defaultBlobRoot()`. Objects sit at
 * `<root>/<owner_id>/<sha256>.<ext>`, the key read as a relative path, which
 * `parseKey` makes safe by admitting exactly two lowercase segments.
 *
 * **`head` hashes the file every time it is asked.** The two alternatives both
 * report what was claimed rather than what is there: the hash in the key is
 * the caller's word, and a sidecar written beside the object is the same word
 * written down a second time, as a second file that has to stay atomic with
 * the first. The callers of `head` are the upload's confirmation step and
 * `catalog blob audit` (edge case 9), and both are asking the store whether
 * the bytes are intact. Reading the file answers that; the cost is one
 * sequential read, which for the largest video today (37 MB) is tens of
 * milliseconds. A hot path that only needs the size, such as a Range request,
 * takes it from the `blob_object` row and never calls `head`.
 *
 * **No symlink under the root is followed.** The root is checked once, links
 * resolved, but an owner directory, `.tmp` or an object that is itself a link
 * would carry a write, a read or a delete somewhere that check never saw,
 * checkout included, and `list` (which sees a link as neither a directory nor
 * a file) would not show it. Every such link is refused with `BLOB_LINK`, so
 * what the store operates on and what it lists are the same set.
 */
export function fsStore(root: string = defaultBlobRoot()): BlobStore {
  const base = path.resolve(root);
  const checkout = selfLearnCheckoutAbove(base);
  if (checkout !== null) {
    throw new BlobError(
      "BLOB_ROOT",
      `refusing blob root ${base}: it is inside the self-learn checkout at ${checkout}, where a git operation can delete it. Point SELF_LEARN_HOME outside the repository`,
    );
  }

  const objectPath = (parsed: ParsedKey): string =>
    path.join(base, parsed.ownerId, `${parsed.sha256}.${parsed.ext}`);

  return {
    provider: "fs",

    async put(key: string, body: Readable, meta: BlobMeta): Promise<void> {
      let temp: string | undefined;
      try {
        const parsed = parseKey(key);
        checkMeta(parsed, meta);

        const tempDir = path.join(base, TEMP_DIR);
        await mkdir(tempDir, { recursive: true });
        await realDirectory(tempDir);
        temp = path.join(tempDir, `${randomUUID()}.part`);

        const hash = createHash("sha256");
        let count = 0;
        const meter = new Transform({
          transform(chunk: Buffer, _encoding, done) {
            count += chunk.length;
            // Refused as soon as it overruns, so a body that is far longer
            // than declared is not written to disk in full first.
            if (count > meta.bytes) {
              done(new BlobIntegrityError(`body runs past the ${meta.bytes} bytes meta.bytes declared`));
              return;
            }
            hash.update(chunk);
            done(null, chunk);
          },
        });
        // `wx` so two puts can never share a temp file, and `flush` so the
        // bytes are on disk before the rename publishes them: a rename that
        // survives a crash while its data does not is an empty object under a
        // key that promises a hash.
        await pipeline(body, meter, createWriteStream(temp, { flags: "wx", flush: true }));

        if (count !== meta.bytes) {
          throw new BlobIntegrityError(`body was ${count} bytes; meta.bytes declared ${meta.bytes}`);
        }
        const digest = hash.digest("hex");
        if (digest !== meta.sha256) {
          throw new BlobIntegrityError(`body hashes to ${digest}; meta.sha256 declared ${meta.sha256}`);
        }

        // Created only now, so a refused put leaves no empty owner directory.
        const target = objectPath(parsed);
        await mkdir(path.dirname(target), { recursive: true });
        await realDirectory(path.dirname(target));
        // Replaces an existing object atomically. The key is the hash, so the
        // old bytes and the new are the same bytes, and a reader holding the
        // old file open keeps reading it.
        await rename(temp, target);
        temp = undefined;
        await syncDirectory(path.dirname(target));
      } catch (error) {
        body.destroy();
        if (temp !== undefined) await rm(temp, { force: true });
        throw error;
      }
    },

    async head(key: string): Promise<BlobHead | null> {
      const handle = await openObject(objectPath(parseKey(key)));
      if (handle === null) return null;
      try {
        // Size and hash from one open handle, so both describe the same file
        // even if a put replaces it midway.
        const { size } = await handle.stat();
        const hash = createHash("sha256");
        for await (const chunk of handle.createReadStream({ autoClose: false, start: 0 })) {
          hash.update(chunk as Buffer);
        }
        return { bytes: size, sha256: hash.digest("hex") };
      } finally {
        await handle.close();
      }
    },

    async get(key: string, range?: BlobRange): Promise<Readable> {
      const handle = await openObject(objectPath(parseKey(key)));
      if (handle === null) throw new BlobNotFoundError(key);
      try {
        if (range === undefined) return handle.createReadStream({ start: 0 });
        const { size } = await handle.stat();
        // The stream closes the handle when it ends or is destroyed; reading
        // from an open handle rather than a path means a delete that lands
        // mid-read cannot cut the stream short.
        return handle.createReadStream(resolveRange(range, size));
      } catch (error) {
        await handle.close();
        throw error;
      }
    },

    async signedUrl(key: string, ttlSeconds: number): Promise<string | null> {
      parseKey(key);
      if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
        throw new RangeError(`ttlSeconds must be a positive whole number, not ${ttlSeconds}`);
      }
      // A file on this machine has no URL a browser could fetch, so the route
      // streams it through `get` with the Range code it already has.
      return null;
    },

    async delete(key: string): Promise<void> {
      const target = objectPath(parseKey(key));
      // `rm` removes a link at the last component rather than its target, but
      // it would follow a linked owner directory, so that is checked first.
      if (!(await realDirectory(path.dirname(target)))) return;
      await rm(target, { force: true });
    },

    async *list(prefix: string): AsyncIterable<BlobListing> {
      const owners = await readdirOrEmpty(base);
      for (const owner of owners) {
        if (!owner.isDirectory() || !isOwnerId(owner.name)) continue;
        const ownerPrefix = `${owner.name}/`;
        // Descend only into owners the prefix can match: a prefix that stops
        // inside the owner id (`lo` for `local/`) or runs past it into a hash.
        if (!ownerPrefix.startsWith(prefix) && !prefix.startsWith(ownerPrefix)) continue;
        const ownerDir = path.join(base, owner.name);
        for (const file of await readdirOrEmpty(ownerDir)) {
          const listed = `${ownerPrefix}${file.name}`;
          if (!file.isFile() || !isKey(listed) || !listed.startsWith(prefix)) continue;
          try {
            // The rename keeps the temp file's mtime, which is when the bytes
            // were written: the upload time, not the moment of publishing.
            const { size, mtime } = await stat(path.join(ownerDir, file.name));
            yield { key: listed, bytes: size, uploadedAt: mtime };
          } catch (error) {
            // Deleted between the directory read and the stat: not listed,
            // exactly as if the delete had landed first.
            if (!isNotFound(error)) throw error;
          }
        }
      }
    },
  };
}

/**
 * The nearest directory at or above `dir` that is a self-learn checkout: it has
 * a `.git` and this package in it. Symlinks are resolved first, so a root that
 * is a link into the tree is caught too. Checking for this package rather than
 * for any `.git` keeps a home directory that happens to be a dotfiles
 * repository from refusing the default root.
 */
function selfLearnCheckoutAbove(dir: string): string | null {
  let current = resolveExisting(dir);
  for (;;) {
    if (
      existsSync(path.join(current, ".git")) &&
      existsSync(path.join(current, "packages", "blob", "package.json"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** `dir` with its deepest existing ancestor's symlinks resolved. */
function resolveExisting(dir: string): string {
  const missing: string[] = [];
  let current = dir;
  for (;;) {
    try {
      return path.join(realpathSync(current), ...missing);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return dir;
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

async function openObject(file: string): Promise<FileHandle | null> {
  if (!(await realDirectory(path.dirname(file)))) return null;
  try {
    return await open(file, READ_NO_FOLLOW);
  } catch (error) {
    if (isNotFound(error)) return null;
    if (codeOf(error) === "ELOOP") throw linkRefused(file);
    throw error;
  }
}

/**
 * True when `dir` is a real directory, false when it is absent, and a
 * `BLOB_LINK` refusal when it is a symlink or some other kind of file.
 */
async function realDirectory(dir: string): Promise<boolean> {
  try {
    const entry = await lstat(dir);
    if (entry.isDirectory()) return true;
    if (entry.isSymbolicLink()) throw linkRefused(dir);
    throw new BlobError("BLOB_LINK", `${dir} is not a directory`);
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function linkRefused(file: string): BlobError {
  return new BlobError("BLOB_LINK", `${file} is a symlink; the blob store follows no links under its root`);
}

async function readdirOrEmpty(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

/**
 * Makes the rename itself durable where the platform allows it. Some refuse
 * `fsync` on a directory handle, and there the rename is still atomic, only
 * not yet flushed, so a refusal here is not a failed put.
 */
async function syncDirectory(dir: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(dir, "r");
    await handle.sync();
  } catch {
    // See above: durability of the directory entry is best effort.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function isNotFound(error: unknown): boolean {
  const code = codeOf(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

function codeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}
