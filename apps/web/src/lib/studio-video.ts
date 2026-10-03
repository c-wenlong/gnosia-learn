import type { JobState } from "@self-learn/schema/shared";

import type { TranscriptCue, VideoChapter } from "@/components/media";
import { isActive, type GateStep, type Job } from "@/lib/studio-jobs";

/**
 * What a video job looks like to the studio, decided here and nowhere else.
 *
 * Pure, as `studio-jobs.ts` and `studio-tile-jobs.ts` are: no React, no fetch,
 * no `server-only`. The video job view, the grid's video tiles and the strip
 * are view code; every judgement they make (which step is current, what the
 * tile says, which sheet is newest, what a changed line looks like, how a
 * caption file parses) lives on this side of the line where it can be a test.
 *
 * **Every shape the runner sends for a video is here**, so adapting to the
 * runner's real shapes is a change to this one file. They follow
 * docs/STUDIO-VIDEOS.md ("The job view", "API") and the routes of the runner's
 * phase 1 (`services/studio/src/video/routes.ts`, `videoView`), and
 * `GET /api/videos` follows the shape planned for step 2a (`StudioVideo`
 * below), and reads `catalog video list --json`'s too.
 *
 * The rules of the diagram view hold: the polled record is the truth and the
 * stream decorates it (D8), and nothing shows a percentage (D23), since a
 * render's length is not knowable in advance.
 */

/* -------------------------------------------------------------------------- */
/* What the runner sends                                                      */
/* -------------------------------------------------------------------------- */

export interface VideoBeat {
  say: string;
  show: string;
  labels: string[];
  /** A silent video's beats only: how long the caption holds. */
  seconds?: number;
}

export interface VideoScene {
  /** Lower-case words joined by underscores; it becomes the chapter title. */
  name: string;
  beats: VideoBeat[];
}

/** The brief a video job was made from: the script (D48). */
export interface VideoBrief {
  title: string;
  topic: string;
  slug: string;
  mode: "new" | "change";
  idea: string;
  audience: "new" | "familiar" | "expert";
  targetSeconds: number;
  /** A kokoro voice, or `none` for a silent video. */
  voice: string;
  scenes: VideoScene[];
  concepts: string[];
  source?: string;
}

/** The runner's names for the manimkc-video skill's steps (`VideoStep` in `video/types.ts`). */
export const VIDEO_STEP_NAMES = [
  "storyboard",
  "narration",
  "setup",
  "scene-code",
  "lint",
  "preview",
  "look",
  "build",
  "check",
  "poster",
  "ready",
] as const;

export type VideoStepName = (typeof VIDEO_STEP_NAMES)[number];

export interface VideoStep {
  name: VideoStepName;
  state: "pending" | "running" | "done" | "failed";
  rounds: number;
  note: string | null;
}

/** How one line of the brief compares with what the source voices. */
export interface LineChange {
  /** The scene's class, `<PREFIX><n>_<Name>`. */
  scene: string;
  kind: "unchanged" | "reworded" | "split" | "added" | "dropped";
  brief: string | null;
  voiced: string[];
}

export interface VideoGateResult {
  ok: boolean;
  steps: GateStep[];
  findings: string[];
  warnings: string[];
  script: { classes: string[]; changes: LineChange[] } | null;
  sync: { segments: number; heldTail: Record<string, number> } | null;
  length: { durationSeconds: number; predictedSeconds: number; targetSeconds: number; bytes: number } | null;
  looked: Record<string, { renderedAt: string | null; readAt: string | null }> | null;
  durationSeconds: number | null;
  checkedAt: string;
}

export interface AgentSetting {
  requested: string;
  passed: string | null;
  source: "panel" | "claude-settings" | "cli";
}

/**
 * One row of `GET /api/jobs` for a video, and the whole of `GET
 * /api/jobs/{id}` bar the brief. The fields the diagram `Job` shares keep its
 * names, so the strip and the provider handle both kinds of row.
 */
export interface VideoJob {
  jobId: string;
  kind: "video";
  state: JobState;
  phase: string | null;
  title: string | null;
  topic: string;
  slug: string;
  /** `videos/<slug>.mp4`, the name the lease is held on. */
  target: string;
  /** The brief's scenes as manimkc named the classes, in play order. */
  classes: string[];
  draftId: string | null;
  parentJob: string | null;
  attempt: number;
  turns: number | null;
  costUsd: number | null;
  costSource: "result" | "stream" | null;
  agentAuth?: "login" | "env" | null;
  apiKeySource?: string | null;
  agentModel?: AgentSetting | null;
  agentEffort?: AgentSetting | null;
  resolvedModel?: string | null;
  /** "9 of 12 lines already voiced", as numbers. */
  seeded?: { wanted: number; seeded: number } | null;
  steps: VideoStep[];
  /** Only the lines that differ from the brief: the runner leaves out `unchanged`. */
  lineChanges: LineChange[];
  gate: VideoGateResult | null;
  exitCode: number | null;
  written: string[];
  indexed: boolean;
  error: string | null;
  errorKind: string | null;
  requested: string;
  started: string | null;
  finished: string | null;
  updated: string;
  cancelRequestedAt: string | null;
  catalogErrors?: string[];
  note: string;
  /** Only `GET /api/jobs/{id}` carries it. */
  brief?: VideoBrief;
}

/** One entry of `GET /api/jobs/{id}/sheets`: the latest contact sheet of one scene. */
export interface ContactSheet {
  /** The scene's class. */
  scene: string;
  /** Its chapter title. */
  title: string;
  /** The runner's own path, `/api/jobs/{id}/sheets/{scene}.png`. */
  url: string;
  renderedAt: string | null;
  /** How many previews have rendered this scene. */
  round: number;
}

