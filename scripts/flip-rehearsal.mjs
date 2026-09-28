// Flip day, rehearsed: every step that moves a database's content from files to
// rows, in the order docs/CONTENT-MIGRATION.md gives it, run against a copy.
//
// usage: node scripts/flip-rehearsal.mjs [--cutover] [--from DB] [--name COPY] [--tree-from DIR] [--keep] [--json]
//                                        [--waive-reason TEXT]
//        node scripts/flip-rehearsal.mjs --cutover --checkout DIR [--from DB] [--name COPY] [--blob-store DIR] [--keep]
//                                        [--json] [--waive-reason TEXT]
//        node scripts/flip-rehearsal.mjs --real [--cutover] --database DB --checkout DIR
//
// A rehearsal (the default):
//   1. `createdb -T <from> <copy>` (pg_dump into an empty database when the
//      template has other sessions open). <from> defaults to self_learn and is
//      only ever read.
//   2. Copies <tree-from>/content and <tree-from>/learn (default: this checkout)
//      into a temp directory, the tree the copy imports, flips and exports.
//      Never the checkout itself: the exports rewrite a few files (five notes'
//      frontmatter, the .tldr key order), and a rehearsal leaves the owner's
//      working tree alone.
//   3. Runs the procedure below against the copy, with CATALOG_COPY_OK=1 and
//      SELF_LEARN_HOME at a temp directory, so blobs go nowhere real.
//   4. Prints a summary, and drops the copy and the temp directories unless
//      --keep.
//
// The procedure (PROCEDURE below, the same list for both modes):
//   back up the database (pg_dump -Fc, checked to list the learner tables);
//   migrate; doctor;
//   import the tree into a throwaway copy of the database, which must remove
//   nothing; import the tree, which must remove nothing; parity;
//   flip topics, flip tags, export topics,tags;
//   flip concepts, flip sessions, export concepts,sessions;
//   flip courses (not --strict: 133 items still name no concept), export courses;
//   flip diagrams, export diagrams (FLIP_GROUPS in lib/flip-order.mjs);
//   import the tree again (every content type skipped as its own export); parity;
//   asset upload --source manimkc, which must refuse nothing, twice (the
//   second stores and writes nothing);
//   blob audit;
//   doctor (nothing stands in the contract's way) and migrate again, which
//   applies the contract migration (0013) the first migrate held back.
// Each step is checked, and the first step that fails its check stops the run.
//
// Why an import must remove nothing: a removal is the catalog agreeing that
// something is gone, and deletions cascade. A tree missing a note or a diagram
// the database has (a worktree or a clone without the owner's untracked
// files) would delete those rows and whatever learner rows hang off them. The
// throwaway copy finds that before the database itself is touched; the check
// on the real import is the second line.
//
// --real is flip day itself: the same procedure against the named database in
// place, the flip that lets the readers go database-only. It imports and
// exports this checkout's own tree (so the exports' rewrites land in the
// working tree, to commit), uses the blob store the environment names, and
// runs without CATALOG_COPY_OK. It refuses unless --database names the
// database and --checkout names the checkout this script is in, shows `git
// status` of content/ and learn/, and asks for the name to be typed on a
// terminal. It has no --yes: an agent or a script cannot answer it, on purpose.
//
// Its first step writes ~/<database>-preflip-<UTC time>.dump, and nothing else
// runs unless that file is there, is not empty, and lists the data of `event`,
// `mastery` and `review`. Everything after it is forward-only (migrations,
// flips, and once the readers are database-only CONTENT_SOURCE=files is no way
// back), and the learner state lives in this database alone, so that file is
// the way back. The summary prints it, and the commands that restore it.
//
// Signals: every child runs in its own process group. A SIGINT, SIGTERM or
// SIGHUP to this script is forwarded to the catalog command in flight (and to
// the backup's pg_dump), and the run stops once that has exited; a createdb or
// a copy's dump is left to finish and its database is then dropped. A second
// signal sends SIGKILL.
//
// Environment: the per-owner blob caps are off for every step (see `env`
// below). DATABASE_URL (its host and credentials are kept; its database
// name is replaced), PG_BIN (default /opt/homebrew/opt/postgresql@17/bin),
// MANIMKC_ROOT and TLDRAWKC_ROOT as the catalog reads them (a worktree with no
// submodules points them at a checkout that has them).
//
// --cutover is cut-over day (phase 3), which comes after flip day and before
// the PR that removes content/ and learn/ from the tree merges. Its steps
// (CUTOVER below), each checked before the next:
//   back up the database (<database>-precutover-<UTC>.dump);
//   migrate, which must hold nothing (the contract, 0013, is applied);
//   every content type is the database's (flip day ran);
//   import the tree into a throwaway copy, then into the database: each must
//   remove nothing, and the second must skip all six types as their own
//   export (the flips held, and nobody edited the files since);
//   export everything into a temp directory, then parity of the database
//   against the tree, saved with a byte comparison of that export and the
//   tree to ~/<database>-cutover-<UTC>.parity.json, for the PR body; a
//   mismatch or a file the export writes in other bytes stops the run;
//   decide the waivers: doctor, and for each completeness rule with
//   violators, item-has-concept may be waived with a reason typed on the
//   terminal (an empty one is refused), and any other rule stops the run;
//   flip every type --strict, the waiver passed to courses;
//   doctor, which must report every rule armed or waived;
//   parity once more, with HEAD still the commit compared, since a write
//   during the strict flips would leave the tag older than the database;
//   git tag content-files-final on that commit, or, when the tag is there
//   already on that very commit, nothing: refused if the tag (here or on
//   origin) names another commit, a tracked file under content/ or learn/
//   differs from HEAD and is not flip day's export, or HEAD moved. Never
//   pushed.
// It ends by printing the commands that follow: push the tag unless origin was
// seen to hold it on that commit, and the `git add` and commit that would keep
// flip day's export on a branch of the checkout (printed, never run).
//
// Flip day's exports rewrite a few tracked files (five notes' frontmatter, the
// .tldr key order) and write the untracked ones again (the tailscale pair).
// The cut-over accepts those edits and no others: each must be a file changed
// in place whose bytes are exactly what its fresh export writes, which is the
// list `catalog flip` printed as the files an export rewrites. They are listed
// before the confirmation, checked at the parity step, checked again at the
// tag, and saved in the parity report.
//
// Where it runs. The owner tagged content-files-final on a0afd93, the last
// commit with the files, before flip day, and ran flip day from a worktree at
// the tag, with the tag's own script. The script at the tag refuses a tag that
// exists and a tree the exports edited, so the cut-over runs from a checkout
// with this script (the main checkout, pulled) with --checkout naming that
// worktree. --cutover accepts a --checkout other than its own checkout only
// when it is the top of a worktree of the same repository whose HEAD is the
// tag's commit (lib/cutover.mjs, tagWorktreeProblem). Flip day's --real keeps
// the rule that --checkout is the script's own checkout.
//
// --real --cutover refuses unless every type is flipped already, with the same
// guards as --real (named database, --checkout, a terminal, the backup
// first). A rehearsal with --cutover runs flip day's steps and then the
// cut-over's on one copy, tags a throwaway git repository made of the copied
// tree rather than the checkout, and takes the waiver's reason from
// --waive-reason when there is no terminal. It refuses a template that is
// flipped already: its blobs are in a store the rehearsal does not use, so
// rehearse from an unflipped database (the pre-flip dump restored into one).
// A rehearsal with --cutover --checkout <worktree at the tag> is the other
// way round: it copies a --from that flip day has run on (every type flipped),
// runs only the cut-over's steps on the copy, and reads the worktree in place
// (it writes nothing there; the tag is there already, and is only checked).
// That is the rehearsal of the owner's own cut-over, before --real. The copy's
// rows name blobs flip day stored (the export reads the diagram SVGs back), so
// the rehearsal copies the store --blob-store names (default: the one the
// environment's SELF_LEARN_HOME names, which --real would use) into its own
// temp one first, as a clone where the file system can, and writes nothing to
// the original. The copy leaves out the store's .owner marker, which names the
// database flip day ran on, so the rehearsal's copy claims its own.
//
// Exit codes: 0 every step passed, 1 a step failed, 2 the invocation or a
// prerequisite was wrong, 130 interrupted.
import { constants, cpSync, existsSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  CONTENT_FOLDERS,
  compareTrees,
  contentStatus,
  exportRewrites,
  FINAL_TAG,
  headOf,
  makeFinalTag,
  tagProblems,
  tagWorktreeProblem,
  writeHeadTree,
} from './lib/cutover.mjs';
import { FLIP_GROUPS, FLIP_ORDER } from './lib/flip-order.mjs';
import { copyDatabase, exec, PG_BIN, pgEnv, pgTool } from './lib/pg.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'services/catalog/src/cli.ts');
const USAGE =
  'usage: node scripts/flip-rehearsal.mjs [--cutover] [--from DB] [--name COPY] [--tree-from DIR] [--keep] [--json]\n' +
  '                                       [--waive-reason TEXT]\n' +
  '       node scripts/flip-rehearsal.mjs --cutover --checkout DIR [--from DB] [--name COPY] [--blob-store DIR] [--keep]\n' +
  '                                       [--json] [--waive-reason TEXT]\n' +
  '       node scripts/flip-rehearsal.mjs --real [--cutover] --database DB --checkout DIR';

