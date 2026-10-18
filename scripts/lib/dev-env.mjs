// What scripts/dev.sh needs to know about the web app's configuration, asked
// of Node so it is read the way the app reads it:
//
//   node scripts/lib/dev-env.mjs get <app dir> KEY...   KEY=value lines
//   node scripts/lib/dev-env.mjs pg <database url>      URL=... and PGPASSWORD=...
//
// `get` loads the app's .env files with Next's own loader (@next/env), so a
// quoted value, a trailing comment and the .env.development files behave as
// they do under `next dev`; a value already in the environment wins, as there.
// `pg` takes the password out of a connection URL, so the rest of it can be an
// argument to pg_isready and psql (libpq reads the password from PGPASSWORD)
// without the secret being on a command line where `ps` shows it. A value
// with a newline in it is not supported: the lines are the format.
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
 * A postgres:// or postgresql:// URL with the password taken out, and the
 * password. Everything else in the URL (the host, a socket directory, sslmode,
 * sslrootcert, sslcert, sslkey, options, anything libpq understands) is left
 * for libpq to parse as it always did; only the secret moves, into
 * PGPASSWORD, so it is never an argument. Throws on anything else, so the
 * caller can say it was not understood rather than check the wrong database.
 * @param {string} url
 * @returns {{ url: string, password: string }}
 */
export function splitDatabaseUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`not a postgres URL: ${parsed.protocol}`);
  }
  let password = decodeURIComponent(parsed.password);
  parsed.password = "";
  // A password given as a query parameter is cut out of the raw query, pair by
  // pair, leaving every other pair byte for byte: going through
  // URLSearchParams would re-encode them (a space as "+", which libpq reads
  // literally).
  const pairs = parsed.search.replace(/^\?/, "").split("&");
  if (pairs.some((pair) => decodeURIComponent(pair.split("=")[0]) === "password")) {
    const kept = [];
    for (const pair of pairs) {
      const [key, ...value] = pair.split("=");
      if (decodeURIComponent(key) === "password") password = decodeURIComponent(value.join("="));
      else kept.push(pair);
    }
    parsed.search = kept.join("&");
  }
  return { url: parsed.toString(), password };
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
      const { url, password } = splitDatabaseUrl(args[0]);
      process.stdout.write(`URL=${url}\n`);
      if (password) process.stdout.write(`PGPASSWORD=${password}\n`);
    } else {
      process.stderr.write("usage: dev-env.mjs get <app dir> KEY... | pg <database url>\n");
      process.exit(2);
    }
  } catch (error) {
    process.stderr.write(`dev-env.mjs: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(3);
  }
}
