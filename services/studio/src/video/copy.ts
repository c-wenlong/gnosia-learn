import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";

/**
 * Copying a file agent code could have written, safely.
 *
 * Everything under `render/` was written by a sandboxed process running code
 * the agent wrote, and such a process can outlive the agent (a scene that
 * forks out of its group). So the runner never reads a file there more than
 * once: it opens it with `O_NOFOLLOW`, checks on the open descriptor that it
 * is a regular file with exactly one link, and copies it out, hashing as it
 * goes (the gate, step 5). A symbolic link, a hard link to a file elsewhere,
 * a FIFO or a device is refused by name, not followed. The sandbox already
 * refuses creating links (measured); this is the runner not relying on that.
 *
 * The destination is created with `O_EXCL`, so a copy never writes through
 * something already sitting at the target.
 */

export class CopyRefused extends Error {
  readonly reason: "missing" | "not-regular" | "linked" | "too-large" | "exists";
  constructor(reason: CopyRefused["reason"], message: string) {
    super(message);
    this.name = "CopyRefused";
    this.reason = reason;
  }
}

export interface Copied {
  sha256: string;
  bytes: number;
}

/** Open for reading without following a link, and check what was opened. */
async function openRegular(file: string, maxBytes: number): Promise<{ handle: import("node:fs/promises").FileHandle; size: number }> {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new CopyRefused("missing", `${path.basename(file)} does not exist`);
    if (code === "ELOOP" || code === "EMLINK") throw new CopyRefused("not-regular", `${path.basename(file)} is a symbolic link, which is never followed`);
    throw error;
  }
  const facts = await handle.stat();
  if (!facts.isFile()) {
    await handle.close();
    throw new CopyRefused("not-regular", `${path.basename(file)} is not a regular file`);
  }
  if (facts.nlink !== 1) {
    await handle.close();
    throw new CopyRefused("linked", `${path.basename(file)} has ${facts.nlink} links; only a file with one is copied`);
  }
  if (facts.size > maxBytes) {
    await handle.close();
    throw new CopyRefused("too-large", `${path.basename(file)} is ${facts.size} bytes, over the ${maxBytes} this reads`);
  }
  return { handle, size: facts.size };
}

/** Copy `from` to `to` once, and return the copy's hash and size. */
export async function safeCopy(from: string, to: string, maxBytes = 4 * 2 ** 30): Promise<Copied> {
  const { handle } = await openRegular(from, maxBytes);
  await mkdir(path.dirname(to), { recursive: true });
  let out;
  try {
    out = await open(to, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
  } catch (error) {
    await handle.close();
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new CopyRefused("exists", `${path.basename(to)} already exists`);
    throw error;
  }
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    const buffer = Buffer.alloc(1 << 20);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      const chunk = buffer.subarray(0, bytesRead);
      hash.update(chunk);
      await out.write(chunk);
      bytes += bytesRead;
      if (bytes > maxBytes) throw new CopyRefused("too-large", `${path.basename(from)} grew past ${maxBytes} bytes while it was copied`);
    }
  } finally {
    await handle.close();
    await out.close();
  }
  return { sha256: hash.digest("hex"), bytes };
}

/** Read a small file the same careful way, for a sidecar or a scene file the runner parses. */
export async function safeRead(file: string, maxBytes = 8 * 2 ** 20): Promise<Buffer> {
  const { handle, size } = await openRegular(file, maxBytes);
  try {
    const buffer = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const { bytesRead } = await handle.read(buffer, offset, size - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    return buffer.subarray(0, offset);
  } finally {
    await handle.close();
  }
}

/** The sha256 of a file read safely, or null when there is nothing (or nothing regular) there. */
export async function safeHash(file: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await safeRead(file, 64 * 2 ** 20)).digest("hex");
  } catch {
    return null;
  }
}
