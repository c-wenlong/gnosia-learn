import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { asset, assetConcept, COMMONS_OWNER, concept, contentRevision, topic } from "@self-learn/schema";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runImportCommand } from "../src/commands/index-command";
import { ensureLearner } from "../src/state";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { SEED } from "./seed";

/**
 * A video's concepts end to end on a scratch database: `catalog import` of
 * the seed, then the remotionkc source through a stand-in CLI whose topic
 * entries carry `concepts:`. The links land on the video and its sidecars, an
 * unchanged report writes no revision, a concept dropped from a topic.yml is
 * pruned on the next run, and a slug nobody holds, or another owner's,
 * refuses the run and leaves every row as it was. The commons' concepts are
 * readable, so a video may name one.
 *
 * remotionkc stands for all three tools here: the rows are built once, in
 * `video-tool.ts`, and `video-concepts.test.ts` holds each tool's source to
 * asking the run for the concepts its owner can read.
 */

const reachable = await probe();

const LOOPS = "out/agents/loops/loops";
const MEMORY = "out/agents/memory/memory";

describe.skipIf(!reachable.ok)("a video's concepts through catalog import", () => {
  let scratch: Scratch;
  let work: string;
  let checkout: string;
  let dataRoot: string;
  const keys = ["DATABASE_URL", "MANIMKC_ROOT", "REMOTIONKC_ROOT"] as const;
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  /** One topic folder as the CLI reports it, rendered, with its sidecars. */
  const folder = (name: string, declared: string, concepts: unknown, sidecars: string[]) => ({
    path: `agents/${name}`,
    title: `The ${name} video`,
    topic: declared,
    concepts,
    out_dir: `out/agents/${name}`,
    sections: [
      {
        section: "narrated",
        output: `${name}.mp4`,
        deliverable: {
          path: `out/agents/${name}/${name}.mp4`,
          exists: true,
          sidecars: Object.fromEntries(
            ["transcript", "chapters", "vtt"].map((kind) => [
              kind,
              { path: `out/agents/${name}/${name}.${kind === "vtt" ? "vtt" : `${kind}.json`}`, exists: sidecars.includes(kind) },
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

  const loops = (concepts: unknown) =>
    folder("loops", "agent-tool-use-and-reasoning-loops", concepts, ["transcript", "chapters", "vtt"]);
  const memory = (concepts: unknown) => folder("memory", "agent-memory-and-state", concepts, []);

  const links = async () =>
    (await scratch.db.select().from(assetConcept).where(like(assetConcept.assetId, "remotionkc:%")))
      .map((row) => `${row.assetId} ${row.conceptSlug}`)
      .sort();
  const rows = () => scratch.db.select().from(asset).where(like(asset.id, "remotionkc:%")).orderBy(asset.id);
  const importRemotionkc = async () => {
    const result = await runImportCommand({ dir: SEED, only: ["remotionkc"] });
    return result.sources.find((s) => s.source === "remotionkc");
  };

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    work = await mkdtemp(path.join(tmpdir(), "catalog-video-concepts-"));
    checkout = path.join(work, "remotionkc");
    dataRoot = path.join(work, "remotionkc-home");
    await render(`${LOOPS}.mp4`, "loops render");
    await render(`${LOOPS}.transcript.json`, '{"video":"loops.mp4","chapters":[],"segments":[]}');
    await render(`${LOOPS}.chapters.json`, "[]");
    await render(`${LOOPS}.vtt`, "WEBVTT\n");
    await render(`${MEMORY}.mp4`, "memory render");
    await answer([loops(["react-loop", "tool-calling"]), memory([])]);
    process.env["DATABASE_URL"] = scratch.url;
    process.env["MANIMKC_ROOT"] = path.join(work, "no-manimkc");
    process.env["REMOTIONKC_ROOT"] = checkout;
    await runImportCommand({ dir: SEED });
  }, 60_000);

  afterAll(async () => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await scratch?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  it("links the video and each of its sidecars to every concept its topic.yml names", async () => {
    const files = [".chapters.json", ".mp4", ".transcript.json", ".vtt"].map((ext) => `remotionkc:${LOOPS}${ext}`);
    expect(await links()).toEqual(files.flatMap((id) => [`${id} react-loop`, `${id} tool-calling`]));
  });

  it("writes no revision when the report has not changed", async () => {
    const write = await importRemotionkc();
    expect(write?.revisions).toEqual({});
    expect(write?.deletedKeys ?? []).toEqual([]);
  });

  it("prunes a concept a topic.yml dropped, and records the asset's new state", async () => {
    await answer([loops(["react-loop"]), memory([])]);
    const write = await importRemotionkc();
    const files = [".chapters.json", ".mp4", ".transcript.json", ".vtt"].map((ext) => `remotionkc:${LOOPS}${ext}`);
    expect(await links()).toEqual(files.map((id) => `${id} react-loop`));
    // Each of the four assets' snapshot changed (its links are part of it).
    expect(write?.revisions).toEqual({ asset: 4 });
    const [latest] = await scratch.db
      .select()
      .from(contentRevision)
      .where(and(eq(contentRevision.entityType, "asset"), eq(contentRevision.entityId, `remotionkc:${LOOPS}.mp4`)))
      .orderBy(contentRevision.id)
      .then((all) => all.slice(-1));
    expect(JSON.stringify(latest?.snapshot)).toContain("react-loop");
    expect(JSON.stringify(latest?.snapshot)).not.toContain("tool-calling");
  });

  it("refuses a slug nobody holds, by folder and slug, and leaves every row as it was", async () => {
    const assetsBefore = await rows();
    const linksBefore = await links();
    await answer([loops(["react-loop", "no-such-concept"]), memory(["also-missing"])]);
    const refusal = importRemotionkc();
    await expect(refusal).rejects.toThrow(/2 unresolved references/);
    await expect(refusal).rejects.toThrow(
      /remotionkc topic "agents\/loops" names concept "no-such-concept" in topics\/agents\/loops\/topic\.yml.*"agents\/memory" names concept "also-missing"/s,
    );
    expect(await rows()).toEqual(assetsBefore);
    expect(await links()).toEqual(linksBefore);
  });

  it("refuses another owner's concept and accepts the commons'", async () => {
    await ensureLearner(scratch.db, "other");
    await ensureLearner(scratch.db, COMMONS_OWNER);
    await scratch.db.insert(topic).values([
      { slug: "zq-theirs", title: "Theirs", domain: "one", ownerId: "other" },
      { slug: "zq-shared", title: "Shared", domain: "one", ownerId: COMMONS_OWNER },
    ]);
    await scratch.db.insert(concept).values([
      { slug: "zq-their-concept", title: "Theirs", topicSlug: "zq-theirs", path: "learn/concepts/x/zq-their-concept.md", body: "#\n", ownerId: "other" },
      { slug: "zq-shared-concept", title: "Shared", topicSlug: "zq-shared", path: "learn/concepts/x/zq-shared-concept.md", body: "#\n", ownerId: COMMONS_OWNER },
    ]);

    const linksBefore = await links();
    await answer([loops(["react-loop", "zq-their-concept"]), memory([])]);
    await expect(importRemotionkc()).rejects.toThrow(/names concept "zq-their-concept".*not a concept this owner can read/s);
    expect(await links()).toEqual(linksBefore);

    await answer([loops(["react-loop"]), memory(["zq-shared-concept"])]);
    await importRemotionkc();
    expect(await links()).toContain(`remotionkc:${MEMORY}.mp4 zq-shared-concept`);
  });

  it("drops every link when the list goes empty", async () => {
    await answer([loops([]), memory([])]);
    await importRemotionkc();
    expect(await links()).toEqual([]);
  });
});
