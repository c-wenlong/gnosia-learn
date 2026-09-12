#!/usr/bin/env node
/**
 * `learn` — a shim. The command lives in
 * `services/catalog/src/learn/cli.ts`.
 *
 * The pipeline moved into the catalog workspace in bundle 5, because its state
 * moved into Postgres: `events.jsonl`, `model.json` and `reviews.json` are the
 * `event`, `mastery` and `review` tables, and the code that reads them needs
 * the schema, the connection and drizzle — none of which belongs in a
 * dependency-free script.
 *
 * This file stays because it is the published entry point. `npm run learn`
 * runs it, the `/learn` and `/review` skills run `npm run learn -- status`
 * and parse the JSON, and `learn/README.md` documents the path. Moving the
 * implementation is ours to do; moving the entry point would break a contract
 * with a plugin installed outside this repo.
 *
 * The pure modules under `lib/` have not moved either. They are the maths —
 * BKT, the concept DAG, SM-2, the frontmatter and callout rendering — with
 * their own tests, and the TypeScript CLI imports them directly rather than
 * restating them.
 *
 * A child process rather than an import: the entry point is TypeScript, and
 * loading `tsx` into this process would mean this file could no longer run on
 * a checkout with nothing installed. Spawning keeps the failure legible — if
 * `tsx` is missing you get an npm-shaped error, not a syntax error in a file
 * you did not write.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const entry = path.join(repoRoot, "services", "catalog", "src", "learn", "cli.ts");

const child = spawn(
  process.execPath,
  // `--import tsx` rather than the tsx binary: it resolves through this repo's
  // own node_modules and needs no shell, so it works the same on every
  // platform and inside `npm run`.
  ["--import", "tsx", entry, ...process.argv.slice(2)],
  { stdio: "inherit", cwd: repoRoot },
);

child.on("error", (error) => {
  process.stderr.write(
    `learn: could not start ${path.relative(repoRoot, entry)}\n  ${error.message}\n` +
      `  Run \`npm install\` at the repository root.\n`,
  );
  process.exit(1);
});

// A signal that killed the child has to kill this process the same way, or a
// Ctrl-C looks like a clean exit to whatever ran `npm run learn`.
child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
