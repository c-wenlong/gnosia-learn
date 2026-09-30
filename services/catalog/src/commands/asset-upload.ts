import { uploadAssets, type AssetUploadResult, type UploadSource } from "../content/asset-upload";
import { openBlobStore } from "../content/blob";
import { withDatabase } from "../db";
import { databaseUrl, REPO_ROOT, redactUrl } from "../env";
import { findFfmpeg } from "../poster/extract";

/**
 * `catalog asset upload --source manimkc|remotionkc|revideokc [--dry-run]`:
 * the connection, the store and the printing. What it uploads and why each
 * rule holds is in `../content/asset-upload.ts`.
 *
 * The store is the one `SELF_LEARN_HOME` names, the same one the web app
 * serves. It had a `--blob-root` flag for a scratch store, which wrote rows
 * pointing at bytes the web app never read, since the app resolves its root
 * from `SELF_LEARN_HOME` alone. A scratch run sets that variable instead, and
 * both sides follow it.
 */

export interface AssetUploadCommandOptions {
  source: UploadSource;
  dryRun: boolean;
  manimkcRoot?: string;
  remotionkcRoot?: string;
  revideokcRoot?: string;
  reason?: string;
}

export interface AssetUploadCommandResult extends AssetUploadResult {
  database: string;
  blobRoot: string;
}

export async function runAssetUpload(options: AssetUploadCommandOptions): Promise<AssetUploadCommandResult> {
  const store = openBlobStore();
  const ffmpeg = await findFfmpeg();
  const url = databaseUrl();
  return withDatabase(async ({ db }) => ({
    database: redactUrl(url),
    blobRoot: store.root,
    ...(await uploadAssets(db, {
      store,
      source: options.source,
      repoRoot: REPO_ROOT,
      // The source's own flag, else its variable or submodule (uploadAssets
      // resolves that against the repository).
      manimkcRoot: options.manimkcRoot,
      remotionkcRoot: options.remotionkcRoot,
      revideokcRoot: options.revideokcRoot,
      dryRun: options.dryRun,
      ffmpeg,
      reason: options.reason,
    })),
  }));
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function formatAssetUpload(result: AssetUploadCommandResult): string {
  const tally = new Map<string, number>();
  for (const item of result.items) tally.set(item.action, (tally.get(item.action) ?? 0) + 1);
  const lines = [
    `database   ${result.database}`,
    `blob root  ${result.blobRoot}`,
    `outRoot    ${result.outRoot}`,
    `${result.dryRun ? "dry run: nothing written. " : ""}${result.counts.videos} videos, ${result.counts.sidecars} sidecars, ${result.counts.posters} posters`,
    `  ${[...tally].map(([action, n]) => `${action} ${n}`).join(", ")}`,
  ];
  if (!result.dryRun) {
    lines.push(`  ${result.uploaded} objects uploaded (${megabytes(result.uploadedBytes)}), ${result.rowsWritten} asset rows written`);
  }
  if (result.postersSkipped !== null) lines.push(`posters skipped: ${result.postersSkipped}`);
  if (result.bytesCapEstimate !== null) lines.push(`bytes cap: ${result.bytesCapEstimate}`);
  for (const item of result.items) {
    if (item.action === "refused") lines.push(`REFUSED ${item.id}: ${item.detail ?? ""}`);
  }
  return lines.join("\n");
}
