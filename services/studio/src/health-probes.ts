import { resolveDiagramAgent, resolveVideoAgent } from "./agent-settings";
import { vocabularyStatus } from "./brief";
import { doctor, doctorAnsweredAt, DOCTOR_TTL_MS } from "./canvas";
import { status as catalogStatus, type CatalogResult } from "./catalog";
import { CLAUDE_BIN } from "./config";
import { Probe } from "./probe";
import { run, type RunResult } from "./proc";

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

/** `claude --version` answers whether the CLI is on PATH; that changes when someone installs or removes it. */
export const CLAUDE_PROBE_TTL_MS = 60_000;
/** Whether Postgres answers: short, since the banner for "not connected" is the one a person acts on. */
export const CATALOG_PROBE_TTL_MS = 15_000;
/** The agent settings rows; this runner's own `PUT /api/settings/agent` forgets the answer at once. */
export const AGENT_PROBE_TTL_MS = 15_000;

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
  catalog: number;
  agent: number;
}

export class HealthProbes {
  readonly doctor: Probe<DoctorAnswer>;
  readonly claude: Probe<RunResult | null>;
  readonly catalog: Probe<CatalogResult | null>;
  readonly agent: Probe<Record<string, unknown> | null>;

  constructor(ttls: Partial<HealthProbeTtls> = {}) {
    // `doctor()` hands back its own cached answer when it has one younger than
    // its TTL, so this probe's age counts from when the doctor answered, not
    // from when the probe asked: the two clocks agree, and `checkedAt` is the
    // doctor's.
    this.doctor = new Probe(
      async () => {
        const result = await doctor().catch(() => null);
        return { result, at: result === null ? null : doctorAnsweredAt() };
      },
      ttls.doctor ?? DOCTOR_TTL_MS,
      { answeredAt: (answer) => answer.at },
    );
    this.claude = new Probe(
      () => run(CLAUDE_BIN, ["--version"], { timeoutMs: 30_000 }).catch(() => null),
      ttls.claude ?? CLAUDE_PROBE_TTL_MS,
    );
    this.catalog = new Probe(() => catalogStatus().catch(() => null), ttls.catalog ?? CATALOG_PROBE_TTL_MS);
    this.agent = new Probe(() => agentSettings().catch(() => null), ttls.agent ?? AGENT_PROBE_TTL_MS);
  }

  /** Start every check now, not awaited, so the first health call after a start finds answers. */
  warm(): void {
    // The vocabulary keeps its own last outcome (`vocabularyStatusNow`), which
    // health waits for only when there is none.
    void vocabularyStatus();
    this.doctor.warm();
    this.claude.warm();
    this.catalog.warm();
    this.agent.warm();
  }
}

/**
 * The model and effort a job started now would get, per kind (D53 of
 * docs/STUDIO-VIDEOS.md), by the same resolvers the runners use. The diagram
 * block is for a brief that names no model, which is every brief the planner
 * writes; one that names a model runs on it.
 */
export async function agentSettings(): Promise<Record<string, unknown>> {
  const [video, diagram] = await Promise.all([resolveVideoAgent(), resolveDiagramAgent()]);
  return {
    video: { model: video.model, effort: video.effort },
    diagram: { model: diagram.model, effort: diagram.effort },
    // What "Claude Code default" resolves to now, for either kind: the
    // owner's user settings file. The menu shows it whatever a row says.
    defaults: { model: video.claude.model, effort: video.claude.effort },
  };
}
