import { constants } from "node:fs";
import { link, lstat, mkdir, open, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { inside, matchesTag, MAX_BYTES, newestShot, openNewestShot } from "../src/diagram/live-shot";

/**
 * The grid's live preview reads the newest picture the agent took of its own
 * work out of the job's scratch directory, which the agent can write anything
 * into. These are the rules that keep that a picture of this job and nothing
 * else.
 */

/** A PNG as far as the checks go: the signature, some bytes, the IEND chunk. */
function png(body = "pixels"): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(body, "utf8"),
    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
  ]);
}

let root: string;
let scratch: string;

async function put(name: string, bytes: Buffer, secondsAgo: number): Promise<string> {
  const file = path.join(scratch, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  const at = new Date(Date.now() - secondsAgo * 1000);
  await utimes(file, at, at);
  return file;
}

beforeEach(async () => {
  root = path.join(tmpdir(), `studio-live-${Date.now()}-${Math.random()}`);
  scratch = path.join(root, "jobs", "job-live", "scratch");
  await mkdir(scratch, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("the newest picture", () => {
  it("is null before the agent has taken one", async () => {
    expect(await newestShot(scratch)).toBeNull();
    await put("pass1.js", Buffer.from("editor.createShape()"), 5);
    expect(await newestShot(scratch)).toBeNull();
  });

  it("is null when the scratch directory does not exist yet", async () => {
    expect(await newestShot(path.join(root, "jobs", "queued", "scratch"))).toBeNull();
  });

  it("is the most recently written PNG, a verify picture included", async () => {
    await put("pass1.png", png("one"), 30);
    await put("pass2.png", png("two"), 20);
    await put("verify.png", png("verify"), 10);
    expect((await newestShot(scratch))?.name).toBe("verify.png");
  });

  it("looks one directory down, where an agent may keep its shots", async () => {
    await put("pass1.png", png(), 30);
    await put("shots/pass2.png", png(), 5);
    expect((await newestShot(scratch))?.name).toBe("shots/pass2.png");
  });

  it("changes its tag when a newer picture lands, and keeps it when nothing did", async () => {
    await put("pass1.png", png(), 30);
    const first = await newestShot(scratch);
    expect((await newestShot(scratch))?.etag).toBe(first?.etag);
    await put("pass2.png", png("more"), 1);
    const second = await newestShot(scratch);
    expect(second?.name).toBe("pass2.png");
    expect(second?.etag).not.toBe(first?.etag);
  });

  it("skips a picture still being written, and falls back to the one before it", async () => {
    await put("pass1.png", png(), 30);
    // Signature, no IEND: a screenshot caught halfway through being saved.
    await put("pass2.png", png().subarray(0, 20), 1);
    expect((await newestShot(scratch))?.name).toBe("pass1.png");
  });

  it("skips a file that is not a PNG, whatever it is called", async () => {
    await put("pass1.png", png(), 30);
    await put("notes.png", Buffer.from("these are not pixels at all, just text"), 1);
    expect((await newestShot(scratch))?.name).toBe("pass1.png");
  });

  it("skips anything too large to be a tile's picture", async () => {
    await put("pass1.png", png(), 30);
    await put("huge.png", Buffer.concat([png().subarray(0, 8), Buffer.alloc(MAX_BYTES), png().subarray(-12)]), 1);
    expect((await newestShot(scratch))?.name).toBe("pass1.png");
  });
});

describe("staying inside the job's scratch", () => {
  it("never follows a symlinked file out, however new it is", async () => {
    const outside = path.join(root, "secret.png");
    await writeFile(outside, png("somebody else's"));
    await put("pass1.png", png(), 30);
    await symlink(outside, path.join(scratch, "zz-newest.png"));
    const shot = await newestShot(scratch);
    expect(shot?.name).toBe("pass1.png");
  });

  it("never lists a symlinked directory", async () => {
    const elsewhere = path.join(root, "jobs", "other-job", "scratch");
    await mkdir(elsewhere, { recursive: true });
    await writeFile(path.join(elsewhere, "theirs.png"), png());
    await symlink(elsewhere, path.join(scratch, "linked"));
    expect(await newestShot(scratch)).toBeNull();
  });

  it("reads nothing when the scratch directory is itself a symlink", async () => {
    const elsewhere = path.join(root, "elsewhere");
    await mkdir(elsewhere, { recursive: true });
    await writeFile(path.join(elsewhere, "pass1.png"), png());
    const linked = path.join(root, "jobs", "linked-job", "scratch");
    await mkdir(path.dirname(linked), { recursive: true });
    await symlink(elsewhere, linked);
    expect(await newestShot(linked)).toBeNull();
  });
});

describe("checking the opened file, not the path that led to it", () => {
  /**
   * The race `O_NOFOLLOW` cannot see: a subdirectory swapped for a link to
   * somewhere else, the file opened through it, and the directory swapped
   * back. The handle holds the outside file; the path now names the inside
   * one. Played here in order, with the open in the middle.
   */
  it("refuses a handle opened through a subdirectory that was a link at the time", async () => {
    await put("shots/pass1.png", png("inside"), 5);
    const outside = path.join(root, "outside");
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, "pass1.png"), png("outside"));
    const rootInfo = await lstat(scratch, { bigint: true });

    await rename(path.join(scratch, "shots"), path.join(scratch, "shots-real"));
    await symlink(outside, path.join(scratch, "shots"));
    const handle = await open(path.join(scratch, "shots", "pass1.png"), constants.O_RDONLY | constants.O_NOFOLLOW);
    await rm(path.join(scratch, "shots"));
    await rename(path.join(scratch, "shots-real"), path.join(scratch, "shots"));
    try {
      expect(await inside(scratch, rootInfo, "shots/pass1.png", handle)).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it("refuses a handle while the subdirectory on its path is still a link", async () => {
    const outside = path.join(root, "outside");
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, "pass1.png"), png());
    await symlink(outside, path.join(scratch, "shots"));
    const rootInfo = await lstat(scratch, { bigint: true });
    const handle = await open(path.join(scratch, "shots", "pass1.png"), constants.O_RDONLY);
    try {
      expect(await inside(scratch, rootInfo, "shots/pass1.png", handle)).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it("refuses scratch when it is no longer the directory the listing read", async () => {
    await put("pass1.png", png(), 5);
    const rootInfo = await lstat(scratch, { bigint: true });
    const handle = await open(path.join(scratch, "pass1.png"), constants.O_RDONLY);
    await rename(scratch, `${scratch}-moved`);
    await mkdir(scratch);
    // The same inode, one name, at the same path: only `scratch` itself changed.
    await rename(path.join(`${scratch}-moved`, "pass1.png"), path.join(scratch, "pass1.png"));
    try {
      expect(await inside(scratch, rootInfo, "pass1.png", handle)).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it("refuses a file with a second name, which could be an outside file hard-linked in", async () => {
    const outside = path.join(root, "secret.png");
    await writeFile(outside, png("somebody else's"));
    await link(outside, path.join(scratch, "pass1.png"));
    expect(await newestShot(scratch)).toBeNull();
  });

  it("hands back an open handle to the very file it checked", async () => {
    await put("pass1.png", png("mine"), 5);
    const shot = await openNewestShot(scratch);
    expect(shot).not.toBeNull();
    try {
      const bytes = await shot!.handle.readFile();
      expect(bytes.equals(png("mine"))).toBe(true);
    } finally {
      await shot?.handle.close();
    }
  });
});

describe("If-None-Match", () => {
  it("matches the tag, a weak copy of it, a list holding it, and *", () => {
    expect(matchesTag('"live-a"', '"live-a"')).toBe(true);
    expect(matchesTag('W/"live-a"', '"live-a"')).toBe(true);
    expect(matchesTag('"x", "live-a"', '"live-a"')).toBe(true);
    expect(matchesTag("*", '"live-a"')).toBe(true);
    expect(matchesTag('"live-b"', '"live-a"')).toBe(false);
    expect(matchesTag(undefined, '"live-a"')).toBe(false);
  });
});
