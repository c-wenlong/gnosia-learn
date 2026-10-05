// End-to-end smoke test: the built app, a throwaway copy of the database, and
// headless Chromium walking the flows a person uses every day.
//
// usage: npm run e2e [-- --keep-db] [-- --headed] [-- --copy]
//
// What it does, in order:
//   1. Builds `self_learn_e2e_<pid>_<time>`: an empty database, migrated,
//      `catalog import seed/`, all six types flipped (the app reads content
//      from the database only), and one `learn observe` so a review card is
//      due. The default since phase 3 of docs/CONTENT-MIGRATION.md removed
//      `content/` and `learn/`: `seed/` is the content a clone has.
//      With --copy (or E2E_TEMPLATE_DB set) it copies a database instead,
//      `self_learn` unless E2E_TEMPLATE_DB names another, with `createdb -T`.
//      Every flow below that grades (a review rating, a session answer, Mark
//      watched, a settings change) writes real rows, and AGENTS.md is plain
//      that anything which grades runs against a copy, never `self_learn`.
//      Either database is dropped in `finally`, on a failure and on Ctrl-C too.
//   2. Starts `next start` from `apps/web/` on a free port, pointed at the copy,
//      with a fixed test password and secret and with every provider key blank.
//      It builds nothing: run `npm run build` first.
//   3. Drives the app through playwright-core, one named step per flow, and
//      screenshots a failing step into a directory under the OS temp dir.
//   4. Fails the run on any step failure, any `console.error`, any uncaught page
//      error and any response of 400 or more, except the 503 the agent routes
//      are expected to answer with no provider key.
//
// Options:
//   --keep-db    leave the copy behind and print its name, to look at afterwards
//   --headed     show the browser instead of running headless
//   --copy       copy self_learn (or E2E_TEMPLATE_DB) rather than build from
//                seed/. Built from the seed, which has no videos (D7), the
//                video step is skipped and says so, and the blob store
//                is a temp directory.
//   --seed       the default; accepted so an older command line still runs.
//
// Environment:
//   E2E_TEMPLATE_DB=<name>  copy this database rather than build from seed/; every content type must be flipped
//   PG_BIN=<dir>            the Postgres binaries (default: the pg_dump on PATH, then
//                           `pg_config --bindir`, then Homebrew's postgresql@17)
//   PLAYWRIGHT_CORE=<path>  playwright-core's index.mjs, when the tldrawkc submodule
//                           in this checkout is not installed
//   CHROMIUM=<path>         the browser binary, when not in the Playwright cache
//
// Like docs/design/kit/shots.mjs it borrows playwright-core from the tldrawkc
// submodule and the Chromium Playwright caches, so nothing is installed for it.
// It writes nothing into the tracked tree: screenshots and the server log go
// under os.tmpdir().
//
// Exit codes: 0 every step passed, 1 something failed, 2 a prerequisite is missing.
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FLIP_ORDER } from './lib/flip-order.mjs';
import { copyDatabase, exec as execTool, missingPgTools, PG_BIN } from './lib/pg.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps/web');

const flags = new Set(process.argv.slice(2));
const KEEP_DB = flags.delete('--keep-db');
const HEADED = flags.delete('--headed');
const SEED_FLAG = flags.delete('--seed');
const COPY = flags.delete('--copy') || Boolean(process.env.E2E_TEMPLATE_DB);
if (flags.size > 0 || (SEED_FLAG && COPY)) {
  console.error(
    `${flags.size > 0 ? `unknown option: ${[...flags].join(' ')}` : '--seed and --copy (or E2E_TEMPLATE_DB) name two databases'}\n` +
      'usage: npm run e2e [-- --keep-db] [-- --headed] [-- --copy]',
  );
  process.exit(2);
}
// Built from seed/ unless a copy was asked for: the repository has held no
// content of its own since the cut-over, and self_learn is the owner's.
const SEED = !COPY;

/** Values the server is started with. Test values only; nothing real is typed anywhere. */
const PASSWORD = 'e2e-smoke-owner-password';
const SECRET = 'e2e-smoke-auth-secret-0123456789abcdef';
// The database copied with --copy. `self_learn` by default; E2E_TEMPLATE_DB
// names another, such as a scratch copy flipped for a rehearsal, since the app
// reads content from the database only and an unflipped template fails every
// content page.
const TEMPLATE_DB = process.env.E2E_TEMPLATE_DB || 'self_learn';
// The pid and the start time, so a later run that happens to get the same pid
// can never collide with (or drop) a copy an earlier run kept with --keep-db.
const COPY_DB = `self_learn_e2e_${process.pid}_${Date.now().toString(36)}`;

// ---------------------------------------------------------------------------
// Prerequisites. Each one names what is missing and how to get it, then exits 2.

function missing(message) {
  console.error(`e2e: ${message}`);
  process.exit(2);
}

if (!existsSync(join(WEB, '.next/BUILD_ID'))) {
  missing('no production build at apps/web/.next. Run `npm run build` first; this script never builds.');
}

const missingTools = missingPgTools(['createdb', 'dropdb', 'psql', 'pg_dump']);
if (missingTools !== null) missing(missingTools);

const corePath = process.env.PLAYWRIGHT_CORE ?? join(ROOT, 'tools/tldrawkc/node_modules/playwright-core/index.mjs');
if (!existsSync(corePath)) {
  missing(
    `playwright-core not found at ${corePath}. It comes from the tldrawkc submodule, not from this repo's dependencies: ` +
      '`git submodule update --init tools/tldrawkc && (cd tools/tldrawkc && npm ci)`, or set PLAYWRIGHT_CORE to its index.mjs.',
  );
}

/** Same lookup as docs/design/kit/shots.mjs: the newest Chromium in the Playwright cache. */
function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const dir = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop() : undefined;
  if (!dir) return undefined; // let Playwright look for its own
  return join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
}
const chromiumPath = findChromium();
if (chromiumPath !== undefined && !existsSync(chromiumPath)) {
  missing(`Chromium not found at ${chromiumPath}. Run \`npx playwright install chromium\` inside tools/tldrawkc, or set CHROMIUM.`);
}

const { chromium } = await import(pathToFileURL(corePath).href);

const OUT = mkdtempSync(join(tmpdir(), 'self-learn-e2e-'));
const SERVER_LOG = join(OUT, 'server.log');
console.log(`e2e: screenshots and the server log go to ${OUT}`);

/**
 * With --seed, the blob store the import puts the seed's diagram SVG in, and
 * the server reads it from: under OUT, never `~/.self-learn`. And an empty
 * manimkc root, so the import runs no manimkc source: the seed maps no topic
 * folder (it has no videos), and a real checkout's renders would be refused
 * as folders no topic maps. The same empty directory is the remotionkc and
 * revideokc root, for the same reason: their topic.yml files name topics the
 * seed lacks.
 */
const SEED_HOME = SEED ? join(OUT, 'home') : null;
const NO_MANIMKC = SEED ? mkdtempSync(join(OUT, 'no-manimkc-')) : null;

// ---------------------------------------------------------------------------
// Cleanup. One idempotent teardown, reached from `finally` and from a signal,
// so an interrupted run still stops the server and drops the copy.

/**
 * What a teardown has to undo. Each is recorded the moment it starts, not when
 * it finishes, so a signal that lands mid-launch or mid-copy still finds it:
 * `browser` is the launch promise, `copying` the copy's.
 */
const held = { browser: null, server: null, copying: null };
let teardown = null;
let interrupted = false;
/** Why the teardown did not finish cleanly, if it did not. A leftover copy fails the run. */
let teardownProblem = null;

function cleanup() {
  teardown ??= (async () => {
    const browser = held.browser === null ? null : await held.browser.catch(() => null);
    if (browser !== null) await browser.close().catch(() => {});
    if (held.server !== null) await stopGroup(held.server);
    if (held.copying !== null) {
      // Let an in-flight createdb or dump finish first; a drop that ran ahead
      // of it would find nothing and leave the finished copy behind.
      await held.copying.catch(() => {});
      if (KEEP_DB) {
        console.log(`e2e: kept the database ${COPY_DB}. Drop it with: ${join(PG_BIN, 'dropdb')} ${COPY_DB}`);
      } else {
        // --force ends any connection still open, so a server that was slow to
        // die cannot leave the copy behind.
        const drop = await pg('dropdb', ['--if-exists', '--force', COPY_DB]);
        if (drop.status === 0) console.log(`e2e: dropped ${COPY_DB}`);
        else {
          teardownProblem = `could not drop ${COPY_DB}: ${drop.stderr.trim()}. Drop it by hand: ${join(PG_BIN, 'dropdb')} --force ${COPY_DB}`;
          console.error(`e2e: ${teardownProblem}`);
        }
      }
    }
  })();
  return teardown;
}

