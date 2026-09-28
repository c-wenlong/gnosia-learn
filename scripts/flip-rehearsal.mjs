// Flip day, rehearsed: every step that moves a database's content from files to
// rows, in the order docs/CONTENT-MIGRATION.md gives it, run against a copy.
//
// usage: node scripts/flip-rehearsal.mjs [--from DB] [--name COPY] [--tree-from DIR] [--keep] [--json]
//        node scripts/flip-rehearsal.mjs --real --database DB
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
//   migrate; doctor; import the tree; parity;
//   flip topics, flip tags, export topics,tags;
//   flip concepts, flip sessions, export concepts,sessions;
//   flip courses (not --strict: 133 items still name no concept), export courses;
//   flip diagrams, export diagrams;
//   import the tree again (every content type skipped as its own export); parity;
//   asset upload --source manimkc, twice (the second stores and writes nothing);
//   blob audit.
// Each step runs the catalog CLI with --json and is checked, and the first
// step that fails its check stops the run.
//
// --real is phase 3's cut-over: the same procedure against the named database
// itself, importing and exporting this checkout's own tree (so the exports'
// rewrites land in the working tree, to commit), with the blob store the
// environment names (~/.self-learn/blobs unless SELF_LEARN_HOME says
// otherwise) and without CATALOG_COPY_OK. It refuses unless --database names
// the database, and then asks for the name to be typed again on a terminal. It
// has no --yes: an agent or a script cannot answer it, on purpose.
//
// Environment: DATABASE_URL (its host and credentials are kept; its database
// name is replaced), PG_BIN (default /opt/homebrew/opt/postgresql@17/bin),
// MANIMKC_ROOT and TLDRAWKC_ROOT as the catalog reads them (a worktree with no
// submodules points them at a checkout that has them).
//
// Exit codes: 0 every step passed, 1 a step failed, 2 the invocation or a
// prerequisite was wrong, 130 interrupted.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'services/catalog/src/cli.ts');
const PG_BIN = process.env.PG_BIN ?? '/opt/homebrew/opt/postgresql@17/bin';
const USAGE =
  'usage: node scripts/flip-rehearsal.mjs [--from DB] [--name COPY] [--tree-from DIR] [--keep] [--json]\n' +
  '       node scripts/flip-rehearsal.mjs --real --database DB';

/** Why the invocation cannot run, exit 2. */
class Refusal extends Error {}

/**
 * Flip day's steps, in order. `check` reads the command's --json and returns
 * null when the step did what flip day needs, else a sentence saying what it
 * did instead. A command's own non-zero exit fails its step before `check`.
 */
function procedure(tree) {
  const exported = (types) => (json) => {
    const unrecorded = (json.types ?? []).filter((t) => !t.recorded).map((t) => t.type);
    return unrecorded.length === 0
      ? null
      : `the export hash was not recorded for ${unrecorded.join(', ')}, so the next import would refuse ${types} as edited`;
  };
  const flipped = (json) =>
    json.export?.recorded === true ? null : 'the flip recorded no export hash (is this database marked copy?)';
  const clean = (json) => (json.clean === true ? null : `${json.mismatches} parity mismatch(es)`);
  return [
    { name: 'migrate', args: ['migrate'] },
    { name: 'doctor', args: ['doctor'] },
    { name: 'import the tree', args: ['import', tree] },
    { name: 'parity', args: ['parity', tree], check: clean },
    { name: 'flip topics', args: ['flip', 'topics'], check: flipped },
    { name: 'flip tags', args: ['flip', 'tags'], check: flipped },
    { name: 'export topics, tags', args: ['export', '--only', 'topics,tags', '--out', tree], check: exported('topics and tags') },
    { name: 'flip concepts', args: ['flip', 'concepts'], check: flipped },
    { name: 'flip sessions', args: ['flip', 'sessions'], check: flipped },
    {
      name: 'export concepts, sessions',
      args: ['export', '--only', 'concepts,sessions', '--out', tree],
      check: exported('concepts and sessions'),
    },
    // Not --strict: the item-has-concept rule has violators until the owner
    // writes the notes the other courses need (Track B), and phase 3 arms or
    // waives it.
    { name: 'flip courses', args: ['flip', 'courses'], check: flipped },
    { name: 'export courses', args: ['export', '--only', 'courses', '--out', tree], check: exported('courses') },
    { name: 'flip diagrams', args: ['flip', 'diagrams'], check: flipped },
    { name: 'export diagrams', args: ['export', '--only', 'diagrams', '--out', tree], check: exported('diagrams') },
    {
      name: 'import the tree again',
      args: ['import', tree],
      check: (json) => {
        const skipped = new Set((json.skipped ?? []).map((s) => s.source));
        const read = ['topics', 'tags', 'concepts', 'courses', 'diagrams', 'sessions'].filter((t) => !skipped.has(t));
        return read.length === 0 ? null : `the import read ${read.join(', ')} from files after the flips`;
      },
    },
    { name: 'parity again', args: ['parity', tree], check: clean },
    { name: 'asset upload', args: ['asset', 'upload', '--source', 'manimkc', '--reason', 'flip day: manimkc renders into the blob store'] },
    {
      name: 'asset upload again',
      args: ['asset', 'upload', '--source', 'manimkc', '--reason', 'flip day: manimkc renders into the blob store'],
      check: (json) =>
        json.uploaded === 0 && json.rowsWritten === 0
          ? null
          : `the second upload stored ${json.uploaded} object(s) and wrote ${json.rowsWritten} row(s); it should do neither`,
    },
    { name: 'blob audit', args: ['blob', 'audit'] },
  ];
}

