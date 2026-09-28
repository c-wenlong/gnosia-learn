import { auditBlobs, type BlobAuditResult } from "../content/blob-audit";
import { openBlobStore, ownerCapsOrError, type OwnerCaps } from "../content/blob";
import { ownerIdentity, describeOwner, sameOwner } from "../content/blob-owner";
import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";

/**
 * `catalog blob audit [--fix]`: the connection and the printing. The findings
 * and what `--fix` does about each are in `../content/blob-audit.ts`. Exits 1
 * while a disagreement is left standing.
 *
 * The store is the one `SELF_LEARN_HOME` names, the same one the web app
 * serves and every upload writes. Also exits 1 while a per-owner cap cannot
 * be read, since every new upload is refused until it can. There is no flag
 * for another root: a
 * scratch audit sets `SELF_LEARN_HOME` for the whole run, so the rows it
 * reads and the store it compares them with cannot come from two places.
 */

export interface BlobAuditCommandResult extends BlobAuditResult {
  database: string;
  blobRoot: string;
  /** Whether the root's `.owner` names the database audited; null when the root has no marker yet. */
  ownRoot: boolean | null;
  /** The per-owner caps in force, or why they could not be read (every upload is refused until they can). */
  caps: OwnerCaps | { error: string };
}

export async function runBlobAudit(options: { fix: boolean }): Promise<BlobAuditCommandResult> {
  const store = openBlobStore();
  const url = databaseUrl();
  return withDatabase(async ({ db }) => {
    const result = await auditBlobs(db, store, { fix: options.fix, root: store.root });
    const self = await ownerIdentity(db);
    const caps = ownerCapsOrError();
    return {
      database: redactUrl(url),
      blobRoot: store.root,
      ownRoot: result.owner === null ? null : sameOwner(result.owner, self),
      ...result,
      caps,
    };
  });
}

/** The caps as one line, for `blob audit`, `status` and `doctor`. */
export function formatCaps(caps: OwnerCaps | { error: string }): string {
  if ("error" in caps) return `unreadable, so every new upload is refused (a re-store of a key with a row is not): ${caps.error}`;
  if (caps.bytes === null && caps.uploadsPerDay === null) return "none per owner";
  const parts = [
    caps.bytes === null ? null : `${caps.bytes} bytes stored`,
    caps.uploadsPerDay === null ? null : `${caps.uploadsPerDay} uploads a day`,
  ].filter((part) => part !== null);
  return `${parts.join(", ")} per owner`;
}

export function formatBlobAudit(result: BlobAuditCommandResult): string {
  const lines = [
    `database   ${result.database}`,
    `blob root  ${result.blobRoot} (${result.provider})`,
    `owner      ${
      result.owner === null
        ? "none recorded yet (--fix claims it for this database)"
        : `${describeOwner(result.owner)}${result.ownRoot === false ? ", not this database: its objects read as orphans here, and --fix is refused" : ""}`
    }`,
    `${result.rows} rows, ${result.objects} objects, ${result.findings.length} findings, ${result.outstanding} outstanding${result.fix ? "" : " (nothing changed; --fix acts)"}`,
    `caps       ${formatCaps(result.caps)}`,
  ];
  for (const usage of result.byOwner) {
    lines.push(
      `  ${usage.owner.padEnd(13)} ${usage.objects} objects, ${usage.bytes} bytes, ${usage.uploadsLastDay} uploaded in the last 24 hours`,
    );
  }
  for (const finding of result.findings) {
    const fixed = finding.fixed === undefined ? "" : ` [${finding.fixed}]`;
    lines.push(`  ${finding.kind.padEnd(13)} ${finding.key}  ${finding.detail}${fixed}`);
  }
  return lines.join("\n");
}
