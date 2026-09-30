import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { REPO_ROOT, resolveRevideokcRoot, REVIDEOKC_ROOT_ENV } from "../src/env";
import { buildRevideokcRows, revideokcIndexer, type TopicsReport } from "../src/index/revideokc";
import { selection, withDependents } from "../src/index/run";
import { hasToolCli, missingToolCli, REVIDEOKC, toolCliPath } from "../src/index/video-tool";
import { makeFixture, topicsYaml, type Fixture } from "./fixture-tree";

/**
 * The revideokc source on its own: a captured `revideokc topics --json` in,
 * rows out, no database.
 *
 * The fixture is the real CLI's output (revideokc 30346dc) for a checkout
 * with its two rendered topics, each with all three sidecars, with `outRoot`
 * swapped for a placeholder. It is manimkc's and remotionkc's report shape,
 * which is the contract: one reader for all three.
 *
 * Like remotionkc, and unlike manimkc, there is no `maps.revideokc`: the
 * topic.yml's `topic:` is required and is the answer, so the refusals here are
 * the missing one and the one naming a topic the owner cannot read. Both are
 * refusals, never skips (AGENTS.md).
 */

const FIXTURE = path.join(import.meta.dirname, "fixtures", "revideokc-topics.json");

const IS = "out/algorithms/cs3230/week-03a-insertion-sort-proof/week_03a_insertion_sort_proof";
const MH = "out/computer-architecture/cache-basics/memory-hierarchy-in-depth/memory_hierarchy_in_depth";
const SIDECARS = [".transcript.json", ".chapters.json", ".vtt"];

/** The captured report, with its data root at `outRoot`. */
async function captured(outRoot: string): Promise<TopicsReport> {
  const text = await readFile(FIXTURE, "utf8");
  return { ...(JSON.parse(text) as TopicsReport), outRoot };
}

/** Topics the importing owner can read, as the vocabulary's `bySlug` holds them. */
const READABLE = new Map<string, unknown>([
  ["proof-of-correctness", {}],
  ["cache-basics", {}],
]);

let fixture: Fixture;
let dataRoot: string;

/** A data root holding the files the report says exist. */
async function withRenders(): Promise<void> {
  fixture = await makeFixture();
  dataRoot = path.join(fixture.root, "revideokc-home");
  const files: Record<string, string> = {
    [`${IS}.mp4`]: "is video",
    [`${IS}.transcript.json`]: '{"video":"week_03a_insertion_sort_proof.mp4","chapters":[],"segments":[]}',
    [`${IS}.chapters.json`]: "[]",
    [`${IS}.vtt`]: "WEBVTT\n",
    [`${MH}.mp4`]: "mh video",
    [`${MH}.transcript.json`]: '{"video":"memory_hierarchy_in_depth.mp4","chapters":[],"segments":[]}',
    [`${MH}.chapters.json`]: "[]",
    [`${MH}.vtt`]: "WEBVTT\n",
  };
  for (const [file, body] of Object.entries(files)) {
    await fixture.write(path.join("revideokc-home", file), body);
  }
  await fixture.write("content/topics.yaml", topicsYaml([{ slug: "proof-of-correctness" }, { slug: "cache-basics" }]));
}

afterEach(async () => {
  await fixture?.cleanup();
});

