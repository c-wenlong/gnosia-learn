import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { key as blobKey, type BlobStore } from "@self-learn/blob";
import {
  assetJob,
  canonicalJson,
  concept,
  job as jobTable,
  readableOwners,
  topic,
  video,
  type AuthorKind,
  type Job,
  type OwnerScope,
} from "@self-learn/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { acceptJobIn, VIDEOS_DIR, VIDEO_SLUG } from "../commands/job";
import type { CatalogDatabase } from "../db";
import { fileFacts } from "../index/files";
import { ASSET_PREFIX } from "../index/source";
import { POSTER_CONTENT_TYPE } from "../poster/recipe";
import { POSTER_PREFIX } from "./asset-upload";
import { uploadBlob } from "./blob";
import { sha256 } from "./diagram-document";
import { latestRevisions, lockEntity } from "./revisions";
import { andOwnedBy } from "./scope";
import { ContentWriteError, deleteContent, writeContents, type WriteContentInput, type WriteContentResult } from "./write";

/**
 * Studio videos in the database (docs/STUDIO-VIDEOS.md, "Accept", D49).
 *
 * A studio video is a `video` row and up to five `asset` rows, the way a
 * diagram is a `diagram` row and two: the row holds the source (the scene
 * files and `topic.yml`) and the brief it was made from, and the assets are
 * the cut, its three sidecars and its poster, each a blob. The asset ids live
 * under `video:` and `poster:video:`, a namespace no importer prunes. The
 * `manimkc:` one is deliberately not used: `catalog import --only manimkc`
 * deletes every `manimkc:` asset its report does not list, and a studio video
 * has no folder in manimkc's `topics/` for the report to find (edge case V16).
 *
 * **Accept is one transaction.** `putVideo` uploads the blobs first, each
 * checked against the hash the studio's gate recorded, and then writes the
 * rows, the `asset_job` provenance and the job's move to `accepted` together.
 * A failure anywhere in that transaction leaves the job in review and no row
 * pointing at the bytes; the blobs it stored are content-addressed and are
 * either reused by the retry or swept as unreferenced.
 */

/** The studio's namespace for a video's asset ids (not an import source, so nothing prunes it). */
export const VIDEO_PREFIX = "video:";

export class VideoError extends Error {
  constructor(
    readonly code: "bad-slug" | "unreadable" | "job" | "stale-base" | "mismatch" | "unresolved" | "dirty-checkout",
    message: string,
  ) {
    super(message);
    this.name = "VideoError";
  }
}

export function assertVideoSlug(slug: string): void {
  if (!VIDEO_SLUG.test(slug)) {
    throw new VideoError(
      "bad-slug",
      `"${slug}" is not a video slug: lowercase letters and digits in hyphen-separated words, 3 to 60 characters.`,
    );
  }
}

/** The asset ids a studio video's files land under. */
export function videoAssetIds(slug: string) {
  const video = `${VIDEO_PREFIX}${slug}`;
  return {
    video,
    transcript: `${VIDEO_PREFIX}${slug}.transcript.json`,
    chapters: `${VIDEO_PREFIX}${slug}.chapters.json`,
    captions: `${VIDEO_PREFIX}${slug}.vtt`,
    poster: `${POSTER_PREFIX}${video}`,
  };
}

/** The logical names the rows carry as `path`: `videos/<slug>.mp4` and its sidecars. No file is there. */
export function videoPaths(slug: string) {
  return {
    mp4: `${VIDEOS_DIR}/${slug}.mp4`,
    transcript: `${VIDEOS_DIR}/${slug}.transcript.json`,
    chapters: `${VIDEOS_DIR}/${slug}.chapters.json`,
    captions: `${VIDEOS_DIR}/${slug}.vtt`,
  };
}

/** The file names the gate leaves in the job's `candidate/`. */
export function candidateFiles(slug: string) {
  return {
    mp4: `${slug}.mp4`,
    transcript: `${slug}.transcript.json`,
    chapters: `${slug}.chapters.json`,
    captions: `${slug}.vtt`,
    poster: "poster.jpg",
  };
}

/** The file the gate writes beside its copies: what each copy's hash was when it was taken, and the duration. */
export const COPIES_FILE = "copies.json";

/** A source file's name: one path segment, a scene file or the topic file. */
const SOURCE_NAME = /^(?:[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}\.py|topic\.yml)$/;
const SOURCE_BYTES_MAX = 512 * 1024;
const SOURCE_FILES_MAX = 20;

