import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * What is installed under a tool's `node_modules`, as a short fingerprint,
 * for the doctors' kept fixture builds.
 *
 * A kept build stood for an unchanged toolchain, and the toolchain is paths:
 * a reinstall or an upgrade at the same paths (`npm ci` after a lockfile
 * bump, `npx remotion browser ensure` fetching a new Headless Shell, a Chrome
 * update) left every path alone and so kept a passing verdict for hours over
 * code that was never built. This reads what a reinstall does change:
 *
 * - the tool's `package-lock.json`, and npm's own record of the tree it
 *   installed, `node_modules/.package-lock.json`, which every install
 *   rewrites;
 * - the version of every package the render runs on, named by `packages`
 *   (remotion and `@remotion/*`, or `@revideo/*`), read from its own
 *   `package.json`, so a hand-edited tree still counts;
 * - `files`, whose bytes are hashed (the Headless Shell's `VERSION`, a
 *   Chrome bundle's `Info.plist`), and `stats`, whose size and modification
 *   time stand in for bytes too many to hash on every check (a Chrome
 *   binary).
 *
 * Anything missing is recorded as missing, so a file appearing or going
 * changes the fingerprint too. Nothing here throws: an unreadable entry is a
 * value like any other.
 */
export interface InstalledParts {
  /** The tool's checkout, whose `package-lock.json` is read. */
  root: string;
  /** Its `node_modules`, resolved, or null when there is none. */
  nodeModules: string | null;
  /** The packages whose versions count, by name. */
  packages: (name: string) => boolean;
  /** Absolute files whose bytes count. */
  files?: readonly string[];
  /** Absolute files whose size and modification time count. */
  stats?: readonly string[];
}

async function fileHash(file: string): Promise<string> {
  try {
    return createHash("sha256").update(await readFile(file)).digest("hex");
  } catch {
    return "missing";
  }
}

async function names(dir: string): Promise<string[]> {
  return (await readdir(dir).catch(() => [] as string[])).sort();
}

async function version(nodeModules: string, name: string): Promise<string> {
  try {
    const parsed = JSON.parse(await readFile(path.join(nodeModules, name, "package.json"), "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "no version";
  } catch {
    return "unreadable";
  }
}

/** The installed packages `packages` names, as `name@version`, sorted. */
export async function installedVersions(nodeModules: string, packages: (name: string) => boolean): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await names(nodeModules)) {
    if (entry.startsWith("@")) {
      for (const inner of await names(path.join(nodeModules, entry))) {
        const name = `${entry}/${inner}`;
        if (packages(name)) found.push(`${name}@${await version(nodeModules, name)}`);
      }
    } else if (packages(entry)) {
      found.push(`${entry}@${await version(nodeModules, entry)}`);
    }
  }
  return found;
}

/** The fingerprint of what is installed, as `InstalledParts` describes it. */
export async function installedFingerprint(parts: InstalledParts): Promise<string> {
  const hash = createHash("sha256");
  hash.update(`package-lock.json\u0000${await fileHash(path.join(parts.root, "package-lock.json"))}\n`);
  if (parts.nodeModules === null) {
    hash.update("node_modules\u0000missing\n");
  } else {
    hash.update(`.package-lock.json\u0000${await fileHash(path.join(parts.nodeModules, ".package-lock.json"))}\n`);
    for (const line of await installedVersions(parts.nodeModules, parts.packages)) hash.update(`${line}\n`);
  }
  for (const file of parts.files ?? []) hash.update(`${file}\u0000${await fileHash(file)}\n`);
  for (const file of parts.stats ?? []) {
    const facts = await stat(file).catch(() => null);
    hash.update(`${file}\u0000${facts === null ? "missing" : `${facts.size}:${facts.mtimeMs}`}\n`);
  }
  return hash.digest("hex");
}
