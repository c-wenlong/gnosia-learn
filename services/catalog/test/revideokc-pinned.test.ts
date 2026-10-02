import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { REVIDEOKC_ROOT_ENV, REPO_ROOT } from "../src/env";
import { revideokcIndexer } from "../src/index/revideokc";
import { makeFixture, topicsYaml, type Fixture } from "./fixture-tree";

/**
 * The revideokc CLI this repository actually pins, run for real, as
 * `remotionkc-pinned.test.ts` does for remotionkc.
 *
 * `revideokc.test.ts` feeds the indexer a captured report and a stand-in
 * CLI, so a pointer bump that changed the report, or what the CLI needs
 * before it will start, would pass there and fail at the next `catalog
 * import`. This runs `tools/revideokc/tools/cli/revideokc.mjs` at whatever
 * commit the pointer names, against a scratch checkout and data root, with
 * nothing installed but node: since revideokc#5 its narration needs
 * gnosia-audio in its own `.venv`, and the catalog must still read the report
 * on a machine that never ran `npm run narration-deps`. The title holds
 * quotes, which its YAML reader keeps whole.
 *
 * Skipped in a clone whose submodule is not initialised, as the other
 * real-CLI tests are; the gate on a pointer bump runs it.
 */

const PINNED = path.join(REPO_ROOT, "tools", "revideokc");
const PINNED_CLI = path.join(PINNED, "tools", "cli", "revideokc.mjs");
const TITLE = 'Why "cache" matters';
const OUT = "out/demo/x/quoted";

let fixture: Fixture;
let scratch: string;
const saved = { root: process.env[REVIDEOKC_ROOT_ENV], home: process.env.REVIDEOKC_HOME };

beforeEach(async () => {
  fixture = await makeFixture();
  await fixture.write("content/topics.yaml", topicsYaml([{ slug: "cs3230-recurrences" }]));
  scratch = await mkdtemp(path.join(tmpdir(), "catalog-revideokc-pinned-"));
});

afterEach(async () => {
  for (const [name, value] of [
    [REVIDEOKC_ROOT_ENV, saved.root],
    ["REVIDEOKC_HOME", saved.home],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(scratch, { recursive: true, force: true });
  await fixture?.cleanup();
});

describe.skipIf(!existsSync(PINNED_CLI))("the pinned revideokc CLI", () => {
  it("answers topics --json with no narration install, and the catalog indexes it", async () => {
    // A checkout: the CLI refuses a --root without its own tools/cli, and one topic.
    const checkout = path.join(scratch, "checkout");
    const topic = path.join(checkout, "topics", "demo", "x", "quoted");
    await cp(path.join(PINNED, "tools", "cli"), path.join(checkout, "tools", "cli"), { recursive: true });
    await mkdir(topic, { recursive: true });
    await writeFile(
      path.join(topic, "topic.yml"),
      [`title: ${JSON.stringify(TITLE)}`, "topic: cs3230-recurrences", "narrated:", "  scene: scene.tsx", "  output: quoted.mp4", ""].join("\n"),
    );
    await writeFile(path.join(topic, "scene.tsx"), "export {};\n");
    await writeFile(path.join(topic, "narration.json"), JSON.stringify([{ scene: "QT1_Intro", title: "Intro", lines: ["One line."] }]));

    // Its renders, in a data root of its own. Placeholder bytes: the indexer
    // hashes whatever is there and the CLI reports a duration it cannot probe as null.
    const home = path.join(scratch, "home");
    await mkdir(path.join(home, OUT), { recursive: true });
    for (const file of ["quoted.mp4", "quoted.transcript.json", "quoted.chapters.json", "quoted.vtt"]) {
      await writeFile(path.join(home, OUT, file), `placeholder ${file}\n`);
    }

    process.env[REVIDEOKC_ROOT_ENV] = PINNED;
    process.env.REVIDEOKC_HOME = home;
    const { rows, metadata } = await revideokcIndexer.read(await fixture.context({ revideokcRoot: checkout }));

    expect(metadata).toEqual({ outRoot: home });
    const assets = rows.asset ?? [];
    const video = assets.find((a) => a.kind === "video");
    expect(video).toMatchObject({ id: `revideokc:${OUT}/quoted.mp4`, title: `${TITLE} (narrated)`, sourceRepo: "revideokc" });
    expect(assets.map((a) => a.kind).sort()).toEqual(["captions", "chapters", "transcript", "video"]);
    expect(rows.assetTopic?.map((t) => t.topicSlug)).toEqual(Array(4).fill("cs3230-recurrences"));
    expect(rows.assetDerivation).toHaveLength(3);
  });
});
