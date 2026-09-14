import { stat } from "node:fs/promises";
import path from "node:path";

import {
  asset,
  assetConcept,
  assetDerivation,
  assetJob,
  assetTopic,
  concept,
  job as jobTable,
  type NewAsset,
} from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";

import { withDatabase, type CatalogDatabase } from "../db";
import { REPO_ROOT } from "../env";
import {
  ASSETS_DIR,
  diagramAsset,
  isDiagramExtension,
  resolveSubject,
  type DiagramExtension,
  type Subject,
} from "../index/diagrams";
import { IndexError, IndexErrors } from "../index/errors";
import { fileFacts } from "../index/files";
import { ASSET_PREFIX } from "../index/source";
import { readDiagram } from "../index/tldr";
import { loadVocabulary } from "../index/vocabulary";
import { updateSet } from "../index/writer";

/**
 * `catalog assert-output --job <id> --path <p>`: one file into the catalog,
 * with the job that made it recorded beside it.
 *
 * This is the studio's whole write path. It is deliberately not
 * `catalog index --only diagrams`, which is a sweep of the directory that also
 * prunes: one job's write-back would become a rebuild of the source, and it
 * cannot write `asset_job` at all, because `index` knows nothing about jobs and
 * the provenance would land outside the transaction that made the asset row.
 *
 * What it does reuse is the reader. `resolveSubject` and `diagramAsset` are the
 * same functions the full index calls, so there is one implementation of what a
 * diagram asset row looks like and one implementation of "a `.tldr` with no
 * topic in its metadata is refused by name".
 *
 * The cost is kept rather than hidden: a `.tldr` deleted outside the studio
 * leaves its `asset` row in place, because nothing but a full index prunes.
 *
 * Three things make a retried assert idempotent. The asset id is a pure
 * function of the path, so asserting twice is one upsert twice. `asset_job` is
 * keyed by `(asset_id, job_id)`, so a second assert of the same file by the
 * same job updates the hash rather than adding a row. And the link rows are
 * replaced within the scope of this one asset, never appended to.
 */

export interface AssertOutputOptions {
  jobId: string;
  /** Repo-relative, e.g. `learn/assets/dot-product.tldr`. */
  path: string;
  repoRoot?: string;
}

export interface AssertOutputResult {
  ok: true;
  job: string;
  path: string;
  assetId: string;
  kind: string;
  topic: string;
  concepts: string[];
  title: string | null;
  contentHash: string;
  bytes: number;
  /** The `.tldr` this SVG was exported from, when the file is an SVG. */
  derivedFrom: string | null;
  /** False when this job had already asserted this file. */
  firstAssert: boolean;
  /** Rows written, by SQL table name. Link rows are replaced, so this is the count after. */
  written: Record<string, number>;
  /**
   * What the reader noticed but did not refuse: a metadata version newer than
   * this build reads, or a concept `content/topics.yaml` files under a
   * different topic. Reported rather than stored, like every other index note.
   */
  notes: string[];
}

/**
 * The one place a path from outside is turned into a path this command will
 * open. Absolute paths, `..`, and anything outside `learn/assets/` are refused
 * rather than normalised, because a write path that quietly rewrites what it
 * was asked for is how a job lands a file somewhere nobody looked.
 */
export function assertOutputPath(given: string): { relative: string; extension: DiagramExtension } {
  const cleaned = given.trim().replaceAll("\\", "/");
  if (cleaned === "") throw new IndexError("assert-output needs a path");
  if (path.isAbsolute(cleaned)) {
    throw new IndexError(
      `assert-output takes a repo-relative path; "${given}" is absolute. ` +
        `Pass ${ASSETS_DIR}/<name>.tldr.`,
    );
  }
  const normalised = path.posix.normalize(cleaned);
  if (normalised.startsWith("..")) {
    throw new IndexError(`"${given}" leaves the repository. Pass ${ASSETS_DIR}/<name>.tldr.`);
  }
  if (path.posix.dirname(normalised) !== ASSETS_DIR) {
    throw new IndexError(
      `"${normalised}" is not directly inside ${ASSETS_DIR}. A candidate under ` +
        `${ASSETS_DIR}/.candidates/ is asserted after it is renamed into place, not before.`,
    );
  }
  const extension = path.posix.extname(normalised);
  if (!isDiagramExtension(extension)) {
    throw new IndexError(
      `"${normalised}" is neither a .tldr nor a .svg, so no indexer owns it.`,
    );
  }
  return { relative: normalised, extension };
}