/** One line per step for the summary, from the command's own --json. */
function gist(step, json) {
  if (json === null) return '';
  switch (step.args[0]) {
    case 'migrate':
      return json.applied.length === 0 ? `already at ${json.head}` : `applied ${json.applied.join(', ')}; head ${json.head}`;
    case 'doctor':
      return `${json.violations} violation(s); rules ${json.rules.map((r) => `${r.name} ${r.state} ${r.violators}`).join(', ')}`;
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
        `${json.uploaded} uploaded, ${json.rowsWritten} rows written, ${json.refused} refused` +
        (json.postersSkipped === null ? '' : `; posters skipped: ${json.postersSkipped}`)
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
  } else if (parsed.database !== undefined) {
    throw new Refusal('--database goes with --real. A rehearsal copies --from (default self_learn) instead.');
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

function run(command, args, { env = process.env, input } = {}) {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', (error) => done({ status: null, stdout, stderr: `${stderr}${error.message}` }));
    child.once('close', (status) => done({ status, stdout, stderr }));
    if (input !== undefined) child.stdin.end(input);
  });
}

const pg = (tool, args, env) => run(join(PG_BIN, tool), args, { env });

/** The same server's maintenance connection details, for createdb and dropdb. */
function pgEnv() {
  const url = new URL(process.env.DATABASE_URL ?? 'postgres://localhost:5432/self_learn');
  const env = { ...process.env };
  if (url.hostname !== '') env.PGHOST = decodeURIComponent(url.hostname);
  if (url.port !== '') env.PGPORT = url.port;
  if (url.username !== '') env.PGUSER = decodeURIComponent(url.username);
  if (url.password !== '') env.PGPASSWORD = decodeURIComponent(url.password);
  return env;
}

/**
 * `createdb -T`, or `pg_dump | psql` into an empty database when the template
 * has sessions open. `created` is called the moment `to` exists, before any
 * copying into it, so a failed or interrupted dump still leaves the copy for
 * the cleanup to drop.
 */
