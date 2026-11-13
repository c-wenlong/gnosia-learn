import { offeredModels, resolveDiagramAgent, resolveVideoAgent } from "../agent/agent-settings";
import { byokStatus } from "../agent/byok";
import { forgetVocabularyStatus, vocabularyStatus } from "../diagram/brief";
import { doctor, doctorAnsweredAt, invalidateDoctorCache } from "../canvas/canvas";
import { status as catalogStatus, type CatalogResult } from "../data/catalog";
import { onCatalogWrite } from "../data/catalog-events";
import { CLAUDE_BIN, CODEX_BIN, plannerModel, QWEN_BIN } from "../config";
import { Probe } from "./probe";
import { run, type RunResult } from "../proc";

/**
 * The checks `/api/health` reports on, each kept by a `Probe` so that a health
 * call spawns nothing and waits on nothing once each has answered once.
 *
 * Measured on main before this (12 cores, `/api/health` over curl):
 *
 * | check                         | idle        | CPU oversubscribed 2x |
 * | ----------------------------- | ----------- | --------------------- |
 * | canvas `doctor` (Chromium)    | 0.9-1.5 s   | 15-20 s               |
 * | `catalog status`              | 0.5 s       | 1.7-2.2 s             |
 * | two `catalog preference get`  | 0.5 s       | 1.5-1.7 s             |
 * | `claude --version`            | 0.01-0.1 s  | 0.03 s                |
 * | health, doctor cached         | 0.55-0.7 s  | 2.7-3 s               |
 * | health, doctor due (every 30 s) | 1.1-1.6 s | 6.8-23 s              |
 *
 * The doctor's own 30-second cache made the slow call look occasional, but a
 * page loaded more than 30 seconds after the last one always found it expired.
 *
 * Gates are untouched: `POST /api/jobs` and a draft's Draw still call `doctor()`
 * and decide on an answer at most `DOCTOR_TTL_MS` old, waiting for one when the
 * cache has none. What changed is only that reporting never waits.
 */

/**
 * `canvas doctor` launches a headless Chromium to check the page bundle and
 * fonts, which only change when the submodule or browser binary on disk
 * changes. Gates (`POST /api/jobs`, `POST /api/drafts/:id/draw`) still call
 * `doctor()` with `DOCTOR_TTL_MS` (30 s); `/api/health` keeps the probe for 6
 * hours so background health polls do not launch a browser every minute.
 */
export const DOCTOR_PROBE_TTL_MS = 6 * 60 * 60_000;
export const DOCTOR_FAILURE_TTL_MS = 30_000;
/** `claude --version` answers whether the CLI is on PATH; that changes when someone installs or removes it. */
export const CLAUDE_PROBE_TTL_MS = 6 * 60 * 60_000;
export const CLAUDE_FAILURE_TTL_MS = 60_000;
/** Whether the catalog answers: invalidated at once by `onCatalogWrite`, and re-checked every 30 minutes when idle. */
export const CATALOG_PROBE_TTL_MS = 30 * 60_000;
export const CATALOG_FAILURE_TTL_MS = 15_000;
/** The agent settings rows; this runner's own `PUT /api/settings/*` forgets the answer at once. */
export const AGENT_PROBE_TTL_MS = 30 * 60_000;
export const AGENT_FAILURE_TTL_MS = 15_000;

export interface DoctorAnswer {
  /** Null when the tool could not even be launched. */
  result: RunResult | null;
  /** When `doctor` itself answered, which can be earlier than the probe's read of its cache; null means now. */
  at: number | null;
}

/** Each probe's lifetime, overridable so a test can make an answer old without waiting. */
export interface HealthProbeTtls {
  doctor: number;
  claude: number;
  qwen: number;
  codex: number;
  catalog: number;
  agent: number;
}

export class HealthProbes {
  readonly doctor: Probe<DoctorAnswer>;
  readonly claude: Probe<RunResult | null>;
  /** `qwen --version`: the BYOK harness's binary on PATH, like `claude`'s. */
  readonly qwen: Probe<RunResult | null>;
  /** `codex --version`: the OpenAI harness's binary on PATH, like `claude`'s. */
  readonly codex: Probe<RunResult | null>;
  readonly catalog: Probe<CatalogResult | null>;
  readonly agent: Probe<Record<string, unknown> | null>;
  private readonly unsubscribe: () => void;
  private warming: Promise<void> | null = null;

