import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

import {
  MIRROR_COMPARISONS,
  MIRROR_STATUSES,
  type MirrorComparison,
  type MirrorStatus,
  type NewMirror,
} from "@self-learn/schema";

import { IndexError } from "./errors";
import { manimkcCliPath, missingCli } from "./manimkc";
import type { Indexer, SourceResult } from "./source";

/**
 * Where each deliverable has reached, via `manimkc mirrors --json`.
 *
 * **Videos never enter the database as bytes.** A deliverable is tens of
 * megabytes and lives in one place; what a catalogue can usefully hold is
 * whether the copies on Google Drive and Seafile exist and are the same file.
 * That comparison is manimkc's, because it owns the layout (`<dest>/manimkc/`
 * with the leading `out/` stripped), the hash cache, and the knowledge that a
 * Drive placeholder will not open and has to be judged by size and mtime
 * instead. Re-deriving any of that here would be a second copy free to drift.
 *
 * **The join is one literal string.** Every ledger key is
 * `out/<domain>/<topic>/<name>.mp4`, relative to the report's own `outRoot`,
 * and it is exactly the `path` the manimkc indexer stored on the asset row.
 * Neither side rewrites it. Nothing here resolves those strings against a
 * filesystem at all — the comparison already happened in manimkc, and what
 * reaches this file is its verdict — so `outRoot` is carried into
 * `index_run.metadata` for the record rather than joined onto anything.
 *
 * That both reports use the same base is what keeps the join sound: they are
 * two subcommands of one CLI reading one `$MANIMKC_HOME`, and `topics`
 * derives the very list `mirrors` audits. If that ever stopped holding, every
 * single path would go unmatched at once rather than a few, which is why the
 * note below says so.
 *
 * A ledger path with no asset is reported and skipped rather than refused: the
 * ledger lists the sidecars a topic is *supposed* to have, most of which do not
 * exist yet, and refusing those would make the source unrunnable for a year.
 *
 * **An unreachable destination is not news.** A laptop with Drive signed out,
 * or CI, has nothing to audit. Those rows are left exactly as they were, with
 * the `checked_at` that says when they were last true, and which destinations
 * the run could actually see goes into `index_run.metadata` so nothing reads
 * old rows as a fresh audit.
 */

const run = promisify(execFile);

const STATUSES = new Set<string>(MIRROR_STATUSES);
const COMPARISONS = new Set<string>(MIRROR_COMPARISONS);

/** One file's entry under `destinations.<slug>.files`. */
interface LedgerFile {
  bytes?: unknown;
  sha256?: unknown;
  mtime?: unknown;
  status?: unknown;
  compared?: unknown;
  unreadable?: unknown;
}

interface LedgerDestination {
  root?: unknown;
  target?: unknown;
  reachable?: unknown;
  checked?: unknown;
  files?: Record<string, LedgerFile>;
}

export interface MirrorsReport {
  /**
   * Absolute path the ledger's `out/…` keys are relative to: manimkc's
   * `$MANIMKC_HOME`, which defaults to its checkout root. Recorded, never
   * joined — see the note on the literal-string join above. Optional only for
   * defensive parsing; every version of the CLI this repo pins reports it.
   */
  outRoot?: unknown;
  destinations: Record<string, LedgerDestination>;
  summary?: Record<string, Record<string, unknown>>;
}

/** What the run saw of one destination, for `index_run.metadata`. */
export interface DestinationRun {
  destination: string;
  root: string;
  reachable: boolean;
  /** ISO instant of this audit, or null for a destination it could not read. */
  checked: string | null;
  /** Files it wrote a row for. Zero for an unreachable destination. */
  files: number;
}

/**
 * `manimkc mirrors --json`, parsed. Split out so a test can feed the indexer a
 * captured ledger instead of spawning Python against a real Drive mount.
 */