/** `video.source`: what a change job starts from. */
export interface VideoSource {
  files: Record<string, string>;
  brief: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/* put                                                                        */
/* -------------------------------------------------------------------------- */

export interface PutVideoInput {
  slug: string;
  /** Absolute path to the job's `candidate/`: the gate's copies, `copies.json` and `source/`. */
  dir: string;
  /** The studio job whose output this is. Required: a video lands only as a job's Accept. */
  jobId: string;
  /**
   * The video revision the job started from: a number, null for "this video
   * does not exist yet", or undefined for "whatever is latest".
   */
  base?: number | null;
  reason: string;
  author: string;
  authorKind: AuthorKind;
  ownerId: string;
}

export interface VideoAssetResult {
  id: string;
  kind: string;
  key: string;
  sha256: string;
  bytes: number;
  /** False when the store already held these bytes. */
  uploaded: boolean;
}

export interface PutVideoResult {
  ok: true;
  slug: string;
  job: string;
  topic: string;
  title: string;
  concepts: string[];
  narrated: boolean;
  sourceHash: string;
  durationSeconds: number;
  /** The video's latest revision after the put. */
  revision: number;
  /** False when nothing was written. */
  changed: boolean;
  /** True when this was the same job's own earlier put, landed already: nothing was written. */
  retry: boolean;
  jobState: "accepted";
  assets: VideoAssetResult[];
  revisions: { type: string; id: string; revision: number; changed: boolean }[];
  notes: string[];
}

interface Planned {
  id: string;
  kind: "video" | "transcript" | "chapters" | "captions" | "poster";
  path: string | null;
  file: string;
  ext: string;
  mime: string;
  sha256: string;
  bytes: number;
  title: string;
  links: Record<string, Record<string, unknown>[]>;
}

/** States a job may land a video from: its Accept, and a retried Accept whose rows already landed. */
const PUTTABLE_STATES = ["awaiting_review", "accepted"] as const;

async function readJob(db: CatalogDatabase, jobId: string, slug: string, ownerId: string): Promise<Job> {
  // Only the writer's own job (phase 4): another owner's is "no job", as a
  // missing one is, so a put can land nothing under somebody else's job.
  const [row] = await db
    .select()
    .from(jobTable)
    .where(and(eq(jobTable.id, jobId), eq(jobTable.ownerId, ownerId)))
    .limit(1);
  if (row === undefined) throw new VideoError("job", `no job "${jobId}". \`catalog job ls\` lists them.`);
  if (row.kind !== "video") throw new VideoError("job", `job ${jobId} is a ${row.kind} job, so it has no video to land.`);
  if (!(PUTTABLE_STATES as readonly string[]).includes(row.state)) {
    throw new VideoError(
      "job",
      `job ${jobId} is ${row.state}, so it has no output to land. Only a job awaiting review ` +
        `(or one already accepted, retrying) can put a video.`,
    );
  }
  const target = videoPaths(slug).mp4;
  if (row.targetPath !== target) {
    throw new VideoError("job", `job ${jobId} targets ${row.targetPath}, so it cannot land ${target}.`);
  }
  const brief = row.brief as Record<string, unknown>;
  if (brief.topic !== undefined && brief.topic !== row.topicSlug) {
    throw new VideoError(
      "job",
      `job ${jobId} was enqueued under topic "${row.topicSlug}" but its brief says ${JSON.stringify(brief.topic)}.`,
    );
  }
  return row;
}

interface Copies {
  files: Record<string, { sha256: string; bytes: number }>;
  durationSeconds: number;
}

async function readCopies(dir: string): Promise<Copies> {
  const file = path.join(dir, COPIES_FILE);
  let parsed: unknown;
  try {
    await regularFile(file);
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error instanceof VideoError) throw error;
    throw new VideoError("unreadable", `${file} cannot be read as the gate's record of its copies: ${(error as Error).message}`);
  }
  const record = parsed as Partial<Copies> | null;
  if (typeof record !== "object" || record === null || typeof record.files !== "object" || record.files === null) {
    throw new VideoError("unreadable", `${file} has no "files" object: it is not the gate's record of its copies.`);
  }
  for (const [name, entry] of Object.entries(record.files)) {
    const ok =
      typeof entry === "object" &&
      entry !== null &&
      typeof entry.sha256 === "string" &&
      /^[0-9a-f]{64}$/.test(entry.sha256) &&
      Number.isSafeInteger(entry.bytes) &&
      entry.bytes >= 0;
    if (!ok) throw new VideoError("unreadable", `${file}: "${name}" is not { sha256, bytes }.`);
  }
  const duration = record.durationSeconds;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
    throw new VideoError("unreadable", `${file}: "durationSeconds" must be a positive number, the gate's ffprobe figure.`);
  }
  return { files: record.files as Copies["files"], durationSeconds: duration };
}