/**
 * The paths one job is allowed to claim: the committed path it leased, and the
 * SVG exported beside it.
 *
 * Without this a job could attach itself to any file in the directory, and
 * `asset_job` would be a record of what an agent said rather than of what this
 * job was asked to produce.
 */
export function claimablePaths(targetPath: string): string[] {
  const extension = path.posix.extname(targetPath);
  if (extension !== ".tldr") return [targetPath];
  const stem = targetPath.slice(0, -extension.length);
  return [targetPath, `${stem}.svg`];
}

/** What one file resolved to, before anything is written. */
interface Resolved {
  relative: string;
  absolute: string;
  extension: DiagramExtension;
  subject: Subject;
  /** Asset id of the `.tldr` an SVG came from, or null for a `.tldr`. */
  sourceAssetId: string | null;
  notes: string[];
}

async function resolveFile(
  db: CatalogDatabase,
  repoRoot: string,
  relative: string,
  extension: DiagramExtension,
): Promise<Resolved> {
  const absolute = path.join(repoRoot, relative);
  const exists = await stat(absolute).catch(() => null);
  if (exists === null || !exists.isFile()) {
    throw new IndexError(`${relative} does not exist, so there is nothing to assert.`);
  }

  // An SVG carries no metadata of its own: the `.tldr` beside it is the source
  // of truth, and inheriting from it is what keeps an export that fell behind
  // showing up as one file out of date rather than two files disagreeing.
  const stem = relative.slice(0, -extension.length);
  const sourceRelative = `${stem}.tldr`;
  const metaRelative = extension === ".svg" ? sourceRelative : relative;
  const metaAbsolute = path.join(repoRoot, metaRelative);

  if (extension === ".svg" && (await stat(metaAbsolute).catch(() => null)) === null) {
    throw new IndexError(
      `${relative} has no ${sourceRelative} beside it, so nothing says what it is about. ` +
        `A job's SVG is exported from its .tldr; assert that first.`,
    );
  }

  const vocabulary = await loadVocabulary(repoRoot);
  const known = new Set((await db.select({ slug: concept.slug }).from(concept)).map((r) => r.slug));
  const problems = new IndexErrors();
  const notes: string[] = [];
  const entry = await readDiagram(repoRoot, metaAbsolute);
  const subject = resolveSubject(entry.meta, metaRelative, known, vocabulary, problems, notes);
  problems.throwIfAny(`${relative} (stamped by ${metaRelative})`);
  if (subject === null) {
    // `resolveSubject` records the reason before returning null, so this is
    // only reachable if it ever stops doing that.
    throw new IndexError(`${metaRelative} could not be resolved to a topic.`);
  }

  let sourceAssetId: string | null = null;
  if (extension === ".svg") {
    sourceAssetId = `${ASSET_PREFIX.diagrams}${sourceRelative}`;
    const source = await db
      .select({ id: asset.id })
      .from(asset)
      .where(eq(asset.id, sourceAssetId))
      .limit(1);
    if (source.length === 0) {
      throw new IndexError(
        `${sourceRelative} is not in the catalog yet, so ${relative} has nothing to be ` +
          `derived from. Assert the .tldr first.`,
      );
    }
  }

  return { relative, absolute, extension, subject, sourceAssetId, notes };
}

/**
 * The write path itself, against a connection or a transaction the caller owns.
 *
 * `catalog job accept` calls this inside its own transaction, so accepting and
 * recording what was accepted either both happen or neither does. Everything
 * here is therefore written to be safe to nest: it opens no transaction of its
 * own.
 */
