import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BLENDERKC_ROOT_ENV, REPO_ROOT, resolveBlenderkcRoot } from "../src/env";
import { blenderkcIndexer, buildBlenderkcRows, type TopicsReport } from "../src/index/blenderkc";
import { selection, withDependents } from "../src/index/run";
import { BLENDERKC, hasToolCli, missingToolCli, toolCliPath, VIDEO_TOOL_NAMES } from "../src/index/video-tool";
import { makeFixture, topicsYaml, type Fixture } from "./fixture-tree";

/**
 * The blenderkc source on its own: a captured `blenderkc topics --json` in,
 * rows out, no database.
 *
 * The fixture is the real CLI's output (blenderkc 52a8675, unchanged at d01f798) for its checkout,
 * against a data root holding the HBM video and its three sidecars as
 * placeholders, with `outRoot` swapped for a placeholder. Its second topic,
 * the kit tour under `topics/demo/`, is not rendered, as on the owner's Mac.
 * It is manimkc's report shape, which is the contract: one reader for all
 * four tools.
 *
 * Like remotionkc and revideokc there is no `maps.blenderkc`: the topic.yml's
 * `topic:` is required and is the answer, so the refusals here are the
 * missing one and the one naming a topic the owner cannot read. Both are
 * refusals, never skips (AGENTS.md). Unlike them its CLI is Python, run with
 * `python3` as manimkc's is.
 */

const FIXTURE = path.join(import.meta.dirname, "fixtures", "blenderkc-topics.json");

const HBM = "out/computer-architecture/gpu-architecture/hbm-how-it-is-built/hbm-how-it-is-built";
const SIDECARS = [".transcript.json", ".chapters.json", ".vtt"];

/** The captured report, with its data root at `outRoot`. */
async function captured(outRoot: string): Promise<TopicsReport> {
  const text = await readFile(FIXTURE, "utf8");
  return { ...(JSON.parse(text) as TopicsReport), outRoot };
}

/** Topics the importing owner can read, as the vocabulary's `bySlug` holds them. */
const READABLE = new Map<string, unknown>([["gpu-architecture", {}]]);

let fixture: Fixture;
let dataRoot: string;

/** A data root holding the files the report says exist. */
async function withRenders(): Promise<void> {
  fixture = await makeFixture();
  dataRoot = path.join(fixture.root, "blenderkc-home");
  const files: Record<string, string> = {
    [`${HBM}.mp4`]: "hbm video",
    [`${HBM}.transcript.json`]: '{"video":"hbm-how-it-is-built.mp4","chapters":[],"segments":[]}',
    [`${HBM}.chapters.json`]: "[]",
    [`${HBM}.vtt`]: "WEBVTT\n",
  };
  for (const [file, body] of Object.entries(files)) {
    await fixture.write(path.join("blenderkc-home", file), body);
  }
  await fixture.write("content/topics.yaml", topicsYaml([{ slug: "gpu-architecture" }]));
}

afterEach(async () => {
  await fixture?.cleanup();
});

describe("blenderkc as a video tool", () => {
  it("is the fourth, after the three that came before it", () => {
    expect(VIDEO_TOOL_NAMES).toEqual(["manimkc", "remotionkc", "revideokc", "blenderkc"]);
    expect(BLENDERKC).toMatchObject({
      name: "blenderkc",
      prefix: "blenderkc:",
      rootEnv: "BLENDERKC_ROOT",
      rootFlag: "--blenderkc-root",
      homeEnv: "BLENDERKC_HOME",
      topics: "declared",
    });
  });

  it("runs its CLI with python3, the root flag before the verb", () => {
    expect(BLENDERKC.topicsArgv("/c/tools/cli/blenderkc", "/c")).toEqual([
      "python3",
      ["/c/tools/cli/blenderkc", "--root", "/c", "topics", "--json"],
    ]);
  });
});

