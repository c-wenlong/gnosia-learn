import { BriefError, SLUG_PATTERN, type Vocabulary } from "../brief";
import { VOICES } from "./voices";

/**
 * The video brief, and the refusals made before anything is spent
 * (docs/STUDIO-VIDEOS.md, "The video brief").
 *
 * A brief is the script: every word the voice starts from, approved by a
 * person before the press (D48). What the agent decides is everything on
 * screen, and it may still reword a line, which the gate records and the
 * review shows (D47).
 *
 * The same stance as the diagram brief: the person is not the threat, text
 * pasted from somewhere else is. So every free-text field is capped, every
 * name is pattern-checked, and a `say` line cannot carry the characters that
 * would end the `voiceover("...")` literal it becomes.
 */

export const VIDEO_MODES = ["new", "change"] as const;
export type VideoMode = (typeof VIDEO_MODES)[number];

export const AUDIENCES = ["new", "familiar", "expert"] as const;
export type Audience = (typeof AUDIENCES)[number];

/** The voice value for a video with no narration. */
export const SILENT = "none";

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
  mode: VideoMode;
  idea: string;
  audience: Audience;
  targetSeconds: number;
  voice: string;
  scenes: VideoScene[];
  concepts: string[];
  source?: string;
}

export interface ValidVideoBrief extends VideoBrief {
  idempotencyKey: string;
}

/** Speech rate, measured across the 29 kokoro builds in manimkc's timing log (median, characters a second). */
export const CHARS_PER_SECOND = 15.2;
/** The finished video over the speech: 1.03 to 1.15 measured, 1.08 taken. */
export const VIDEO_OVER_SPEECH = 1.08;
/** How far the script's prediction may sit from the target. */
export const LENGTH_TOLERANCE = 0.2;

export function isNarrated(brief: Pick<VideoBrief, "voice">): boolean {
  return brief.voice !== SILENT;
}

/** The script's own prediction of the video's length, in seconds. */
export function predictedSeconds(brief: Pick<VideoBrief, "voice" | "scenes">): number {
  if (!isNarrated(brief)) {
    return brief.scenes.reduce((sum, scene) => sum + scene.beats.reduce((s, beat) => s + (beat.seconds ?? 0), 0), 0);
  }
  return secondsForLines(brief.scenes.flatMap((scene) => scene.beats.map((beat) => beat.say)));
}

/** Seconds of video the given narration lines predict. */
export function secondsForLines(lines: readonly string[]): number {
  const characters = lines.reduce((sum, line) => sum + line.length, 0);
  return (characters / CHARS_PER_SECOND) * VIDEO_OVER_SPEECH;
}