/**
 * One studio video on the grid, from `GET /api/videos`.
 *
 * The runner's route (step 2a of docs/STUDIO-MENTIONS.md) is planned as
 * `{ videos: [{ slug, title, topic, posterAssetId, updated }] }`, with
 * `posterAssetId` the video's own asset id (`video:<slug>`), which is what the
 * library's poster route takes. `readVideos` also reads `catalog video list
 * --json`'s richer shape, in case the route passes that through, and keeps
 * only studio videos either way.
 */
export interface StudioVideo {
  slug: string;
  title: string | null;
  topic: string | null;
  /** The asset id the poster route takes (`video:<slug>`), or null when there is no poster. */
  posterAssetId: string | null;
  durationSeconds: number | null;
  /** The last write, ISO, or "" when the runner sent none. */
  updated: string;
}

/** A job row of either kind, as the list mixes them. */
export type AnyJob = Job | VideoJob;

export function isVideoJob(job: { kind?: string } | null | undefined): job is VideoJob {
  return job?.kind === "video";
}

/**
 * A row of the provider's list as the video job it is, or null. The provider
 * types every row as a diagram `Job`; a video row carries the video fields
 * instead, so it is read through this rather than trusted as a `Job`.
 */
export function asVideoJob(job: { kind?: string } | null | undefined): VideoJob | null {
  return job?.kind === "video" ? (job as unknown as VideoJob) : null;
}

/* -------------------------------------------------------------------------- */
/* Where things are, through the web app's `/studio/api/*` route handler      */
/* -------------------------------------------------------------------------- */

const jobBase = (jobId: string): string => `/studio/api/jobs/${encodeURIComponent(jobId)}`;

export function sheetsHref(jobId: string): string {
  return `${jobBase(jobId)}/sheets`;
}

/**
 * One sheet's picture. The runner names it by its own path; this puts it
 * behind the proxy and adds the render time, so a new round is a new URL and
 * the browser never shows the previous round's picture from its cache.
 */
export function sheetSrc(jobId: string, sheet: Pick<ContactSheet, "scene" | "renderedAt">): string {
  const base = `${jobBase(jobId)}/sheets/${encodeURIComponent(sheet.scene)}.png`;
  return sheet.renderedAt === null ? base : `${base}?v=${encodeURIComponent(sheet.renderedAt)}`;
}

/** The gate's copies: the mp4 (with byte ranges), the captions, the poster, the transcript. */
export function mediaHref(jobId: string, file: string): string {
  return `${jobBase(jobId)}/media/${encodeURIComponent(file)}`;
}

export function mediaFiles(slug: string): { mp4: string; vtt: string; transcript: string; poster: string } {
  return {
    mp4: `${slug}.mp4`,
    vtt: `${slug}.vtt`,
    // Carries the chapters as well as the lines, so no chapters file is asked for.
    transcript: `${slug}.transcript.json`,
    poster: "poster.jpg",
  };
}

/**
 * A landed video's poster, through the library's own route, which takes the
 * *video's* asset id and finds the poster derived from it.
 */
export function posterHref(videoAssetId: string): string {
  return `/api/assets/${encodeURIComponent(videoAssetId)}/poster`;
}

/** Where the library plays a landed studio video. */
export function libraryHref(slug: string): string {
  return `/library/${encodeURIComponent(`video:${slug}`)}`;
}

/** The logical name a video job holds its lease on. */
export function videoTarget(slug: string): string {
  return `videos/${slug}.mp4`;
}

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

/** `why_it_matters` is "Why it matters": a scene's name as its chapter title. */
export function chapterTitle(name: string): string {
  const words = name.replaceAll("_", " ").trim();
  return words === "" ? name : words.charAt(0).toUpperCase() + words.slice(1);
}

