import path from "node:path";

import type { BackendJob } from "../backend";
import { runSandboxed } from "../exec";
import type { GateTools, SceneParse } from "../gate";
import { sandboxedGateTools } from "../gate-tools";
import { parseInGate, tscErrors } from "../ts-parse";
import { revideokcPaths } from "./paths";
import { readPorts, revideokcEnv } from "./sandbox";
import { revideokcTools, type RevideokcToolchain } from "./toolchain";

/**
 * The gate's sandboxed operations for a revideokc job (D77 of
 * docs/STUDIO-VIDEO-TOOLS.md): the lint is `tsc --noEmit` in the render
 * profile, the parse is the TypeScript compiler's parser run by a small Node
 * program in the gate profile with the source on stdin, and the probe and
 * the poster are manimkc's, since the gate profile's environment and those
 * two programs are the same. `scan` (Python's `ast`) has nothing to read
 * here and says so.
 *
 * Parsing runs no code, but every process that reads a file agent code wrote
 * stays inside a job profile, and the runner only reads the program's JSON.
 */

export { PARSE_CODE, tscErrors } from "../ts-parse";

export function revideokcGateTools(job: BackendJob): GateTools {
  const { paths } = job;
  const tools = job.tools as RevideokcToolchain;
  const own = revideokcTools(job.tools);
  const shared = sandboxedGateTools(job);
  return {
    scan: async () => ({ ok: false, error: "a revideokc source is TypeScript, which Python's parser does not read", classes: [] }),
    async lint() {
      const tsc = path.join(revideokcPaths(paths).nodeModules, "typescript", "bin", "tsc");
      const result = await runSandboxed({
        ...job,
        kind: "render",
        profile: paths.renderProfile,
        env: revideokcEnv("render", { ...job, tools, base: readPorts(paths) }),
        argv: [tools.node, tsc, "--noEmit", "--pretty", "false", "-p", path.join(paths.checkout, "tsconfig.json")],
        cwd: paths.checkout,
        timeoutMs: 180_000,
      }).catch(() => null);
      if (result === null || result.timedOut) return null;
      const errors = tscErrors(result.stdout, paths.checkout);
      // A nonzero exit with nothing tsc-shaped printed is a failure to run, not a clean file.
      if (result.code !== 0 && errors.length === 0) return null;
      return { errors, warnings: [] };
    },
    parseScene: (source: string): Promise<SceneParse> =>
      parseInGate(job, revideokcEnv("gate", { ...job, tools }), own.typescript === null ? null : path.join(own.typescript, "lib", "typescript.js"), source),
    probe: shared.probe,
    poster: shared.poster,
  };
}
