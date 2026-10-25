// What the scripts that drive the built app in a browser share: scripts/e2e.mjs
// and scripts/demo-record.mjs. A scratch catalog built from seed/, `next start`
// against it with the test password, and the borrowed playwright-core and
// Chromium. Each function takes the checkout it works on, so demo-record can
// record a build in another worktree.
import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { FLIP_ORDER } from './flip-order.mjs';
import { exec } from './proc.mjs';

/** Values the server is started with. Test values only; nothing real is typed anywhere. */
export const TEST_PASSWORD = 'e2e-smoke-owner-password';
export const TEST_SECRET = 'e2e-smoke-auth-secret-0123456789abcdef';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// The browser.

/** playwright-core's entry, borrowed from the tldrawkc submodule unless PLAYWRIGHT_CORE names one. */
export function playwrightCorePath(root) {
  return process.env.PLAYWRIGHT_CORE ?? join(root, 'tools/tldrawkc/node_modules/playwright-core/index.mjs');
}

/** Same lookup as docs/design/kit/shots.mjs: the newest Chromium in the Playwright cache. */
export function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const dir = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop() : undefined;
  if (!dir) return undefined; // let Playwright look for its own
  return join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
}

// ---------------------------------------------------------------------------
// The scratch catalog.

/**
 * The environment every catalog and learn command against a seed database
 * runs with. `home` is the blob store the import puts the seed's diagram SVG
 * in, never `~/.gnosia`. `emptyRoot` is an empty directory standing in for
 * every video tool's checkout, so the import runs none of them: the seed maps
 * no topic folder (it has no videos), and a real checkout's renders would be
 * refused as folders no topic maps.
 */
export function seedEnv({ root, db, home, emptyRoot }) {
  return {
    ...process.env,
    CATALOG_DB: db,
    DATABASE_URL: db,
    GNOSIA_HOME: home,
    MANIMKC_ROOT: emptyRoot,
    REMOTIONKC_ROOT: emptyRoot,
    REVIDEOKC_ROOT: emptyRoot,
    BLENDERKC_ROOT: emptyRoot,
    // The knowledge base is the seed's, for any learn command that still
    // looks at files; after the flips it reads the notes from rows.
    LEARN_ROOT: join(root, 'seed'),
  };
}

/**
 * One `npm run --silent <script> -- ...` from `root`, or a thrown error naming
 * it. It runs in a process group of its own (proc.mjs), so a Ctrl-C meant for
 * the calling script does not kill it halfway through.
 */
export async function npmScript(root, env, script, args) {
  const ran = await exec('npm', ['run', '--silent', script, '--', ...args], { env, cwd: root });
  if (ran.status !== 0) {
    throw new Error(`\`npm run ${script} -- ${args.join(' ')}\` failed (${ran.status}): ${(ran.stderr || ran.stdout).trim().slice(-600)}`);
  }
}

/**
 * Build the database `env` names from seed/: migrated, the seed imported the
 * way `catalog import` reads any tree, and every type flipped in the flip-day
 * order (the web app refuses a type the database does not own). A flip checks
 * parity against the tree and records its hash; it writes nothing under seed/.
 * No create-database step: `catalog migrate` makes the file on first connect,
 * which is the whole point of a SQLite catalog. `stopped` is asked before
 * each command; when it answers true the build throws instead of going on.
 */
export async function buildSeedDatabase(root, env, { stopped = () => false } = {}) {
  const steps = [['migrate'], ['import', join(root, 'seed')], ...FLIP_ORDER.map((type) => ['flip', type])];
  for (const args of steps) {
    // Checked between commands, so a teardown that awaits this build waits
    // for the command running now and starts no other.
    if (stopped()) throw new Error('interrupted');
    await npmScript(root, env, 'catalog', args);
  }
}

// ---------------------------------------------------------------------------
// The server.