/**
 * A file the runner wrote and the catalog is about to store: opened only if
 * it is a regular file with one link, so a link planted in the job's
 * workspace can never make a put read, or store, something outside it.
 */
async function regularFile(file: string): Promise<{ bytes: number }> {
  let facts;
  try {
    facts = await lstat(file);
  } catch (error) {
    throw new VideoError("unreadable", `${file} cannot be read: ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`);
  }
  if (!facts.isFile()) throw new VideoError("unreadable", `${file} is not a regular file (a link or a directory), so it is not stored.`);
  if (facts.nlink !== 1) throw new VideoError("unreadable", `${file} has ${facts.nlink} links, so it is not stored: a copy has one.`);
  return { bytes: facts.size };
}

/** One copy, hashed and held to the gate's record of it. */
async function checkedCopy(dir: string, name: string, copies: Copies): Promise<{ file: string; sha256: string; bytes: number }> {
  const file = path.join(dir, name);
  const recorded = copies.files[name];
  if (recorded === undefined) {
    throw new VideoError("mismatch", `${COPIES_FILE} records no copy named ${name}, so there is no hash to hold it to.`);
  }
  await regularFile(file);
  const facts = await fileFacts(file);
  if (facts.contentHash !== recorded.sha256 || facts.bytes !== recorded.bytes) {
    throw new VideoError(
      "mismatch",
      `${name} is ${facts.bytes} bytes with sha256 ${facts.contentHash}, but the gate copied ${recorded.bytes} bytes ` +
        `with sha256 ${recorded.sha256}. Nothing was stored: the file changed after the gate looked at it.`,
    );
  }
  return { file, sha256: facts.contentHash, bytes: facts.bytes };
}

/** The scene files and `topic.yml` from `candidate/source/`, each held to the gate's record when it has one. */
async function readSource(dir: string, copies: Copies): Promise<Record<string, string>> {
  const root = path.join(dir, "source");
  let names: string[];
  try {
    names = (await readdir(root)).sort();
  } catch (error) {
    throw new VideoError("unreadable", `${root} cannot be listed: ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`);
  }
  const files: Record<string, string> = {};
  let total = 0;
  for (const name of names.filter((n) => SOURCE_NAME.test(n))) {
    const file = path.join(root, name);
    const { bytes } = await regularFile(file);
    total += bytes;
    if (total > SOURCE_BYTES_MAX) {
      throw new VideoError("unreadable", `${root} holds more than ${SOURCE_BYTES_MAX} bytes of source, which no scene file needs.`);
    }
    const body = await readFile(file);
    const recorded = copies.files[`source/${name}`];
    if (recorded !== undefined && (sha256(body) !== recorded.sha256 || body.length !== recorded.bytes)) {
      throw new VideoError("mismatch", `source/${name} is not the file the gate copied. Nothing was stored.`);
    }
    const text = body.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(body)) throw new VideoError("unreadable", `${file} is not UTF-8 text.`);
    files[name] = text;
  }
  if (!("topic.yml" in files) || !Object.keys(files).some((n) => n.endsWith(".py"))) {
    throw new VideoError("unreadable", `${root} needs topic.yml and at least one scene file (.py): it is what a change starts from.`);
  }
  if (Object.keys(files).length > SOURCE_FILES_MAX) {
    throw new VideoError("unreadable", `${root} holds more than ${SOURCE_FILES_MAX} source files.`);
  }
  return files;
}

/** The hash of a video's source: its canonical JSON, the definition `diagram.document_hash` uses too. */
export function sourceHash(source: VideoSource): string {
  return sha256(Buffer.from(canonicalJson(source), "utf8"));
}

function briefConcepts(brief: Record<string, unknown>): string[] {
  const raw = Array.isArray(brief.concepts) ? brief.concepts : [];
  return [...new Set(raw.filter((c): c is string => typeof c === "string" && c.trim() !== "").map((c) => c.trim()))].sort();
}

