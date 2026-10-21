import type { ChildProcess } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The stopper is mocked, and that is the point of it living in `proc.ts`.
 *
 * `gone: false` means a process outlived a `SIGTERM`, a grace window, a
 * `SIGKILL` and a second window, which no test can arrange with a real process:
 * a group can always be emptied by `SIGKILL`. The branch still has to be
 * covered, because it is the one accept refuses on. `proc.test.ts` drives the
 * real thing against real processes; this file drives what `Mirrors` does with
 * its answer.
 */
const procMock = vi.hoisted(() => ({ stopChild: vi.fn() }));
vi.mock("../src/proc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/proc")>();
  return { ...actual, stopChild: procMock.stopChild };
});

const { MirrorRefused, Mirrors, readyObject } = await import("../src/canvas/mirrors");

beforeEach(() => {
  procMock.stopChild.mockReset();
  procMock.stopChild.mockResolvedValue(true);
});

/**
 * The mirror lifecycle, without starting a real `serve`.
 *
 * What is worth testing here is not that Node can spawn a process. It is the
 * two things that decide whether a canvas screen works: reading the one JSON
 * object `serve --json` prints (the port falls back when 7240 is taken, so the
 * URL has to be read rather than assumed), and closing a mirror nobody is
 * looking at, since a browser that goes away cannot be relied on to say so.
 */

describe("reading the object that says serve is listening", () => {
  /** What the tool actually prints: `printJson` is `stringify(value, null, 2)`. */
  const PRETTY = [
    "{",
    '  "url": "http://127.0.0.1:7240/?mirror=1",',
    '  "port": 7240,',
    '  "file": "/repo/learn/assets/dot-product.tldr"',
    "}",
    "",
  ].join("\n");

  it("reads it across several lines, which is how the tool prints it", () => {
    // The first version of this parsed line by line and so never saw a complete
    // object on any one line: it waited out its own thirty-second timeout with
    // the URL sitting in the buffer. Found by starting a real mirror.
    expect(readyObject(PRETTY)).toEqual({ url: "http://127.0.0.1:7240/?mirror=1", port: 7240 });
  });

  it("reads it on one line too, in case the formatting ever changes", () => {
    expect(readyObject('{"url":"http://127.0.0.1:7240/?mirror=1","port":7240}\n')?.port).toBe(7240);
  });

  it("finds it after output that is not JSON", () => {
    // `--silent` suppresses npm's banner, but a dependency's warning can still
    // land on stdout ahead of the payload.
    expect(readyObject(`npm warn something\n${PRETTY}`)?.port).toBe(7240);
  });

  it("waits rather than guessing when the chunk stopped mid-object", () => {
    expect(readyObject('{\n  "url": "http://127.0.0.1:7240/?mi')).toBeNull();
    expect(readyObject(PRETTY.slice(0, 40))).toBeNull();
  });

  it("does not let a brace inside a string close the object early", () => {
    const braced = '{\n  "file": "/tmp/a{b/x.tldr",\n  "url": "http://127.0.0.1:7240/",\n  "port": 7240\n}';
    expect(readyObject(braced)?.port).toBe(7240);
  });

  it("refuses an object that is not the ready object", () => {
    expect(readyObject('{"hello":"world"}\n')).toBeNull();
  });
});

describe("starting a mirror over nothing", () => {
  it("refuses a path with no file, rather than opening a blank canvas under its name", async () => {
    const mirrors = new Mirrors();
    await expect(mirrors.start("learn/assets/not-a-real-diagram.tldr")).rejects.toBeInstanceOf(
      MirrorRefused,
    );
    expect(mirrors.list()).toEqual([]);
  });
});

describe("two requests opening the same document at once", () => {
  it("spawns one server, not two", async () => {
    // The canvas screen POSTs on every render, so two reloads race. Checking
    // the open map before the first `await` only rules out a mirror that has
    // already finished starting; without an in-flight entry both callers got
    // past it, both spawned, and the second `open.set` dropped the first
    // detached child on the floor still holding a port. Caught in review on
    // the phase 2 PR.
    const mirrors = new Mirrors();
    const spawned: string[] = [];
    const held = mirrors as unknown as { spawn: (file: string) => Promise<unknown> };
    const real = held.spawn.bind(mirrors);
    held.spawn = async (file: string) => {
      spawned.push(file);
      return real(file);
    };

    const both = await Promise.allSettled([
      mirrors.start("learn/assets/racing.tldr"),
      mirrors.start("learn/assets/racing.tldr"),
    ]);

    expect(spawned).toEqual(["learn/assets/racing.tldr"]);
    // Both callers get the same answer, which here is the same refusal: the
    // file does not exist. What matters is that there was one attempt.
    expect(both.map((result) => result.status)).toEqual(["rejected", "rejected"]);
  });

  it("lets a later request try again once the first attempt has settled", async () => {
    const mirrors = new Mirrors();
    await expect(mirrors.start("learn/assets/racing.tldr")).rejects.toBeInstanceOf(MirrorRefused);
    // The in-flight entry is cleared in a `finally`, so a failed start is not a
    // permanent refusal for that path.
    await expect(mirrors.start("learn/assets/racing.tldr")).rejects.toBeInstanceOf(MirrorRefused);
  });
});

