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
 * remotionkc end to end on a scratch database: `catalog import` of the seed
 * runs the remotionkc source through a stand-in CLI, the files go into the
 * blob store before their rows (the contract is in force on a migrated
 * database), the run records its data root, `catalog asset upload --source
 * remotionkc` finds them present and cuts the posters, `catalog video list`
 * names them as remotionkc renders, and a folder naming a topic nobody has
 * refuses the run with the rows left as they were.
 */

const reachable = await probe();

const VIDEO = "out/agents/loops/loops.mp4";
const SECOND = "out/agents/memory/memory.mp4";

describe.skipIf(!reachable.ok)("remotionkc through catalog import", () => {
  let scratch: Scratch;
  let work: string;
  let checkout: string;
  let dataRoot: string;
  let ffmpeg: string;
  const keys = ["DATABASE_URL", "MANIMKC_ROOT", "REMOTIONKC_ROOT"] as const;
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
        files: [{ file: "composition.tsx", scenes: ["S1_Intro"] }],
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
    const cli = path.join(checkout, "tools", "cli", "remotionkc.mjs");
    await mkdir(path.dirname(cli), { recursive: true });
    const report = { outRoot: dataRoot, topics, drift: { orphans: [], unrendered: [] } };
    await writeFile(cli, `process.stdout.write(${JSON.stringify(JSON.stringify(report))});\n`);
  }

  async function render(file: string, body: string): Promise<void> {
    await mkdir(path.dirname(path.join(dataRoot, file)), { recursive: true });
    await writeFile(path.join(dataRoot, file), body);
  }

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    work = await mkdtemp(path.join(tmpdir(), "catalog-remotionkc-"));
    checkout = path.join(work, "remotionkc");
    dataRoot = path.join(work, "remotionkc-home");
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
    process.env["REMOTIONKC_ROOT"] = checkout;
  }, 60_000);

  afterAll(async () => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await scratch?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  const remotionkcRows = () => scratch.db.select().from(asset).where(like(asset.id, "remotionkc:%")).orderBy(asset.id);

  it("imports the renders, each stored before its row, filed under its declared topic", async () => {
    const result = await runImportCommand({ dir: SEED });
    expect(result.remotionkcRoot).toBe(checkout);
    expect(result.sources.map((s) => s.source)).toContain("remotionkc");
    // revideokc's root is nothing in the suites (vitest.setup.ts), so it is
    // skipped beside manimkc's two.
    expect(result.skipped.map((s) => s.source)).toEqual(["manimkc", "revideokc", "mirrors"]);

    const rows = await remotionkcRows();
    expect(rows.map((r) => [r.id, r.kind, r.sourceRepo])).toEqual([
      [`remotionkc:out/agents/loops/loops.chapters.json`, "chapters", "remotionkc"],
      [`remotionkc:${VIDEO}`, "video", "remotionkc"],
      [`remotionkc:out/agents/loops/loops.transcript.json`, "transcript", "remotionkc"],
      [`remotionkc:out/agents/loops/loops.vtt`, "captions", "remotionkc"],
      [`remotionkc:${SECOND}`, "video", "remotionkc"],
    ]);
    for (const row of rows) {
      expect(row.blobKey, row.id).toMatch(/^local\/[0-9a-f]{64}\.(mp4|json|vtt)$/);
      const [blob] = await scratch.db.select().from(blobObject).where(eq(blobObject.key, row.blobKey ?? ""));
      expect(blob?.state, row.id).toBe("present");
    }
    const topics = await scratch.db.select().from(assetTopic).where(like(assetTopic.assetId, "remotionkc:%"));
    expect(new Map(topics.map((t) => [t.assetId, t.topicSlug])).get(`remotionkc:${SECOND}`)).toBe("agent-memory-and-state");
    expect(topics.filter((t) => t.topicSlug === "agent-tool-use-and-reasoning-loops")).toHaveLength(4);
    const derived = await scratch.db.select().from(assetDerivation).where(eq(assetDerivation.sourceAssetId, `remotionkc:${VIDEO}`));
    expect(derived).toHaveLength(3);
  });

  it("records the run's data root, which is where out/… resolves, and the checkout it read", async () => {
    const [run] = await scratch.db.select().from(indexRun).where(eq(indexRun.source, "remotionkc"));
    expect(run?.metadata).toEqual({ outRoot: dataRoot });
    expect(run?.sourceRoot).toBe(checkout);
  });

  it("leaves asset upload --source remotionkc only the posters to cut", async () => {
    const upload = () =>
      uploadAssets(scratch.db, { store: openBlobStore(), source: "remotionkc", repoRoot: REPO_ROOT, ffmpeg });
    const first = await upload();
    expect(first.source).toBe("remotionkc");
    expect(first.outRoot).toBe(dataRoot);
    expect(first.refused).toBe(0);
    expect(first.items.map((i) => [i.id, i.action])).toEqual([
      [`remotionkc:${VIDEO}`, "present"],
      ["remotionkc:out/agents/loops/loops.transcript.json", "present"],
      ["remotionkc:out/agents/loops/loops.chapters.json", "present"],
      ["remotionkc:out/agents/loops/loops.vtt", "present"],
      [posterId(`remotionkc:${VIDEO}`), "made"],
      [`remotionkc:${SECOND}`, "present"],
      [posterId(`remotionkc:${SECOND}`), "made"],
    ]);
    // Idempotent: the second run finds everything where the first left it.
    expect((await upload()).rowsWritten).toBe(0);
  });

  it("lists them as remotionkc renders beside the studio's videos", async () => {
    const videos = await listVideos(scratch.db, cliScope());
    expect(videos.map((v) => [v.origin, v.assetId, v.topic, v.narrated])).toEqual([
      ["remotionkc", `remotionkc:${VIDEO}`, "agent-tool-use-and-reasoning-loops", true],
      ["remotionkc", `remotionkc:${SECOND}`, "agent-memory-and-state", false],
    ]);
    expect(videos[0]?.poster?.assetId).toBe(posterId(`remotionkc:${VIDEO}`));
  });

  it("refuses a folder whose topic nobody holds, and leaves every row as it was", async () => {
    const before = await remotionkcRows();
    await answer([
      topic("loops", "loops", "agent-tool-use-and-reasoning-loops", ["transcript", "chapters", "vtt"]),
      topic("memory", "memory", "no-such-topic", []),
    ]);
    await expect(runImportCommand({ dir: SEED, only: ["remotionkc"] })).rejects.toThrow(
      /remotionkc topic "agents\/memory" declares topic "no-such-topic" in topics\/agents\/memory\/topic\.yml, which is not a topic this owner can read/,
    );
    expect(await remotionkcRows()).toEqual(before);
  });

  it("prunes a render the report no longer lists, and only its own namespace", async () => {
    await answer([topic("loops", "loops", "agent-tool-use-and-reasoning-loops", ["transcript", "chapters", "vtt"])]);
    const result = await runImportCommand({ dir: SEED, only: ["remotionkc"] });
    const write = result.sources.find((s) => s.source === "remotionkc");
    expect(write?.deletedKeys).toContain(`asset remotionkc:${SECOND}`);
    expect((await remotionkcRows()).map((r) => r.id)).not.toContain(`remotionkc:${SECOND}`);
    // The poster lives outside the namespace, as manimkc's do, so no import prunes it.
    const [poster] = await scratch.db.select().from(asset).where(eq(asset.id, posterId(`remotionkc:${VIDEO}`)));
    expect(poster?.sourceRepo).toBe("self-learn");
  });
});
