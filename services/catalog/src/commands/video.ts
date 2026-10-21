import path from "node:path";
import { parseArgs } from "node:util";

import { AUTHOR_KINDS, type AuthorKind, LOCAL_LEARNER_ID, ownerScope } from "@gnosia/schema";

import { openBlobStore } from "../content/blob";
import { CLI_OWNER } from "../content/scope";
import { findFfmpeg } from "../poster/extract";
import {
  checkoutVideo,
  COPIES_FILE,
  listVideos,
  putVideo,
  showVideo,
  VideoError,
  type PutVideoResult,
  type VideoCheckoutResult,
  type VideoDetail,
  type VideoSummary,
} from "../content/videos";
import { withDatabase } from "../db";
import { assertMigrated } from "../migrations";

/**
 * `catalog video <verb>`: studio videos in the database (docs/STUDIO-VIDEOS.md,
 * "Accept", D49). Its own argument parser, as `catalog diagram` has, because
 * its flags mean nothing to any other command.
 */

export const VIDEO_USAGE = `catalog video — studio videos in the database

Usage: npm run --silent catalog -- video <verb> [options] [--json]

Verbs:
  put --job ID --slug S --dir CANDIDATE --reason TEXT [--base N|none]
      Accept a studio video job: store the cut, its sidecars (narrated only)
      and its poster as blobs, each held to the hash the gate recorded in
      CANDIDATE/${COPIES_FILE}; the source (CANDIDATE/source/*.py and
      topic.yml) and the job's brief as the video row; the asset rows under
      video:S and poster:video:S; and the job's move to accepted, in one
      transaction. A repeat for the same job with the same source and files
      returns what landed and writes nothing. Without --base the write goes on
      top of whatever is latest.
  list    Every live studio video and every manimkc render this owner may
          read.
  show SLUG
          One studio video: its summary, its brief, its source files' names.
  checkout SLUG --dir DIR [--force]
          Write the stored source files into DIR, which is where a change
          job's scene starts. A file already there with other contents is
          left alone unless --force.

Options:
  --owner ID             Whose videos: every verb reads only what this owner
                         may read (their own and the commons') and writes as
                         them; put lands only this owner's job. Default:
                         ${CLI_OWNER}. The studio passes the owner its runner
                         serves.
  --author NAME          Who is writing. Default: ${LOCAL_LEARNER_ID}.
  --author-kind KIND     ${AUTHOR_KINDS.join(" | ")}. Default: person.

Exit codes: 0 ok, 1 refused or failed, 2 wrong invocation, 3 database
unreachable, 4 migrations outstanding (the same as every catalog command).`;

export class VideoUsage extends Error {}

export type VideoCommandResult =
  | PutVideoResult
  | VideoCheckoutResult
  | { ok: true; videos: VideoSummary[] }
  | { ok: true; video: VideoDetail | null };

export interface ParsedVideo {
  verb: "put" | "list" | "show" | "checkout";
  json: boolean;
  run: () => Promise<VideoCommandResult>;
}

function one(values: string[] | undefined, flag: string, required: boolean): string | undefined {
  if (values === undefined || values.length === 0) {
    if (required) throw new VideoUsage(`${flag} is required`);
    return undefined;
  }
  if (values.length > 1) throw new VideoUsage(`${flag} takes one value`);
  const value = values[0] as string;
  if (value.trim() === "") throw new VideoUsage(`${flag} cannot be empty`);
  return value;
}

/** Parse `video ...` into a runnable command. Throws `VideoUsage` on a wrong invocation. */
export function parseVideo(argv: string[]): ParsedVideo {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: "boolean", default: false },
      slug: { type: "string", multiple: true },
      dir: { type: "string", multiple: true },
      job: { type: "string", multiple: true },
      base: { type: "string", multiple: true },
      reason: { type: "string", multiple: true },
      force: { type: "boolean", default: false },
      author: { type: "string", multiple: true },
      "author-kind": { type: "string", multiple: true },
      owner: { type: "string", multiple: true },
    },
  });
  const verb = positionals[0];
  const owner = (one(values.owner, "--owner", false) ?? CLI_OWNER).trim();
  const scope = ownerScope(owner);
  const json = values.json;
  const slugArg = (): string => {
    const slug = positionals[1];
    if (slug === undefined || slug.trim() === "") throw new VideoUsage(`video ${verb} needs a slug`);
    if (positionals.length > 2) throw new VideoUsage(`video ${verb} takes one slug`);
    return slug.trim();
  };
  const noPositionals = () => {
    if (positionals.length > 1) throw new VideoUsage(`video ${verb} takes no positional arguments`);
  };

  switch (verb) {
    case "put": {
      noPositionals();
      const slug = one(values.slug, "--slug", true) as string;
      const dir = path.resolve(one(values.dir, "--dir", true) as string);
      const jobId = one(values.job, "--job", true) as string;
      const reason = one(values.reason, "--reason", true) as string;
      const author = one(values.author, "--author", false) ?? LOCAL_LEARNER_ID;
      const kind = one(values["author-kind"], "--author-kind", false) ?? "person";
      if (!(AUTHOR_KINDS as readonly string[]).includes(kind)) {
        throw new VideoUsage(`--author-kind must be one of ${AUTHOR_KINDS.join(", ")}, not "${kind}"`);
      }
      const rawBase = one(values.base, "--base", false);
      let base: number | null | undefined;
      if (rawBase === undefined) base = undefined;
      else if (rawBase === "none") base = null;
      else if (/^[1-9]\d*$/.test(rawBase)) base = Number(rawBase);
      else throw new VideoUsage(`--base is a revision id or "none", not "${rawBase}"`);
      return {
        verb,
        json,
        run: () =>
          withDatabase(async ({ db }) => {
            await assertMigrated(db);
            return putVideo(db, openBlobStore(), {
              slug: slug.trim(),
              dir,
              jobId: jobId.trim(),
              ...(base === undefined ? {} : { base }),
              reason,
              author,
              authorKind: kind as AuthorKind,
              ownerId: owner,
              ffmpeg: await findFfmpeg(),
            });
          }),
      };
    }
    case "list":
      noPositionals();
      return {
        verb,
        json,
        run: () =>
          withDatabase(async ({ db }) => {
            await assertMigrated(db);
            return { ok: true as const, videos: await listVideos(db, scope) };
          }),
      };
    case "show": {
      const slug = slugArg();
      return {
        verb,
        json,
        run: () =>
          withDatabase(async ({ db }) => {
            await assertMigrated(db);
            return { ok: true as const, video: await showVideo(db, scope, slug) };
          }),
      };
    }
    case "checkout": {
      const slug = slugArg();
      const dir = path.resolve(one(values.dir, "--dir", true) as string);
      return {
        verb,
        json,
        run: () =>
          withDatabase(async ({ db }) => {
            await assertMigrated(db);
            return checkoutVideo(db, scope, slug, dir, { force: values.force });
          }),
      };
    }
    default:
      throw new VideoUsage(`usage: video put|list|show|checkout (got ${verb === undefined ? "nothing" : `"${verb}"`})`);
  }
}

