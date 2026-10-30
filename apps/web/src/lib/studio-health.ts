import { VIDEO_TOOL_NAMES, type VideoToolName, type VideoToolOption } from "@/lib/studio-brief-video";
import { readHealth } from "@/lib/tutor-studio";

/**
 * What the conversation reads from the runner's `GET /api/health`: the daily
 * cap, whether diagrams and videos can be made, and each video tool. One
 * fetch, `tutor-studio.ts`'s, which the concept page uses too.
 */

/**
 * The two parts of `/api/health` the conversation acts on: the daily cap, and
 * the video doctor (`video`), which decides whether the menu's Video entry and
 * the Video suggestion can be used (T5, T25). Null when the runner did not
 * answer. Health runs `doctor` (cached for 30 seconds on the runner) and
 * `claude --version`, so the panel reads it on focus at most every 30 seconds
 * and once when the cap's oldest spend ages out, never on a timer.
 */
export async function readStudioHealth(): Promise<{ dailyCap: unknown; video: unknown; diagramAgent: unknown; agent: unknown } | null> {
  const health = await readHealth();
  if (typeof health !== "object" || health === null) return null;
  const data = health as { dailyCap?: unknown; video?: unknown; diagramAgent?: unknown; agent?: unknown };
  return {
    dailyCap: data.dailyCap ?? null,
    video: data.video ?? null,
    diagramAgent: data.diagramAgent ?? null,
    // The resolved agent settings and the pick list a composer's model
    // menu offers (D90): `agent.models` from a runner that sends it.
    agent: data.agent ?? null,
  };
}

/**
 * Whether a diagram job can be queued, from health's `diagramAgent: { ok,
 * problem }` (#206: the studio's home path holds a character the Bash guard
 * cannot allow, and every Draw would answer 503). An absent block, from a
 * runner before it, is available: the press's own refusal still says why.
 */
export function diagramAvailability(raw: unknown): Availability {
  if (typeof raw !== "object" || raw === null) return { ok: true, reason: null };
  const agent = raw as { ok?: unknown; problem?: unknown };
  if (agent.ok !== false) return { ok: true, reason: null };
  return { ok: false, reason: typeof agent.problem === "string" && agent.problem.trim() !== "" ? agent.problem.trim() : null };
}

/** Whether a kind can be made now, and why not, from health's `video` or `diagramAgent` block. */
export interface Availability {
  ok: boolean;
  /** The doctor's reason, when it fails. */
  reason: string | null;
  /** Each video tool and whether the studio can make it (D73); absent from a runner before the field. */
  tools?: VideoToolOption[];
  /** The runner's speech rate, characters a second, from gnosia-audio (`video.narration`); absent from a runner before the field. */
  charsPerSecond?: number;
}

/** The old name, from when only videos had an availability. */
export type VideoAvailability = Availability;

/** A tool's `toolchainStop` from health (V26 of docs/STUDIO-VIDEOS.md), or null when absent or malformed. */
function toolchainStopOf(raw: unknown): { jobId: string; at: string; detail: string } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { jobId, at, detail } = raw as Record<string, unknown>;
  if (typeof jobId !== "string" || typeof at !== "string" || typeof detail !== "string") return null;
  return { jobId, at, detail };
}

/** Health's `video.tools`, keeping only well-formed entries for tools the web app knows. */
export function videoTools(raw: unknown): VideoToolOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): VideoToolOption[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const { name, strength, available, reason, toolchainStop } = entry as Record<string, unknown>;
    if (typeof name !== "string" || !(VIDEO_TOOL_NAMES as readonly string[]).includes(name)) return [];
    const stop = toolchainStopOf(toolchainStop);
    return [
      {
        name: name as VideoToolName,
        strength: typeof strength === "string" ? strength : "",
        available: available === true,
        // A blank reason says nothing: null, so the card words it itself.
        reason: typeof reason === "string" && reason.trim() !== "" ? reason.trim() : null,
        ...(stop === null ? {} : { toolchainStop: stop }),
      },
    ];
  });
}

/**
 * Read health's `video` block (`{ ok, checks, note? }`, #201). A failing
 * doctor gives its first failing check's detail, else its note. An absent
 * block (a runner from before the video runner) is unavailable, with no
 * reason, which the menu words as "not available on this machine".
 */
export function videoAvailability(raw: unknown): Availability {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: null };
  const video = raw as { ok?: unknown; note?: unknown; checks?: unknown; tools?: unknown; narration?: unknown };
  const rate = (video.narration as { charsPerSecond?: unknown } | null | undefined)?.charsPerSecond;
  const tools = {
    ...(video.tools === undefined ? {} : { tools: videoTools(video.tools) }),
    ...(typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? { charsPerSecond: rate } : {}),
  };
  if (video.ok === true) return { ok: true, reason: null, ...tools };
  const failing = Array.isArray(video.checks)
    ? video.checks.find((check) => typeof check === "object" && check !== null && (check as { ok?: unknown }).ok === false)
    : undefined;
  const detail =
    failing === undefined
      ? null
      : (["detail", "note", "message", "name"] as const)
          .map((field) => (failing as Record<string, unknown>)[field])
          .find((value): value is string => typeof value === "string" && value.trim() !== "") ?? null;
  const note = typeof video.note === "string" && video.note.trim() !== "" ? video.note : null;
  return { ok: false, reason: detail ?? note, ...tools };
}

/**
 * What doctor says now, for a failed job's Recheck (R2-1-19). The job's row
 * is terminal and never changes, so re-reading the job list showed nothing;
 * health carries doctor's verdict (`tldrawkc` and its `checks`), whether the
 * agent's CLI is there (`claude`) and whether a diagram job can be queued
 * (`diagramAgent`), which is what a person who
 * fixed their toolchain wants to know before pressing Retry.
 */
export function doctorVerdict(raw: unknown): { ok: boolean; text: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, text: "The studio runner did not answer, so doctor could not be read." };
  }
  const health = raw as { tldrawkc?: unknown; claude?: unknown; checks?: unknown; diagramAgent?: unknown };
  const checks = Array.isArray(health.checks) ? (health.checks as { name?: unknown; status?: unknown; detail?: unknown }[]) : [];
  const failing = checks.find((check) => check?.status === "fail");
  if (failing !== undefined) {
    const name = typeof failing.name === "string" ? failing.name : "a check";
    const detail = typeof failing.detail === "string" && failing.detail.trim() !== "" ? `: ${failing.detail.trim().replace(/[.]$/, "")}` : "";
    return { ok: false, text: `Doctor still fails on ${name}${detail}.` };
  }
  if (health.tldrawkc === false) return { ok: false, text: "Doctor still says tldrawkc cannot run on this machine." };
  // Reported beside doctor's checks, not in them: a job that never started
  // most often failed on this (the Greptile review of #595).
  if (health.claude === false) return { ok: false, text: "The claude CLI is still not on the runner's PATH, so no job can start." };
  const agent = diagramAvailability(health.diagramAgent);
  if (!agent.ok) return { ok: false, text: agent.reason === null ? "Diagram jobs still cannot be queued." : `Diagram jobs still cannot be queued: ${agent.reason.replace(/[.]$/, "")}.` };
  return { ok: true, text: "Doctor passes now." };
}

/** Read health and say what doctor says now. */
export async function recheckDoctor(): Promise<{ ok: boolean; text: string }> {
  return doctorVerdict(await readHealth());
}