export async function readMirrorsReport(
  repoRoot: string,
  manimkcRoot: string,
): Promise<MirrorsReport> {
  const cli = manimkcCliPath(repoRoot);
  if (!existsSync(cli)) throw missingCli(repoRoot);
  if (!existsSync(manimkcRoot)) {
    throw new IndexError(`--manimkc-root ${manimkcRoot} does not exist`);
  }

  let stdout: string;
  try {
    // `--root` is global and must precede the subcommand, and the ledger is one
    // JSON document over every deliverable on every mirror, so the 1 MB default
    // maxBuffer is not much margin.
    ({ stdout } = await run("python3", [cli, "--root", manimkcRoot, "mirrors", "--json"], {
      maxBuffer: 32 * 1024 * 1024,
    }));
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new IndexError(
      `\`manimkc mirrors --json\` failed against ${manimkcRoot}\n  ${
        stderr || (error as Error).message
      }`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new IndexError(`\`manimkc mirrors --json\` did not return JSON`);
  }
  const report = parsed as MirrorsReport;
  if (typeof report.destinations !== "object" || report.destinations === null) {
    throw new IndexError(`\`manimkc mirrors --json\` returned no "destinations" object`);
  }
  return report;
}

export const mirrorsIndexer: Indexer = {
  source: "mirrors",
  owns: [],
  root: ({ manimkcRoot }) => manimkcRoot,

  read: async ({ repoRoot, manimkcRoot, knownAssets }) => {
    const report = await readMirrorsReport(repoRoot, manimkcRoot);
    return buildMirrorRows(report, await knownAssets("manimkc"));
  },
};

/**
 * The pure half: a ledger plus the manimkc asset paths become rows. Separated
 * from the subprocess so the behaviour is testable against a captured ledger,
 * which is the only way to test an unreachable Drive on a machine that has one.
 */
export function buildMirrorRows(
  report: MirrorsReport,
  assetsByPath: ReadonlyMap<string, string>,
): SourceResult {
  const rows: NewMirror[] = [];
  const destinations: DestinationRun[] = [];
  const notes: string[] = [];
  /** Ledger paths matching no asset, collected once rather than per destination. */
  const unmatched = new Set<string>();

  for (const [slug, entry] of Object.entries(report.destinations)) {
    const root = typeof entry?.root === "string" ? entry.root : "";
    const reachable = entry?.reachable === true;
    const checked = typeof entry?.checked === "string" ? entry.checked : null;
    if (!reachable) {
      destinations.push({ destination: slug, root, reachable: false, checked: null, files: 0 });
      notes.push(
        `${slug} (${root || "no root configured"}) was not reachable, so its rows were ` +
          `left as the last audit wrote them.`,
      );
      continue;
    }

    const checkedAt = instantOf(checked);
    let written = 0;
    for (const [rel, file] of Object.entries(entry.files ?? {})) {
      const assetId = assetsByPath.get(rel);
      if (assetId === undefined) {
        unmatched.add(rel);
        continue;
      }
      rows.push({
        assetId,
        destination: slug,
        root,
        status: statusOf(file?.status),
        compared: comparisonOf(file?.compared),
        bytes: typeof file?.bytes === "number" ? file.bytes : null,
        mtime: epochOf(file?.mtime),
        checkedAt,
      });
      written += 1;
    }
    destinations.push({ destination: slug, root, reachable: true, checked, files: written });
  }

  if (destinations.length === 0) {
    notes.push(
      `no destinations configured in the manimkc checkout: set MANIMKC_DRIVE_DIR or ` +
        `MANIMKC_SEAFILE_DIR there. Nothing was written or removed.`,
    );
  }
  if (unmatched.size > 0) {
    const shown = [...unmatched].sort().slice(0, 5);
    notes.push(
      `${unmatched.size} ledger path(s) match no manimkc asset and were skipped: ` +
        `${shown.join(", ")}${unmatched.size > shown.length ? ", …" : ""}. ` +
        `These are sidecars the ledger expects and no render has produced yet.` +
        diagnosis(rows.length, assetsByPath.size),
    );
  }
  for (const entry of destinations) {
    if (!entry.reachable) continue;
    notes.push(`${entry.destination} ${entry.files} file(s) recorded, audited ${entry.checked}`);
  }

  return {
    rows: { mirror: rows },
    notes,
    // Only the destinations this run could read are replaced. Everything else
    // keeps the rows it had, which is the whole reason this is not a plain
    // clear-and-reinsert like the other link tables.
    scope: { mirrorDestinations: destinations.filter((d) => d.reachable).map((d) => d.destination) },
    // `outRoot` says which data root the audit describes. The mirror rows are
    // about files that may not live under the checkout `source_root` names, and
    // without this the run record cannot say where they were.
    metadata: { destinations, outRoot: typeof report.outRoot === "string" ? report.outRoot : null },
  };
}

/**
 * The extra sentence when nothing matched, and only then.
 *
 * A handful of unmatched paths is the ordinary state: the ledger lists the
 * sidecars a topic is *supposed* to have and most are not rendered. Zero
 * matches out of hundreds is a different animal and should not read the same,
 * but the two ways of getting there want opposite advice, so they are told
 * apart rather than lumped under the louder one:
 *
 * an empty `assetsByPath` means manimkc has indexed nothing at all — a fresh
 * database, or a data root with no renders in it — and pointing that at a
 * base disagreement would send the reader looking for a bug that is not there;
 *
 * assets that exist and still match nothing is the real mismatch, and the only
 * base both sides can disagree about is manimkc's data root.
 */
function diagnosis(matched: number, knownAssets: number): string {
  if (matched > 0) return "";
  if (knownAssets === 0) {
    return (
      ` No manimkc assets are indexed at all, so there was nothing to match against: ` +
      `run the \`manimkc\` source (it now runs ahead of this one automatically) ` +
      `or render something first.`
    );
  }
  return (
    ` None of the ${knownAssets} manimkc asset path(s) matched, which is a base ` +
    `disagreement rather than absent sidecars: the ledger and the stored paths ` +
    `were produced against different data roots. Re-index \`manimkc\`.`
  );
}

function statusOf(value: unknown): MirrorStatus {
  return typeof value === "string" && STATUSES.has(value) ? (value as MirrorStatus) : "unknown";
}

/** The ledger writes `null` when nothing was compared; the column says `none`. */
function comparisonOf(value: unknown): MirrorComparison {
  return typeof value === "string" && COMPARISONS.has(value)
    ? (value as MirrorComparison)
    : "none";
}

/** `st_mtime`, a float of epoch seconds, as an instant. */
function epochOf(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const at = new Date(value * 1000);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** The ledger's `checked` stamp, falling back to now for one that will not parse. */
function instantOf(value: string | null): Date {
  if (value === null) return new Date();
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? new Date() : at;
}