/**
 * `catalog video put --job`: one studio video, its source, its cut and its
 * companions, and the job's Accept, in one transaction after every blob is
 * stored and confirmed.
 */
export async function putVideo(db: CatalogDatabase, store: BlobStore, input: PutVideoInput): Promise<PutVideoResult> {
  const slug = input.slug.trim();
  assertVideoSlug(slug);
  const ownerId = input.ownerId;
  const dir = path.resolve(input.dir);
  const ids = videoAssetIds(slug);
  const paths = videoPaths(slug);
  const names = candidateFiles(slug);
  const notes: string[] = [];

  const job = await readJob(db, input.jobId, slug, ownerId);
  const brief = job.brief as Record<string, unknown>;
  const topicSlug = job.topicSlug;
  const title = typeof brief.title === "string" && brief.title.trim() !== "" ? brief.title.trim() : slug;
  const concepts = briefConcepts(brief);
  const narrated = brief.voice !== "none";

  // The subject: a live topic and concepts the owner may read, refused with
  // the sentence a missing one gets, before a byte is stored.
  const readable = readableOwners(ownerId);
  const [filed] = await db
    .select({ slug: topic.slug })
    .from(topic)
    .where(and(eq(topic.slug, topicSlug), isNull(topic.archivedAt), inArray(topic.ownerId, [...readable])))
    .limit(1);
  if (filed === undefined) throw new VideoError("unresolved", `${paths.mp4}: topic "${topicSlug}" is not in the vocabulary.`);
  if (concepts.length > 0) {
    const known = new Set(
      (
        await db
          .select({ slug: concept.slug })
          .from(concept)
          .where(and(inArray(concept.slug, concepts), inArray(concept.ownerId, [...readable])))
      ).map((c) => c.slug),
    );
    const unknown = concepts.filter((c) => !known.has(c));
    if (unknown.length > 0) {
      throw new VideoError("unresolved", `${paths.mp4}: no concept note for ${unknown.map((c) => `"${c}"`).join(", ")}.`);
    }
  }

  const copies = await readCopies(dir);
  const files = await readSource(dir, copies);
  const source: VideoSource = { files, brief };
  const hash = sourceHash(source);

  const mp4 = await checkedCopy(dir, names.mp4, copies);
  const poster = await checkedCopy(dir, names.poster, copies);
  const sidecars = narrated
    ? {
        transcript: await checkedCopy(dir, names.transcript, copies),
        chapters: await checkedCopy(dir, names.chapters, copies),
        captions: await checkedCopy(dir, names.captions, copies),
      }
    : null;

  const topicLinks = { asset_topic: [{ topicSlug }] };
  const derived = { asset_topic: [], asset_concept: [], asset_derivation: [{ sourceAssetId: ids.video }] };
  const planned: Planned[] = [
    {
      id: ids.video,
      kind: "video",
      path: paths.mp4,
      ...mp4,
      ext: "mp4",
      mime: "video/mp4",
      title,
      links: { ...topicLinks, asset_concept: concepts.map((conceptSlug) => ({ conceptSlug })), asset_derivation: [] },
    },
  ];
  if (sidecars !== null) {
    planned.push(
      {
        id: ids.transcript,
        kind: "transcript",
        path: paths.transcript,
        ...sidecars.transcript,
        ext: "json",
        mime: "application/json",
        title: `${title} (transcript)`,
        links: { ...derived, ...topicLinks },
      },
      {
        id: ids.chapters,
        kind: "chapters",
        path: paths.chapters,
        ...sidecars.chapters,
        ext: "json",
        mime: "application/json",
        title: `${title} (chapters)`,
        links: { ...derived, ...topicLinks },
      },
      {
        id: ids.captions,
        kind: "captions",
        path: paths.captions,
        ...sidecars.captions,
        ext: "vtt",
        mime: "text/vtt",
        title: `${title} (captions)`,
        links: { ...derived, ...topicLinks },
      },
    );
  }
  // No path: a poster has no file anywhere but the store, as the upload
  // command's posters have none.
  planned.push({
    id: ids.poster,
    kind: "poster",
    path: null,
    ...poster,
    ext: "jpg",
    mime: POSTER_CONTENT_TYPE,
    title: `${title} (poster)`,
    links: derived,
  });
  const keyOf = (p: Planned) => blobKey(ownerId, p.sha256, p.ext);
  const mp4Key = keyOf(planned[0] as Planned);

  // Another owner's slug is refused before anything is stored; the seam
  // would refuse it too, after the uploads.
  const [existing] = await db.select().from(video).where(eq(video.slug, slug)).limit(1);
  if (existing !== undefined && existing.ownerId !== ownerId) {
    throw new VideoError("job", `${paths.mp4} names a video this owner cannot write: choose another slug.`);
  }
  const latestVideo = (await latestRevisions(db, "video", [slug])).get(slug);

  // A retried put under the same job: its own write is the latest revision,
  // and the source and every stored file are exactly these. That is the
  // landed Accept, returned as it is, with nothing written; anything else
  // under an accepted job is refused by name.
  if (job.state === "accepted") {
    const recorded =
      latestVideo === undefined
        ? []
        : (
            await db.execute<{ job_id: string | null }>(sql`select job_id from content_revision where id = ${latestVideo.id}`)
          ).rows;
    const outputs = await db
      .select({ assetId: assetJob.assetId, contentHash: assetJob.contentHash })
      .from(assetJob)
      .where(eq(assetJob.jobId, input.jobId));
    const landed = new Map(outputs.map((o) => [o.assetId, o.contentHash] as const));
    const own =
      recorded[0]?.job_id === input.jobId &&
      existing !== undefined &&
      existing.sourceHash === hash &&
      existing.mp4BlobKey === mp4Key &&
      landed.size === planned.length &&
      planned.every((p) => landed.get(p.id) === p.sha256);
    if (!own) {
      throw new VideoError(
        "job",
        `job ${input.jobId} is accepted, and what it landed is not this: its video is recorded and is not ` +
          `rewritten under its name. A change is a new job (D52 of docs/STUDIO-VIDEOS.md).`,
      );
    }
    const assetRevisions = await latestRevisions(db, "asset", planned.map((p) => p.id));
    return {
      ok: true,
      slug,
      job: input.jobId,
      topic: topicSlug,
      title,
      concepts,
      narrated,
      sourceHash: hash,
      durationSeconds: Number(existing.durationSeconds ?? copies.durationSeconds),
      revision: latestVideo?.id ?? 0,
      changed: false,
      retry: true,
      jobState: "accepted",
      assets: planned.map((p) => ({ id: p.id, kind: p.kind, key: keyOf(p), sha256: p.sha256, bytes: p.bytes, uploaded: false })),
      revisions: [
        { type: "video", id: slug, revision: latestVideo?.id ?? 0, changed: false },
        ...planned.map((p) => ({ type: "asset", id: p.id, revision: assetRevisions.get(p.id)?.id ?? 0, changed: false })),
      ],
      notes: ["already landed by this job: nothing was written"],
    };
  }

  // The bytes first, each confirmed against the hash the gate recorded (the
  // store checks the stream against it). A failure from here to the commit
  // leaves at most unreferenced blobs, and no row pointing at them.
  const assets: VideoAssetResult[] = [];
  for (const p of planned) {
    const done = await uploadBlob(db, store, {
      ownerId,
      file: p.file,
      mime: p.mime,
      ext: p.ext,
      sha256: p.sha256,
      bytes: p.bytes,
    });
    assets.push({ id: p.id, kind: p.kind, key: done.key, sha256: done.sha256, bytes: done.bytes, uploaded: done.uploaded });
  }

  const common = { owner: ownerId, author: input.author, authorKind: input.authorKind, reason: input.reason, jobId: input.jobId };
  // A silent cut has no sidecars: rows a narrated version of the same video
  // left are deleted with this write, so the library never plays a new cut
  // with an old transcript.
  const stale = sidecars === null ? [ids.transcript, ids.chapters, ids.captions] : [];

  let results: WriteContentResult[];
  try {
    results = await db.transaction(async (tx) => {
      // Every lock this write takes, first and in the global order (type,
      // then id): the stale sidecars `deleteContent` removes after
      // `writeContents` would otherwise be locked out of order. The bases are
      // then read under the locks.
      for (const id of [...new Set([...planned.map((p) => p.id), ...stale])].sort()) await lockEntity(tx, "asset", id);
      await lockEntity(tx, "video", slug);
      const latestAssets = await latestRevisions(tx, "asset", [...planned.map((p) => p.id), ...stale]);
      const base = input.base === undefined ? (latestVideo?.id ?? null) : input.base;
      const inputs: WriteContentInput[] = [
        {
          ...common,
          type: "video",
          id: slug,
          base,
          next: {
            row: {
              slug,
              title,
              topicSlug,
              source,
              sourceHash: hash,
              mp4BlobKey: mp4Key,
              renderedSourceHash: hash,
              durationSeconds: copies.durationSeconds,
              archivedAt: null,
            },
          },
        },
        ...planned.map(
          (p): WriteContentInput => ({
            ...common,
            type: "asset",
            id: p.id,
            base: latestAssets.get(p.id)?.id ?? null,
            next: {
              row: {
                id: p.id,
                kind: p.kind,
                path: p.path,
                url: null,
                contentHash: p.sha256,
                bytes: p.bytes,
                title: p.title,
                sourceRepo: "self-learn",
                blobKey: keyOf(p),
                resourceType: null,
              },
              links: p.links,
            },
          }),
        ),
      ];
      const written = await writeContents(tx, inputs);
      for (const id of stale) {
        const latest = latestAssets.get(id);
        if (latest === undefined || latest.deleted) continue;
        const gone = await deleteContent(tx, {
          type: "asset",
          id,
          owner: ownerId,
          base: latest.id,
          author: input.author,
          authorKind: input.authorKind,
          reason: input.reason,
        });
        if (gone !== null) notes.push(`${id} deleted: this cut is silent, and the transcript was the earlier one's`);
      }
      for (const p of planned) {
        await tx
          .insert(assetJob)
          .values({ assetId: p.id, jobId: input.jobId, contentHash: p.sha256, bytes: p.bytes, writtenAt: new Date(), ownerId })
          .onConflictDoUpdate({
            target: [assetJob.assetId, assetJob.jobId],
            set: {
              contentHash: sql`excluded."content_hash"`,
              bytes: sql`excluded."bytes"`,
              writtenAt: sql`excluded."written_at"`,
              updatedAt: sql`now()`,
            },
          });
      }
      // The same checked transition `catalog job accept` makes, in this
      // transaction: the video and its job's verdict land together.
      await acceptJobIn(tx, input.jobId, ownerId);
      return written;
    });
  } catch (error) {
    if (error instanceof ContentWriteError && error.code === "stale-base") throw new VideoError("stale-base", error.message);
    if (error instanceof ContentWriteError && error.code === "foreign-owner") throw new VideoError("unresolved", error.message);
    throw error;
  }

  const own = results[0] as WriteContentResult;
  return {
    ok: true,
    slug,
    job: input.jobId,
    topic: topicSlug,
    title,
    concepts,
    narrated,
    sourceHash: hash,
    durationSeconds: copies.durationSeconds,
    revision: own.revisionId,
    changed: results.some((r) => r.changed),
    retry: false,
    jobState: "accepted",
    assets,
    revisions: results.map((r) => ({ type: r.type, id: r.id, revision: r.revisionId, changed: r.changed })),
    notes,
  };
}

