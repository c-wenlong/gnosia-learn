import { spawn, type ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";

import { MIRROR_HEALTH_MS, MIRROR_IDLE_MS, MIRROR_START_MS } from "./config";
import { absolute, REPO_ROOT } from "./paths";
import { NPM, signalGroup } from "./proc";

/**
 * One `canvas serve` per document, held open for as long as someone is looking.
 *
 * `serve` is the only tldrawkc verb that stays running. Every other one launches
 * Chromium, does a job and exits; this one starts the page server over a single
 * `.tldr`, prints one JSON object when it is listening, and waits for a signal.
 * The studio reads that object rather than assuming the URL, because the port
 * falls back when 7240 is taken and a hard-coded iframe `src` would then point
 * at somebody else's server.
 *
 * **What this deliberately cannot do.** The iframe is a different origin from
 * the studio page, so the page cannot read `window.__tldrawkcMirror`, cannot
 * fetch that port's `/api/health`, and has no `postMessage` channel in either
 * direction. That is D13, and it is the reason every fact the studio states
 * about a canvas is stated from here: the port, whether it answers when *this
 * process* polls it, and the two files' modified times. Whether the tab has
 * unsaved edits or whether a save landed is the mirror's own business, said in
 * the mirror's own overlay (U10).
 *
 * Lifecycle is idle-based, not navigation-based. A browser leaving the canvas
 * screen cannot be relied on to send a DELETE — a closed laptop lid sends
 * nothing — so a mirror nobody has asked about for `MIRROR_IDLE_MS` is closed
 * by the sweep. Every `open` and every `list` touches the one it names, so a
 * page that keeps polling keeps its canvas.
 */

export interface MirrorView {
  /** Repo-relative path of the document being mirrored. */
  file: string;
  /** `http://127.0.0.1:<port>/?mirror=1`, as `serve --json` printed it. */
  url: string;
  port: number;
  startedAt: string;
  lastSeenAt: string;
  /** Null until someone asks; `true`/`false` after this process has polled it. */
  healthy: boolean | null;
}

interface Mirror {
  file: string;
  url: string;
  port: number;
  startedAt: number;
  lastSeenAt: number;
  child: ChildProcess;
  closing: boolean;
}

export class MirrorRefused extends Error {
  readonly status: number;
  readonly detail: unknown;
  constructor(status: number, message: string, detail: unknown = null) {
    super(message);
    this.name = "MirrorRefused";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * The object `serve --json` prints when it is listening, out of a partial stream.
 *
 * **It spans several lines.** tldrawkc's `printJson` is
 * `JSON.stringify(value, null, 2)`, so the payload arrives pretty-printed and a
 * line-by-line parser never sees a complete object on any one line — which is
 * how the first version of this waited out its own thirty-second timeout while
 * the URL sat in the buffer the whole time. Found by starting a real mirror,
 * not by reading the code.
 *
 * So: find the first `{`, walk forward counting braces, and parse when the
 * count returns to zero. Brace counting skips anything inside a string (and the
 * escapes inside it), because a Windows-style path or a URL with a brace in it
 * would otherwise close the object early. An unbalanced buffer means the chunk
 * stopped mid-object, and the answer is null rather than a guess: the next
 * chunk completes it.
 */
export function readyObject(buffer: string): { url: string; port: number } | null {
  const start = buffer.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let at = start; at < buffer.length; at += 1) {
    const character = buffer[at];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(buffer.slice(start, at + 1)) as { url?: unknown; port?: unknown };
          if (typeof parsed.url === "string" && typeof parsed.port === "number") {
            return { url: parsed.url, port: parsed.port };
          }
        } catch {
          /* not the object we are waiting for */
        }
        return null;
      }
    }
  }
  return null;
}

export class Mirrors {
  private readonly open = new Map<string, Mirror>();
  private sweeper: NodeJS.Timeout | null = null;

