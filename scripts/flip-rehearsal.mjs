// Flip day, rehearsed: every step that moves a database's content from files to
// rows, in the order docs/CONTENT-MIGRATION.md gives it, run against a copy.
//
// usage: node scripts/flip-rehearsal.mjs [--from DB] [--name COPY] [--tree-from DIR] [--keep] [--json]
//        node scripts/flip-rehearsal.mjs --real --database DB --checkout DIR
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
// Environment: DATABASE_URL (its host and credentials are kept; its database
// name is replaced), PG_BIN (default /opt/homebrew/opt/postgresql@17/bin),
// MANIMKC_ROOT and TLDRAWKC_ROOT as the catalog reads them (a worktree with no
// submodules points them at a checkout that has them).
//
// Exit codes: 0 every step passed, 1 a step failed, 2 the invocation or a
// prerequisite was wrong, 130 interrupted.
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { FLIP_GROUPS } from './lib/flip-order.mjs';
import { copyDatabase, exec, PG_BIN, pgEnv, pgTool } from './lib/pg.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'services/catalog/src/cli.ts');
const USAGE =
  'usage: node scripts/flip-rehearsal.mjs [--from DB] [--name COPY] [--tree-from DIR] [--keep] [--json]\n' +
  '       node scripts/flip-rehearsal.mjs --real --database DB --checkout DIR';

/** The learner state: a backup whose archive does not list these tables' data is no backup. */
const LEARNER_TABLES = ['event', 'mastery', 'review'];

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

