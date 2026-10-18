// What scripts/dev.sh needs to know about the web app's configuration, asked
// of Node so it is read the way the app reads it:
//
//   node scripts/lib/dev-env.mjs get <app dir> KEY...   KEY=value lines
//   node scripts/lib/dev-env.mjs pg <database url>      PGHOST=... lines
//
// `get` loads the app's .env files with Next's own loader (@next/env), so a
// quoted value, a trailing comment and the .env.development files behave as
// they do under `next dev`; a value already in the environment wins, as there.
// `pg` splits a connection URL into the PG* variables libpq reads, so the URL,
// and the password in it, never has to go on a command line where `ps` shows
// it. A value with a newline in it is not supported: the lines are the format.
import { fileURLToPath } from "node:url";

/**
 * The app's environment as `next dev` would see it. Next's loader reads and
 * writes process.env, so this is for a process of its own, as the command
 * line below runs it.
 * @param {string} appDir
 * @returns {Promise<Record<string, string | undefined>>}
 */
export async function loadDevEnv(appDir) {
  const { default: nextEnv } = await import("@next/env");
  const quiet = { info() {}, error() {} };
  return nextEnv.loadEnvConfig(appDir, true, quiet, true).combinedEnv;
}

/**
 * The libpq variables a postgres:// or postgresql:// URL stands for. Throws
 * on anything else, so the caller can say it was not understood rather than
 * check the wrong database.
 * @param {string} url
 * @returns {Record<string, string>}
 */
export function pgEnv(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`not a postgres URL: ${parsed.protocol}`);
  }
  /** @type {Record<string, string>} */
  const out = {};
  const set = (name, value) => {
    if (value) out[name] = value;
  };
  set("PGHOST", decodeURIComponent(parsed.hostname).replace(/^\[(.*)\]$/, "$1"));
  set("PGPORT", parsed.port);
  set("PGUSER", decodeURIComponent(parsed.username));
  set("PGPASSWORD", decodeURIComponent(parsed.password));
  set("PGDATABASE", decodeURIComponent(parsed.pathname.replace(/^\//, "")));
  // The query parameters that change where, or how securely, libpq connects.
  const query = { host: "PGHOST", port: "PGPORT", user: "PGUSER", password: "PGPASSWORD", dbname: "PGDATABASE", sslmode: "PGSSLMODE" };
  for (const [key, value] of parsed.searchParams) {
    if (key in query) set(query[key], value);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2);
  try {
    if (mode === "get" && args.length >= 2) {
      const [appDir, ...keys] = args;
      const env = await loadDevEnv(appDir);
      for (const key of keys) {
        if (env[key] !== undefined) process.stdout.write(`${key}=${env[key]}\n`);
      }
    } else if (mode === "pg" && args.length === 1) {
      for (const [name, value] of Object.entries(pgEnv(args[0]))) {
        process.stdout.write(`${name}=${value}\n`);
      }
    } else {
      process.stderr.write("usage: dev-env.mjs get <app dir> KEY... | pg <database url>\n");
      process.exit(2);
    }
  } catch (error) {
    process.stderr.write(`dev-env.mjs: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(3);
  }
}
