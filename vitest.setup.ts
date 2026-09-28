import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, expect } from "vitest";

/**
 * Nothing a test runs may write into the tracked tree.
 *
 * vitest runs test files in parallel workers against one checkout, so a file a
 * suite drops into `learn/assets/` is visible to every other suite for as long
 * as it is there. `services/catalog/test/catalog.test.ts` indexes that
 * directory three times and asserts the second pass deletes nothing, so a
 * fixture that exists for one pass and is gone by the next made that suite fail
 * on a deletion it had nothing to do with. It failed about once in eight full
 * runs, passed every time it ran alone, and failed every one of twelve runs
 * that overlapped a second `npm test`.
 *
 * Two halves, and the second is what keeps the first honest:
 *
 * 1. The studio's paths are all repo-relative by design, so its tests get their
 *    own repository root under the OS temp directory. It is a symlink farm
 *    rather than a copy: reads reach the real content and a write lands in the
 *    temp tree, on the file that shadows the link.
 * 2. The override is checked against the module that consumes it, not against
 *    the variable. `services/studio/src/paths.ts` resolves the root once, at
 *    import, so this imports it and compares. That is what catches the
 *    regression this file exists to prevent, and it catches it whether or not a
 *    fixture happens to still be on disk when anybody looks.
 * 3. Every test file, studio or not, has the tracked `learn/assets/` listing
 *    and the whole `seed/` tree taken before it runs and checked after it,
 *    names with sizes and modification times, so an edit in place counts as
 *    well as a new file. This one is a backstop and samples at two points: a
 *    suite that writes a file and deletes it again inside one test is
 *    invisible to it, which is exactly why the check above it is not a sample.
 *    `seed/` is watched because suites import it (edge case 11 of
 *    docs/CONTENT-MIGRATION.md), and an import records it as the root a seam
 *    write keeps in step, so a suite that imports it and then writes a topic
 *    would rewrite the seed. `learn/assets/` stays until phase 3 removes it.
 */

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const TRACKED_ASSETS = path.join(REPO_ROOT, "learn", "assets");
const SEED = path.join(REPO_ROOT, "seed");

/**
 * Mirrors `from` into `into` as symlinks, one per entry, minus the entries the
 * caller rebuilds instead. Writing to a path that names a symlink follows it,
 * so every directory a test writes into is a real directory and only the files
 * inside it are links. A read of an untouched file still reaches the checkout,
 * which is why this is a farm and not a copy.
 */
function farm(from: string, into: string, rebuilt: readonly string[] = []): void {
  mkdirSync(into, { recursive: true });
  // A tree with no `learn/` (phase 3 removes it, and the phase 2 done-when
  // deletes it on purpose) still gets the directories the studio writes into.
  if (!existsSync(from)) return;
  for (const entry of readdirSync(from)) {
    if (rebuilt.includes(entry)) continue;
    symlinkSync(path.join(from, entry), path.join(into, entry));
  }
}

function studioRepoRoot(): string {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "self-learn-studio-"));
  // `.studio` is rebuilt as nothing at all: it is the runner's real state
  // (job workspaces, the content cache), and a suite that does not set
  // STUDIO_HOME would otherwise write through the link into it.
  farm(REPO_ROOT, root, ["learn", ".studio"]);
  farm(path.join(REPO_ROOT, "learn"), path.join(root, "learn"), ["assets"]);
  farm(TRACKED_ASSETS, path.join(root, "learn", "assets"), [".candidates"]);
  // The studio writes candidates here and the catalog never indexes a dot
  // directory, but a link would still put a job's scratch output in the
  // checkout, so it is a real directory like the two above it.
  mkdirSync(path.join(root, "learn", "assets", ".candidates"), { recursive: true });
  return root;
}

/** Each entry with what would change if a test wrote to it, or over it. */
function listing(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .map((entry) => {
      const facts = statSync(path.join(directory, entry));
      return `${entry} ${facts.size} ${facts.mtimeMs}`;
    })
    .sort();
}

/** The same, for every file under `directory` at any depth, by path relative to it. */
function deepListing(directory: string, prefix = ""): string[] {
  if (!existsSync(directory)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(`${relative}/`, ...deepListing(path.join(directory, entry.name), relative));
      continue;
    }
    const facts = statSync(path.join(directory, entry.name));
    out.push(`${relative} ${facts.size} ${facts.mtimeMs}`);
  }
  return out.sort();
}

const root = studioRepoRoot();
const temp = realpathSync(tmpdir());
if (!root.startsWith(`${temp}${path.sep}`)) {
  throw new Error(`the studio's test repository root must sit under ${temp}, and ${root} does not.`);
}
process.env.STUDIO_REPO_ROOT = root;

// The variable being set proves nothing on its own, so ask the module that
// reads it. A `paths.ts` that had stopped honouring the override would send
// every fixture back into `learn/assets/` and the only symptom would be another
// suite failing on counts it does not own.
const studio = await import("./services/studio/src/paths");
if (studio.REPO_ROOT !== root) {
  throw new Error(
    `services/studio/src/paths.ts resolved ${studio.REPO_ROOT} rather than ${root}: ` +
      `STUDIO_REPO_ROOT is set and is not being honoured, so the studio's tests would ` +
      `write their fixtures into the checkout.`,
  );
}

// The blob store's root. Importing the repository now stores its diagram
// SVGs, and without this every suite that indexes the tree would write them
// into the owner's real `~/.self-learn/blobs`. Its own temp directory, not one
// inside the farm above: the fs store refuses a root under anything that looks
// like a self-learn checkout, and the farm links the checkout's package.json.
// A suite that wants its own root still sets one.
let blobHome: string | null = null;
if (!process.env.SELF_LEARN_HOME?.trim()) {
  blobHome = mkdtempSync(path.join(temp, "self-learn-home-"));
  process.env.SELF_LEARN_HOME = blobHome;
}

const before = listing(TRACKED_ASSETS);
const seedBefore = deepListing(SEED);

afterAll(() => {
  try {
    expect(
      listing(TRACKED_ASSETS),
      `this test file wrote into the tracked ${path.relative(REPO_ROOT, TRACKED_ASSETS)}`,
    ).toEqual(before);
    expect(deepListing(SEED), "this test file wrote into the tracked seed/").toEqual(seedBefore);
  } finally {
    if (root.startsWith(`${temp}${path.sep}`)) rmSync(root, { recursive: true, force: true });
    if (blobHome?.startsWith(`${temp}${path.sep}`)) rmSync(blobHome, { recursive: true, force: true });
  }
});