/** The learner state: a backup whose archive does not list these tables' data is no backup. */
const LEARNER_TABLES = ['event', 'mastery', 'review'];

/**
 * The one completeness rule the cut-over may waive, with a reason: 133 items
 * named no concept when phase 3 was built, and filling them is the owner's
 * content work (docs/CONTENT-MIGRATION.md, D21). Any other rule with a
 * violator stops the cut-over.
 */
const WAIVABLE = 'item-has-concept';

/** The migration the cut-over PR stops treating as a contract; it must be applied first. */
const CONTRACT = '0013_asset_blob_contract';

/** Why the invocation cannot run, exit 2. */
class Refusal extends Error {}

/** Stopped by a signal before anything ran, exit 130. */
class Interrupted extends Refusal {}

/** A removal is the one thing flip day's imports must never do; see the header. */
function removesNothing(json) {
  if (json.totals?.deleted === 0) return null;
  const keys = (json.sources ?? []).flatMap((s) => s.deletedKeys ?? []);
  return (
    `the import removed ${json.totals?.deleted} row(s), and a removal cascades into whatever hangs off them` +
    (keys.length === 0 ? '' : `: ${keys.slice(0, 20).join(', ')}${keys.length > 20 ? ', ...' : ''}`) +
    '. Is the tree missing files the database has?'
  );
}

/**
 * Flip day's steps, in order. A catalog step runs the CLI with `args` and
 * --json; `check` reads the JSON and returns null when the step did what flip
 * day needs, else a sentence saying what it did instead, and `warn` returns a
 * sentence worth printing that does not stop the run. A command's own non-zero
 * exit fails its step before `check`. A step with `action` is the script's
 * own (the backup, the import into a throwaway copy) and returns
 * `{ result, problem, gist }` itself.
 */
function procedure(tree, own) {
  const exported = (types) => (json) => {
    const unrecorded = (json.types ?? []).filter((t) => !t.recorded).map((t) => t.type);
    return unrecorded.length === 0
      ? null
      : `the export hash was not recorded for ${unrecorded.join(', ')}, so the next import would refuse ${types} as edited`;
  };
  const flipped = (json) =>
    json.export?.recorded === true ? null : 'the flip recorded no export hash (is this database marked copy?)';
  const clean = (json) => (json.clean === true ? null : `${json.mismatches} parity mismatch(es)`);
  const refusedNothing = (json) => {
    if (json.refused === 0) return null;
    const refused = (json.items ?? []).filter((i) => i.action === 'refused');
    return (
      `${json.refused} file(s) refused, so their rows have no blob and the contract migration would stay held: ` +
      refused
        .slice(0, 10)
        .map((i) => `${i.id} (${i.detail ?? 'no detail'})`)
        .join('; ')
    );
  };
  const upload = ['asset', 'upload', '--source', 'manimkc', '--reason', 'flip day: manimkc renders into the blob store'];
  const flips = FLIP_GROUPS.flatMap((group) => {
    const named = group.join(', ');
    return [
      ...group.map((type) => ({
        name: `flip ${type}`,
        args: ['flip', type],
        check: flipped,
      })),
      {
        name: `export ${named}`,
        args: ['export', '--only', group.join(','), '--out', tree],
        check: exported(group.length === 1 ? named : group.join(' and ')),
      },
    ];
  });
  return [
    { name: 'back up the database', command: 'pg_dump -Fc', action: own.backUp },
    { name: 'migrate', args: ['migrate'] },
    { name: 'doctor', args: ['doctor'] },
    { name: 'import into a throwaway copy', command: `createdb -T; catalog import ${tree}`, action: own.importIntoCopy },
    { name: 'import the tree', args: ['import', tree], check: removesNothing },
    { name: 'parity', args: ['parity', tree], check: clean },
    // Courses flip without --strict: the item-has-concept rule has violators
    // until the owner writes the notes the other courses need (Track B), and
    // phase 3 arms or waives it.
    ...flips,
    {
      name: 'import the tree again',
      args: ['import', tree],
      check: (json) => {
        const skipped = new Set((json.skipped ?? []).map((s) => s.source));
        const read = ['topics', 'tags', 'concepts', 'courses', 'diagrams', 'sessions'].filter((t) => !skipped.has(t));
        return read.length === 0 ? removesNothing(json) : `the import read ${read.join(', ')} from files after the flips`;
      },
    },
    { name: 'parity again', args: ['parity', tree], check: clean },
    {
      name: 'asset upload',
      args: upload,
      check: refusedNothing,
      // Posters are thumbnails, not the videos: without ffmpeg the upload
      // stores every render and says it made no poster, and the web app
      // shows no thumbnail until a later upload with ffmpeg makes them.
      warn: (json) => (json.postersSkipped === null ? null : `no posters were made: ${json.postersSkipped}`),
    },
    {
      name: 'asset upload again',
      args: upload,
      check: (json) =>
        refusedNothing(json) ??
        (json.uploaded === 0 && json.rowsWritten === 0
          ? null
          : `the second upload stored ${json.uploaded} object(s) and wrote ${json.rowsWritten} row(s); it should do neither`),
    },
    { name: 'blob audit', args: ['blob', 'audit'] },
    // The contract (0013): a blob behind every video, sidecar, poster and
    // diagram SVG. The first migrate held it back; now nothing stands in its way.
    {
      name: 'doctor again',
      args: ['doctor'],
      check: (json) => {
        const contract = json.blobContract ?? { unstored: [], unkeyed: [] };
        const distance = contract.unstored.length + contract.unkeyed.length;
        return distance === 0 ? null : `${distance} asset(s) or key(s) still stand in the contract's way`;
      },
    },
    {
      name: 'migrate the contract',
      args: ['migrate'],
      check: (json) =>
        (json.held ?? []).length === 0
          ? null
          : `still held: ${json.held.map((h) => `${h.tag} (${h.reason})`).join('; ')}`,
    },
  ];
}

/**
 * Cut-over day's steps (the header lists them). `state` carries what one step
 * decides to the ones after it: the waivers and each type's rules.
 */