/** A port nothing holds on either loopback address, since `localhost` may resolve to either. */
export async function freePort() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const port = await listenOnce(0, '127.0.0.1');
    // In use on ::1 means try another; no IPv6 loopback at all (EADDRNOTAVAIL) is fine.
    const clash = await listenOnce(port, '::1').then(() => false, (error) => error.code === 'EADDRINUSE');
    if (!clash) return port;
  }
  throw new Error('could not find a free port on 127.0.0.1 and ::1');
}

function listenOnce(port, host) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, host, () => {
      const bound = server.address().port;
      server.close(() => resolve(bound));
    });
  });
}

/**
 * Start `next start` from `root`'s apps/web on `port`, pointed at the database
 * file `db`, and resolve with its base URL once `/` answers 200. It builds
 * nothing. `home`, when given, is the blob store the seed's import wrote to.
 * `onSpawn` is handed the child the moment it exists, so a teardown that
 * lands while the server is still coming up can stop it.
 */
export async function startServer({ root, port, db, home = null, logFile, onSpawn }) {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    CATALOG_DB: db,
    DATABASE_URL: db,
    OWNER_PASSWORD: TEST_PASSWORD,
    AUTH_SECRET: TEST_SECRET,
    ...(home === null ? {} : { GNOSIA_HOME: home }),
    // The database is throwaway, and may have been made from one marked
    // `copy`; this is the flag that says writing to it is intended.
    CATALOG_COPY_OK: '1',
    // Blank rather than unset: Next loads apps/web/.env.local and fills in any
    // variable that is *undefined*, so deleting a key would let a real one back
    // in. An empty string is defined, and the provider cascade treats it as absent.
    NVIDIA_API_KEY: '',
    GEMINI_API_KEY: '',
    OPENROUTER_API_KEY: '',
  };
  delete env.__NEXT_PROCESSED_ENV;

  const log = openSync(logFile, 'a');
  // `next` directly, not `npm run start`: npm would be the process we hold and
  // the server a grandchild. `detached` makes it a group leader for stopGroup.
  const child = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: join(root, 'apps/web'),
    env,
    detached: true,
    stdio: ['ignore', log, log],
  });
  closeSync(log);
  onSpawn?.(child);

  let exited = null;
  child.once('exit', (code, signal) => {
    exited = { code, signal };
  });

  // `localhost`, not 127.0.0.1, although the server binds the IPv4 loopback
  // only: a route handler's `request.url` under `next start` always names
  // `localhost`, so the sign-in and sign-out redirects land there, and a
  // cookie set for 127.0.0.1 would not be sent to it.
  const base = `http://localhost:${port}`;
  const until = Date.now() + 60_000;
  for (;;) {
    if (exited) throw new Error(`next start exited (${exited.code ?? exited.signal}) before answering. Server log:\n${tail(logFile)}`);
    try {
      const res = await fetch(`${base}/`, { redirect: 'manual' });
      if (res.status === 200) return base;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > until) throw new Error(`next start did not answer 200 on / within 60s. Server log:\n${tail(logFile)}`);
    await sleep(250);
  }
}

/**
 * Signal the server's whole process group and wait until nothing in it answers.
 * The server is spawned `detached`, so it leads its own group; `kill(-pid)`
 * reaches whatever it started too. services/studio/src/proc.ts explains why
 * "told it to stop" is not the same as "it stopped". False when the group
 * survived SIGKILL.
 */
export async function stopGroup(child) {
  const alive = () => {
    try {
      process.kill(-child.pid, 0);
      return true;
    } catch (error) {
      return error.code === 'EPERM';
    }
  };
  const signal = (sig) => {
    try {
      process.kill(-child.pid, sig);
    } catch {
      /* already gone */
    }
  };
  for (const sig of ['SIGTERM', 'SIGKILL']) {
    signal(sig);
    const until = Date.now() + 5_000;
    while (alive() && Date.now() < until) await sleep(50);
    if (!alive()) return true;
  }
  return false;
}

export function tail(file, lines = 30) {
  try {
    return readFileSync(file, 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
  } catch {
    return '(no log)';
  }
}