describe("the idle sweep", () => {
  it("closes a mirror nobody has asked about and leaves a fresh one alone", async () => {
    const mirrors = new Mirrors();
    const held = mirrors as unknown as {
      open: Map<string, { file: string; lastSeenAt: number; closing: boolean; child: { pid: undefined } }>;
    };
    held.open.set("learn/assets/old.tldr", {
      file: "learn/assets/old.tldr",
      lastSeenAt: 0,
      closing: false,
      child: { pid: undefined },
    });
    held.open.set("learn/assets/new.tldr", {
      file: "learn/assets/new.tldr",
      lastSeenAt: Date.now(),
      closing: false,
      child: { pid: undefined },
    });

    expect(mirrors.sweep()).toEqual(["learn/assets/old.tldr"]);
    // Dropped when the process is gone rather than when the sweep says so: a
    // writer that will not die has to stay findable, so the map entry now
    // outlives the call that closed it by however long the kill takes.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...held.open.keys()]).toEqual(["learn/assets/new.tldr"]);
  });

  it("is pushed back by a GET, so a page that keeps polling keeps its canvas", () => {
    const mirrors = new Mirrors();
    const held = mirrors as unknown as {
      open: Map<string, { file: string; startedAt: number; lastSeenAt: number; port: number; url: string; closing: boolean }>;
    };
    held.open.set("learn/assets/x.tldr", {
      file: "learn/assets/x.tldr",
      startedAt: 0,
      lastSeenAt: 0,
      port: 7240,
      url: "http://127.0.0.1:7240/?mirror=1",
      closing: false,
    });

    mirrors.list("learn/assets/x.tldr");
    expect(mirrors.sweep()).toEqual([]);
  });

  it("says nothing was stopped when nothing was mirroring that file", async () => {
    const mirrors = new Mirrors();
    // `gone` is true because there is nothing left to be gone: a file nobody
    // was mirroring is not a writer accept has to wait for.
    await expect(mirrors.stop("learn/assets/never-opened.tldr")).resolves.toEqual({
      found: false,
      gone: true,
    });
  });
});

/**
 * A writer that will not die has to stay findable.
 *
 * This is the trap the first version of the refusal walked a person into.
 * `stop` deleted the entry before it knew whether the process died, so accept
 * refused with `mirror-stuck`, the note said to press Accept again, and the
 * retry found no mirror on that file, answered "nothing to close" and renamed
 * behind the writer the first refusal was about. Caught in review on the
 * phase 4 PR.
 */