/** `why_it_matters` → `WhyItMatters`, as manimkc spells a scene class (`camel` in the runner's checkout). */
function className(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter((word) => word !== "")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

/** A scene class, `<PREFIX><n>_<Name>`: its 1-based number and its name. */
const CLASS_NAME = /^[A-Za-z]+(\d+)_([A-Za-z0-9]+)$/;

/**
 * Where a scene class sits in play order: its place in the job's classes,
 * else, before the view has read them, its own number when the brief's scene
 * there has that name. -1 when neither says.
 */
function sceneIndex(job: Pick<VideoJob, "classes" | "brief">, scene: string): number {
  const listed = job.classes.indexOf(scene);
  if (listed >= 0) return listed;
  const match = CLASS_NAME.exec(scene);
  if (match === null) return -1;
  const index = Number(match[1]) - 1;
  const name = job.brief?.scenes[index]?.name;
  return name !== undefined && className(name) === match[2] ? index : -1;
}

/**
 * The stored chapter a scene became: matched by its class, else by position
 * when the chapters carry no class and there is one per scene.
 */
function chapterOf(
  job: Pick<VideoJob, "classes" | "brief">,
  scene: string,
  chapters: readonly VideoChapter[] | null,
): VideoChapter | undefined {
  if (chapters === null || chapters.length === 0) return undefined;
  const named = chapters.find((entry) => entry.scene === scene);
  if (named !== undefined) return named;
  const count = job.classes.length > 0 ? job.classes.length : (job.brief?.scenes.length ?? -1);
  const index = sceneIndex(job, scene);
  return index >= 0 && chapters.length === count && chapters.every((entry) => entry.scene === undefined) ? chapters[index] : undefined;
}

/**
 * A scene class's chapter title, one name per scene everywhere the view says
 * it: the stored chapter's title once the video has chapters (the agent
 * titles them in its scene code, and the player's bar and the library show
 * those), else the brief's scene name at the same place, else the class's
 * own name after its number, in words.
 */
export function sceneTitle(
  job: Pick<VideoJob, "classes" | "brief">,
  scene: string,
  chapters: readonly VideoChapter[] | null = null,
): string {
  const stored = chapterOf(job, scene, chapters)?.title.trim() ?? "";
  if (stored !== "") return stored;
  const index = sceneIndex(job, scene);
  const name = index >= 0 ? job.brief?.scenes[index]?.name : undefined;
  if (name !== undefined) return chapterTitle(name);
  const match = CLASS_NAME.exec(scene);
  return chapterTitle((match?.[2] ?? scene).replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase());
}

/* -------------------------------------------------------------------------- */
/* The steps                                                                  */
/* -------------------------------------------------------------------------- */

/** The step list's words: a step in a list, sentence case. */
const STEP_LABELS: Record<VideoStepName, string> = {
  storyboard: "Storyboard",
  narration: "Narration",
  setup: "Setup",
  "scene-code": "Scene code",
  lint: "Lint",
  preview: "Preview",
  look: "Look at the sheets",
  build: "Build",
  check: "Check",
  poster: "Poster",
  ready: "Ready for review",
};

/** The loader's words: something happening now. */
const DOING: Record<VideoStepName, string> = {
  storyboard: "Reading the storyboard",
  narration: "Voicing the lines",
  setup: "Setting up",
  "scene-code": "Writing the scenes",
  lint: "Linting the scenes",
  preview: "Previewing",
  look: "Looking at the sheets",
  build: "Building the video",
  check: "Checking the video",
  poster: "Cutting the poster",
  ready: "Ready to review",
};

export type StepStatus = "done" | "current" | "pending" | "failed";

export interface StepRow {
  key: VideoStepName | "lines";
  label: string;
  status: StepStatus;
  /** "Round 3" when the step has repeated, else null. */
  rounds: string | null;
  /** The runner's note, sentence case, or null. */
  note: string | null;
}

export function isNarrated(brief: Pick<VideoBrief, "voice"> | undefined): boolean {
  return brief === undefined || brief.voice !== "none";
}

function sentence(text: string | null): string | null {
  if (text === null || text.trim() === "") return null;
  const trimmed = text.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Every step, from the first second, the way the diagram panel shows all
 * seven phases: a person waiting on a fifteen-minute job needs to see how
 * much of the shape is left.
 *
 * The runner derives each step from what it can see (the wrapper's call log,
 * the stream, the gate) and sends the list; this only words it. A job whose
 * record carries no steps yet (queued, or a runner one version behind) gets
 * the list pending, the narration step left out for a silent brief. A job
 * that stopped marks the step it stopped in as failed, since the runner's
 * list still says running there.
 *
 * **One step is active.** The runner can report several steps as running
 * at once (narration waits for a narrate call while the scenes are written;
 * a preview round and the reads of its sheets overlap), so the furthest of
 * them is the step happening now, and it alone is shown active. An earlier
 * one that has done something (`rounds > 0`) reads as done, and one that has
 * not, as not reached yet, its note still shown.
 *
 * **A job that stopped marks one step where it stopped:** the step the runner
 * itself failed; else the one that was active; else, when nothing was
 * running (killed between steps), the first not done after the furthest done.
 *
 * "Lines changed" is not a step the runner sends: it is inserted after
 * Narration whenever the record lists a line voiced differently from the
 * brief's, as the design's table has it. The runner fills that list at the
 * gate today, so in practice the row appears when the checks run.
 */
export function stepRows(job: VideoJob): StepRow[] {
  const sent = new Map(job.steps.map((step) => [step.name, step]));
  const narrated = job.steps.length > 0 ? sent.has("narration") : isNarrated(job.brief);
  const stopped = job.state === "failed" || job.state === "cancelled" || job.state === "interrupted";
  const settled = job.state === "awaiting_review" || job.state === "accepted";
  const active = furthestRunning(job.steps);
  const sentFailed = job.steps.some((step) => step.state === "failed");
  // Running with no steps yet: the runner sends none until the job's
  // checkout is built, and only names its phase. What it would send then is
  // known: the brief is the storyboard, and the phase is the step under way.
  const unsent = job.state === "running" && job.steps.length === 0;
  const rows: StepRow[] = [];
  for (const name of VIDEO_STEP_NAMES) {
    if (name === "narration" && !narrated) continue;
    const step = sent.get(name);
    let status: StepStatus;
    if (job.state === "queued") status = name === "storyboard" ? "done" : "pending";
    else if (unsent) status = name === "storyboard" ? "done" : name === job.phase ? "current" : "pending";
    else if (step === undefined) status = "pending";
    else if (step.state !== "running") status = step.state;
    else if (name !== active) status = step.rounds > 0 ? "done" : "pending";
    else if (stopped) status = sentFailed ? "pending" : "failed";
    else status = "current";
    if (settled && (status === "current" || status === "pending")) status = "done";
    rows.push({
      key: name,
      label: STEP_LABELS[name],
      status,
      rounds: step !== undefined && step.rounds > 1 && REPEATS.has(name) ? `Round ${step.rounds}` : null,
      note: sentence(step?.note ?? (unsent && name === "narration" ? seededNote(job) : null)),
    });
    if (name === "narration" || (name === "storyboard" && !narrated)) {
      const changed = job.lineChanges.filter((change) => change.kind !== "unchanged").length;
      if (changed > 0 && job.state !== "queued") {
        rows.push({
          key: "lines",
          label: "Lines changed",
          status: "done",
          rounds: null,
          note: `${changed} line${changed === 1 ? "" : "s"} differ${changed === 1 ? "s" : ""} from the brief`,
        });
      }
    }
  }
  if (stopped && active === null && !sentFailed) {
    // The step after the furthest one done: narration is pending until the
    // agent's first narrate call, so "the first pending" could point back at
    // it while the job had got as far as a build.
    let reached = -1;
    rows.forEach((row, at) => {
      if (row.key !== "lines" && row.status === "done") reached = at;
    });
    const next = rows.slice(reached + 1).find((row) => row.status === "pending");
    if (next !== undefined) next.status = "failed";
  }
  return rows;
}

/** The runner's seeding as its narration step words it, before the step exists. */
function seededNote(job: VideoJob): string | null {
  const seeded = job.seeded ?? null;
  return seeded === null ? null : `${seeded.seeded} of ${seeded.wanted} lines already voiced`;
}

/** The furthest step, in the skill's order, that the runner reports running. */
function furthestRunning(steps: readonly VideoStep[]): VideoStepName | null {
  let at = -1;
  for (const step of steps) {
    if (step.state !== "running") continue;
    at = Math.max(at, VIDEO_STEP_NAMES.indexOf(step.name));
  }
  return at < 0 ? null : (VIDEO_STEP_NAMES[at] ?? null);
}

/** The steps that repeat in the skill's loop, whose round count is news. */
const REPEATS = new Set<VideoStepName>(["narration", "scene-code", "lint", "preview", "look", "build"]);

/** The step happening now, or null when none is. */
export function currentStep(job: VideoJob): VideoStepName | null {
  if (job.state !== "running") return null;
  const running = furthestRunning(job.steps);
  if (running !== null) return running;
  const phase = job.phase;
  return phase !== null && (VIDEO_STEP_NAMES as readonly string[]).includes(phase) ? (phase as VideoStepName) : null;
}

/** The loader's headline: what the job is doing, in sentence case. */
export function videoHeadline(job: VideoJob): string {
  if (job.state === "queued") return "Waiting to start";
  if (job.state === "awaiting_review") return DOING.ready;
  if (job.state === "running" && job.cancelRequestedAt !== null) return "Stopping";
  const step = currentStep(job);
  if (step === null) return job.state === "running" ? "Starting" : sentence(job.state.replace("_", " ")) ?? "";
  const rounds = job.steps.find((entry) => entry.name === step)?.rounds ?? 0;
  if (step === "preview" && rounds > 1) return `Previewing, round ${rounds}`;
  return DOING[step];
}

/** `Step 6 of 11`, or null when nothing is running. Never a percentage (D23). */
export function videoStepCount(job: VideoJob): string | null {
  const step = currentStep(job);
  if (step === null) return null;
  const names = VIDEO_STEP_NAMES.filter((name) => name !== "narration" || isNarratedJob(job));
  const at = names.indexOf(step);
  return at < 0 ? null : `Step ${at + 1} of ${names.length}`;
}

function isNarratedJob(job: VideoJob): boolean {
  return job.steps.length > 0 ? job.steps.some((step) => step.name === "narration") : isNarrated(job.brief);
}

/** The step in the strip's lower-case words, for a row that also names the job. */
export function videoPhaseWords(job: VideoJob): string {
  if (job.state === "queued") return "waiting for the video runner";
  return videoHeadline(job).toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* The sheets                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The sheets in play order, whatever order they arrived in: the brief's
 * scene order, which is the video's.
 */
export function sheetsInOrder(sheets: readonly ContactSheet[], classes: readonly string[]): ContactSheet[] {
  const rank = (scene: string): number => {
    const at = classes.indexOf(scene);
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  return [...sheets].sort((a, b) => rank(a.scene) - rank(b.scene));
}

/** The sheet rendered last, the tile's live picture, or null before the first preview. */
export function newestSheet(sheets: readonly ContactSheet[]): ContactSheet | null {
  let best: ContactSheet | null = null;
  let bestAt = -Infinity;
  for (const sheet of sheets) {
    const at = sheet.renderedAt === null ? -Infinity : Date.parse(sheet.renderedAt);
    const when = Number.isFinite(at) ? at : -Infinity;
    if (best === null || when > bestAt) {
      best = sheet;
      bestAt = when;
    }
  }
  return best;
}

/** Read `GET /api/jobs/{id}/sheets` defensively: anything malformed is dropped, never thrown. */
export function readSheets(body: unknown): ContactSheet[] {
  const list = (body as { sheets?: unknown } | null)?.sheets;
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry): ContactSheet[] => {
    const raw = entry as Partial<ContactSheet> | null;
    if (raw === null || typeof raw.scene !== "string" || raw.scene === "") return [];
    return [
      {
        scene: raw.scene,
        title: typeof raw.title === "string" ? raw.title : raw.scene,
        url: typeof raw.url === "string" ? raw.url : "",
        renderedAt: typeof raw.renderedAt === "string" ? raw.renderedAt : null,
        round: typeof raw.round === "number" ? raw.round : 0,
      },
    ];
  });
}

/** How often a visible running video job asks for its sheets. A preview round takes tens of seconds. */
export const SHEETS_POLL_MS = 4_000;

/** Whether the job is still making sheets worth asking about. */
export function wantsSheets(job: VideoJob): boolean {
  return job.state === "running";
}

/* -------------------------------------------------------------------------- */
/* The captions and the chapters                                              */
/* -------------------------------------------------------------------------- */

/** `00:01:02.500` or `01:02.500` in seconds, or NaN. */
function vttSeconds(stamp: string): number {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(stamp.trim());
  if (match === null) return Number.NaN;
  const [, h, m, s, ms] = match;
  return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number((ms ?? "0").padEnd(3, "0")) / 1000;
}

/**
 * The cues of a WebVTT file, as the player's transcript takes them.
 *
 * manimkc writes the `.vtt` from the transcript's segments, split to player
 * width, so it is the transcript when the runner serves nothing richer. Cue
 * identifiers, `NOTE` and `STYLE` blocks and cue settings are skipped, and
 * tags such as `<v Narrator>` are stripped from the text.
 */
export function parseVtt(text: string): TranscriptCue[] {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const cues: TranscriptCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim() !== "");
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing < 0) continue;
    const [from, rest] = (lines[timing] ?? "").split("-->");
    const to = (rest ?? "").trim().split(/\s+/)[0] ?? "";
    const start = vttSeconds(from ?? "");
    const end = vttSeconds(to);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const words = lines
      .slice(timing + 1)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      // Last, or `&amp;lt;` (a literal "&lt;") would decode twice into "<".
      .replace(/&amp;/g, "&")
      .trim();
    if (words === "") continue;
    cues.push({ start, end, text: words });
  }
  return cues;
}

