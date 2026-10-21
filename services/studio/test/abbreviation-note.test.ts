import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeClaude, type FakeClaude } from "./fake-claude";
import { topicListAnswer } from "./vocabulary";

/**
 * V11's planner half (docs/STUDIO-VIDEOS.md, "Acronyms"): a video brief whose
 * lines hold words the voice will read as words is told to the planner as a
 * STUDIO note on the turn after it is proposed or edited, never again for the
 * same words, and never as a refusal. End to end through a fake `claude`; no
 * request leaves the machine.
 */

// `config.ts` reads the CLI's path once, at import: a path that cannot run
// until the fake's is set, so an early import fails here rather than reaching
// the real `claude` (AGENTS.md, the studio gotchas).
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
}));
vi.mock("../src/data/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/data/catalog")>()),
  ...catalogMock,
}));
const canvasMock = vi.hoisted(() => ({ doctor: vi.fn() }));
vi.mock("../src/canvas/canvas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/canvas/canvas")>()),
  doctor: canvasMock.doctor,
}));

const { Drafts, abbreviationCheck, abbreviationNote, emptySlot, ABBREVIATION_NOTE_CAP } = await import("../src/drafts/drafts");
const { narratedBrief } = await import("./video-fixture");
const { keepNarrationFacts } = await import("../src/video/narration");
const { CLAUDE_BIN } = await import("../src/config");
if (CLAUDE_BIN !== fake!.bin) throw new Error(`the planner would spawn ${CLAUDE_BIN}, not the fake`);
const { JobStore, RecordStore } = await import("../src/data/store");
const { draftTranscriptPath } = await import("../src/paths");

type DraftsT = InstanceType<typeof Drafts>;
const ok = (json: unknown = {}) => ({ ok: true, json, error: null, offline: false });

/** gnosia-audio's answer, with a pronunciation table that spells out CPU and nothing this suite flags. */
const FACTS = {
  version: "0.1.0",
  charsPerSecond: 15.2,
  leadIn: 0.2,
  tail: 0.4,
  spoken: ["CPU", "API"],
  data: { spoken: "/venv/gnosia_audio/data/spoken.json", timing: "/venv/gnosia_audio/data/timing.json" },
};

/** The fixture's narrated brief with `first` and `second` as the two lines' openings. */
function videoBrief(first = "A request starts at the client.", second = "That is all there is to it."): Record<string, unknown> {
  const brief = narratedBrief() as unknown as Record<string, unknown> & { scenes: { beats: { say: string }[] }[] };
  const fixture = narratedBrief();
  brief.scenes[0]!.beats[0]!.say = fixture.scenes[0]!.beats[0]!.say.replace("A request starts at the client.", first);
  brief.scenes[1]!.beats[0]!.say = fixture.scenes[1]!.beats[0]!.say.replace("That is all there is to it.", second);
  brief.topic = "tcp-congestion-control";
  brief.slug = "tcp-congestion-window";
  delete brief.idempotencyKey;
  return brief;
}
const ACL_TCP = videoBrief("The ACL checks the request.", "Then TCP carries it on."); // CPU is in the table
const block = (body: unknown): string => `\`\`\`brief\n${JSON.stringify({ kind: "video", ...(body as object) })}\n\`\`\``;
const proposing = (brief: Record<string, unknown>): string => `A video.\n\n${block(brief)}`;

function chips(text: string, kind: "video"): [string, { kind: string; start: number; end: number }[]] {
  return [`@${kind} ${text}`, [{ kind, start: 0, end: kind.length + 1 }]];
}

let drafts: DraftsT;
let store: InstanceType<typeof JobStore>;
let videoStore: InstanceType<typeof RecordStore>;
let videoRunner: { enqueue: ReturnType<typeof vi.fn>; admit: ReturnType<typeof vi.fn> };

