import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

import { defaultBlobRoot, fsStore, type BlobStore } from "@self-learn/blob";

import { REPO_ROOT } from "./paths";

/**
 * The blob store the catalog writes diagram SVGs into, opened for reading.
 *
 * The studio reaches Postgres only through the catalog CLI, and that stays
 * true: the key it reads comes from `catalog diagram list`. The store itself
 * is a directory, and a thumbnail per diagram through a subprocess each would
 * be a `tsx` start per tile, so the bytes are read here, from the same root
 * the catalog uses.
 *
 * "The same root" is the one rule: the catalog resolves `SELF_LEARN_HOME`
 * after loading `services/catalog/.env`, with the shell winning
 * (`blobRoot()` in `services/catalog/src/env.ts`), so this reads that file the
 * same way rather than trusting its own environment alone, which would name a
 * different directory the day the variable is set only in the dotenv.
 */
export function studioBlobRoot(env: NodeJS.ProcessEnv = process.env): string {
  const file = path.join(REPO_ROOT, "services", "catalog", ".env");
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  return defaultBlobRoot({ ...fromFile, ...env });
}

let store: { root: string; store: BlobStore } | null = null;

export function studioBlobStore(): BlobStore {
  const root = studioBlobRoot();
  if (store === null || store.root !== root) store = { root, store: fsStore(root) };
  return store.store;
}