describe("a mirror that will not die", () => {
  const fakeChild = { pid: 424242 } as unknown as ChildProcess;

  function hold(mirrors: InstanceType<typeof Mirrors>, file: string): void {
    const held = mirrors as unknown as { open: Map<string, unknown> };
    held.open.set(file, {
      file,
      url: "http://127.0.0.1:7240/?mirror=1",
      port: 7240,
      startedAt: Date.now(),
      lastSeenAt: Date.now(),
      child: fakeChild,
      closing: false,
    });
  }

  it("is still found by the next stop, so a retried accept refuses again", async () => {
    procMock.stopChild.mockResolvedValue(false);
    const mirrors = new Mirrors();
    hold(mirrors, "learn/assets/stuck.tldr");

    await expect(mirrors.stop("learn/assets/stuck.tldr")).resolves.toEqual({
      found: true,
      gone: false,
    });
    // The retry accept's note asks for must not come back "nothing was
    // mirroring that file" while the writer is still running.
    await expect(mirrors.stop("learn/assets/stuck.tldr")).resolves.toEqual({
      found: true,
      gone: false,
    });
    expect(procMock.stopChild).toHaveBeenCalledTimes(2);
  });

  it("is not spawned over, because a second serve would be a second writer", async () => {
    procMock.stopChild.mockResolvedValue(false);
    const mirrors = new Mirrors();
    hold(mirrors, "learn/assets/stuck.tldr");
    await mirrors.stop("learn/assets/stuck.tldr");

    // Opening the canvas again is what the refusal note suggests, and a fresh
    // `serve` beside the old one would take the map entry — so accept would
    // close the new one, call it gone, and rename behind the old.
    //
    // The status and the words are both asserted, because this path also
    // refuses a missing file with a 404 and that would pass for the wrong
    // reason: an untracked stuck mirror gets as far as trying to spawn.
    const refusal = (await mirrors
      .start("learn/assets/stuck.tldr")
      .catch((error: unknown) => error)) as { status: number; message: string };
    expect(refusal).toBeInstanceOf(MirrorRefused);
    expect(refusal.status).toBe(503);
    expect(refusal.message).toContain("will not shut down");
  });

  it("is dropped once it is actually gone", async () => {
    procMock.stopChild.mockResolvedValue(false);
    const mirrors = new Mirrors();
    hold(mirrors, "learn/assets/stuck.tldr");
    await mirrors.stop("learn/assets/stuck.tldr");

    procMock.stopChild.mockResolvedValue(true);
    await expect(mirrors.stop("learn/assets/stuck.tldr")).resolves.toEqual({
      found: true,
      gone: true,
    });
    await expect(mirrors.stop("learn/assets/stuck.tldr")).resolves.toEqual({
      found: false,
      gone: true,
    });
  });

  it("joins a stop already in flight rather than starting a second one", async () => {
    let release = (): void => {};
    procMock.stopChild.mockImplementation(
      () => new Promise<boolean>((resolve) => { release = () => resolve(true); }),
    );
    const mirrors = new Mirrors();
    hold(mirrors, "learn/assets/stuck.tldr");

    const both = Promise.all([
      mirrors.stop("learn/assets/stuck.tldr"),
      mirrors.stop("learn/assets/stuck.tldr"),
    ]);
    release();
    expect(await both).toEqual([
      { found: true, gone: true },
      { found: true, gone: true },
    ]);
    expect(procMock.stopChild).toHaveBeenCalledTimes(1);
  });
});

/**
 * The window between "a serve is coming up" and "a serve is in `open`".
 *
 * `start` registers the attempt in `starting` and only writes `open` when
 * `spawn` returns, so for the length of a Chromium launch there is a writer on
 * the file that `open` knows nothing about. A `stop` that read only `open`
 * answered "nothing to close" about a process that was about to hold the
 * document, and accept renamed on that answer — the new canvas, which loaded
 * the file as it was before the rename, then reverts it on the next Cmd+S.
 * A6 again, one window along. Caught in review on the phase 4 PR.
 */
describe("a mirror that is still starting", () => {
  interface Innards {
    open: Map<string, unknown>;
    starting: Map<string, Promise<unknown>>;
  }

  it("is waited for by a stop, rather than reported as nothing to close", async () => {
    const mirrors = new Mirrors();
    const held = mirrors as unknown as Innards;
    const file = "learn/assets/coming-up.tldr";

    // A start in flight: registered in `starting`, and it puts the mirror in
    // `open` when it finishes, which is exactly what `spawn` does.
    let arrive = (): void => {};
    const inFlight = new Promise<void>((resolve) => {
      arrive = resolve;
    }).then(() => {
      held.open.set(file, {
        file,
        url: "http://127.0.0.1:7240/?mirror=1",
        port: 7240,
        startedAt: Date.now(),
        lastSeenAt: Date.now(),
        child: { pid: 424242 } as unknown as ChildProcess,
        closing: false,
      });
      held.starting.delete(file);
    });
    held.starting.set(file, inFlight);

    const stopping = mirrors.stop(file);
    arrive();

    // Without the wait this resolves `{ found: false, gone: true }` before the
    // serve is even in the map, and accept renames behind it.
    await expect(stopping).resolves.toEqual({ found: true, gone: true });
    expect(procMock.stopChild).toHaveBeenCalledTimes(1);
    expect([...held.open.keys()]).toEqual([]);
  });

  it("does not wedge the stop when the start fails", async () => {
    const mirrors = new Mirrors();
    const held = mirrors as unknown as Innards;
    const file = "learn/assets/never-came-up.tldr";

    // `spawn` kills its own child before rejecting, so a failed start leaves
    // nothing running and "nothing to close" is the honest answer. What must
    // not happen is the rejection escaping through `stop`.
    held.starting.set(file, Promise.reject(new Error("serve exited 1")));

    await expect(mirrors.stop(file)).resolves.toEqual({ found: false, gone: true });
  });
});

