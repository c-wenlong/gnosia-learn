import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { constants } from "node:os";

import { TLDRAWKC_DIR, TLDRAWKC_ROOT_ENV } from "./env";
import { canvasCliPath } from "./index/tldr";

/**
 * `npm run canvas` — the tldrawkc CLI, found the way the indexer finds it.
 *
 * This exists instead of `node "${TLDRAWKC_ROOT:-tools/tldrawkc}/dist/cli/index.js"`
 * in package.json, and the difference is not cosmetic. A shell expansion sees
 * only the process environment and performs no normalisation, while
 * `resolveTldrawkcRoot` also reads `services/catalog/.env`, treats a blank
 * value as unset, resolves a relative value against the repo root and expands a
 * leading `~`. So the two agreed only when the variable was absolute and set in
 * the shell: a root configured in that dotenv sent the indexer to one build and
 * this command to the default checkout, and a documented `~/…` value left the
 * tool looking for a literal `~` directory. Routing both through one function
 * is what makes "the tool and the indexer always run the same build" a
 * structural property rather than a claim.
 *
 * It stays a thin wrapper. Every argument is forwarded untouched, stdio is
 * inherited so `--json` output and the interactive `serve` behave as they did,
 * and the child's exit code is this process's — tldrawkc's exit 3 for
 * "lints remain" has to survive, since `inspect` exiting 0 is the definition of
 * a finished diagram. Nothing is written to stdout, so
 * `npm run --silent canvas -- ... --json | jq` stays parseable.
 *
 * package.json starts it with `node --import tsx`, not the `tsx` CLI. That CLI
 * binds a Unix socket at `$TMPDIR/tsx-<uid>/<pid>.pipe` on every start, and the
 * studio runs this command with `TMPDIR` inside `$STUDIO_HOME` (the agent, the
 * manual check). macOS keeps 104 bytes of a socket path and libuv binds
 * whatever those bytes name, so a long home failed every run with
 * `EADDRINUSE` when the cut landed on a directory. The loader alone binds
 * nothing; `services/studio/test/long-home.test.ts` holds that case.
 */

const cli = canvasCliPath();

if (!existsSync(cli)) {
  // Naming the resolved path is the point: on a machine with the variable set,
  // "tools/tldrawkc is missing" would be a lie, and where the tool was looked
  // for is the only thing worth knowing here.
  const configured = process.env[TLDRAWKC_ROOT_ENV]?.trim();
  process.stderr.write(
    `${cli} does not exist, so there is no tldrawkc CLI to run.\n` +
      (configured
        ? `${TLDRAWKC_ROOT_ENV} is set to ${JSON.stringify(configured)}.\n`
        : "") +
      `dist/ is build output and is not committed. Run:\n` +
      `  git submodule update --init ${TLDRAWKC_DIR}\n` +
      `  (cd ${TLDRAWKC_DIR} && npm ci && npm run build)\n`,
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  process.stderr.write(`could not run ${cli}\n  ${result.error.message}\n`);
  process.exit(1);
}

// A child killed by a signal reports a null status. 128 + the signal number is
// the shell's convention for that, and it matters that it is not 0: returning 0
// would tell a script the diagram passed its lints when nothing ran to
// completion.
const bySignal = result.signal === null ? null : 128 + (constants.signals[result.signal] ?? 0);
process.exit(result.status ?? bySignal ?? 1);