/**
 * The transcript and chapters, from `<slug>.transcript.json` when the runner
 * serves it (`{ chapters, segments }`, manimkc's own shape), or null when the
 * body is not that.
 */
export function readTranscript(body: unknown): { chapters: VideoChapter[]; cues: TranscriptCue[] } | null {
  const raw = body as { chapters?: unknown; segments?: unknown } | null;
  if (raw === null || typeof raw !== "object") return null;
  const chapters = Array.isArray(raw.chapters)
    ? raw.chapters.flatMap((entry): VideoChapter[] => {
        const c = entry as Partial<VideoChapter> | null;
        if (c === null || typeof c.start !== "number" || typeof c.end !== "number") return [];
        return [{ scene: typeof c.scene === "string" ? c.scene : undefined, title: typeof c.title === "string" ? c.title : "", start: c.start, end: c.end }];
      })
    : [];
  const cues = Array.isArray(raw.segments)
    ? raw.segments.flatMap((entry): TranscriptCue[] => {
        const s = entry as Partial<TranscriptCue> | null;
        if (s === null || typeof s.start !== "number" || typeof s.end !== "number" || typeof s.text !== "string") return [];
        return [{ scene: typeof s.scene === "string" ? s.scene : undefined, start: s.start, end: s.end, text: s.text }];
      })
    : [];
  if (chapters.length === 0 && cues.length === 0) return null;
  return { chapters, cues };
}

