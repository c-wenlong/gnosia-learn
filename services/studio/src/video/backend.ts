import { manimkcBackend } from "./backends/manimkc";
import { remotionkcBackend } from "./backends/remotionkc";
import { revideokcBackend } from "./backends/revideokc";
import type { ValidVideoBrief } from "./brief";
import type { Scaffold } from "./checkout";
import type { GateTools, VideoGateChecks } from "./gate";
import type { VideoPaths } from "./paths";
import type { ProfileKind } from "./sandbox";
import type { SeedResult } from "./seed";
import type { VideoAgentSettings } from "./settings";
import type { VideoDoctorReport } from "./doctor";
import type { Toolchain } from "./toolchain";
import type { VideoToolName } from "./tools";

/**
 * One backend per video tool (D75 of docs/STUDIO-VIDEO-TOOLS.md).
 *
 * The video runner keeps everything that is not about a tool: the queue, the
 * lease, the claim, the agent's spawn with its settings file and Bash guard,
 * the hang timer, the gate's loop and its shared steps, cost, Accept and
 * Discard. What a tool decides goes through here: which programs it needs,
 * the job's checkout and topic, its sandbox profiles, its one command, its
 * narration clips, its manual and prompts, and the gate's source steps.
 *
 * Chosen by the brief's `tool` (`briefTool`, absent meaning manimkc), which is
 * fixed from the press on (D74), so one job has one backend throughout.
 */

/** One job as a backend sees it: the same four facts every sandboxed call is made from. */
export interface BackendJob {
  tools: Toolchain;
  paths: VideoPaths;
  /** The owner's home, resolved: the profiles deny reads under it. */
  home: string;
  /** The brief's voice, or "none" for a silent video. */
  voice: string;
}

/** A sandbox profile's text and where the job keeps it. */
export interface VideoProfile {
  kind: ProfileKind;
  file: string;
  text: string;
}

/**
 * A contact sheet the job view lists and the runner keeps after a verdict:
 * one per scene for manimkc, the stills sheet and the build's sheet for
 * revideokc and remotionkc.
 */
export interface SheetEntry {
  /** What the sheet's route names it by: a scene class, or a fixed word. Pattern-safe, never from a request. */
  id: string;
  /** The title the job view shows, or null for the scene's own name from the brief. */
  title: string | null;
  /** Where the render writes it. */
  file: string;
  /** Its name under the job's `sheets/`, where it is kept after a verdict. */
  kept: string;
  /** Scenes whose render rewrites it: the job view counts a round per look call that rendered one of them. */
  scenes: string[];
}

/** The agent's user message for one attempt: its first, a retry after the gate, or a continuation of its parent. */
export type VideoPromptRequest =
  | {
      kind: "first";
      brief: ValidVideoBrief;
      paths: VideoPaths;
      classes: readonly string[];
      /** The concept note handed over as material, when the brief named one. */
      source?: string;
      /** "9 of 12 lines already voiced", when there are any. */
      seededNote?: string;
      /** True when this job starts from an earlier video's source. */
      change: boolean;
    }
  | { kind: "retry"; findings: string[]; paths: VideoPaths }
  | { kind: "revise"; changes: string; paths: VideoPaths }
  | { kind: "resume"; paths: VideoPaths };

export interface VideoBackend extends VideoGateChecks {
  readonly tool: VideoToolName;
  /** A file of a topic folder that is the video's source: what a change or a revise starts from. */
  readonly sourcePattern: RegExp;
  /** The programs and data this tool renders with on this machine, as they resolve now. */
  toolchain(): Promise<Toolchain>;
  /** Why that toolchain cannot run a job, one line each; empty when it can. */
  problems(tools: Toolchain): string[];
  /** Every path a job uses, built from its resolved directory. */
  paths(jobId: string, slug: string): Promise<VideoPaths>;
  /** The job's sandbox profiles, in the order they are written. Deterministic, so two jobs' can be diffed. */
  profiles(job: BackendJob): VideoProfile[];
  /** The job's checkout, its profiles and its caches: everything before the topic. */
  prepare(job: BackendJob): Promise<void>;
  /** Put the topic in: a new one from the brief, or a change's source copied in. Returns the scene classes. */
  scaffold(job: BackendJob, brief: ValidVideoBrief, startFrom: Map<string, Buffer> | null): Promise<Scaffold>;
  /** Write the agent's one command for these scenes, and return the tool's library listing for the manual, if it could be read. */
  wrapper(job: BackendJob, input: { scenes: string[]; narrated: boolean }): Promise<string | null>;
  /** Seed the job's narration cache with the clips these lines already have, from the shared cache and a parent's kept ones. */
  seed(job: BackendJob, lines: readonly string[], parent: { jobId: string; slug: string } | null): Promise<SeedResult>;
  /** After a verdict: keep the clips of the lines the final source voices, so a change re-voices only what it changes. */
  keepClips(job: BackendJob): Promise<void>;
  /** The agent's manual for a job's command, a library listing and the job's paths. */
  manual(wrapper: string, listing: string, paths: VideoPaths): string;
  /** The agent's permission file, around the runner's Bash guard. */
  settings(job: BackendJob, input: { jobId: string; guard: string; source?: string }): VideoAgentSettings;
  /** The agent's user message for this attempt. */
  prompt(request: VideoPromptRequest): string;
  /** The gate's sandboxed operations for this job. */
  gateTools(job: BackendJob): GateTools;
  /**
   * The hash the wrapper records on every call as `sceneSha256`, and the gate
   * holds the build to: the scene file's sha256 for manimkc, a combined hash
   * of the topic's source files for revideokc and remotionkc. Null when there is no source.
   */
  sourceHash(paths: VideoPaths): Promise<string | null>;
  /** The source files that exist now, `topic.yml` included: what is kept in `source/` at every verdict. */
  sourceFiles(paths: VideoPaths): Promise<string[]>;
  /** The contact sheets of a job, for the job view and for keeping after a verdict. */
  sheets(paths: VideoPaths, classes: readonly string[]): SheetEntry[];
  /** Whether a file the agent Read is a sheet, which `reads.ndjson` records for the gate's step 10. */
  isSheet(paths: VideoPaths, file: string): boolean;
  /** The directories beside the topic folder the agent may Read, as the session's `--add-dir`s. */
  addDirs(paths: VideoPaths): string[];
  /** The fixture render and the checks that prove this backend works on this machine (D75). */
  doctor(): Promise<VideoDoctorReport>;
}

const BACKENDS: Partial<Record<VideoToolName, VideoBackend>> = {
  manimkc: manimkcBackend,
  revideokc: revideokcBackend,
  remotionkc: remotionkcBackend,
};

/** The tools the studio has a backend for, in VIDEO_TOOLS' order. */
export function backendTools(): VideoToolName[] {
  return Object.keys(BACKENDS) as VideoToolName[];
}

/** The backend that makes this tool's videos. A tool the studio cannot make yet has none, and asking for it throws. */
export function backendFor(tool: VideoToolName): VideoBackend {
  const backend = BACKENDS[tool];
  if (backend === undefined) throw new Error(`the studio has no video backend for ${tool}, so it cannot make a video with it`);
  return backend;
}
