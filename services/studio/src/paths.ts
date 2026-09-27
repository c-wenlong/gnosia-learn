import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CANDIDATES_DIR } from "@self-learn/schema";

/**
 * Every path the studio builds, built here.
 *
 * This is layering rule 5 in `docs/TLDRAWKC-INTEGRATION.md`, and the reason it
 * is a rule is the bug manimkc shipped and then fixed: permission rules written
 * as relative paths stopped matching the moment its data root moved, and the
 * agent could read a real `.env` beside the one the rules named. Every rule the
 * runner writes is absolute and derived at runtime from `REPO_ROOT`, and this
 * module is the only place that resolution happens.
 *
 * The repo root is found the way `apps/web/src/data/repo-root.ts` finds it:
 * walk up until a directory holds `content/courses`. The studio does not run
 * from the repo root either — `npm run studio` starts it from wherever the
 * shell is — so `process.cwd()` is not the answer, and neither is a fixed
 * number of `..` segments, which breaks the day the service moves.
 */

function findRepoRoot(start: string): string {
  let directory = start;
  for (;;) {
    if (existsSync(path.join(directory, "content", "courses"))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(
        `no repository root above ${start}: walked up to the filesystem root without finding ` +
          `a directory holding content/courses.`,
      );
    }
    directory = parent;
  }
}

/** services/studio/ */
export const SERVICE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The repository root. Absolute, and the base of every other path here.
 *
 * `STUDIO_REPO_ROOT` overrides the walk and is read once, here, at import. It
 * is for the tests and nothing else: no request, brief or settings file can
 * reach it, and with the variable unset this resolves exactly as it did before
 * it existed. Every path below is repo-relative, so without an override the
 * suite writes its fixture diagrams into the checked-out `learn/assets/`, which
 * `services/catalog`'s end-to-end test indexes from a parallel vitest worker. A
 * fixture that exists for one index pass and is gone by the next is pruned by
 * the second, and that suite fails on a deletion it has nothing to do with.
 * `vitest.setup.ts` points this at a symlink farm under the OS temp directory.
 */
const configuredRoot = process.env.STUDIO_REPO_ROOT?.trim();
export const REPO_ROOT = configuredRoot ? path.resolve(configuredRoot) : findRepoRoot(SERVICE_ROOT);

/** Where committed diagrams live. Repo-relative, because the catalog speaks that. */
export const ASSETS_DIR = "learn/assets";

export { CANDIDATES_DIR };

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
 * `workPath`) comes back as it is, rather than glued onto the repo root.
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

/** `learn/assets/.candidates/<slug>.tldr`: where the job actually writes. */
export function candidatePath(slug: string): string {
  return `${CANDIDATES_DIR}/${slug}.tldr`;
}

export function candidateSvgPath(slug: string): string {
  return `${CANDIDATES_DIR}/${slug}.svg`;
}

/** One job's workspace: the write-ahead log, the settings file, the scratch. */
export function jobDir(jobId: string): string {
  return path.join(studioHome(), "jobs", jobId);
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
 * The one directory besides the two candidate files the agent may write to:
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
