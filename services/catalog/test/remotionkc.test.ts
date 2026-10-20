import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { REMOTIONKC_ROOT_ENV, REPO_ROOT, resolveRemotionkcRoot } from "../src/env";
import { buildRemotionkcRows, remotionkcIndexer, type TopicsReport } from "../src/index/remotionkc";
import { selection, withDependents } from "../src/index/run";
import { hasToolCli, missingToolCli, REMOTIONKC, toolCliPath } from "../src/index/video-tool";
import { makeFixture, topicsYaml, type Fixture } from "./fixture-tree";

/**
 * The remotionkc source on its own: a captured `remotionkc topics --json` in,
 * rows out, no database.
 *
 * The fixture is the real CLI's output (remotionkc 8def21c) for a scratch
 * checkout with two rendered topics, one with all three sidecars and one with
 * a transcript only, with `outRoot` swapped for a placeholder. It is the same
 * shape as manimkc's report, which is the contract: one reader for both.
 *
 * What differs from manimkc is where a folder's topic comes from. There is no
 * `maps.remotionkc`: the topic.yml's `topic:` is required and is the answer,
 * so the refusals here are the missing one and the one naming a topic the
 * owner cannot read. Both are refusals, never skips (AGENTS.md).
 */

const FIXTURE = path.join(import.meta.dirname, "fixtures", "remotionkc-topics.json");

const RT = "out/algorithms/cs3230/week-02-recursion-tree/recursion_tree";
const WC = "out/big-data/cs4225/week-02-wordcount-code/wordcount_code";

/** The captured report, with its data root at `outRoot`. */
async function captured(outRoot: string): Promise<TopicsReport> {
  const text = await readFile(FIXTURE, "utf8");
  return { ...(JSON.parse(text) as TopicsReport), outRoot };
}

/** Topics the importing owner can read, as the vocabulary's `bySlug` holds them. */
const READABLE = new Map<string, unknown>([
  ["cs3230-recurrences", {}],
  ["cs4225-mapreduce", {}],
]);

/** The concept the captured recursion-tree topic.yml names, as one the owner can read. */
const CONCEPTS = { knownConcepts: new Set(["recursion-tree-method"]) };

let fixture: Fixture;
let dataRoot: string;

/** A data root holding the files the report says exist. */
async function withRenders(): Promise<void> {
  fixture = await makeFixture();
  dataRoot = path.join(fixture.root, "remotionkc-home");
  const files: Record<string, string> = {
    [`${RT}.mp4`]: "rt video",
    [`${RT}.transcript.json`]: '{"video":"recursion_tree.mp4","chapters":[],"segments":[]}',
    [`${RT}.chapters.json`]: "[]",
    [`${RT}.vtt`]: "WEBVTT\n",
    [`${WC}.mp4`]: "wc video",
    [`${WC}.transcript.json`]: '{"video":"wordcount_code.mp4","chapters":[],"segments":[]}',
  };
  for (const [file, body] of Object.entries(files)) {
    await fixture.write(path.join("remotionkc-home", file), body);
  }
  await fixture.write("content/topics.yaml", topicsYaml([{ slug: "cs3230-recurrences" }, { slug: "cs4225-mapreduce" }]));
}

afterEach(async () => {
  await fixture?.cleanup();
});