describe("blenderkc rows", () => {
  it("turns the deliverable and its sidecars into linked assets under the blenderkc: namespace", async () => {
    await withRenders();
    const checkout = path.join(fixture.root, "blenderkc");
    const { rows, metadata, notes } = await buildBlenderkcRows(await captured(dataRoot), checkout, READABLE);

    expect(rows.asset?.map((a) => [a.id, a.kind])).toEqual([
      [`blenderkc:${HBM}.mp4`, "video"],
      [`blenderkc:${HBM}.transcript.json`, "transcript"],
      [`blenderkc:${HBM}.chapters.json`, "chapters"],
      [`blenderkc:${HBM}.vtt`, "captions"],
    ]);
    expect(rows.asset?.every((a) => a.sourceRepo === "blenderkc")).toBe(true);
    expect(rows.asset?.[0]?.path).toBe(`${HBM}.mp4`);
    expect(rows.asset?.[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.asset?.[0]?.title).toBe("How HBM works and how it is built (narrated)");

    expect(rows.assetTopic).toEqual(
      [".mp4", ...SIDECARS].map((ext) => ({ assetId: `blenderkc:${HBM}${ext}`, topicSlug: "gpu-architecture" })),
    );
    expect(rows.assetDerivation).toEqual(
      SIDECARS.map((ext) => ({ assetId: `blenderkc:${HBM}${ext}`, sourceAssetId: `blenderkc:${HBM}.mp4` })),
    );
    expect(rows.assetConcept).toEqual([]);

    expect(metadata).toEqual({ outRoot: dataRoot });
    // The kit tour is a folder with a topic and no render: counted, filed nowhere.
    expect(notes).toContain("2 topic folders, 1 videos, 3 sidecars");
    expect(notes).toContain("1 topic(s) not rendered in this checkout");
    expect(notes).toContain(`rendered output read from ${dataRoot} (blenderkc's BLENDERKC_HOME), not the checkout`);
  });

  it("imports nothing and refuses nothing before anything is rendered", async () => {
    await withRenders();
    const report = await captured(dataRoot);
    for (const topic of report.topics) {
      for (const section of topic.sections as { deliverable: { exists: boolean; sidecars: Record<string, { exists: boolean }> } }[]) {
        section.deliverable.exists = false;
        for (const sidecar of Object.values(section.deliverable.sidecars)) sidecar.exists = false;
      }
    }
    const { rows, notes } = await buildBlenderkcRows(report, dataRoot, READABLE);
    expect(rows.asset).toEqual([]);
    expect(notes).toContain("2 topic folders, 0 videos, 0 sidecars");
  });

  it("names each file's blob and queues it to store under the contract", async () => {
    await withRenders();
    const { rows, blobs } = await buildBlenderkcRows(await captured(dataRoot), dataRoot, READABLE, {
      store: true,
      owner: "local",
    });
    expect(blobs).toHaveLength(4);
    expect(blobs[0]).toMatchObject({ file: path.join(dataRoot, `${HBM}.mp4`), mime: "video/mp4", ext: "mp4", ownerId: "local" });
    expect(blobs.find((b) => b.ext === "vtt")?.mime).toBe("text/vtt");
    expect(rows.asset?.[0]?.blobKey).toMatch(/^local\/[0-9a-f]{64}\.mp4$/);
  });

  it("refuses a topic.yml with no topic, naming the file", async () => {
    await withRenders();
    const report = await captured(dataRoot);
    report.topics[0] = { ...report.topics[0], topic: null };
    await expect(buildBlenderkcRows(report, dataRoot, READABLE)).rejects.toThrow(
      /blenderkc topic "computer-architecture\/gpu-architecture\/hbm-how-it-is-built" declares no topic: topics\/computer-architecture\/gpu-architecture\/hbm-how-it-is-built\/topic\.yml needs a `topic:`.*no maps\.blenderkc/,
    );
  });

  it("refuses a topic the owner cannot read, rendered or not, naming the file and the slug", async () => {
    await withRenders();
    const report = await captured(dataRoot);
    report.topics[1] = { ...report.topics[1], topic: "someone-elses-topic" };
    await expect(buildBlenderkcRows(report, dataRoot, READABLE)).rejects.toThrow(
      /blenderkc topic "demo\/kit-tour" declares topic "someone-elses-topic" in topics\/demo\/kit-tour\/topic\.yml, which is not a topic this owner can read/,
    );
  });

  it("refuses the run when the data root holds none of the files the stored rows name", async () => {
    await withRenders();
    const empty = path.join(fixture.root, "checkout-as-data-root");
    await expect(
      buildBlenderkcRows(await captured(empty), empty, READABLE, { storedPaths: [`${HBM}.mp4`] }),
    ).rejects.toThrow(/blenderkc's data root .* holds none of the 1 files .* BLENDERKC_HOME/s);
  });
});

describe("the blenderkc CLI", () => {
  const saved = process.env[BLENDERKC_ROOT_ENV];
  let stand: string;

  beforeEach(async () => {
    stand = await mkdtemp(path.join(tmpdir(), "catalog-blenderkc-cli-"));
  });

  afterEach(async () => {
    if (saved === undefined) delete process.env[BLENDERKC_ROOT_ENV];
    else process.env[BLENDERKC_ROOT_ENV] = saved;
    await rm(stand, { recursive: true, force: true });
  });

  /**
   * A checkout whose `tools/cli/blenderkc` answers `topics --json` with the
   * captured report, and refuses to answer unless `--root` comes before the
   * verb, as the real CLI's global flag does. Python, as the real one is.
   */
  async function standIn(outRoot: string): Promise<void> {
    const cli = path.join(stand, "tools", "cli", "blenderkc");
    await mkdir(path.dirname(cli), { recursive: true });
    const report = { ...JSON.parse(await readFile(FIXTURE, "utf8")), outRoot };
    await writeFile(
      cli,
      [
        "import sys",
        "argv = sys.argv[1:]",
        'if argv[0:1] != ["--root"] or argv[2:4] != ["topics", "--json"]:',
        '    sys.stderr.write("unexpected argv %r" % argv)',
        "    sys.exit(2)",
        `sys.stdout.write(${JSON.stringify(JSON.stringify(report))})`,
        "",
      ].join("\n"),
    );
    await chmod(cli, 0o755);
  }

  it("runs the pinned CLI with python3 against the checkout and indexes its report", async () => {
    await withRenders();
    await standIn(dataRoot);
    process.env[BLENDERKC_ROOT_ENV] = stand;

    const context = await fixture.context();
    expect(blenderkcIndexer.root(context)).toBe(stand);
    expect(blenderkcIndexer.source).toBe("blenderkc");
    expect(blenderkcIndexer.assetPrefix).toBe("blenderkc:");
    const { rows, metadata } = await blenderkcIndexer.read(context);
    expect(rows.asset).toHaveLength(4);
    expect(metadata).toEqual({ outRoot: dataRoot });
  });

  it("reads the checkout the run named over the variable", async () => {
    await withRenders();
    await standIn(dataRoot);
    process.env[BLENDERKC_ROOT_ENV] = path.join(stand, "not-this-one");
    const context = await fixture.context({ blenderkcRoot: stand });
    expect(blenderkcIndexer.root(context)).toBe(stand);
    // The CLI still resolves from the variable, which names nothing here.
    await expect(blenderkcIndexer.read(context)).rejects.toThrow(/not-this-one\/tools\/cli\/blenderkc does not exist/);
  });

  it("refuses by name when the submodule is not there", async () => {
    await withRenders();
    process.env[BLENDERKC_ROOT_ENV] = path.join(stand, "not-a-checkout");
    expect(hasToolCli(BLENDERKC, REPO_ROOT)).toBe(false);
    await expect(blenderkcIndexer.read(await fixture.context())).rejects.toThrow(
      /not-a-checkout\/tools\/cli\/blenderkc does not exist\. The blenderkc submodule is not initialised; run `git submodule update --init tools\/blenderkc`, or set BLENDERKC_ROOT to a checkout\./,
    );
    expect(missingToolCli(BLENDERKC, REPO_ROOT).message).toContain("BLENDERKC_ROOT");
  });

  it("says what the CLI said when it fails", async () => {
    await withRenders();
    const cli = path.join(stand, "tools", "cli", "blenderkc");
    await mkdir(path.dirname(cli), { recursive: true });
    await writeFile(cli, 'import sys\nsys.stderr.write("topics/x/topic.yml: bad yaml")\nsys.exit(2)\n');
    process.env[BLENDERKC_ROOT_ENV] = stand;
    await expect(blenderkcIndexer.read(await fixture.context({ blenderkcRoot: stand }))).rejects.toThrow(
      /`blenderkc topics --json` failed against .*\n {2}topics\/x\/topic\.yml: bad yaml/,
    );
  });

  it("resolves the checkout from BLENDERKC_ROOT, else the submodule", () => {
    delete process.env[BLENDERKC_ROOT_ENV];
    expect(resolveBlenderkcRoot("/srv/gnosia")).toBe(path.join("/srv/gnosia", "tools", "blenderkc"));
    expect(toolCliPath(BLENDERKC, "/srv/gnosia")).toBe(
      path.join("/srv/gnosia", "tools", "blenderkc", "tools", "cli", "blenderkc"),
    );
    process.env[BLENDERKC_ROOT_ENV] = "../elsewhere/blenderkc";
    expect(resolveBlenderkcRoot("/srv/gnosia")).toBe(path.resolve("/srv/gnosia", "../elsewhere/blenderkc"));
  });
});

describe("blenderkc in the source graph", () => {
  it("runs whenever the topics it files under might be pruned", () => {
    expect(withDependents(["topics"]).has("blenderkc")).toBe(true);
    expect(withDependents(["concepts"]).has("blenderkc")).toBe(true);
  });

  it("stays cheap on its own: it has no mirror ledger and nothing points at its rows", () => {
    expect([...selection(["blenderkc"])]).toEqual(["blenderkc"]);
  });
});
