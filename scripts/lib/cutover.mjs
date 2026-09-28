// The cut-over's own pieces (docs/CONTENT-MIGRATION.md, "Cut-over day, as a
// script"): the tag that keeps every file version reachable once content/ and
// learn/ leave the tree, the worktree at that tag the cut-over may run on, the
// check that the tree's edits are flip day's export and nothing else, and the
// byte comparison of a fresh export with the tree that goes into the parity
// report. scripts/flip-rehearsal.mjs --cutover
// runs them; they live here so a test can run them on a throwaway repository.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

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
 * The tracked edits and the untracked files under content/ and learn/, from
 * `git status -z` so a path is exactly the path (no quoting). Each edit keeps
 * its two status letters: ` M`, `M ` and `MM` are a file changed in place;
 * anything else (deleted, added, renamed, in conflict) is not. Read-only.
 */
export async function contentStatus(repo) {
  const status = await git(repo, 'status', '--porcelain', '-z', '--untracked-files=all', '--', ...CONTENT_FOLDERS);
  if (!status.ok) return { ok: false, err: status.err, edits: [], untracked: [] };
  const entries = status.out.split('\0').filter((entry) => entry !== '');
  const edits = [];
  const untracked = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const xy = entry.slice(0, 2);
    const file = entry.slice(3);
    if (xy === '??') untracked.push(file);
    else if (xy !== '!!') edits.push({ status: xy, path: file });
    // A rename or copy is followed by the path it came from.
    if (xy[0] === 'R' || xy[0] === 'C') i += 1;
  }
  return { ok: true, err: '', edits, untracked: untracked.sort() };
}

/** A tracked file changed in place, as opposed to deleted, added or renamed. */
const changedInPlace = (edit) => /^[ M][ M]$/.test(edit.status);

/**
 * Which tracked edits are flip day's export, checked against a fresh export
 * of the database in `exportDir`: an edit is one when the file was changed in
 * place and holds, byte for byte, what the export writes at that path. That
 * is the list `catalog flip` printed as "file(s) an export rewrites" (the
 * files whose committed bytes differ from the database's export), once the
 * export after it has run. Anything else is `unexpected`, with why.
 */
export function exportRewrites(exportDir, repo, edits) {
  const rewrites = [];
  const unexpected = [];
  for (const edit of edits) {
    if (!changedInPlace(edit)) {
      unexpected.push(`${edit.path} (git status "${edit.status.trim()}": an export changes files in place, never deletes, adds or renames one)`);
      continue;
    }
    let exported;
    try {
      exported = readFileSync(join(exportDir, edit.path));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      unexpected.push(`${edit.path} (no export writes this file)`);
      continue;
    }
    let held;
    try {
      held = readFileSync(join(repo, edit.path));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      unexpected.push(`${edit.path} (missing from the working tree)`);
      continue;
    }
    if (exported.equals(held)) rewrites.push(edit.path);
    else unexpected.push(`${edit.path} (its bytes are not what the database exports)`);
  }
  return { rewrites: rewrites.sort(), unexpected };
}

/** The commit `repo`'s FINAL_TAG names, peeled through an annotated tag; null when there is no such tag. */
export async function taggedCommit(repo) {
  const tagged = await git(repo, 'rev-parse', '-q', '--verify', `refs/tags/${FINAL_TAG}^{commit}`);
  return tagged.ok ? tagged.out : null;
}

/**
 * The commit `remote`'s FINAL_TAG names: `{ commit }`, null in `commit` when
 * the remote has no such tag, or `{ error }` when it could not be asked. Both
 * refs are asked for, since an annotated tag's own line names the tag object
 * and only its `^{}` line names the commit.
 */
async function remoteTaggedCommit(repo, remote) {
  const listed = await git(repo, 'ls-remote', '--tags', remote, `refs/tags/${FINAL_TAG}`, `refs/tags/${FINAL_TAG}^{}`);
  if (!listed.ok) return { error: listed.err.split('\n').at(-1) };
  let plain = null;
  let peeled = null;
  for (const line of listed.out.split('\n')) {
    const [sha, ref] = line.split('\t');
    if (ref === `refs/tags/${FINAL_TAG}`) plain = sha;
    else if (ref === `refs/tags/${FINAL_TAG}^{}`) peeled = sha;
  }
  return { commit: peeled ?? plain };
}