/** Lower-case words joined by underscores: a scene's name, which becomes one class and one chapter. */
export const SCENE_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BriefError(field, `"${field}" is required and must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new BriefError(field, `"${field}" is ${trimmed.length} characters; it must be ${min} to ${max}`);
  }
  // Control characters have no place in a line a voice reads or a label a
  // screen shows, and a newline in one would reach the agent's prompt as a
  // line of its own.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new BriefError(field, `"${field}" holds a control character or a line break; write it as one line`);
  }
  return trimmed;
}

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new BriefError(field, `"${field}" must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

/**
 * Validate a posted video brief, or refuse it with the field named.
 *
 * Checks the shape and the vocabulary. Whether a `new` slug is free and a
 * `change` slug exists is the catalog's answer, asked by the runner at
 * enqueue.
 */
export function validateVideoBrief(input: unknown, vocabulary: Vocabulary): ValidVideoBrief {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BriefError("body", "the request body must be a JSON object holding a video brief");
  }
  const raw = input as Record<string, unknown>;

  const title = text(raw.title, "title", 3, 120);
  if (/["\\]/.test(title)) {
    throw new BriefError("title", `"title" cannot hold a straight double quote or a backslash; typographic quotes are fine`);
  }
  const topic = text(raw.topic, "topic", 1, 120);
  const known = vocabulary.topics.get(topic);
  if (!SLUG_PATTERN.test(topic) || known === undefined) {
    throw new BriefError("topic", `no topic "${topic}" in the catalog's vocabulary`);
  }
  const slug = text(raw.slug, "slug", 3, 60);
  if (!SLUG_PATTERN.test(slug)) {
    throw new BriefError("slug", `"${slug}" is not a slug: lower-case words joined by single hyphens`);
  }
  const mode = oneOf(raw.mode, "mode", VIDEO_MODES);
  const idea = text(raw.idea, "idea", 1, 300);
  const audience = oneOf(raw.audience, "audience", AUDIENCES);
  if (typeof raw.targetSeconds !== "number" || !Number.isInteger(raw.targetSeconds) || raw.targetSeconds < 60 || raw.targetSeconds > 600) {
    throw new BriefError("targetSeconds", `"targetSeconds" must be a whole number from 60 to 600`);
  }
  const targetSeconds = raw.targetSeconds;
  const voice = typeof raw.voice === "string" ? raw.voice : "";
  if (voice !== SILENT && !VOICES.some((entry) => entry.id === voice)) {
    throw new BriefError("voice", `"voice" must be a kokoro voice (${VOICES.map((entry) => entry.id).join(", ")}) or "none"`);
  }
  const silent = voice === SILENT;

  if (!Array.isArray(raw.scenes) || raw.scenes.length < 2 || raw.scenes.length > 8) {
    throw new BriefError("scenes", `"scenes" must hold 2 to 8 scenes`);
  }
  const names = new Set<string>();
  let beatCount = 0;
  const scenes: VideoScene[] = raw.scenes.map((sceneRaw, i) => {
    if (typeof sceneRaw !== "object" || sceneRaw === null) throw new BriefError(`scenes[${i}]`, `scene ${i} must be an object`);
    const scene = sceneRaw as Record<string, unknown>;
    const name = typeof scene.name === "string" ? scene.name : "";
    if (!SCENE_NAME.test(name) || name.length >= 30) {
      throw new BriefError(`scenes[${i}].name`, `a scene's name is lower-case words joined by underscores, under 30 characters`);
    }
    if (names.has(name)) throw new BriefError(`scenes[${i}].name`, `two scenes are called "${name}"`);
    names.add(name);
    if (!Array.isArray(scene.beats) || scene.beats.length < 1 || scene.beats.length > 6) {
      throw new BriefError(`scenes[${i}].beats`, `a scene holds 1 to 6 beats`);
    }
    const beats: VideoBeat[] = scene.beats.map((beatRaw, j) => {
      const at = `scenes[${i}].beats[${j}]`;
      if (typeof beatRaw !== "object" || beatRaw === null) throw new BriefError(at, `beat ${j} must be an object`);
      const beat = beatRaw as Record<string, unknown>;
      const say = text(beat.say, `${at}.say`, 1, 600);
      if (/[{}\\"]/.test(say)) {
        throw new BriefError(
          `${at}.say`,
          `a line cannot hold {, }, a backslash or a straight double quote: it becomes a double-quoted voiceover literal, which the narration step reads with a pattern. Typographic quotes are fine.`,
        );
      }
      const show = text(beat.show, `${at}.show`, 1, 300);
      if (!Array.isArray(beat.labels) || beat.labels.length > 4) {
        throw new BriefError(`${at}.labels`, `"labels" is a list of at most four words that must be on screen`);
      }
      const labels = beat.labels.map((label, k) => {
        const value = text(label, `${at}.labels[${k}]`, 1, 39);
        if (/["\\]/.test(value)) throw new BriefError(`${at}.labels[${k}]`, `a label cannot hold a straight double quote or a backslash`);
        return value;
      });
      if (silent) {
        if (typeof beat.seconds !== "number" || beat.seconds < 3 || beat.seconds > 8) {
          throw new BriefError(`${at}.seconds`, `a silent beat holds for 3 to 8 seconds`);
        }
        return { say, show, labels, seconds: beat.seconds };
      }
      if (beat.seconds !== undefined) {
        throw new BriefError(`${at}.seconds`, `"seconds" is for a silent video; a narrated beat lasts as long as its line`);
      }
      return { say, show, labels };
    });
    beatCount += beats.length;
    return { name, beats };
  });
  if (beatCount > 40) throw new BriefError("scenes", `a brief holds at most 40 beats in all; this one has ${beatCount}`);

  const concepts = Array.isArray(raw.concepts) ? raw.concepts : [];
  const conceptList = concepts.map((value, i) => {
    if (typeof value !== "string" || !SLUG_PATTERN.test(value)) throw new BriefError(`concepts[${i}]`, `a concept is a slug`);
    if (!known.concepts.includes(value)) {
      throw new BriefError("concepts", `"${value}" is not filed under topic "${topic}"`);
    }
    return value;
  });

  const source = raw.source === undefined || raw.source === null || raw.source === "" ? undefined : text(raw.source, "source", 1, 120);
  if (source !== undefined && !SLUG_PATTERN.test(source)) {
    throw new BriefError("source", `"source" names a concept by its slug`);
  }

  const brief: VideoBrief = {
    title,
    topic,
    slug,
    mode,
    idea,
    audience,
    targetSeconds,
    voice,
    scenes,
    concepts: conceptList,
    ...(source === undefined ? {} : { source }),
  };

  const predicted = predictedSeconds(brief);
  if (Math.abs(predicted - targetSeconds) > targetSeconds * LENGTH_TOLERANCE) {
    if (silent) {
      throw new BriefError(
        "targetSeconds",
        `the beats hold for ${Math.round(predicted)} seconds in all and the target is ${targetSeconds}; they must be within a fifth of it`,
      );
    }
    const characters = brief.scenes.reduce((sum, scene) => sum + scene.beats.reduce((s, beat) => s + beat.say.length, 0), 0);
    const want = Math.round((targetSeconds / VIDEO_OVER_SPEECH) * CHARS_PER_SECOND);
    throw new BriefError(
      "targetSeconds",
      `the lines total ${characters} characters, about ${Math.round(predicted)} seconds; the target is ${targetSeconds}, so ` +
        `${characters < want ? "add" : "cut"} about ${Math.abs(want - characters)} characters or set targetSeconds to ${Math.round(predicted)}`,
    );
  }

  const key = typeof raw.idempotencyKey === "string" && raw.idempotencyKey.trim() !== "" ? text(raw.idempotencyKey, "idempotencyKey", 1, 200) : null;
  return { ...brief, idempotencyKey: key ?? `studio-video:${topic}:${slug}:${Date.now()}` };
}
