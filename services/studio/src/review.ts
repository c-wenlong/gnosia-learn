import { createHash } from "node:crypto";
import { readFile, rename, rm, stat } from "node:fs/promises";

import { canvas, EXIT, explainExit, type VerifyReport } from "./canvas";
import { jobAccept, jobDiscard } from "./catalog";
import { absolute, CANDIDATES_DIR } from "./paths";
import { run } from "./proc";
import type { JobRecord, JobStore } from "./store";

/**
 * Accept and discard: the only writes outside the candidates directory, and the
 * only ones a person asked for.
 *
 * **Everything that can fail happens before anything lands.** That ordering is
 * the whole design of this file. The alternative — rename first, export onto
 * the committed path — leaves the target replaced and the candidate gone when
 * the export fails, with the job still `awaiting_review`: a retry cannot repeat
 * a rename that already happened, and Discard cannot delete a candidate that
 * has moved. So the export and the verify run against the candidate, and only
 * then do the two renames.
 *
 * Two failure windows are left and both are recoverable by construction. A
 * failure in the export or the verify changes nothing under `learn/assets/`, so
 * Accept, Discard and a follow-up job are all still available. A failure
 * between the two renames lands a new `.tldr` beside the old `.svg`, which is
 * the SVG-stale state the UI already models: one click on Export SVG fixes it.
 */

export interface AcceptResult {
  ok: boolean;
  /** Repo-relative paths now in `learn/assets/`. */
  written: string[];
  /** False when Postgres was unreachable. The files are the output; this is derived. */
  indexed: boolean;
  note: string;
  error?: string;
}

async function sha256(file: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(file)).digest("hex");
  } catch {
    return null;
  }
}

export async function accept(store: JobStore, record: JobRecord): Promise<AcceptResult> {
  if (record.state !== "awaiting_review") {
    return {
      ok: false,
      written: [],
      indexed: false,
      note: `job ${record.id} is ${record.state}, and only a job awaiting review can be accepted`,
      error: "wrong-state",
    };
  }

  const candidate = absolute(record.candidatePath);
  if ((await stat(candidate).catch(() => null)) === null) {
    return {
      ok: false,
      written: [],
      indexed: false,
      note: `the candidate ${record.candidatePath} is gone, so there is nothing to land`,
      error: "no-candidate",
    };
  }

  // S4: a human edit that landed while the job ran. The three hashes make the
  // loss visible, and this is the only moment the question can still be asked —
  // after the rename, the file cannot answer it.
  const targetNow = await sha256(absolute(record.targetPath));
  if (targetNow !== null && targetNow !== record.targetHashBefore) {
    return {
      ok: false,
      written: [],
      indexed: false,
      note:
        `${record.targetPath} has changed since this job started, so accepting would overwrite ` +
        `an edit nobody reviewed. Compare the two and re-run the job against the current file.`,
      error: "target-moved",
    };
  }

  /* 1. The export the gate may not have got to. This is the exit-4 case. */
  if (record.gate?.svg === null || record.gate?.exportFailed === true) {
    const exported = await canvas(["export", record.candidatePath, "--svg", record.candidateSvgPath]);
    if (exported.code !== EXIT.ok) {
      return {
        ok: false,
        written: [],
        indexed: false,
        note: `the SVG still will not export (${explainExit(exported.code)}), so nothing was moved`,
        error: "export-failed",
      };
    }
  }

  /* 2. The tool's own rule: the loop does not end at export. */
  const hasSvg = (await stat(absolute(record.candidateSvgPath)).catch(() => null)) !== null;
  if (hasSvg) {
    const verified = await canvas(["verify", record.candidateSvgPath, "--json"]);
    if (verified.code !== EXIT.ok) {
      const report = (verified.json ?? {}) as VerifyReport;
      const failed = (report.checks ?? []).filter((check) => !check.ok);
      return {
        ok: false,
        written: [],
        indexed: false,
        note:
          `the exported SVG did not verify (${failed.map((c) => c.rule).join(", ") || explainExit(verified.code)}), ` +
          `so nothing was moved`,
        error: "verify-failed",
      };
    }
  }

  /* 3. The renames. Atomic, because the candidates directory is a sibling of
   *    the target and not the OS temp directory: each file is either the old
   *    one or the new one, never a half-written mix of both. */
  const written: string[] = [];
  await rename(candidate, absolute(record.targetPath));
  written.push(record.targetPath);
  if (hasSvg) {
    await rename(absolute(record.candidateSvgPath), absolute(record.targetSvgPath));
    written.push(record.targetSvgPath);
  }

  /* 4. The disk record, before the database row: rule 7, and the reason it is
   *    not simply tidiness. The files have moved by now, so a crash between
   *    here and the catalog call would otherwise leave a record saying the job
   *    is still awaiting review of a candidate that is no longer there, and a
   *    retry could neither accept nor discard it. */
  await store.update(record.id, {
    state: "accepted",
    reviewedAt: new Date().toISOString(),
    written,
    indexed: false,
  });

  /* 5. The only step that needs Postgres, and therefore the last one. */
  const indexed = await jobAccept(record.id, written);
  if (!indexed.ok) {
    await store.noteCatalogError(record.id, indexed.error ?? "accept could not be recorded");
    return {
      ok: true,
      written,
      indexed: false,
      note:
        `${written.join(" and ")} landed in learn/assets/, and the catalog did not record it: ` +
        `${indexed.error}. The files are the output and the index is derived, so a Reindex ` +
        `finishes this. Commit them yourself: git add ${written.join(" ")}`,
    };
  }

  await store.update(record.id, { indexed: true });
  return {
    ok: true,
    written,
    indexed: true,
    note:
      `${written.join(" and ")} landed in learn/assets/ and the catalog recorded ${written.length} ` +
      `output${written.length === 1 ? "" : "s"}. Committing is still yours: git add ${written.join(" ")}`,
  };
}

