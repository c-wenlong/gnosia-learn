import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BLENDERKC_ROOT_ENV, REPO_ROOT } from "../src/env";
import { blenderkcIndexer } from "../src/index/blenderkc";
import { makeFixture, topicsYaml, type Fixture } from "./fixture-tree";

/**
 * The blenderkc CLI this repository actually pins, run for real, as
 * `revideokc-pinned.test.ts` does for revideokc.
 *
 * `blenderkc.test.ts` feeds the indexer a captured report and a stand-in
 * CLI, so a pointer bump that changed the report, or what the CLI needs
 * before it will start, would pass there and fail at the next `catalog
 * import`. This runs `tools/blenderkc/tools/cli/blenderkc` at whatever commit
 * the pointer names, with `python3` and nothing installed: no `.venv`, no
 * bpy, no gnosia-audio, which `topics` never imports.
 *
 * Two runs. The pinned checkout itself, with an empty data root: every topic
 * it holds today names a topic the owner has, nothing is rendered, and the
 * import must write nothing and refuse nothing (the state of the owner's Mac
 * until the HBM video is built). Then a scratch checkout with one rendered
 * topic, whose title holds quotes, which its YAML reader keeps whole.
 *
 * Skipped in a clone whose submodule is not initialised, as the other
 * real-CLI tests are; the gate on a pointer bump runs it.
 */

const PINNED = path.join(REPO_ROOT, "tools", "blenderkc");
const PINNED_CLI = path.join(PINNED, "tools", "cli", "blenderkc");
const TITLE = 'Why "HBM" is stacked';
const OUT = "out/demo/x/quoted";

let fixture: Fixture;
let scratch: string;
const saved = { root: process.env[BLENDERKC_ROOT_ENV], home: process.env.BLENDERKC_HOME };

beforeEach(async () => {
  fixture = await makeFixture();
  // Every catalog topic a topic.yml in the pinned checkout declares.
  await fixture.write("content/topics.yaml", topicsYaml([{ slug: "gpu-architecture" }, { slug: "cs3230-recurrences" }]));
  // Real path: the CLI reports its data root resolved, and macOS's temp
  // directory is a link (/var to /private/var).
  scratch = await realpath(await mkdtemp(path.join(tmpdir(), "catalog-blenderkc-pinned-")));
});

afterEach(async () => {
  for (const [name, value] of [
    [BLENDERKC_ROOT_ENV, saved.root],
    ["BLENDERKC_HOME", saved.home],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(scratch, { recursive: true, force: true });
  await fixture?.cleanup();
});

describe.skipIf(!existsSync(PINNED_CLI))("the pinned blenderkc CLI", () => {
  it("reads the pinned checkout's own topics, and with nothing rendered imports nothing and refuses nothing", async () => {
    const home = path.join(scratch, "empty-home");
    await mkdir(home, { recursive: true });
    process.env[BLENDERKC_ROOT_ENV] = PINNED;
    process.env.BLENDERKC_HOME = home;

    const { rows, metadata, notes, report } = await blenderkcIndexer.read(await fixture.context({ blenderkcRoot: PINNED }));
    expect(metadata).toEqual({ outRoot: home });
    expect(rows.asset).toEqual([]);
    const topics = report?.topics.map((topic) => String(topic.path)) ?? [];
    expect(topics).toContain("computer-architecture/gpu-architecture/hbm-how-it-is-built");
    expect(notes).toContain(`${topics.length} topic folders, 0 videos, 0 sidecars`);
  });

  it("answers topics --json with no venv, and the catalog indexes a render", async () => {
    // A checkout: the CLI refuses a --root without its own tools/cli, and one topic.
    const checkout = path.join(scratch, "checkout");
    const topic = path.join(checkout, "topics", "demo", "x", "quoted");
    await cp(path.join(PINNED, "tools", "cli"), path.join(checkout, "tools", "cli"), { recursive: true });
    await mkdir(path.join(topic, "shots"), { recursive: true });
    await writeFile(
      path.join(topic, "topic.yml"),
      [`title: ${JSON.stringify(TITLE)}`, "topic: cs3230-recurrences", "prefix: QT", "narrated:", "  shots: shots/", "  output: quoted.mp4", ""].join("\n"),
    );
    await writeFile(path.join(topic, "shots", "QT1_Intro.py"), "def build(shot):\n    pass\n");
    await writeFile(path.join(topic, "narration.json"), JSON.stringify([{ scene: "QT1_Intro", title: "Intro", lines: ["One line."] }]));

    // Its renders, in a data root of its own. Placeholder bytes: the indexer
    // hashes whatever is there and the CLI reports a duration it cannot probe as null.
    const home = path.join(scratch, "home");
    await mkdir(path.join(home, OUT), { recursive: true });
    for (const file of ["quoted.mp4", "quoted.transcript.json", "quoted.chapters.json", "quoted.vtt"]) {
      await writeFile(path.join(home, OUT, file), `placeholder ${file}\n`);
    }

    process.env[BLENDERKC_ROOT_ENV] = PINNED;
    process.env.BLENDERKC_HOME = home;
    const { rows, metadata } = await blenderkcIndexer.read(await fixture.context({ blenderkcRoot: checkout }));

    expect(metadata).toEqual({ outRoot: home });
    const assets = rows.asset ?? [];
    const video = assets.find((a) => a.kind === "video");
    expect(video).toMatchObject({ id: `blenderkc:${OUT}/quoted.mp4`, title: `${TITLE} (narrated)`, sourceRepo: "blenderkc" });
    expect(assets.map((a) => a.kind).sort()).toEqual(["captions", "chapters", "transcript", "video"]);
    expect(rows.assetTopic?.map((t) => t.topicSlug)).toEqual(Array(4).fill("cs3230-recurrences"));
    expect(rows.assetDerivation).toHaveLength(3);
  });
});