/* -------------------------------------------------------------------------- */
/* list and show                                                              */
/* -------------------------------------------------------------------------- */

export interface VideoSummary {
  /** `studio` for a video made through the studio's chat, `manimkc` for a render the manimkc import indexed. */
  origin: "studio" | "manimkc";
  /** The studio video's slug; null for a manimkc render, which is named by its asset id. */
  slug: string | null;
  assetId: string;
  title: string | null;
  topic: string | null;
  concepts: string[];
  durationSeconds: number | null;
  /** The studio source's hash; null for a manimkc render, whose source is in manimkc's own repository. */
  sourceHash: string | null;
  renderedSourceHash: string | null;
  mp4: { key: string; bytes: number; sha256: string } | null;
  poster: { assetId: string; key: string | null } | null;
  /** Whether it has a transcript, so a voice. */
  narrated: boolean;
  revision: number | null;
  /** Which job wrote that revision. */
  revisionJob: string | null;
  updatedAt: string;
}

export interface VideoDetail extends VideoSummary {
  origin: "studio";
  slug: string;
  sourceHash: string;
  brief: Record<string, unknown>;
  files: { name: string; bytes: number; sha256: string }[];
}

const iso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

interface StudioRow extends Record<string, unknown> {
  slug: string;
  title: string | null;
  topic_slug: string;
  source_hash: string;
  rendered_source_hash: string | null;
  mp4_blob_key: string | null;
  duration_seconds: string | number | null;
  updated_at: Date | string;
  mp4_bytes: string | number | null;
  mp4_sha256: string | null;
  concepts: string[] | null;
  poster_key: string | null;
  poster_id: string | null;
  narrated: boolean;
  revision: string | number | null;
  revision_job: string | null;
  source: unknown;
}