/** One scene of the storyboard under the player. */
export interface StoryboardScene {
  scene: string;
  title: string;
  /** Where the scene starts in the video, when the chapters are known. */
  start: number | null;
  /** The lines as voiced, each marked when it differs from the brief. */
  lines: { text: string; changed: boolean }[];
}

/**
 * The storyboard beside the player: each scene's title, its lines as voiced,
 * and its start time.
 *
 * The lines are the brief's, with the runner's changes applied: a reworded or
 * split line is replaced by what was voiced, a dropped line is gone, an added
 * one is appended to its scene. The runner sends only the changes, so a line
 * with none is voiced as the brief wrote it. A chapter's title and start come
 * from the stored chapters matched by scene, else by position, and the title
 * falls back to the brief's scene name (`sceneTitle`).
 */
export function storyboard(
  job: Pick<VideoJob, "classes" | "brief" | "lineChanges">,
  chapters: readonly VideoChapter[] | null,
): StoryboardScene[] {
  const brief = job.brief;
  const scenes = job.classes.length > 0 ? job.classes : (brief?.scenes.map((scene) => scene.name) ?? []);
  return scenes.map((scene, index) => {
    const beats = brief?.scenes[index]?.beats ?? [];
    const changes = job.lineChanges.filter((change) => change.scene === scene);
    const lines: { text: string; changed: boolean }[] = [];
    const used = new Set<LineChange>();
    for (const beat of beats) {
      const change = changes.find((entry) => !used.has(entry) && entry.brief === beat.say && entry.kind !== "added");
      if (change === undefined || change.kind === "unchanged") {
        lines.push({ text: beat.say, changed: false });
        if (change !== undefined) used.add(change);
        continue;
      }
      used.add(change);
      for (const voiced of change.voiced) lines.push({ text: voiced, changed: true });
    }
    for (const change of changes) {
      if (change.kind === "added" && !used.has(change)) {
        for (const voiced of change.voiced) lines.push({ text: voiced, changed: true });
      }
    }
    const chapter =
      chapters?.find((entry) => entry.scene === scene) ?? (chapters !== null && chapters.length === scenes.length ? chapters[index] : undefined);
    return {
      scene,
      title: sceneTitle({ classes: job.classes, brief }, scene, chapters),
      start: chapter === undefined ? null : chapter.start,
      lines,
    };
  });
}

/**
 * One line of the making-of log, in a person's words: the runner names a
 * scene by its class (`read the sheet Aw2_ScoringAndScaling`), and the view
 * says its chapter title ("Read the sheet for Scoring and scaling").
 *
 * The job's classes are the list to look for, and any other word shaped like
 * a class too: the runner's first line lists the classes as it sets them,
 * and the view's copy of the record, read on a timer, can still have none.
 */
export function logLine(
  note: string,
  job: Pick<VideoJob, "classes" | "brief">,
  chapters: readonly VideoChapter[] | null = null,
): string {
  let text = note.trim();
  // A prefix of up to four capitals (`prefixFor` in the runner), a number, a CamelCase name.
  const shaped = text.match(/\b[A-Z][A-Za-z]{0,3}\d+_[A-Z][A-Za-z0-9]*\b/g) ?? [];
  const scenes = [...new Set([...job.classes, ...shaped])].sort((a, b) => b.length - a.length);
  for (const scene of scenes) {
    const title = sceneTitle(job, scene, chapters);
    text = text
      .replaceAll(`the sheet ${scene}.sheet`, `the sheet for ${title}`)
      .replaceAll(`the sheet ${scene}`, `the sheet for ${title}`)
      .replaceAll(scene, title);
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The changed lines to list under the player, with their scene's title. */
export function changedLines(
  job: Pick<VideoJob, "classes" | "brief" | "lineChanges">,
  chapters: readonly VideoChapter[] | null = null,
): (LineChange & { title: string })[] {
  return job.lineChanges
    .filter((change) => change.kind !== "unchanged")
    .map((change) => ({ ...change, title: sceneTitle(job, change.scene, chapters) }));
}

/** What a change was, in a word a person reads. */
export function changeWord(kind: LineChange["kind"]): string {
  switch (kind) {
    case "reworded":
      return "Reworded";
    case "split":
      return "Split";
    case "added":
      return "Added";
    case "dropped":
      return "Dropped";
    default:
      return "Unchanged";
  }
}

/* -------------------------------------------------------------------------- */
/* Time and size                                                              */
/* -------------------------------------------------------------------------- */

/** "58 s", "3 min 4 s", "12 min": a video's length, read aloud. */
export function spokenLength(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "";
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole} s`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** `2.1 MB`, `640 kB`. */
export function formatSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} kB`;
}

/* -------------------------------------------------------------------------- */
/* The review                                                                 */
/* -------------------------------------------------------------------------- */

/** The line at the top of a finished job: its length and what the checks found. */
export function readyHeadline(job: VideoJob): string {
  const gate = job.gate;
  const length = spokenLength(gate?.durationSeconds ?? gate?.length?.durationSeconds ?? null);
  const warnings = gate?.warnings.length ?? 0;
  const lead = length === "" ? "The video is ready" : `The video is ready, ${length}`;
  return warnings === 0 ? lead : `${lead}, with ${warnings} warning${warnings === 1 ? "" : "s"}`;
}

/**
 * The gate's warnings once each, with how often each came up: lint repeats a
 * warning per scene ("self.wait() in a narrated file" twice for two scenes),
 * which read as a stutter, and twice the same text was also one React key.
 */
export function uniqueWarnings(warnings: readonly string[]): { text: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const warning of warnings) counts.set(warning, (counts.get(warning) ?? 0) + 1);
  return [...counts.entries()].map(([text, count]) => ({ text, count }));
}

