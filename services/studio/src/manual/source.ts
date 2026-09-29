import { createHash } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { canvas } from "../canvas";
import { manualCheckDir, manualDir, manualPath } from "../paths";
import type { RunResult } from "../proc";

import { assembleManual, snippetPath, SNIPPETS } from "./assemble";
import { parseApi, type LintComparison } from "./listing";

/**
 * The manual as the runner holds it: assembled from the installed tool, kept
 * on disk by hash, and checked.
 *
 * `refresh` runs `canvas api --json`, which opens no browser (it prints
 * `dist/api.json`), and hashes what it printed. Called at runner start and
 * before every enqueue; only when that hash differs from the last one does it
 * assemble and write a new manual, so an unchanged build costs one short
 * subprocess and a hash (docs/STUDIO-CHAT-FIRST.md, "How it is assembled").
 *
 * A refresh that fails keeps the manual it had. A studio whose tool broke is
 * refused at `doctor` before anything is queued (A8), so the manual is a help
 * the agent loses only when there never was one to keep.
 */

export interface ManualInfo {
  /** sha256 of the manual text: its file name, and `manualHash` on a job. */
  hash: string;
  /** `$STUDIO_HOME/manual/<hash>.md`. */
  path: string;
  chars: number;
  helpers: number;
  optionsSource: "generated" | "static";
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

/** What `/api/health` reports under `manual`. */
export interface ManualStatus {
  /** `ok`, `stale` when the tool and the static half disagree (M2, M3), `missing` when there is no manual. */
  state: "ok" | "stale" | "missing";
  hash: string | null;
  chars: number | null;
  optionsSource: "generated" | "static" | null;
  /** Each reason the manual is stale, as a sentence naming the rule or snippet. */
  reasons: string[];
  snippets: SnippetCheck[] | null;
  error: string | null;
  builtAt: string | null;
}

export interface ManualSourceOptions {
  /** `canvas api --json`, injectable for the tests. */
  api?: () => Promise<RunResult>;
  /**
   * Run the three worked snippets against the tool after each new build (M3).
   * Three Chromium launches, in the background, so off in the tests.
   */
  checkSnippets?: boolean;
  /** Where a mismatch is said. */
  log?: (line: string) => void;
}

export class ManualSource {
  private info: ManualInfo | null = null;
  private error: string | null = null;
  private snippets: SnippetCheck[] | null = null;
  private inFlight: Promise<ManualInfo | null> | null = null;
  private readonly api: () => Promise<RunResult>;
  private readonly check: boolean;
  private readonly log: (line: string) => void;

  constructor(options: ManualSourceOptions = {}) {
    this.api = options.api ?? (() => canvas(["api", "--json"], 60_000));
    this.check = options.checkSnippets ?? false;
    this.log = options.log ?? ((line) => process.stderr.write(`${line}\n`));
  }

  /** The manual a job starting now would get, or null when there is none. */
  current(): ManualInfo | null {
    return this.info;
  }

  /**
   * Bring the manual up to the installed build. Shared while in flight, so an
   * enqueue landing beside the start-up refresh waits for it rather than
   * running a second `api`.
   */
  refresh(): Promise<ManualInfo | null> {
    if (this.inFlight !== null) return this.inFlight;
    this.inFlight = this.doRefresh().finally(() => {
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
    const apiHash = createHash("sha256").update(result.stdout).digest("hex");
    if (this.info !== null && this.info.apiHash === apiHash) {
      this.error = null;
      return this.info;
    }
    const entries = parseApi(result.json);
    if (entries === null || entries.length === 0) {
      return this.failed("canvas api --json printed no helper entries");
    }

    const manual = assembleManual(entries);
    const file = manualPath(manual.hash);
    // Named by the hash of its text, so a file that exists already holds
    // exactly this text, and a job that recorded this hash can read it again.
    if ((await stat(file).catch(() => null)) === null) {
      await mkdir(manualDir(), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, manual.text, "utf8");
      await rename(temporary, file);
    }
    this.info = {
      hash: manual.hash,
      path: file,
      chars: manual.text.length,
      helpers: manual.helpers,
      optionsSource: manual.optionsSource,
      lintNames: manual.lintNames,
      lints: manual.lints,
      apiHash,
      builtAt: new Date().toISOString(),
    };
    this.error = null;
    for (const reason of lintReasons(this.info)) this.log(`manual stale: ${reason}`);
    if (this.check) {
      this.snippets = null;
      void checkSnippets()
        .then((checks) => {
          if (this.info?.apiHash !== apiHash) return;
          this.snippets = checks;
          for (const check of checks.filter((each) => !each.ok)) {
            this.log(`manual stale: the worked snippet "${check.name}" no longer runs clean: ${check.detail}`);
          }
        })
        .catch((error: unknown) => this.log(`manual: the worked snippets could not be checked: ${(error as Error).message}`));
    }
    return this.info;
  }

  private failed(message: string): ManualInfo | null {
    this.error = message;
    this.log(`manual: ${message}${this.info === null ? "" : `; keeping ${this.info.hash.slice(0, 12)}`}`);
    return this.info;
  }

  status(): ManualStatus {
    const info = this.info;
    const reasons = info === null ? [] : lintReasons(info);
    for (const check of this.snippets ?? []) {
      if (!check.ok) reasons.push(`the worked snippet "${check.name}" no longer runs clean: ${check.detail}`);
    }
    return {
      state: info === null ? "missing" : reasons.length > 0 ? "stale" : "ok",
      hash: info?.hash ?? null,
      chars: info?.chars ?? null,
      optionsSource: info?.optionsSource ?? null,
      reasons,
      snippets: this.snippets,
      error: this.error,
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

/**
 * Run each worked snippet through `canvas run --no-save` on a document that
 * does not exist, and say whether it ran clean: exit 0, and no lint at error
 * level. Nothing is written: `--create` starts from an empty page and
 * `--no-save` leaves the path untouched. The suite runs this too
 * (`test/manual-snippets.test.ts`), so a snippet that stops passing fails there
 * as well as here (M3).
 */
export async function checkSnippets(
  runCanvas: (args: string[], timeoutMs?: number) => Promise<RunResult> = canvas,
  directory: string = manualCheckDir(),
): Promise<SnippetCheck[]> {
  await mkdir(directory, { recursive: true });
  const checks: SnippetCheck[] = [];
  for (const snippet of SNIPPETS) {
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