// `on`, not `once`: Ctrl-C under `npm run` delivers SIGINT twice, once to the
// whole foreground group and once more forwarded by npm, and with no listener
// left the second one would kill this process halfway through the teardown.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (interrupted) return;
    interrupted = true;
    console.error(`\ne2e: ${signal}, cleaning up`);
    void cleanup().finally(() => process.exit(130));
  });
}

/** Called before starting anything new, so nothing is started after a teardown began. */
function stopIfInterrupted() {
  if (interrupted) throw new Error('interrupted');
}

/**
 * Run a command from the repository root and collect its output, in a process
 * group of its own (scripts/lib/pg.mjs), so a Ctrl-C meant for this script
 * does not kill createdb halfway through; the handler above decides what
 * stops, and in what order.
 */
const exec = (command, args, env = process.env) => execTool(command, args, { env, cwd: ROOT });

const pg = (tool, args) => exec(join(PG_BIN, tool), args);

/**
 * Signal the server's whole process group and wait until nothing in it answers.
 * The server is spawned `detached`, so it leads its own group; `kill(-pid)`
 * reaches whatever it started too. services/studio/src/proc.ts explains why
 * "told it to stop" is not the same as "it stopped".
 */
async function stopGroup(child) {
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
    if (!alive()) return;
  }
  teardownProblem = `the server's process group ${child.pid} survived SIGKILL`;
  console.error(`e2e: ${teardownProblem}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// The database copy.

/** The environment every catalog and learn command against the seed database runs with. */
function seedEnv() {
  return {
    ...process.env,
    DATABASE_URL: `postgres://localhost:5432/${COPY_DB}`,
    SELF_LEARN_HOME: SEED_HOME,
    MANIMKC_ROOT: NO_MANIMKC,
    REMOTIONKC_ROOT: NO_MANIMKC,
    REVIDEOKC_ROOT: NO_MANIMKC,
    // The knowledge base is the seed's, for any learn command that still
    // looks at files; after the flips below it reads the notes from rows.
    LEARN_ROOT: join(ROOT, 'seed'),
  };
}

/** One `npm run --silent <script> -- ...` against the seed database, or a thrown error naming it. */
async function seedCommand(script, args) {
  const ran = await exec('npm', ['run', '--silent', script, '--', ...args], seedEnv());
  if (ran.status !== 0) {
    throw new Error(`\`npm run ${script} -- ${args.join(' ')}\` failed (${ran.status}): ${(ran.stderr || ran.stdout).trim().slice(-600)}`);
  }
}

/**
 * --seed: the database is built, not copied. Migrated, the seed imported the
 * way `catalog import` reads any tree, every type flipped in the flip-day
 * order (the web app refuses a type the database does not own), and one
 * answer recorded through the learn CLI so the review flow has a card (the
 * seed carries content, not learner state). A flip checks parity against the
 * tree and records its hash; it writes nothing under seed/.
 */

async function buildFromSeed() {
  const made = await pg('createdb', [COPY_DB]);
  if (made.status !== 0) throw new Error(`createdb ${COPY_DB} failed: ${made.stderr.trim()} (is Postgres running?)`);
  await seedCommand('catalog', ['migrate']);
  await seedCommand('catalog', ['import', join(ROOT, 'seed')]);
  for (const type of FLIP_ORDER) await seedCommand('catalog', ['flip', type]);
  await seedCommand('learn', ['observe', '--concept', 'tool-calling', '--correct', 'true']);
}

async function createCopy() {
  if (SEED) {
    await buildFromSeed();
    return markReviewDue();
  }
  // No `catalog migrate` afterwards: a template copy carries the schema and the
  // drizzle journal of `self_learn` exactly, so it is as migrated as its source.
  // `createdb -T` needs the template to have no other connections, and a dev
  // server or another session holding `self_learn` open is ordinary, so the
  // copy falls back to a dump into an empty database, which does not care.
  await copyDatabase(TEMPLATE_DB, COPY_DB, {
    onFallback: () => console.log(`e2e: ${TEMPLATE_DB} is in use, copying it with pg_dump instead`),
  }).catch((error) => {
    throw new Error(`${error.message} (is Postgres running, and does ${TEMPLATE_DB} exist?)`);
  });
  await markReviewDue();
}

async function markReviewDue() {
  // Make the review step deterministic: whatever the owner has already cleared,
  // the earliest card in the copy is due now. `review` is a projection of the
  // event log, and this is a throwaway copy, so rewriting one row is harmless.
  // `self_learn.copy_ok` because the template may itself be a copy once the
  // primary has moved (edge case 14 of docs/CONTENT-MIGRATION.md), and a copy
  // refuses every write that does not say it means it.
  const due = await pg('psql', [
    '-d', COPY_DB, '-v', 'ON_ERROR_STOP=1', '-Atc',
    `set self_learn.copy_ok = on;
     update review set due = now() - interval '1 minute'
      where (learner_id, concept_slug) in (select learner_id, concept_slug from review order by due limit 1)`,
  ]);
  if (due.status !== 0) throw new Error(`could not mark a review due in the copy: ${due.stderr.trim()}`);
}

// ---------------------------------------------------------------------------
// The server.