/** The gate's steps in a person's words, in order. */
const GATE_WORDS: Record<string, string> = {
  source: "The scene file",
  lint: "Lint",
  script: "The script and labels",
  topic: "The topic",
  build: "The finished video",
  probe: "The file itself",
  sync: "Narration in sync",
  length: "Length",
  poster: "Poster",
  looked: "Every sheet looked at",
};

export function gateStepLabel(name: string): string {
  return GATE_WORDS[name] ?? sentence(name) ?? name;
}

/**
 * The failure, keyed on the runner's error kind, never on its prose.
 * `actions` is what the panel offers: `resume` continues an interrupted
 * job's session, `talk` goes back to the conversation.
 */
export interface VideoFailure {
  headline: string;
  detail: string | null;
  actions: ("resume" | "talk" | "revise")[];
}

export function videoFailure(job: VideoJob): VideoFailure {
  const detail = job.error;
  switch (job.errorKind) {
    case "agent":
      return { headline: "The agent could not make its first request", detail, actions: [] };
    case "timeout":
      return {
        // The hang timer's length is the runner's setting (STUDIO_VIDEO_HANG_MS), not a constant to repeat here.
        headline: "It stopped: nothing moved for too long",
        detail,
        actions: ["revise", "talk"],
      };
    case "spawn":
      return { headline: "The agent never started", detail, actions: [] };
    case "toolchain":
      // The machine's tools died as they started (V26): a change to the brief
      // cannot help, so there is nothing to revise until the machine is fixed.
      return { headline: "The video tools could not start on this machine", detail, actions: ["talk"] };
    case "cancelled":
      return { headline: "Stopped on request", detail, actions: ["talk"] };
    case "interrupted":
      return { headline: "The runner stopped while this was running", detail: detail ?? "No check ran on what was on disk.", actions: ["resume"] };
    default:
      if (job.state === "interrupted") {
        return { headline: "The runner stopped while this was running", detail: "No check ran on what was on disk.", actions: ["resume"] };
      }
      if (job.state === "cancelled") return { headline: "Stopped on request", detail, actions: ["talk"] };
      return {
        headline: job.gate === null ? "No video was built" : "The checks refused the video",
        detail: job.gate !== null && job.gate.findings.length > 0 ? job.gate.findings.join(" ") : detail,
        actions: ["revise", "talk"],
      };
  }
}

/** The failure in one sentence, for a card: the panel has the rest. */
export function videoFailureLine(job: VideoJob): string {
  return videoFailure(job).headline;
}

/**
 * What the tab's title and a notification say when a video job stops while
 * nobody is looking; the diagram's `announcement` speaks of shapes and lints.
 */
export function videoAnnouncement(job: VideoJob): { title: string; body: string } | null {
  const name = job.title ?? job.jobId.slice(0, 8);
  switch (job.state) {
    case "awaiting_review":
      return { title: `✓ ${name}: ready to review`, body: readyHeadline(job) };
    case "failed":
      return { title: `✕ ${name}: failed`, body: videoFailureLine(job) };
    case "cancelled":
      return { title: `✕ ${name}: cancelled`, body: job.note };
    case "interrupted":
      return { title: `✕ ${name}: interrupted`, body: job.note };
    default:
      return null;
  }
}

/**
 * The newest job that continues this one (a revise or a resume names it as
 * `parentJob`), so a job whose change was queued links to it, even when the
 * reply to the press that queued it was lost. The list arrives newest first.
 */
export function childJob(jobs: readonly { kind?: string }[], jobId: string): VideoJob | null {
  for (const entry of jobs) {
    const job = asVideoJob(entry);
    if (job !== null && job.parentJob === jobId) return job;
  }
  return null;
}

/** The longest change request the runner takes. */
export const CHANGE_LIMIT = 2_000;

/** Why a change request cannot be sent as it is, or null. */
export function changeProblem(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return "Say what should change.";
  if (trimmed.length > CHANGE_LIMIT) return `At most ${CHANGE_LIMIT.toLocaleString("en")} characters; this is ${trimmed.length.toLocaleString("en")}.`;
  return null;
}

/**
 * The line under the Change box: what each send does, before it is pressed.
 * Change the picture revises the job from the agent's own source, and on a
 * job in review sets the reviewed video aside in the same step (D52); Change
 * what is said, offered only with a conversation, goes back to it.
 */
export function changeHint(reviewing: boolean, canTalk: boolean): string {
  const picture = reviewing
    ? "This video is set aside, and the agent reworks the picture from the source it wrote."
    : "The agent reworks the picture from the source it wrote.";
  return canTalk ? `${picture} Changing the words goes back to the conversation, where you approve the new script first.` : picture;
}

/** Which of Accept, Discard and Change a job offers. */
export function reviewActions(job: VideoJob): { accept: boolean; discard: boolean; change: boolean } {
  const reviewing = job.state === "awaiting_review";
  return { accept: reviewing, discard: reviewing, change: reviewing || job.state === "accepted" };
}

