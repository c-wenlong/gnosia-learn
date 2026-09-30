import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeClaude, type FakeClaude } from "./fake-claude";
import { topicListAnswer } from "./vocabulary";

/**
 * A draft opened from the concept tutor (docs/STUDIO-TUTOR-HANDOFF.md, phase
 * 1), end to end through a fake `claude`: the concept checked and resolved,
 * the CONCEPT and TUTOR blocks in the prompt the CLI reads, the concept on the
 * record, the `created` event, the view and the list, a bare tag accepted, and
 * each brief stamped with the concept as its source (and as a concept when its
 * topic files it) before the validator runs, on a reply and on an edit. No
 * request leaves the machine.
 */

// `config.ts` reads the CLI's path once, at import: a path that cannot run
// until the fake's is set, as `mentions.test.ts` does.
vi.hoisted(() => {
  process.env.STUDIO_CLAUDE_BIN = "/nonexistent/claude-until-the-fake-is-ready";
  process.env.STUDIO_PLANNER_TURNS = "8";
  process.env.STUDIO_VIDEO_KIND = "on";
});
let fake: FakeClaude;
const fakeReady = fakeClaude().then((made) => {
  fake = made;
  process.env.STUDIO_CLAUDE_BIN = made.bin;
});
await fakeReady;

const catalogMock = vi.hoisted(() => ({
  draftUpsert: vi.fn(),
  topicList: vi.fn(),
  topicAddDryRun: vi.fn(),
  topicAdd: vi.fn(),
  diagramList: vi.fn(),
  videoList: vi.fn(),
  videoShow: vi.fn(),
  conceptShow: vi.fn(),
}));
vi.mock("../src/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/catalog")>()),
  ...catalogMock,
}));

const { Drafts } = await import("../src/drafts");
const { narratedBrief } = await import("./video-fixture");
const { CLAUDE_BIN } = await import("../src/config");
if (CLAUDE_BIN !== fake!.bin) throw new Error(`the planner would spawn ${CLAUDE_BIN}, not the fake`);
const { JobStore, RecordStore } = await import("../src/store");
const { plannerSystemPath } = await import("../src/paths");
const { CONCEPT_PARAGRAPH } = await import("../src/planner-prompt");

type DraftsT = InstanceType<typeof Drafts>;
const ok = (json: unknown = {}) => ({ ok: true, json, error: null, offline: false });

/** `dot-product` is filed under `vector-and-linear-algebra-basics` in the test vocabulary. */
const concept = {
  slug: "dot-product",
  title: "The dot product",
  summary: "Multiply matching parts and add them up.",
  body: "# The dot product\n\nFor a = (1, 2) and b = (3, 4), a · b = 1·3 + 2·4 = 11.",
};
const tutor = [
  { role: "user", content: "Why is the dot product zero for perpendicular vectors?" },
  { role: "assistant", content: "Because the projection of one onto the other has no length." },
  { role: "user", content: "So the angle decides the sign?" },
];

const filed = {
  intent: "Show the dot product as matching parts multiplied and added.",
  title: "The dot product, part by part",
  topic: "vector-and-linear-algebra-basics",
  slug: "dot-product-parts",
  mode: "new",
  layout: "flow-lr",
  elements: [{ label: "a = (1, 2)" }, { label: "b = (3, 4)" }, { label: "11" }],
  relations: [{ from: "a = (1, 2)", to: "11" }],
  concepts: [],
};
const videoBrief = (() => {
  const brief: Record<string, unknown> = { ...narratedBrief(), topic: "tcp-congestion-control", slug: "dot-product-video" };
  delete brief.idempotencyKey;
  delete brief.source;
  return brief;
})();
const block = (tag: string, body: unknown): string => `\`\`\`${tag}\n${JSON.stringify(body)}\n\`\`\``;

let store: InstanceType<typeof JobStore>;
let drafts: DraftsT;

