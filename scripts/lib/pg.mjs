// Postgres helpers the scripts share: running the client tools, the
// connection a DATABASE_URL names, and copying one database into another.
// scripts/e2e.mjs and scripts/flip-rehearsal.mjs both copy `self_learn`, and
// the fallback for a template with sessions open is easy to get subtly wrong
// (a shell pipeline reports only psql's exit code), so it lives here once.
import { spawn } from 'node:child_process';
import { join } from 'node:path';

/** The Postgres 17 client tools. */
export const PG_BIN = process.env.PG_BIN ?? '/opt/homebrew/opt/postgresql@17/bin';

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