/* -------------------------------------------------------------------------- */
/* The grid                                                                   */
/* -------------------------------------------------------------------------- */

export type VideoTileStage = "working" | "review" | "failed";

export function videoTileStage(job: VideoJob): VideoTileStage {
  if (job.state === "awaiting_review") return "review";
  if (job.state === "failed" || job.state === "interrupted") return "failed";
  return "working";
}

/** The grid's rule, as for diagrams: live jobs always, a failure only in the tab that saw it and until dismissed. */
export function videoShownOnGrid(job: VideoJob, ended: readonly string[], dismissed: readonly string[]): boolean {
  if (isActive(job.state)) return true;
  if (job.state === "failed" || job.state === "interrupted") return ended.includes(job.jobId) && !dismissed.includes(job.jobId);
  return false;
}

/**
 * The video jobs making a video the grid has no tile for, newest first, one
 * per target: a retry on a slug replaces its failed card.
 */
export function newVideoJobs(
  jobs: readonly { kind?: string }[],
  existingSlugs: ReadonlySet<string>,
  ended: readonly string[],
  dismissed: readonly string[],
): VideoJob[] {
  const seen = new Set<string>();
  const out: VideoJob[] = [];
  for (const job of jobs) {
    if (!isVideoJob(job)) continue;
    if (existingSlugs.has(job.slug) || seen.has(job.target)) continue;
    seen.add(job.target);
    if (videoShownOnGrid(job, ended, dismissed)) out.push(job);
  }
  return out;
}

/** The newest video job on a landed video's slug (a change), when the grid shows it. */
export function videoJobForSlug(
  jobs: readonly { kind?: string }[],
  slug: string,
  ended: readonly string[],
  dismissed: readonly string[],
): VideoJob | null {
  const newest = jobs.find((job): job is VideoJob => isVideoJob(job) && job.slug === slug);
  return newest !== undefined && videoShownOnGrid(newest, ended, dismissed) ? newest : null;
}

/**
 * Read `GET /api/videos` defensively, in the planned shape or the catalog's,
 * keeping only studio videos. Anything malformed is dropped, never thrown.
 */
export function readVideos(body: unknown): StudioVideo[] {
  const list = (body as { videos?: unknown } | null)?.videos;
  if (!Array.isArray(list)) return [];
  const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
  return list.flatMap((entry): StudioVideo[] => {
    if (entry === null || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    // The catalog's shape carries manimkc renders too, which have no slug.
    if (raw.origin !== undefined && raw.origin !== "studio") return [];
    const slug = text(raw.slug);
    if (slug === null) return [];
    const poster = raw.poster as { assetId?: unknown } | null | undefined;
    const posterAssetId =
      typeof raw.posterAssetId === "string"
        ? text(raw.posterAssetId)
        : raw.posterAssetId === null
          ? null
          : poster !== null && typeof poster === "object"
            ? (text(raw.assetId) ?? `video:${slug}`)
            : poster === null
              ? null
              : `video:${slug}`;
    return [
      {
        slug,
        title: text(raw.title),
        topic: text(raw.topic),
        posterAssetId,
        durationSeconds: typeof raw.durationSeconds === "number" ? raw.durationSeconds : null,
        updated: text(raw.updated) ?? text(raw.updatedAt) ?? "",
      },
    ];
  });
}

/** The studio videos a filter keeps: the same topic chips and search the diagrams obey. */
export function filterVideos(videos: readonly StudioVideo[], view: { topics: readonly string[]; query: string }): StudioVideo[] {
  const query = view.query.trim().toLowerCase();
  return videos.filter((video) => {
    if (view.topics.length > 0 && !view.topics.includes(video.topic ?? "none")) return false;
    if (query === "") return true;
    return [video.title ?? "", video.slug, video.topic ?? ""].some((field) => field.toLowerCase().includes(query));
  });
}

/**
 * The grid's order, by the view's Sort as the diagrams are: title, or the
 * last write for both Modified and Created (a video row has no creation
 * time). Undated videos go last whichever way the arrow points.
 */
export function sortVideos(
  videos: readonly StudioVideo[],
  view: { sort: "modified" | "title" | "created"; direction: "asc" | "desc" } = { sort: "modified", direction: "desc" },
): StudioVideo[] {
  const sign = view.direction === "asc" ? 1 : -1;
  const titleOf = (video: StudioVideo): string => video.title ?? video.slug;
  return [...videos].sort((a, b) => {
    if (view.sort === "title") return sign * titleOf(a).localeCompare(titleOf(b));
    const at = Date.parse(a.updated);
    const bt = Date.parse(b.updated);
    if (!Number.isFinite(at) && !Number.isFinite(bt)) return 0;
    if (!Number.isFinite(at)) return 1;
    if (!Number.isFinite(bt)) return -1;
    return sign * (at - bt);
  });
}

/**
 * Which of the grid's groups a video sits in, keyed as `groupDiagrams` keys
 * them: `all` with no grouping, else its topic or its topic's domain, `none`
 * when it has neither.
 */
export function videoGroupKey(
  video: Pick<StudioVideo, "topic">,
  group: "none" | "topic" | "domain",
  domains: ReadonlyMap<string, string> = new Map(),
): string {
  if (group === "none") return "all";
  if (video.topic === null) return "none";
  if (group === "topic") return video.topic;
  return domains.get(video.topic) ?? "none";
}

/** One section of the grid: a group's diagrams and its studio videos together. */
export interface GridSection<D> {
  key: string;
  label: string;
  diagrams: D[];
  videos: StudioVideo[];
}

/**
 * The grid's sections, diagrams and videos in the same groups: with no
 * grouping one section; by topic or domain one per key either kind has,
 * ordered as `groupDiagrams` orders them (by label, the no-topic section
 * last), so a topic with only videos takes its place among the rest rather
 * than jumping the queue. `videos` arrive already sorted.
 */
export function gridSections<D>(
  diagramGroups: readonly { key: string; label: string; items: D[] }[],
  videos: readonly StudioVideo[],
  group: "none" | "topic" | "domain",
  titles: ReadonlyMap<string, string> = new Map(),
  domains: ReadonlyMap<string, string> = new Map(),
): GridSection<D>[] {
  const sections = new Map<string, GridSection<D>>();
  for (const entry of diagramGroups) sections.set(entry.key, { key: entry.key, label: entry.label, diagrams: [...entry.items], videos: [] });
  for (const video of videos) {
    const key = videoGroupKey(video, group, domains);
    const held = sections.get(key);
    if (held !== undefined) {
      held.videos.push(video);
      continue;
    }
    const label =
      key === "all" ? "" : key === "none" ? (group === "topic" ? "No topic" : "No domain") : group === "topic" ? (titles.get(key) ?? key) : key;
    sections.set(key, { key, label, diagrams: [], videos: [video] });
  }
  const list = [...sections.values()];
  if (group === "none") return list;
  return list.sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.label.localeCompare(b.label)));
}

