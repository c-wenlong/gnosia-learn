import { mkdir, rm, utimes, writeFile } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { absolute, candidatePath, candidateSvgPath, CANDIDATES_DIR } from "../src/paths";

/**
 * The gate against a fixture candidate.
 *
 * tldrawkc is a submodule with its own lockfile and a Chromium behind it, so
 * the CLI is stubbed and the fixture is a real file on disk. That split is
 * deliberate: step 1 is a question about the filesystem and is tested against
 * the filesystem, while steps 2 to 5 are questions about how the runner reads
 * an exit code, and the exit codes are the thing worth pinning. D4 is the part
 * that is easy to get wrong twice — 3 is a finished document and 4 is a saved
 * one — so both have a test of their own.
 */

const canvasMock = vi.hoisted(() => ({ canvas: vi.fn() }));
vi.mock("../src/canvas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/canvas")>();
  return { ...actual, canvas: canvasMock.canvas };
});

const { runGate } = await import("../src/gate");

const SLUG = "studio-gate-fixture";
const TOPIC = "vector-and-linear-algebra-basics";
const candidate = absolute(candidatePath(SLUG));
const candidateSvg = absolute(candidateSvgPath(SLUG));

interface Reply {
  code: number;
  json?: unknown;
  stderr?: string;
}

/** Queue one reply per canvas call, in the order the gate makes them. */
function replies(...queue: Reply[]): void {
  canvasMock.canvas.mockReset();
  for (const reply of queue) {
    canvasMock.canvas.mockImplementationOnce(() =>
      Promise.resolve({
        code: reply.code,
        signal: null,
        stdout: "",
        stderr: reply.stderr ?? "",
        json: reply.json ?? null,
        timedOut: false,
      }),
    );
  }
}

const inspectOk = (topic: string | null = TOPIC, shapes = 12, lints: unknown[] = []) => ({
  code: 0,
  json: {
    shapes: Array.from({ length: shapes }, (_, i) => ({ id: `shape:${i}` })),
    lints,
    meta: topic === null ? null : { topic, title: "A dot product" },
  },
});

const gateInput = () => ({
  slug: SLUG,
  topic: TOPIC,
  candidatePath: candidatePath(SLUG),
  candidateSvgPath: candidateSvgPath(SLUG),
  startedAtMs: Date.now() - 60_000,
});

beforeEach(async () => {
  await mkdir(absolute(CANDIDATES_DIR), { recursive: true });
  await writeFile(candidate, "{}", "utf8");
});

afterEach(async () => {
  await rm(candidate, { force: true });
  await rm(candidateSvg, { force: true });
});

describe("step 1: the candidate", () => {
  it("refuses when nothing was written", async () => {
    await rm(candidate, { force: true });
    replies();
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("Nothing was written");
    expect(canvasMock.canvas).not.toHaveBeenCalled();
  });

  it("refuses a candidate older than this attempt, rather than crediting the job for it", async () => {
    const old = new Date(Date.now() - 3_600_000);
    await utimes(candidate, old, old);
    replies();
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("older than this attempt");
  });
});

describe("step 2: inspect", () => {
  it("treats exit 3 as a finished document with lints, not a failure", async () => {
    replies(
      { code: 3, json: { shapes: [{ id: "shape:a" }], lints: [{ rule: "overlap" }], meta: { topic: TOPIC } } },
      { code: 0, json: { svg: { path: candidateSvg, bytes: 2048 } } },
      { code: 0, json: { checks: [{ rule: "self-contained", ok: true, detail: "" }] } },
    );
    await writeFile(candidateSvg, "<svg/>", "utf8");
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(true);
    expect(gate.lints).toBe(1);
  });

  it("refuses exit 1, which is a bad file or a browser that never answered", async () => {
    replies({ code: 1, stderr: "could not launch chromium" });
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("exited 1");
  });

  it("refuses a document that parses and holds nothing", async () => {
    replies({ code: 0, json: { shapes: [], lints: [], meta: { topic: TOPIC } } });
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("no shapes");
    expect(gate.shapes).toBe(0);
  });
});

describe("step 3: the topic stamp", () => {
  it("refuses an unstamped document, which is what the indexer refuses by name", async () => {
    replies(inspectOk(null));
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("carries no topic");
  });

  it("refuses a topic that is not in content/topics.yaml", async () => {
    replies(inspectOk("not-a-real-topic-slug"));
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("not in content/topics.yaml");
  });

  it("refuses a real topic that is not the one the job was enqueued under", async () => {
    replies(inspectOk("tomasulo-algorithm"));
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("enqueued under");
  });
});

describe("step 4: export", () => {
  it("records exit 4 and still lets the job reach review, because the work is saved", async () => {
    replies(inspectOk(), { code: 4, stderr: "export failed" });
    const gate = await runGate(gateInput());
    expect(gate.exportFailed).toBe(true);
    expect(gate.svg).toBeNull();
    // No finding, so no retry: an export failure costs a picture, and accept
    // re-runs the export in its own first step anyway.
    expect(gate.findings).toHaveLength(0);
    expect(gate.ok).toBe(true);
  });
});

describe("step 5: verify", () => {
  it("feeds the failing check back verbatim", async () => {
    await writeFile(candidateSvg, "<svg/>", "utf8");
    replies(
      inspectOk(),
      { code: 0, json: { svg: { path: candidateSvg, bytes: 1024 } } },
      {
        code: 3,
        json: {
          checks: [
            { rule: "self-contained", ok: true, detail: "nothing was fetched" },
            { rule: "text-visible", ok: false, detail: "3 text runs with no box inside the frame" },
          ],
        },
      },
    );
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("text-visible");
    expect(gate.findings[0]).toContain("no box inside the frame");
  });

  it("passes a clean run and reports what the tool measured, not what an agent said", async () => {
    await writeFile(candidateSvg, "<svg/>", "utf8");
    replies(
      inspectOk(TOPIC, 44),
      { code: 0, json: { svg: { path: candidateSvg, bytes: 213482 } } },
      { code: 0, json: { checks: [{ rule: "self-contained", ok: true, detail: "" }] } },
    );
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(true);
    expect(gate.shapes).toBe(44);
    expect(gate.svg?.path).toBe(candidateSvgPath(SLUG));
    expect(gate.steps.map((step) => step.name)).toEqual([
      "candidate",
      "inspect",
      "topic",
      "export",
      "verify",
    ]);
  });
});