beforeAll(async () => {
  await fakeReady;
});
afterAll(async () => {
  await fake.cleanup();
  delete process.env.STUDIO_VIDEO_KIND;
});

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-abbrev-${Date.now()}-${Math.random()}`);
  await mkdir(process.env.STUDIO_HOME, { recursive: true });
  catalogMock.draftUpsert.mockReset().mockResolvedValue(ok());
  catalogMock.topicList.mockReset().mockResolvedValue(topicListAnswer());
  catalogMock.topicAddDryRun.mockReset().mockResolvedValue(ok({ nearMatches: [] }));
  catalogMock.topicAdd.mockReset().mockResolvedValue(ok());
  catalogMock.diagramList.mockReset().mockResolvedValue(ok({ diagrams: [] }));
  catalogMock.videoList.mockReset().mockResolvedValue(ok({ videos: [] }));
  catalogMock.videoShow.mockReset().mockResolvedValue(ok({ video: null }));
  canvasMock.doctor.mockReset().mockResolvedValue({ code: 0, stdout: "", stderr: "", json: null, signal: null, timedOut: false });
  store = new JobStore();
  videoStore = new RecordStore("video");
  videoRunner = {
    enqueue: vi.fn(async (brief: { slug: string; idempotencyKey: string }, _parent: unknown, options: { draftId: string }) => {
      const record = await videoStore.create({
        id: `job-v-${Math.random().toString(36).slice(2, 8)}`,
        kind: "video",
        state: "queued",
        slug: brief.slug,
        topic: "tcp-congestion-control",
        targetPath: `videos/${brief.slug}.mp4`,
        draftId: options.draftId,
        parentJobId: null,
        brief,
        idempotencyKey: brief.idempotencyKey,
        requestedAt: new Date().toISOString(),
        gate: null,
        error: null,
      } as never);
      return { record, created: true, jobsAhead: 0 };
    }),
    admit: vi.fn(async () => ({ revision: null })),
  };
  const runner = { enqueue: vi.fn(), admit: vi.fn(), assertUnderCap: vi.fn(), canvasOpen: () => false };
  keepNarrationFacts(FACTS);
  await fake.script([]);
  drafts = new Drafts(store, runner as never, { store: videoStore as never, runner: videoRunner as never });
});

afterEach(async () => {
  await drafts.drain();
  keepNarrationFacts(null);
  await rm(process.env.STUDIO_HOME!, { recursive: true, force: true });
});

async function send(id: string, text: string, tagged = false): Promise<void> {
  if (tagged) await drafts.send(id, ...chips(text, "video"));
  else await drafts.send(id, text);
  await drafts.settled(id);
}

const prompts = (): Promise<string[]> => fake.prompts();
const STUDIO_ACL_TCP = "-----BEGIN STUDIO-----\nVideo brief. The voice will read these words in its lines as words, not letter by letter: ACL, TCP.";

async function events(id: string): Promise<Record<string, unknown>[]> {
  const body = await readFile(draftTranscriptPath(id), "utf8");
  return body
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("the abbreviation note, end to end", () => {
  it("is told on the turn after the brief is proposed, hidden from the person, and never again for the same words", async () => {
    await fake.script([{ text: proposing(ACL_TCP) }, { text: "Glad it helps." }, { text: "Sure." }]);
    const { record } = await drafts.create({});
    await send(record.id, "how a request is checked", true);
    await send(record.id, "looks good");
    await send(record.id, "thanks");
    const [first, second, third] = await prompts();
    // The turn that proposed it had no brief to weigh yet.
    expect(first).not.toContain("BEGIN STUDIO");
    expect(second).toContain(STUDIO_ACL_TCP);
    expect(second).toContain("This is not a refusal: the brief stands as it is");
    expect(second).toContain('spell each one in `say` the way it is spoken ("A C L"), or keep it where it is meant to be said as a word');
    // The note comes before the person's words, as every STUDIO note does.
    expect(second!.indexOf("BEGIN STUDIO")).toBeLessThan(second!.indexOf("looks good"));
    // Told once: the same words at the next turn are not repeated.
    expect(third).not.toContain("BEGIN STUDIO");
    expect(drafts.get(record.id)?.slots?.video?.abbreviationsTold).toEqual(["ACL", "TCP"]);

    // On the record as an internal studio entry, which the person's thread and a replay leave out.
    const notes = (await events(record.id)).filter((event) => event.type === "studio");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ internal: true, kind: "video", abbreviations: ["ACL", "TCP"] });
    const view = await drafts.view(record.id);
    expect(view.transcript.filter((entry) => entry.role === "studio")).toEqual([expect.objectContaining({ internal: true })]);
    // Never a refusal: the brief is in force and its card carries the warning.
    expect(view.slots.video).toMatchObject({ state: "briefed", briefBy: "planner" });
    expect(view.transcript.find((entry) => entry.briefs !== undefined)?.briefs?.[0]?.abbreviations).toEqual(["ACL", "TCP"]);
    expect(drafts.get(record.id)?.errorKind).toBeNull();
  });

  it("is told again only when a new brief brings a word the planner was not told of", async () => {
    await fake.script([
      { text: proposing(ACL_TCP) },
      { text: proposing(videoBrief("The ACL checks the request.", "Then TCP carries it, and the CPU waits.")) },
      { text: proposing(videoBrief("The A C L checks the request.", "Then NAT rewrites it and TCP carries it on.")) },
      { text: "Done." },
    ]);
    const { record } = await drafts.create({});
    await send(record.id, "how a request is checked", true);
    await send(record.id, "mention the processor", true);
    await send(record.id, "add address translation", true);
    await send(record.id, "great");
    const all = await prompts();
    expect(all[1]).toContain(STUDIO_ACL_TCP);
    // The same two words (CPU is in the table): nothing to tell.
    expect(all[2]).not.toContain("BEGIN STUDIO");
    // ACL respelled, NAT new: the note lists the words in force now.
    expect(all[3]).toContain("letter by letter: NAT, TCP.");
    expect(drafts.get(record.id)?.slots?.video?.abbreviationsTold).toEqual(["NAT", "TCP"]);
  });

  it("follows a person's edit, saying their spelling is theirs to change, beside the edit note", async () => {
    await fake.script([{ text: proposing(videoBrief()) }, { text: "Noted." }]);
    const { record } = await drafts.create({});
    await send(record.id, "how a request is checked", true);
    const seq = drafts.get(record.id)!.slots!.video!.briefSeq!;
    await drafts.editBrief(record.id, videoBrief("The ACL checks the request."), String(seq), "video");
    await send(record.id, "I changed the first line");
    const second = (await prompts())[1]!;
    expect(second).toContain("The person edited the video brief by hand:");
    expect(second).toContain("letter by letter: ACL.");
    expect(second).toContain("The person wrote this brief by hand: keep their spelling in your next video brief unless they ask you to change it.");
    expect(second.indexOf("edited the video brief")).toBeLessThan(second.indexOf("letter by letter"));
  });

  it("stays queued through a turn that did not answer, and is told on the next", async () => {
    await fake.script([{ text: proposing(ACL_TCP) }, { refused: "overloaded" }, { text: "Here again." }]);
    const { record } = await drafts.create({});
    await send(record.id, "how a request is checked", true);
    await send(record.id, "still there?");
    expect(drafts.get(record.id)?.slots?.video?.abbreviationsTold ?? []).toEqual([]);
    await send(record.id, "hello?");
    const all = await prompts();
    expect(all[1]).toContain(STUDIO_ACL_TCP);
    expect(all[2]).toContain(STUDIO_ACL_TCP);
    expect(drafts.get(record.id)?.slots?.video?.abbreviationsTold).toEqual(["ACL", "TCP"]);
  });

  it("says nothing before gnosia-audio answers, and tells the next turn once it has", async () => {
    keepNarrationFacts(null);
    await fake.script([{ text: proposing(ACL_TCP) }, { text: "Fine." }, { text: "Fine again." }]);
    const { record } = await drafts.create({});
    await send(record.id, "how a request is checked", true);
    await send(record.id, "ok");
    expect((await prompts())[1]).not.toContain("BEGIN STUDIO");
    expect(drafts.get(record.id)?.slots?.video?.abbreviationsTold).toBeUndefined();
    keepNarrationFacts(FACTS);
    await send(record.id, "ok then");
    expect((await prompts())[2]).toContain(STUDIO_ACL_TCP);
  });

  it("says nothing about a brief already pressed, which the video agent voices", async () => {
    await fake.script([{ text: proposing(ACL_TCP) }, { text: "It is on its way." }]);
    const { record } = await drafts.create({});
    await send(record.id, "how a request is checked", true);
    await expect(drafts.drawOne(record.id, "press", "video")).resolves.toMatchObject({ kind: "video", created: true });
    await send(record.id, "how long will it take?");
    expect((await prompts())[1]).not.toContain("letter by letter");
  });
});

describe("abbreviationCheck and abbreviationNote", () => {
  const slot = (patch: Record<string, unknown>) => ({ ...emptySlot(), brief: ACL_TCP as never, briefSeq: 4, briefBy: "planner" as const, state: "briefed" as const, ...patch });

  it("weighs only a video brief in force and not yet pressed", () => {
    expect(abbreviationCheck(emptySlot())).toBeNull();
    expect(abbreviationCheck(slot({ drawnSeq: 4, state: "drawing" }))).toBeNull();
    expect(abbreviationCheck(slot({ drawnSeq: 2 }))).toMatchObject({ told: ["ACL", "TCP"], listed: ["ACL", "TCP"] });
    expect(abbreviationCheck(slot({ abbreviationsTold: ["TCP", "ACL", "NAT"] }))).toEqual({ told: ["ACL", "TCP"], listed: [], note: null });
    expect(abbreviationCheck(slot({ brief: { ...ACL_TCP, voice: "none" } }))).toEqual({ told: [], listed: [], note: null });
  });

  it("names new words first, and counts as told only the words a note named (Greptile on #266)", () => {
    const many = Array.from({ length: ABBREVIATION_NOTE_CAP + 4 }, (_, i) => `AB${i}`);
    const brief = videoBrief(`The ${many.slice(0, 17).join(" ")} go first.`, `Then ${many.slice(17).join(" ")} follow.`);
    const first = abbreviationCheck(slot({ brief }))!;
    expect(first.listed).toEqual(many.slice(0, ABBREVIATION_NOTE_CAP));
    expect(first.told).toEqual(many.slice(0, ABBREVIATION_NOTE_CAP));
    expect(first.note).toContain("and 4 more.");
    // The next turn names the four left over, ahead of those told before.
    const second = abbreviationCheck(slot({ brief, abbreviationsTold: first.told }))!;
    expect(second.listed.slice(0, 4)).toEqual(many.slice(ABBREVIATION_NOTE_CAP));
    expect(second.told).toEqual(many);
    expect(abbreviationCheck(slot({ brief, abbreviationsTold: second.told }))!.note).toBeNull();
  });

  it("caps the list, and holds nothing that could close its fence", () => {
    const words = Array.from({ length: ABBREVIATION_NOTE_CAP + 4 }, (_, i) => `AB${i}`);
    const note = abbreviationNote(words, false);
    expect(note).toContain(`AB${ABBREVIATION_NOTE_CAP - 1} and 4 more.`);
    expect(note).not.toContain(`AB${ABBREVIATION_NOTE_CAP},`);
    expect(note).not.toContain("-----");
  });
});
