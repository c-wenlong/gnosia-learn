import { spawn, type ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";

import { MIRROR_HEALTH_MS, MIRROR_IDLE_MS, MIRROR_START_MS } from "./config";
import { absolute, REPO_ROOT, slugOf, workPath } from "./paths";
import { NPM, stopChild } from "./proc";

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
 * by the sweep. Every `start` and every `list` naming a file touches it.
 *
 * **Idle has to mean "nobody is looking", and only the page can say that.**
 * The editing happens entirely between the browser and the `serve` port, which
 * is a different origin and a different process: nothing about a person drawing
 * for twenty minutes reaches this service, so without a heartbeat the sweep
 * would close a canvas out from under someone mid-edit and cost them whatever
 * they had not saved. `MirrorKeepAlive` on the canvas screen touches this at a
 * third of `idleMs`, which is why the view reports that number instead of the
 * page hard-coding one. What the sweep then closes is a window somebody walked
 * away from, which is what it was for. Caught in review on the phase 2 PR.
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
  /**
   * How long this mirror survives without being touched.
   *
   * Reported so the canvas screen can size its own heartbeat against it rather
   * than hard-coding a number that drifts from `STUDIO_MIRROR_IDLE_MS`.
   */
  idleMs: number;
}

/**
 * What closing a mirror answers: whether there was one, and whether it died.
 *
 * `gone` is `true` when nothing is left in the process group. It is `false`
 * only when a process outlived a `SIGTERM`, a grace window, a `SIGKILL` and a
 * second grace window, which is a sick machine rather than a busy one — and it
 * is the one case accept must refuse rather than rename behind.
 */
export interface MirrorStop {
  found: boolean;
  gone: boolean;
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
  private readonly starting = new Map<string, Promise<MirrorView>>();
  /** The same in-flight trick as `starting`, for the other direction. */
  private readonly stopping = new Map<string, Promise<MirrorStop>>();
  private sweeper: NodeJS.Timeout | null = null;

  /**
   * Start mirroring `file`, or hand back the server already doing it.
   *
   * Idempotent on purpose: the canvas screen calls this on every render, and a
   * second `serve` on the same document would be a second port, a second tab's
   * worth of state, and two writers on one file.
   *
   * **The in-flight map is what makes that true under concurrency**, and the
   * first version did not have it. Checking `open` before the first `await`
   * only rules out a mirror that has already finished starting; two requests
   * arriving while the first `serve` is still coming up both passed the check,
   * both spawned, and the second `open.set` dropped the first child on the
   * floor — an untracked detached process holding a port. Two reloads of the
   * canvas screen is enough to do it. This is the same shape as the in-flight
   * promise `doctor()` in `canvas.ts` already keeps, for the same reason.
   */
  async start(file: string): Promise<MirrorView> {
    const existing = this.open.get(file);
    if (existing !== undefined && !existing.closing) {
      existing.lastSeenAt = Date.now();
      return this.view(existing);
    }

    /* One that is on its way out is waited for, not spawned over.
     *
     * `stop` keeps a writer it could not kill in `open`, so this is also where
     * a stuck one is found. Spawning beside it would be the two-writers case
     * this method exists to prevent, and a worse version of it: the new mirror
     * would take the map entry, accept would close *that* one, report it gone,
     * and rename behind the old writer that is still running. `stop` dedupes,
     * so the ordinary case — a sweep closing an idle canvas a moment before
     * someone reopens it — just waits the close out. */
    if (existing !== undefined) {
      const closed = await this.stop(file);
      if (!closed.gone) {
        throw new MirrorRefused(
          503,
          `the canvas already open on ${file} will not shut down, so a second one would be a ` +
            `second writer on the same document`,
          "Look for a stuck `canvas serve` process, end it, and try again.",
        );
      }
    }

    const inFlight = this.starting.get(file);
    if (inFlight !== undefined) return inFlight;

    const attempt = this.spawn(file).finally(() => {
      this.starting.delete(file);
    });
    this.starting.set(file, attempt);
    return attempt;
  }

