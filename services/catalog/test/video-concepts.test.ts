import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MANIMKC_ROOT_ENV, REMOTIONKC_ROOT_ENV, REVIDEOKC_ROOT_ENV } from "../src/env";
import { buildRows, manimkcIndexer } from "../src/index/manimkc";
import { buildRemotionkcRows, remotionkcIndexer } from "../src/index/remotionkc";
import { buildRevideokcRows, revideokcIndexer } from "../src/index/revideokc";
import type { Indexer } from "../src/index/source";
import type { TopicsReport, VideoToolName } from "../src/index/video-tool";
import { makeFixture, topicsYaml, type Fixture } from "./fixture-tree";

/**
 * A video names the concepts it teaches (phase 5 of
 * docs/proposals/module-learning-path.md, "Videos name their concepts").
 *
 * Each tool's topic.yml carries `concepts:`, and every one of the three CLIs
 * reports it on the topic entry. The indexer turns the list into
 * `asset_concept` rows for the video and for each sidecar beside it, the way
 * a diagram's concepts go on its SVG and its source. A slug the owner cannot
 * read refuses the run by folder and slug, collected so one run names every
 * one; a value that is not a list of slugs is refused the same way. Nothing
 * is skipped (AGENTS.md, "A catalog indexer must never `continue` past an
 * unresolved slug").
 *
 * All three tools, because the rows are built once, in `video-tool.ts`, and
 * what differs is how a folder finds its topic.
 */

const TOPIC = "the-topic";
const KNOWN = new Set(["alpha", "beta", "commons-concept"]);

let dataRoot: string;

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(tmpdir(), "catalog-video-concepts-"));
});

afterEach(async () => {
  await rm(dataRoot, { recursive: true, force: true });
});

/** One rendered topic folder as a CLI reports it: a video, and the sidecars named in `sidecars`. */
function entry(folder: string, concepts: unknown, sidecars: readonly string[] = ["transcript", "chapters", "vtt"]) {
  const base = `out/${folder}/${path.basename(folder)}`;
  return {
    path: folder,
    title: folder,
    topic: TOPIC,
    ...(concepts === undefined ? {} : { concepts }),
    out_dir: `out/${folder}`,
    sections: [
      {
        section: "narrated",
        output: `${path.basename(folder)}.mp4`,
        deliverable: {
          path: `${base}.mp4`,
          exists: true,
          sidecars: Object.fromEntries(
            ["transcript", "chapters", "vtt"].map((kind) => [
              kind,
              { path: `${base}.${kind === "vtt" ? "vtt" : `${kind}.json`}`, exists: sidecars.includes(kind) },
            ]),
          ),
        },
      },
    ],
  };
}

type Entry = ReturnType<typeof entry>;

/** Writes the files each entry's report says exist, under the data root. */
async function render(entries: readonly Entry[]): Promise<TopicsReport> {
  for (const topic of entries) {
    const deliverable = topic.sections[0]!.deliverable;
    const files = [deliverable.path, ...Object.values(deliverable.sidecars).filter((s) => s.exists).map((s) => s.path)];
    for (const file of files) {
      await mkdir(path.dirname(path.join(dataRoot, file)), { recursive: true });
      await writeFile(path.join(dataRoot, file), `${file} bytes`);
    }
  }
  return { outRoot: dataRoot, topics: [...entries], drift: { orphans: [], unrendered: [] } };
}

const BY_SLUG = new Map<string, unknown>([[TOPIC, {}]]);

/** Each tool's pure half, with every folder in the report filed under TOPIC. */
const TOOLS: Record<
  VideoToolName,
  (report: TopicsReport, knownConcepts?: ReadonlySet<string>) => ReturnType<typeof buildRows>
> = {
  manimkc: (report, knownConcepts) =>
    buildRows(
      report,
      dataRoot,
      new Map(report.topics.map((t) => [String(t.path), TOPIC])),
      BY_SLUG,
      knownConcepts === undefined ? {} : { knownConcepts },
    ),
  remotionkc: (report, knownConcepts) =>
    buildRemotionkcRows(report, dataRoot, BY_SLUG, knownConcepts === undefined ? {} : { knownConcepts }),
  revideokc: (report, knownConcepts) =>
    buildRevideokcRows(report, dataRoot, BY_SLUG, knownConcepts === undefined ? {} : { knownConcepts }),
};

