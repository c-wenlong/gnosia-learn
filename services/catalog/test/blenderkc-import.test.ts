import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { asset, assetDerivation, assetTopic, blobObject, indexRun } from "@self-learn/schema";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runImportCommand } from "../src/commands/index-command";
import { posterId, uploadAssets } from "../src/content/asset-upload";
import { openBlobStore } from "../src/content/blob";
import { cliScope } from "../src/content/scope";
import { listVideos } from "../src/content/videos";
import { REPO_ROOT } from "../src/env";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { SEED } from "./seed";

/**
 * blenderkc end to end on a scratch database, as `blenderkc-import.test.ts`
 * runs blenderkc: `catalog import` of the seed runs the blenderkc source
 * through a stand-in CLI (Python, as the real one is), the files go into the
 * blob store before their rows, the run records its data root, `catalog
 * asset upload --source blenderkc` finds them present with their posters,
 * `catalog video list` names them as blenderkc renders, a folder naming a
 * topic nobody has refuses the run with the rows left as they were, and a
 * render the report stops listing is pruned.
 */

const reachable = await probe();

const VIDEO = "out/agents/loops/loops.mp4";
const SECOND = "out/agents/memory/memory.mp4";

describe.skipIf(!reachable.ok)("blenderkc through catalog import", () => {
  let scratch: Scratch;
  let work: string;
  let checkout: string;
  let dataRoot: string;
  let ffmpeg: string;
  const keys = ["DATABASE_URL", "MANIMKC_ROOT", "BLENDERKC_ROOT"] as const;
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  /** One topic folder as the CLI reports it, rendered, with its sidecars. */
  const topic = (folder: string, name: string, declared: string | null, sidecars: string[]) => ({
    path: `agents/${folder}`,
    title: `The ${folder} video`,
    topic: declared,
    concepts: [],
    tags: [],
    prerequisites: [],
    materials: [],
    prefix: "AG",
    out_dir: `out/agents/${folder}`,
    sections: [
      {
        section: "narrated",
        files: [{ file: "shots/AG1_Intro.py", scenes: ["AG1_Intro"] }],
        output: `${name}.mp4`,
        deliverable: {
          path: `out/agents/${folder}/${name}.mp4`,
          exists: true,
          duration: null,
          sidecars: Object.fromEntries(
            ["transcript", "chapters", "vtt"].map((kind) => [
              kind,
              {
                path: `out/agents/${folder}/${name}.${kind === "vtt" ? "vtt" : `${kind}.json`}`,
                exists: sidecars.includes(kind),
              },
            ]),
          ),
        },
      },
    ],
  });

  /** Rewrites the stand-in CLI to answer with these topic folders. */
  async function answer(topics: unknown[]): Promise<void> {
    const cli = path.join(checkout, "tools", "cli", "blenderkc");
    await mkdir(path.dirname(cli), { recursive: true });
    const report = { outRoot: dataRoot, topics, drift: { orphans: [], unrendered: [] } };
    await writeFile(cli, `import sys\nsys.stdout.write(${JSON.stringify(JSON.stringify(report))})\n`);
  }

  async function render(file: string, body: string): Promise<void> {
    await mkdir(path.dirname(path.join(dataRoot, file)), { recursive: true });
    await writeFile(path.join(dataRoot, file), body);
  }

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    work = await mkdtemp(path.join(tmpdir(), "catalog-blenderkc-"));
    checkout = path.join(work, "blenderkc");
    dataRoot = path.join(work, "blenderkc-home");
    await render(VIDEO, "loops render");
    await render("out/agents/loops/loops.transcript.json", '{"video":"loops.mp4","chapters":[],"segments":[]}');
    await render("out/agents/loops/loops.chapters.json", "[]");
    await render("out/agents/loops/loops.vtt", "WEBVTT\n");
    await render(SECOND, "memory render");
    await answer([
      topic("loops", "loops", "agent-tool-use-and-reasoning-loops", ["transcript", "chapters", "vtt"]),
      topic("memory", "memory", "agent-memory-and-state", []),
    ]);
    ffmpeg = path.join(work, "ffmpeg");
    await writeFile(ffmpeg, `#!/bin/sh\nwhile [ $# -gt 0 ]; do if [ "$1" = "-i" ]; then f="$2"; fi; shift; done\nshasum -a 256 "$f" | cut -c1-16\n`);
    await chmod(ffmpeg, 0o755);
    process.env["DATABASE_URL"] = scratch.url;
    process.env["MANIMKC_ROOT"] = path.join(work, "no-manimkc");
    process.env["BLENDERKC_ROOT"] = checkout;
  }, 60_000);

  afterAll(async () => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await scratch?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  const blenderkcRows = () => scratch.db.select().from(asset).where(like(asset.id, "blenderkc:%")).orderBy(asset.id);

  it("imports the renders, each stored before its row, filed under its declared topic", async () => {
    const result = await runImportCommand({ dir: SEED });
    expect(result.blenderkcRoot).toBe(checkout);
    expect(result.sources.map((s) => s.source)).toContain("blenderkc");
    // remotionkc's and revideokc's roots are nothing in the suites
    // (vitest.setup.ts), so they are skipped beside manimkc's two.
    expect(result.skipped.map((s) => s.source)).toEqual(["manimkc", "remotionkc", "revideokc", "mirrors"]);

    const rows = await blenderkcRows();
    expect(rows.map((r) => [r.id, r.kind, r.sourceRepo])).toEqual([
      [`blenderkc:out/agents/loops/loops.chapters.json`, "chapters", "blenderkc"],
      [`blenderkc:${VIDEO}`, "video", "blenderkc"],
      [`blenderkc:out/agents/loops/loops.transcript.json`, "transcript", "blenderkc"],
      [`blenderkc:out/agents/loops/loops.vtt`, "captions", "blenderkc"],
      [`blenderkc:${SECOND}`, "video", "blenderkc"],
    ]);
    for (const row of rows) {
      expect(row.blobKey, row.id).toMatch(/^local\/[0-9a-f]{64}\.(mp4|json|vtt)$/);
      const [blob] = await scratch.db.select().from(blobObject).where(eq(blobObject.key, row.blobKey ?? ""));
      expect(blob?.state, row.id).toBe("present");
    }
    const topics = await scratch.db.select().from(assetTopic).where(like(assetTopic.assetId, "blenderkc:%"));
    expect(new Map(topics.map((t) => [t.assetId, t.topicSlug])).get(`blenderkc:${SECOND}`)).toBe("agent-memory-and-state");
    expect(topics.filter((t) => t.topicSlug === "agent-tool-use-and-reasoning-loops")).toHaveLength(4);
    const derived = await scratch.db.select().from(assetDerivation).where(eq(assetDerivation.sourceAssetId, `blenderkc:${VIDEO}`));
    // The three sidecars, and the poster the import cut (2026-10-05).
    expect(derived.map((d) => d.assetId)).toContain(posterId(`blenderkc:${VIDEO}`));
    expect(derived).toHaveLength(4);
    const secondPoster = await scratch.db.select().from(assetDerivation).where(eq(assetDerivation.sourceAssetId, `blenderkc:${SECOND}`));
    expect(secondPoster.map((d) => d.assetId)).toEqual([posterId(`blenderkc:${SECOND}`)]);
  });

  it("records the run's data root, which is where out/… resolves, and the checkout it read", async () => {
    const [run] = await scratch.db.select().from(indexRun).where(eq(indexRun.source, "blenderkc"));
    expect(run?.metadata).toEqual({ outRoot: dataRoot });
    expect(run?.sourceRoot).toBe(checkout);
  });

  it("leaves asset upload --source blenderkc nothing to do, posters included", async () => {
    const upload = () =>
      uploadAssets(scratch.db, { store: openBlobStore(), source: "blenderkc", repoRoot: REPO_ROOT, ffmpeg });
    const first = await upload();
    expect(first.source).toBe("blenderkc");
    expect(first.outRoot).toBe(dataRoot);
    expect(first.refused).toBe(0);
    expect(first.items.map((i) => [i.id, i.action])).toEqual([
      [`blenderkc:${VIDEO}`, "present"],
      ["blenderkc:out/agents/loops/loops.transcript.json", "present"],
      ["blenderkc:out/agents/loops/loops.chapters.json", "present"],
      ["blenderkc:out/agents/loops/loops.vtt", "present"],
      [posterId(`blenderkc:${VIDEO}`), "present"],
      [`blenderkc:${SECOND}`, "present"],
      [posterId(`blenderkc:${SECOND}`), "present"],
    ]);
    // The import cut both posters, so neither run writes a row.
    expect(first.rowsWritten).toBe(0);
    expect((await upload()).rowsWritten).toBe(0);
  });

  it("lists them as blenderkc renders beside the studio's videos", async () => {
    const videos = await listVideos(scratch.db, cliScope());
    expect(videos.map((v) => [v.origin, v.assetId, v.topic, v.narrated])).toEqual([
      ["blenderkc", `blenderkc:${VIDEO}`, "agent-tool-use-and-reasoning-loops", true],
      ["blenderkc", `blenderkc:${SECOND}`, "agent-memory-and-state", false],
    ]);
    expect(videos[0]?.poster?.assetId).toBe(posterId(`blenderkc:${VIDEO}`));
  });

  it("refuses a folder whose topic nobody holds, and leaves every row as it was", async () => {
    const before = await blenderkcRows();
    await answer([
      topic("loops", "loops", "agent-tool-use-and-reasoning-loops", ["transcript", "chapters", "vtt"]),
      topic("memory", "memory", "no-such-topic", []),
    ]);
    await expect(runImportCommand({ dir: SEED, only: ["blenderkc"] })).rejects.toThrow(
      /blenderkc topic "agents\/memory" declares topic "no-such-topic" in topics\/agents\/memory\/topic\.yml, which is not a topic this owner can read/,
    );
    expect(await blenderkcRows()).toEqual(before);
  });

  it("prunes a render the report no longer lists, and only its own namespace", async () => {
    await answer([topic("loops", "loops", "agent-tool-use-and-reasoning-loops", ["transcript", "chapters", "vtt"])]);
    const result = await runImportCommand({ dir: SEED, only: ["blenderkc"] });
    const write = result.sources.find((s) => s.source === "blenderkc");
    expect(write?.deletedKeys).toContain(`asset blenderkc:${SECOND}`);
    expect((await blenderkcRows()).map((r) => r.id)).not.toContain(`blenderkc:${SECOND}`);
    // The poster lives outside the namespace, as manimkc's do, so no import prunes it.
    const [poster] = await scratch.db.select().from(asset).where(eq(asset.id, posterId(`blenderkc:${VIDEO}`)));
    expect(poster?.sourceRepo).toBe("self-learn");
  });
});
