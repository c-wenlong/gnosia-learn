// Postgres helpers the scripts share: running the client tools, the
// connection a DATABASE_URL names, and copying one database into another.
// scripts/e2e.mjs and scripts/flip-rehearsal.mjs both copy `self_learn`, and
// the fallback for a template with sessions open is easy to get subtly wrong
// (a shell pipeline reports only psql's exit code), so it lives here once.
import { spawn, spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

/** Homebrew's keg-only Postgres 17, which is not on PATH unless linked. */
const HOMEBREW_BINS = ['/opt/homebrew/opt/postgresql@17/bin', '/usr/local/opt/postgresql@17/bin'];

const runnable = (file) => {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** The major version the catalog's server runs (compose.yaml, CI, Homebrew), and the oldest client it takes. */
export const PG_MAJOR = 17;

/** `pg_dump --version`'s major version for the tools in `dir`, or null when it does not answer. */
function majorIn(dir, env) {
  const ran = spawnSync(join(dir, 'pg_dump'), ['--version'], { env, encoding: 'utf8' });
  const match = ran.status === 0 ? /\b(\d+)(?:\.\d+)+/.exec(ran.stdout) : null;
  return match === null ? null : Number(match[1]);
}

/**
 * Where the Postgres client tools are, and how that was decided. PG_BIN when
 * it is set, and then only there, so a wrong PG_BIN is reported rather than
 * quietly bypassed. Otherwise the candidates in order: each directory on PATH
 * that holds `pg_dump`, `pg_config --bindir`, and Homebrew's postgresql@17;
 * the first whose `pg_dump` is at least PG_MAJOR wins, since an older pg_dump
 * refuses a newer server and an older client early on PATH must not hide a
 * current one installed beside it. With none that new, the first found is
 * used and `missingPgTools` says which version it is. `dir` is null when no
 * candidate has the tools, and `tried` lists every place looked.
 */
export function findPgBin(env = process.env) {
  if (env.PG_BIN !== undefined && env.PG_BIN !== '') {
    return { dir: env.PG_BIN, from: 'PG_BIN', major: majorIn(env.PG_BIN, env), tried: [`PG_BIN=${env.PG_BIN}`] };
  }
  const candidates = (env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => ({ dir, from: 'PATH' }));
  const config = spawnSync('pg_config', ['--bindir'], { env, encoding: 'utf8' });
  const bindir = config.status === 0 ? config.stdout.trim() : '';
  if (bindir !== '') candidates.push({ dir: bindir, from: 'pg_config --bindir' });
  for (const dir of HOMEBREW_BINS) candidates.push({ dir, from: 'Homebrew' });

  const found = [];
  for (const candidate of candidates) {
    if (!runnable(join(candidate.dir, 'pg_dump')) || found.some((f) => f.dir === candidate.dir)) continue;
    const major = majorIn(candidate.dir, env);
    if (major !== null && major >= PG_MAJOR) return { ...candidate, major, tried: [] };
    found.push({ ...candidate, major });
  }
  const tried = ['PATH', bindir === '' ? 'pg_config --bindir (no pg_config)' : `pg_config --bindir (${bindir})`, ...HOMEBREW_BINS];
  return found.length > 0 ? { ...found[0], tried } : { dir: null, from: null, major: null, tried };
}

const found = findPgBin();

/**
 * The Postgres 17 client tools' directory, as `findPgBin` resolved it. The
 * empty string when nothing was found, so a path joined onto it names the bare
 * tool and fails the existence check `missingPgTools` makes.
 */
export const PG_BIN = found.dir ?? '';

/**
 * Null when every one of `tools` is in PG_BIN and its pg_dump is not older
 * than PG_MAJOR, else a sentence saying what is missing or too old and where it
 * looked, for a script to refuse with.
 */
export function missingPgTools(tools) {
  const absent = tools.filter((tool) => found.dir === null || !runnable(join(found.dir, tool)));
  // A pg_dump that does not say its version is let through; it fails, if it
  // does, with its own message when it runs.
  if (absent.length === 0 && (found.major === null || found.major >= PG_MAJOR)) return null;
  const problem =
    found.dir === null
      ? `no Postgres client tools found (looked in ${found.tried.join(', ')})`
      : absent.length > 0
        ? `${absent.join(', ')} not found in ${found.dir} (from ${found.from})`
        : `the client tools in ${found.dir} (from ${found.from}) are version ${found.major}, older than the server's ${PG_MAJOR}, and pg_dump refuses a newer server`;
  return `${problem}. Install the Postgres ${PG_MAJOR} client tools (brew install postgresql@${PG_MAJOR}, or postgresql-client-${PG_MAJOR}), or set PG_BIN to their bin directory.`;
}

/**
 * Run a command and collect its output. `detached` puts it in a process group
 * of its own, so a Ctrl-C meant for the calling script does not kill it
 * halfway through: the script's signal handler decides what stops, and in
 * what order. `onSpawn` is handed the child the moment it exists, for a
 * handler that has to forward a signal to it.
 */
export function exec(command, args, { env = process.env, cwd, input, onSpawn } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    onSpawn?.(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', (error) => resolve({ status: null, signal: null, stdout, stderr: `${stderr}${error.message}` }));
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
    if (input !== undefined) child.stdin.end(input);
  });
}

/** One Postgres client tool from PG_BIN. */
export const pgTool = (tool, args, options) => exec(join(PG_BIN, tool), args, options);

/**
 * The environment the client tools read (PGHOST, PGPORT, PGUSER,
 * PGPASSWORD) for the server `url` names, so a password never goes on a
 * command line where `ps` would show it. No url, or one naming nothing,
 * leaves the tools on their defaults: the local socket as the current user.
 */
export function pgEnv(url, base = process.env) {
  const env = { ...base };
  if (url === undefined || url === null || url === '') return env;
  const parsed = new URL(url);
  if (parsed.hostname !== '') env.PGHOST = decodeURIComponent(parsed.hostname);
  if (parsed.port !== '') env.PGPORT = parsed.port;
  if (parsed.username !== '') env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password !== '') env.PGPASSWORD = decodeURIComponent(parsed.password);
  return env;
}

