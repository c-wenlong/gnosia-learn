import path from "node:path";

import { fsStore } from "@self-learn/blob";

import { auditBlobs, type BlobAuditResult } from "../content/blob-audit";
import { withDatabase } from "../db";
import { blobRoot, databaseUrl, redactUrl } from "../env";

/**
 * `catalog blob audit [--fix] [--blob-root DIR]`: the connection and the
 * printing. The findings and what `--fix` does about each are in
 * `../content/blob-audit.ts`. Exits 1 while a disagreement is left standing.
 */

export interface BlobAuditCommandResult extends BlobAuditResult {
  database: string;
  blobRoot: string;
}

export async function runBlobAudit(options: { fix: boolean; blobRoot?: string }): Promise<BlobAuditCommandResult> {
  const root = options.blobRoot === undefined ? blobRoot() : path.resolve(options.blobRoot);
  const store = fsStore(root);
  const url = databaseUrl();
  return withDatabase(async ({ db }) => ({
    database: redactUrl(url),
    blobRoot: root,
    ...(await auditBlobs(db, store, { fix: options.fix })),
  }));
}

export function formatBlobAudit(result: BlobAuditCommandResult): string {
  const lines = [
    `database   ${result.database}`,
    `blob root  ${result.blobRoot} (${result.provider})`,
    `${result.rows} rows, ${result.objects} objects, ${result.findings.length} findings, ${result.outstanding} outstanding${result.fix ? "" : " (nothing changed; --fix acts)"}`,
  ];
  for (const finding of result.findings) {
    const fixed = finding.fixed === undefined ? "" : ` [${finding.fixed}]`;
    lines.push(`  ${finding.kind.padEnd(13)} ${finding.key}  ${finding.detail}${fixed}`);
  }
  return lines.join("\n");
}