/** One tile in a section: a diagram or a studio video. */
export type SectionItem<D> = { kind: "diagram"; item: D } | { kind: "video"; item: StudioVideo };

/**
 * A section's diagrams and videos as one list, in the view's Sort.
 *
 * Rendering the two lists one after the other put every video ahead of every
 * diagram whatever Sort said, so a new sort changed nothing in the first row
 * and read as a control that does nothing. `keyOf` gives a diagram's title and
 * the time Sort compares (its modified or created time); a video's is its
 * title and its last write, as `sortVideos` has it. Undated goes last whichever
 * way the arrow points, and ties keep the order they came in.
 */
export function sectionItems<D>(
  section: Pick<GridSection<D>, "diagrams" | "videos">,
  view: { sort: "modified" | "title" | "created"; direction: "asc" | "desc" },
  keyOf: (diagram: D) => { title: string; time: string | null },
): SectionItem<D>[] {
  const sign = view.direction === "asc" ? 1 : -1;
  const keyed = [
    ...section.videos.map((video) => ({
      entry: { kind: "video", item: video } as SectionItem<D>,
      title: video.title ?? video.slug,
      time: Date.parse(video.updated),
    })),
    ...section.diagrams.map((diagram) => {
      const { title, time } = keyOf(diagram);
      return { entry: { kind: "diagram", item: diagram } as SectionItem<D>, title, time: time === null ? NaN : Date.parse(time) };
    }),
  ];
  keyed.sort((a, b) => {
    if (view.sort === "title") return sign * a.title.localeCompare(b.title);
    const aDated = Number.isFinite(a.time);
    const bDated = Number.isFinite(b.time);
    if (!aDated && !bDated) return 0;
    if (!aDated) return 1;
    if (!bDated) return -1;
    return sign * (a.time - b.time);
  });
  return keyed.map(({ entry }) => entry);
}

/**
 * What a tile's Change got back from `POST /api/drafts` with `sourceKind:
 * "video"`: the conversation to open, or why none opened. Only a draft the
 * runner names, and does not say is about anything but a video, is success.
 * A refusal (a 404 for a slug read as a diagram's, by a runner that predates
 * `sourceKind`) is said, never treated as a conversation.
 */
export function changeDraftOutcome(
  result:
    | { ok: true; data: { draftId?: unknown; sourceKind?: unknown; kind?: unknown } }
    | { ok: false; status: number; refusal: { error: string; detail?: unknown } },
): { draftId: string } | { problem: string } {
  if (!result.ok) {
    // The runner's reasons (step 2a): `no-video` for a slug it holds no
    // studio video for, `kind-not-in-conversation` for a build without video.
    const detail = result.refusal.detail;
    const reason = typeof detail === "object" && detail !== null ? (detail as { reason?: unknown }).reason : undefined;
    if (reason === "no-video") return { problem: "This video is no longer in the catalog, so there is nothing to change." };
    if (reason === "kind-not-in-conversation") return { problem: "This studio cannot make videos in a conversation yet." };
    return {
      problem:
        result.status === 404
          ? `The runner found nothing to change: ${result.refusal.error}`
          : `A conversation could not start: ${result.refusal.error}`,
    };
  }
  const draftId = typeof result.data.draftId === "string" && result.data.draftId !== "" ? result.data.draftId : null;
  if (draftId === null) return { problem: "A conversation could not start: the runner named no conversation." };
  const kind = result.data.sourceKind ?? result.data.kind;
  if (typeof kind === "string" && kind !== "video") {
    return { problem: "The runner opened a conversation about a diagram, not this video. It may predate studio videos." };
  }
  return { draftId };
}

/**
 * What one read of `GET /api/jobs/{id}` says, for `JobPanel`, which reads a
 * job the provider does not list: the job, a 404 (the runner does not have
 * it, a real answer), or a failure (nothing listening, a 5xx, a body that is
 * not a job), which says nothing about the job and is retried. Only a 404
 * may become "the runner does not have this job".
 */
export type JobLookup =
  | { kind: "found"; body: { kind?: string; jobId?: string } & Record<string, unknown> }
  | { kind: "missing" }
  | { kind: "failed"; reason: string };

export function readJobLookup(answer: { status: number; body: unknown } | { error: string }): JobLookup {
  if ("error" in answer) return { kind: "failed", reason: `the runner did not answer (${answer.error})` };
  if (answer.status === 404) return { kind: "missing" };
  if (answer.status < 200 || answer.status >= 300) return { kind: "failed", reason: `the runner answered ${answer.status}` };
  const body = answer.body;
  if (body === null || typeof body !== "object" || typeof (body as { jobId?: unknown }).jobId !== "string") {
    return { kind: "failed", reason: "the runner's answer was not a job" };
  }
  return { kind: "found", body: body as { kind?: string; jobId?: string } & Record<string, unknown> };
}