  private async spawn(file: string): Promise<MirrorView> {
    // Mirrors are keyed by the logical name (`learn/assets/<slug>.tldr`, the
    // string accept closes them by), and serve the diagram's checkout: the
    // diagram is rows, and an edit reaches them only through a commit.
    const slug = slugOf(file);
    const target = slug === null ? absolute(file) : workPath(slug);
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

    const ready = await startup(child).catch(async (error: unknown) => {
      // Awaited, because `stop` waits on this promise. The timeout case is the
      // one that matters: `serve` not having said it is listening is not the
      // same as it not running, and a process that binds the port a moment
      // later is a writer nobody is tracking.
      await stopChild(child);
      throw error;
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
    //
    // But a stop in flight owns the entry, and this must not race it: `child`
    // is the `npm` launcher, which exits on the `SIGTERM` while the `canvas
    // serve` underneath it may not. Dropping the entry on that exit would hide
    // a writer that is still running from the retry that has to refuse on it.
    // `stop` deletes it when the group is actually empty.
    child.on("exit", () => {
      if (mirror.closing) return;
      if (this.open.get(file) === mirror) this.open.delete(file);
    });
    this.open.set(file, mirror);
    this.startSweeper();
    return this.view(mirror);
  }

  /** Every mirror this process holds, newest first, with `file` touched if named. */
  /** Whether a canvas is open on `file`, without counting as a look (unlike `list`). */
  isOpen(file: string): boolean {
    return this.open.has(file);
  }

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

  /**
   * Close one, and do not return until the writer is gone.
   *
   * Two facts and not one, because accept needs both. `found` is whether there
   * was a canvas on that file at all, which is what `mirrorClosed` tells the
   * UI; `gone` is whether the process actually died, which is the only thing
   * that makes the rename behind it safe (A6). They are different answers and
   * collapsing them into one boolean is how a stuck writer would get renamed
   * over: `found` is true the moment a mirror existed, whatever happened next.
   */
  async stop(file: string): Promise<MirrorStop> {
    const inFlight = this.stopping.get(file);
    if (inFlight !== undefined) return inFlight;

    /* A start that has not finished is a writer too.
     *
     * Between `starting.set` and `spawn` returning there is a `serve` coming
     * up and nothing in `open` yet, so reading only `open` here answers
     * "nothing to close" about a process that is about to hold the document.
     * Accept would rename on that answer and the new canvas, which loaded the
     * file as it was before the rename, reverts it on the next Cmd+S — A6
     * again, one window along. So wait the start out and stop what it
     * produced. A start that failed leaves nothing in `open` and nothing
     * running, which is why the rejection is swallowed rather than thrown:
     * "the mirror could not start" is not this method's answer to give.
     * Caught in review on the phase 4 PR. */
    const starting = this.starting.get(file);
    if (starting !== undefined) await starting.catch(() => undefined);

    const mirror = this.open.get(file);
    if (mirror === undefined) return { found: false, gone: true };
    mirror.closing = true;

    const attempt = this.close(mirror).finally(() => {
      this.stopping.delete(file);
    });
    this.stopping.set(file, attempt);
    return attempt;
  }

  /**
   * Untracked only once it is gone.
   *
   * Deleting the entry before knowing was the hole. Accept refused with
   * `mirror-stuck` and told the person to try again; the retry found no mirror
   * on that file, answered `found: false, gone: true`, and renamed behind the
   * writer the first refusal was about. So one that will not die stays in
   * `open`, and every later `stop` finds it, signals it again and refuses
   * again until it is really gone. Caught in review on the phase 4 PR.
   */
  private async close(mirror: Mirror): Promise<MirrorStop> {
    const gone = await stopChild(mirror.child);
    if (gone && this.open.get(mirror.file) === mirror) this.open.delete(mirror.file);
    return { found: true, gone };
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
      idleMs: MIRROR_IDLE_MS,
    };
  }
}

/**
 * Wait for `serve` to say it is listening, or for the reason it will not.
 *
 * Lifted out of `spawn` so the failure path can `await` the kill before it
 * rejects. Inside the executor `finish` is synchronous, and the best it could
 * do was fire the signal and forget it.
 */
function startup(child: ChildProcess): Promise<{ url: string; port: number }> {
  return new Promise<{ url: string; port: number }>((resolve, reject) => {
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
      if (error !== null) reject(error);
      else resolve(value as { url: string; port: number });
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
}