/** One line per step for the summary, from the command's own --json. */
function gist(step, json) {
  if (json === null) return '';
  switch (step.args[0]) {
    case 'migrate':
      return (
        (json.applied.length === 0 ? `already at ${json.head}` : `applied ${json.applied.join(', ')}; head ${json.head}`) +
        (json.held?.length > 0 ? `; held ${json.held.map((h) => h.tag).join(', ')}` : '')
      );
    case 'doctor':
      return (
        `${json.violations} violation(s); rules ${json.rules.map((r) => `${r.name} ${r.state} ${r.violators}`).join(', ')}` +
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
      return `hash ${json.export.hash.slice(0, 12)} recorded; ${json.export.rewrites.length} file(s) an export rewrites`;
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
        database: { type: 'string' },
        checkout: { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }).values;
  } catch (error) {
    throw new Refusal(`${error.message}\n${USAGE}`);
  }
  if (parsed.real) {
    const stray = ['from', 'name', 'tree-from', 'keep'].filter((k) => parsed[k] !== undefined && parsed[k] !== false);
    if (stray.length > 0) {
      throw new Refusal(
        `--real runs against the named database itself and this checkout's tree: --${stray.join(', --')} ` +
          'belong to a rehearsal.',
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
    for (const flag of ['database', 'checkout']) {
      if (parsed[flag] !== undefined) {
        throw new Refusal(`--${flag} goes with --real. A rehearsal copies --from (default self_learn) instead.`);
      }
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

/** A UTC time a file name can carry: 20260928T064512Z. */
function fileStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/**
 * --real's checkout, confirmed: the directory the operator named must be the
 * one this script sits in, since that is the tree it imports and exports into.
 * A copy of the script in a worktree or a clone would otherwise import a tree
 * without the owner's untracked files, and prune their rows.
 */
function confirmedCheckout(named) {
  const given = resolve(named.replace(/^~(?=$|\/)/, homedir()));
  if (!existsSync(given)) throw new Refusal(`--checkout ${named} does not exist.`);
  if (realpathSync(given) !== realpathSync(ROOT)) {
    throw new Refusal(
      `--checkout ${realpathSync(given)} is not the checkout this script is in, ${realpathSync(ROOT)}. ` +
        '--real imports and exports the tree beside the script: run the script from the checkout you mean.',
    );
  }
  return realpathSync(ROOT);
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

/** The operator types the database's name on a terminal, or nothing runs. */
async function confirm(name, lines, signal) {
  process.stdout.write(`${lines.join('\n')}\n\n`);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  // In a terminal's raw mode Ctrl-C and Ctrl-D reach readline, not the
  // process: either is a no.
  const declined = new Promise((_, reject) => {
    prompt.once('SIGINT', () => reject(new Interrupted('Interrupted at the confirmation. Nothing was run.')));
    prompt.once('close', () => reject(new Refusal('No name was typed. Nothing was run.')));
    signal.addEventListener('abort', () => reject(new Interrupted('Interrupted at the confirmation. Nothing was run.')));
  });
  try {
    const typed = await Promise.race([
      prompt.question(`Type the database name (${name}) to run flip day against it: `),
      declined,
    ]);
    if (typed.trim() !== name) throw new Refusal(`"${typed.trim()}" is not ${name}. Nothing was run.`);
  } finally {
    prompt.removeAllListeners('close');
    prompt.close();
  }
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
  const stamp = `${process.pid}_${Date.now().toString(36)}`;
  const from = opts.from ?? 'self_learn';
  const database = real ? opts.database.trim() : (opts.name ?? `self_learn_rehearsal_${stamp}`);
  if (!real && database === from) throw new Refusal(`--name ${database} is the template; a rehearsal never runs on its template.`);
  const checkout = real ? confirmedCheckout(opts.checkout) : null;
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
  const tree = real ? checkout : join(scratch, 'tree');
  const url = urlFor(database);
  const env = { ...process.env, DATABASE_URL: url };
  if (real) delete env.CATALOG_COPY_OK;
  else Object.assign(env, { CATALOG_COPY_OK: '1', SELF_LEARN_HOME: join(scratch, 'home') });
  // The server the catalog commands reach, for the client tools.
  const maintenance = pgEnv(url);
  const backupFile = join(real ? homedir() : scratch, `${database}-preflip-${fileStamp()}.dump`);
  const restore =
    `${join(PG_BIN, 'dropdb')} --force ${database} && ${join(PG_BIN, 'createdb')} ${database} && ` +
    `${join(PG_BIN, 'pg_restore')} --no-owner --exit-on-error -d ${database} ${backupFile}`;

  const report = {
    mode: real ? 'real' : 'rehearsal',
    database: redact(url),
    template: real ? null : from,
    tree,
    checkout: null,
    blobRoot: null,
    copy: real ? null : { name: database, method: null, kept: opts.keep, dropped: false },
    backup: null,
    steps: [],
    warnings: 0,
    interrupted: false,
    ok: false,
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
  const catalog = async (args, stepEnv) => {
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
    const failed =
      ran.status !== 0
        ? ran.signal !== null
          ? `stopped by ${ran.signal}`
          : `exit ${ran.status}: ${(ran.stderr.trim() || (json?.error ?? ran.stdout.trim())).slice(-1200)}`
        : json === null
          ? `printed no JSON: ${ran.stdout.trim().slice(-400)}`
          : null;
    return { json, failed };
  };

  const own = {
    /**
     * pg_dump -Fc of the database before anything changes it, then
     * `pg_restore --list` of the file: an archive that will not list, or
     * lists no data for the learner tables, is no way back.
     */
    backUp: async () => {
      if (existsSync(backupFile)) {
        return { problem: `${backupFile} already exists, and a backup is never written over`, result: null };
      }
      const dumped = await pgTool('pg_dump', ['-Fc', '-f', backupFile, '-d', database], { env: maintenance, onSpawn: forwardTo });
      if (dumped.status !== 0) {
        return { problem: `pg_dump failed${dumped.signal ? ` (${dumped.signal})` : ''}: ${dumped.stderr.trim().slice(-600)}`, result: null };
      }
      const bytes = existsSync(backupFile) ? statSync(backupFile).size : 0;
      if (bytes === 0) return { problem: `pg_dump exited 0 and ${backupFile} is empty`, result: null };
      const listed = await pgTool('pg_restore', ['--list', backupFile], { env: maintenance });
      if (listed.status !== 0) return { problem: `pg_restore --list cannot read ${backupFile}: ${listed.stderr.trim()}`, result: null };
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
          problem: `${backupFile} lists no data for ${missing.join(', ')}, so it would not bring the learner state back`,
          result: { path: backupFile, bytes, tables },
        };
      }
      report.backup = { path: backupFile, bytes, tables: tables.length, restore };
      return {
        problem: null,
        result: report.backup,
        gist: `${backupFile}, ${bytes} bytes, data for ${tables.length} tables (${LEARNER_TABLES.join(', ')} among them)`,
      };
    },

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

  // --- The run. ------------------------------------------------------------
  try {
    report.blobRoot = await blobRoot(env);
    const steps = procedure(tree, own);
    if (real) {
      const git = await describeCheckout(checkout);
      report.checkout = { path: checkout, ...git };
      const status =
        git.status === null
          ? ['            (git status failed)']
          : git.status.length === 0
            ? ['            clean']
            : git.status.map((line) => `            ${line}`);
      await confirm(
        database,
        [
          `flip day against ${redact(url)}, in place.`,
          `checkout    ${checkout} (${git.branch ?? '?'} at ${git.head ?? '?'})` +
            (git.worktreeOf === null ? '' : `, a linked worktree of ${git.worktreeOf}`),
          '            imported from, and exported into: the exports rewrite files here, to commit',
          'content/ and learn/ against HEAD (these are what gets imported):',
          ...status,
          `blob store  ${report.blobRoot}`,
          `backup      ${backupFile} (pg_dump -Fc, before anything else; restore: ${restore})`,
          `steps       ${steps.map((s) => s.name).join('; ')}`,
        ],
        stopping.signal,
      );
    } else {
      const source = resolve(opts['tree-from'] ?? ROOT);
      for (const folder of ['content', 'learn']) {
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
      let outcome;
      try {
        if (step.action !== undefined) {
          outcome = await step.action();
        } else {
          const { json, failed } = await catalog(step.args, env);
          const problem = failed ?? step.check?.(json) ?? null;
          outcome = { result: json, problem, gist: problem === null ? gist(step, json) : undefined };
          if (problem === null) outcome.warning = step.warn?.(json) ?? null;
        }
      } catch (error) {
        // A copy that could not be made, a tool that would not start: the
        // step failed, and the summary below still says where that leaves
        // the database.
        outcome = { result: null, problem: error?.message ?? String(error) };
      }
      const entry = {
        name: step.name,
        command: step.args === undefined ? step.command : `catalog ${step.args.join(' ')}`,
        ok: outcome.problem === null,
        ms: Date.now() - started,
        gist: outcome.problem ?? outcome.gist ?? '',
        warning: outcome.warning ?? null,
        result: outcome.result,
      };
      report.steps.push(entry);
      say(`${entry.ok ? 'ok  ' : 'FAIL'}  ${entry.name.padEnd(28)} ${entry.gist}`);
      if (entry.warning !== null) {
        report.warnings += 1;
        say(`warn  ${''.padEnd(28)} ${entry.warning}`);
      }
      if (!entry.ok) break;
    }
    report.ok = !report.interrupted && report.steps.length === steps.length && report.steps.every((s) => s.ok);
  } finally {
    for (const name of [...made]) {
      if (name === database && opts.keep) continue;
      const dropped = await drop(name);
      if (name === database) report.copy.dropped = dropped;
    }
    if (scratch !== null && !opts.keep) rmSync(scratch, { recursive: true, force: true });
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, onSignal);
  }

  const total = procedure(tree, own).length;
  if (opts.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    say('');
    const passed = report.steps.filter((s) => s.ok).length;
    say(
      `${report.ok ? 'flip day passed' : report.interrupted ? 'flip day interrupted' : 'flip day stopped'}: ` +
        `${passed} of ${total} steps` +
        (report.warnings > 0 ? `, ${report.warnings} warning(s)` : ''),
    );
    if (!real) {
      say(
        opts.keep
          ? `kept ${database} and ${scratch}. Drop them with: ${join(PG_BIN, 'dropdb')} ${database} && rm -rf ${scratch}`
          : `dropped ${database}${report.ok ? '' : '; rerun with --keep to look at it'}`,
      );
    } else if (report.ok) {
      say('the exports rewrote files in this checkout: `git status content learn` lists them, to commit');
      say(`the backup from before step 1 is ${backupFile}; keep it until the app has been checked on the flipped database`);
    } else if (report.backup !== null) {
      say(`${database} may be part-way through flip day. The backup from before step 1 is ${backupFile}.`);
      say(`To put the database back as it was: ${restore}`);
      say('and `git checkout -- content learn` for any file an export rewrote.');
    } else {
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