/** A port nothing holds on either loopback address, since `localhost` may resolve to either. */
async function freePort() {
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

async function startServer(port) {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: `postgres://localhost:5432/${COPY_DB}`,
    OWNER_PASSWORD: PASSWORD,
    AUTH_SECRET: SECRET,
    // The seed's blob store, where its import put the diagram SVG.
    ...(SEED_HOME === null ? {} : { SELF_LEARN_HOME: SEED_HOME }),
    // The copy is throwaway, and may have been made from a database marked
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

  stopIfInterrupted();
  const log = openSync(SERVER_LOG, 'a');
  // `next` directly, not `npm run start`: npm would be the process we hold and
  // the server a grandchild. `detached` makes it a group leader for stopGroup.
  const child = spawn(process.execPath, [join(ROOT, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: WEB,
    env,
    detached: true,
    stdio: ['ignore', log, log],
  });
  closeSync(log);
  held.server = child;

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
    if (exited) throw new Error(`next start exited (${exited.code ?? exited.signal}) before answering. Server log:\n${tail(SERVER_LOG)}`);
    try {
      const res = await fetch(`${base}/`, { redirect: 'manual' });
      if (res.status === 200) return base;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > until) throw new Error(`next start did not answer 200 on / within 60s. Server log:\n${tail(SERVER_LOG)}`);
    await sleep(250);
  }
}

function tail(file, lines = 30) {
  try {
    return readFileSync(file, 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
  } catch {
    return '(no log)';
  }
}

// ---------------------------------------------------------------------------
// Steps.

const results = [];

/** A step this run cannot take, and why: listed as SKIP, never as a pass. */
function skip(name, why) {
  results.push({ name, ok: true, skipped: why, ms: 0 });
}
/** Console errors, page errors and bad responses, each tagged with the step it happened in. */
const problems = [];
let current = 'startup';

async function step(name, page, fn) {
  stopIfInterrupted();
  current = name;
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
  } catch (error) {
    const file = join(OUT, `${String(results.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`);
    let shot = file;
    await page.screenshot({ path: file, fullPage: true }).catch(() => {
      shot = null;
    });
    // Playwright's first line says what timed out; its call log says what it was
    // waiting for, which is the line that makes a failure readable.
    const lines = String(error?.message ?? error).split('\n');
    const waiting = lines.find((line) => /waiting for/.test(line))?.trim().replace(/^- /, '');
    const message = waiting && waiting !== lines[0] ? `${lines[0]} (${waiting})` : lines[0];
    results.push({ name, ok: false, ms: Date.now() - started, error: message, shot });
  }
}

/**
 * Wait until React has hydrated an element, then click it.
 *
 * A server-rendered button is visible and enabled before its `onClick` exists,
 * and a click in that window does nothing at all, which is the classic flaky
 * smoke test. React stamps a `__reactProps$…` key on every host node it has
 * hydrated, so its presence is the moment the handler is attached. A React
 * internal, but a stable one, and a smoke test that waits on a guess is worse.
 *
 * The node can be replaced while it waits, as the tutor's plain field is when
 * the studio's @ field is swapped in, and React deletes that key from a node
 * it removes, so a removed node would hold the wait to its timeout. The wait
 * ends on removal too, and the locator is resolved again.
 */
async function hydrated(page, locator, timeout = 15_000) {
  const until = Date.now() + timeout;
  for (;;) {
    const left = () => Math.max(1, until - Date.now());
    await locator.waitFor({ state: 'visible', timeout: left() });
    const handle = await locator.elementHandle({ timeout: left() });
    try {
      const done = await page.waitForFunction(
        (el) => !el.isConnected || Object.keys(el).some((k) => k.startsWith('__reactProps')),
        handle,
        { timeout: left() },
      );
      await done.dispose();
      if (await handle.evaluate((el) => el.isConnected)) return locator;
    } finally {
      await handle.dispose();
    }
  }
}
async function clickHydrated(page, locator) {
  await (await hydrated(page, locator)).click();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function progressValue(bar) {
  return (await bar.getAttribute('aria-valuenow')) ?? '';
}

async function run() {
  held.copying = createCopy();
  await held.copying;
  console.log(SEED ? `e2e: built ${COPY_DB} from seed/` : `e2e: copied ${TEMPLATE_DB} to ${COPY_DB}`);
  const base = await startServer(await freePort());
  console.log(`e2e: next start is answering on ${base}`);

  stopIfInterrupted();
  held.browser = chromium.launch({
    executablePath: chromiumPath,
    headless: !HEADED,
    // Signals are handled above, so the browser closes as part of one teardown.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  const browser = await held.browser;
  // Wide enough that the concept workspace shows all three panels side by side.
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);

  const isExpectedAgent503 = (url, status) => status === 503 && new URL(url).pathname.startsWith('/api/agent/');
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const where = message.location()?.url ?? '';
    // Chromium logs every failed resource load as a console error; the agent
    // routes' 503 is the one failure this run expects.
    if (/Failed to load resource: the server responded with a status of 503/.test(message.text()) && where && isExpectedAgent503(where, 503)) return;
    problems.push({ step: current, what: `console.error: ${message.text().slice(0, 200)}` });
  });
  page.on('pageerror', (error) => problems.push({ step: current, what: `page error: ${error.message.slice(0, 200)}` }));
  page.on('response', (response) => {
    const status = response.status();
    if (status < 400 || isExpectedAgent503(response.url(), status)) return;
    problems.push({ step: current, what: `${status} ${response.request().method()} ${response.url().replace(base, '')}` });
  });

  const go = (path) => page.goto(base + path, { waitUntil: 'load' });
  const main = page.getByRole('main');
  const state = { concept: null, answered: false };

  await step('landing: Open your book goes to /sign-in', page, async () => {
    await go('/');
    await page.getByRole('link', { name: 'Open your book' }).first().click();
    await page.waitForURL(`${base}/sign-in`);
    await page.getByRole('heading', { name: 'Open your book' }).waitFor();
  });

  await step('sign-in: a wrong password shows the error', page, async () => {
    if (!page.url().startsWith(`${base}/sign-in`)) await go('/sign-in');
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/sign-in\?.*error=password/);
    // Scoped to the form: Next's route announcer is a second role=alert on the page.
    await page.locator('form').getByRole('alert').getByText('That is not the owner password.').waitFor();
  });

  await step('sign-in: the right password lands on /home', page, async () => {
    if (!page.url().startsWith(`${base}/sign-in`)) await go('/sign-in');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(`${base}/home`);
  });

  await step('review: Start recall on Home opens the due concept, and All reviews rates it Good and moves on', page, async () => {
    await go('/home');
    // Home offers a few due cards, never the queue's count (H3 of
    // docs/proposals/home-page.md). Since recall-in-chat phase 3 (#381) each
    // opens its concept, and Start recall the first, whose tutor opens on a
    // recall question: the note's check, or one asked of the model, which
    // with no provider key in this run fails and says so.
    const recall = main.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: 'Worth a quick recall' }) });
    const start = recall.getByRole('link', { name: 'Start recall', exact: true });
    const href = await start.getAttribute('href');
    assert(href !== null && /^\/learn\/[^/?]+$/.test(href), `Start recall links to ${href}`);
    assert((await recall.locator('li a').first().getAttribute('href')) === href, `the first due card does not link to ${href}`);
    await clickHydrated(page, start);
    await page.waitForURL(`${base}${href}`);
    // The seed's due concept (tool-calling) has a check, so the tutor must open
    // on it; a copy's due concept may have none, and then the model is asked.
    const opening = SEED
      ? /Its review is due, so one question before anything else/
      : /Its review is due, so one question before anything else|This review is due, but the tutor could not open on a recall question/;
    await main.getByText(opening).first().waitFor();

    // The whole queue stays one link away, and grades as it always did.
    await go('/home');
    await clickHydrated(page, recall.getByRole('link', { name: 'All reviews', exact: true }));
    await page.waitForURL(`${base}/review`);
    const bar = page.getByRole('progressbar', { name: 'Review progress' });
    await bar.waitFor();
    const before = await progressValue(bar);

    // A recall card reveals with Show answer; a check card reveals by answering.
    const show = page.getByRole('button', { name: 'Show answer' });
    const options = page.getByRole('group', { name: 'Options' });
    await show.or(options).first().waitFor();
    if (await show.isVisible()) await clickHydrated(page, show);
    else await clickHydrated(page, options.getByRole('button').first());

    const good = page.getByRole('group', { name: 'Rate your recall' }).getByRole('button', { name: /^Good,/ });
    await clickHydrated(page, good);
    // Moved on: the bar advanced to the next card, or the close screen opened.
    // Both, because with one card due the bar is at 100 before and after.
    await page.waitForFunction(
      (value) =>
        document.querySelector('[role=progressbar][aria-label="Review progress"]')?.getAttribute('aria-valuenow') !== value ||
        [...document.querySelectorAll('h1')].some((h) => h.textContent?.trim() === 'Review done'),
      before,
    );
    const done = page.getByRole('heading', { name: 'Review done' });
    await done.or(show).or(options).first().waitFor();
  });

  // `?only=` outlived Home's old Recall these link (#381); an old link still lands somewhere honest.
  await step('review: an ?only= link whose cards are no longer due says so', page, async () => {
    await go('/review?only=not-a-due-card');
    await main.getByRole('heading', { name: 'Already reviewed' }).waitFor();
    await main.getByRole('link', { name: 'All reviews' }).waitFor();
  });

  // G1 of docs/proposals/knowledge-map.md: the map is the default view, the
  // table one press away, and each says so in the URL. The map opens on a card
  // per domain (D2 of docs/proposals/domain-map.md).
  await step('learn: /learn opens on the domain cards, and the table is one press away', page, async () => {
    await go('/learn');
    const cards = main.getByRole('region', { name: 'Domains' });
    await cards.waitFor();
    const slugs = await cards.locator('[data-domain-card]').evaluateAll((els) => els.map((el) => el.getAttribute('data-domain-card')));
    for (const slug of ['foundations', 'machine-learning', 'agentic-ai']) assert(slugs.includes(slug), `no card for ${slug}: ${slugs}`);
    assert(!new URL(page.url()).searchParams.has('view'), 'the default view wrote view= into the URL');
    await clickHydrated(page, main.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Table' }));
    await main.getByRole('table').waitFor();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('view') === 'table');
    await page.reload({ waitUntil: 'load' });
    await main.getByRole('table').waitFor();
    assert((await main.locator('[data-domain-card], svg[data-domain-graph]').count()) === 0, 'the table view also drew the map');
  });

  await step('learn: /learn renders the concept table', page, async () => {
    await go('/learn?view=table');
    const table = main.getByRole('table');
    await table.getByRole('columnheader', { name: 'Concept' }).waitFor();
    // The Status menu opens on its listbox and closes on Escape, focus back on the trigger.
    const status = main.getByRole('button', { name: /^Status:/ });
    await clickHydrated(page, status);
    await main.getByRole('listbox', { name: 'Status' }).getByRole('option', { name: /^All\b/ }).waitFor();
    await page.keyboard.press('Escape');
    await main.getByRole('listbox', { name: 'Status' }).waitFor({ state: 'detached' });
    assert(await status.evaluate((el) => el === document.activeElement), 'Escape did not return focus to the Status trigger');
    const first = table.getByRole('link').first();
    await first.waitFor();
    const href = await first.getAttribute('href');
    assert(href !== null && /^\/learn\/[a-z0-9-]+$/.test(href), `the first concept row links to ${href}`);
    state.concept = href.slice('/learn/'.length);
  });

  // D2 and D4: a card opens its domain's picture, a topic's title narrows it,
  // and the breadcrumb and Back go back up.
  await step('learn: a domain card opens its picture, a topic narrows it, and Back goes up', page, async () => {
    await go('/learn');
    const card = main.locator('[data-domain-card="machine-learning"]');
    const total = Number((await card.textContent())?.match(/(\d+) concepts?/)?.[1]);
    await clickHydrated(page, card);
    await page.waitForFunction(() => new URL(location.href).searchParams.get('domain') === 'machine-learning');
    const graph = main.getByRole('group', { name: /^Machine learning map/ });
    await graph.waitFor();
    assert((await graph.locator('[data-concept]').count()) === total, `the picture drew ${await graph.locator('[data-concept]').count()} of ${total}`);
    // Every concept the picture draws is in this domain; the edge out to foundations is listed instead.
    await main.locator('[data-outside]').getByRole('button', { name: /^Foundations/ }).waitFor();
    const crumbs = main.getByRole('navigation', { name: 'Breadcrumb' });
    assert((await crumbs.getByRole('listitem').allTextContents()).join('/') === 'Learn/Machine learning', 'the breadcrumb is wrong');

    const title = graph.locator('[data-topic-title]').first();
    const topic = await title.getAttribute('data-topic-title');
    await title.click();
    await page.waitForFunction((t) => new URL(location.href).searchParams.get('topic') === t, topic);
    assert((await crumbs.getByRole('listitem').count()) === 3, 'the topic is not in the breadcrumb');

    await page.goBack();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('topic'));
    await main.getByRole('group', { name: /^Machine learning map/ }).locator('[data-topic-title]').first().waitFor();
    await page.goBack();
    await main.getByRole('region', { name: 'Domains' }).waitFor();
    assert(!new URL(page.url()).searchParams.has('domain'), 'Back did not leave the domain');
  });

  // D4 and D8: a concept opens its panel, a pick there crosses into the
  // prerequisite's domain, and search and filters work on both levels.
  await step('learn: a concept opens its panel, a pick crosses domains, and search and filters work', page, async () => {
    await go('/learn?domain=machine-learning');
    const graph = main.getByRole('group', { name: /^Machine learning map/ });
    await clickHydrated(page, graph.locator('[data-concept="softmax"]'));
    await page.waitForFunction(() => new URL(location.href).searchParams.get('concept') === 'softmax');
    const panel = main.getByRole('region', { name: 'Concept details' });
    await panel.getByRole('heading', { name: 'Softmax' }).waitFor();
    const vector = panel.locator('button[data-concept="vector-as-a-list-of-numbers"]');
    assert(/Foundations/.test((await vector.textContent()) ?? ''), 'the prerequisite in another domain does not say which');
    await vector.click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('domain') === 'foundations');
    assert(
      (await main.getByRole('group', { name: /^Foundations map/ }).locator('[data-concept="vector-as-a-list-of-numbers"]').getAttribute('aria-pressed')) === 'true',
      'the picked concept is not selected in its domain',
    );

    // On the cards, a search counts matches per domain, and Enter opens the best one.
    await go('/learn');
    const search = main.getByRole('searchbox', { name: 'Search concepts' });
    await hydrated(page, search);
    await search.fill('react');
    await page.waitForFunction(() => document.querySelector('[data-domain-card="foundations"]')?.getAttribute('data-dim') === 'true');
    assert((await main.locator('[data-domain-card="agentic-ai"]').getAttribute('data-dim')) === 'false', 'the domain with the match is dimmed');
    await search.press('Enter');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('concept') === 'react-loop');
    assert(new URL(page.url()).searchParams.get('domain') === 'agentic-ai', 'Enter did not open the match in its domain');

    // Inside a domain, a filter dims what it would hide.
    await go('/learn?domain=machine-learning&filter=untouched');
    const filtered = main.getByRole('group', { name: /^Machine learning map/ });
    await filtered.locator('[data-concept]').first().waitFor();
    const marks = await filtered.locator('[data-concept]').evaluateAll((els) =>
      els.map((el) => ({ dim: el.getAttribute('data-dim') === 'true', untouched: /Not started/.test(el.getAttribute('aria-label') ?? '') })),
    );
    assert(marks.length > 0 && marks.every((m) => m.dim === !m.untouched), 'the filter dimmed the wrong concepts');
  });

  // D5 and D6: hover lights a concept's edges and fades the rest, the list
  // follows, and a concept drags, its place kept for the session until Reset.
  await step('learn: hover lights a concept\'s edges, and a dragged concept stays until Reset', page, async () => {
    await go('/learn?domain=machine-learning');
    const graph = main.getByRole('group', { name: /^Machine learning map/ });
    const dot = graph.locator('[data-concept="self-attention"] circle[data-dot]');
    await hydrated(page, graph.locator('[data-concept="self-attention"]'));
    const box = await dot.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await graph.locator('[data-concept="self-attention"][data-hover="true"]').waitFor();
    assert((await graph.locator('[data-concept="attention-weights"]').getAttribute('data-related')) === 'true', 'a prerequisite is not lit');
    assert((await graph.locator('[data-faded="true"]').count()) > 0, 'nothing faded');
    assert((await graph.locator('[data-edge][data-hot="true"]').count()) > 0, 'no edge lit');
    assert((await main.locator('[data-list-concept="self-attention"]').getAttribute('data-hover')) === 'true', 'the list did not follow the hover');

    // Drag it 80px right and 40px down; the press does not select.
    const cx = Number(await dot.getAttribute('cx'));
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 8, box.y + box.height / 2 + i * 4);
    await page.mouse.up();
    await main.locator('[data-moved]').getByText('Positions moved').waitFor();
    assert(Number(await dot.getAttribute('cx')) > cx + 40, 'the concept did not move');
    assert(!new URL(page.url()).searchParams.has('concept'), 'the drag selected the concept');
    await page.reload({ waitUntil: 'load' });
    await main.locator('[data-moved]').waitFor();
    assert(Number(await dot.getAttribute('cx')) > cx + 40, 'the move did not survive a reload');
    await clickHydrated(page, main.locator('[data-moved]').getByRole('button', { name: 'Reset' }));
    await main.locator('[data-moved]').waitFor({ state: 'detached' });
    await page.waitForFunction((x) => Number(document.querySelector('[data-concept="self-attention"] circle[data-dot]')?.getAttribute('cx')) === x, cx);

    // A plain press still selects: a pointer captured on press would send the click to the svg.
    await graph.locator('[data-concept="softmax"]').click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('concept') === 'softmax');
    assert((await graph.locator('[data-concept="softmax"]').getAttribute('aria-pressed')) === 'true', 'a plain press did not select');
  });

  // D9: a legend chip previews its group on hover, writing nothing; a press
  // commits it as the Status filter and a second press clears it, and the
  // chips wrap on a phone.
  await step('learn: a legend chip previews its group on hover, and a press filters by it', page, async () => {
    // Each concept's groups: its bucket from its row's dot in the list, ready from the picture.
    const read = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('svg[data-domain-graph] [data-concept]')].map((el) => {
          const id = el.getAttribute('data-concept');
          const bucket = document.querySelector(`[data-list-concept="${id}"] [role="img"]`)?.getAttribute('aria-label');
          return {
            groups: { mastered: bucket === 'Mastered', learning: bucket === 'Learning', untouched: bucket === 'Not started', ready: el.getAttribute('data-ready') === 'true' },
            faded: el.getAttribute('data-faded') === 'true',
            dim: el.getAttribute('data-dim') === 'true',
          };
        }),
      );
    // A domain and a group with some concepts in it and some out, so a preview has something to fade.
    let found = null;
    for (const slug of ['machine-learning', 'foundations', 'agentic-ai']) {
      await go(`/learn?domain=${slug}`);
      await hydrated(page, main.locator('[data-legend-chip="mastered"]'));
      const concepts = await read();
      for (const key of ['learning', 'mastered', 'ready', 'untouched']) {
        const n = concepts.filter((c) => c.groups[key]).length;
        if (n > 0 && n < concepts.length) found ??= { slug, key, n };
      }
      if (found !== null) break;
    }
    assert(found !== null, 'no seed domain has a group with some concepts in it and some out');
    // The loop stopped on the domain it found, so the page is already there.
    const { key, n } = found;
    const legend = main.getByRole('group', { name: 'Show on the map' });
    const chip = legend.locator(`[data-legend-chip="${key}"]`);
    await hydrated(page, chip);
    const label = (await chip.getAttribute('aria-label')) ?? '';
    assert(label.endsWith(`, ${n}`), `the chip says "${label}", the picture has ${n} in ${key}`);

    await chip.hover();
    await page.waitForFunction(() => document.querySelectorAll('svg[data-domain-graph] [data-faded="true"]').length > 0);
    assert((await read()).every((c) => c.faded === !c.groups[key]), 'the hover faded the wrong concepts');
    assert(!new URL(page.url()).searchParams.has('filter'), 'a hover wrote the filter');
    assert((await chip.getAttribute('aria-pressed')) === 'false', 'a hover pressed the chip');
    await page.mouse.move(2, 2);
    await page.waitForFunction(() => document.querySelectorAll('svg[data-domain-graph] [data-faded="true"]').length === 0);

    const status = main.getByRole('button', { name: /^Status:/ });
    const menuLabel = { mastered: 'Mastered', learning: 'Learning', untouched: 'Not started', ready: 'Ready to learn' }[key];
    await chip.click();
    await page.waitForFunction((k) => new URL(location.href).searchParams.get('filter') === k, key);
    assert((await chip.getAttribute('aria-pressed')) === 'true', 'the pressed chip is not pressed');
    assert(((await status.textContent()) ?? '').startsWith(`Status: ${menuLabel}`), `the Status menu reads ${await status.textContent()}`);
    assert((await read()).every((c) => c.dim === !c.groups[key] && !c.faded), 'the committed filter dimmed the wrong concepts, or the preview stayed');
    await chip.click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('filter'));
    assert((await chip.getAttribute('aria-pressed')) === 'false', 'a second press did not clear the chip');

    // A group chosen in the menu shows its chip pressed; a filter with no chip leaves none.
    await clickHydrated(page, status);
    await main.getByRole('listbox', { name: 'Status' }).getByRole('option', { name: /^Ready to learn/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-legend-chip="ready"]')?.getAttribute('aria-pressed') === 'true');
    await status.click();
    await main.getByRole('listbox', { name: 'Status' }).getByRole('option', { name: /^Due/ }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('filter') === 'due');
    assert((await legend.locator('[aria-pressed="true"]').count()) === 0, 'a filter with no chip left one pressed');

    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await go('/learn?domain=machine-learning');
      await hydrated(page, legend.locator('[data-legend-chip="ready"]'));
      const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      assert(overflow <= 0, `the page scrolls sideways by ${overflow}px on a phone with the legend`);
      const rights = await legend.locator('[data-legend-chip]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right));
      assert(rights.every((r) => r <= 390), `a chip runs off a phone's screen: ${rights}`);
    } finally {
      await page.setViewportSize({ width: 1280, height: 860 });
    }
  });

  // D7: every concept in a domain is a button in the list, reached by Tab.
  await step('learn: a domain can be walked with the keyboard alone', page, async () => {
    await go('/learn?domain=machine-learning');
    const list = main.getByRole('region', { name: 'Concepts in Machine learning' });
    const first = list.locator('[data-list-concept]').first();
    await hydrated(page, first);
    await first.focus();
    const total = await list.locator('[data-list-concept]').count();
    const seen = new Set();
    for (let i = 0; i < total * 3 && seen.size < total; i++) {
      const id = await page.evaluate(() => document.activeElement?.getAttribute('data-list-concept'));
      if (id) seen.add(id);
      await page.keyboard.press('Tab');
    }
    assert(seen.size === total, `Tab reached ${seen.size} of ${total} concepts in the list`);
    assert((await main.getByRole('group', { name: /^Machine learning map/ }).locator('[data-concept]').count()) === total, 'the list and the picture disagree');
    await first.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => new URL(location.href).searchParams.has('concept'));
    await main.getByRole('region', { name: 'Concept details' }).getByRole('heading').first().waitFor();
  });

  await step('learn: the map works on a phone', page, async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await go('/learn?concept=vector-as-a-list-of-numbers');
      const graph = main.getByRole('group', { name: /^Foundations map/ });
      await graph.waitFor();
      const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      assert(overflow <= 0, `the page scrolls sideways by ${overflow}px on a phone`);
      await clickHydrated(page, graph.locator('[data-concept="dot-product"]'));
      await page.waitForFunction(() => new URL(location.href).searchParams.get('concept') === 'dot-product');
      await main.getByRole('region', { name: 'Concept details' }).getByRole('heading', { name: 'Dot product' }).waitFor();
      // The cards stack in one column.
      await go('/learn');
      await main.locator('[data-domain-card]').first().waitFor();
      const boxes = await main.locator('[data-domain-card]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
      assert(new Set(boxes.map(Math.round)).size === 1, 'the cards do not stack on a phone');
    } finally {
      await page.setViewportSize({ width: 1280, height: 860 });
    }
  });

  // D10: on a phone the picture fits its card and its labels keep 11px on
  // screen; a label that would collide is culled, its title still on the hover
  // plate. The seed's domain is small enough that nothing collides as laid
  // out, so a drag piles one concept under another to make a collision.
  await step('learn: labels stay readable on a phone, and a culled one shows on hover', page, async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await go('/learn?domain=machine-learning');
      const graph = main.getByRole('group', { name: /^Machine learning map/ });
      await hydrated(page, graph.locator('[data-concept="positional-encoding"]'));
      const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      assert(overflow <= 0, `the page scrolls sideways by ${overflow}px on a phone`);
      const read = () =>
        graph.evaluate((svg) => {
          const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
          const shown = [...svg.querySelectorAll('[data-concept][data-label="shown"]')];
          const px = shown.map((g) => Number(g.querySelector('text')?.getAttribute('font-size')) * scale);
          return { scale, shown: shown.length, smallest: Math.min(...px) };
        });
      const before = await read();
      assert(before.shown > 0, 'no label is drawn on a phone');
      assert(before.smallest >= 10.9, `a label is ${before.smallest.toFixed(1)}px on screen`);

      // Drop multi-head attention 40 units under positional encoding: its dot lands in that label.
      const dotOf = (id) => graph.locator(`[data-concept="${id}"] circle[data-dot]`);
      const target = await dotOf('positional-encoding').boundingBox();
      const from = await dotOf('multi-head-attention').boundingBox();
      const to = { x: target.x + target.width / 2, y: target.y + target.height / 2 + 40 * before.scale };
      const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(start.x + ((to.x - start.x) * i) / 10, start.y + ((to.y - start.y) * i) / 10);
      await page.mouse.up();
      await page.mouse.move(0, 0);
      const culled = graph.locator('[data-concept="positional-encoding"]');
      await graph.locator('[data-concept="positional-encoding"][data-label="hidden"]').waitFor({ state: 'attached' });
      // Culled, it keeps its dot and its whole name.
      assert(/^Positional encoding, /.test((await culled.getAttribute('aria-label')) ?? ''), 'the culled concept lost its name');
      const dot = await dotOf('positional-encoding').boundingBox();
      await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
      await graph.locator('[data-concept="positional-encoding"][data-hover="true"][data-label="shown"]').waitFor();
      const plate = (await graph.locator('[data-plate]').textContent()) ?? '';
      assert(plate === 'Positional encoding', `hovering the culled concept showed "${plate}"`);
      await page.mouse.move(0, 0);
      await clickHydrated(page, main.locator('[data-moved]').getByRole('button', { name: 'Reset' }));
      await main.locator('[data-moved]').waitFor({ state: 'detached' });
    } finally {
      // However the step ended, no later step inherits the drag: the session's moved positions go.
      await page.mouse.up().catch(() => {});
      await page.evaluate(() => {
        for (const key of Object.keys(sessionStorage)) if (key.startsWith('learn-map:moved:')) sessionStorage.removeItem(key);
      }).catch(() => {});
      await page.setViewportSize({ width: 1280, height: 860 });
    }
  });

  // D10: a topic's title keeps 11px on screen on a phone as a label does, its
  // group's band grown to hold it, and one too long for its group is cut with
  // an ellipsis rather than running into a neighbour.
  await step('learn: topic titles stay readable on a phone, inside their groups', page, async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await go('/learn?domain=machine-learning');
      const graph = main.getByRole('group', { name: /^Machine learning map/ });
      await hydrated(page, graph.locator('[data-topic-title]').first());
      // The title's size follows the scale measured after hydration: wait for it to settle.
      await page.waitForFunction(() => {
        const svg = document.querySelector('svg[data-domain-graph]');
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        return [...svg.querySelectorAll('[data-topic-title]')].every((t) => Number(t.getAttribute('font-size')) * scale >= 10.9);
      });
      const { scale, groups } = await graph.evaluate((svg) => {
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        const dots = [...svg.querySelectorAll('circle[data-dot]')].map((d) => d.getBoundingClientRect());
        const groups = [...svg.querySelectorAll('[data-group]')].map((g) => {
          const text = g.querySelector('[data-topic-title]');
          const rect = g.querySelector('rect').getBoundingClientRect();
          const box = text.getBoundingClientRect();
          return {
            topic: text.getAttribute('data-topic-title'),
            px: Number(text.getAttribute('font-size')) * scale,
            inside: box.left >= rect.left - 0.5 && box.right <= rect.right + 0.5 && box.top >= rect.top - 0.5 && box.bottom <= rect.bottom + 0.5,
            onDot: dots.some((d) => d.left < box.right && box.left < d.right && d.top < box.bottom && box.top < d.bottom),
            whole: text.querySelector('title')?.textContent ?? '',
            drawn: [...text.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(''),
          };
        });
        return { scale, groups };
      });
      assert(scale < 0.9, `the picture is drawn at ${scale.toFixed(2)} on a phone, too large to test the titles`);
      assert(groups.length > 0, 'no topic title is drawn');
      for (const g of groups) {
        assert(g.px >= 10.9, `${g.topic}'s title is ${g.px.toFixed(1)}px on screen`);
        assert(g.inside, `${g.topic}'s title runs outside its group`);
        assert(!g.onDot, `${g.topic}'s title overlaps a concept's dot`);
        assert(
          g.drawn === g.whole || (g.drawn.endsWith('…') && g.whole.startsWith(g.drawn.slice(0, -1))),
          `${g.topic}'s title drew "${g.drawn}" for "${g.whole}"`,
        );
      }
    } finally {
      await page.setViewportSize({ width: 1280, height: 860 });
    }
  });

  // D10: a title cut short shows whole on a plate over it while the pointer rests there, and the plate goes
  // when the pointer leaves; the title's group still lights.
  await step('learn: a cut topic title shows whole on a plate on hover', page, async () => {
    try {
      // A seed domain is one topic with a group wide enough that its title fits on most phones; the narrowest
      // (320px) draws the picture small enough that the title outgrows it.
      await page.setViewportSize({ width: 320, height: 640 });
      await go('/learn?domain=machine-learning');
      const graph = main.locator('svg[data-domain-graph]');
      await hydrated(page, graph.locator('[data-topic-title]').first());
      // The title's size follows the scale measured after hydration: wait for it to settle.
      await page.waitForFunction(() => {
        const svg = document.querySelector('svg[data-domain-graph]');
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        return [...svg.querySelectorAll('[data-topic-title]')].every((t) => Number(t.getAttribute('font-size')) * scale >= 10.9);
      });
      const titles = await graph.evaluate((svg) =>
        [...svg.querySelectorAll('[data-topic-title]')].map((t) => ({
          topic: t.getAttribute('data-topic-title'),
          whole: t.querySelector('title')?.textContent ?? '',
          drawn: [...t.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(''),
        })),
      );
      const cut = titles.find((t) => t.drawn !== t.whole);
      const whole = titles.find((t) => t.drawn === t.whole);
      assert(cut !== undefined, `no title is cut at 320px: ${JSON.stringify(titles.map((t) => t.drawn))}`);
      const plate = graph.locator('[data-title-plate]');
      assert((await plate.count()) === 0, 'a plate shows with nothing hovered');
      if (whole !== undefined) {
        await graph.locator(`[data-topic-title="${whole.topic}"]`).hover();
        assert((await plate.count()) === 0, `a plate shows over "${whole.whole}", which is not cut`);
      }
      await graph.locator(`[data-topic-title="${cut.topic}"]`).hover();
      await plate.waitFor();
      assert((await plate.getAttribute('data-shown')) === 'true', 'the plate is not shown');
      assert((await plate.locator('text').textContent()) === cut.whole, `the plate reads "${await plate.locator('text').textContent()}", not "${cut.whole}"`);
      const inside = await graph.evaluate((svg) => {
        const rect = svg.querySelector('[data-title-plate] rect').getBoundingClientRect();
        const frame = svg.getBoundingClientRect();
        return rect.left >= frame.left - 0.5 && rect.right <= frame.right + 0.5;
      });
      assert(inside, `the plate runs outside the picture`);
      const group = graph.locator(`[data-group="${cut.topic}"] rect`);
      assert(/stroke-accent/.test((await group.getAttribute('class')) ?? ''), `${cut.topic}'s group is not lit`);
      await page.mouse.move(2, 2);
      await page.waitForFunction(() => {
        const p = document.querySelector('[data-title-plate]');
        return p === null || p.dataset.shown === 'false';
      });
    } finally {
      await page.setViewportSize({ width: 1280, height: 860 });
    }
  });

  await step('workspace: Open in the map lands on the concept in its domain', page, async () => {
    assert(state.concept !== null, 'no concept: the /learn step found none');
    await go(`/learn/${state.concept}`);
    const link = main.getByRole('link', { name: 'Open in the map' });
    assert((await link.getAttribute('href')) === `/learn?concept=${state.concept}`, `the link is ${await link.getAttribute('href')}`);
    await clickHydrated(page, link);
    await page.waitForURL((url) => url.pathname === '/learn' && url.searchParams.has('domain'));
    const graph = main.locator('svg[data-domain-graph]');
    await graph.waitFor();
    assert((await graph.locator(`[data-concept="${state.concept}"]`).getAttribute('aria-pressed')) === 'true', 'the concept is not selected on the map');
  });

  await step('workspace: a concept renders three panels', page, async () => {
    assert(state.concept !== null, 'no concept: the /learn step found none');
    await go(`/learn/${state.concept}`);
    for (const title of ['Note & sources', 'Tutor', 'Studio']) {
      await main.getByRole('heading', { level: 2, name: title, exact: true }).waitFor();
    }
  });

  await step('tutor: no provider key shows the notice and Try again', page, async () => {
    assert(state.concept !== null, 'no concept: the /learn step found none');
    if (!page.url().endsWith(`/learn/${state.concept}`)) await go(`/learn/${state.concept}`);
    const tutor = main.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: 'Tutor', exact: true }) });
    // The plain textarea, or the studio's @ field (a contenteditable) once the
    // studio's kit has swapped it in; both are the textbox with this name. The
    // @ field's placeholder is an element of its own, not an attribute.
    const input = tutor.getByRole('textbox', { name: /^Ask the tutor about / });
    await hydrated(page, input);
    await input.fill('What is this concept about?');
    const answered = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/agent/chat');
    await tutor.getByRole('button', { name: 'Send', exact: true }).click();
    const response = await answered;
    assert(response.status() === 503, `/api/agent/chat answered ${response.status()}, expected 503 with no provider key`);
    // The server names the gap itself ("No model provider key is set", from
    // `missingKeyMessage` in apps/web/src/lib/agent/providers.ts since #250);
    // the client's own fallback says "no model provider key yet". Either is right.
    await tutor.getByRole('alert').getByText(/no model provider key (is set|yet)\. Add one in Settings/i).waitFor();
    await tutor.getByRole('button', { name: 'Try again' }).waitFor();
  });

  await step('session: walk the concept to the close screen', page, async () => {
    assert(state.concept !== null, 'no concept: the /learn step found none');
    await go(`/learn/${state.concept}`);
    await page.getByRole('link', { name: /^Teach me/ }).click();
    await page.waitForURL(`${base}/learn/${state.concept}/session`);

    const bar = page.getByRole('progressbar', { name: 'Session progress' });
    const closed = page.getByRole('heading', { name: 'Session closed' });
    const check = page.getByRole('button', { name: 'Check', exact: true });
    const cont = page.getByRole('button', { name: 'Continue', exact: true });
    const choices = page.locator('[role=group][aria-labelledby="session-question"]').getByRole('button');

    for (let moves = 0; ; moves += 1) {
      assert(moves < 25, 'still not closed after 25 moves');
      // A question may still be on its way from the tutor; wait for the step to settle.
      await closed.or(check).or(cont).first().waitFor({ timeout: 30_000 });
      if (await closed.isVisible()) break;
      const before = await progressValue(bar);
      if (await check.isVisible()) {
        // A question: answer it (the first choice, right or wrong) and read the verdict.
        await clickHydrated(page, choices.first());
        await check.click();
        await cont.waitFor();
        state.answered = true;
      }
      await clickHydrated(page, cont);
      await page.waitForFunction(
        (value) => {
          const now = document.querySelector('[role=progressbar][aria-label="Session progress"]')?.getAttribute('aria-valuenow');
          return now !== value;
        },
        before,
      );
    }
  });

  await step('session: on a phone the column ends at the bottom of the screen', page, async () => {
    // A focus page on a phone is a chain of flex columns under the header, so
    // its action row sits at the bottom where a thumb is. The min-height it
    // had before, worked out from the header's height, missed the header's
    // border and ran a pixel or more past the screen on every phone.
    assert(state.concept !== null, 'no concept: the /learn step found none');
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await go(`/learn/${state.concept}/session`);
      const bar = page.getByRole('progressbar', { name: 'Session progress' });
      await bar.waitFor();
      await page.getByRole('button', { name: /^(Check|Continue)$/ }).first().waitFor({ timeout: 30_000 });
      const m = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, viewport: window.innerHeight }));
      assert(m.doc <= m.viewport, `the session is ${m.doc}px tall on a ${m.viewport}px phone screen`);
    } finally {
      await page.setViewportSize({ width: 1280, height: 860 });
    }
  });

  await step('shell: a missing course says so inside the shell, the sidebar kept', page, async () => {
    // `(app)/not-found.tsx`: the root one sits above the shell's layout, so a
    // `notFound()` from a page took the sidebar with it. The page streams
    // behind its loading frame, so the status is already sent (200, with
    // Next's noindex), and what is checked is what the learner sees.
    await go('/courses/e2e-no-such-course');
    await main.getByRole('heading', { name: 'Page not found' }).waitFor();
    await page.getByRole('link', { name: 'Library', exact: true }).first().waitFor();
    const layout = await main.locator('[data-layout]').first().getAttribute('data-layout');
    assert(layout === 'app', `the notice is drawn in the ${layout} layout`);
  });

  await step("week check: the module path's last step answers through to the close screen", page, async () => {
    // The seed's cp4284 module 3: tool-calling and react-loop, whose notes carry checks.
    const modulePage = '/courses/cp4284/m3-agentic-frameworks';
    await go(modulePage);
    const row = main.getByRole('link', { name: /^Week check/ });
    await row.getByText(/^2 concepts · up to 6 questions$/).waitFor();
    await clickHydrated(page, row);
    await page.waitForURL(`${base}${modulePage}/check`);

    const bar = page.getByRole('progressbar', { name: 'Session progress' });
    const closed = page.getByRole('heading', { name: 'Week check done' });
    const check = page.getByRole('button', { name: 'Check', exact: true });
    const cont = page.getByRole('button', { name: 'Continue', exact: true });
    const choices = page.locator('[role=group][aria-labelledby="session-question"]').getByRole('button');

    const sent = [];
    for (let moves = 0; ; moves += 1) {
      assert(moves < 10, 'still not closed after 10 moves');
      await closed.or(check).or(cont).first().waitFor({ timeout: 30_000 });
      if (await closed.isVisible()) break;
      const before = await progressValue(bar);
      if (await check.isVisible()) {
        await clickHydrated(page, choices.first());
        const posted = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/learner/observe');
        await check.click();
        sent.push((await posted).postDataJSON());
        await cont.waitFor();
      }
      await clickHydrated(page, cont);
      await page.waitForFunction(
        (value) => document.querySelector('[role=progressbar][aria-label="Session progress"]')?.getAttribute('aria-valuenow') !== value,
        before,
      );
    }
    assert(sent.length > 0, 'the week check asked nothing');
    for (const body of sent) {
      assert(body.source === 'probe' && body.module === 'cp4284-m3', `an answer went in as ${JSON.stringify({ source: body.source, module: body.module })}`);
    }
    // The close screen says what moved, per concept, and leads back to the module.
    await main.getByRole('heading', { name: 'What moved' }).waitFor();
    await main.getByRole('link', { name: 'Back to the module' }).waitFor();
  });

  await step('course: the module column has room beside the app sidebar', page, async () => {
    // At 1280px the app sidebar takes 260px, and a course page laid out by
    // window breakpoints squeezed its module column to under 300px.
    await go('/courses');
    const course = main.locator('a[href^="/courses/"]').first();
    await course.waitFor();
    await go((await course.getAttribute('href')) ?? '/courses');
    const heading = main.getByRole('heading', { level: 1 }).first();
    await heading.waitFor();
    const width = await heading.evaluate((h) => {
      let node = h;
      while (node.parentElement && getComputedStyle(node.parentElement).display !== 'grid') node = node.parentElement;
      return node.getBoundingClientRect().width;
    });
    assert(width >= 440, `the module column is ${Math.round(width)}px wide at 1280px, expected at least 440`);
  });

  await step('home: Pick up lists the course module opened and the concept answered', page, async () => {
    // Open a course: its page records the visit (VisitTracker), which the
    // preference route also puts on recentModules.
    await go('/courses');
    const course = main.locator('a[href^="/courses/"]').first();
    await course.waitFor();
    const courseHref = await course.getAttribute('href');
    assert(courseHref !== null, 'no course link on /courses');
    const visited = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === '/api/learner/preference' &&
        r.request().method() === 'POST' &&
        r.request().postDataJSON()?.key === 'lastVisited',
    );
    await go(courseHref);
    assert((await visited).ok(), 'the visit was not saved');
    const slug = courseHref.split('/')[2];

    await go('/home');
    const card = main.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: 'Pick up where you left off' }) });
    await card.waitFor();
    await card.locator(`a[href^="/courses/${slug}"]`).first().waitFor();
    // The concept's own row. Since #379 the session the step above walked is
    // a row too, and one with no log opens the same concept page, so the
    // concept is told apart by the kind a screen reader hears first.
    if (state.answered) await card.locator(`a[href="/learn/${state.concept}"]`).filter({ hasText: /^Concept: / }).waitFor();
    // What the threads open up: at least one group, each a heading over links.
    const next = main.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: 'Next from here' }) });
    await next.getByRole('heading', { level: 3, name: /^After / }).first().waitFor();
    assert((await next.getByRole('link').count()) > 0, 'Next from here lists nothing');
    // No streak or target anywhere in the shell (H1).
    assert((await page.getByText(/day streak|Today's target/).count()) === 0, 'a streak or target is still drawn');
  });

  // G5: with a course opened (the step above), its ready concepts are marked,
  // the background it builds on included, and nothing outside it.
  await step('learn: the map marks the ready concepts of the course opened recently', page, async () => {
    await go('/learn?domain=foundations');
    const graph = main.getByRole('group', { name: /^Foundations map/ });
    await graph.waitFor();
    assert((await graph.locator('[data-concept="vector-as-a-list-of-numbers"]').getAttribute('data-ready')) === 'true', 'the background of the course (vector) is not marked ready');
    // dot-product needs vector, which nobody has mastered.
    assert((await graph.locator('[data-concept="dot-product"]').getAttribute('data-ready')) !== 'true', 'dot-product is marked ready before its prerequisite');
  });

  await step('library: a type, a sort and the list layout all land in the URL', page, async () => {
    await go('/library');
    // The types are a row of tabs since Library phase 1, links to `?kind=`.
    await clickHydrated(page, main.getByRole('navigation', { name: 'Type' }).getByRole('link', { name: 'Notes', exact: true }));
    await page.waitForURL(/\/library\?(.*&)?kind=note/);
    // The sort is a bare menu in the toolbar: picking Title keeps the type.
    await clickHydrated(page, main.getByRole('button', { name: 'Sort: Newest' }));
    await page.getByRole('listbox', { name: 'Sort' }).getByRole('option', { name: /^Title\b/ }).click();
    await page.waitForURL((url) => url.searchParams.get('sort') === 'title' && url.searchParams.get('kind') === 'note');
    // The layout switch keeps both, and the list is in title order.
    await main.getByRole('group', { name: 'Layout' }).getByRole('link', { name: 'List' }).click();
    await page.waitForURL((url) => url.searchParams.get('view') === 'list' && url.searchParams.get('sort') === 'title');
    assert(new URL(page.url()).searchParams.get('kind') === 'note', `the list lost the type: ${page.url()}`);
    // The rows are grouped by the day they arrived, and the sort orders the
    // rows inside each day. A row's name follows a screen-reader-only "Note: ".
    const days = await main.getByRole('region', { name: 'Assets' }).locator('section ul').evaluateAll((lists) =>
      lists.map((list) =>
        // Since Library phase 2 (#390) the name is the row's link itself, the
        // first in the row (a source line can link too, after it).
        [...list.querySelectorAll(':scope > li')].map((item) =>
          [...(item.querySelector('a')?.childNodes ?? [])]
            .filter((n) => !(n instanceof Element && n.classList.contains('sr-only')))
            .map((n) => n.textContent)
            .join('')
            .trim(),
        ),
      ),
    );
    const rows = days.flat();
    assert(rows.length > 1, `the list shows ${rows.length} rows`);
    assert(rows.every((t) => t !== ''), 'a row has no name');
    const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
    for (const titles of days) {
      const sorted = [...titles].sort(collator.compare);
      assert(titles.join('|') === sorted.join('|'), `a day is not in title order: ${titles.slice(0, 5).join(', ')}`);
    }
  });

  await step('ask: the box finds a concept, and a miss opens the tutor', page, async () => {
    assert(state.concept !== null, 'no concept: the /learn step found none');
    await go('/home');
    const box = main.getByRole('combobox', { name: 'What do you want to learn?' });
    await hydrated(page, box);
    // The concept's slug as words: the box matches it as an alias of the title.
    await box.fill(state.concept.replace(/-/g, ' '));
    const matches = page.getByRole('listbox', { name: 'Matches' });
    // A match, then the tutor option the list always ends with.
    await page.waitForFunction(() => document.querySelectorAll('[role=listbox] [role=option]').length > 1);
    await matches.getByRole('option').first().click();
    await page.waitForURL(`${base}/learn/${state.concept}`);

    // One letter is too short to search titles but not to ask about ("R").
    await go('/home');
    await hydrated(page, box);
    await box.fill('R');
    await matches.getByRole('option', { name: /^Ask the tutor about/ }).waitFor();
    assert((await matches.getByRole('option').count()) === 1, 'one letter searched the titles');

    await box.fill('qzx nothing in the seed is called this');
    await matches.getByRole('option', { name: /^Ask the tutor about/ }).waitFor();
    await box.press('Enter');
    await page.waitForURL(/\/ask\?q=qzx/);
    await main.getByText('This chat is not saved', { exact: false }).waitFor();
    // No provider key in this run: the tutor's first turn names the gap.
    await main.getByRole('alert').getByText(/no model provider key (is set|yet)\. Add one in Settings/i).waitFor();
    await main.getByRole('button', { name: 'Try again' }).waitFor();

    // A link from anywhere else waits for Start: a turn is paid for.
    let asked = false;
    const watch = (r) => {
      if (new URL(r.url()).pathname === '/api/agent/chat') asked = true;
    };
    page.on('request', watch);
    await go('/ask?q=a%20linked%20subject');
    const begin = main.getByRole('button', { name: 'Start', exact: true });
    await hydrated(page, begin);
    assert(!asked, 'the linked page sent a turn before Start');
    await begin.click();
    await main.getByRole('alert').getByText(/no model provider key/i).waitFor();
    page.off('request', watch);
    assert(asked, 'Start sent no turn');
  });

  if (SEED) skip('library: first video plays and saves its place', 'the seed has no videos (D7)');
  else await step('library: first video plays and saves its place', page, async () => {
    await go('/library');
    // The Videos tab is a link to `?kind=video`, and the URL is the filter.
    await clickHydrated(page, main.getByRole('navigation', { name: 'Type' }).getByRole('link', { name: 'Videos', exact: true }));
    await page.waitForURL(/\/library\?(.*&)?kind=video/);
    await main.getByRole('region', { name: 'Assets' }).getByRole('link').first().click();
    await page.waitForURL(/\/library\/[^/?]+$/);
    // No button to press: the player saves its own place. Play a moment,
    // pause, and the pause is a save the route has to accept.
    // The save that carries what played, not any request to the route.
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/learner/playback') &&
        response.request().method() === 'POST' &&
        (response.request().postDataJSON()?.ranges?.length ?? 0) > 0,
    );
    await clickHydrated(page, main.getByRole('button', { name: 'Play (k)' }));
    await main.getByRole('button', { name: 'Pause (k)' }).waitFor();
    await page.waitForTimeout(1500);
    await main.getByRole('button', { name: 'Pause (k)' }).click();
    const response = await saved;
    assert(response.ok(), `the playback save answered ${response.status()}`);
  });

  await step('settings: change the tutor style, see Saved', page, async () => {
    await go('/settings');
    // The page opens on General since #342; the style is under Tutor, and a
    // press on the tab puts it in the address.
    await clickHydrated(page, main.getByRole('tab', { name: 'Tutor' }));
    await page.waitForURL((url) => url.searchParams.get('tab') === 'tutor');
    // A kit menu since #355: the trigger is named "Tutor style: <current>".
    await clickHydrated(page, main.getByRole('button', { name: /^Tutor style:/ }));
    const next = page.getByRole('listbox', { name: 'Tutor style' }).locator('[role=option][aria-selected=false]').first();
    assert((await next.count()) > 0, 'the tutor style has no option besides the current one');
    await next.click();
    // `LiveStatus` writes the words twice: the live line a screen reader
    // hears, and the copy the eye sees.
    await main.locator('p[aria-live]', { hasText: /^Saved$/ }).waitFor({ state: 'attached' });
    await main.locator('p[aria-hidden]', { hasText: /^Saved$/ }).waitFor();
  });

  await step('provider keys: save a key, see its last four, remove it', page, async () => {
    // The keys are under Tutor (#342), which `?tab=tutor` opens.
    if (new URL(page.url()).searchParams.get('tab') !== 'tutor') await go('/settings?tab=tutor');
    // docs/BYOK.md: a key goes in once and never comes back out. The Providers
    // card (#383) lists a provider only once it has a key or a model; the
    // rest are offered under Add provider. From the seed that is all three,
    // but a `--copy` may hold some already, so the step takes whichever
    // provider the form offers first, which it chooses on its own.
    const add = main.getByRole('button', { name: 'Add provider', expanded: false });
    assert((await add.count()) > 0, 'every provider is listed already, so none can be added');
    await clickHydrated(page, add);
    const form = main.getByRole('form', { name: 'Add a provider' });
    // A kit menu: the trigger is named "Provider: <current>".
    const chosen = form.getByRole('button', { name: /^Provider: / });
    await chosen.waitFor();
    const label = (await chosen.getAttribute('aria-label'))?.replace(/^Provider: /, '') ?? '';
    assert(label !== '', 'the provider menu names no provider');
    const fake = 'e2e-not-a-real-provider-key-000000000000wxyz';
    await form.getByLabel('API key', { exact: true }).fill(fake);
    const saving = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/learner/provider-key' && r.request().method() === 'POST',
    );
    await form.getByRole('button', { name: 'Add provider' }).click();
    const response = await saving;
    assert(response.status() === 200, `the save answered ${response.status()}`);
    assert(!(await response.text()).includes(fake), 'the save answered with the key in it');
    const row = main.getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) });
    await row.getByText(/^Your key, ending wxyz\. Saved /).waitFor();
    assert(!(await page.content()).includes(fake), 'the page still holds the key after saving');
    // Delete opens a confirm; its own Delete takes the key, and with no
    // server key and no models the row leaves the list, as it was.
    await row.getByRole('button', { name: 'Delete', exact: true, expanded: false }).click();
    await row.getByRole('group', { name: `Confirm deleting ${label}` }).getByRole('button', { name: 'Delete', exact: true }).click();
    await row.waitFor({ state: 'detached' });
  });

  await step('settings: the sidebar reaches the bottom with every fold shut', page, async () => {
    // #405: an `sr-only` line (position: absolute) inside a shut fold escaped
    // the fold's clip and made the document taller than the shell, so the
    // sticky sidebar stopped short with a blank strip under it. The Tutor tab
    // holds shut folds with such lines (Add provider, each row's panels).
    if (new URL(page.url()).searchParams.get('tab') !== 'tutor') await go('/settings?tab=tutor');
    await main.getByRole('button', { name: 'Add provider', expanded: false }).waitFor();
    for (const height of [860, 600]) {
      await page.setViewportSize({ width: 1280, height });
      const m = await page.evaluate(async () => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const shell = document.querySelector('.group\\/shell');
        const sidebar = shell && [...shell.querySelectorAll('*')].find((e) => getComputedStyle(e).position === 'sticky');
        return {
          doc: document.documentElement.scrollHeight,
          shell: shell ? Math.round(shell.getBoundingClientRect().height) : -1,
          sidebarBottom: sidebar ? Math.round(sidebar.getBoundingClientRect().bottom) : -1,
          viewport: window.innerHeight,
        };
      });
      assert(m.doc <= m.shell + 1, `at 1280x${height} the document is ${m.doc}px, taller than the ${m.shell}px shell`);
      assert(Math.abs(m.sidebarBottom - m.viewport) <= 1, `at 1280x${height}, scrolled to the end, the sidebar ends at ${m.sidebarBottom}px of ${m.viewport}`);
    }
    await page.setViewportSize({ width: 1280, height: 860 });
  });

  await step('theme: Dark adds `dark` to <html>', page, async () => {
    if (!page.url().endsWith('/settings')) await go('/settings');
    // The theme is two radio groups since #101, Palette and Appearance; dark is an appearance.
    const appearance = main.getByRole('group', { name: 'Theme' }).getByRole('radiogroup', { name: 'Appearance' });
    const dark = appearance.getByRole('radio', { name: 'Dark' });
    await clickHydrated(page, dark);
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  });

  await step('sign out: /home answers 307 afterwards', page, async () => {
    await go('/home');
    // The account row at the sidebar's foot (#308): named by its text,
    // "Account", with the sidebar open, and "Account and settings" folded to
    // the rail, where it is the avatar alone.
    await clickHydrated(page, page.getByRole('button', { name: /^Account( and settings)?$/ }));
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(`${base}/`);
    const after = await page.request.get(`${base}/home`, { maxRedirects: 0 });
    assert(after.status() === 307, `/home answered ${after.status()} after signing out, expected 307`);
    // Today became Home (H2 of docs/proposals/home-page.md): the old path is a
    // permanent redirect, answered before the proxy asks who is signed in.
    const old = await page.request.get(`${base}/today`, { maxRedirects: 0 });
    assert(old.status() === 308, `/today answered ${old.status()}, expected 308`);
    assert(new URL(old.headers().location ?? '', base).pathname === '/home', `/today redirects to ${old.headers().location}`);
  });

  current = 'teardown';
}

