import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { key as blobKey, type BlobStore } from "@self-learn/blob";
import {
  assetJob,
  blobObject,
  concept,
  contentSource,
  diagram,
  job as jobTable,
  LOCAL_LEARNER_ID,
  topic,
  type AuthorKind,
} from "@self-learn/schema";
import { and, eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { REPO_ROOT } from "../env";
import { ASSETS_DIR, resolveSubject, type Subject } from "../index/diagrams";
import { IndexErrors } from "../index/errors";
import { ASSET_PREFIX } from "../index/source";
import { metaFromDocument, type DiagramMeta } from "../index/tldr";
import { hashFile, readBlob, uploadBlob } from "./blob";
import { DIAGRAM_SLUG, diagramPaths, documentBytes, documentProblem, sha256 } from "./diagram-document";
import { latestRevisions } from "./revisions";
import { writeContents, type WriteContentInput, type WriteContentResult } from "./write";

/**
 * Diagrams in the database (docs/CONTENT-MIGRATION.md, Track D; D6, D11).
 *
 * A diagram is three rows and a blob: the `diagram` row holding the `.tldr`
 * document as jsonb, the SVG in the blob store, and the two `asset` rows the
 * rest of the catalog already knew it by (`diagram:learn/assets/<slug>.tldr`
 * and `.svg`, ids and paths kept as logical names, D11). `put` writes all
 * three through the seam in one transaction, after the SVG's upload is
 * `present`, so no row ever points at bytes the store does not hold.
 *
 * What a document's bytes are is `diagram-document.ts`'s to say.
 *
 * **Freshness is two hashes.** `svg_document_hash` records the
 * `document_hash` the SVG was exported from, as the writer vouched: `put` with
 * an SVG says "this SVG was exported from this document", and `put` without
 * one keeps the SVG that is there and so leaves it stale once the document
 * moves. The studio's pill used to compare file modification times (U9 of
 * TLDRAWKC-INTEGRATION.md); now it compares these two strings.
 */

export { diagramPaths, documentBytes, documentHash, shapeCount, sha256 } from "./diagram-document";

export const DIAGRAM_OWNER = LOCAL_LEARNER_ID;


export class DiagramError extends Error {
  constructor(
    readonly code:
      | "bad-slug"
      | "unreadable"
      | "unresolved"
      | "no-diagram"
      | "job"
      | "no-checkout"
      | "dirty-checkout"
      | "stale-base"
      | "write-through",
    message: string,
  ) {
    super(message);
    this.name = "DiagramError";
  }
}

export function diagramAssetIds(slug: string): { tldr: string; svg: string } {
  const paths = diagramPaths(slug);
  return { tldr: `${ASSET_PREFIX.diagrams}${paths.tldr}`, svg: `${ASSET_PREFIX.diagrams}${paths.svg}` };
}

export function assertDiagramSlug(slug: string): void {
  if (!DIAGRAM_SLUG.test(slug)) {
    throw new DiagramError(
      "bad-slug",
      `"${slug}" is not a diagram slug: lowercase letters and digits in hyphen-separated words, ` +
        `the same rule as a concept id, because it is the name every embed resolves.`,
    );
  }
}

/** Parse a `.tldr`, refusing anything that is not a JSON object with a records list. */
export function parseDocument(text: string, where: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new DiagramError("unreadable", `${where} is not a JSON document: ${(error as Error).message}`);
  }
  const problem = documentProblem(parsed);
  if (problem !== null) throw new DiagramError("unreadable", `${where} is not a tldraw document: ${problem}`);
  return parsed as Record<string, unknown>;
}

/**
 * The vocabulary and the concepts as the database holds them, in the shape
 * `resolveSubject` checks a stamp against, so `put` refuses exactly what the
 * import refuses, with the same sentences.
 */
async function databaseVocabulary(db: CatalogDatabase) {
  const topics = await db.select({ slug: topic.slug }).from(topic);
  const concepts = await db.select({ slug: concept.slug, topicSlug: concept.topicSlug }).from(concept);
  return {
    known: new Set(concepts.map((c) => c.slug)),
    vocabulary: {
      bySlug: new Map(topics.map((t) => [t.slug, t.slug] as const)),
      byConcept: new Map(
        concepts.filter((c) => c.topicSlug !== null).map((c) => [c.slug, c.topicSlug as string] as const),
      ),
    },
  };
}