async function studioRows(db: CatalogDatabase, scope: OwnerScope, only?: string, withSource = false): Promise<StudioRow[]> {
  const { rows } = await db.execute<StudioRow>(sql`
    select v.slug, v.title, v.topic_slug, v.source_hash, v.rendered_source_hash, v.mp4_blob_key,
      v.duration_seconds, v.updated_at, b.bytes as mp4_bytes, b.sha256 as mp4_sha256,
      (select array_agg(c.concept_slug order by c.concept_slug) from asset_concept c
        where c.asset_id = ${VIDEO_PREFIX} || v.slug) as concepts,
      p.id as poster_id, p.blob_key as poster_key,
      exists (select 1 from asset t where t.id = ${VIDEO_PREFIX} || v.slug || '.transcript.json') as narrated,
      rev.id as revision, rev.job_id as revision_job
      ${withSource ? sql`, v.source` : sql``}
    from video v
    left join blob_object b on b.key = v.mp4_blob_key
    left join asset p on p.id = ${POSTER_PREFIX} || ${VIDEO_PREFIX} || v.slug
    left join lateral (
      select id, job_id from content_revision
      where entity_type = 'video' and entity_id = v.slug
      order by seq desc limit 1
    ) rev on true
    where v.archived_at is null ${only === undefined ? sql`` : sql`and v.slug = ${only}`}${andOwnedBy(sql`v.owner_id`, scope.readable)}
    order by v.slug
  `);
  return rows;
}