/**
 * What stands in the way of tagging `repo`'s HEAD, one sentence each, and the
 * untracked files under content/ and learn/ (in the database and its export,
 * never in the tag). Read-only.
 *
 * The tag may exist already, here or on `remote` (when one is named and
 * answers), when it names HEAD: that is the order the owner ran, the tag
 * made on the last commit with the files before flip day, and a worktree at
 * it holding the tree. A tag on any other commit is refused: it would keep
 * other files than the ones the cut-over compared. `tagged` says where it
 * is, so the caller neither makes it twice nor asks for it to be pushed.
 *
 * Also refused: HEAD has no content/ to keep (the cut-over merged here), and
 * a tracked file under content/ or learn/ that differs from HEAD, unless it
 * is flip day's export. `edits` says how that is judged:
 * - `'refuse'` (the default): every tracked edit is refused.
 * - `'pending'`: a file changed in place passes and is listed in `edited`,
 *   for the caller to check against a fresh export once there is one; any
 *   other edit is refused.
 * - `{ exportDir }`: each tracked edit must be flip day's export, checked
 *   against the export in that directory (`exportRewrites`); they are listed
 *   in `rewrites`.
 * Edits elsewhere in the checkout do not change what the tag keeps, and
 * another session may hold some, so they are not refused.
 */
export async function tagProblems(repo, { remote = null, edits = 'refuse' } = {}) {
  const problems = [];
  const warnings = [];
  const none = { untracked: [], edited: [], rewrites: [], tagged: { local: null, remote: null } };
  const head = await git(repo, 'rev-parse', '--verify', 'HEAD');
  if (!head.ok) return { problems: [`${repo} is not a git checkout with a commit: ${head.err}`], warnings, head: null, ...none };
  // git walks up to the nearest enclosing repository, so a directory inside
  // some other checkout answers with that checkout's HEAD. Only the top of
  // a checkout is tagged.
  const top = await git(repo, 'rev-parse', '--show-toplevel');
  if (!top.ok || realpathSync(top.out) !== realpathSync(repo)) {
    return {
      problems: [`${repo} is not the top of a git checkout (git answers for ${top.ok ? top.out : 'none'}), so it is not tagged`],
      warnings,
      head: null,
      ...none,
    };
  }
  const at = (commit) => commit.slice(0, 12);
  const tagged = { local: await taggedCommit(repo), remote: null };
  if (tagged.local !== null && tagged.local !== head.out) {
    problems.push(
      `the tag ${FINAL_TAG} already exists here, on ${at(tagged.local)}, not on HEAD (${at(head.out)}): it would keep ` +
        `other files than the ones compared. Run the cut-over on a worktree at the tag (git worktree add <dir> ${FINAL_TAG})`,
    );
  }
  if (remote !== null) {
    const listed = await remoteTaggedCommit(repo, remote);
    if ('error' in listed) warnings.push(`could not ask ${remote} whether ${FINAL_TAG} exists there: ${listed.error}`);
    else {
      tagged.remote = listed.commit;
      if (listed.commit !== null && listed.commit !== head.out) {
        problems.push(
          `the tag ${FINAL_TAG} on ${remote} names ${at(listed.commit)}, not HEAD (${at(head.out)}): it would keep other ` +
            'files than the ones compared',
        );
      }
    }
  }
  const kept = await git(repo, 'ls-tree', '--name-only', 'HEAD', '--', 'content/topics.yaml');
  if (!kept.ok || kept.out === '') {
    problems.push(`HEAD (${at(head.out)}) has no content/topics.yaml: there are no files left to tag, so the cut-over has merged here already`);
  }
  const status = await contentStatus(repo);
  if (!status.ok) problems.push(`git status failed in ${repo}: ${status.err}`);
  let edited = [];
  let rewrites = [];
  let refused = [];
  if (edits === 'refuse') {
    refused = status.edits.map((edit) => `${edit.status} ${edit.path}`);
  } else if (edits === 'pending') {
    edited = status.edits.filter(changedInPlace).map((edit) => edit.path);
    refused = status.edits.filter((edit) => !changedInPlace(edit)).map((edit) => `${edit.status} ${edit.path}`);
  } else {
    const checked = exportRewrites(edits.exportDir, repo, status.edits);
    rewrites = checked.rewrites;
    refused = checked.unexpected;
  }
  if (refused.length > 0) {
    problems.push(
      `content/ or learn/ differs from HEAD, so the tag would not hold the files just compared:\n  ${refused.join('\n  ')}\n` +
        (edits === 'refuse'
          ? 'Commit them (an export after flip day is committed) or put them back, then run again'
          : "Only flip day's export may differ from HEAD here; put these back (git checkout -- <file>), then run again"),
    );
  }
  return { problems, warnings, untracked: status.untracked, head: head.out, edited, rewrites, tagged };
}

/**
 * The commit `repo`'s HEAD names, or null when there is none or `repo` is not
 * the top of its own checkout: git would otherwise answer for an enclosing
 * repository (a temp directory inside some other checkout).
 */
export async function headOf(repo) {
  const top = await git(repo, 'rev-parse', '--show-toplevel');
  if (!top.ok || realpathSync(top.out) !== realpathSync(repo)) return null;
  const head = await git(repo, 'rev-parse', '--verify', 'HEAD');
  return head.ok ? head.out : null;
}

