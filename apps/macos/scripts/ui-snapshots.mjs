// The macOS app's screens as PNGs, drawn from fixture data, for a person or
// an agent to look at without running the app.
//
// usage: node apps/macos/scripts/ui-snapshots.mjs [--out DIR]
//
// 1. Builds a catalog from seed/ in DIR/fixture (migrate, import, the six
//    flips: the e2e --seed build), records a few answers through the learn
//    CLI so mastery and review cards exist, and makes two cards due.
// 2. Mirrors it with catalog-snapshot.mjs into DIR/fixture/app-catalog.db,
//    the file the app reads.
// 3. Runs the UISnapshots suite (Tests/GnosiaTests/UISnapshotTests.swift),
//    which draws each main screen at 1280x800 in light and dark and writes
//    DIR/<screen>-<light|dark>.png.
//
// DIR is --out, else GNOSIA_SNAPSHOT_DIR, else <OS temp>/gnosia-ui-snapshots,
// and never inside the repository: the PNGs are not committed. Nothing here
// reads or writes ~/.gnosia, the real catalog, or a running studio: the
// suite answers the studio's and the sidecar's routes from fixtures.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { buildSeedDatabase, npmScript, seedEnv } from '../../../scripts/lib/app-harness.mjs';
import { openDatabase } from '../../../scripts/lib/sqlite.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const APP = join(ROOT, 'apps/macos');

const { values } = parseArgs({ options: { out: { type: 'string' } } });
const OUT = resolve(values.out ?? process.env.GNOSIA_SNAPSHOT_DIR ?? join(tmpdir(), 'gnosia-ui-snapshots'));
if (inside(real(ROOT), real(OUT))) {
  console.error(`ui-snapshots: ${OUT} is inside the repository; the PNGs are not committed, so write them elsewhere.`);
  process.exit(2);
}

/** The port the suite answers the studio's routes on; nothing listens there. */
const STUDIO_PORT = '65231';

// The fixture is rebuilt each run, but only a directory this script made is
// ever removed: it carries a marker, and a `fixture` without one is refused.
const FIXTURE = join(OUT, 'fixture');
const MARKER = join(FIXTURE, '.gnosia-ui-fixture');
if (existsSync(FIXTURE)) {
  if (!existsSync(MARKER)) {
    console.error(`ui-snapshots: ${FIXTURE} exists and was not made by this script; choose another --out.`);
    process.exit(2);
  }
  rmSync(FIXTURE, { recursive: true, force: true });
}
mkdirSync(FIXTURE, { recursive: true });
writeFileSync(MARKER, 'made by apps/macos/scripts/ui-snapshots.mjs; removed and rebuilt on each run\n');
const db = join(FIXTURE, 'catalog.db');
const home = join(FIXTURE, 'home');
const env = seedEnv({ root: ROOT, db, home, emptyRoot: mkdtempSync(join(FIXTURE, 'no-tools-')) });

console.log(`ui-snapshots: building the fixture catalog in ${FIXTURE}`);
await buildSeedDatabase(ROOT, env);
// Learner state the seed does not carry: a few answers, so the map has
// colour, Home has threads and Review has cards.
for (const [concept, correct] of [
  ['tool-calling', true],
  ['react-loop', false],
  ['dot-product', true],
  ['dot-product', true],
  ['softmax', true],
  ['self-attention', false],
]) {
  await npmScript(ROOT, env, 'learn', ['observe', '--concept', concept, '--correct', String(correct)]);
}
markDue(db, 2);

const mirror = join(FIXTURE, 'app-catalog.db');
const snap = spawnSync('node', [join(APP, 'scripts/catalog-snapshot.mjs'), '--out', mirror], { env, stdio: 'inherit' });
if (snap.status !== 0) process.exit(snap.status ?? 1);

console.log(`ui-snapshots: drawing the screens into ${OUT}`);
const run = spawnSync('swift', ['test', '--filter', 'UISnapshots'], {
  cwd: APP,
  stdio: 'inherit',
  env: {
    ...process.env,
    GNOSIA_SNAPSHOT_FIXTURE: FIXTURE,
    GNOSIA_SNAPSHOT_DIR: OUT,
    GNOSIA_CATALOG: mirror,
    GNOSIA_HOME: home,
    STUDIO_PORT,
  },
});
if (run.status === 0) console.log(`ui-snapshots: done, the PNGs are in ${OUT}`);
process.exit(run.status ?? 1);

/** `path` with links resolved, through its nearest existing ancestor when it does not exist yet. */
function real(path) {
  let head = path;
  const rest = [];
  while (!existsSync(head) && dirname(head) !== head) {
    rest.unshift(head.slice(dirname(head).length + 1));
    head = dirname(head);
  }
  return join(realpathSync(head), ...rest);
}

/** Whether `path` is `root` or under it, by whole path components. */
function inside(root, path) {
  const rel = relative(root, path);
  return rel === '' || !(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

/**
 * The `count` earliest review cards made due a minute ago. A throwaway
 * file, so rewriting rows of a projection is harmless; `catalog_copy_ok`
 * because the bare handle has none of `connect`'s functions (scripts/e2e.mjs
 * does the same).
 */
function markDue(file, count) {
  const handle = openDatabase(file);
  try {
    handle.function('catalog_copy_ok', () => 1);
    handle
      .prepare(
        `update review set due = cast(unixepoch('subsec') * 1000 as integer) - 60000
          where (learner_id, concept_slug) in (select learner_id, concept_slug from review order by due limit ?)`,
      )
      .run(count);
  } finally {
    handle.close();
  }
}
