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
 * suite drops into the tree is visible to every other suite for as long as it
 * is there. It began with `learn/assets/`: `services/catalog/test/catalog.test.ts`
 * indexed that directory three times and asserted the second pass deleted
 * nothing, so a fixture that existed for one pass and was gone by the next made
 * that suite fail on a deletion it had nothing to do with. It failed about once
 * in eight full runs, passed every time it ran alone, and failed every one of
 * twelve runs that overlapped a second `npm test`.
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
 * 3. Every test file, studio or not, has the whole `seed/` tree, and whatever
 *    is at the repository's `content/` and `learn/`, taken before it runs and
 *    checked after it, names with sizes and modification times, so an edit in
 *    place counts as well as a new file. This one is a backstop and samples at
 *    two points: a suite that writes a file and deletes it again inside one
 *    test is invisible to it, which is exactly why the check above it is not a
 *    sample. `seed/` is watched because suites import it (edge case 11 of
 *    docs/CONTENT-MIGRATION.md), and an import records it as the root a seam
 *    write keeps in step, so a suite that imports it and then writes a topic
 *    would rewrite the seed. `content/` and `learn/` are watched because phase
 *    3's cut-over removed them, and the one way they come back is code that
 *    still reads or writes the repository as its knowledge base (an
 *    `ensureDirs`, a write-through to a root recorded before the cut-over):
 *    absent before a test file, they must be absent after it.
 */

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.join(REPO_ROOT, "seed");
/** Gone from the tree since the cut-over; a checkout may still hold untracked leftovers, which must not change. */
const REMOVED = ["content", "learn"].map((folder) => path.join(REPO_ROOT, folder));

/**
 * Mirrors `from` into `into` as symlinks, one per entry, minus the entries the
 * caller rebuilds instead. Writing to a path that names a symlink follows it,
 * so every directory a test writes into is a real directory and only the files
 * inside it are links. A read of an untouched file still reaches the checkout,
 * which is why this is a farm and not a copy.
 */
function farm(from: string, into: string, rebuilt: readonly string[] = []): void {
  mkdirSync(into, { recursive: true });
  for (const entry of readdirSync(from)) {
    if (rebuilt.includes(entry)) continue;
    symlinkSync(path.join(from, entry), path.join(into, entry));
  }
}

function studioRepoRoot(): string {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "self-learn-studio-"));
  // `.studio` is rebuilt as nothing at all: it is the runner's real state
  // (job workspaces, the content cache), and a suite that does not set
  // STUDIO_HOME would otherwise write through the link into it. `learn` and
  // `content` are not linked either: the cut-over removed both, and a
  // checkout's untracked leftovers are nothing a test should reach. The
  // studio's old candidates directory is a real, empty directory, for the
  // suites that resolve a record from before the job workspaces.
  farm(REPO_ROOT, root, ["learn", "content", ".studio"]);
  mkdirSync(path.join(root, "learn", "assets", ".candidates"), { recursive: true });
  return root;
}

/** Each file under `directory` at any depth, by path relative to it, with what would change if a test wrote to it. */
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
// every fixture back into the checkout and the only symptom would be another
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

// The remotionkc checkout, pointed at a directory that does not exist. A bare
// `catalog import` runs every video tool whose CLI it finds, and the ones the
// suites spawn resolve tools against the repository, so with the submodule
// initialised every import of the seed would run the real remotionkc, whose
// topic.yml files name topics the seed does not hold, and be refused.
// manimkc's suites each point MANIMKC_ROOT away for themselves; this does it
// once for remotionkc, unconditionally, since a value from the developer's
// shell is exactly the real checkout. A suite that wants a stand-in sets its
// own, and a child it spawns inherits whichever is set.
process.env.REMOTIONKC_ROOT = path.join(temp, "self-learn-test-no-remotionkc");

const removedBefore = REMOVED.map((folder) => [existsSync(folder), deepListing(folder)] as const);
const seedBefore = deepListing(SEED);

afterAll(() => {
  try {
    REMOVED.forEach((folder, i) => {
      expect(
        [existsSync(folder), deepListing(folder)],
        `this test file wrote into ${path.relative(REPO_ROOT, folder)}/, which the cut-over removed`,
      ).toEqual(removedBefore[i]);
    });
    expect(deepListing(SEED), "this test file wrote into the tracked seed/").toEqual(seedBefore);
  } finally {
    if (root.startsWith(`${temp}${path.sep}`)) rmSync(root, { recursive: true, force: true });
    if (blobHome?.startsWith(`${temp}${path.sep}`)) rmSync(blobHome, { recursive: true, force: true });
  }
});
