import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { canvas, doctor } from "../canvas/canvas";
import { manualCheckDir, manualDir, manualPath } from "../paths";
import { NPM, run, sweepByMarker, type RunResult } from "../proc";

import { assembleManual, snippetPath, SNIPPETS, type OptionsSource } from "./assemble";
import { parseApi, type LintComparison } from "./listing";

/**
 * The manual as the runner holds it: assembled from the installed tool, kept
 * in memory and on disk by hash, and checked.
 *
 * `refresh` runs `canvas api --json`, which opens no browser (it prints
 * `dist/api.json`), and hashes what it printed. Called at runner start and
 * before every enqueue; only when that hash differs from the last one does it
 * assemble and write a new manual, so an unchanged build costs one short
 * subprocess and a hash (docs/STUDIO-CHAT-FIRST.md, "How it is assembled").
 *
 * **Nothing here throws.** A refresh that fails, for any reason (the tool
 * missing, a static section missing, `$STUDIO_HOME/manual` unwritable), keeps
 * the manual it had, or leaves none, and says why in `status()`. A studio
 * whose tool broke is refused at `doctor` before anything is queued (A8); a
 * studio whose manual could not be built still draws, without it.
 *
 * **The file is not trusted.** A job's agent can write anywhere a `canvas`
 * verb's output path reaches (`settings.ts` names that gap), including over a
 * manual later jobs read. So every text built here is kept in memory, and
 * `ensureFile` hashes the file before each spawn and rewrites it from memory
 * when it does not match its name.
 */

export interface ManualInfo {
  /** sha256 of the manual text: its file name, and `manualHash` on a job. */
  hash: string;
  /** `$STUDIO_HOME/manual/<hash>.md`. */
  path: string;
  chars: number;
  helpers: number;
  optionsSource: OptionsSource;
  optionsFallback: string[];
  lintNames: string[] | null;
  lints: LintComparison | null;
  /** sha256 of the `api --json` output it was built from: what a refresh compares. */
  apiHash: string;
  builtAt: string;
}

export interface SnippetCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** What `/api/health` reports under `manual` and `manualDetail`. */
export interface ManualStatus {
  /**
   * `ok`; `stale` when the tool and the static half disagree (M2, M3), the
   * snippets could not be checked, or the last refresh failed and an older
   * manual is still in use; `missing` when there is no manual at all.
   */
  state: "ok" | "stale" | "missing";
  hash: string | null;
  chars: number | null;
  optionsSource: OptionsSource | null;
  optionsFallback: string[];
  /** Each reason the manual is stale, as a sentence naming the rule or snippet. */
  reasons: string[];
  snippets: SnippetCheck[] | null;
  /** True while a snippet check for this build is still owed (waiting for an idle queue or a healthy tool). */
  snippetsPending: boolean;
  error: string | null;
  builtAt: string | null;
}

export interface ManualSourceOptions {
  /** `canvas api --json`, injectable for the tests. */
  api?: () => Promise<RunResult>;
  /**
   * Run the three worked snippets against the tool after each new build (M3).
   * Three Chromium launches, so off unless asked for, and only ever run while
   * `isIdle` says no job is running or queued.
   */
  checkSnippets?: boolean;
  /**
   * The check itself, injectable for the tests. `keepGoing` is asked before
   * each snippet; a check that stops because it said no resolves to null.
   */
  runCheck?: (signal: AbortSignal, keepGoing: () => boolean) => Promise<SnippetCheck[] | null>;
  /** Whether a check may run now: nothing running, nothing queued. */
  isIdle?: () => boolean;
  /** Whether the tool is healthy: `doctor` exits 0. */
  doctorOk?: () => Promise<boolean>;
  /** How often an owed check looks for its moment. */
  tickMs?: number;
  /** Where a mismatch or a failure is said. */
  log?: (line: string) => void;
}

const sha256 = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");

export class ManualSource {
  private info: ManualInfo | null = null;
  private error: string | null = null;
  /**
   * Why the current manual's file cannot be passed to a spawn: it is missing
   * or altered and could not be written back. Jobs then run without the
   * manual, so health reports it missing until the file is put right.
   */
  private fileError: string | null = null;
  /** Every manual text this process built, by hash, so a file can be put back. */
  private readonly texts = new Map<string, string>();
  private inFlight: Promise<ManualInfo | null> | null = null;

