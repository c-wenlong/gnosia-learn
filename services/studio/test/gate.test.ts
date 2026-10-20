import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { candidatePath, candidateSvgPath } from "../src/paths";
import { topicListAnswer } from "./vocabulary";

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
vi.mock("../src/canvas/canvas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/canvas/canvas")>();
  return { ...actual, canvas: canvasMock.canvas };
});

// Step 4 checks the stamp against the vocabulary, which the studio reads only
// through `catalog topic ls`; faked, so the gate reads no database.
const catalogMock = vi.hoisted(() => ({ topicList: vi.fn() }));
vi.mock("../src/data/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/data/catalog")>()),
  ...catalogMock,
}));

const { runGate } = await import("../src/diagram/gate");

const SLUG = "studio-gate-fixture";
const TOPIC = "vector-and-linear-algebra-basics";
const JOB = "job-gate";
/** In the job's workspace under this test's STUDIO_HOME, so named once it is set. */
let candidate = "";
let candidateSvg = "";
let home = "";

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

/**
 * A document that covers the brief below: two labelled shapes and a bound arrow
 * between them, which is the smallest drawing that passes every step.
 */
const inspectOk = (topic: string | null = TOPIC, shapes = 12, lints: unknown[] = []) => ({
  code: 0,
  json: {
    shapes: [
      { id: "shape:a", type: "geo", text: "vector a" },
      { id: "shape:b", type: "geo", text: "vector b, the one projected onto" },
      ...Array.from({ length: Math.max(0, shapes - 2) }, (_, i) => ({
        id: `shape:${i}`,
        type: "geo",
        text: null,
      })),
    ],
    bindings: [{ arrow: "shape:arrow", from: "shape:a", to: "shape:b" }],
    lints,
    meta: topic === null ? null : { topic, title: "A dot product" },
  },
});

const ELEMENTS = [{ label: "vector a" }, { label: "vector b" }];
const RELATIONS = [{ from: "vector a", to: "vector b", label: "projects onto" }];

const gateInput = (over: Partial<Parameters<typeof runGate>[0]> = {}) => ({
  slug: SLUG,
  topic: TOPIC,
  candidatePath: candidate,
  candidateSvgPath: candidateSvg,
  startedAtMs: Date.now() - 60_000,
  elements: ELEMENTS,
  relations: RELATIONS,
  ...over,
});

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "studio-gate-"));
  process.env.STUDIO_HOME = home;
  candidate = candidatePath(JOB, SLUG);
  candidateSvg = candidateSvgPath(JOB, SLUG);
  catalogMock.topicList.mockReset().mockResolvedValue(topicListAnswer());
  await mkdir(path.dirname(candidate), { recursive: true });
  await writeFile(candidate, "{}", "utf8");
});

