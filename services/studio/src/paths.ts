import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every path the studio builds, built here.
 *
 * This is layering rule 5 in `docs/TLDRAWKC-INTEGRATION.md`, and the reason it
 * is a rule is the bug manimkc shipped and then fixed: permission rules written
 * as relative paths stopped matching the moment its data root moved, and the
 * agent could read a real `.env` beside the one the rules named. Every rule the
 * runner writes is absolute and derived at runtime from `REPO_ROOT` or
 * `studioHome()`, and this module is the only place that resolution happens.
 *
 * The repo root is where this code sits, two levels above `services/studio/`,
 * the way `services/catalog/src/env.ts` finds it. It used to be found by
 * walking up for `content/courses`, but what the studio needs a root for is
 * code: the directory `npm run canvas` and `npm run catalog` run from, the
 * agent's working directory, the `.git` it may not edit and
 * `services/catalog/.env`. Content lives in the database, and phase 3 of
 * docs/CONTENT-MIGRATION.md deletes the folder the walk looked for.
 * `process.cwd()` is still not the answer: `npm run studio` starts it from
 * wherever the shell is.
 */

/** services/studio/ */
export const SERVICE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The repository root. Absolute, and the base of every other path here.
 *
 * `STUDIO_REPO_ROOT` overrides it and is read once, here, at import. It is
 * for the tests and nothing else: no request, brief or settings file can reach
 * it, and with the variable unset this is the checkout this file sits in. The
 * tests need it because anything resolved against the root (the default
 * `STUDIO_HOME`, a repo-relative path a legacy record names) would otherwise
 * land in the checkout, which `services/catalog`'s end-to-end test reads from
 * a parallel vitest worker. `vitest.setup.ts` points this at a symlink farm
 * under the OS temp directory and checks that it was honoured.
 */
const configuredRoot = process.env.STUDIO_REPO_ROOT?.trim();
export const REPO_ROOT = configuredRoot ? path.resolve(configuredRoot) : path.resolve(SERVICE_ROOT, "..", "..");

/**
 * The directory in a diagram's logical name, `learn/assets/<slug>.tldr`
 * (D11 of docs/CONTENT-MIGRATION.md). The catalog's asset ids and the job
 * lease are keyed on it; a diagram itself is rows.
 */
export const ASSETS_DIR = "learn/assets";

/**
 * The runner's own state: job workspaces, write-ahead logs, settings files.
 *
 * Outside `learn/` on purpose — none of it is knowledge base — and gitignored,
 * because a job workspace holds an agent transcript and a permission file that
 * names this machine's home directory. `STUDIO_HOME` moves it, the way
 * `MANIMKC_HOME` moves manimkc's data root, and for the same reason: the data a
 * generator produces should not be pinned inside a checkout it can be moved out
 * of.
 */
export function studioHome(): string {
  const configured = process.env.STUDIO_HOME?.trim();
  if (!configured) return path.join(REPO_ROOT, ".studio");
  const expanded =
    configured === "~" || configured.startsWith("~/")
      ? path.join(process.env.HOME ?? "", configured.slice(1))
      : configured;
  return path.resolve(REPO_ROOT, expanded);
}

/**
 * An absolute path for a repo-relative one. The only join that crosses that
 * line. A path that is already absolute (a checkout under `$STUDIO_HOME`, see
 * `workPath`, or a job's candidate, see `candidatePath`) comes back as it is,
 * rather than glued onto the repo root.
 */
export function absolute(relative: string): string {
  return path.resolve(REPO_ROOT, relative);
}

/** `learn/assets/<slug>.tldr`: the committed path a job intends to land on. */
export function targetPath(slug: string): string {
  return `${ASSETS_DIR}/${slug}.tldr`;
}

/** The SVG beside it, which accept claims alongside the `.tldr`. */
export function targetSvgPath(slug: string): string {
  return `${ASSETS_DIR}/${slug}.svg`;
}

/**
 * Where diagrams are checked out to: `$STUDIO_HOME/work/`, the directory
 * `catalog diagram checkout` writes to by default (Track D of
 * docs/CONTENT-MIGRATION.md). A diagram lives in the database now, and every
 * `canvas` verb and the mirror take a file, so they run on this copy, and an
 * edit reaches the database only through `catalog diagram commit`.
 *
 * `job.target_path` keeps its value, `learn/assets/<slug>.tldr`, as the
 * logical name the lease, the job rows and the asset ids all use (D11); the
 * checkout is where that name is materialised.
 */
export function workDir(): string {
  return path.join(studioHome(), "work");
}

/** `$STUDIO_HOME/work/<slug>.tldr`, absolute. */
export function workPath(slug: string): string {
  return path.join(workDir(), `${slug}.tldr`);
}

/** The SVG a checkout writes beside the document, and `export` writes to. */
export function workSvgPath(slug: string): string {
  return path.join(workDir(), `${slug}.svg`);
}

