import { NPM, run, type RunResult } from "./proc";

/**
 * tldrawkc, through the one launcher the rest of the repo uses.
 *
 * `npm run --silent canvas -- <verb>` rather than `node <root>/dist/cli/index.js`,
 * because the launcher in `services/catalog/src/canvas.ts` resolves
 * `TLDRAWKC_ROOT` through the same function the diagram indexer uses. Spelling
 * the path here instead would let the runner and the indexer read different
 * builds on a machine where that variable is set.
 *
 * `--silent` is load-bearing, not cosmetic: npm prints two lines of banner on
 * stdout before the tool writes anything, and `--json | jq` then fails on the
 * first token. The root `AGENTS.md` records it as a trap that cost time once.
 */

/** The verbs the studio drives. Named so a typo is a type error. */
export type CanvasVerb =
  | "doctor"
  | "new"
  | "run"
  | "shot"
  | "inspect"
  | "export"
  | "verify"
  | "from-mermaid"
  | "list"
  | "meta";

export function canvas(args: string[], timeoutMs = 120_000): Promise<RunResult> {
  return run(NPM, ["run", "--silent", "canvas", "--", ...args], { timeoutMs });
}

/**
 * `doctor`, cached for half a minute, and shared while it is in flight.
 *
 * Every verb launches its own Chromium, `doctor` included: it loads the page
 * bundle to check that the bridge answers. Two callers ask — `POST /api/jobs`
 * before queueing anything, and `/api/health`, which a panel polls — and an
 * uncached health endpoint would open a browser on a timer for as long as the
 * page is left open. Half a minute is short enough that a `npm run build` in
 * the submodule is noticed while a person is still looking at the banner, and
 * long enough that polling costs nothing.
 *
 * Two things the first cache got wrong, and both of them opened a browser the
 * cache existed to avoid. It stamped the call's **start**, so a `doctor` slower
 * than the TTL — which is exactly the machine where a browser launch is
 * expensive — stored a result that was already expired. And it held no promise
 * while the subprocess was running, so a health poll landing next to an enqueue
 * on a cold cache ran two of them. The in-flight promise is the fix for the
 * second and stamping completion is the fix for the first.
 */
let doctorCache: { at: number; result: RunResult } | null = null;
let doctorInFlight: Promise<RunResult> | null = null;
export const DOCTOR_TTL_MS = 30_000;

export async function doctor(force = false): Promise<RunResult> {
  if (!force && doctorCache !== null && Date.now() - doctorCache.at < DOCTOR_TTL_MS) {
    return doctorCache.result;
  }
  // A second caller arriving while the first is still waiting gets the first
  // one's promise rather than a Chromium of its own. `force` joins an in-flight
  // check too: it asks for a fresh answer, and one is already being fetched.
  if (doctorInFlight !== null) return doctorInFlight;

  doctorInFlight = (async () => {
    try {
      const result = await canvas(["doctor"], 120_000);
      // Stamped when the answer arrived, not when it was asked for.
      doctorCache = { at: Date.now(), result };
      return result;
    } finally {
      doctorInFlight = null;
    }
  })();
  return doctorInFlight;
}

/** For the tests, and for a `?refresh=1` the UI may want in a later phase. */
export function forgetDoctor(): void {
  doctorCache = null;
  doctorInFlight = null;
}

/* -------------------------------------------------------------------------- */
/* The shapes the tool reports                                                */
/* -------------------------------------------------------------------------- */

export interface CanvasLint {
  rule?: string;
  severity?: string;
  message?: string;
  shape?: string;
}

/**
 * One shape, as `inspect --json` reports it.
 *
 * `text` is the label's plain text or null, which is what the gate matches the
 * brief's elements against. The tool's own `InspectShape` in
 * `src/lib/browser.ts` is the definition; this is the half the studio reads.
 */
export interface InspectShape {
  id?: string;
  type?: string;
  text?: string | null;
}

/** One arrow's two bound ends. `from` and `to` are shape ids, or null. */
export interface InspectBinding {
  arrow?: string;
  from?: string | null;
  to?: string | null;
}

export interface InspectReport {
  shapes?: InspectShape[];
  bindings?: InspectBinding[];
  lints?: CanvasLint[];
  meta?: { title?: string; topic?: string; concepts?: string[] } | null;
  bounds?: unknown;
}

export interface ExportReport {
  file?: string;
  svg?: { path?: string; width?: number; height?: number; bytes?: number } | null;
  png?: { path?: string } | null;
}

export interface VerifyCheck {
  rule: string;
  ok: boolean;
  detail: string;
}

export interface VerifyReport {
  file?: string;
  svg?: string | null;
  png?: string | null;
  checks?: VerifyCheck[];
}

/**
 * tldrawkc's exit codes, as the gate reads them.
 *
 * The mapping is D4 and it is the reason the gate cannot just check for zero.
 * 3 is a finished document with findings; 4 is a saved document whose export
 * did not happen, which costs a picture and never the work.
 */
export const EXIT = {
  ok: 0,
  usage: 1,
  snippetThrew: 2,
  lintsRemain: 3,
  exportFailed: 4,
} as const;

/** One sentence for a code, for the narration and for a failure panel. */
export function explainExit(code: number | null): string {
  switch (code) {
    case EXIT.ok:
      return "finished cleanly";
    case EXIT.usage:
      return "bad arguments, a missing file, or the browser never answered";
    case EXIT.snippetThrew:
      return "the snippet threw and nothing was written";
    case EXIT.lintsRemain:
      return "finished and saved, with lints remaining";
    case EXIT.exportFailed:
      return "the document saved and the export did not";
    case null:
      return "killed before it could exit";
    default:
      return `exited ${code}`;
  }
}