/**
 * Why `checkout` may not stand in for `root`, the checkout the script sits
 * in, on a cut-over; null when it may. It may when it is the top of a
 * worktree of the same repository (the same git common directory) whose HEAD
 * is the commit FINAL_TAG names: the order where the tag came first, flip
 * day ran from that worktree's own script, and the cut-over runs from a
 * checkout whose script has these checks. Anything else (a separate clone, a
 * worktree at another commit, no tag) would let a copy of the script import
 * a tree nobody chose, and prune the rows it lacks.
 */
export async function tagWorktreeProblem(root, checkout) {
  const common = async (dir) => {
    const found = await git(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir');
    return found.ok ? realpathSync(found.out) : null;
  };
  const theirs = await common(checkout);
  if (theirs === null) return `${checkout} is not in a git checkout`;
  const head = await headOf(checkout);
  if (head === null) return `${checkout} is not the top of a git checkout with a commit`;
  const ours = await common(root);
  if (ours === null || ours !== theirs) {
    return `${checkout} is not a worktree of the repository this script is in (${root}); make it with git -C ${root} worktree add <dir> ${FINAL_TAG}`;
  }
  const tagged = await taggedCommit(checkout);
  if (tagged === null) return `there is no ${FINAL_TAG} tag, so ${checkout} cannot be the worktree at it; the tag is made first`;
  if (tagged !== head) return `${checkout} is at ${head.slice(0, 12)}, not at ${FINAL_TAG} (${tagged.slice(0, 12)})`;
  return null;
}

/**
 * Tag HEAD with FINAL_TAG after checking `tagProblems` once more; never
 * pushed. A lightweight tag, as the plan names it: it points at the commit,
 * and every file under content/ and learn/ stays one `git show` away. A tag
 * already on HEAD is left as it is (`made: false`).
 *
 * `expectedHead` is the commit whose files the cut-over compared with the
 * database. A HEAD that moved since (a commit landed in between) holds files
 * nothing compared, so it is refused rather than tagged. `exportDir`, when
 * given, is the cut-over's fresh export: a tracked edit that is flip day's
 * export (byte for byte what that export holds) is then accepted, since the
 * tag keeps HEAD's version of the same content; any other is refused.
 */
export async function makeFinalTag(repo, { expectedHead = null, exportDir = null } = {}) {
  const state = await tagProblems(repo, { edits: exportDir === null ? 'refuse' : { exportDir } });
  const done = { untracked: state.untracked, rewrites: state.rewrites };
  if (expectedHead !== null && state.head !== null && state.head !== expectedHead) {
    state.problems.push(
      `HEAD moved from ${expectedHead.slice(0, 12)} to ${state.head.slice(0, 12)} since the tree was compared with the ` +
        'database, so the tag would hold files nothing compared; run the cut-over again',
    );
  }
  if (state.problems.length > 0) return { problem: state.problems.join('; '), tag: null, ...done };
  if (state.tagged.local === state.head) {
    return { problem: null, tag: { name: FINAL_TAG, commit: state.head, repo, made: false }, ...done };
  }
  const made = await git(repo, 'tag', FINAL_TAG, state.head);
  if (!made.ok) return { problem: `git tag ${FINAL_TAG} failed: ${made.err}`, tag: null, ...done };
  const at = await git(repo, 'rev-parse', `${FINAL_TAG}^{commit}`);
  if (!at.ok || at.out !== state.head) {
    return { problem: `${FINAL_TAG} does not point at HEAD after tagging (${at.out || at.err})`, tag: null, ...done };
  }
  return { problem: null, tag: { name: FINAL_TAG, commit: state.head, repo, made: true }, ...done };
}

/**
 * HEAD's content/ and learn/ written out into `dir`, with the `untracked`
 * files copied in beside them: the tree the tag keeps plus what the import
 * also read, for a parity check of the tag's own bytes when the working tree
 * holds flip day's export instead. Returns null, or why it could not.
 */
export async function writeHeadTree(repo, dir, untracked) {
  const archive = join(dir, '.head.tar');
  const made = await git(repo, 'archive', '--format=tar', '-o', archive, 'HEAD', '--', ...CONTENT_FOLDERS);
  if (!made.ok) return `git archive of HEAD failed in ${repo}: ${made.err}`;
  const unpacked = await exec('tar', ['-xf', archive, '-C', dir]);
  rmSync(archive, { force: true });
  if (unpacked.status !== 0) return `tar could not unpack HEAD's files: ${unpacked.stderr.trim()}`;
  for (const file of untracked) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    copyFileSync(join(repo, file), join(dir, file));
  }
  return null;
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