/** What a document says it is about, checked against the rows, or a refusal naming the file. */
export async function resolveDocument(
  db: CatalogDatabase,
  document: unknown,
  where: string,
): Promise<{ subject: Subject; meta: DiagramMeta | null; notes: string[] }> {
  const meta = metaFromDocument(document);
  const { known, vocabulary } = await databaseVocabulary(db);
  const problems = new IndexErrors();
  const notes: string[] = [];
  const subject = resolveSubject(meta, where, known, vocabulary, problems, notes);
  try {
    problems.throwIfAny(where);
  } catch (error) {
    throw new DiagramError("unresolved", (error as Error).message);
  }
  if (subject === null) throw new DiagramError("unresolved", `${where} could not be resolved to a topic.`);
  return { subject, meta, notes };
}

/* -------------------------------------------------------------------------- */
/* put                                                                        */
/* -------------------------------------------------------------------------- */

export interface PutInput {
  slug: string;
  /** Absolute path to the `.tldr` to store. */
  tldr: string;
  /**
   * Absolute path to an SVG exported from that `.tldr`, or null to keep the
   * SVG the diagram already has (stale from now on, if the document moved).
   */
  svg: string | null;
  reason: string;
  author: string;
  authorKind: AuthorKind;
  /**
   * The diagram revision the writer started from: a number, null for "this
   * diagram does not exist yet", or undefined for "whatever is latest", which
   * is a write that cannot be refused as stale and is only right for a
   * person at a terminal.
   */
  base?: number | null;
  /** The studio job this is the output of: its `asset_job` rows and the revisions' `job_id`. */
  jobId?: string;
  ownerId?: string;
}

export interface PutResult {
  ok: true;
  slug: string;
  topic: string;
  concepts: string[];
  title: string | null;
  documentHash: string;
  /** The SVG the diagram now has, and whether it matches the document. */
  svg: { key: string; sha256: string; bytes: number; uploaded: boolean; current: boolean } | null;
  /** The diagram's latest revision after the write. */
  revision: number;
  /** False when the write left every row exactly as it was. */
  changed: boolean;
  revisions: { type: string; id: string; revision: number; changed: boolean }[];
  job: string | null;
  /** Files written through to the tree while the files still own diagrams (D17); empty after the flip. */
  files: string[];
  notes: string[];
}

/** States a job may land output from: the accept, and a retried accept whose rows already landed. */
const PUTTABLE_STATES = ["awaiting_review", "accepted"] as const;

async function checkJob(
  db: CatalogDatabase,
  jobId: string,
  slug: string,
  topicSlug: string,
): Promise<{ state: string }> {
  const [row] = await db.select().from(jobTable).where(eq(jobTable.id, jobId)).limit(1);
  if (row === undefined) throw new DiagramError("job", `no job "${jobId}". \`catalog job ls\` lists them.`);
  if (!(PUTTABLE_STATES as readonly string[]).includes(row.state)) {
    throw new DiagramError(
      "job",
      `job ${jobId} is ${row.state}, so it has no output to land. Only a job awaiting review ` +
        `(or one already accepted, retrying) can put a diagram.`,
    );
  }
  const target = diagramPaths(slug).tldr;
  if (row.targetPath !== target) {
    throw new DiagramError("job", `job ${jobId} targets ${row.targetPath}, so it cannot land ${target}.`);
  }
  if (row.topicSlug !== topicSlug) {
    throw new DiagramError(
      "job",
      `${target} is stamped with topic "${topicSlug}" but job ${jobId} was enqueued under ` +
        `"${row.topicSlug}". Restamp the diagram, or enqueue the job under the topic it drew.`,
    );
  }
  return { state: row.state };
}

/**
 * `catalog diagram put`: one diagram, its SVG and its two asset rows, as one
 * transaction through the write seam, after the SVG is safely in the store.
 */
