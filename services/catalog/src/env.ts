import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** services/catalog/ */
export const SERVICE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * Local Postgres, the Homebrew install, database `self_learn`. Documented in
 * services/catalog/.env.example. Daily development needs no configuration at
 * all; CI and the homeserver set DATABASE_URL and point at compose.yaml.
 */
export const DEFAULT_DATABASE_URL = "postgres://localhost:5432/self_learn";

let loaded = false;

/**
 * Reads services/catalog/.env if it exists. `process.loadEnvFile` is stdlib
 * (Node >= 20.12), so this costs no dependency, and it does not overwrite a
 * variable that is already set — which is what makes `DATABASE_URL=... npm run
 * catalog` and CI's job-level env win over a developer's local file.
 */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = path.join(SERVICE_ROOT, ".env");
  if (!existsSync(file)) return;
  const before = { ...process.env };
  process.loadEnvFile(file);
  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) process.env[key] = value;
  }
}

export function databaseUrl(): string {
  loadEnv();
  const raw = process.env.DATABASE_URL?.trim();
  return raw ? raw : DEFAULT_DATABASE_URL;
}

/** The connection string with any password blanked, safe to print or log. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}
