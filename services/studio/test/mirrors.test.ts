import { spawn, type ChildProcess } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { MirrorRefused, Mirrors, readyObject, stopChild } from "../src/mirrors";

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
    await expect(mirrors.stop("learn/assets/never-opened.tldr")).resolves.toBe(false);
  });
});

/**
 * Stopping a writer, against a real process that does not want to stop.
 *
 * The rest of this file deliberately avoids spawning anything, and this part
 * deliberately does not, because the bug it guards is entirely about a real
 * process's real exit. `stopChild` used to send `SIGTERM` and return, so accept
 * renamed the committed file with the mirror still up and able to save over it
 * (A6). Against a cooperative process that difference is microseconds and
 * invisible; against one that takes a moment to shut down it is the whole bug.
 * So these spawn a child that ignores `SIGTERM` for long enough to see.
 */
describe("waiting for a mirror's process to actually go", () => {
  const spawned: ChildProcess[] = [];

  afterEach(() => {
    for (const child of spawned) {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone, which is the outcome every test here wants */
      }
    }
    spawned.length = 0;
  });

  /**
   * Detached, like a real mirror: `stopChild` signals the process group, so a
   * child that is not a group leader would not be the thing under test.
   */
  async function stubborn(script: string): Promise<ChildProcess> {
    const child = spawn(process.execPath, ["-e", script], {
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    spawned.push(child);
    // Wait for it to say so, or the signal can arrive before the handler that
    // ignores it is installed and the test passes for the wrong reason.
    await new Promise<void>((resolve) => child.stdout?.once("data", () => resolve()));
    return child;
  }

  it("does not resolve until the child has exited", async () => {
    const child = await stubborn(
      'process.on("SIGTERM", () => {}); setTimeout(() => process.exit(0), 250); console.log("up");',
    );
    let exitedAt: number | null = null;
    child.on("exit", () => {
      exitedAt = Date.now();
    });

    const started = Date.now();
    await expect(stopChild(child, 5_000)).resolves.toBe(true);

    // The assertion the old one-line `stop` fails: it returned while the child
    // was still running, so nothing had exited by the time accept renamed.
    expect(exitedAt).not.toBeNull();
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    expect(child.exitCode).toBe(0);
  });

  it("escalates to SIGKILL when the grace runs out, and waits for that too", async () => {
    const child = await stubborn(
      'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000); console.log("up");',
    );

    await expect(stopChild(child, 300)).resolves.toBe(true);
    expect(child.signalCode).toBe("SIGKILL");
  });

  it("returns straight away for a child that never got a pid", async () => {
    await expect(stopChild({ pid: undefined } as ChildProcess, 5_000)).resolves.toBe(true);
  });
});