/** The slug a logical name like `learn/assets/<slug>.tldr` names, or null. */
export function slugOf(target: string): string | null {
  const match = new RegExp(`^${ASSETS_DIR}/([a-z0-9][a-z0-9-]*)\\.(tldr|svg)$`).exec(target);
  return match?.[1] ?? null;
}

/** One job's workspace: the write-ahead log, the settings file, the scratch. */
export function jobDir(jobId: string): string {
  return path.join(studioHome(), "jobs", jobId);
}

/**
 * Where a job draws: `$STUDIO_HOME/jobs/<id>/candidate/`, absolute.
 *
 * Inside the job's own workspace, so no two jobs ever share a path. The
 * candidates used to sit at `learn/assets/.candidates/<slug>`, one per slug,
 * and a resume had to hash the file to tell its own half-drawn work from a
 * later job's leftovers at the same path; here the path names the job.
 *
 * A directory of its own rather than the workspace root, because the root
 * holds the runner's records (`job.json`, the transcript, this job's permission
 * file) and the agent is given this directory as a working directory. Keeping
 * the two apart means the agent can be handed its two files without being
 * handed the records beside them.
 */
export function candidateDir(jobId: string): string {
  return path.join(jobDir(jobId), "candidate");
}

/** `$STUDIO_HOME/jobs/<id>/candidate/<slug>.tldr`: the document the agent draws. */
export function candidatePath(jobId: string, slug: string): string {
  return path.join(candidateDir(jobId), `${slug}.tldr`);
}

/** The SVG it exports beside the document. */
export function candidateSvgPath(jobId: string, slug: string): string {
  return path.join(candidateDir(jobId), `${slug}.svg`);
}

/**
 * The candidate as the catalog records it: `jobs/<id>/candidate/<slug>.tldr`,
 * relative to `$STUDIO_HOME`.
 *
 * Not the absolute path. `job.candidate_path` would then carry this machine's
 * home directory into a database that moves to the cloud at go-live, and would
 * stop naming the file the day `STUDIO_HOME` moves. The catalog derives the
 * same string from the job id and the target, which is how it checks it.
 */
export function candidateRef(jobId: string, slug: string): string {
  return path.posix.join("jobs", jobId, "candidate", `${slug}.tldr`);
}

/**
 * True for a record written before candidates moved into the job workspace,
 * whose paths are repo-relative under `learn/assets/.candidates/`.
 *
 * Such a record still works everywhere a path is only resolved, since
 * `absolute` resolves a relative path against the repository, so an accept, a
 * discard or a resume of one reads the file where it was written. Only a job
 * that has not started yet is re-pointed at its own workspace by the runner
 * before anything is drawn; there is no file to move, only the record's paths.
 */
export function isLegacyCandidate(candidate: string): boolean {
  return !path.isAbsolute(candidate);
}

export function jobJsonPath(jobId: string): string {
  return path.join(jobDir(jobId), "job.json");
}

export function sessionLogPath(jobId: string): string {
  return path.join(jobDir(jobId), "session.ndjson");
}

export function settingsPath(jobId: string): string {
  return path.join(jobDir(jobId), "agent-settings.json");
}

/**
 * The one directory besides its two candidate files the agent may write to:
 * its snippets, its screenshots, a mermaid source it was handed.
 */
export function scratchDir(jobId: string): string {
  return path.join(jobDir(jobId), "scratch");
}

/**
 * The agent's `TMPDIR`, and the hook cancellation hangs on.
 *
 * tldrawkc has no `--user-data-dir` flag, so the design's fallback rule — sweep
 * Chromium whose profile sits under the job scratch — has nothing to match on
 * its own. Playwright creates its throwaway profile under `os.tmpdir()`, which
 * honours `TMPDIR`, so pointing the agent's `TMPDIR` here puts every browser
 * the job launches under a directory named after the job. The sweep then has a
 * string that belongs to exactly one job and to nothing else on the machine.
 */
export function tmpDir(jobId: string): string {
  return path.join(jobDir(jobId), "tmp");
}

/**
 * The two screenshots the comparison screen shows, before and after.
 *
 * Inside the job workspace, which is under `$STUDIO_HOME` and gitignored, and
 * never under `learn/assets/`. A picture taken so two versions can be compared
 * is not a deliverable: the committed artifacts are the `.tldr` and the `.svg`,
 * a person commits them by hand (D6), and a `git status` listing a PNG nobody
 * asked for would be the studio lying about what a job produced. It also means
 * the pictures go when the workspace goes, which is right — they are about one
 * job and are meaningless without it.
 */
export function shotPath(jobId: string, which: "before" | "after"): string {
  return path.join(jobDir(jobId), `${which}.png`);
}

/** Where a failed job's partial artifacts are moved, so a person can look. */
export function rejectedDir(jobId: string): string {
  return path.join(jobDir(jobId), "rejected");
}

/** The mermaid source a brief carried, written to scratch and never to the prompt. */
export function mermaidPath(jobId: string): string {
  return path.join(scratchDir(jobId), "source.mmd");
}
