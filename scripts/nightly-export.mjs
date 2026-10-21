// The nightly export: the database's content written out as files, kept
// outside the repository, so a readable copy of everything authored exists
// that no database restore is needed to read (docs/CONTENT-MIGRATION.md,
// phase 3; "What git gave us": backup).
//
// usage: node scripts/nightly-export.mjs [--keep N] [--json]
//
// It runs `catalog export --out` into $SELF_LEARN_HOME/archive/<UTC time>/
// (~/.self-learn/archive/ when SELF_LEARN_HOME is unset), points
// archive/latest at it, and deletes all but the newest N exports (default 30).
//
// The export is written into a hidden `.<time>.partial-<random>` directory of
// its own first (two runs started in the same second never share one) and
// renamed into place only when the catalog says it finished, so `latest` and
// every `<time>` directory are always a whole export; a failed run leaves its
// partial behind, which the next run removes once it is a day old. The
// `latest` link is replaced with a rename, so a reader never finds it missing.
//
// It writes nothing the database records: an export records its hash only
// into the tree a type was imported from, and the archive is never that.
//
// Scheduling it is docs/DEPLOYMENT.md's "The nightly export" (a launchd
// example). Pushing the archive to a private git repository is a later
// decision of the owner's; nothing here creates one.
//
// Environment: DATABASE_URL (the catalog's), SELF_LEARN_HOME (absolute or
// starting with ~/, as the blob store reads it; a diagram's SVG is read from
// that store too).
//
// Exit codes: 0 exported, 1 the export or the pruning failed, 2 the
// invocation was wrong.
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { exec } from './lib/proc.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'services/catalog/src/cli.ts');
const USAGE = 'usage: node scripts/nightly-export.mjs [--keep N] [--json]';
const STAMP = /^\d{8}T\d{6}Z$/;
const PARTIAL = /^\.(\d{8}T\d{6}Z)\.partial(-[A-Za-z0-9]+)?$/;
const DAY_MS = 24 * 60 * 60 * 1000;

class Refusal extends Error {}

/** A UTC time a directory name can carry: 20260928T064512Z. */
function fileStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** $SELF_LEARN_HOME as the blob store reads it: `~` expanded, relative refused. */
function selfLearnHome(env = process.env) {
  const raw = env.SELF_LEARN_HOME?.trim();
  if (!raw) return join(homedir(), '.self-learn');
  const expanded = raw === '~' || raw.startsWith('~/') ? join(homedir(), raw.slice(1)) : raw;
  if (!isAbsolute(expanded)) throw new Refusal(`SELF_LEARN_HOME must be absolute or start with ~/, not ${JSON.stringify(raw)}`);
  return expanded;
}

function inside(child, parent) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** The path with links resolved as far as it exists, so a symlinked home is compared where it lands. */
function real(target) {
  let at = resolve(target);
  const rest = [];
  while (!existsSync(at)) {
    rest.unshift(at.slice(dirname(at).length + 1));
    const up = dirname(at);
    if (up === at) break;
    at = up;
  }
  return join(realpathSync(at), ...rest);
}

function options(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        keep: { type: 'string', default: '30' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }).values;
  } catch (error) {
    throw new Refusal(`${error.message}\n${USAGE}`);
  }
  const keep = Number(parsed.keep);
  if (!Number.isInteger(keep) || keep < 1) throw new Refusal(`--keep ${parsed.keep}: a whole number of exports, at least 1`);
  return { ...parsed, keep };
}

async function main(argv) {
  const opts = options(argv);
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const archive = join(selfLearnHome(), 'archive');
  // Inside the checkout a `git clean` or a relayout deletes it, the reason
  // the blob store and manimkc's renders live outside it too.
  if (inside(real(archive), realpathSync(ROOT))) {
    throw new Refusal(`refusing ${archive}: it is inside the self-learn checkout, where a git operation can delete it. Point SELF_LEARN_HOME outside it.`);
  }
  mkdirSync(archive, { recursive: true });

  const stamp = fileStamp();
  const target = join(archive, stamp);
  if (existsSync(target)) throw new Refusal(`${target} already exists; an export is never written over`);
  // This run's own staging directory, made atomically: another run started
  // in the same second gets another one, so their files never interleave.
  const partial = mkdtempSync(join(archive, `.${stamp}.partial-`));

  const ran = await exec(process.execPath, ['--import', 'tsx', CLI, 'export', '--out', partial, '--json'], { cwd: ROOT });
  let exported = null;
  try {
    exported = JSON.parse(ran.stdout);
  } catch {
    exported = null;
  }
  if (ran.status !== 0 || exported === null) {
    const why = (ran.stderr.trim() || ran.stdout.trim()).split('\n').slice(-6).join('\n');
    process.stderr.write(`nightly-export: catalog export failed (exit ${ran.status ?? ran.signal}); ${partial} is left to look at:\n${why}\n`);
    return 1;
  }
  // A rename onto a directory that exists (another run's export, finished
  // first, holding files) fails rather than mixing the two.
  if (existsSync(target)) {
    process.stderr.write(`nightly-export: ${target} appeared while this run exported; ${partial} is left to look at\n`);
    return 1;
  }
  renameSync(partial, target);

  // `latest` replaced by a rename over it, so it is never absent.
  const link = join(archive, 'latest');
  const next = join(archive, `.latest.${process.pid}`);
  rmSync(next, { force: true });
  symlinkSync(stamp, next);
  renameSync(next, link);

  const exports = readdirSync(archive).filter((name) => STAMP.test(name)).sort();
  const pruned = exports.slice(0, Math.max(0, exports.length - opts.keep));
  for (const name of pruned) rmSync(join(archive, name), { recursive: true, force: true });
  const stale = readdirSync(archive).filter((name) => {
    if (!PARTIAL.test(name)) return false;
    const at = join(archive, name);
    return lstatSync(at).isDirectory() && Date.now() - statSync(at).mtimeMs > DAY_MS;
  });
  for (const name of stale) rmSync(join(archive, name), { recursive: true, force: true });

  const files = exported.types.reduce((a, t) => a + t.files, 0);
  const bytes = exported.types.reduce((a, t) => a + t.bytes, 0);
  const report = {
    archive,
    export: target,
    latest: link,
    database: exported.database,
    types: exported.types.map((t) => ({ type: t.type, files: t.files, bytes: t.bytes, hash: t.hash })),
    files,
    bytes,
    kept: exports.length - pruned.length,
    pruned,
    stalePartials: stale,
  };
  if (opts.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    process.stdout.write(
      `exported ${exported.database} into ${target}: ${files} files, ${bytes} bytes ` +
        `(${report.types.map((t) => `${t.type} ${t.files}`).join(', ')})\n` +
        `latest -> ${stamp}; ${report.kept} export(s) kept` +
        (pruned.length === 0 ? '' : `, ${pruned.length} pruned`) +
        (stale.length === 0 ? '' : `, ${stale.length} stale partial(s) removed`) +
        '\n',
    );
  }
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof Refusal) {
    process.stderr.write(`nightly-export: ${error.message}\n`);
    process.exitCode = 2;
  } else {
    process.stderr.write(`nightly-export: ${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