describe.each(Object.keys(TOOLS) as VideoToolName[])("%s: a topic's concepts", (tool) => {
  const build = TOOLS[tool];
  const id = (folder: string, ext: string) => `${tool}:out/${folder}/${path.basename(folder)}${ext}`;

  it("links each concept to the video and to every sidecar beside it", async () => {
    const report = await render([entry("algo/witness", ["alpha", "beta"]), entry("algo/plain", undefined, ["transcript"])]);
    const { rows } = await build(report, KNOWN);

    const files = [".mp4", ".transcript.json", ".chapters.json", ".vtt"].map((ext) => id("algo/witness", ext));
    expect(rows.assetConcept).toEqual(
      files.flatMap((assetId) => [
        { assetId, conceptSlug: "alpha" },
        { assetId, conceptSlug: "beta" },
      ]),
    );
    // A folder with no `concepts:` field links nothing.
    expect(rows.assetConcept?.some((link) => link.assetId.includes("algo/plain"))).toBe(false);
  });

  it("writes no concept link for an empty list", async () => {
    const report = await render([entry("algo/empty", [])]);
    const { rows } = await build(report, KNOWN);
    expect(rows.assetConcept ?? []).toEqual([]);
    expect(rows.asset).toHaveLength(4);
  });

  it("links a slug listed twice once", async () => {
    const report = await render([entry("algo/twice", ["alpha", " alpha "], [])]);
    const { rows } = await build(report, KNOWN);
    expect(rows.assetConcept).toEqual([{ assetId: id("algo/twice", ".mp4"), conceptSlug: "alpha" }]);
  });

  it("refuses a concept the owner cannot read, naming the folder's topic.yml and the slug", async () => {
    const report = await render([entry("algo/witness", ["alpha", "no-such-concept"])]);
    await expect(build(report, KNOWN)).rejects.toThrow(
      new RegExp(
        `${tool} topic "algo/witness" names concept "no-such-concept" in topics/algo/witness/topic\\.yml, ` +
          `which is not a concept this owner can read`,
      ),
    );
  });

  it("refuses every bad folder in one run rather than indexing the rest", async () => {
    const report = await render([
      entry("algo/one", ["ghost-one"]),
      entry("algo/fine", ["alpha"]),
      entry("algo/two", ["beta", "ghost-two"]),
    ]);
    const refusal = build(report, KNOWN);
    await expect(refusal).rejects.toThrow(new RegExp(`${tool} topics \\(.*\\): 2 unresolved references`, "s"));
    await expect(refusal).rejects.toThrow(/"algo\/one" names concept "ghost-one".*"algo\/two" names concept "ghost-two"/s);
  });

  it("reports a bad concept beside a bad topic in the same folder", async () => {
    const report = await render([{ ...entry("algo/both", ["ghost"]), topic: "no-such-topic" }]);
    const refusal = build(report, KNOWN);
    await expect(refusal).rejects.toThrow(/2 unresolved references/);
    await expect(refusal).rejects.toThrow(/names concept "ghost"/);
  });

  it.each([
    ["a string", "alpha"],
    ["a mapping", { slug: "alpha" }],
    ["a list holding a number", ["alpha", 3]],
    ["a list holding a blank", ["alpha", "  "]],
    ["a list holding null", [null]],
  ])("refuses concepts that are %s, naming the folder", async (_, concepts) => {
    const report = await render([entry("algo/odd", concepts)]);
    await expect(build(report, KNOWN)).rejects.toThrow(
      /topic "algo\/odd" has `concepts:` .* in topics\/algo\/odd\/topic\.yml, which is not a list of concept slugs/,
    );
  });

  it("takes null as no list, as YAML writes an empty `concepts:`", async () => {
    const report = await render([entry("algo/null", null, [])]);
    const { rows } = await build(report, KNOWN);
    expect(rows.assetConcept ?? []).toEqual([]);
  });

  it("refuses a concept when it was told of none, rather than linking blind", async () => {
    const report = await render([entry("algo/witness", ["alpha"], [])]);
    await expect(build(report)).rejects.toThrow(/names concept "alpha"/);
  });
});

describe("each tool's source asks the run which concepts the owner can read", () => {
  let fixture: Fixture;
  const saved = Object.fromEntries(
    [MANIMKC_ROOT_ENV, REMOTIONKC_ROOT_ENV, REVIDEOKC_ROOT_ENV].map((key) => [key, process.env[key]]),
  );

  afterEach(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fixture?.cleanup();
  });

  /** A checkout whose CLI answers `topics --json` with `report`, in the tool's own language. */
  async function standIn(checkout: string, cli: string, report: TopicsReport): Promise<void> {
    const file = path.join(checkout, cli);
    await mkdir(path.dirname(file), { recursive: true });
    const json = JSON.stringify(JSON.stringify(report));
    await writeFile(
      file,
      cli.endsWith(".mjs")
        ? `process.stdout.write(${json});\n`
        : `#!/usr/bin/env python3\nimport sys\nsys.stdout.write(${json})\n`,
    );
    await chmod(file, 0o755);
  }

  it.each([
    ["manimkc", manimkcIndexer, MANIMKC_ROOT_ENV, "tools/cli/manimkc"],
    ["remotionkc", remotionkcIndexer, REMOTIONKC_ROOT_ENV, "tools/cli/remotionkc.mjs"],
    ["revideokc", revideokcIndexer, REVIDEOKC_ROOT_ENV, "tools/cli/revideokc.mjs"],
  ] as [VideoToolName, Indexer, string, string][])("%s", async (tool, indexer, rootEnv, cli) => {
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: TOPIC, manimkc: ["algo/witness"] }]));
    const checkout = path.join(fixture.root, tool);
    await standIn(checkout, cli, await render([entry("algo/witness", ["alpha"], [])]));
    process.env[rootEnv] = checkout;

    const context = await fixture.context({ manimkcRoot: checkout, knownConcepts: async () => new Set(["alpha"]) });
    const { rows } = await indexer.read(context);
    expect(rows.assetConcept).toEqual([{ assetId: `${tool}:out/algo/witness/witness.mp4`, conceptSlug: "alpha" }]);

    await expect(indexer.read({ ...context, knownConcepts: async () => new Set<string>() })).rejects.toThrow(
      /names concept "alpha"/,
    );
  });
});