function cutoverProcedure(tree, own, state) {
  const flipped = (json) => {
    if (json.export?.recorded !== true) return 'the flip recorded no export hash (is this database marked copy?)';
    const rules = state.rulesByType[json.type] ?? [];
    const want = rules.filter((rule) => !state.waivers.some((w) => w.rule === rule)).sort();
    const armed = [...(json.rulesArmed ?? [])].sort();
    if (want.join(',') !== armed.join(',')) return `armed ${armed.join(', ') || 'no rule'}, expected ${want.join(', ') || 'none'}`;
    const missing = state.waivers.filter((w) => rules.includes(w.rule) && !(json.waivers ?? []).some((r) => r.rule === w.rule));
    return missing.length === 0 ? null : `the waiver for ${missing.map((w) => w.rule).join(', ')} was not recorded`;
  };
  return [
    { name: 'cut-over: back up the database', command: 'pg_dump -Fc', action: own.backUp },
    {
      name: 'cut-over: migrate',
      args: ['migrate'],
      // The cut-over PR unregisters the contract (services/catalog/src/
      // migrations.ts), which is only safe once this database has applied it.
      check: (json) =>
        (json.held ?? []).length > 0
          ? `still held: ${json.held.map((h) => `${h.tag} (${h.reason})`).join('; ')}`
          : Number(String(json.head ?? '').slice(0, 4)) < Number(CONTRACT.slice(0, 4))
            ? `the head is ${json.head}, not yet ${CONTRACT}`
            : null,
    },
    { name: 'cut-over: every type flipped', command: 'select from content_source', action: own.allFlipped },
    { name: 'cut-over: import into a throwaway copy', command: `createdb -T; catalog import ${tree}`, action: own.importIntoCopy },
    {
      name: 'cut-over: import the tree',
      args: ['import', tree],
      check: (json) => {
        const skipped = new Set((json.skipped ?? []).map((s) => s.source));
        const read = FLIP_ORDER.filter((t) => !skipped.has(t));
        return read.length === 0
          ? removesNothing(json)
          : `the import read ${read.join(', ')} from files, so the tree is not the last export of those types`;
      },
    },
    {
      name: 'cut-over: export',
      args: () => ['export', '--out', state.exportDir],
      check: (json) =>
        (json.types ?? []).length === FLIP_ORDER.length ? null : `exported ${(json.types ?? []).map((t) => t.type).join(', ')}`,
    },
    { name: 'cut-over: parity', command: `catalog parity ${tree}; compare the export with the tree`, action: own.parityReport },
    { name: 'cut-over: decide the waivers', command: 'catalog doctor', action: own.decideWaivers },
    ...FLIP_ORDER.map((type) => ({
      name: `cut-over: flip ${type} --strict`,
      args: () => [
        'flip',
        type,
        '--strict',
        ...state.waivers
          .filter((w) => (state.rulesByType[type] ?? []).includes(w.rule))
          .flatMap((w) => ['--waive', w.rule, '--reason', w.reason]),
      ],
      check: flipped,
    })),
    {
      name: 'cut-over: doctor',
      args: ['doctor'],
      check: (json) => {
        const unsettled =
          json.unsettled ?? (json.rules ?? []).filter((r) => r.state !== 'armed' && r.waived === null).map((r) => r.name);
        if (unsettled.length > 0) return `neither armed nor waived: ${unsettled.join(', ')}`;
        return json.ok === true ? null : 'doctor reports the database inconsistent';
      },
    },
    // Parity once more, last: a write that landed during the strict flips
    // (a session logged, a note committed) would leave the tag holding files
    // older than the database.
    { name: 'cut-over: parity before the tag', command: `catalog parity ${tree}; HEAD unchanged`, action: own.parityAgain },
    { name: `cut-over: tag ${FINAL_TAG}`, command: `git tag ${FINAL_TAG}`, action: own.tag },
  ];
}

/** One line per step for the summary, from the command's own --json. */
function gist(args, json) {
  if (json === null) return '';
  switch (args[0]) {
    case 'migrate':
      return (
        (json.applied.length === 0 ? `already at ${json.head}` : `applied ${json.applied.join(', ')}; head ${json.head}`) +
        (json.held?.length > 0 ? `; held ${json.held.map((h) => h.tag).join(', ')}` : '')
      );
    case 'doctor':
      return (
        `${json.violations} violation(s); rules ${json.rules
          .map((r) => `${r.name} ${r.waived === null ? r.state : 'waived'} ${r.violators}`)
          .join(', ')}` +
        (json.blobContract === undefined ? '' : `; stored assets with no blob ${json.blobContract.unstored.length}`)
      );
    case 'import':
      return (
        `${json.totals.written} rows written, ${json.totals.deleted} removed` +
        (json.skipped.length === 0 ? '' : `; skipped ${json.skipped.map((s) => s.source).join(', ')}`)
      );
    case 'parity':
      return json.types.map((t) => `${t.type} ${t.expected}`).join(', ') + `; ${json.mismatches} mismatches`;
    case 'flip':
      return (
        `hash ${json.export.hash.slice(0, 12)} recorded; ${json.export.rewrites.length} file(s) an export rewrites` +
        (json.rulesArmed.length === 0 ? '' : `; armed ${json.rulesArmed.join(', ')}`) +
        (json.waivers.length === 0 ? '' : `; waived ${json.waivers.map((w) => w.rule).join(', ')}`)
      );
    case 'export':
      return json.types.map((t) => `${t.type} ${t.files} file(s)`).join(', ');
    case 'asset':
      return (
        `${json.counts.videos} videos, ${json.counts.sidecars} sidecars, ${json.counts.posters} posters; ` +
        `${json.uploaded} uploaded, ${json.rowsWritten} rows written, ${json.refused} refused`
      );
    case 'blob':
      return `${json.rows} rows, ${json.objects} objects, ${json.findings.length} findings, ${json.outstanding} outstanding`;
    default:
      return '';
  }
}

function options(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        from: { type: 'string' },
        name: { type: 'string' },
        'tree-from': { type: 'string' },
        keep: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        real: { type: 'boolean', default: false },
        cutover: { type: 'boolean', default: false },
        'waive-reason': { type: 'string' },
        database: { type: 'string' },
        checkout: { type: 'string' },
        'blob-store': { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }).values;
  } catch (error) {
    throw new Refusal(`${error.message}\n${USAGE}`);
  }
  if (parsed.real) {
    const stray = ['from', 'name', 'tree-from', 'keep', 'waive-reason', 'blob-store'].filter(
      (k) => parsed[k] !== undefined && parsed[k] !== false,
    );
    if (stray.length > 0) {
      throw new Refusal(
        `--real runs against the named database itself and this checkout's tree: --${stray.join(', --')} ` +
          'belong to a rehearsal.' +
          (stray.includes('waive-reason') ? " A real cut-over asks for the waiver's reason on the terminal." : ''),
      );
    }
    if (parsed.database === undefined || parsed.database.trim() === '') {
      throw new Refusal('--real needs --database <name>: the database it changes is never a default.');
    }
    if (parsed.checkout === undefined || parsed.checkout.trim() === '') {
      throw new Refusal(
        `--real needs --checkout <dir>, the checkout whose content/ and learn/ it imports and exports into. ` +
          `It must be the one this script is in, ${ROOT}.`,
      );
    }
  } else {
    if (parsed.database !== undefined) {
      throw new Refusal('--database goes with --real. A rehearsal copies --from (default self_learn) instead.');
    }
    if (parsed.checkout !== undefined) {
      if (!parsed.cutover) {
        throw new Refusal(
          '--checkout goes with --real, or with --cutover to rehearse the cut-over on a worktree at the tag. ' +
            'A rehearsal of flip day copies --tree-from instead.',
        );
      }
      if (parsed.checkout.trim() === '') throw new Refusal('--checkout is empty.');
      if (parsed['tree-from'] !== undefined) {
        throw new Refusal('--tree-from and --checkout both name the tree: a cut-over rehearsal on a worktree reads --checkout in place.');
      }
    } else if (parsed['blob-store'] !== undefined) {
      throw new Refusal('--blob-store goes with --cutover --checkout: a rehearsal of flip day fills a temp store of its own.');
    }
  }
  if (parsed['waive-reason'] !== undefined) {
    if (!parsed.cutover) throw new Refusal('--waive-reason goes with --cutover: flip day flips courses without --strict.');
    if (parsed['waive-reason'].trim() === '') {
      throw new Refusal('--waive-reason is empty: a waiver is a decision someone has to be able to read.');
    }
  }
  return parsed;
}

/** DATABASE_URL with its database swapped for `name`; host and credentials kept. */
function urlFor(name) {
  const url = new URL(process.env.DATABASE_URL ?? 'postgres://localhost:5432/self_learn');
  url.pathname = `/${name}`;
  return url.toString();
}

function redact(url) {
  const parsed = new URL(url);
  if (parsed.password !== '') parsed.password = '***';
  return parsed.toString();
}

/** A leading ~ as the home directory, the way a shell would have read it. */
const tilde = (path) => path.replace(/^~(?=$|\/)/, homedir());

