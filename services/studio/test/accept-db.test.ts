import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { assetJob, blobObject, diagram, job } from "@self-learn/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "../../catalog/test/fixture-tree";
import { migratedScratchDatabase, probe, type Scratch } from "../../catalog/test/scratch-database";
import {
  absolute,
  candidatePath,
  candidateRef,
  candidateSvgPath,
  REPO_ROOT,
  targetPath,
  targetSvgPath,
} from "../src/paths";
import { NPM, run } from "../src/proc";
import type { JobRecord } from "../src/store";

/**
 * Accept through the real catalog CLI, on a scratch database that owns
 * diagrams (S13 of the phase 1 review, docs/CONTENT-MIGRATION.md).
 *
 * `accept.test.ts` pins the order and the refusals against a faked catalog, so
 * its "writes no file" could not fail: the fake `diagramPut` writes nothing
 * whatever the real one does. Here nothing about the catalog is faked. The job
 * is enqueued, claimed and finished with the studio's own calls, Accept runs
 * `catalog diagram put --job` and `catalog job accept` as subprocesses, and the
 * test reads the database and the sandbox tree afterwards. Only the canvas is
 * faked, since the export and the verify need a Chromium and are not what is
 * under test.
 *
 * The CLI subprocesses inherit `DATABASE_URL`, which is set to the scratch
 * database before anything runs and checked, so nothing here can reach the
 * owner's `self_learn`.
 */

const canvasMock = vi.hoisted(() => ({ canvas: vi.fn() }));
vi.mock("../src/canvas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/canvas")>();
  return { ...actual, canvas: canvasMock.canvas };
});

