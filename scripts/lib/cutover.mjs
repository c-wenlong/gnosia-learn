// The cut-over's own pieces (docs/CONTENT-MIGRATION.md, "Cut-over day, as a
// script"): the tag that keeps every file version reachable once content/ and
// learn/ leave the tree, and the byte comparison of a fresh export with the
// tree that goes into the parity report. scripts/flip-rehearsal.mjs --cutover
// runs them; they live here so a test can run them on a throwaway repository.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { exec } from './pg.mjs';

/** The tag on the last commit that has the files, named by open question 4 of the plan. */
export const FINAL_TAG = 'content-files-final';

/** The folders the cut-over removes from the tree, and the only ones the tag is about. */
export const CONTENT_FOLDERS = Object.freeze(['content', 'learn']);

async function git(repo, ...args) {
  const ran = await exec('git', ['-C', repo, ...args]);
  return { ok: ran.status === 0, out: ran.stdout.trimEnd(), err: ran.stderr.trim() };
}

/**
 * What stands in the way of tagging `repo`'s HEAD, one sentence each, and the
 * untracked files under content/ and learn/ (in the database and its export,
 * never in the tag). Read-only.
 *
 * Refused: the tag already exists (here, or on `remote` when one is named and
 * answers), HEAD has no content/ to keep (the cut-over merged already), or a
 * tracked file under content/ or learn/ differs from HEAD, since the tag would
 * then not be the tree the import and parity just read. Edits elsewhere in
 * the checkout do not change what the tag keeps, and another session may
 * hold some, so they are not refused.
 */
export async function tagProblems(repo, { remote = null } = {}) {
  const problems = [];
  const warnings = [];
  const head = await git(repo, 'rev-parse', '--verify', 'HEAD');
  if (!head.ok) return { problems: [`${repo} is not a git checkout with a commit: ${head.err}`], warnings, untracked: [], head: null };
  const local = await git(repo, 'rev-parse', '-q', '--verify', `refs/tags/${FINAL_TAG}`);
  if (local.ok) problems.push(`the tag ${FINAL_TAG} already exists here, at ${local.out.slice(0, 12)}; a cut-over tags once`);
  if (remote !== null) {
    const listed = await git(repo, 'ls-remote', '--tags', remote, `refs/tags/${FINAL_TAG}`);
    if (!listed.ok) warnings.push(`could not ask ${remote} whether ${FINAL_TAG} exists there: ${listed.err.split('\n').at(-1)}`);
    else if (listed.out !== '') problems.push(`the tag ${FINAL_TAG} already exists on ${remote}; a cut-over tags once`);
  }
  const kept = await git(repo, 'ls-tree', '--name-only', 'HEAD', '--', 'content/topics.yaml');
  if (!kept.ok || kept.out === '') {
    problems.push(`HEAD (${head.out.slice(0, 12)}) has no content/topics.yaml: there are no files left to tag, so the cut-over has merged here already`);
  }
  const status = await git(repo, 'status', '--porcelain', '--untracked-files=all', '--', ...CONTENT_FOLDERS);
  if (!status.ok) problems.push(`git status failed in ${repo}: ${status.err}`);
  const lines = status.ok ? status.out.split('\n').filter((line) => line !== '') : [];
  const edited = lines.filter((line) => !line.startsWith('??'));
  if (edited.length > 0) {
    problems.push(
      `content/ or learn/ differs from HEAD, so the tag would not hold the files just compared:\n  ${edited.join('\n  ')}\n` +
        'Commit them (an export after flip day is committed) or put them back, then run again',
    );
  }
  const untracked = lines.filter((line) => line.startsWith('??')).map((line) => line.slice(3));
  return { problems, warnings, untracked, head: head.out };
}

/**
 * Tag HEAD with FINAL_TAG after checking `tagProblems` once more; never
 * pushed. A lightweight tag, as the plan names it: it points at the commit,
 * and every file under content/ and learn/ stays one `git show` away.
 */
export async function makeFinalTag(repo) {
  const state = await tagProblems(repo);
  if (state.problems.length > 0) return { problem: state.problems.join('; '), tag: null, untracked: state.untracked };
  const made = await git(repo, 'tag', FINAL_TAG, state.head);
  if (!made.ok) return { problem: `git tag ${FINAL_TAG} failed: ${made.err}`, tag: null, untracked: state.untracked };
  const at = await git(repo, 'rev-parse', `${FINAL_TAG}^{commit}`);
  if (!at.ok || at.out !== state.head) {
    return { problem: `${FINAL_TAG} does not point at HEAD after tagging (${at.out || at.err})`, tag: null, untracked: state.untracked };
  }
  return { problem: null, tag: { name: FINAL_TAG, commit: state.head, repo }, untracked: state.untracked };
}

/** Every file under `root`, as forward-slash paths relative to it; `.git` left out. */
export function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(relative(root, full).split(sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}

/**
 * A fresh export compared with the tree, byte for byte. Parity is the
 * contract (entity by entity, over a canonical form); this is what the tag
 * holds against what an export writes, so a file that only differs in bytes
 * shows up in the report, and a file no export writes (a README, the old
 * map.md) is listed as the tree's own.
 */
export function compareTrees(exported, tree) {
  const fresh = listFiles(exported);
  const kept = new Set(CONTENT_FOLDERS.flatMap((folder) => listFiles(join(tree, folder)).map((p) => `${folder}/${p}`)));
  const differ = [];
  const onlyInExport = [];
  let identical = 0;
  for (const file of fresh) {
    if (!kept.has(file)) {
      onlyInExport.push(file);
      continue;
    }
    if (readFileSync(join(exported, file)).equals(readFileSync(join(tree, file)))) identical += 1;
    else differ.push(file);
  }
  const written = new Set(fresh);
  const onlyInTree = [...kept].filter((file) => !written.has(file)).sort();
  return { compared: fresh.length, identical, differ, onlyInExport, onlyInTree };
}