  private snippets: SnippetCheck[] | null = null;
  private snippetError: string | null = null;
  /** The build (`apiHash`) a snippet check is still owed for, or null. */
  private wanted: string | null = null;
  private checking: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  private readonly api: () => Promise<RunResult>;
  private readonly check: boolean;
  private readonly runCheck: (signal: AbortSignal, keepGoing: () => boolean) => Promise<SnippetCheck[] | null>;
  private readonly isIdle: () => boolean;
  private readonly doctorOk: () => Promise<boolean>;
  private readonly tickMs: number;
  private readonly log: (line: string) => void;

  constructor(options: ManualSourceOptions = {}) {
    this.api = options.api ?? (() => canvas(["api", "--json"], 60_000));
    this.check = options.checkSnippets ?? false;
    this.runCheck =
      options.runCheck ?? ((signal, keepGoing) => checkSnippets(groupCanvas(signal), manualCheckDir(), keepGoing));
    this.isIdle = options.isIdle ?? (() => true);
    this.doctorOk = options.doctorOk ?? (async () => (await doctor().catch(() => null))?.code === 0);
    this.tickMs = options.tickMs ?? 15_000;
    this.log = options.log ?? ((line) => process.stderr.write(`${line}\n`));
  }

  /** The manual a job starting now would get, or null when there is none. */
  current(): ManualInfo | null {
    return this.info;
  }