/**
 * `pg_dump from | psql into`, piped here rather than in a shell so both exit
 * codes are checked: a shell pipeline reports only psql's, and a dump that
 * died halfway would load as a quietly incomplete copy.
 */
export function dumpInto(from, into, env = process.env) {
  return new Promise((resolve) => {
    const dump = spawn(join(PG_BIN, 'pg_dump'), ['--no-owner', from], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const load = spawn(join(PG_BIN, 'psql'), ['-q', '-v', 'ON_ERROR_STOP=1', '-d', into], {
      env,
      detached: true,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    for (const child of [dump, load]) {
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.once('error', (error) => (stderr += `${error.message}\n`));
    }
    // psql exiting early closes the pipe under pg_dump; that exit code says why.
    load.stdin.on('error', () => {});
    dump.stdout.pipe(load.stdin);
    const exited = (child) => new Promise((done) => child.once('close', (code) => done(code)));
    void Promise.all([exited(dump), exited(load)]).then(([dumped, loaded]) =>
      resolve({ ok: dumped === 0 && loaded === 0, stderr: `${stderr}pg_dump exited ${dumped}, psql exited ${loaded}` }),
    );
  });
}

/**
 * Copy `from` into a new database `to`: `createdb -T`, or, when the template
 * has other sessions open (a dev server, the studio, another run), an empty
 * `createdb` and `dumpInto`, which is slower and does not care. `created` is
 * called the moment `to` exists, before anything is copied into it, so a
 * caller whose copy fails or is interrupted still knows there is a database
 * to drop; `onFallback` just before the slower path starts. Returns which
 * way it copied. Neither tool is ever signalled: a createdb stopped halfway
 * can leave a database nobody recorded, so an interrupted caller waits for
 * this to settle and then drops what it made.
 */
export async function copyDatabase(from, to, { env = process.env, created = () => {}, onFallback = () => {} } = {}) {
  const made = await pgTool('createdb', ['-T', from, to], { env });
  if (made.status === 0) {
    created();
    return 'createdb -T';
  }
  if (!/being accessed by other users/.test(made.stderr)) {
    throw new Error(`createdb -T ${from} ${to} failed: ${made.stderr.trim()}`);
  }
  onFallback();
  const empty = await pgTool('createdb', [to], { env });
  if (empty.status !== 0) throw new Error(`createdb ${to} failed: ${empty.stderr.trim()}`);
  created();
  const dumped = await dumpInto(from, to, env);
  if (!dumped.ok) throw new Error(`copying ${from} into ${to} with pg_dump failed: ${dumped.stderr.trim()}`);
  return 'pg_dump (the template had sessions open)';
}