// ---------------------------------------------------------------------------

let fatal = null;
try {
  await run();
} catch (error) {
  fatal = error;
} finally {
  await cleanup();
}
// The signal handler owns the exit code and the last word after an interrupt.
if (interrupted) await new Promise(() => {});

const width = Math.max(...results.map((r) => r.name.length), 40);
console.log('');
for (const r of results) {
  if (r.skipped) {
    console.log(`SKIP  ${r.name.padEnd(width)}  (${r.skipped})`);
    continue;
  }
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${String(r.ms).padStart(6)} ms`);
  if (!r.ok) {
    console.log(`      ${r.error}`);
    console.log(`      screenshot: ${r.shot ?? '(none: the page could not be captured)'}`);
  }
}
const clean = problems.length === 0;
console.log(`${clean ? 'PASS' : 'FAIL'}  ${'no console errors, page errors or failed responses'.padEnd(width)}`);
for (const p of problems) console.log(`      [${p.step}] ${p.what}`);
if (fatal) console.log(`\nFAIL  setup: ${fatal.message}`);
if (teardownProblem) console.log(`\nFAIL  teardown: ${teardownProblem}`);

const failed = results.filter((r) => !r.ok).length;
const skipped = results.filter((r) => r.skipped).length;
const ok = !fatal && !teardownProblem && failed === 0 && clean;
console.log(
  `\n${ok ? 'PASS' : 'FAIL'}: ${results.length - failed - skipped} of ${results.length - skipped} steps passed` +
    `${skipped > 0 ? `, ${skipped} skipped` : ''}, ${problems.length} problem(s) logged.`,
);
if (!ok) console.log(`Screenshots and the server log: ${OUT}`);
process.exit(ok ? 0 : 1);