  /**
   * Bring the manual up to the installed build. Shared while in flight, so an
   * enqueue landing beside the start-up refresh waits for it rather than
   * running a second `api`. Never rejects.
   */
  refresh(): Promise<ManualInfo | null> {
    if (this.inFlight !== null) return this.inFlight;
    this.inFlight = this.doRefresh()
      .catch((error: unknown) => this.failed(`the manual could not be built: ${(error as Error).message}`))
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private async doRefresh(): Promise<ManualInfo | null> {
    let result: RunResult;
    try {
      result = await this.api();
    } catch (error) {
      return this.failed(`canvas api could not be run: ${(error as Error).message}`);
    }
    if (result.code !== 0) {
      const said = (result.stderr || result.stdout).trim().split("\n").slice(-1)[0] ?? "";
      return this.failed(`canvas api --json exited ${result.code ?? "on a signal"}${said === "" ? "" : `: ${said}`}`);
    }
    const apiHash = sha256(result.stdout);
    if (this.info !== null && this.info.apiHash === apiHash) {
      // Same build. The file is checked before every spawn anyway; this puts
      // right a manual whose file was lost or changed in the meantime, and a
      // file that cannot be put right is recorded (see `fileError`) rather
      // than reported as a healthy manual.
      this.error = null;
      await this.ensureFile(this.info.hash);
      return this.info;
    }
    const entries = parseApi(result.json);
    if (entries === null || entries.length === 0) {
      return this.failed("canvas api --json printed no helper entries");
    }

    const manual = assembleManual(entries);
    this.texts.set(manual.hash, manual.text);
    await this.write(manual.hash, manual.text);
    this.info = {
      hash: manual.hash,
      path: manualPath(manual.hash),
      chars: manual.text.length,
      helpers: manual.helpers,
      optionsSource: manual.optionsSource,
      optionsFallback: manual.optionsFallback,
      lintNames: manual.lintNames,
      lints: manual.lints,
      apiHash,
      builtAt: new Date().toISOString(),
    };
    this.error = null;
    this.fileError = null;
    for (const reason of lintReasons(this.info)) this.log(`manual stale: ${reason}`);
    if (this.check) {
      this.snippets = null;
      this.snippetError = null;
      this.wanted = apiHash;
      void this.tick();
    }
    return this.info;
  }

  private failed(message: string): ManualInfo | null {
    this.error = message;
    this.log(`manual: ${message}${this.info === null ? "" : `; keeping ${this.info.hash.slice(0, 12)}`}`);
    return this.info;
  }

  /** Write a manual under its hash: a sibling temp file and a rename. */
  private async write(hash: string, text: string): Promise<void> {
    await mkdir(manualDir(), { recursive: true });
    const file = manualPath(hash);
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temporary, text, "utf8");
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  /**
   * The file for `hash`, as it must be before a spawn passes it: present, and
   * holding exactly the text the hash names. Rewritten from memory when it is
   * missing or has been changed. Null when it cannot be made right: a hash
   * this process never built (an inherited parent's, after a restart) whose
   * file is gone or altered, or a directory that cannot be written. The caller
   * then passes no file, because `claude` refuses to start on a missing one
   * ("Append system prompt file not found") and a changed one is not the
   * manual the record names.
   */
  async ensureFile(hash: string): Promise<string | null> {
    const file = manualPath(hash);
    const found = await this.makeRight(hash, file);
    // Only the current manual's file decides health: an inherited parent's
    // that is gone after a restart costs that one resume its flag and nothing
    // else, since the resumed session replays its recorded prompt anyway.
    if (hash === this.info?.hash) this.fileError = found.error;
    if (found.error !== null) this.log(`manual: ${found.error}`);
    return found.file;
  }

  private async makeRight(hash: string, file: string): Promise<{ file: string | null; error: string | null }> {
    const body = await readFile(file).catch(() => null);
    if (body !== null && sha256(body) === hash) return { file, error: null };
    const text = this.texts.get(hash);
    if (text === undefined) {
      return {
        file: null,
        error:
          `${file} is ${body === null ? "missing" : "not the text its name hashes"}, ` +
          `and this runner never built it, so it is not passed`,
      };
    }
    try {
      await this.write(hash, text);
      if (body !== null) this.log(`manual: ${file} did not match its hash and was written again`);
      return { file, error: null };
    } catch (error) {
      return {
        file: null,
        error: `${file} is ${body === null ? "missing" : "altered"} and could not be written back: ${(error as Error).message}`,
      };
    }
  }

  /* ------------------------------------------------------------------ */
  /* The snippet check (M3)                                             */
  /* ------------------------------------------------------------------ */

  /** Start looking for a moment to run an owed check. `index.ts` calls it. */
  start(): void {
    if (!this.check || this.timer !== null || this.stopped) return;
    this.timer = setInterval(() => void this.tick(), this.tickMs);
    this.timer.unref();
  }

  /** Stop: no new check, and one in flight is aborted and waited for. */
  async drain(): Promise<void> {
    this.stopped = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.abort?.abort();
    await this.checking;
  }

  /**
   * Run the owed check if this is its moment: a check is owed for the build in
   * use, none is running, the queue is idle (a job's Chromium and three more
   * would contend however concurrency is set), and the tool is healthy. A tool
   * that is not leaves the check owed, so it runs once `doctor` recovers.
   * Resolves once the check in flight, its own or an earlier one, has finished.
   */
  async tick(): Promise<void> {
    if (!this.check || this.stopped) return;
    if (this.checking !== null) {
      await this.checking;
      return;
    }
    const build = this.wanted;
    if (build === null || this.info?.apiHash !== build) return;
    if (!this.isIdle()) return;
    this.checking = this.runOnce(build).finally(() => {
      this.checking = null;
    });
    await this.checking;
  }

  private async runOnce(build: string): Promise<void> {
    if (!(await this.doctorOk())) return; // owed until the tool answers
    if (this.stopped || !this.isIdle() || this.info?.apiHash !== build) return;
    const abort = new AbortController();
    this.abort = abort;
    try {
      // Asked before each snippet, not only before the first: a job queued
      // while the check runs gets the machine, and the check stays owed.
      const checks = await this.runCheck(
        abort.signal,
        () => !this.stopped && this.isIdle() && this.info?.apiHash === build,
      );
      if (checks === null) return; // yielded to a job; owed, and run again when idle
      if (this.stopped || this.info?.apiHash !== build) return;
      const failed = checks.filter((each) => !each.ok);
      // A failure while the tool itself is broken says nothing about the
      // snippets: keep the check owed and run it again once doctor passes.
      if (failed.length > 0 && !(await this.doctorOk())) return;
      this.snippets = checks;
      this.snippetError = null;
      this.wanted = null;
      for (const check of failed) {
        this.log(`manual stale: the worked snippet "${check.name}" no longer runs clean: ${check.detail}`);
      }
    } catch (error) {
      if (this.stopped) return;
      this.snippetError = (error as Error).message;
      this.log(`manual: the worked snippets could not be checked: ${this.snippetError}`);
      // Owed again only when the tool was the reason; a check that throws on a
      // healthy tool would throw on every tick.
      if (await this.doctorOk()) this.wanted = null;
    } finally {
      this.abort = null;
    }
  }

  status(): ManualStatus {
    const info = this.info;
    const reasons = info === null ? [] : lintReasons(info);
    for (const check of this.snippets ?? []) {
      if (!check.ok) reasons.push(`the worked snippet "${check.name}" no longer runs clean: ${check.detail}`);
    }
    if (info !== null && this.snippetError !== null) {
      reasons.push(`the worked snippets could not be checked: ${this.snippetError}`);
    }
    if (info !== null && this.error !== null) {
      reasons.push(`the last refresh failed, so an older manual is in use: ${this.error}`);
    }
    if (info !== null && this.fileError !== null) {
      reasons.push(`jobs run without the manual: ${this.fileError}`);
    }
    return {
      state: info === null || this.fileError !== null ? "missing" : reasons.length > 0 ? "stale" : "ok",
      hash: info?.hash ?? null,
      chars: info?.chars ?? null,
      optionsSource: info?.optionsSource ?? null,
      optionsFallback: info?.optionsFallback ?? [],
      reasons,
      snippets: this.snippets,
      snippetsPending: this.check && this.wanted !== null && this.wanted === info?.apiHash,
      error: this.error ?? this.fileError,
      builtAt: info?.builtAt ?? null,
    };
  }
}

/** Every disagreement between the tool's lint rules and the static table, as sentences. */
function lintReasons(info: ManualInfo): string[] {
  if (info.lintNames === null) {
    return ["the getLints entry of canvas api --json names no lint rules, so the static table could not be checked"];
  }
  const reasons: string[] = [];
  for (const name of info.lints?.unknown ?? []) {
    reasons.push(`the tool names lint rule "${name}", which the manual has no fix for`);
  }
  for (const name of info.lints?.missing ?? []) {
    reasons.push(`the manual's lint rule "${name}" is no longer named by the tool, and was left out`);
  }
  return reasons;
}

export type CanvasRunner = (args: string[], timeoutMs?: number) => Promise<RunResult>;

/**
 * `canvas`, for the runner's own background check: its own process group,
 * stopped whole on a timeout or an abort (`canvas()` kills only the npm
 * launcher), with `TMPDIR` under the check's directory so the Chromium that
 * Playwright moves into a group of its own can be swept by that path. That
 * `TMPDIR` can be long, which is safe only because `canvas` binds no socket
 * under it (the note in `services/catalog/src/canvas.ts`).
 */
export function groupCanvas(signal: AbortSignal): CanvasRunner {
  const tmp = path.join(manualCheckDir(), "tmp");
  return async (args, timeoutMs = 120_000) => {
    await mkdir(tmp, { recursive: true });
    const result = await run(NPM, ["run", "--silent", "canvas", "--", ...args], {
      timeoutMs,
      group: true,
      signal,
      env: { ...process.env, TMPDIR: tmp },
    });
    if (result.timedOut || signal.aborted || result.code === null) await sweepByMarker(tmp);
    if (signal.aborted) throw new Error("stopped: the studio is shutting down");
    return result;
  };
}

/**
 * Run each worked snippet through `canvas run --no-save` on a document that
 * does not exist, and say whether it ran clean: exit 0, and no lint at error
 * level. Nothing is written: `--create` starts from an empty page and
 * `--no-save` leaves the path untouched. Null when `keepGoing` said stop
 * before a snippet (a job arrived). The suite runs this too
 * (`test/manual-snippets.test.ts`), so a snippet that stops passing fails there
 * as well as in health (M3).
 */
export async function checkSnippets(
  runCanvas: CanvasRunner = canvas,
  directory: string = manualCheckDir(),
  keepGoing: () => boolean = () => true,
): Promise<SnippetCheck[] | null> {
  await mkdir(directory, { recursive: true });
  const checks: SnippetCheck[] = [];
  for (const snippet of SNIPPETS) {
    // Null, not a partial list: a check that stopped part-way says nothing
    // about the snippets it did not reach.
    if (!keepGoing()) return null;
    const document = path.join(directory, `${snippet.name}.tldr`);
    await rm(document, { force: true });
    const result = await runCanvas(
      ["run", document, "--create", "--no-save", "--code", snippetPath(snippet.name), "--json"],
      120_000,
    );
    const lints = ((result.json as { lints?: { rule?: string; severity?: string }[] } | null)?.lints ?? []).filter(
      (lint) => lint.severity !== "warn",
    );
    const ok = result.code === 0 && lints.length === 0;
    checks.push({
      name: snippet.name,
      ok,
      detail: ok
        ? "exit 0, no lint at error level"
        : lints.length > 0
          ? `exit ${result.code ?? "on a signal"}, lints ${lints.map((lint) => lint.rule ?? "?").join(", ")}`
          : `exit ${result.code ?? "on a signal"}: ${(result.stderr || result.stdout).trim().split("\n").slice(-1)[0] ?? ""}`,
    });
  }
  return checks;
}
