import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { ContentError } from "./errors";

/**
 * The parsers are synchronous, and the readers are not.
 *
 * `loadCourses` and friends stay synchronous because the catalog's indexers
 * call them and gain nothing from a promise. Readers do not call them: they go
 * through `ContentSource` (`./source.ts`), which is async because the database
 * implementation behind it has to be, and `fileSource` wraps these functions
 * so the validation is the same on both paths.
 */

/** Every reader takes the repo root, defaulting to where the process started. */
export interface LoadOptions {
  /** Repository root. Defaults to `process.cwd()`. */
  root?: string;
}

export function repoRoot(options?: LoadOptions): string {
  return options?.root ?? process.cwd();
}

export function readYamlFile(absolute: string, where: string): string {
  try {
    return readFileSync(absolute, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ContentError(`${where} does not exist`);
    }
    throw error;
  }
}

/** Files with one of `extensions` directly inside `directory`, sorted by name. */
export function filesIn(
  directory: string,
  extensions: readonly string[],
  where: string,
): string[] {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ContentError(`${where} does not exist`);
    }
    throw error;
  }
  return entries
    .filter((e) => e.isFile() && extensions.includes(path.extname(e.name)))
    .map((e) => path.join(directory, e.name))
    .sort();
}

export function requireText(value: unknown, where: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ContentError(`${where}: ${field} is required and must be a non-empty string`);
  }
  return value.trim();
}

export function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * A list of mappings, or a refusal.
 *
 * `Array.isArray(x) ? x : []` is the tempting shape and the wrong one: it turns
 * `topics: {}` into a module with no checklist rows, rendered and indexed as if
 * that were what the author wrote. A malformed collection has to be an error,
 * because the alternative is content that disappears without a word.
 */
export function mappingList(
  value: unknown,
  where: string,
  field: string,
): Record<string, unknown>[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ContentError(
      `${where}: ${field} must be a list, not ${typeof value}`,
    );
  }
  return value.map((item, i) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new ContentError(`${where}: ${field}[${i}] must be a mapping`);
    }
    return item as Record<string, unknown>;
  });
}

export function stringList(value: unknown, where: string, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ContentError(`${where}: ${field} must be a list`);
  }
  return value.map((item, i) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new ContentError(`${where}: ${field}[${i}] must be a non-empty string`);
    }
    return item.trim();
  });
}

export const KEBAB_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