const duration = (seconds: number | null) => (seconds === null ? "?" : `${Math.round(seconds)} s`);

export function formatVideo(verb: ParsedVideo["verb"], result: VideoCommandResult): string {
  if ("videos" in result) {
    if (result.videos.length === 0) return "no videos in the database";
    return result.videos
      .map((v) => `${v.origin.padEnd(7)} ${v.slug ?? v.assetId}  ${v.topic ?? "-"}  ${duration(v.durationSeconds)}  ${v.title ?? ""}`)
      .join("\n");
  }
  if ("video" in result) {
    const v = result.video;
    if (v === null) return "no such studio video";
    return [
      `${v.slug}  ${v.title ?? "(untitled)"}`,
      `  topic     ${v.topic}`,
      `  concepts  ${v.concepts.join(", ") || "(none)"}`,
      `  length    ${duration(v.durationSeconds)}${v.narrated ? ", narrated" : ", silent"}`,
      `  cut       ${v.mp4 === null ? "none" : `${v.mp4.key} (${v.mp4.bytes} bytes)`}`,
      `  source    ${v.files.map((f) => f.name).join(", ")}  ${v.sourceHash}`,
      `  revision  ${v.revision ?? "none"}${v.revisionJob === null ? "" : ` by job ${v.revisionJob}`}`,
    ].join("\n");
  }
  if ("exists" in result) {
    if (!result.exists) return `${result.slug} is not a studio video this owner can read: nothing was written`;
    return [
      `${result.written ? "checked out" : "already checked out"} ${result.slug} at revision ${result.revision ?? "none"}`,
      ...result.files.map((f) => `  ${f.path}`),
    ].join("\n");
  }
  const put = result;
  const lines = [
    `${put.retry ? "already landed" : put.changed ? "stored" : "unchanged"} ${put.slug} at revision ${put.revision}; job ${put.job} ${put.jobState}`,
    `  topic     ${put.topic}`,
    `  concepts  ${put.concepts.join(", ") || "(none)"}`,
    `  length    ${duration(put.durationSeconds)}${put.narrated ? ", narrated" : ", silent"}`,
    ...put.assets.map((a) => `  + ${a.id}  ${a.key}${a.uploaded ? "" : " (already stored)"}`),
  ];
  for (const note of put.notes) lines.push(`  note      ${note}`);
  return lines.join("\n");
}

/** The whole command, for `cli.ts`: parse, run, print. */
export async function runVideoCommand(
  argv: string[],
  io: { stdout: (s: string) => void; stderr: (s: string) => void },
): Promise<{ code: number } | { error: unknown; json: boolean }> {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    (argv.length === 0 ? io.stderr : io.stdout)(`${VIDEO_USAGE}\n`);
    return { code: argv.length === 0 ? 2 : 0 };
  }
  let parsed: ParsedVideo;
  try {
    parsed = parseVideo(argv);
  } catch (error) {
    if (error instanceof VideoUsage || (error as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")) {
      io.stderr(`${(error as Error).message}\n\n${VIDEO_USAGE}\n`);
      return { code: 2 };
    }
    throw error;
  }
  try {
    const result = await parsed.run();
    io.stdout(parsed.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatVideo(parsed.verb, result)}\n`);
    return { code: 0 };
  } catch (error) {
    if (error instanceof VideoError) {
      if (parsed.json) io.stdout(`${JSON.stringify({ ok: false, code: error.code, error: error.message }, null, 2)}\n`);
      io.stderr(`catalog video ${parsed.verb}: ${error.message}\n`);
      return { code: 1 };
    }
    return { error, json: parsed.json };
  }
}