  /**
   * Start mirroring `file`, or hand back the server already doing it.
   *
   * Idempotent on purpose: the canvas screen calls this on every render, and a
   * second `serve` on the same document would be a second port, a second tab's
   * worth of state, and two writers on one file.
   */
  async start(file: string): Promise<MirrorView> {
    const existing = this.open.get(file);
    if (existing !== undefined && !existing.closing) {
      existing.lastSeenAt = Date.now();
      return this.view(existing);
    }

    const target = absolute(file);
    const info = await stat(target).catch(() => null);
    if (info === null || !info.isFile()) {
      throw new MirrorRefused(
        404,
        `${file} is not a file, so there is nothing to mirror`,
        "serve refuses a path that does not exist rather than opening a blank canvas under its name.",
      );
    }

    const child = spawn(NPM, ["run", "--silent", "canvas", "--", "serve", target, "--no-open", "--json"], {
      cwd: REPO_ROOT,
      env: process.env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const ready = await new Promise<{ url: string; port: number }>((resolve, reject) => {
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        finish(
          new MirrorRefused(
            504,
            `serve did not say it was listening within ${Math.round(MIRROR_START_MS / 1000)}s`,
            (err || out).trim().split("\n").slice(-4),
          ),
        );
      }, MIRROR_START_MS);

      let settled = false;
      const finish = (error: Error | null, value?: { url: string; port: number }): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error !== null) {
          stop(child);
          reject(error);
        } else resolve(value as { url: string; port: number });
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        out += chunk.toString();
        const found = readyObject(out);
        if (found !== null) finish(null, found);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        err += chunk.toString();
      });
      child.on("error", (error) => {
        finish(new MirrorRefused(503, `could not start serve: ${error.message}`));
      });
      child.on("exit", (code) => {
        finish(
          new MirrorRefused(
            503,
            `serve exited ${code ?? "on a signal"} before it was listening`,
            (err || out).trim().split("\n").slice(-4),
          ),
        );
      });
    });

    const now = Date.now();
    const mirror: Mirror = {
      file,
      url: ready.url,
      port: ready.port,
      startedAt: now,
      lastSeenAt: now,
      child,
      closing: false,
    };
    // A serve that dies on its own — a port stolen, a crash — must not be
    // handed out again as a URL nothing answers.
    child.on("exit", () => {
      if (this.open.get(file) === mirror) this.open.delete(file);
    });
    this.open.set(file, mirror);
    this.startSweeper();
    return this.view(mirror);
  }

  /** Every mirror this process holds, newest first, with `file` touched if named. */
  list(file?: string): MirrorView[] {
    if (file !== undefined) {
      const one = this.open.get(file);
      if (one === undefined) return [];
      one.lastSeenAt = Date.now();
      return [this.view(one)];
    }
    return [...this.open.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((mirror) => this.view(mirror));
  }

  /**
   * Does that port answer?
   *
   * Polled from here rather than from the page, because the page cannot: the
   * mirror is a different origin and a cross-origin fetch of its `/api/health`
   * is blocked before it leaves the browser. This is the whole of what D13
   * leaves the studio able to say about a running canvas.
   */
  async health(file: string): Promise<boolean | null> {
    const mirror = this.open.get(file);
    if (mirror === undefined) return null;
    const abort = AbortSignal.timeout(MIRROR_HEALTH_MS);
    try {
      const response = await fetch(`http://127.0.0.1:${mirror.port}/api/health`, { signal: abort });
      return response.ok;
    } catch {
      return false;
    }
  }

  async stop(file: string): Promise<boolean> {
    const mirror = this.open.get(file);
    if (mirror === undefined) return false;
    mirror.closing = true;
    this.open.delete(file);
    stop(mirror.child);
    return true;
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.open.keys()].map((file) => this.stop(file)));
    if (this.sweeper !== null) {
      clearInterval(this.sweeper);
      this.sweeper = null;
    }
  }

  /** Close every mirror nobody has asked about for `MIRROR_IDLE_MS`. */
  sweep(now = Date.now()): string[] {
    const closed: string[] = [];
    for (const [file, mirror] of this.open) {
      if (now - mirror.lastSeenAt >= MIRROR_IDLE_MS) {
        closed.push(file);
        void this.stop(file);
      }
    }
    return closed;
  }

  private startSweeper(): void {
    if (this.sweeper !== null) return;
    // Unref'd: an idle sweep is not a reason for the process to stay alive.
    this.sweeper = setInterval(() => this.sweep(), Math.min(MIRROR_IDLE_MS, 60_000));
    this.sweeper.unref();
  }

  private view(mirror: Mirror): MirrorView {
    return {
      file: mirror.file,
      url: mirror.url,
      port: mirror.port,
      startedAt: new Date(mirror.startedAt).toISOString(),
      lastSeenAt: new Date(mirror.lastSeenAt).toISOString(),
      healthy: null,
    };
  }
}

function stop(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) return;
  signalGroup(pid, "SIGTERM");
}