  constructor(ttls: Partial<HealthProbeTtls> = {}) {
    // `doctor()` hands back its own cached answer when it has one younger than
    // its TTL, so this probe's age counts from when the doctor answered, not
    // from when the probe asked: the two clocks agree, and `checkedAt` is the
    // doctor's. A failed check expires after `DOCTOR_FAILURE_TTL_MS` (30 s) so
    // rebuilding the submodule unblocks the UI on the next Recheck without
    // waiting six hours.
    this.doctor = new Probe(
      async () => {
        const result = await doctor().catch(() => null);
        return { result, at: result === null ? null : doctorAnsweredAt() };
      },
      ttls.doctor ?? DOCTOR_PROBE_TTL_MS,
      {
        answeredAt: (answer) => answer.at,
        failureTtlMs: DOCTOR_FAILURE_TTL_MS,
        isFailure: (answer) => answer.result === null || answer.result.code !== 0,
      },
    );
    const cliFailed = (result: RunResult | null): boolean => result === null || result.code !== 0;
    this.claude = new Probe(
      () => run(CLAUDE_BIN, ["--version"], { timeoutMs: 30_000 }).catch(() => null),
      ttls.claude ?? CLAUDE_PROBE_TTL_MS,
      { failureTtlMs: CLAUDE_FAILURE_TTL_MS, isFailure: cliFailed },
    );
    this.qwen = new Probe(
      () => run(QWEN_BIN, ["--version"], { timeoutMs: 30_000 }).catch(() => null),
      ttls.qwen ?? CLAUDE_PROBE_TTL_MS,
      { failureTtlMs: CLAUDE_FAILURE_TTL_MS, isFailure: cliFailed },
    );
    this.codex = new Probe(
      () => run(CODEX_BIN, ["--version"], { timeoutMs: 30_000 }).catch(() => null),
      ttls.codex ?? CLAUDE_PROBE_TTL_MS,
      { failureTtlMs: CLAUDE_FAILURE_TTL_MS, isFailure: cliFailed },
    );
    this.catalog = new Probe(
      () => catalogStatus().catch(() => null),
      ttls.catalog ?? CATALOG_PROBE_TTL_MS,
      {
        failureTtlMs: CATALOG_FAILURE_TTL_MS,
        isFailure: (result) => result === null || !result.ok,
      },
    );
    this.agent = new Probe(
      () => agentSettings().catch(() => null),
      ttls.agent ?? AGENT_PROBE_TTL_MS,
      {
        failureTtlMs: AGENT_FAILURE_TTL_MS,
        isFailure: (result) => result === null,
      },
    );
    this.unsubscribe = onCatalogWrite(() => this.catalog.forget());
  }

  private settingsProbe: Probe<Record<string, unknown>> | null = null;

  /**
   * The settings panel's rows (`GET /api/settings/agent`), kept like the rest
   * so the panel opens on them rather than on three catalog subprocesses. The
   * route owns their shape, so it hands the check in; the first caller's is
   * the one kept. The route's own PUT forgets it with `agent`.
   */
  settingsView(check: () => Promise<Record<string, unknown>>): Probe<Record<string, unknown>> {
    this.settingsProbe ??= new Probe(check, this.agent.ttlMs);
    return this.settingsProbe;
  }

  /**
   * Warm every check sequentially at startup so the first health call finds
   * answers without piling up subprocesses and a headless Chromium launch all
   * at once. Shared with any early `/api/health` caller via `waitWarm()`.
   */
  warm(): Promise<void> {
    if (this.warming !== null) return this.warming;
    const runWarm = (async () => {
      await vocabularyStatus().catch(() => undefined);
      await Promise.all([
        this.claude.refresh().catch(() => undefined),
        this.qwen.refresh().catch(() => undefined),
        this.codex.refresh().catch(() => undefined),
      ]);
      await this.catalog.refresh().catch(() => undefined);
      await this.agent.refresh().catch(() => undefined);
      await this.doctor.refresh().catch(() => undefined);
    })().finally(() => {
      if (this.warming === runWarm) {
        this.warming = null;
      }
    });
    this.warming = runWarm;
    return runWarm;
  }

  /** Wait for an in-flight `warm()` pass so early health polls share its schedule. */
  async waitWarm(): Promise<void> {
    if (this.warming !== null) {
      await this.warming;
    }
  }

  /**
   * Drop every cached probe answer so the next read checks afresh. Any
   * in-flight `doctor` check is preserved so repeated `?refresh=1` calls share
   * the running Chromium check instead of launching duplicates.
   */
  forget(): void {
    this.warming = null;
    invalidateDoctorCache();
    forgetVocabularyStatus();
    this.doctor.forget({ keepInFlight: true });
    this.claude.forget();
    this.qwen.forget();
    this.codex.forget();
    this.catalog.forget();
    this.agent.forget();
    this.settingsProbe?.forget();
  }

  /** Stop listening for catalog writes. */
  close(): void {
    this.unsubscribe();
  }
}

/**
 * The model and effort a job started now would get, per kind (D53 of
 * docs/STUDIO-VIDEOS.md), by the same resolvers the runners use. The diagram
 * block is for a brief that names no model, which is every brief the planner
 * writes; one that names a model runs on it.
 */
export async function agentSettings(): Promise<Record<string, unknown>> {
  const [video, diagram, byok] = await Promise.all([resolveVideoAgent(), resolveDiagramAgent(), byokStatus()]);
  return {
    video: { model: video.model, effort: video.effort },
    diagram: { model: diagram.model, effort: diagram.effort },
    // What "Claude Code default" resolves to now, for either kind: the
    // owner's user settings file. The menu shows it whatever a row says.
    defaults: { model: video.claude.model, effort: video.claude.effort },
    // A conversation's "Runner default" (D90 of docs/STUDIO-CHAT-FIRST.md):
    // turns run on `STUDIO_PLANNER_MODEL`, jobs on their kind's row above.
    planner: plannerModel(),
    // The pick list a conversation's model menu offers: the same rows the
    // settings panel lists.
    models: offeredModels(),
    // The BYOK harness's configured provider and model, never the key: the
    // picker's BYOK row and the Connect dialog both read this.
    byok,
  };
}