const reachable = await probe();
const SLUG = "studio-accept-db-fixture";
/** Named rather than minted, so the brief can carry the candidate the catalog derives from it. */
const JOB_ID = "studio-accept-db-job";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>accepted</title></svg>`;

function documentOf(): string {
  return JSON.stringify({
    tldrawFileFormatVersion: 1,
    schema: { schemaVersion: 2 },
    records: [
      { typeName: "shape", id: "shape:s0", type: "geo", x: 0, y: 0, props: { w: 100, h: 50 } },
      {
        typeName: "document",
        id: "document:document",
        gridSize: 10,
        name: "",
        meta: { tldrawkc: { kc: 1, topic: "alpha", title: "Accepted", concepts: ["base"] } },
      },
      { typeName: "page", id: "page:page", name: "Page 1", index: "a1", meta: {} },
    ],
  });
}

/** Every file under `dir`, with its sha256, symlinks included by what they point at. */
async function tree(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    const file = path.join(entry.parentPath, entry.name);
    if (!(await stat(file).then((s) => s.isFile(), () => false))) continue;
    out[path.relative(dir, file)] = createHash("sha256").update(await readFile(file)).digest("hex");
  }
  return out;
}

describe.skipIf(!reachable.ok)("Accept through the real catalog on a database that owns diagrams", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let home: string;
  let blobs: string;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const key of ["DATABASE_URL", "SELF_LEARN_HOME", "STUDIO_HOME", "MANIMKC_ROOT"]) saved[key] = process.env[key];
    scratch = await migratedScratchDatabase();
    process.env.DATABASE_URL = scratch.url;
    expect(new URL(scratch.url).pathname).not.toBe("/self_learn");
    home = await mkdtemp(path.join(tmpdir(), "studio-accept-db-"));
    blobs = await mkdtemp(path.join(tmpdir(), "studio-accept-db-blobs-"));
    process.env.STUDIO_HOME = home;
    process.env.SELF_LEARN_HOME = blobs;
    process.env.MANIMKC_ROOT = path.join(tmpdir(), "studio-accept-db-no-manimkc");

    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha", domain: "testing", concepts: ["base"], courses: ["xx1000-m1"] }]),
    );
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write(
      "content/courses/xx1000.yaml",
      [
        "id: xx1000", "slug: xx1000", "code: XX1000", "title: A test course", "credits: 4", "order: 1",
        "inferred: false", "tags: []", "modules:", "  - id: xx1000-m1", "    slug: m1",
        "    title: Module one", "    order: 1", "    topic: alpha", "    topics:", "      - id: xx1000-m1-t1",
        "        title: First item", "        subtopics: []", "    resources: []", "capstone: Build something", "",
      ].join("\n"),
    );
    await fixture.write("learn/concepts/testing/base.md", note({ id: "base", title: "Base" }));
    // Imported and flipped with the CLI too, as a person would on flip day.
    for (const args of [["import", fixture.root], ["flip", "diagrams"]]) {
      const done = await run(NPM, ["run", "--silent", "catalog", "--", ...args], { timeoutMs: 120_000 });
      expect(done.code, `catalog ${args.join(" ")}: ${done.stderr}`).toBe(0);
    }
  }, 120_000);

  afterAll(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await scratch?.drop();
    await fixture?.cleanup();
    for (const dir of [home, blobs]) if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  });

  it("lands a row and a blob, writes no file under the sandbox tree, and says it wrote none", async () => {
    const catalog = await import("../src/catalog");
    const { accept } = await import("../src/review");
    const { JobStore } = await import("../src/store");

    // The job, as the runner records it: enqueued, claimed, finished.
    const briefFile = path.join(home, "brief.json");
    await writeFile(
      briefFile,
      JSON.stringify({
        id: JOB_ID,
        kind: "diagram",
        topic: "alpha",
        target: targetPath(SLUG),
        // The form the runner sends and the catalog checks: the job's own
        // workspace, relative to STUDIO_HOME.
        candidate: candidateRef(JOB_ID, SLUG),
        idempotencyKey: "accept-db-key",
        brief: { intent: "i", topic: "alpha", slug: SLUG, title: "Accepted", mode: "new" },
      }),
    );
    const enqueued = await catalog.jobEnqueue(briefFile);
    expect(enqueued.error).toBeNull();
    const jobId = (enqueued.json as { job: { id: string } }).job.id;
    expect(jobId).toBe(JOB_ID);
    expect((await catalog.sessionStart({ id: "studio-accept-db", title: "Accepted" })).error).toBeNull();
    expect((await catalog.jobClaim(jobId, "test-runner", "studio-accept-db")).error).toBeNull();
    expect(
      (await catalog.jobFinish({
        jobId,
        state: "awaiting_review",
        phase: "ready",
        candidatePath: candidateRef(jobId, SLUG),
      })).error,
    ).toBeNull();
    const [queued] = await scratch.db.select().from(job).where(eq(job.id, jobId));
    expect(queued?.candidatePath).toBe(`jobs/${jobId}/candidate/${SLUG}.tldr`);

    // The candidates, where the agent writes them: the job's own workspace.
    await mkdir(path.dirname(candidatePath(jobId, SLUG)), { recursive: true });
    await writeFile(candidatePath(jobId, SLUG), documentOf(), "utf8");
    await writeFile(candidateSvgPath(jobId, SLUG), SVG, "utf8");
    const before = await tree(path.join(REPO_ROOT, "learn"));
    const fixtureBefore = await tree(fixture.root);

    const store = new JobStore();
    const record: JobRecord = {
      id: jobId,
      kind: "diagram",
      state: "awaiting_review",
      phase: "ready",
      brief: {
        intent: "i",
        topic: "alpha",
        slug: SLUG,
        title: "Accepted",
        mode: "new",
        elements: [{ label: "a" }],
        relations: [],
        concepts: [],
        model: "sonnet",
        idempotencyKey: "accept-db-key",
      },
      targetPath: targetPath(SLUG),
      targetSvgPath: targetSvgPath(SLUG),
      candidatePath: candidatePath(jobId, SLUG),
      candidateSvgPath: candidateSvgPath(jobId, SLUG),
      topic: "alpha",
      slug: SLUG,
      attempt: 1,
      sessionId: "studio-accept-db",
      agentSessionId: "00000000-0000-4000-8000-000000000000",
      parentJobId: null,
      changes: null,
      idempotencyKey: "accept-db-key",
      targetHashBefore: null,
      targetRevisionBefore: null,
      requestedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      reviewedAt: null,
      heartbeatAt: null,
      cancelRequestedAt: null,
      exitCode: 0,
      turns: 1,
      costUsd: 0,
      costSource: null,
      gate: {
        ok: true,
        steps: [],
        findings: [],
        shapes: 1,
        lints: 0,
        svg: { path: candidateSvgPath(jobId, SLUG), bytes: SVG.length },
        exportFailed: false,
        checkedAt: new Date().toISOString(),
      },
      errorKind: null,
      error: null,
      written: [],
      indexed: false,
      catalogErrors: [],
    };
    await store.create(record);
    canvasMock.canvas.mockResolvedValue({ code: 0, signal: null, stdout: "", stderr: "", json: { checks: [] }, timedOut: false });

    const result = await accept(store, record);
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    // Nothing was written into the tree, and the answer says so.
    expect(result.written).toEqual([]);
    expect(result.landed).toEqual([targetPath(SLUG), targetSvgPath(SLUG)]);
    expect(result.note).toMatch(/nothing to commit/);

    // The sandbox tree is exactly as it was: the candidates were never in it,
    // and Accept removed them from the job's workspace.
    expect(await tree(path.join(REPO_ROOT, "learn"))).toEqual(before);
    for (const file of [candidatePath(jobId, SLUG), candidateSvgPath(jobId, SLUG)]) {
      await expect(stat(file)).rejects.toThrow();
    }
    await expect(stat(absolute(targetPath(SLUG)))).rejects.toThrow();
    await expect(stat(absolute(targetSvgPath(SLUG)))).rejects.toThrow();
    // And the tree diagrams were imported from is untouched too.
    expect(await tree(fixture.root)).toEqual(fixtureBefore);

    // What landed is a row, a blob and the job's outputs.
    const [row] = await scratch.db.select().from(diagram).where(eq(diagram.slug, SLUG));
    expect(row?.topicSlug).toBe("alpha");
    const [blob] = await scratch.db.select().from(blobObject).where(eq(blobObject.key, row?.svgBlobKey ?? ""));
    expect(blob?.state).toBe("present");
    expect(await readFile(path.join(blobs, "blobs", blob?.key ?? ""), "utf8")).toBe(SVG);
    const outputs = await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, jobId));
    expect(outputs.map((o) => o.assetId).sort()).toEqual(
      [`diagram:${targetPath(SLUG)}`, `diagram:${targetSvgPath(SLUG)}`].sort(),
    );
    const [jobRow] = await scratch.db.select().from(job).where(eq(job.id, jobId));
    expect(jobRow?.state).toBe("accepted");
  }, 120_000);
});