/** Discard: both candidates go, the lease is released, and git is the undo. */
export async function discard(store: JobStore, record: JobRecord): Promise<AcceptResult> {
  if (record.state !== "awaiting_review" && record.state !== "interrupted") {
    return {
      ok: false,
      written: [],
      indexed: false,
      note: `job ${record.id} is ${record.state}, and there is nothing to discard`,
      error: "wrong-state",
    };
  }
  await rm(absolute(record.candidatePath), { force: true });
  await rm(absolute(record.candidateSvgPath), { force: true });
  await store.update(record.id, { state: "discarded", reviewedAt: new Date().toISOString() });
  const recorded = await jobDiscard(record.id);
  if (!recorded.ok) await store.noteCatalogError(record.id, recorded.error ?? "discard not recorded");
  return {
    ok: true,
    written: [],
    indexed: recorded.ok,
    note: `the candidate is deleted. Nothing under learn/assets/ ever changed, so there is nothing to undo.`,
  };
}

/**
 * The A4 backstop: what is dirty in the working tree, ignoring the candidates
 * directory the job is allowed to write.
 *
 * Read-only `git status --porcelain` and nothing else. D6 removed the runner's
 * mutating git access on purpose, and this is not that access coming back: a
 * status writes nothing, and the reason the runner refuses rather than reverts
 * is that a revert can destroy a concurrent human edit. So it names the files
 * and fails the job, even on a zero exit, and a person decides.
 *
 * The runner takes one of these before the agent starts and one after it exits,
 * and reports the difference. The design says "anything else dirty fails the
 * job", which read literally fails every job on a laptop with unrelated work in
 * progress — and the file list it would print would be someone's own edits.
 * What the check is actually for is a file *this job* made dirty, and a
 * before-and-after is how that question is asked.
 */
export async function dirtyFiles(): Promise<string[]> {
  const status = await run("git", ["status", "--porcelain"], { timeoutMs: 30_000 }).catch(() => null);
  if (status === null || status.code !== 0) return [];
  return status.stdout
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter((file) => file !== "")
    // A renamed path is reported as `old -> new`; the new name is the one that
    // says where something landed.
    .map((file) => (file.includes(" -> ") ? (file.split(" -> ")[1] ?? file) : file))
    .map((file) => file.replaceAll('"', ""))
    .filter((file) => !file.startsWith(CANDIDATES_DIR));
}