/** One argument for a POSIX shell, quoted only when it has to be. */
function shellQuote(value) {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * The commands that put `database` back from `file`, naming the host, port
 * and user `url` does (the password stays in PGPASSWORD or ~/.pgpass, never
 * on a command line). `dropdb --force` ends the sessions still open on it.
 */
function restoreCommands(url, database, file) {
  const parsed = new URL(url);
  const server = [
    ...(parsed.hostname === '' ? [] : ['-h', decodeURIComponent(parsed.hostname)]),
    ...(parsed.port === '' ? [] : ['-p', parsed.port]),
    ...(parsed.username === '' ? [] : ['-U', decodeURIComponent(parsed.username)]),
  ];
  const argv = (tool, ...args) => [join(PG_BIN, tool), ...server, ...args];
  return [
    argv('dropdb', '--force', database),
    argv('createdb', database),
    argv('pg_restore', '--no-owner', '--exit-on-error', '-d', database, file),
  ];
}

/** `restoreCommands` as one line to paste into a shell. */
const asShellLine = (commands) => commands.map((argv) => argv.map(shellQuote).join(' ')).join(' && ');

/** A UTC time a file name can carry: 20260928T064512Z. */
function fileStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/**
 * The checkout the operator named, confirmed. Flip day's must be the one this
 * script sits in, since that is the tree it imports and exports into: a copy
 * of the script in a worktree or a clone would otherwise import a tree
 * without the owner's untracked files, and prune their rows. The cut-over's
 * may also be a worktree of this same repository at the content-files-final
 * tag (`tagWorktreeProblem`), since the owner ran flip day from one and the
 * script at the tag cannot run the cut-over there (see the header); a
 * cut-over rehearsal's must be such a worktree, never this checkout.
 */
async function confirmedCheckout(named, { cutover, real }) {
  const given = resolve(tilde(named));
  if (!existsSync(given)) throw new Refusal(`--checkout ${named} does not exist.`);
  const here = realpathSync(ROOT);
  const there = realpathSync(given);
  if (there === here) {
    if (real) return { path: here, tagWorktree: false };
    throw new Refusal(
      `--checkout ${there} is the checkout this script is in. A cut-over rehearsal reads a worktree at ${FINAL_TAG} ` +
        `in place (git worktree add <dir> ${FINAL_TAG}); to rehearse from this tree, drop --checkout.`,
    );
  }
  if (!cutover) {
    throw new Refusal(
      `--checkout ${there} is not the checkout this script is in, ${here}. ` +
        '--real imports and exports the tree beside the script: run the script from the checkout you mean.',
    );
  }
  const problem = await tagWorktreeProblem(here, there);
  if (problem !== null) {
    throw new Refusal(
      `--checkout ${there} is neither the checkout this script is in (${here}) nor a worktree of it at ${FINAL_TAG}: ${problem}.`,
    );
  }
  return { path: there, tagWorktree: true };
}

/** What `git` says about the checkout, for the confirmation. Read-only. */
async function describeCheckout(root) {
  const git = async (...args) => {
    const ran = await exec('git', ['-C', root, ...args]);
    return ran.status === 0 ? ran.stdout.trimEnd() : null;
  };
  const branch = await git('rev-parse', '--abbrev-ref', 'HEAD');
  const head = await git('rev-parse', '--short', 'HEAD');
  const gitDir = await git('rev-parse', '--path-format=absolute', '--git-dir');
  const common = await git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const status = await git('status', '--porcelain', '--untracked-files=all', '--', 'content', 'learn');
  return {
    branch,
    head,
    worktreeOf: gitDir !== null && common !== null && gitDir !== common ? dirname(common) : null,
    status: status === null ? null : status.split('\n').filter((line) => line !== ''),
  };
}

/**
 * The blob store's root as the catalog resolves it, asked of the blob package
 * itself rather than guessed here, so the line the operator confirms is the
 * directory the uploads will write to (and a SELF_LEARN_HOME the package
 * refuses is refused before anything runs).
 */
async function blobRoot(env) {
  const ran = await exec(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      "const { defaultBlobRoot } = await import('@self-learn/blob'); process.stdout.write(defaultBlobRoot());",
    ],
    { env, cwd: ROOT },
  );
  if (ran.status !== 0 || ran.stdout === '') {
    throw new Refusal(`could not resolve the blob store from SELF_LEARN_HOME: ${ran.stderr.trim().split('\n').at(-1)}`);
  }
  return ran.stdout;
}

/**
 * One line typed on the terminal. Ctrl-C, Ctrl-D and a signal to the script
 * are a no, each rejecting with the Refusal the caller names.
 */
async function ask(question, signal, { interrupted, closed }) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  // In a terminal's raw mode Ctrl-C and Ctrl-D reach readline, not the
  // process: either is a no.
  const declined = new Promise((_, reject) => {
    prompt.once('SIGINT', () => reject(new Interrupted(interrupted)));
    prompt.once('close', () => reject(new Refusal(closed)));
    signal.addEventListener('abort', () => reject(new Interrupted(interrupted)));
  });
  try {
    return (await Promise.race([prompt.question(question), declined])).trim();
  } finally {
    prompt.removeAllListeners('close');
    prompt.close();
  }
}

/** The operator types the database's name on a terminal, or nothing runs. */
async function confirm(name, lines, signal, what) {
  process.stdout.write(`${lines.join('\n')}\n\n`);
  const typed = await ask(`Type the database name (${name}) to run ${what} against it: `, signal, {
    interrupted: 'Interrupted at the confirmation. Nothing was run.',
    closed: 'No name was typed. Nothing was run.',
  });
  if (typed !== name) throw new Refusal(`"${typed}" is not ${name}. Nothing was run.`);
}

/** One query's rows through psql, each row's columns split on `|`; null when psql fails. */
async function query(database, env, text) {
  const ran = await pgTool('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', database, '-c', text], { env });
  if (ran.status !== 0) return null;
  return ran.stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('|'));
}

/** The content types `database` says it owns, from `content_source`; empty before 0010. */
async function flippedTypes(database, env) {
  const present = await query(database, env, "select to_regclass('public.content_source') is not null");
  if (present === null) throw new Refusal(`could not read ${database}: is it there, and is Postgres up?`);
  if (present[0]?.[0] !== 't') return [];
  const rows = await query(database, env, "select type from content_source where source = 'db' order by type");
  if (rows === null) throw new Refusal(`could not read content_source in ${database}`);
  return rows.map(([type]) => type);
}