beforeAll(async () => {
  await fakeReady;
});
afterAll(async () => {
  await fake.cleanup();
  delete process.env.STUDIO_VIDEO_KIND;
});

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-handoff-${Date.now()}-${Math.random()}`);
  await mkdir(process.env.STUDIO_HOME, { recursive: true });
  catalogMock.draftUpsert.mockReset().mockResolvedValue(ok());
  catalogMock.topicList.mockReset().mockResolvedValue(topicListAnswer());
  catalogMock.topicAddDryRun.mockReset().mockResolvedValue(ok({ nearMatches: [] }));
  catalogMock.topicAdd.mockReset().mockResolvedValue(ok());
  catalogMock.diagramList.mockReset().mockResolvedValue(ok({ diagrams: [] }));
  catalogMock.videoList.mockReset().mockResolvedValue(ok({ videos: [] }));
  catalogMock.videoShow.mockReset().mockResolvedValue(ok({ video: null }));
  catalogMock.conceptShow.mockReset().mockResolvedValue(ok({ id: "dot-product", title: "The dot product", body: "whatever the database holds" }));
  store = new JobStore();
  const runner = { enqueue: vi.fn(), admit: vi.fn(), assertUnderCap: vi.fn(), canvasOpen: () => false };
  const videoRunner = { enqueue: vi.fn(), admit: vi.fn() };
  await fake.script([]);
  drafts = new Drafts(store, runner as never, { store: new RecordStore("video") as never, runner: videoRunner as never });
});

afterEach(async () => {
  await drafts.drain();
  await rm(process.env.STUDIO_HOME!, { recursive: true, force: true });
});

/** `@<kind> text` with its chips, as the composer sends it. */
function tagged(text: string, ...kinds: ("diagram" | "video")[]): [string, { kind: string; start: number; end: number }[]] {
  let prefix = "";
  const mentions: { kind: string; start: number; end: number }[] = [];
  for (const kind of kinds) {
    mentions.push({ kind, start: prefix.length, end: prefix.length + kind.length + 1 });
    prefix += `@${kind} `;
  }
  return [`${prefix}${text}`.trimEnd(), mentions];
}

describe("a draft opened on a concept", () => {
  it("resolves the concept, and carries it and the tutor's turns into the prompt the CLI reads", async () => {
    const { record, created } = await drafts.create({ concept, tutor, idempotencyKey: "handoff-1" });
    expect(created).toBe(true);
    expect(catalogMock.conceptShow).toHaveBeenCalledWith("dot-product");
    expect(record.concept).toEqual({ slug: "dot-product", title: "The dot product", topic: "vector-and-linear-algebra-basics" });
    expect(record.tutorTurns).toBe(3);
    expect(record.source).toBeNull();

    const system = await readFile(plannerSystemPath(record.id), "utf8");
    expect(system).toContain(CONCEPT_PARAGRAPH);
    expect(system).toContain(
      [
        "-----BEGIN CONCEPT-----",
        "slug: dot-product",
        "title: The dot product",
        "topic: vector-and-linear-algebra-basics",
        "summary: Multiply matching parts and add them up.",
        "note:",
        "  # The dot product",
        "",
        "  For a = (1, 2) and b = (3, 4), a · b = 1·3 + 2·4 = 11.",
        "-----END CONCEPT-----",
        "",
        "-----BEGIN TUTOR-----",
        "person:",
        "  Why is the dot product zero for perpendicular vectors?",
        "tutor:",
        "  Because the projection of one onto the other has no length.",
        "person:",
        "  So the angle decides the sign?",
        "-----END TUTOR-----",
      ].join("\n"),
    );

    const events = await drafts.events(record.id);
    expect(events[0]).toMatchObject({
      type: "created",
      mode: "new",
      concept: { slug: "dot-product", title: "The dot product", topic: "vector-and-linear-algebra-basics" },
      tutorTurns: 3,
    });
    const view = await drafts.view(record.id);
    expect(view.concept).toEqual({ slug: "dot-product", title: "The dot product", topic: "vector-and-linear-algebra-basics", tutorTurns: 3 });
    expect(view.note).toMatch(/^a conversation about The dot product/);
    expect(drafts.list().find((row) => row.draftId === record.id)?.concept).toEqual({ slug: "dot-product", title: "The dot product" });

    // The same key is the same draft: a double press makes one (H6).
    const again = await drafts.create({ concept, tutor, idempotencyKey: "handoff-1" });
    expect(again).toMatchObject({ created: false, record: { id: record.id } });
    expect(catalogMock.conceptShow).toHaveBeenCalledTimes(1);
  });

  it("says so when no topic files the concept, and needs no tutor turns", async () => {
    const { record } = await drafts.create({ concept: { slug: "orphan-note", title: "An orphan" } });
    expect(record.concept?.topic).toBeNull();
    expect(record.tutorTurns).toBe(0);
    const system = await readFile(plannerSystemPath(record.id), "utf8");
    expect(system).toContain("topic: (none)");
    expect(system).toContain("note: (no note)");
    expect(system).not.toContain("-----BEGIN TUTOR-----");
  });

  it("leaves every other draft's record, view and row without a concept", async () => {
    const { record } = await drafts.create({});
    expect(record).not.toHaveProperty("concept");
    expect((await drafts.view(record.id)).concept).toBeNull();
    expect(drafts.list()[0]?.concept).toBeNull();
    expect(await readFile(plannerSystemPath(record.id), "utf8")).not.toContain(CONCEPT_PARAGRAPH);
  });
});

describe("what a concept create refuses", () => {
  it("a concept with a source, tutor turns without a concept, and a bad slug before any read", async () => {
    await expect(drafts.create({ concept, source: "some-diagram" })).rejects.toMatchObject({ status: 400, detail: { field: "concept" } });
    await expect(drafts.create({ tutor })).rejects.toMatchObject({ status: 400, detail: { field: "tutor" } });
    await expect(drafts.create({ concept: { ...concept, slug: "../../etc/passwd" } })).rejects.toMatchObject({
      status: 400,
      detail: { field: "concept.slug" },
    });
    await expect(drafts.create({ concept, tutor: [...tutor, ...tutor, ...tutor] })).rejects.toMatchObject({ status: 400, detail: { field: "tutor" } });
    expect(catalogMock.conceptShow).not.toHaveBeenCalled();
  });

  it("a concept this studio's owner cannot read, and a catalog that does not answer", async () => {
    catalogMock.conceptShow.mockResolvedValue({ ok: false, json: null, error: "learn concept show x exited 1: learn: no such concept: dot-product", offline: false });
    await expect(drafts.create({ concept })).rejects.toMatchObject({ status: 404, detail: { reason: "no-concept", field: "concept" } });
    catalogMock.conceptShow.mockResolvedValue({ ok: false, json: null, error: "exited 3: ECONNREFUSED", offline: true });
    await expect(drafts.create({ concept })).rejects.toMatchObject({ status: 503, detail: { reason: "catalog-unreachable" } });
    expect(drafts.list()).toEqual([]);
  });
});

describe("a turn on a concept draft", () => {
  it("takes a bare tag, and stamps the concept on the brief before the validator (H8, D66)", async () => {
    const { record } = await drafts.create({ concept, tutor });
    await fake.script([{ text: `A diagram of the note's example.\n\n${block("brief", { kind: "diagram", ...filed })}` }]);
    await drafts.send(record.id, ...tagged("", "diagram"));
    await drafts.settled(record.id);
    // The CLI read the concept from the prompt file; nothing of it was in argv.
    const [system] = await fake.systems();
    expect(system).toContain("-----BEGIN CONCEPT-----\nslug: dot-product");
    const [argv] = await fake.argvs();
    expect(argv!.join("\n")).not.toContain("perpendicular");
    expect(argv![argv!.indexOf("--system-prompt-file") + 1]).toBe(path.resolve(plannerSystemPath(record.id)));

    const slot = drafts.get(record.id)!.slots!.diagram!;
    expect(slot.state).toBe("briefed");
    expect(slot.brief).toMatchObject({ source: "dot-product", concepts: ["dot-product"], topic: "vector-and-linear-algebra-basics" });
  });

  it("gives a brief whose topic does not file the concept its source and no concept", async () => {
    const { record } = await drafts.create({ concept });
    await fake.script([{ text: `A video.\n\n${block("brief", { kind: "video", ...videoBrief, source: "someone-else" })}` }]);
    await drafts.send(record.id, ...tagged("of the example", "video"));
    await drafts.settled(record.id);
    const brief = drafts.get(record.id)!.slots!.video!.brief;
    expect(brief).toMatchObject({ source: "dot-product", concepts: [], topic: "tcp-congestion-control" });
  });

  it("still refuses a bare tag in a conversation that did not open on a concept (T15)", async () => {
    const { record } = await drafts.create({});
    await expect(drafts.send(record.id, ...tagged("", "video"))).rejects.toMatchObject({ status: 400, detail: { field: "text" } });
  });

  it("stamps an edit too, replacing a source the edit carried", async () => {
    const { record } = await drafts.create({ concept });
    await fake.script([{ text: block("brief", { kind: "diagram", ...filed }) }]);
    await drafts.send(record.id, ...tagged("", "diagram"));
    await drafts.settled(record.id);
    const base = drafts.get(record.id)!.slots!.diagram!.briefSeq;
    const edited = await drafts.editBrief(record.id, { ...filed, title: "Edited", source: "learn/concepts/other.md", concepts: [] }, String(base));
    expect(edited.changed).toBe(true);
    expect(drafts.get(record.id)!.slots!.diagram!.brief).toMatchObject({ title: "Edited", source: "dot-product", concepts: ["dot-product"] });
  });

  it("rewrites a lost prompt with the concept from the record, and without the note (H17)", async () => {
    const { record } = await drafts.create({ concept, tutor });
    await rm(plannerSystemPath(record.id));
    await fake.script([{ text: "Tell me more." }]);
    await drafts.send(record.id, "What would a diagram of this show?");
    await drafts.settled(record.id);
    const [system] = await fake.systems();
    expect(system).toContain(CONCEPT_PARAGRAPH);
    expect(system).toContain(
      "-----BEGIN CONCEPT-----\nslug: dot-product\ntitle: The dot product\ntopic: vector-and-linear-algebra-basics\nsummary: (none)\nnote: (the note was not kept)\n-----END CONCEPT-----",
    );
    expect(system).not.toContain("For a = (1, 2)");
  });
});