async function copyDatabase(from, to, created) {
  const env = pgEnv();
  const made = await pg('createdb', ['-T', from, to], env);
  if (made.status === 0) {
    created();
    return 'createdb -T';
  }
  if (!/being accessed by other users/.test(made.stderr)) {
    throw new Error(`createdb -T ${from} ${to} failed: ${made.stderr.trim()}`);
  }
  const empty = await pg('createdb', [to], env);
  if (empty.status !== 0) throw new Error(`createdb ${to} failed: ${empty.stderr.trim()}`);
  created();
  const dumped = await new Promise((done) => {
    const dump = spawn(join(PG_BIN, 'pg_dump'), ['--no-owner', from], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const load = spawn(join(PG_BIN, 'psql'), ['-q', '-v', 'ON_ERROR_STOP=1', '-d', to], { env, stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    for (const child of [dump, load]) child.stderr.on('data', (chunk) => (stderr += chunk));
    load.stdin.on('error', () => {});
    dump.stdout.pipe(load.stdin);
    const exited = (child) => new Promise((ok) => child.once('close', ok));
    void Promise.all([exited(dump), exited(load)]).then(([a, b]) => done({ ok: a === 0 && b === 0, stderr }));
  });
  if (!dumped.ok) throw new Error(`copying ${from} into ${to} with pg_dump failed: ${dumped.stderr.trim()}`);
  return 'pg_dump (the template had sessions open)';
}

/** The operator types the database's name on a terminal, or nothing runs. */
async function confirm(name, lines) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Refusal(
      '--real asks for the database name to be typed on a terminal, and this process has none. ' +
        'Run it yourself, in a terminal; nothing else may confirm it.',
    );
  }
  process.stdout.write(`${lines.join('\n')}\n\n`);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const typed = await prompt.question(`Type the database name (${name}) to run flip day against it: `);
    if (typed.trim() !== name) throw new Refusal(`"${typed.trim()}" is not ${name}. Nothing was run.`);
  } finally {
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
  for (const tool of ['createdb', 'dropdb', 'pg_dump', 'psql']) {
    if (!real && !existsSync(join(PG_BIN, tool))) throw new Refusal(`${tool} not found in ${PG_BIN}; set PG_BIN.`);
  }

  const scratch = real ? null : realpathSync(mkdtempSync(join(tmpdir(), 'self-learn-flip-rehearsal-')));
  const tree = real ? ROOT : join(scratch, 'tree');
  const home = real ? (process.env.SELF_LEARN_HOME ?? '(default: ~/.self-learn)') : join(scratch, 'home');
  const url = urlFor(database);
  const env = { ...process.env, DATABASE_URL: url };
  if (real) delete env.CATALOG_COPY_OK;
  else Object.assign(env, { CATALOG_COPY_OK: '1', SELF_LEARN_HOME: home });

  const report = {
    mode: real ? 'real' : 'rehearsal',
    database: redact(url),
    template: real ? null : from,
    tree,
    blobHome: home,
    copy: real ? null : { name: database, method: null, kept: opts.keep, dropped: false },
    steps: [],
    ok: false,
  };

  let made = false;
  /** The copy in flight, so an interrupt drops it only once createdb or the dump has let go. */
  let copying = null;
  const cleanup = async () => {
    if (copying !== null) await copying.catch(() => {});
    if (real || !made || opts.keep) return;
    const drop = await pg('dropdb', ['--if-exists', '--force', database], pgEnv());
    report.copy.dropped = drop.status === 0;
    if (drop.status !== 0) say(`could not drop ${database}: ${drop.stderr.trim()}`);
  };
  let interrupted = false;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (interrupted) return;
      interrupted = true;
      process.stderr.write(`\nflip-rehearsal: ${signal}, stopping\n`);
      void cleanup().finally(() => {
        if (scratch !== null && !opts.keep) rmSync(scratch, { recursive: true, force: true });
        process.exit(130);
      });
    });
  }

  try {
    if (real) {
      await confirm(database, [
        `flip day against ${redact(url)}, in place.`,
        `tree        ${tree} (this checkout: its exports rewrite files here, to commit)`,
        `blob store  ${home}`,
        `steps       ${procedure(tree).map((s) => s.name).join('; ')}`,
      ]);
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
      copying = copyDatabase(from, database, () => {
        made = true;
      });
      report.copy.method = await copying;
      copying = null;
      say(`copied ${from} into ${database} (${report.copy.method}); tree ${tree}; blobs under ${home}`);
    }

    for (const step of procedure(tree)) {
      if (interrupted) break;
      const started = Date.now();
      const ran = await run(process.execPath, ['--import', 'tsx', CLI, ...step.args, '--json'], { env });
      let json = null;
      try {
        json = JSON.parse(ran.stdout);
      } catch {
        json = null;
      }
      const problem =
        ran.status !== 0
          ? `exit ${ran.status}: ${(ran.stderr.trim() || (json?.error ?? ran.stdout.trim())).slice(-1200)}`
          : json === null
            ? `printed no JSON: ${ran.stdout.trim().slice(-400)}`
            : (step.check?.(json) ?? null);
      const entry = {
        name: step.name,
        command: `catalog ${step.args.join(' ')}`,
        ok: problem === null,
        ms: Date.now() - started,
        gist: problem === null ? gist(step, json) : problem,
        result: json,
      };
      report.steps.push(entry);
      say(`${entry.ok ? 'ok  ' : 'FAIL'}  ${entry.name.padEnd(26)} ${entry.gist}`);
      if (!entry.ok) break;
    }
    report.ok = report.steps.length === procedure(tree).length && report.steps.every((s) => s.ok);
  } finally {
    await cleanup();
    if (scratch !== null && !opts.keep) rmSync(scratch, { recursive: true, force: true });
  }

  if (opts.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    say('');
    say(`${report.ok ? 'flip day passed' : 'flip day stopped'}: ${report.steps.filter((s) => s.ok).length} of ${procedure(tree).length} steps`);
    if (!real) {
      say(
        opts.keep
          ? `kept ${database} and ${scratch}. Drop them with: ${join(PG_BIN, 'dropdb')} ${database} && rm -rf ${scratch}`
          : `dropped ${database}${report.ok ? '' : '; rerun with --keep to look at it'}`,
      );
    } else if (report.ok) {
      say('the exports rewrote files in this checkout: `git status content learn` lists them, to commit');
    }
  }
  return report.ok ? 0 : 1;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof Refusal) {
    process.stderr.write(`flip-rehearsal: ${error.message}\n`);
    process.exitCode = 2;
  } else {
    process.stderr.write(`flip-rehearsal: ${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
