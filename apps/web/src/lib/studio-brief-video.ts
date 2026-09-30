/**
 * The video brief as the confirm card reads it (docs/STUDIO-VIDEOS.md, "The
 * video brief" and "The confirm card").
 *
 * Pure and React-free, like `studio-chat.ts`. The shape mirrors the runner's
 * `services/studio/src/video/brief.ts` (#201), and the length arithmetic is
 * the same measured constants, so the card predicts the minutes the runner's
 * validator judged. `lib/studio-video.ts` (the video job view, 2c) declares
 * the same shape; whichever PR lands second imports the other's so there is
 * one definition.
 */

export type VideoAudience = "new" | "familiar" | "expert";

export interface VideoBeat {
  say: string;
  show: string;
  labels: string[];
  /** Silent videos only: how long the beat holds, 3 to 8 seconds. */
  seconds?: number;
}

export interface VideoScene {
  name: string;
  beats: VideoBeat[];
}

export interface VideoBrief {
  title: string;
  topic: string;
  slug: string;
  mode: "new" | "change";
  idea: string;
  audience: VideoAudience;
  targetSeconds: number;
  /** A kokoro voice id, or `none` for a silent video. */
  voice: string;
  scenes: VideoScene[];
  concepts: string[];
  source?: string;
  /** The tool that makes it (docs/STUDIO-VIDEO-TOOLS.md, D71); absent is manimkc (D72). */
  tool?: VideoToolName;
  /** The planner's one sentence on why that tool, naming the runner-up. */
  toolReason?: string;
}

/** The three video tools, as the runner's `services/studio/src/video/tools.ts` names them. */
export const VIDEO_TOOL_NAMES = ["manimkc", "remotionkc", "revideokc"] as const;
export type VideoToolName = (typeof VIDEO_TOOL_NAMES)[number];

/** One tool as health's `video.tools` reports it. */
export interface VideoToolOption {
  name: VideoToolName;
  /** What it is best at, in one line. */
  strength: string;
  /** Whether the studio can make a video with it. */
  available: boolean;
  /** Why not, when it cannot. */
  reason: string | null;
}

/** The tool a brief names, absent meaning manimkc (D72). */
export function briefTool(brief: Pick<VideoBrief, "tool">): VideoToolName {
  return brief.tool !== undefined && (VIDEO_TOOL_NAMES as readonly string[]).includes(brief.tool) ? brief.tool : "manimkc";
}

/**
 * The card's tool row (D73): the tool, the line beside it (the planner's
 * reason, or once a person has switched, what the new tool is best at), and
 * the tools a person may switch to. Only tools the studio can make are
 * offered, and only when there are two of them: a menu of one is a chip. A
 * change keeps its video's tool (D74), so a change card offers none.
 */
export function toolRow(
  brief: Pick<VideoBrief, "tool" | "toolReason" | "mode">,
  tools: readonly VideoToolOption[],
): { tool: VideoToolName; line: string | null; choices: VideoToolOption[] } {
  const tool = briefTool(brief);
  const own = tools.find((option) => option.name === tool);
  const line = brief.toolReason ?? own?.strength ?? null;
  const available = tools.filter((option) => option.available);
  return { tool, line, choices: brief.mode === "change" || available.length < 2 ? [] : available };
}

/** The brief a person's switch saves: the new tool, and no reason, since the planner's was for the old one. */
export function switchedTool<T extends Pick<VideoBrief, "tool" | "toolReason">>(brief: T, tool: VideoToolName): T {
  const next: T = { ...brief, tool };
  delete next.toolReason;
  return next;
}

/** The voice value for a video with no narration. */
export const SILENT = "none";

/** Speech rate, measured across the 29 kokoro builds in manimkc's timing log (median, characters a second). */
export const CHARS_PER_SECOND = 15.2;
/** The finished video over the speech: 1.03 to 1.15 measured, 1.08 taken. */
export const VIDEO_OVER_SPEECH = 1.08;

export function isNarrated(brief: Pick<VideoBrief, "voice">): boolean {
  return brief.voice !== SILENT;
}

/** Seconds of video the given narration lines predict. */
export function secondsForLines(lines: readonly string[]): number {
  const characters = lines.reduce((sum, line) => sum + line.length, 0);
  return (characters / CHARS_PER_SECOND) * VIDEO_OVER_SPEECH;
}

