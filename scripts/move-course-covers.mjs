// The one-off move of the ten course cover photos into the blob store.
//
// usage: node scripts/move-course-covers.mjs --from <dir> [--dry-run] [--owner ID] [--json]
//
// Until this move the covers were static files, apps/web/public/course-covers/
// <slug>.webp, with their credits in a CREDITS.md beside them. They are now a
// blob each, named by the course row (`collection.cover_blob_key`) with the
// credit in `metadata.coverCredit`, and the web app serves them from
// /api/courses/<slug>/cover. The PR that made the move deleted the folder, so
// the photos are read from --from, a directory holding the ten files (a copy
// of the folder, or `git show <commit before the move>:apps/web/public/course-covers/<file>`
// for each). The credits are in scripts/course-covers.json, beside this file.
//
// For each cover it runs `catalog course cover <course> --file <dir>/<file>
// --photographer ... --source ... --licence ... --reason ...`, the one writer of
// a cover, so every check that command makes (the image type by its bytes, the
// size cap, the course existing and being the owner's) applies here too, and
// each course gets one revision with the reason below. It checks that all ten
// files are there before it runs any, so a wrong --from changes nothing.
//
// Idempotent: the command stores nothing it already holds and writes no
// revision for the same image and credit, so a second run reports every
// course unchanged. --dry-run passes --dry-run to each command: every check,
// nothing stored, nothing written.
//
// Environment: DATABASE_URL and SELF_LEARN_HOME, as the catalog reads them
// (the blob store is $SELF_LEARN_HOME/blobs, else ~/.self-learn/blobs).
//
// Exit codes: 0 every cover is in place (or would be, on a dry run), 1 one
// or more refused, 2 the invocation was wrong, 3 the database is unreachable,
// 4 the database is behind its migrations (run `catalog migrate` first).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { exec } from './lib/proc.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'services/catalog/src/cli.ts');
const CREDITS = join(dirname(fileURLToPath(import.meta.url)), 'course-covers.json');
const USAGE = 'usage: node scripts/move-course-covers.mjs --from <dir> [--dry-run] [--owner ID] [--json]';
const REASON = 'Move the cover photo from apps/web/public/course-covers into the blob store';

/** The ten covers and their credits, checked for the fields the command needs. */
export function readCovers(file = CREDITS) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const covers = parsed?.covers;
  if (!Array.isArray(covers) || covers.length === 0) throw new Error(`${file}: no "covers" list`);
  for (const cover of covers) {
    for (const key of ['course', 'file', 'photographer', 'source', 'licence']) {
      if (typeof cover?.[key] !== 'string' || cover[key].trim() === '') {
        throw new Error(`${file}: a cover has no "${key}": ${JSON.stringify(cover)}`);
      }
    }
    if (cover.file.includes('/') || cover.file.includes('\\')) throw new Error(`${file}: "${cover.file}" is not a file name`);
  }
  return covers;
}

/** The arguments `catalog course cover` gets for one cover. */
export function coverArgs(cover, from, { dryRun = false, owner } = {}) {
  return [
    'course',
    'cover',
    cover.course,
    '--file',
    join(from, cover.file),
    '--photographer',
    cover.photographer,
    '--source',
    cover.source,
    '--licence',
    cover.licence,
    '--reason',
    REASON,
    '--json',
    ...(dryRun ? ['--dry-run'] : []),
    ...(owner === undefined ? [] : ['--owner', owner]),
  ];
}

async function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        from: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        owner: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
    }));
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    return 2;
  }
  if (values.from === undefined) {
    process.stderr.write(`--from is required: the directory holding the photos\n${USAGE}\n`);
    return 2;
  }
  const from = resolve(values.from);
  const covers = readCovers();
  const missing = covers.filter((c) => !existsSync(join(from, c.file)) || !statSync(join(from, c.file)).isFile());
  if (missing.length > 0) {
    process.stderr.write(`${from} lacks ${missing.map((c) => c.file).join(', ')}; nothing was run\n`);
    return 2;
  }

  const results = [];
  let failed = 0;
  for (const cover of covers) {
    const ran = await exec(process.execPath, ['--import', 'tsx', CLI, ...coverArgs(cover, from, { dryRun: values['dry-run'], owner: values.owner })], {
      cwd: ROOT,
    });
    // Under --json the command reports a failure as JSON on stdout.
    const reason = () => {
      try {
        return String(JSON.parse(ran.stdout).error ?? ran.stderr.trim());
      } catch {
        return (ran.stderr || ran.stdout).trim();
      }
    };
    // Unreachable (3) or behind its migrations (4): no other cover can do
    // better, so the run stops and says why.
    if (ran.status === 3 || ran.status === 4) {
      process.stderr.write(`${cover.course}: ${reason()}\n`);
      return ran.status;
    }
    if (ran.status !== 0) {
      failed += 1;
      results.push({ course: cover.course, ok: false, error: reason() });
      continue;
    }
    const out = JSON.parse(ran.stdout);
    results.push({
      course: cover.course,
      ok: true,
      changed: out.changed,
      uploaded: out.uploaded,
      revisionId: out.revisionId,
      key: out.cover?.key ?? null,
    });
  }

  const summary = { dryRun: values['dry-run'], from, covers: results, failed };
  if (values.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    for (const r of results) {
      if (!r.ok) process.stdout.write(`${r.course}  refused: ${r.error}\n`);
      else if (!r.changed) process.stdout.write(`${r.course}  unchanged  ${r.key}\n`);
      else {
        const what = values['dry-run'] ? 'would set' : `set, revision ${r.revisionId}${r.uploaded ? ', uploaded' : ''}`;
        process.stdout.write(`${r.course}  ${what}  ${r.key}\n`);
      }
    }
    const changed = results.filter((r) => r.ok && r.changed).length;
    process.stdout.write(
      `${values['dry-run'] ? 'dry run: ' : ''}${changed} changed, ${results.length - changed - failed} unchanged, ${failed} refused\n`,
    );
  }
  return failed > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
