import { describe, expect, it } from "vitest";

import { MirrorRefused, Mirrors, readyObject } from "../src/mirrors";

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