/** One scene's predicted seconds: its lines' speaking time, or its beats' `seconds` when silent. */
export function sceneSeconds(scene: VideoScene, narrated: boolean): number {
  if (!narrated) return scene.beats.reduce((sum, beat) => sum + (beat.seconds ?? 0), 0);
  return secondsForLines(scene.beats.map((beat) => beat.say));
}

/** The script's own prediction of the video's length, in seconds, never copied from `targetSeconds`. */
export function predictedSeconds(brief: Pick<VideoBrief, "voice" | "scenes">): number {
  const narrated = isNarrated(brief);
  return brief.scenes.reduce((sum, scene) => sum + sceneSeconds(scene, narrated), 0);
}

/** "About 3 minutes", "About 1 minute", "About 40 seconds". */
export function aboutLength(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Length unknown";
  if (seconds < 55) return `About ${Math.max(10, Math.round(seconds / 10) * 10)} seconds`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `About ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** "24 s", "1 min 12 s": a scene's predicted length on its collapsed row. */
export function shortLength(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole} s`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

const AUDIENCE: Record<VideoAudience, string> = {
  new: "for someone new to it",
  familiar: "for someone who knows the terms",
  expert: "for someone who wants the detail",
};

/**
 * The card's one line for length, voice and audience: "About 3 minutes,
 * narrated (af_heart), for someone who knows the terms".
 */
export function videoSummaryLine(brief: Pick<VideoBrief, "voice" | "scenes" | "audience">): string {
  const voice = isNarrated(brief) ? `narrated (${brief.voice})` : "silent";
  const audience = AUDIENCE[brief.audience] ?? `for an audience of ${brief.audience}`;
  return `${aboutLength(predictedSeconds(brief))}, ${voice}, ${audience}`;
}

/** "New video, saved as `x`" or "Changes `x`". */
export function videoModeLine(brief: Pick<VideoBrief, "mode" | "slug">): { lead: string; slug: string } {
  return brief.mode === "change" ? { lead: "Changes", slug: brief.slug } : { lead: "New video, saved as", slug: brief.slug };
}

/** A scene's name as its chapter title: `why_it_matters` to "Why it matters". */
export function chapterTitle(name: string): string {
  const words = name.split("_").filter((word) => word !== "").join(" ");
  return words === "" ? name : words[0]!.toUpperCase() + words.slice(1);
}

/** "3 beats", "1 beat". */
export function beatCount(count: number): string {
  return `${count} ${count === 1 ? "beat" : "beats"}`;
}

/**
 * Capitalised words in the lines a voice will read as a word ("ACL" as
 * "ackle"), the warning V11 of the video doc asks the card to show. The
 * runner's own check reads manimkc's `narration.SPOKEN` list of words that
 * are fine; this side has no copy of it, so a brief entry that carries the
 * runner's list (`abbreviations`) wins, and this is the fallback.
 */
export function abbreviations(brief: Pick<VideoBrief, "voice" | "scenes">): string[] {
  if (!isNarrated(brief)) return [];
  const found = new Set<string>();
  for (const scene of brief.scenes) {
    for (const beat of scene.beats) {
      for (const match of beat.say.matchAll(/\b[A-Z][A-Z0-9]{1,}\b/g)) found.add(match[0]);
    }
  }
  return [...found];
}

/** The warning line, or null when there is nothing to warn about. */
export function abbreviationWarning(words: readonly string[]): string | null {
  if (words.length === 0) return null;
  const list = words.length <= 4 ? words.join(", ") : `${words.slice(0, 4).join(", ")} and ${words.length - 4} more`;
  const one = words.length === 1;
  // The first word spelled the way the prompt asks for it: "G P U".
  const spelled = words[0]!.split("").join(" ");
  return `The voice may read ${list} as ${one ? "a word" : "words"}. Spell ${one ? "it" : "them"} out ("${spelled}") where ${one ? "it is" : "they are"} said letter by letter.`;
}

/** Whether a value looks enough like a video brief to draw a card from. */
export function isVideoBrief(value: unknown): value is VideoBrief {
  if (typeof value !== "object" || value === null) return false;
  const brief = value as Partial<VideoBrief>;
  return (
    typeof brief.title === "string" &&
    typeof brief.slug === "string" &&
    typeof brief.voice === "string" &&
    Array.isArray(brief.scenes) &&
    brief.scenes.every((scene) => typeof scene?.name === "string" && Array.isArray(scene.beats))
  );
}