describe("revideokc rows", () => {
  it("turns each deliverable and its sidecars into linked assets under the revideokc: namespace", async () => {
    await withRenders();
    const checkout = path.join(fixture.root, "revideokc");
    const { rows, metadata, notes } = await buildRevideokcRows(await captured(dataRoot), checkout, READABLE);

    expect(rows.asset?.map((a) => [a.id, a.kind])).toEqual([
      [`revideokc:${IS}.mp4`, "video"],
      [`revideokc:${IS}.transcript.json`, "transcript"],
      [`revideokc:${IS}.chapters.json`, "chapters"],
      [`revideokc:${IS}.vtt`, "captions"],
      [`revideokc:${MH}.mp4`, "video"],
      [`revideokc:${MH}.transcript.json`, "transcript"],
      [`revideokc:${MH}.chapters.json`, "chapters"],
      [`revideokc:${MH}.vtt`, "captions"],
    ]);
    expect(rows.asset?.every((a) => a.sourceRepo === "revideokc")).toBe(true);
    // The stored path is the report's string, relative to the data root.
    expect(rows.asset?.[0]?.path).toBe(`${IS}.mp4`);
    expect(rows.asset?.[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.asset?.[0]?.title).toBe("CS3230 week 3: insertion sort, proved correct (narrated)");

    // Each folder under the topic its own topic.yml declares.
    expect(rows.assetTopic).toEqual([
      ...[".mp4", ...SIDECARS].map((ext) => ({ assetId: `revideokc:${IS}${ext}`, topicSlug: "proof-of-correctness" })),
      ...[".mp4", ...SIDECARS].map((ext) => ({ assetId: `revideokc:${MH}${ext}`, topicSlug: "cache-basics" })),
    ]);
    expect(rows.assetDerivation).toEqual([
      ...SIDECARS.map((ext) => ({ assetId: `revideokc:${IS}${ext}`, sourceAssetId: `revideokc:${IS}.mp4` })),
      ...SIDECARS.map((ext) => ({ assetId: `revideokc:${MH}${ext}`, sourceAssetId: `revideokc:${MH}.mp4` })),
    ]);

    // The data root is what the run records, since nothing else can say where
    // `out/…` resolves; the checkout is somewhere else, and the note says so.
    expect(metadata).toEqual({ outRoot: dataRoot });
    expect(notes).toContain("2 topic folders, 2 videos, 6 sidecars");
    expect(notes).toContain(`rendered output read from ${dataRoot} (revideokc's REVIDEOKC_HOME), not the checkout`);
    // No vocabulary map, so no line about mappings with no folder.
    expect(notes.join("\n")).not.toContain("vocabulary mapping");
  });

  it("names each file's blob and queues it to store under the contract", async () => {
    await withRenders();
    const { rows, blobs } = await buildRevideokcRows(await captured(dataRoot), dataRoot, READABLE, {
      store: true,
      owner: "local",
    });
    expect(blobs).toHaveLength(8);
    expect(blobs[0]).toMatchObject({ file: path.join(dataRoot, `${IS}.mp4`), mime: "video/mp4", ext: "mp4", ownerId: "local" });
    expect(blobs.find((b) => b.ext === "vtt")?.mime).toBe("text/vtt");
    expect(rows.asset?.[0]?.blobKey).toMatch(/^local\/[0-9a-f]{64}\.mp4$/);
  });

  it("refuses a topic.yml with no topic, naming the file", async () => {
    await withRenders();
    const report = await captured(dataRoot);
    report.topics[1] = { ...report.topics[1], topic: null };
    await expect(buildRevideokcRows(report, dataRoot, READABLE)).rejects.toThrow(
      /revideokc topic "computer-architecture\/cache-basics\/memory-hierarchy-in-depth" declares no topic: topics\/computer-architecture\/cache-basics\/memory-hierarchy-in-depth\/topic\.yml needs a `topic:`.*no maps\.revideokc/,
    );
  });

  it("refuses a topic the owner cannot read, naming the file and the slug", async () => {
    await withRenders();
    const report = await captured(dataRoot);
    report.topics[0] = { ...report.topics[0], topic: "someone-elses-topic" };
    await expect(buildRevideokcRows(report, dataRoot, READABLE)).rejects.toThrow(
      /revideokc topic "algorithms\/cs3230\/week-03a-insertion-sort-proof" declares topic "someone-elses-topic" in topics\/algorithms\/cs3230\/week-03a-insertion-sort-proof\/topic\.yml, which is not a topic this owner can read/,
    );
  });

  it("refuses the whole run, and names every folder, rather than indexing the rest", async () => {
    await withRenders();
    const report = await captured(dataRoot);
    report.topics[0] = { ...report.topics[0], topic: "" };
    report.topics[1] = { ...report.topics[1], topic: "nope" };
    const refusal = buildRevideokcRows(report, dataRoot, READABLE);
    await expect(refusal).rejects.toThrow(/revideokc topics \(.*\): 2 unresolved references/s);
    await expect(refusal).rejects.toThrow(/week-03a-insertion-sort-proof.*declares no topic.*memory-hierarchy-in-depth.*"nope"/s);
  });

  it("passes the tool's own orphan drift through as a note", async () => {
    await withRenders();
    const report = await captured(dataRoot);
    report.drift.orphans = [{ path: "out/networking/gone", videos: ["gone.mp4"] }];
    const { notes } = await buildRevideokcRows(report, dataRoot, READABLE);
    expect(notes).toContain("ORPHAN out/networking/gone: rendered video with no topics/ source, not indexed");
  });
});

describe("the revideokc CLI", () => {
  const saved = process.env[REVIDEOKC_ROOT_ENV];
  let stand: string;

  beforeEach(async () => {
    stand = await mkdtemp(path.join(tmpdir(), "catalog-revideokc-cli-"));
  });

  afterEach(async () => {
    if (saved === undefined) delete process.env[REVIDEOKC_ROOT_ENV];
    else process.env[REVIDEOKC_ROOT_ENV] = saved;
    await rm(stand, { recursive: true, force: true });
  });

  /**
   * A checkout whose `tools/cli/revideokc.mjs` answers `topics --json` with
   * the captured report, and refuses to answer unless `--root` comes before
   * the verb, as the real CLI's global flag does.
   */
  async function standIn(outRoot: string): Promise<void> {
    const cli = path.join(stand, "tools", "cli", "revideokc.mjs");
    await mkdir(path.dirname(cli), { recursive: true });
    const report = { ...JSON.parse(await readFile(FIXTURE, "utf8")), outRoot };
    await writeFile(
      cli,
      [
        "const argv = process.argv.slice(2);",
        'if (argv[0] !== "--root" || argv[2] !== "topics" || argv[3] !== "--json") {',
        "  process.stderr.write(`unexpected argv ${JSON.stringify(argv)}`);",
        "  process.exit(2);",
        "}",
        `process.stdout.write(${JSON.stringify(JSON.stringify(report))});`,
        "",
      ].join("\n"),
    );
    await chmod(cli, 0o755);
  }

  it("runs the pinned CLI with node against the checkout and indexes its report", async () => {
    await withRenders();
    await standIn(dataRoot);
    process.env[REVIDEOKC_ROOT_ENV] = stand;

    const context = await fixture.context();
    // Unset in the context: the checkout is the variable's, as a run would pass it.
    expect(revideokcIndexer.root(context)).toBe(stand);
    expect(revideokcIndexer.source).toBe("revideokc");
    expect(revideokcIndexer.assetPrefix).toBe("revideokc:");
    const { rows, metadata } = await revideokcIndexer.read(context);
    expect(rows.asset).toHaveLength(8);
    expect(metadata).toEqual({ outRoot: dataRoot });
  });

  it("reads the checkout the run named over the variable", async () => {
    await withRenders();
    await standIn(dataRoot);
    process.env[REVIDEOKC_ROOT_ENV] = path.join(stand, "not-this-one");
    const context = await fixture.context({ revideokcRoot: stand });
    expect(revideokcIndexer.root(context)).toBe(stand);
    // The CLI still resolves from the variable, which names nothing here.
    await expect(revideokcIndexer.read(context)).rejects.toThrow(/not-this-one\/tools\/cli\/revideokc\.mjs does not exist/);
  });

  it("refuses by name when the submodule is not there", async () => {
    await withRenders();
    process.env[REVIDEOKC_ROOT_ENV] = path.join(stand, "not-a-checkout");
    expect(hasToolCli(REVIDEOKC, REPO_ROOT)).toBe(false);
    await expect(revideokcIndexer.read(await fixture.context())).rejects.toThrow(
      /not-a-checkout\/tools\/cli\/revideokc\.mjs does not exist\. The revideokc submodule is not initialised; run `git submodule update --init tools\/revideokc`, or set REVIDEOKC_ROOT to a checkout\./,
    );
    expect(missingToolCli(REVIDEOKC, REPO_ROOT).message).toContain("REVIDEOKC_ROOT");
  });

  it("says what the CLI said when it fails", async () => {
    await withRenders();
    const cli = path.join(stand, "tools", "cli", "revideokc.mjs");
    await mkdir(path.dirname(cli), { recursive: true });
    await writeFile(cli, 'process.stderr.write("topics/x/topic.yml: bad yaml"); process.exit(1);\n');
    process.env[REVIDEOKC_ROOT_ENV] = stand;
    await expect(revideokcIndexer.read(await fixture.context({ revideokcRoot: stand }))).rejects.toThrow(
      /`revideokc topics --json` failed against .*\n {2}topics\/x\/topic\.yml: bad yaml/,
    );
  });

  it("resolves the checkout from REVIDEOKC_ROOT, else the submodule", () => {
    delete process.env[REVIDEOKC_ROOT_ENV];
    expect(resolveRevideokcRoot("/srv/self-learn")).toBe(path.join("/srv/self-learn", "tools", "revideokc"));
    expect(toolCliPath(REVIDEOKC, "/srv/self-learn")).toBe(
      path.join("/srv/self-learn", "tools", "revideokc", "tools", "cli", "revideokc.mjs"),
    );
    process.env[REVIDEOKC_ROOT_ENV] = "../elsewhere/revideokc";
    expect(resolveRevideokcRoot("/srv/self-learn")).toBe(path.resolve("/srv/self-learn", "../elsewhere/revideokc"));
  });
});

describe("revideokc in the source graph", () => {
  it("runs whenever the topics it files under might be pruned", () => {
    expect(withDependents(["topics"]).has("revideokc")).toBe(true);
  });

  it("stays cheap on its own: it has no mirror ledger and nothing points at its rows", () => {
    expect([...selection(["revideokc"])]).toEqual(["revideokc"]);
  });
});
