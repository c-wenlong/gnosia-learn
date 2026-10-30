import { randomBytes } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { REPO_ROOT } from "../src/env";
import { execFileAsync, rehearse, reportOf, type Report } from "./flip-rehearsal-helpers";
import { manimkcStandIn, seedWithManimkc } from "./manimkc-standin";
import { dropDatabase, migratedScratchDatabase, probe, type Scratch } from "./scratch-database";

const reachable = await probe();

/**
 * `scripts/flip-rehearsal.mjs --cutover --checkout`, in the owner's order:
 * flip day from a worktree at the tag, then the cut-over on that worktree from
 * the newer script, with the tag and flip day's export accepted.
 */

describe.skipIf(!reachable.ok)("scripts/flip-rehearsal.mjs --cutover --checkout, the owner's order", () => {
  let template: Scratch;
  let work: string;
  let manimkc: string;
  const copies: string[] = [];
  const kept: string[] = [];

  beforeAll(async () => {
    template = await migratedScratchDatabase();
    work = await mkdtemp(path.join(tmpdir(), "catalog-cutover-worktree-"));
    manimkc = path.join(work, "manimkc");
    await manimkcStandIn(manimkc, randomBytes(4096));
  }, 60_000);

  afterAll(async () => {
    for (const name of copies) await dropDatabase(name);
    for (const dir of kept) await rm(dir, { recursive: true, force: true });
    await template?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  it("flip day from a worktree at the tag, then the cut-over on it from the newer script: the tag and the export accepted", async () => {
    // A repository standing in for the owner's, so the worktree below is a
    // worktree of the repository the script is in without touching this one:
    // the script as real files, the code it runs linked from this checkout,
    // and the seed as content/ and learn/.
    const repo = path.join(work, "repo");
    await mkdir(path.join(repo, "scripts", "lib"), { recursive: true });
    for (const file of ["flip-rehearsal.mjs", "lib/cutover.mjs", "lib/flip-order.mjs", "lib/proc.mjs", "lib/sqlite.mjs"]) {
      await cp(path.join(REPO_ROOT, "scripts", file), path.join(repo, "scripts", file));
    }
    for (const link of ["services", "packages", "node_modules"]) await symlink(path.join(REPO_ROOT, link), path.join(repo, link));
    await seedWithManimkc(repo);
    // The diagram's document in another key order: parity is clean, and
    // flip day's export rewrites it, as it did the owner's two .tldr files.
    const tldr = "learn/assets/vector-as-a-list-of-numbers.tldr";
    const document = JSON.parse(await readFile(path.join(repo, tldr), "utf8")) as Record<string, unknown>;
    await writeFile(path.join(repo, tldr), `${JSON.stringify(Object.fromEntries(Object.entries(document).reverse()), null, 2)}\n`);
    // A file no export writes, which the cut-over must refuse to see edited.
    await writeFile(path.join(repo, "learn", "README.md"), "the storage notes\n");
    const git = (dir: string, ...args: string[]) =>
      execFileAsync("git", ["-C", dir, "-c", "user.name=test", "-c", "user.email=test@localhost", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args]);
    await git(repo, "init", "-q");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-q", "-m", "the last commit with the files");
    await git(repo, "tag", "-a", "content-files-final", "-m", "last commit with content/ and learn/");
    const tagObject = (await git(repo, "rev-parse", "refs/tags/content-files-final")).stdout.trim();
    await git(repo, "rm", "-q", "-r", "content", "learn");
    await git(repo, "commit", "-q", "-m", "the cut-over");
    const files = path.join(work, "files");
    await git(repo, "worktree", "add", "-q", files, "content-files-final");
    const script = path.join(repo, "scripts", "flip-rehearsal.mjs");
    const env = { MANIMKC_ROOT: manimkc };

    // Flip day, from the worktree's tree, kept: the copy is the database flip
    // day ran on, and its temp tree holds the export it wrote.
    const flipDay = path.join(work, "flipday.db");
    copies.push(flipDay);
    const first = await rehearse(["--from", template.url, "--name", flipDay, "--tree-from", files, "--keep", "--json"], env, script);
    const day = reportOf(first);
    kept.push(path.dirname(day.tree));
    expect(day.steps.find((s) => !s.ok)?.gist ?? null, first.stderr).toBeNull();
    expect(day.steps.find((s) => s.name === "flip diagrams")?.result).toMatchObject({ export: { rewrites: [tldr] } });
    // --real exports into the checkout it runs from; here, the export lands in
    // the worktree by hand, which is where the owner's flip day leaves it.
    for (const folder of ["content", "learn"]) await cp(path.join(day.tree, folder), path.join(files, folder), { recursive: true });
    const status = async () => (await git(files, "status", "--porcelain", "--untracked-files=all")).stdout;
    const before = await status();
    expect(before).toBe(` M ${tldr}\n`);

    const cutover = async (name: string) => {
      copies.push(name);
      const ran = await rehearse(
        ["--cutover", "--from", flipDay, "--name", name, "--checkout", files, "--blob-store", path.join(path.dirname(day.tree), "home", "blobs"),
          "--waive-reason", "the seed's items name no concept yet", "--json"],
        env,
        script,
      );
      return { ran, report: reportOf<Report & { next: string[]; cutover: { tag: { commit: string; made: boolean } | null; rewrites: string[]; exported: string[] } }>(ran) };
    };
    const { ran, report } = await cutover(path.join(work, "cut.db"));
    const failed = report.steps.find((s) => !s.ok);
    expect(failed?.gist ?? null, `${failed?.name}: ${ran.stderr}`).toBeNull();
    expect(ran.code).toBe(0);
    // Only the cut-over's steps: flip day ran already.
    expect(report.steps[0]?.name).toBe("cut-over: back up the database");
    expect(report.steps).toHaveLength(17);
    const parity = report.steps.find((s) => s.name === "cut-over: parity")?.result as {
      rewrites: string[];
      unexpected: string[];
      headParity: { clean: boolean };
      bytes: { differ: string[] };
    };
    expect(parity).toMatchObject({ rewrites: [tldr], unexpected: [], headParity: { clean: true }, bytes: { differ: [] } });
    const head = (await git(files, "rev-parse", "HEAD")).stdout.trim();
    expect(report.cutover.tag).toMatchObject({ commit: head, made: false });
    expect(report.cutover.exported).toEqual([tldr]);
    // The stand-in's origin is not asked (it has none), so the push is
    // printed: a tag origin was not seen to hold is one to push.
    const at = await realpath(files);
    expect(report.next).toEqual([
      `git -C ${at} push origin content-files-final`,
      `git -C ${at} switch -c content-files-export`,
      `git -C ${at} add -- ${tldr}`,
      `git -C ${at} commit -m 'The export flip day wrote into content/ and learn/' -- ${tldr}`,
    ]);
    // Nothing written in the worktree, and the tag is the one made before.
    expect(await status()).toBe(before);
    expect((await git(repo, "rev-parse", "refs/tags/content-files-final")).stdout.trim()).toBe(tagObject);

    // Any other edit stops it, before anything is armed.
    await writeFile(path.join(files, "learn", "README.md"), "edited by hand\n");
    const stray = await cutover(path.join(work, "stray.db"));
    expect(stray.ran.code).toBe(1);
    expect(stray.report.steps.at(-1)).toMatchObject({ name: "cut-over: parity", ok: false });
    expect(stray.report.steps.at(-1)?.gist).toMatch(/learn\/README\.md \(no export writes this file\)/);
  }, 300_000);
});