afterEach(async () => {
  delete process.env.STUDIO_HOME;
  if (home !== "") await rm(home, { recursive: true, force: true });
  home = "";
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
      { ...inspectOk(TOPIC, 12, [{ rule: "overlap" }]), code: 3 },
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

describe("step 3: the brief", () => {
  it("refuses a diagram that is missing an element the brief asked for", async () => {
    // Twelve shapes, a good topic stamp, a clean export: every step the gate
    // used to have passes. It is simply not the picture that was asked for.
    replies({
      code: 0,
      json: {
        shapes: [{ id: "shape:a", type: "geo", text: "vector a" }],
        bindings: [],
        lints: [],
        meta: { topic: TOPIC },
      },
    });
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain(`"vector b"`);
    // Nothing after it ran: no export was paid for on a drawing that is wrong.
    expect(canvasMock.canvas).toHaveBeenCalledTimes(1);
  });

  it("refuses a relation drawn as a loose line rather than a bound arrow", async () => {
    replies({
      code: 0,
      json: {
        shapes: [
          { id: "shape:a", type: "geo", text: "vector a" },
          { id: "shape:b", type: "geo", text: "vector b" },
        ],
        bindings: [],
        lints: [],
        meta: { topic: TOPIC },
      },
    });
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("not a bound arrow");
    expect(gate.findings[0]).toContain("vector a");
  });

  it("takes a label that says more than the brief did, and an arrow drawn the other way", async () => {
    // A good diagram explains itself, so a label may grow; and an arrow the
    // other way round is a picture worth reviewing rather than a paid retry.
    await writeFile(candidateSvg, "<svg/>", "utf8");
    replies(
      {
        code: 0,
        json: {
          shapes: [
            { id: "shape:a", type: "geo", text: "Vector A (the projection's source)" },
            { id: "shape:b", type: "geo", text: "vector-b" },
          ],
          bindings: [{ arrow: "shape:arrow", from: "shape:b", to: "shape:a" }],
          lints: [],
          meta: { topic: TOPIC },
        },
      },
      { code: 0, json: { svg: { path: candidateSvg, bytes: 1024 } } },
      { code: 0, json: { checks: [] } },
    );
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(true);
  });

  it("does not pass a non-ASCII brief by deleting it down to nothing", async () => {
    // An `a-z0-9` normaliser turns a Cyrillic or CJK label into the empty
    // string, and an empty needle is inside every haystack — so every element
    // reads as present and any binding satisfies any relation. A gate that
    // passes whatever it cannot read is worse than no gate, because it is
    // believed.
    replies({
      code: 0,
      json: {
        shapes: [
          { id: "shape:a", type: "geo", text: "вектор" },
          { id: "shape:x", type: "geo", text: "нечто совсем другое" },
        ],
        bindings: [{ arrow: "shape:arrow", from: "shape:a", to: "shape:x" }],
        lints: [],
        meta: { topic: TOPIC },
      },
    });
    const gate = await runGate(
      gateInput({
        elements: [{ label: "вектор" }, { label: "ベクトル" }],
        relations: [{ from: "вектор", to: "ベクトル" }],
      }),
    );
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("ベクトル");
  });

  it("matches a non-ASCII label that is actually there", async () => {
    await writeFile(candidateSvg, "<svg/>", "utf8");
    replies(
      {
        code: 0,
        json: {
          shapes: [
            { id: "shape:a", type: "geo", text: "Вектор, слева" },
            { id: "shape:b", type: "geo", text: "ベクトル について" },
          ],
          bindings: [{ arrow: "shape:arrow", from: "shape:a", to: "shape:b" }],
          lints: [],
          meta: { topic: TOPIC },
        },
      },
      { code: 0, json: { svg: { path: candidateSvg, bytes: 1024 } } },
      { code: 0, json: { checks: [] } },
    );
    const gate = await runGate(
      gateInput({
        elements: [{ label: "вектор" }, { label: "ベクトル" }],
        relations: [{ from: "вектор", to: "ベクトル" }],
      }),
    );
    expect(gate.ok).toBe(true);
  });

  it("does not let a label of pure symbols match every shape", async () => {
    replies({
      code: 0,
      json: {
        shapes: [{ id: "shape:a", type: "geo", text: "vector a" }],
        bindings: [],
        lints: [],
        meta: { topic: TOPIC },
      },
    });
    const gate = await runGate(gateInput({ elements: [{ label: "∑" }], relations: [] }));
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("∑");
  });

  it("refuses an extend candidate that is still exactly the copy it was handed", async () => {
    // The case a failed agent reaches: extend copies the committed file to the
    // candidate path before anything starts, so the file exists, is newer than
    // the attempt, holds shapes, carries the right topic and exports cleanly —
    // all of it describing the diagram that was already there.
    const { createHash } = await import("node:crypto");
    const { readFile } = await import("node:fs/promises");
    const hash = createHash("sha256").update(await readFile(candidate)).digest("hex");
    replies(inspectOk());
    const gate = await runGate(gateInput({ unchangedHash: hash }));
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("unchanged");
    expect(canvasMock.canvas).not.toHaveBeenCalled();
  });
});

describe("step 4: the topic stamp", () => {
  it("refuses an unstamped document, which is what the indexer refuses by name", async () => {
    replies(inspectOk(null));
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("carries no topic");
  });

  it("refuses a topic that is not in the catalog's vocabulary", async () => {
    replies(inspectOk("not-a-real-topic-slug"));
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("not in the catalog's vocabulary");
    expect(catalogMock.topicList).toHaveBeenCalled();
  });

  it("refuses a real topic that is not the one the job was enqueued under", async () => {
    replies(inspectOk("tcp-congestion-control"));
    const gate = await runGate(gateInput());
    expect(gate.ok).toBe(false);
    expect(gate.findings[0]).toContain("enqueued under");
  });
});

describe("step 5: export", () => {
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

describe("step 6: verify", () => {
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
    expect(gate.svg?.path).toBe(candidateSvg);
    expect(gate.steps.map((step) => step.name)).toEqual([
      "candidate",
      "inspect",
      "brief",
      "topic",
      "export",
      "verify",
    ]);
  });
});
