import type { BackendJob } from "../backend";
import { runSandboxed } from "../exec";
import type { GateTools, SceneParse } from "../gate";
import { sandboxedGateTools } from "../gate-tools";
import { readPorts } from "../ports";
import { parseInGate, tscErrors } from "../ts-parse";
import { remotionkcEnv } from "./sandbox";
import { remotionkcTools, type RemotionkcToolchain } from "./toolchain";

/**
 * The gate's sandboxed operations for a remotionkc job: the lint is
 * TypeScript 7's native `tsc --noEmit` in the render profile, the parse the
 * studio's own TypeScript parser in the gate profile (`../ts-parse.ts`;
 * remotionkc's TypeScript has no JavaScript API), and the probe and the
 * poster manimkc's, since the gate profile's environment and those two
 * programs are the same.
 */
export function remotionkcGateTools(job: BackendJob): GateTools {
  const { paths } = job;
  const tools = job.tools as RemotionkcToolchain;
  const own = remotionkcTools(job.tools);
  const shared = sandboxedGateTools(job);
  return {
    scan: async () => ({ ok: false, error: "a remotionkc source is TypeScript, which Python's parser does not read", classes: [] }),
    async lint() {
      if (own.tsc === null) return null;
      const result = await runSandboxed({
        ...job,
        kind: "render",
        profile: paths.renderProfile,
        env: remotionkcEnv("render", { ...job, tools, base: readPorts(paths) }),
        argv: [own.tsc, "--noEmit", "--pretty", "false", "-p", `${paths.checkout}/tsconfig.json`],
        cwd: paths.checkout,
        timeoutMs: 180_000,
      }).catch(() => null);
      if (result === null || result.timedOut) return null;
      const errors = tscErrors(result.stdout, paths.checkout);
      // A nonzero exit with nothing tsc-shaped printed is a failure to run, not a clean file.
      if (result.code !== 0 && errors.length === 0) return null;
      return { errors, warnings: [] };
    },
    parseScene: (source: string): Promise<SceneParse> => parseInGate(job, remotionkcEnv("gate", { ...job, tools }), own.parser, source),
    probe: shared.probe,
    poster: shared.poster,
  };
}