export async function putDiagram(
  db: CatalogDatabase,
  store: BlobStore,
  input: PutInput,
): Promise<PutResult> {
  const slug = input.slug.trim();
  assertDiagramSlug(slug);
  const ownerId = input.ownerId ?? DIAGRAM_OWNER;
  const paths = diagramPaths(slug);
  const ids = diagramAssetIds(slug);

  const document = parseDocument(await readText(input.tldr), paths.tldr);
  const bytes = documentBytes(document);
  const docHash = sha256(bytes);
  const { subject, notes } = await resolveDocument(db, document, paths.tldr);

  const job = input.jobId === undefined ? null : await checkJob(db, input.jobId, slug, subject.topicSlug);

  let svgFacts: { sha256: string; bytes: number; key: string } | null = null;
  if (input.svg !== null) {
    await readText(input.svg, "an SVG");
    const facts = await hashFile(input.svg);
    svgFacts = { ...facts, key: blobKey(ownerId, facts.sha256, "svg") };
  }

  const [existing] = await db.select().from(diagram).where(eq(diagram.slug, slug)).limit(1);
  const latestDiagram = (await latestRevisions(db, "diagram", [slug])).get(slug);

  // A retried put under the same job: its own earlier write is the latest
  // revision and holds exactly these bytes, so this is that write again, and
  // the base it started from is honoured as the one that write moved past.
  // Anything else under a job is judged as a new write.
  let ownRetry = false;
  if (input.jobId !== undefined && latestDiagram !== undefined && !latestDiagram.deleted && existing !== undefined) {
    const [own] = await db
      .execute<{ job_id: string | null }>(sql`select job_id from content_revision where id = ${latestDiagram.id}`)
      .then((r) => r.rows);
    ownRetry =
      own?.job_id === input.jobId &&
      existing.documentHash === docHash &&
      (svgFacts === null || existing.svgBlobKey === svgFacts.key);
  }
  if (job?.state === "accepted" && !ownRetry) {
    throw new DiagramError(
      "job",
      `job ${input.jobId} is accepted: what it landed is recorded and is not rewritten under its ` +
        `name. Put without --job to change the diagram.`,
    );
  }

  // The bytes go first and on their own: a failure from here to the commit
  // below leaves at most a pending row, and no row pointing at it.
  let svg: PutResult["svg"] = null;
  if (input.svg !== null && svgFacts !== null) {
    const uploaded = await uploadBlob(db, store, {
      ownerId,
      file: input.svg,
      mime: "image/svg+xml",
      ext: "svg",
      sha256: svgFacts.sha256,
      bytes: svgFacts.bytes,
    });
    svg = { key: uploaded.key, sha256: uploaded.sha256, bytes: uploaded.bytes, uploaded: uploaded.uploaded, current: true };
  }

  let svgDocumentHash: string | null = svg === null ? null : docHash;
  if (svg === null && existing !== undefined && existing.svgBlobKey !== null) {
    // Keep the SVG there is. It was exported from `svg_document_hash`, which
    // is stale exactly when that differs from the document now written.
    const [kept] = await db.select().from(blobObject).where(eq(blobObject.key, existing.svgBlobKey)).limit(1);
    if (kept !== undefined) {
      svgDocumentHash = existing.svgDocumentHash;
      svg = {
        key: kept.key,
        sha256: kept.sha256,
        bytes: kept.bytes,
        uploaded: false,
        current: existing.svgDocumentHash === docHash,
      };
    }
  }

  const latestAssets = await latestRevisions(db, "asset", [ids.tldr, ids.svg]);
  const base =
    input.base === undefined || ownRetry ? (latestDiagram?.id ?? null) : input.base;

  const common = {
    author: input.author,
    authorKind: input.authorKind,
    reason: input.reason,
    ...(input.jobId === undefined ? {} : { jobId: input.jobId }),
  };
  const title = subject.title ?? slug;
  const inputs: WriteContentInput[] = [
    {
      ...common,
      type: "diagram",
      id: slug,
      base,
      next: {
        row: {
          slug,
          ownerId,
          title: subject.title,
          topicSlug: subject.topicSlug,
          document,
          documentHash: docHash,
          svgBlobKey: svg?.key ?? null,
          svgDocumentHash: svg === null ? null : svgDocumentHash,
          archivedAt: null,
        },
      },
    },
    {
      ...common,
      type: "asset",
      id: ids.tldr,
      base: latestAssets.get(ids.tldr)?.id ?? null,
      next: {
        row: {
          id: ids.tldr,
          kind: "diagram_source",
          path: paths.tldr,
          url: null,
          contentHash: docHash,
          bytes: bytes.length,
          title,
          sourceRepo: "self-learn",
          blobKey: null,
          resourceType: null,
          ownerId,
        },
        links: subjectLinks(subject, null),
      },
    },
  ];
  if (svg !== null) {
    inputs.push({
      ...common,
      type: "asset",
      id: ids.svg,
      base: latestAssets.get(ids.svg)?.id ?? null,
      next: {
        row: {
          id: ids.svg,
          kind: "diagram_svg",
          path: paths.svg,
          url: null,
          contentHash: svg.sha256,
          bytes: svg.bytes,
          title,
          sourceRepo: "self-learn",
          blobKey: svg.key,
          resourceType: null,
          ownerId,
        },
        // An SVG says nothing about itself: it inherits its source's subject,
        // so a restamped document refiles its export with it.
        links: subjectLinks(subject, ids.tldr),
      },
    });
  }

  let results: WriteContentResult[];
  try {
    results = await db.transaction(async (tx) => {
      const written = await writeContents(tx, inputs);
      if (input.jobId !== undefined && job !== null) {
        await recordJobOutputs(tx, input.jobId, job.state, [
          { assetId: ids.tldr, contentHash: docHash, bytes: bytes.length },
          ...(svg === null || input.svg === null ? [] : [{ assetId: ids.svg, contentHash: svg.sha256, bytes: svg.bytes }]),
        ]);
      }
      return written;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "stale-base") {
      throw new DiagramError("stale-base", (error as Error).message);
    }
    throw error;
  }

  const files = await writeThrough(db, slug, input.tldr, input.svg, notes);
  const own = results[0] as WriteContentResult;
  return {
    ok: true,
    slug,
    topic: subject.topicSlug,
    concepts: subject.concepts,
    title: subject.title,
    documentHash: docHash,
    svg,
    revision: own.revisionId,
    changed: results.some((r) => r.changed),
    revisions: results.map((r) => ({ type: r.type, id: r.id, revision: r.revisionId, changed: r.changed })),
    job: input.jobId ?? null,
    files,
    notes,
  };
}

/**
 * D17 of docs/CONTENT-MIGRATION.md: while the files still own diagrams, the
 * write reaches them too, or the next `catalog index` would read the old files
 * back and undo it (a new diagram pruned, an edit reverted). They are written
 * under the directory the diagrams were last imported from, which for the
 * owner is the repository and for a test its own fixture tree, exactly as the
 * writer was given them. Once `catalog flip diagrams` hands the type to the
 * database nothing reads those files, the import skips them, and a put writes
 * none.
 *
 * After the commit, and loud when it fails: the rows are written, and a rerun
 * of the same put changes nothing and writes the files again.
 */
async function writeThrough(
  db: CatalogDatabase,
  slug: string,
  tldr: string,
  svg: string | null,
  notes: string[],
): Promise<string[]> {
  const [owner] = await db
    .select({ source: contentSource.source })
    .from(contentSource)
    .where(eq(contentSource.type, "diagrams"));
  if (owner?.source === "db") return [];
  const [run] = await db
    .execute<{ root: string | null }>(sql`select metadata ->> 'root' as root from index_run where source = 'diagrams'`)
    .then((r) => r.rows);
  const root = run?.root ?? null;
  if (root === null) {
    notes.push(
      "diagrams have never been imported here, so no directory owns their files and none was written",
    );
    return [];
  }
  const paths = diagramPaths(slug);
  const written: string[] = [];
  try {
    await mkdir(path.join(root, ASSETS_DIR), { recursive: true });
    await writeAtomic(path.join(root, paths.tldr), await readFile(tldr));
    written.push(paths.tldr);
    if (svg !== null) {
      await writeAtomic(path.join(root, paths.svg), await readFile(svg));
      written.push(paths.svg);
    }
  } catch (error) {
    throw new DiagramError(
      "write-through",
      `${slug} is stored, and writing it to ${root} failed (${(error as Error).message}). The files ` +
        `still own diagrams until the flip, so an index would read the old ones back: run the ` +
        `same put again, which changes nothing and writes them.`,
    );
  }
  notes.push(`the files still own diagrams until \`catalog flip diagrams\`, so ${written.join(" and ")} were written under ${root}`);
  return written;
}

function subjectLinks(subject: Subject, derivedFrom: string | null): Record<string, Record<string, unknown>[]> {
  return {
    asset_topic: [{ topicSlug: subject.topicSlug }],
    asset_concept: subject.concepts.map((conceptSlug) => ({ conceptSlug })),
    asset_derivation: derivedFrom === null ? [] : [{ sourceAssetId: derivedFrom }],
  };
}

/**
 * `asset_job`: which job made which bytes. Once a job is accepted its claim is
 * a snapshot and is never rewritten, the rule `assert-output` kept; before
 * that, a re-render that lands before the verdict does update it.
 */
async function recordJobOutputs(
  tx: CatalogDatabase,
  jobId: string,
  state: string,
  outputs: { assetId: string; contentHash: string; bytes: number }[],
): Promise<void> {
  for (const output of outputs) {
    const insert = tx.insert(assetJob).values({ ...output, jobId, writtenAt: new Date() });
    await (state === "accepted"
      ? insert.onConflictDoNothing({ target: [assetJob.assetId, assetJob.jobId] })
      : insert.onConflictDoUpdate({
          target: [assetJob.assetId, assetJob.jobId],
          set: {
            contentHash: sql`excluded."content_hash"`,
            bytes: sql`excluded."bytes"`,
            writtenAt: sql`excluded."written_at"`,
            updatedAt: sql`now()`,
          },
        }));
  }
}

async function readText(file: string, what = "a .tldr"): Promise<string> {
  try {
    const facts = await stat(file);
    if (!facts.isFile()) throw new DiagramError("unreadable", `${file} is not a file, so it is not ${what}`);
    return await readFile(file, "utf8");
  } catch (error) {
    if (error instanceof DiagramError) throw error;
    throw new DiagramError("unreadable", `${file} cannot be read as ${what}: ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`);
  }
}

/* -------------------------------------------------------------------------- */
/* list and show                                                              */
/* -------------------------------------------------------------------------- */

export type SvgState = "current" | "stale" | "missing";

export interface DiagramSummary {
  slug: string;
  /** The logical names, the same strings `job.target_path` and the asset rows hold. */
  path: string;
  svgPath: string | null;
  title: string | null;
  topic: string;
  concepts: string[];
  source: string | null;
  created: string | null;
  /** Counted in jsonb, as `tldrawkc list` counts them. */
  shapes: number;
  documentHash: string;
  documentBytes: number;
  svg: { key: string; bytes: number; sha256: string } | null;
  /** Current when the SVG was exported from this document, stale when from another, missing when there is none. */
  svgState: SvgState;
  /** The diagram's latest revision: what a checkout starts from. */
  revision: number | null;
  /** Which job wrote that revision, if a studio job did. */
  revisionJob: string | null;
  updatedAt: string;
  svgUpdatedAt: string | null;
}

export function svgStateOf(svgBlobKey: string | null, svgDocumentHash: string | null, docHash: string): SvgState {
  if (svgBlobKey === null) return "missing";
  return svgDocumentHash === docHash ? "current" : "stale";
}

interface SummaryRow extends Record<string, unknown> {
  slug: string;
  title: string | null;
  topic_slug: string;
  document_hash: string;
  svg_blob_key: string | null;
  svg_document_hash: string | null;
  updated_at: Date | string;
  shapes: number | string;
  meta: unknown;
  document_bytes: number | string;
  svg_bytes: number | string | null;
  svg_sha256: string | null;
  svg_updated_at: Date | string | null;
  revision: number | string | null;
  revision_job: string | null;
}

const iso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();

/**
 * Every live diagram, or one: the fields the studio's grid and inspector
 * show, read with no subprocess and no document leaving the database. The
 * shapes and the stamp are read inside jsonb; only the counts come back.
 */
export async function listDiagrams(db: CatalogDatabase, only?: string): Promise<DiagramSummary[]> {
  const { rows } = await db.execute<SummaryRow>(sql`
    select d.slug, d.title, d.topic_slug, d.document_hash, d.svg_blob_key, d.svg_document_hash, d.updated_at,
      (select count(*) from jsonb_array_elements(d.document -> 'records') r
        where r ->> 'typeName' = 'shape') as shapes,
      (select r -> 'meta' -> 'tldrawkc' from jsonb_array_elements(d.document -> 'records') r
        where r ->> 'typeName' = 'document' limit 1) as meta,
      a.bytes as document_bytes,
      b.bytes as svg_bytes, b.sha256 as svg_sha256, s.updated_at as svg_updated_at,
      rev.id as revision, rev.job_id as revision_job
    from diagram d
    left join asset a on a.id = ${ASSET_PREFIX.diagrams} || ${`${ASSETS_DIR}/`} || d.slug || '.tldr'
    left join asset s on s.id = ${ASSET_PREFIX.diagrams} || ${`${ASSETS_DIR}/`} || d.slug || '.svg'
    left join blob_object b on b.key = d.svg_blob_key
    left join lateral (
      select id, job_id from content_revision
      where entity_type = 'diagram' and entity_id = d.slug
      order by seq desc limit 1
    ) rev on true
    where d.archived_at is null ${only === undefined ? sql`` : sql`and d.slug = ${only}`}
    order by d.slug
  `);
  return rows.map((row) => {
    const meta = (typeof row.meta === "object" && row.meta !== null ? row.meta : {}) as Record<string, unknown>;
    const concepts = Array.isArray(meta.concepts)
      ? meta.concepts.filter((c): c is string => typeof c === "string" && c.trim() !== "").map((c) => c.trim())
      : [];
    const text = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
    const paths = diagramPaths(row.slug);
    return {
      slug: row.slug,
      path: paths.tldr,
      svgPath: row.svg_blob_key === null ? null : paths.svg,
      title: row.title,
      topic: row.topic_slug,
      concepts,
      source: text(meta.source),
      created: text(meta.created),
      shapes: Number(row.shapes),
      documentHash: row.document_hash,
      documentBytes: Number(row.document_bytes ?? 0),
      svg:
        row.svg_blob_key === null
          ? null
          : { key: row.svg_blob_key, bytes: Number(row.svg_bytes ?? 0), sha256: row.svg_sha256 ?? "" },
      svgState: svgStateOf(row.svg_blob_key, row.svg_document_hash, row.document_hash),
      revision: row.revision === null ? null : Number(row.revision),
      revisionJob: row.revision_job,
      updatedAt: iso(row.updated_at) as string,
      svgUpdatedAt: iso(row.svg_updated_at),
    };
  });
}

/** The stored document of one live diagram, or null. */
export async function readDiagramDocument(
  db: CatalogDatabase,
  slug: string,
): Promise<{ document: unknown; documentHash: string; svgBlobKey: string | null } | null> {
  const [row] = await db
    .select({ document: diagram.document, documentHash: diagram.documentHash, svgBlobKey: diagram.svgBlobKey })
    .from(diagram)
    .where(and(eq(diagram.slug, slug), sql`${diagram.archivedAt} is null`))
    .limit(1);
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/* checkout and commit                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Where checkouts go by default: `$STUDIO_HOME/work`, resolved the way the
 * studio resolves `STUDIO_HOME` (`services/studio/src/paths.ts`), so the
 * catalog and the studio name the same file without either passing it.
 */
export function defaultWorkDir(env: NodeJS.ProcessEnv = process.env, repoRoot: string = REPO_ROOT): string {
  const configured = env.STUDIO_HOME?.trim();
  if (!configured) return path.join(repoRoot, ".studio", "work");
  const expanded =
    configured === "~" || configured.startsWith("~/") ? path.join(env.HOME ?? "", configured.slice(1)) : configured;
  return path.join(path.resolve(repoRoot, expanded), "work");
}

/** What a checkout started from, kept beside the file so a commit can check it without being told. */
export interface CheckoutRecord {
  slug: string;
  /** The diagram revision the file was written from; null when the diagram did not exist yet. */
  revision: number | null;
  documentHash: string | null;
  /** sha256 of the `.tldr` bytes as written, so an edit since is visible without the database. */
  fileHash: string | null;
  /** sha256 of the SVG written beside it, if any. */
  svgHash: string | null;
  checkedOutAt: string;
}

export interface CheckoutPaths {
  dir: string;
  tldr: string;
  svg: string;
  record: string;
}

export function checkoutPaths(slug: string, dir: string): CheckoutPaths {
  assertDiagramSlug(slug);
  const base = path.resolve(dir);
  return {
    dir: base,
    tldr: path.join(base, `${slug}.tldr`),
    svg: path.join(base, `${slug}.svg`),
    record: path.join(base, `${slug}.checkout.json`),
  };
}

export async function readCheckoutRecord(paths: CheckoutPaths): Promise<CheckoutRecord | null> {
  try {
    return JSON.parse(await readFile(paths.record, "utf8")) as CheckoutRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function fileHash(file: string): Promise<string | null> {
  try {
    return sha256(await readFile(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Write a file by rename, so a canvas watching it never reads half of one. */
async function writeAtomic(file: string, bytes: Buffer): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, bytes);
  try {
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export interface CheckoutState {
  slug: string;
  paths: CheckoutPaths;
  record: CheckoutRecord | null;
  /** The file differs from what the checkout wrote: an edit nobody has committed. */
  dirty: boolean;
  /** The diagram has a newer revision than the checkout started from. */
  behind: boolean;
  latest: number | null;
}

/** Where a checkout stands, without touching it. */
export async function checkoutState(db: CatalogDatabase, slug: string, dir: string): Promise<CheckoutState> {
  const paths = checkoutPaths(slug, dir);
  const record = await readCheckoutRecord(paths);
  const latest = (await latestRevisions(db, "diagram", [slug])).get(slug);
  const latestId = latest === undefined || latest.deleted ? null : latest.id;
  const current = await fileHash(paths.tldr);
  // With no record, a file there is somebody's drawing unless it is exactly
  // the stored document: nothing says what it started from, so it is kept.
  let dirty: boolean;
  if (record !== null) {
    // The SVG counts too: one exported since the checkout and not committed
    // is work a refresh would throw away as surely as an edited drawing.
    dirty = current !== record.fileHash || (await fileHash(paths.svg)) !== record.svgHash;
  } else if (current === null) {
    dirty = false;
  } else {
    const [row] = await db
      .select({ documentHash: diagram.documentHash })
      .from(diagram)
      .where(eq(diagram.slug, slug))
      .limit(1);
    dirty = row?.documentHash !== current;
  }
  return { slug, paths, record, dirty, behind: record !== null && record.revision !== latestId, latest: latestId };
}

export interface CheckoutResult {
  ok: true;
  slug: string;
  /** Absolute paths: every `canvas` verb takes one. */
  path: string;
  svgPath: string | null;
  revision: number | null;
  exists: boolean;
  /** False when the checkout was already at the latest revision and left alone. */
  written: boolean;
  note: string;
}

/**
 * `catalog diagram checkout <slug>`: the document as a file a tool can open,
 * with the SVG beside it, and the revision it came from recorded.
 *
 * A checkout with edits nobody committed is never overwritten, `--force`
 * aside: those edits exist nowhere else. A clean one is refreshed to the
 * latest revision. A slug with no diagram gets a record and no file, which is
 * how a new drawing starts: `canvas new` writes the file, and the commit then
 * creates the diagram from nothing (base null).
 */
export async function checkoutDiagram(
  db: CatalogDatabase,
  store: BlobStore,
  slug: string,
  dir: string,
  options: { force?: boolean } = {},
): Promise<CheckoutResult> {
  const state = await checkoutState(db, slug, dir);
  const { paths } = state;
  if (state.dirty && options.force !== true) {
    throw new DiagramError(
      "dirty-checkout",
      `${paths.tldr} holds edits that were never committed, so it was left as it is. Commit them ` +
        `(\`catalog diagram commit ${slug} --reason "..."\`), or pass --force to throw them away.`,
    );
  }
  const stored = await readDiagramDocument(db, slug);
  const exists = stored !== null;
  const onDisk = (await fileHash(paths.tldr)) !== null;
  if (!state.dirty && state.record !== null && !state.behind && onDisk === exists) {
    return {
      ok: true,
      slug,
      path: paths.tldr,
      svgPath: (await fileHash(paths.svg)) === null ? null : paths.svg,
      revision: state.record.revision,
      exists,
      written: false,
      note: `${paths.tldr} is already at ${state.record.revision === null ? "no revision" : `revision ${state.record.revision}`}`,
    };
  }

  await mkdir(paths.dir, { recursive: true });
  let written: Buffer | null = null;
  let svgBytes: Buffer | null = null;
  if (stored !== null) {
    written = documentBytes(stored.document);
    await writeAtomic(paths.tldr, written);
    if (stored.svgBlobKey !== null) {
      svgBytes = await readBlob(store, stored.svgBlobKey);
      await writeAtomic(paths.svg, svgBytes);
    } else {
      await rm(paths.svg, { force: true });
    }
  } else {
    await rm(paths.tldr, { force: true });
    await rm(paths.svg, { force: true });
  }
  const record: CheckoutRecord = {
    slug,
    revision: stored === null ? null : state.latest,
    documentHash: stored?.documentHash ?? null,
    fileHash: written === null ? null : sha256(written),
    svgHash: svgBytes === null ? null : sha256(svgBytes),
    checkedOutAt: new Date().toISOString(),
  };
  await writeAtomic(paths.record, Buffer.from(`${JSON.stringify(record, null, 2)}\n`));
  return {
    ok: true,
    slug,
    path: paths.tldr,
    svgPath: svgBytes === null ? null : paths.svg,
    revision: record.revision,
    exists,
    written: true,
    note: exists
      ? `checked out ${slug} at revision ${record.revision ?? "none"} to ${paths.tldr}`
      : `${slug} is not a diagram yet: draw it at ${paths.tldr} (canvas new), then commit`,
  };
}

export interface CommitInput {
  slug: string;
  dir: string;
  reason: string;
  author: string;
  authorKind: AuthorKind;
  /**
   * An SVG to store with the document. Undefined means "the checkout's own
   * SVG if it was exported after the last save of the document", null means
   * "keep the stored SVG", a path means that file.
   */
  svg?: string | null;
  jobId?: string;
}

export interface CommitResult extends PutResult {
  path: string;
  base: number | null;
}

/**
 * `catalog diagram commit <slug>`: the checkout back into the database, with
 * the base check (edge case 18). A commit whose base is no longer the latest
 * is refused, and the checkout is left exactly where it is, so nothing drawn
 * is lost; the refusal names both revisions.
 */
export async function commitDiagram(db: CatalogDatabase, store: BlobStore, input: CommitInput): Promise<CommitResult> {
  const paths = checkoutPaths(input.slug, input.dir);
  const record = await readCheckoutRecord(paths);
  if (record === null) {
    throw new DiagramError(
      "no-checkout",
      `there is no checkout of ${input.slug} in ${paths.dir}: nothing records which revision a commit ` +
        `would start from. Run \`catalog diagram checkout ${input.slug}\` first.`,
    );
  }
  if ((await fileHash(paths.tldr)) === null) {
    throw new DiagramError("no-checkout", `${paths.tldr} does not exist, so there is nothing to commit.`);
  }

  let svg: string | null;
  if (input.svg !== undefined) {
    svg = input.svg;
  } else {
    // The checkout's own SVG counts only when it was exported since the
    // checkout wrote one and not before the document's last save: otherwise
    // it is the SVG of some earlier drawing, and storing it as current would
    // make the freshness pill lie.
    const [tldrFacts, svgFacts, svgNow] = await Promise.all([
      stat(paths.tldr),
      stat(paths.svg).catch(() => null),
      fileHash(paths.svg),
    ]);
    svg =
      svgFacts !== null && svgNow !== null && svgNow !== record.svgHash && svgFacts.mtimeMs >= tldrFacts.mtimeMs
        ? paths.svg
        : null;
  }

  const result = await putDiagram(db, store, {
    slug: input.slug,
    tldr: paths.tldr,
    svg,
    reason: input.reason,
    author: input.author,
    authorKind: input.authorKind,
    base: record.revision,
    ...(input.jobId === undefined ? {} : { jobId: input.jobId }),
  });

  const next: CheckoutRecord = {
    slug: input.slug,
    revision: result.revision,
    documentHash: result.documentHash,
    fileHash: await fileHash(paths.tldr),
    svgHash: await fileHash(paths.svg),
    checkedOutAt: record.checkedOutAt,
  };
  await writeAtomic(paths.record, Buffer.from(`${JSON.stringify(next, null, 2)}\n`));
  return { ...result, path: paths.tldr, base: record.revision };
}