async function main(argv) {
  const opts = options(argv);
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const say = (line) => {
    if (!opts.json) process.stdout.write(`${line}\n`);
  };

  const real = opts.real;
  const cutover = opts.cutover;
  const day = cutover ? 'the cut-over' : 'flip day';
  const stamp = `${process.pid}_${Date.now().toString(36)}`;
  const from = opts.from ?? 'self_learn';
  const database = real ? opts.database.trim() : (opts.name ?? `self_learn_rehearsal_${stamp}`);
  if (!real && database === from) throw new Refusal(`--name ${database} is the template; a rehearsal never runs on its template.`);
  const confirmed = opts.checkout === undefined ? null : await confirmedCheckout(opts.checkout, { cutover, real });
  const checkout = confirmed?.path ?? null;
  /** A cut-over rehearsal on a worktree at the tag: that tree in place, and a copy of a flipped --from. */
  const inPlace = !real && checkout !== null;
  if (real && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    throw new Refusal(
      '--real asks for the database name to be typed on a terminal, and this process has none. ' +
        'Run it yourself, in a terminal; nothing else may confirm it.',
    );
  }
  for (const tool of ['createdb', 'dropdb', 'pg_dump', 'pg_restore', 'psql']) {
    if (!existsSync(join(PG_BIN, tool))) throw new Refusal(`${tool} not found in ${PG_BIN}; set PG_BIN.`);
  }

  const scratch = real ? null : realpathSync(mkdtempSync(join(tmpdir(), 'self-learn-flip-rehearsal-')));
  const tree = checkout ?? join(scratch, 'tree');
  const url = urlFor(database);
  // The per-owner blob caps (phase 4) are off for every step. Flip day stores
  // the bytes the owner already has, some 160 objects in one sitting, and an
  // uploads-per-day cap below that would refuse part of it and fail the
  // "refuses nothing" check halfway through a forward-only procedure. Set to
  // the empty string rather than removed, since an existing variable wins
  // over services/catalog/.env and the empty string reads as no cap. The day
  // window still counts flip day's objects for the 24 hours after it.
  const env = { ...process.env, DATABASE_URL: url, SELF_LEARN_OWNER_BYTES_CAP: '', SELF_LEARN_OWNER_UPLOADS_PER_DAY: '' };
  if (real) delete env.CATALOG_COPY_OK;
  else Object.assign(env, { CATALOG_COPY_OK: '1', SELF_LEARN_HOME: join(scratch, 'home') });
  // The server the catalog commands reach, for the client tools.
  const maintenance = pgEnv(url);
  const kept = real ? homedir() : scratch;
  const backupFile = (label) => join(kept, `${database}-${label}-${fileStamp()}.dump`);
  const report = {
    mode: real ? 'real' : 'rehearsal',
    cutover,
    database: redact(url),
    template: real ? null : from,
    tree,
    checkout: null,
    blobRoot: null,
    copy: real ? null : { name: database, method: null, kept: opts.keep, dropped: false },
    backup: null,
    backups: [],
    steps: [],
    warnings: 0,
    interrupted: false,
    ok: false,
    next: [],
  };
  /** What the cut-over's steps hand on to each other. */
  const state = {
    waivers: [],
    rulesByType: {},
    exportDir: null,
    parityReport: null,
    /** The commit the tree was compared at, which the tag must be on. */
    head: null,
    tag: null,
    untracked: [],
    /** Tracked files that are flip day's export, checked byte for byte against the fresh one. */
    rewrites: [],
    /** Where the tag was before the run: here, and on origin (null when absent or not asked). */
    tagged: { local: null, remote: null },
    /** The files in the tree that are flip day's export in other bytes than HEAD's, or not in HEAD at all: the ones worth committing. */
    exported: [],
  };

  // --- Stopping. -----------------------------------------------------------
  /** Children a signal is forwarded to: the catalog commands and the backup. */
  const forwarded = new Set();
  const forwardTo = (child) => {
    forwarded.add(child);
    child.once('close', () => forwarded.delete(child));
  };
  const stopping = new AbortController();
  let signals = 0;
  const onSignal = (signal) => {
    signals += 1;
    report.interrupted = true;
    stopping.abort();
    const sent = signals === 1 ? 'SIGTERM' : 'SIGKILL';
    process.stderr.write(`\nflip-rehearsal: ${signal}, stopping${forwarded.size > 0 ? ` (${sent} to the command in flight)` : ''}\n`);
    for (const child of forwarded) {
      try {
        process.kill(-child.pid, sent);
      } catch {
        /* already gone */
      }
    }
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, onSignal);

  /** Copies this run made and has not dropped yet, by name. */
  const made = new Set();
  const drop = async (name) => {
    const dropped = await pgTool('dropdb', ['--if-exists', '--force', name], { env: maintenance });
    if (dropped.status === 0) made.delete(name);
    else say(`could not drop ${name}: ${dropped.stderr.trim()}. Drop it by hand: ${join(PG_BIN, 'dropdb')} --force ${name}`);
    return dropped.status === 0;
  };

  // --- The script's own steps. ---------------------------------------------
  const catalog = async (args, stepEnv, { exits = [0] } = {}) => {
    const ran = await exec(process.execPath, ['--import', 'tsx', CLI, ...args, '--json'], {
      env: stepEnv,
      cwd: ROOT,
      onSpawn: forwardTo,
    });
    let json = null;
    try {
      json = JSON.parse(ran.stdout);
    } catch {
      json = null;
    }
    const failed = !exits.includes(ran.status)
      ? ran.signal !== null
        ? `stopped by ${ran.signal}`
        : `exit ${ran.status}: ${(ran.stderr.trim() || (json?.error ?? ran.stdout.trim())).slice(-1200)}`
      : json === null
        ? `printed no JSON: ${ran.stdout.trim().slice(-400)}`
        : null;
    return { json, failed };
  };

  /**
   * pg_dump -Fc of the database before a day's first change, then
   * `pg_restore --list` of the file: an archive that will not list, or
   * lists no data for the learner tables, is no way back.
   */
  const backUp = (label) => async () => {
    const file = backupFile(label);
    if (existsSync(file)) {
      return { problem: `${file} already exists, and a backup is never written over`, result: null };
    }
    const dumped = await pgTool('pg_dump', ['-Fc', '-f', file, '-d', database], { env: maintenance, onSpawn: forwardTo });
    if (dumped.status !== 0) {
      return { problem: `pg_dump failed${dumped.signal ? ` (${dumped.signal})` : ''}: ${dumped.stderr.trim().slice(-600)}`, result: null };
    }
    const bytes = existsSync(file) ? statSync(file).size : 0;
    if (bytes === 0) return { problem: `pg_dump exited 0 and ${file} is empty`, result: null };
    const listed = await pgTool('pg_restore', ['--list', file], { env: maintenance });
    if (listed.status !== 0) return { problem: `pg_restore --list cannot read ${file}: ${listed.stderr.trim()}`, result: null };
    const tables = [
      ...new Set(
        listed.stdout
          .split('\n')
          .map((line) => / TABLE DATA public (\S+) /.exec(line)?.[1])
          .filter((table) => table !== undefined),
      ),
    ].sort();
    const missing = LEARNER_TABLES.filter((table) => !tables.includes(table));
    if (missing.length > 0) {
      return {
        problem: `${file} lists no data for ${missing.join(', ')}, so it would not bring the learner state back`,
        result: { path: file, bytes, tables },
      };
    }
    // Spelled out with the server and the user the backup was taken from, and
    // quoted: the client tools do not read DATABASE_URL, so a bare `dropdb
    // self_learn` in another shell could drop a different server's database.
    const restoreArgv = restoreCommands(url, database, file);
    const backup = { label, path: file, bytes, tables: tables.length, restore: asShellLine(restoreArgv), restoreArgv };
    report.backups.push(backup);
    // The first backup is the way back from everything after it.
    report.backup ??= backup;
    return {
      problem: null,
      result: backup,
      gist: `${file}, ${bytes} bytes, data for ${tables.length} tables (${LEARNER_TABLES.join(', ')} among them)`,
    };
  };

  const own = {
    backUp: backUp('preflip'),

    /**
     * The first import, run on a throwaway copy of the database as it is now:
     * the one step whose damage (a removal, and its cascade) the backup
     * would otherwise be the only way to undo.
     */
    importIntoCopy: async () => {
      const name = `self_learn_preflight_${stamp}`;
      const home = mkdtempSync(join(tmpdir(), 'self-learn-flip-preflight-'));
      try {
        await copyDatabase(database, name, { env: maintenance, created: () => made.add(name) });
        if (report.interrupted) return { problem: 'interrupted', result: null };
        const { json, failed } = await catalog(['import', tree], {
          ...env,
          DATABASE_URL: urlFor(name),
          CATALOG_COPY_OK: '1',
          SELF_LEARN_HOME: home,
        });
        const problem = failed ?? removesNothing(json);
        return {
          problem: problem === null ? null : `on a copy, before touching ${database}: ${problem}`,
          result: json,
          gist: problem === null ? `${json.totals.written} rows written, 0 removed, on ${name}; dropped` : undefined,
        };
      } finally {
        if (made.has(name)) await drop(name);
        rmSync(home, { recursive: true, force: true });
      }
    },
  };

  /**
   * A rehearsal's tree as a git repository with one commit, so the tag and
   * its checks run on it as they do on the checkout. Null when it is one.
   */
  const rehearsalRepository = async () => {
    if ((await headOf(tree)) !== null) return null;
    const git = (...args) =>
      exec('git', ['-C', tree, '-c', 'user.name=flip-rehearsal', '-c', 'user.email=flip-rehearsal@localhost', '-c', 'commit.gpgsign=false', ...args]);
    for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'flip-rehearsal: the tree at the cut-over']]) {
      const ran = await git(...args);
      if (ran.status !== 0) return `git ${args[0]} in the rehearsal's tree failed: ${ran.stderr.trim()}`;
    }
    return null;
  };

  const cutoverOwn = {
    backUp: backUp('precutover'),
    importIntoCopy: own.importIntoCopy,

    allFlipped: async () => {
      const types = await flippedTypes(database, maintenance);
      const missing = FLIP_ORDER.filter((type) => !types.includes(type));
      return missing.length === 0
        ? { problem: null, result: { flipped: types }, gist: `${types.length} of ${FLIP_ORDER.length}: ${types.join(', ')}` }
        : { problem: `not flipped: ${missing.join(', ')}. Flip day comes first.`, result: { flipped: types } };
    },

    /**
     * Parity of the database against the tree, and the fresh export compared
     * with the tree byte for byte, saved together as the report the PR body
     * quotes.
     */
    parityReport: async () => {
      // A rehearsal's tree is a temp copy: made a repository here, as the
      // checkout is, so the commit compared is the commit the tag checks.
      if (!real && !inPlace) {
        const problem = await rehearsalRepository();
        if (problem !== null) return { problem, result: null };
      }
      state.head = await headOf(tree);
      if (state.head === null) return { problem: `${tree} has no commit to compare and tag`, result: null };
      const { json, failed } = await catalog(['parity', tree], env, { exits: [0, 1] });
      if (failed !== null) return { problem: failed, result: json };
      const bytes = compareTrees(state.exportDir, tree);
      // Flip day's exports rewrote some tracked files in place. Each must be
      // exactly what the database exports now; any other edit is refused.
      const status = await contentStatus(tree);
      const edits = status.ok
        ? exportRewrites(state.exportDir, tree, status.edits)
        : { rewrites: [], unexpected: [`git status failed in ${tree}: ${status.err}`] };
      state.rewrites = edits.rewrites;
      // compareTrees below has to find every exported file identical in the
      // tree before this list is used, so an untracked file the export also
      // writes is flip day's export too (the tailscale pair).
      state.exported = [...edits.rewrites, ...status.untracked.filter((f) => existsSync(join(state.exportDir, f)))].sort();
      // The tag keeps HEAD's bytes, not the working tree's, so when the two
      // differ HEAD's own files (with the untracked ones the import read) are
      // held to the database too.
      let headParity = null;
      if (edits.unexpected.length === 0 && edits.rewrites.length > 0) {
        const dir = mkdtempSync(join(tmpdir(), 'self-learn-cutover-head-'));
        try {
          const wrote = await writeHeadTree(tree, dir, status.untracked);
          if (wrote !== null) return { problem: wrote, result: null };
          const ran = await catalog(['parity', dir], env, { exits: [0, 1] });
          if (ran.failed !== null) return { problem: `parity of HEAD's files: ${ran.failed}`, result: ran.json };
          headParity = { clean: ran.json.clean, mismatches: ran.json.mismatches, types: ran.json.types };
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
      const file = join(kept, `${database}-cutover-${fileStamp()}.parity.json`);
      const saved = {
        at: new Date().toISOString(),
        database: redact(url),
        tree,
        head: state.head,
        export: state.exportDir,
        parity: json,
        bytes,
        rewrites: edits.rewrites,
        unexpected: edits.unexpected,
        untracked: status.untracked,
        headParity,
      };
      writeFileSync(file, `${JSON.stringify(saved, null, 2)}\n`, { flag: 'wx' });
      state.parityReport = file;
      const counts = json.types.map((t) => `${t.type} ${t.expected}`).join(', ');
      if (!json.clean) {
        const first = json.types
          .flatMap((t) => [...(t.error === null ? [] : [`${t.type}: ${t.error}`]), ...t.mismatches.map((m) => `${m.kind} ${m.id}`)])
          .slice(0, 10);
        return {
          problem:
            `${json.mismatches} parity mismatch(es) between the database and ${tree} (${first.join('; ')}); report ${file}. ` +
            'If the database moved on since flip day (a note, a log, a diagram written since), export it into the tree ' +
            `(catalog export --out ${tree}), commit, and run again.`,
          result: saved,
        };
      }
      // The tag is to hold exactly what the database would export. Parity is
      // clean here, so a byte difference is formatting (a comment, a key
      // order), and the fix is the same export into the tree, committed.
      const differ = [...bytes.differ, ...bytes.onlyInExport];
      if (differ.length > 0) {
        return {
          problem:
            `${differ.length} file(s) the database exports differ in bytes from ${tree} (${differ.slice(0, 10).join(', ')}); ` +
            `report ${file}. Parity is clean, so the difference is formatting: export into the tree ` +
            `(catalog export --out ${tree}), commit, and run again, so the tag holds the export itself.`,
          result: saved,
        };
      }
      if (edits.unexpected.length > 0) {
        return {
          problem:
            `${edits.unexpected.length} tracked file(s) under content/ or learn/ differ from HEAD and are not flip day's ` +
            `export: ${edits.unexpected.slice(0, 10).join('; ')}; report ${file}. The tag keeps HEAD's version, so ` +
            'nothing here can say which is right: put them back (git checkout -- <file>) and run again.',
          result: saved,
        };
      }
      if (headParity !== null && !headParity.clean) {
        return {
          problem:
            `${headParity.mismatches} parity mismatch(es) between the database and HEAD's own files (what the tag keeps), ` +
            `though the working tree's export is clean; report ${file}. HEAD is not the tree flip day compared: ` +
            'run the cut-over on the worktree flip day ran from.',
          result: saved,
        };
      }
      return {
        problem: null,
        result: { ...saved, path: file },
        gist:
          `${counts}; 0 mismatches; ${bytes.identical} of ${bytes.compared} exported files identical in the tree` +
          (edits.rewrites.length === 0
            ? ''
            : `; ${edits.rewrites.length} tracked file(s) are flip day's export (${edits.rewrites.join(', ')}), and HEAD's own files have parity too`) +
          `; report ${file}`,
      };
    },

    /** Parity again, and the same commit, right before the tag. */
    parityAgain: async () => {
      const { json, failed } = await catalog(['parity', tree], env, { exits: [0, 1] });
      if (failed !== null) return { problem: failed, result: json };
      if (!json.clean) {
        return {
          problem:
            `${json.mismatches} parity mismatch(es) since the first comparison: the database was written during the ` +
            'cut-over. Nothing is tagged; export into the tree, commit, and run again.',
          result: json,
        };
      }
      const head = await headOf(tree);
      if (head !== state.head) {
        return { problem: `HEAD moved from ${state.head} to ${head} during the cut-over; nothing is tagged`, result: json };
      }
      return { problem: null, result: json, gist: `0 mismatches; HEAD still ${head.slice(0, 12)}` };
    },

    /**
     * Doctor, then a decision per completeness rule: clean rules are armed by
     * the strict flips; item-has-concept with violators is waived with a
     * reason typed on the terminal (or --waive-reason on a rehearsal); any
     * other rule with a violator stops the cut-over before anything is armed.
     */
    decideWaivers: async () => {
      const { json, failed } = await catalog(['doctor'], env);
      if (failed !== null) return { problem: failed, result: json };
      state.rulesByType = {};
      for (const rule of json.rules) (state.rulesByType[rule.type] ??= []).push(rule.name);
      const broken = json.rules.filter((rule) => rule.violators > 0);
      const stuck = broken.filter((rule) => rule.name !== WAIVABLE);
      if (stuck.length > 0) {
        return {
          problem:
            `only ${WAIVABLE} may be waived at the cut-over, and ${stuck
              .map((r) => `${r.name} has ${r.violators} violator(s) (${r.sample.slice(0, 5).map((s) => s.id).join(', ')})`)
              .join('; ')}. Fix them (catalog doctor lists them all), then run again.`,
          result: json,
        };
      }
      const waivable = broken.find((rule) => rule.name === WAIVABLE);
      if (waivable !== undefined) {
        let reason = opts['waive-reason']?.trim() ?? null;
        if (reason === null) {
          if (!process.stdin.isTTY) {
            return {
              problem: `${WAIVABLE} has ${waivable.violators} violator(s) and there is no terminal to ask why it is waived. Pass --waive-reason on a rehearsal.`,
              result: json,
            };
          }
          if (!opts.json) {
            process.stdout.write(
              `\n${WAIVABLE}: ${waivable.violators} curriculum item(s) name no concept` +
                (json.conceptlessCourses.length === 0 ? '' : ` (courses with none at all: ${json.conceptlessCourses.join(', ')})`) +
                '.\nThe rule is waived, not armed, and the reason is recorded on content_source, where doctor shows it on every run.\n',
            );
          }
          for (let tries = 0; tries < 3 && (reason === null || reason === ''); tries += 1) {
            reason = await ask(`Why is ${WAIVABLE} waived? `, stopping.signal, {
              interrupted: 'Interrupted at the waiver. The database is backed up and nothing is armed yet.',
              closed: 'No reason was typed. Nothing is armed.',
            });
            if (reason === '') process.stdout.write('An empty reason is refused: a waiver is a decision someone has to be able to read.\n');
          }
          if (reason === '') return { problem: 'no reason for the waiver was typed, three times', result: json };
        }
        state.waivers = [{ rule: WAIVABLE, reason }];
      }
      const clean = json.rules.filter((rule) => rule.violators === 0).map((rule) => rule.name);
      return {
        problem: null,
        result: { rules: json.rules, waivers: state.waivers },
        gist:
          (clean.length === 0 ? '' : `arm ${clean.join(', ')}`) +
          (state.waivers.length === 0
            ? ''
            : `${clean.length === 0 ? '' : '; '}waive ${WAIVABLE} (${waivable.violators} violators): "${state.waivers[0].reason}"`),
      };
    },

    tag: async () => {
      // The tree's edits are checked once more against the export, in case
      // one changed since the parity step.
      const made = await makeFinalTag(tree, { expectedHead: state.head, exportDir: state.exportDir });
      state.untracked = made.untracked;
      if (made.problem !== null) return { problem: made.problem, result: made };
      state.tag = made.tag;
      const where = real || inPlace ? tree : 'a throwaway repository of the tree';
      return {
        problem: null,
        result: made,
        gist:
          (made.tag.made
            ? `${FINAL_TAG} at ${made.tag.commit.slice(0, 12)} in ${where}; not pushed`
            : `${FINAL_TAG} was already on ${made.tag.commit.slice(0, 12)}, the commit compared; left as it is`) +
          (made.rewrites.length === 0 ? '' : `; ${made.rewrites.length} tracked file(s) still flip day's export`),
      };
    },
  };

  // --- The run. ------------------------------------------------------------
  let total = 0;
  try {
    report.blobRoot = await blobRoot(env);
    const flipDay = procedure(tree, own);
    // A cut-over on a checkout (--real, or a rehearsal on the tag's
    // worktree) comes after flip day, which ran from that checkout already.
    const steps = cutover
      ? [...(checkout !== null ? [] : flipDay), ...cutoverProcedure(tree, cutoverOwn, state)]
      : flipDay;
    total = steps.length;

    /**
     * What the cut-over needs of the database and the checkout, read before
     * the confirmation (or the copy), so a run that cannot finish never
     * starts; and the lines that say it.
     */
    const cutoverPreflight = async (git, owner) => {
      const flipped = await flippedTypes(owner, maintenance);
      const missing = FLIP_ORDER.filter((type) => !flipped.includes(type));
      if (missing.length > 0) {
        throw new Refusal(
          `${owner} does not own ${missing.join(', ')} yet: the cut-over comes after flip day ` +
            `(node scripts/flip-rehearsal.mjs --real --database ${owner} --checkout ${checkout}, from that checkout).`,
        );
      }
      // Flip day's export rewrote files here; they pass for now, listed, and
      // the parity step checks each against a fresh export before anything
      // is armed. Any other edit refuses here.
      const tagging = await tagProblems(checkout, { remote: 'origin', edits: 'pending' });
      if (tagging.problems.length > 0) throw new Refusal(tagging.problems.join('\n'));
      state.tagged = tagging.tagged;
      const already = tagging.tagged.local === tagging.head;
      return [
        `checkout    ${checkout} (${git.branch ?? '?'} at ${git.head ?? '?'})` +
          (git.worktreeOf === null ? '' : `, a linked worktree of ${git.worktreeOf}`),
        `            imported and compared; nothing here is written${already ? '' : ' but the tag'}`,
        `tag         ${FINAL_TAG} on ${tagging.head.slice(0, 12)}, ` +
          (already
            ? `there already${tagging.tagged.remote === tagging.head ? ' and on origin' : ''}: checked, left as it is`
            : 'made here and not pushed'),
        ...tagging.warnings.map((w) => `            ${w}`),
        ...(tagging.edited.length === 0
          ? []
          : [
              "tracked files that differ from HEAD, to be flip day's export (each is checked against a fresh export before anything is armed):",
              ...tagging.edited.map((file) => `            ${file}`),
            ]),
        ...(tagging.untracked.length === 0
          ? []
          : [
              'untracked under content/ and learn/ (imported, so in the database and its export; not in the tag):',
              ...tagging.untracked.map((file) => `            ${file}`),
            ]),
      ];
    };

    if (checkout !== null) {
      const git = await describeCheckout(checkout);
      report.checkout = { path: checkout, tagWorktree: confirmed.tagWorktree, ...git };
      if (git.status === null) throw new Refusal(`git status failed in ${checkout}; ${day} needs to see the tree it imports.`);
    }
    if (real) {
      const git = report.checkout;
      const lines = [];
      if (cutover) {
        lines.push(
          `the cut-over against ${redact(url)}, in place: every type flipped already.`,
          ...(await cutoverPreflight(git, database)),
          `blob store  ${report.blobRoot}`,
          `backup      ${join(kept, `${database}-precutover-<UTC>.dump`)} (pg_dump -Fc, before anything else)`,
          `waiver      ${WAIVABLE}, if it has violators: you will be asked why`,
          `steps       ${steps.map((s) => s.name.replace(/^cut-over: /, '')).join('; ')}`,
        );
      } else {
        const edited = git.status.filter((line) => !line.startsWith('??'));
        if (edited.length > 0) {
          throw new Refusal(
            `content/ or learn/ has changes to tracked files in ${checkout}:\n  ${edited.join('\n  ')}\n` +
              'Commit or stash them first: the exports rewrite files here, and undoing a failed run restores these folders from HEAD.',
          );
        }
        const status = git.status.length === 0 ? ['            clean'] : git.status.map((line) => `            ${line}`);
        lines.push(
          `flip day against ${redact(url)}, in place.`,
          `checkout    ${checkout} (${git.branch ?? '?'} at ${git.head ?? '?'})` +
            (git.worktreeOf === null ? '' : `, a linked worktree of ${git.worktreeOf}`),
          '            imported from, and exported into: the exports rewrite files here, to commit',
          'content/ and learn/ against HEAD (these are what gets imported):',
          ...status,
          `blob store  ${report.blobRoot}`,
          `backup      ${join(kept, `${database}-preflip-<UTC>.dump`)} (pg_dump -Fc, before anything else)`,
          `steps       ${steps.map((s) => s.name).join('; ')}`,
        );
      }
      await confirm(database, lines, stopping.signal, day);
      if (cutover) state.exportDir = mkdtempSync(join(tmpdir(), 'self-learn-cutover-export-'));
    } else if (inPlace) {
      // The owner's cut-over, rehearsed: a copy of a database flip day ran
      // on, and the worktree it ran from, read in place.
      const lines = await cutoverPreflight(report.checkout, from);
      state.exportDir = join(scratch, 'export');
      // The store flip day filled, as the environment names it unless
      // --blob-store says otherwise: read, never written.
      const store = opts['blob-store'] === undefined ? await blobRoot(process.env) : resolve(tilde(opts['blob-store']));
      if (!existsSync(store)) {
        throw new Refusal(`the blob store ${store} does not exist; name the one flip day filled with --blob-store <dir>.`);
      }
      // Its .owner names the database flip day ran on, and the catalog
      // refuses to write into a store another database owns; the copy
      // claims its own copy on its first write, and a half-written .tmp is
      // nobody's.
      const skip = new Set([join(store, '.owner'), join(store, '.tmp')]);
      cpSync(store, report.blobRoot, { recursive: true, mode: constants.COPYFILE_FICLONE, filter: (file) => !skip.has(file) });
      lines.push(`blob store  a copy of ${store}`);
      report.copy.method = await copyDatabase(from, database, { env: maintenance, created: () => made.add(database) });
      say(`copied ${from} into ${database} (${report.copy.method}); blobs under ${report.blobRoot}`);
      for (const line of lines) say(line);
    } else {
      if (cutover) {
        // Flip day's steps run first on the copy, and they need blobs this
        // rehearsal's temp store has; a flipped template's are elsewhere.
        const flipped = await flippedTypes(from, maintenance);
        if (flipped.length > 0) {
          throw new Refusal(
            `${from} owns ${flipped.join(', ')} already, and a --cutover rehearsal runs flip day first, into a temp blob ` +
              'store. Rehearse from an unflipped database (restore the pre-flip dump into a new one and pass it as --from), ' +
              `or rehearse the cut-over alone on the worktree flip day ran from: --cutover --from ${from} --checkout <dir>.`,
          );
        }
        state.exportDir = join(scratch, 'export');
      }
      const source = resolve(opts['tree-from'] ?? ROOT);
      for (const folder of CONTENT_FOLDERS) {
        if (!existsSync(join(source, folder))) throw new Refusal(`${source} has no ${folder}/ to rehearse with.`);
        // The studio's candidates are not content, and no import reads them.
        cpSync(join(source, folder), join(tree, folder), {
          recursive: true,
          filter: (file) => !file.includes(`${join('learn', 'assets', '.candidates')}`),
        });
      }
      report.copy.method = await copyDatabase(from, database, { env: maintenance, created: () => made.add(database) });
      say(`copied ${from} into ${database} (${report.copy.method}); tree ${tree}; blobs under ${report.blobRoot}`);
    }

    for (const step of steps) {
      if (report.interrupted) break;
      const started = Date.now();
      const args = typeof step.args === 'function' ? step.args() : step.args;
      let outcome;
      try {
        if (step.action !== undefined) {
          outcome = await step.action();
        } else {
          const { json, failed } = await catalog(args, env);
          const problem = failed ?? step.check?.(json) ?? null;
          outcome = { result: json, problem, gist: problem === null ? gist(args, json) : undefined };
          if (problem === null) outcome.warning = step.warn?.(json) ?? null;
        }
      } catch (error) {
        // A copy that could not be made, a tool that would not start: the
        // step failed, and the summary below still says where that leaves
        // the database. An interruption at a prompt is the run stopping.
        if (error instanceof Interrupted) report.interrupted = true;
        outcome = { result: null, problem: error?.message ?? String(error) };
      }
      const entry = {
        name: step.name,
        command: args === undefined ? step.command : `catalog ${args.join(' ')}`,
        ok: outcome.problem === null,
        ms: Date.now() - started,
        gist: outcome.problem ?? outcome.gist ?? '',
        warning: outcome.warning ?? null,
        result: outcome.result,
      };
      report.steps.push(entry);
      say(`${entry.ok ? 'ok  ' : 'FAIL'}  ${entry.name.padEnd(34)} ${entry.gist}`);
      if (entry.warning !== null) {
        report.warnings += 1;
        say(`warn  ${''.padEnd(34)} ${entry.warning}`);
      }
      if (!entry.ok) break;
    }
    report.ok = !report.interrupted && report.steps.length === steps.length && report.steps.every((s) => s.ok);
    if (cutover) {
      report.cutover = {
        parityReport: state.parityReport,
        waivers: state.waivers,
        tag: state.tag,
        untracked: state.untracked,
        rewrites: state.rewrites,
        exported: state.exported,
      };
    }
  } finally {
    for (const name of [...made]) {
      if (name === database && opts.keep) continue;
      const dropped = await drop(name);
      if (name === database) report.copy.dropped = dropped;
    }
    if (real && state.exportDir !== null) rmSync(state.exportDir, { recursive: true, force: true });
    if (scratch !== null && !opts.keep) rmSync(scratch, { recursive: true, force: true });
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, onSignal);
  }

  if (report.ok && cutover && checkout !== null) {
    // What the operator does next, printed and never run: the tag's push is
    // a person's to make, and so is keeping flip day's export in git.
    const q = shellQuote;
    const git = report.checkout;
    // Whenever origin was not seen to hold it: a tag made before the run
    // and never pushed keeps nothing once the checkout is gone.
    if (state.tagged.remote !== state.tag.commit) {
      report.next.push(`git -C ${q(checkout)} push origin ${FINAL_TAG}`);
    }
    if (state.exported.length > 0) {
      const files = state.exported.map(q).join(' ');
      if (git.branch === 'HEAD') report.next.push(`git -C ${q(checkout)} switch -c content-files-export`);
      // The commit names the files too, so anything else already staged in
      // the checkout stays out of what is presented as flip day's export.
      report.next.push(
        `git -C ${q(checkout)} add -- ${files}`,
        `git -C ${q(checkout)} commit -m ${q('The export flip day wrote into content/ and learn/')} -- ${files}`,
      );
    }
  }
  if (opts.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    say('');
    const passed = report.steps.filter((s) => s.ok).length;
    const name = cutover ? (checkout !== null ? 'the cut-over' : 'flip day and the cut-over') : 'flip day';
    say(
      `${report.ok ? `${name} passed` : report.interrupted ? `${name} interrupted` : `${name} stopped`}: ` +
        `${passed} of ${total} steps` +
        (report.warnings > 0 ? `, ${report.warnings} warning(s)` : ''),
    );
    if (cutover && state.parityReport !== null) say(`parity report: ${state.parityReport}`);
    if (!real) {
      say(
        opts.keep
          ? `kept ${database} and ${scratch}. Drop them with: ${join(PG_BIN, 'dropdb')} ${database} && rm -rf ${scratch}`
          : `dropped ${database}${report.ok ? '' : '; rerun with --keep to look at it'}`,
      );
    }
    if (report.ok && cutover && checkout !== null) {
      say(
        state.tag.made
          ? `tagged ${FINAL_TAG} at ${state.tag.commit} in ${checkout}. It is not pushed.`
          : `${FINAL_TAG} was already on ${state.tag.commit}, the commit compared; it is left as it is.`,
      );
      if (report.next.length > 0) {
        say(real ? 'Next, in this order (printed here, never run):' : 'The real run would print next, in this order:');
        report.next.forEach((command, i) => say(`  ${i + 1}. ${command}`));
      }
      if (state.exported.length > 0) {
        say(
          `The git add and commit keep flip day's export (${state.exported.length} file(s) HEAD holds in other bytes, or not at all) ` +
            `on a branch of ${checkout}. They are optional: the database holds the same content, and the tag holds it in HEAD's bytes.`,
        );
      }
      if (real) {
        const backup = report.backups.at(-1);
        if (state.untracked.length > 0) {
          say('these untracked files are in the database and its export, and not in the tag; remove them once the app has been checked:');
          for (const file of state.untracked) say(`     ${file}`);
        }
        say(`the backup from before the cut-over is ${backup.path}; keep it until the app has been checked`);
      }
    } else if (real && report.ok) {
      say('the exports rewrote files in this checkout: `git status content learn` lists them, to commit');
      say(`the backup from before step 1 is ${report.backup.path}; keep it until the app has been checked on the flipped database`);
    } else if (real && report.backup !== null) {
      say(`${database} may be part-way through ${day}. The backup from before it is ${report.backup.path}.`);
      say(`To put the database back as it was: ${report.backup.restore}`);
      if (!cutover) say('and `git checkout -- content learn` for any file an export rewrote (they had no edits of their own when it started).');
    } else if (real) {
      say(`nothing was changed: the run stopped before the backup, and every other step waits for it.`);
    }
  }
  return report.interrupted ? 130 : report.ok ? 0 : 1;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof Refusal) {
    process.stderr.write(`flip-rehearsal: ${error.message}\n`);
    process.exitCode = error instanceof Interrupted ? 130 : 2;
  } else {
    process.stderr.write(`flip-rehearsal: ${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