function studioSummary(row: StudioRow): VideoSummary {
  return {
    origin: "studio",
    slug: row.slug,
    assetId: `${VIDEO_PREFIX}${row.slug}`,
    title: row.title,
    topic: row.topic_slug,
    concepts: row.concepts ?? [],
    durationSeconds: num(row.duration_seconds),
    sourceHash: row.source_hash,
    renderedSourceHash: row.rendered_source_hash,
    mp4:
      row.mp4_blob_key === null
        ? null
        : { key: row.mp4_blob_key, bytes: Number(row.mp4_bytes ?? 0), sha256: row.mp4_sha256 ?? "" },
    poster: row.poster_id === null ? null : { assetId: row.poster_id, key: row.poster_key },
    narrated: row.narrated,
    revision: num(row.revision),
    revisionJob: row.revision_job,
    updatedAt: iso(row.updated_at) as string,
  };
}

interface ManimkcRow extends Record<string, unknown> {
  id: string;
  title: string | null;
  blob_key: string | null;
  bytes: string | number | null;
  content_hash: string | null;
  updated_at: Date | string;
  topic: string | null;
  concepts: string[] | null;
  poster_id: string | null;
  poster_key: string | null;
  narrated: boolean;
}

/**
 * Every live studio video and every manimkc render the owner may read: the
 * studio's grid and its planner's CORPUS block. Scoped (phase 4): another
 * owner's video is absent, as a slug nobody holds is.
 */
export async function listVideos(db: CatalogDatabase, scope: OwnerScope): Promise<VideoSummary[]> {
  const studio = (await studioRows(db, scope)).map(studioSummary);
  const { rows } = await db.execute<ManimkcRow>(sql`
    select a.id, a.title, a.blob_key, a.bytes, a.content_hash, a.updated_at,
      (select min(t.topic_slug) from asset_topic t where t.asset_id = a.id) as topic,
      (select array_agg(c.concept_slug order by c.concept_slug) from asset_concept c where c.asset_id = a.id) as concepts,
      p.id as poster_id, p.blob_key as poster_key,
      exists (
        select 1 from asset_derivation d join asset s on s.id = d.asset_id
        where d.source_asset_id = a.id and s.kind = 'transcript'
      ) as narrated
    from asset a
    left join asset p on p.id = ${POSTER_PREFIX} || a.id
    where a.kind = 'video' and starts_with(a.id, ${ASSET_PREFIX.manimkc})${andOwnedBy(sql`a.owner_id`, scope.readable)}
    order by a.id
  `);
  const manimkc = rows.map(
    (row): VideoSummary => ({
      origin: "manimkc",
      slug: null,
      assetId: row.id,
      title: row.title,
      topic: row.topic,
      concepts: row.concepts ?? [],
      durationSeconds: null,
      sourceHash: null,
      renderedSourceHash: null,
      mp4:
        row.blob_key === null
          ? null
          : { key: row.blob_key, bytes: Number(row.bytes ?? 0), sha256: row.content_hash ?? "" },
      poster: row.poster_id === null ? null : { assetId: row.poster_id, key: row.poster_key },
      narrated: row.narrated,
      revision: null,
      revisionJob: null,
      updatedAt: iso(row.updated_at) as string,
    }),
  );
  return [...studio, ...manimkc];
}