export async function assertOutput(
  db: CatalogDatabase,
  options: AssertOutputOptions,
): Promise<AssertOutputResult> {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const { relative, extension } = assertOutputPath(options.path);

  {
    const found = await db
      .select()
      .from(jobTable)
      .where(eq(jobTable.id, options.jobId))
      .limit(1);
    const job = found[0];
    if (job === undefined) {
      throw new IndexError(`no job "${options.jobId}". \`catalog job ls\` lists them.`);
    }

    const claimable = claimablePaths(job.targetPath);
    if (!claimable.includes(relative)) {
      throw new IndexError(
        `job ${job.id} targets ${job.targetPath}, so it cannot claim ${relative}. ` +
          `It may assert ${claimable.join(" or ")}.`,
      );
    }

    const resolved = await resolveFile(db, repoRoot, relative, extension);

    // The second half of "refuse, never skip" for a topic slug. The first is
    // the foreign key at enqueue, which stops a brief naming a topic that does
    // not exist; this stops a job landing a file stamped with a different one
    // from the one it was asked for.
    if (resolved.subject.topicSlug !== job.topicSlug) {
      throw new IndexError(
        `${relative} is stamped with topic "${resolved.subject.topicSlug}" but job ${job.id} ` +
          `was enqueued under "${job.topicSlug}". Restamp the diagram, or enqueue the job ` +
          `under the topic it actually drew.`,
      );
    }

    const facts = await fileFacts(resolved.absolute);
    const row: NewAsset = diagramAsset(relative, extension, facts, resolved.subject.title);
    const written: Record<string, number> = {};

    const tx = db;
    const firstAssert = await (async () => {
      await tx
        .insert(asset)
        .values(row)
        .onConflictDoUpdate({ target: asset.id, set: updateSet(asset) });
      written.asset = 1;

      // Replaced, not upserted, and scoped to this one asset: a topic or a
      // concept the diagram stopped naming has to go away, and an upsert keeps
      // it forever. The scope is why this cannot disturb another source's rows.
      await tx.delete(assetTopic).where(eq(assetTopic.assetId, row.id));
      await tx.insert(assetTopic).values({ assetId: row.id, topicSlug: resolved.subject.topicSlug });
      written.asset_topic = 1;

      await tx.delete(assetConcept).where(eq(assetConcept.assetId, row.id));
      if (resolved.subject.concepts.length > 0) {
        await tx
          .insert(assetConcept)
          .values(
            resolved.subject.concepts.map((conceptSlug) => ({ assetId: row.id, conceptSlug })),
          );
      }
      written.asset_concept = resolved.subject.concepts.length;

      await tx.delete(assetDerivation).where(eq(assetDerivation.assetId, row.id));
      if (resolved.sourceAssetId !== null) {
        await tx
          .insert(assetDerivation)
          .values({ assetId: row.id, sourceAssetId: resolved.sourceAssetId });
        written.asset_derivation = 1;
      }

      const existing = await tx
        .select({ assetId: assetJob.assetId })
        .from(assetJob)
        .where(sql`${assetJob.assetId} = ${row.id} and ${assetJob.jobId} = ${job.id}`)
        .limit(1);
      await tx
        .insert(assetJob)
        .values({
          assetId: row.id,
          jobId: job.id,
          contentHash: facts.contentHash,
          bytes: facts.bytes,
          writtenAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [assetJob.assetId, assetJob.jobId],
          set: {
            contentHash: sql`excluded."content_hash"`,
            bytes: sql`excluded."bytes"`,
            writtenAt: sql`excluded."written_at"`,
            updatedAt: sql`now()`,
          },
        });
      written.asset_job = 1;
      return existing.length === 0;
    })();

    return {
      ok: true as const,
      job: job.id,
      path: relative,
      assetId: row.id,
      kind: row.kind,
      topic: resolved.subject.topicSlug,
      concepts: resolved.subject.concepts,
      title: row.title ?? null,
      contentHash: facts.contentHash,
      bytes: facts.bytes,
      derivedFrom: resolved.sourceAssetId,
      firstAssert,
      written,
      notes: resolved.notes,
    };
  }
}

/** The command: one connection, one transaction, one file. */
export async function runAssertOutput(
  options: AssertOutputOptions,
): Promise<AssertOutputResult> {
  return withDatabase(({ db }) => db.transaction((tx) => assertOutput(tx, options)));
}

export function formatAssertOutput(result: AssertOutputResult): string {
  const lines = [
    `${result.firstAssert ? "asserted" : "re-asserted"} ${result.path}`,
    `  asset    ${result.assetId} (${result.kind})`,
    `  job      ${result.job}`,
    `  topic    ${result.topic}`,
    `  concepts ${result.concepts.length === 0 ? "(none)" : result.concepts.join(", ")}`,
    `  bytes    ${result.bytes}  sha256 ${result.contentHash.slice(0, 12)}…`,
  ];
  if (result.derivedFrom !== null) lines.push(`  from     ${result.derivedFrom}`);
  for (const note of result.notes) lines.push(`  note     ${note}`);
  return lines.join("\n");
}