describe("remotionkc rows", () => {
  it("turns each deliverable and its sidecars into linked assets under the remotionkc: namespace", async () => {
    await withRenders();
    const checkout = path.join(fixture.root, "remotionkc");
    const { rows, metadata, notes } = await buildRemotionkcRows(await captured(dataRoot), checkout, READABLE, CONCEPTS);

    expect(rows.asset?.map((a) => [a.id, a.kind])).toEqual([
      [`remotionkc:${RT}.mp4`, "video"],
      [`remotionkc:${RT}.transcript.json`, "transcript"],
      [`remotionkc:${RT}.chapters.json`, "chapters"],
      [`remotionkc:${RT}.vtt`, "captions"],
      [`remotionkc:${WC}.mp4`, "video"],
      [`remotionkc:${WC}.transcript.json`, "transcript"],
    ]);
    expect(rows.asset?.every((a) => a.sourceRepo === "remotionkc")).toBe(true);
    // The stored path is the report's string, relative to the data root.
    expect(rows.asset?.[0]?.path).toBe(`${RT}.mp4`);
    expect(rows.asset?.[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.asset?.[0]?.title).toBe("Recursion trees (narrated)");

    // Each folder under the topic its own topic.yml declares.
    expect(rows.assetTopic).toEqual([
      ...[".mp4", ".transcript.json", ".chapters.json", ".vtt"].map((ext) => ({
        assetId: `remotionkc:${RT}${ext}`,
        topicSlug: "cs3230-recurrences",
      })),
      ...[".mp4", ".transcript.json"].map((ext) => ({ assetId: `remotionkc:${WC}${ext}`, topicSlug: "cs4225-mapreduce" })),
    ]);
    // The concept its topic.yml names, on the video and each sidecar; the
    // wordcount folder says `concepts: []` and links none.
    expect(rows.assetConcept).toEqual(
      [".mp4", ".transcript.json", ".chapters.json", ".vtt"].map((ext) => ({
        assetId: `remotionkc:${RT}${ext}`,
        conceptSlug: "recursion-tree-method",
      })),
    );
    expect(rows.assetDerivation).toEqual([
      ...[".transcript.json", ".chapters.json", ".vtt"].map((ext) => ({
        assetId: `remotionkc:${RT}${ext}`,
        sourceAssetId: `remotionkc:${RT}.mp4`,
      })),
      { assetId: `remotionkc:${WC}.transcript.json`, sourceAssetId: `remotionkc:${WC}.mp4` },
    ]);

    // The data root is what the run records, since nothing else can say where
    // `out/…` resolves; the checkout is somewhere else, and the note says so.
    expect(metadata).toEqual({ outRoot: dataRoot });
    expect(notes).toContain("2 topic folders, 2 videos, 4 sidecars");
    expect(notes).toContain(`rendered output read from ${dataRoot} (remotionkc's REMOTIONKC_HOME), not the checkout`);
    // No vocabulary map, so no line about mappings with no folder.
    expect(notes.join("\n")).not.toContain("vocabulary mapping");
  });

  it("names each file's blob and queues it to store under the contract", async () => {
    await withRenders();
    const { rows, blobs } = await buildRemotionkcRows(await captured(dataRoot), dataRoot, READABLE, {
      store: true,
      owner: "local",
      ...CONCEPTS,
    });
    expect(blobs).toHaveLength(6);
    expect(blobs[0]).toMatchObject({ file: path.join(dataRoot, `${RT}.mp4`), mime: "video/mp4", ext: "mp4", ownerId: "local" });
    expect(blobs.find((b) => b.ext === "vtt")?.mime).toBe("text/vtt");
    expect(rows.asset?.[0]?.blobKey).toMatch(/^local\/[0-9a-f]{64}\.mp4$/);
  });

  it("refuses a topic.yml with no topic, naming the file", async () => {
    await withRenders();
    const report = await captured(dataRoot);
    report.topics[1] = { ...report.topics[1], topic: null };
    await expect(buildRemotionkcRows(report, dataRoot, READABLE)).rejects.toThrow(
      /remotionkc topic "big-data\/cs4225\/week-02-wordcount-code" declares no topic: topics\/big-data\/cs4225\/week-02-wordcount-code\/topic\.yml needs a `topic:`/,
    );
  });

  it("refuses a topic the owner cannot read, naming the file and the slug", async () => {
    await withRenders();
    const report = await captured(dataRoot);
    report.topics[0] = { ...report.topics[0], topic: "someone-elses-topic" };
    await expect(buildRemotionkcRows(report, dataRoot, READABLE)).rejects.toThrow(
      /declares topic "someone-elses-topic" in topics\/algorithms\/cs3230\/week-02-recursion-tree\/topic\.yml, which is not a topic this owner can read/,
    );
  });

  it("refuses the whole run, and names every folder, rather than indexing the rest", async () => {
    await withRenders();
    const report = await captured(dataRoot);
    report.topics[0] = { ...report.topics[0], topic: "" };
    report.topics[1] = { ...report.topics[1], topic: "nope" };
    const refusal = buildRemotionkcRows(report, dataRoot, READABLE, CONCEPTS);
    await expect(refusal).rejects.toThrow(/remotionkc topics \(.*\): 2 unresolved references/s);
    await expect(refusal).rejects.toThrow(/week-02-recursion-tree.*declares no topic.*week-02-wordcount-code.*"nope"/s);
  });

  it("ignores a maps.manimkc entry: remotionkc has no vocabulary map to follow or to disagree with", async () => {
    // manimkc's rule is that a declared topic must agree with the map. A
    // remotionkc folder with the same path as a mapped manimkc folder is filed
    // by its own topic.yml and nothing else.
    await withRenders();
    const { rows } = await buildRemotionkcRows(await captured(dataRoot), dataRoot, READABLE, CONCEPTS);
    expect(new Set(rows.assetTopic?.map((t) => t.topicSlug))).toEqual(new Set(["cs3230-recurrences", "cs4225-mapreduce"]));
  });

  it("passes the tool's own orphan drift through as a note", async () => {
    await withRenders();
    const report = await captured(dataRoot);
    report.drift.orphans = [{ path: "out/networking/gone", videos: ["gone.mp4"] }];
    const { notes } = await buildRemotionkcRows(report, dataRoot, READABLE, CONCEPTS);
    expect(notes).toContain("ORPHAN out/networking/gone: rendered video with no topics/ source, not indexed");
  });
});

describe("the remotionkc CLI", () => {
  const saved = process.env[REMOTIONKC_ROOT_ENV];
  let stand: string;

  beforeEach(async () => {
    stand = await mkdtemp(path.join(tmpdir(), "catalog-remotionkc-cli-"));
  });

  afterEach(async () => {
    if (saved === undefined) delete process.env[REMOTIONKC_ROOT_ENV];
    else process.env[REMOTIONKC_ROOT_ENV] = saved;
    await rm(stand, { recursive: true, force: true });
  });

  /**
   * A checkout whose `tools/cli/remotionkc.mjs` answers `topics --json` with
   * the captured report, and refuses to answer unless `--root` comes before
   * the subcommand, as the real CLI's global flag does.
   */
  async function standIn(outRoot: string): Promise<void> {
    const cli = path.join(stand, "tools", "cli", "remotionkc.mjs");
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
    process.env[REMOTIONKC_ROOT_ENV] = stand;

    const context = await fixture.context({ knownConcepts: async () => CONCEPTS.knownConcepts });
    // Unset in the context: the checkout is the variable's, as a run would pass it.
    expect(remotionkcIndexer.root(context)).toBe(stand);
    const { rows, metadata } = await remotionkcIndexer.read(context);
    expect(rows.asset).toHaveLength(6);
    expect(metadata).toEqual({ outRoot: dataRoot });
  });

  it("refuses by name when the submodule is not there", async () => {
    await withRenders();
    process.env[REMOTIONKC_ROOT_ENV] = path.join(stand, "not-a-checkout");
    expect(hasToolCli(REMOTIONKC, REPO_ROOT)).toBe(false);
    await expect(remotionkcIndexer.read(await fixture.context())).rejects.toThrow(
      /not-a-checkout\/tools\/cli\/remotionkc\.mjs does not exist\. The remotionkc submodule is not initialised; run `git submodule update --init tools\/remotionkc`, or set REMOTIONKC_ROOT to a checkout\./,
    );
    expect(missingToolCli(REMOTIONKC, REPO_ROOT).message).toContain("REMOTIONKC_ROOT");
  });

  it("says what the CLI said when it fails", async () => {
    await withRenders();
    const cli = path.join(stand, "tools", "cli", "remotionkc.mjs");
    await mkdir(path.dirname(cli), { recursive: true });
    await writeFile(cli, 'process.stderr.write("topics/x/topic.yml: bad yaml"); process.exit(1);\n');
    process.env[REMOTIONKC_ROOT_ENV] = stand;
    await expect(remotionkcIndexer.read(await fixture.context({ remotionkcRoot: stand }))).rejects.toThrow(
      /`remotionkc topics --json` failed against .*\n {2}topics\/x\/topic\.yml: bad yaml/,
    );
  });

  it("resolves the checkout from REMOTIONKC_ROOT, else the submodule", () => {
    delete process.env[REMOTIONKC_ROOT_ENV];
    expect(resolveRemotionkcRoot("/srv/gnosia")).toBe(path.join("/srv/gnosia", "tools", "remotionkc"));
    expect(toolCliPath(REMOTIONKC, "/srv/gnosia")).toBe(
      path.join("/srv/gnosia", "tools", "remotionkc", "tools", "cli", "remotionkc.mjs"),
    );
    process.env[REMOTIONKC_ROOT_ENV] = "../elsewhere/remotionkc";
    expect(resolveRemotionkcRoot("/srv/gnosia")).toBe(path.resolve("/srv/gnosia", "../elsewhere/remotionkc"));
  });
});

describe("remotionkc in the source graph", () => {
  it("runs whenever the topics it files under might be pruned", () => {
    expect(withDependents(["topics"]).has("remotionkc")).toBe(true);
  });

  it("stays cheap on its own: it has no mirror ledger and nothing points at its rows", () => {
    expect([...selection(["remotionkc"])]).toEqual(["remotionkc"]);
  });
});