function sourceOf(value: unknown): VideoSource {
  const record = (typeof value === "object" && value !== null ? value : {}) as Partial<VideoSource>;
  const files: Record<string, string> = {};
  for (const [name, text] of Object.entries(record.files ?? {})) {
    if (typeof text === "string") files[name] = text;
  }
  const brief = typeof record.brief === "object" && record.brief !== null ? record.brief : {};
  return { files, brief };
}

/** One live studio video the owner may read, with its brief and its source files' names, or null. */
export async function showVideo(db: CatalogDatabase, scope: OwnerScope, slug: string): Promise<VideoDetail | null> {
  assertVideoSlug(slug);
  const [row] = await studioRows(db, scope, slug, true);
  if (row === undefined) return null;
  const source = sourceOf(row.source);
  return {
    ...(studioSummary(row) as VideoSummary & { origin: "studio"; slug: string; sourceHash: string }),
    brief: source.brief,
    files: Object.entries(source.files)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, text]) => {
        const bytes = Buffer.from(text, "utf8");
        return { name, bytes: bytes.length, sha256: sha256(bytes) };
      }),
  };
}

/* -------------------------------------------------------------------------- */
/* checkout                                                                   */
/* -------------------------------------------------------------------------- */

export interface VideoCheckoutResult {
  ok: true;
  slug: string;
  dir: string;
  /** False for a slug with no video this owner may read: nothing was written. */
  exists: boolean;
  revision: number | null;
  sourceHash: string | null;
  brief: Record<string, unknown> | null;
  files: { name: string; path: string; bytes: number; sha256: string }[];
  /** False when every file was already there, byte for byte. */
  written: boolean;
}

/** Write a file by rename, so a reader never sees half of one. */
async function writeAtomic(file: string, bytes: Buffer): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, bytes, { flag: "wx" });
  try {
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/**
 * `catalog video checkout <slug> --dir DIR`: the stored source written as
 * files, which is where a change job's scene starts (D52). Only the source
 * files are written; the brief comes back in the result. A file already
 * there with other bytes is somebody's work and is refused unless `force`.
 */
export async function checkoutVideo(
  db: CatalogDatabase,
  scope: OwnerScope,
  slug: string,
  dir: string,
  options: { force?: boolean } = {},
): Promise<VideoCheckoutResult> {
  assertVideoSlug(slug);
  const base = path.resolve(dir);
  const [row] = await studioRows(db, scope, slug, true);
  if (row === undefined) {
    return { ok: true, slug, dir: base, exists: false, revision: null, sourceHash: null, brief: null, files: [], written: false };
  }
  const source = sourceOf(row.source);
  const planned = Object.entries(source.files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [name] of planned) {
    if (!SOURCE_NAME.test(name)) {
      throw new VideoError("unreadable", `the stored source of ${slug} names "${name}", which is not a file name a checkout writes.`);
    }
  }
  await mkdir(base, { recursive: true });
  const files: VideoCheckoutResult["files"] = [];
  let written = false;
  for (const [name, text] of planned) {
    const file = path.join(base, name);
    const bytes = Buffer.from(text, "utf8");
    const here = await lstat(file).catch(() => null);
    if (here !== null) {
      const same = here.isFile() && (await readFile(file)).equals(bytes);
      if (!same && options.force !== true) {
        throw new VideoError(
          "dirty-checkout",
          `${file} is already there with other contents, so it was left as it is. Pass --force to replace it.`,
        );
      }
      if (!same) {
        await rm(file, { force: true });
        await writeAtomic(file, bytes);
        written = true;
      }
    } else {
      await writeAtomic(file, bytes);
      written = true;
    }
    files.push({ name, path: file, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return {
    ok: true,
    slug,
    dir: base,
    exists: true,
    revision: num(row.revision),
    sourceHash: row.source_hash,
    brief: source.brief,
    files,
    written,
  };
}
