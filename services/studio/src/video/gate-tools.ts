import path from "node:path";

import { parseJson } from "../proc";
import { runSandboxed } from "./exec";
import { posterArgs, type GateTools } from "./gate";
import type { VideoPaths } from "./paths";
import { scanSource } from "./scan";
import type { Toolchain } from "./toolchain";

/**
 * The gate's sandboxed operations, for real: the parse and the lint in the
 * render profile, the probe and the poster in the gate profile, each with the
 * environment built from nothing.
 */
export function sandboxedGateTools(input: { tools: Toolchain; paths: VideoPaths; home: string; voice: string }): GateTools {
  const { tools, paths } = input;
  return {
    scan: (source) => scanSource(input, source),
    async lint() {
      if (tools.python3 === null) return null;
      const result = await runSandboxed({
        ...input,
        kind: "render",
        profile: paths.renderProfile,
        argv: [tools.python3.real, path.join(paths.checkout, "tools", "cli", "manimkc"), "--root", paths.checkout, "lint", paths.sceneFile, "--json"],
        cwd: paths.checkout,
        timeoutMs: 120_000,
      }).catch(() => null);
      const parsed = result === null ? null : parseJson(result.stdout.slice(result.stdout.indexOf("[")));
      if (!Array.isArray(parsed)) return null;
      const reports = parsed as { errors?: unknown; warnings?: unknown }[];
      const list = (key: "errors" | "warnings"): { line?: number; msg: string }[] =>
        reports.flatMap((report) => (Array.isArray(report[key]) ? (report[key] as { line?: number; msg?: unknown }[]) : [])).map((item) => ({
          ...(typeof item.line === "number" ? { line: item.line } : {}),
          msg: typeof item.msg === "string" ? item.msg : JSON.stringify(item),
        }));
      return { errors: list("errors"), warnings: list("warnings") };
    },
    async probe(file) {
      if (tools.ffprobe === null) return null;
      const result = await runSandboxed({
        ...input,
        kind: "gate",
        profile: paths.gateProfile,
        argv: [tools.ffprobe.link, "-v", "error", "-f", "mov", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file],
        cwd: paths.candidate,
        timeoutMs: 120_000,
      }).catch(() => null);
      if (result === null || result.code !== 0) return null;
      const parsed = parseJson(result.stdout) as { streams?: { codec_type?: unknown }[]; format?: { duration?: unknown } } | null;
      if (parsed === null) return null;
      const duration = Number.parseFloat(String(parsed.format?.duration ?? ""));
      return {
        streams: (parsed.streams ?? []).flatMap((stream) => (typeof stream.codec_type === "string" ? [stream.codec_type] : [])),
        duration: Number.isFinite(duration) ? Math.round(duration * 100) / 100 : null,
      };
    },
    async poster(file, out, offset) {
      if (tools.ffmpeg === null) return false;
      const result = await runSandboxed({
        ...input,
        kind: "gate",
        profile: paths.gateProfile,
        argv: [tools.ffmpeg.link, ...posterArgs(file, out, offset)],
        cwd: paths.candidate,
        timeoutMs: 120_000,
      }).catch(() => null);
      return result !== null && result.code === 0;
    },
  };
}
