import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { transcriptOf, type TranscriptEvent } from "../src/drafts";
import { predictedSeconds, validateVideoBrief } from "../src/video/brief";
import {
  abbreviationsIn,
  charsPerSecond,
  FALLBACK_CHARS_PER_SECOND,
  narrationFacts,
  narrationHealth,
  parseHome,
  readNarrationFacts,
  settleNarrationRead,
  spokenForms,
  startNarrationRead,
  keepNarrationFacts,
  videoAbbreviations,
  type NarrationFacts,
} from "../src/video/narration";
import { discoverToolchain, manimkcRoot, toolchainProblems, type Toolchain } from "../src/video/toolchain";

import { testVocabulary } from "./vocabulary";

/**
 * What the studio takes from gnosia-audio (src/video/narration.ts): the speech
 * rate, the pronunciation table's written forms, and the abbreviation warning
 * built from them. The parts that run gnosia-audio inside a job's sandbox
 * (the clip keys, the narration step) are in `video-sandbox.test.ts`.
 */

const FACTS: NarrationFacts = {
  version: "0.1.0",
  charsPerSecond: 15.2,
  leadIn: 0.2,
  tail: 0.4,
  spoken: ["RAW", "CPU", "CS4223", "API"],
  data: { spoken: "/venv/gnosia_audio/data/spoken.json", timing: "/venv/gnosia_audio/data/timing.json" },
};

afterEach(() => keepNarrationFacts(null));

describe("gnosia-audio's home reply and data files", () => {
  it("reads the rate, the timing and where the data files are, and refuses anything else", () => {
    const home = {
      schema: 1,
      version: "0.1.0",
      charsPerSecond: 15.2,
      leadIn: 0.2,
      tail: 0.4,
      data: { spoken: "/v/spoken.json", timing: "/v/timing.json" },
    };
    expect(parseHome(home)).toEqual({ version: "0.1.0", charsPerSecond: 15.2, leadIn: 0.2, tail: 0.4, data: { spoken: "/v/spoken.json", timing: "/v/timing.json" } });
    expect(() => parseHome({ ...home, schema: 2 })).toThrow(/schema 2/);
    expect(() => parseHome({ schema: 1, error: { kind: "request", message: "no checkout" } })).toThrow(/no checkout/);
    expect(() => parseHome({ ...home, charsPerSecond: 0 })).toThrow(/speech rate/);
    expect(() => parseHome({ ...home, data: { spoken: "spoken.json", timing: "/v/timing.json" } })).toThrow(/data files/);
    expect(() => parseHome(null)).toThrow(/JSON object/);
  });

  it("flattens spoken.json's groups in file order, as gnosia-audio's own reader does", () => {
    const file = {
      schema: 1,
      spoken: [
        { about: "pipelines", words: { RAW: "R A W", WAR: "W A R" } },
        { about: "networks", words: { TCP: "T C P", RAW: "R A W" } },
      ],
      symbols: [{ about: "units", words: { "°C": " degrees Celsius" } }],
    };
    expect(spokenForms(file)).toEqual(["RAW", "WAR", "TCP"]);
    expect(() => spokenForms({ spoken: [{ words: ["RAW"] }] })).toThrow(/words/);
    expect(() => spokenForms({})).toThrow(/groups/);
  });
});

describe("the speech rate", () => {
  it("is gnosia-audio's once it has answered, and the fallback before", () => {
    expect(narrationFacts()).toBeNull();
    expect(charsPerSecond()).toBe(FALLBACK_CHARS_PER_SECOND);
    expect(narrationHealth()).toEqual({ source: "fallback", version: null, charsPerSecond: FALLBACK_CHARS_PER_SECOND, spokenWords: 0 });
    keepNarrationFacts({ ...FACTS, charsPerSecond: 30.4 });
    expect(charsPerSecond()).toBe(30.4);
    expect(narrationHealth()).toEqual({ source: "gnosia-audio", version: "0.1.0", charsPerSecond: 30.4, spokenWords: 4 });
  });

  it("is what the brief's validator measures a script with", () => {
    const line = "A request starts at the client and ends at the database, and every step between is one box. ".repeat(3).trim();
    const brief = {
      title: "Two boxes",
      topic: "tcp-congestion-control",
      slug: "two-boxes",
      mode: "new",
      idea: "A request crosses an API.",
      audience: "familiar",
      targetSeconds: 60,
      voice: "af_heart",
      scenes: [
        { name: "why_it_matters", beats: [{ say: line, show: "two boxes", labels: [] }, { say: line, show: "an arrow", labels: [] }] },
        { name: "recap", beats: [{ say: line, show: "a recap", labels: [] }] },
      ],
      concepts: [],
    };
    keepNarrationFacts(FACTS);
    const valid = validateVideoBrief(brief, testVocabulary());
    const atFifteen = predictedSeconds(valid);
    // Twice the rate is half the length, which no longer fills a minute.
    keepNarrationFacts({ ...FACTS, charsPerSecond: 30.4 });
    expect(predictedSeconds(valid)).toBeCloseTo(atFifteen / 2, 5);
    expect(() => validateVideoBrief(brief, testVocabulary())).toThrow(/add about \d+ characters/);
  });

  it("falls back to the figure this machine's gnosia-audio holds, when one is installed", async (context) => {
    const root = manimkcRoot();
    const python = path.join(root, ".venv", "bin", "python");
    if (!existsSync(python)) return context.skip(`no manimkc .venv at ${root}`);
    const facts = await readNarrationFacts(root, python);
    if (facts === null) return context.skip("gnosia-audio is not installed in that .venv (make narration-deps)");
    const timing = JSON.parse(await readFile(facts.data.timing, "utf8")) as { charsPerSecond: number };
    expect(facts.charsPerSecond).toBe(timing.charsPerSecond);
    // The fallback is only for before gnosia-audio answers; if the package's
    // figure moves, this is where the fallback is found stale.
    expect(FALLBACK_CHARS_PER_SECOND).toBe(timing.charsPerSecond);
    expect(facts.spoken).toContain("CPU");
    expect(facts.spoken.length).toBeGreaterThan(50);
  }, 60_000);
});

describe("the abbreviation warning (V11)", () => {
  it("flags what manimkc's lint flags: runs of capitals the table does not rewrite", () => {
    const lines = ["The CPU stalls on a RAW hazard; the ACL and TCP decide.", "NixOS, WireGuard, CS4223 and JSON; the ACL again, OK."];
    expect(abbreviationsIn(lines, FACTS.spoken)).toEqual(["ACL", "TCP", "NixOS"]);
    expect(abbreviationsIn(lines, [])).toEqual(["CPU", "RAW", "ACL", "TCP", "NixOS", "CS4223"]);
  });

  it("is null before gnosia-audio answers, empty for a silent video, and the list otherwise", () => {
    const brief = { voice: "af_heart", scenes: [{ name: "one", beats: [{ say: "The CPU asks the ACL." }] }] };
    expect(videoAbbreviations(brief)).toBeNull();
    keepNarrationFacts(FACTS);
    expect(videoAbbreviations(brief)).toEqual(["ACL"]);
    expect(videoAbbreviations({ ...brief, voice: "none" })).toEqual([]);
    expect(videoAbbreviations({ voice: "af_heart", scenes: "nonsense" })).toEqual([]);
  });

  it("rides on each video brief in the transcript, and never on a diagram's", () => {
    const at = "2026-09-30T00:00:00.000Z";
    const video = { voice: "af_heart", scenes: [{ name: "one", beats: [{ say: "The CPU asks the ACL.", show: "x", labels: [] }] }] };
    const events: TranscriptEvent[] = [
      { seq: 1, type: "message", at, text: "@video a video" },
      { seq: 2, type: "reply", at, text: "Here it is." },
      { seq: 3, type: "brief", at, replySeq: 2, kind: "video", brief: video, requestSeq: 1 },
      { seq: 4, type: "brief", at, replySeq: 2, kind: "diagram", brief: { title: "The CPU and the ACL" }, requestSeq: 1 },
    ];
    const without = transcriptOf(events).find((entry) => entry.seq === 2)!;
    expect(without.briefs?.map((brief) => brief.abbreviations)).toEqual([undefined, undefined]);
    keepNarrationFacts(FACTS);
    const reply = transcriptOf(events).find((entry) => entry.seq === 2)!;
    expect(reply.briefs?.map((brief) => [brief.kind, brief.abbreviations])).toEqual([
      ["video", ["ACL"]],
      ["diagram", undefined],
    ]);
  });
});

describe("the toolchain without gnosia-audio", () => {
  it("names make narration-deps, so the doctor turns videos off rather than failing a job", () => {
    const tools = {
      platform: "darwin",
      sandboxExec: "/usr/bin/sandbox-exec",
      manimkcRoot: "/opt/manimkc",
      ffmpeg: { link: "/f", real: "/f", home: null },
      ffprobe: { link: "/f", real: "/f", home: null },
      python3: { link: "/p", real: "/p", home: null },
      venvPython: { link: "/opt/manimkc/.venv/bin/python", real: "/p", home: null },
      ttsPython: { link: "/t", real: "/t", home: null },
      kokoroModel: "/hub/models--hexgrad--Kokoro-82M",
      node: "/usr/local/bin/node",
      narration: null,
    } as unknown as Toolchain;
    expect(toolchainProblems(tools)).toEqual(["gnosia-audio, the narration package, does not answer in /opt/manimkc/.venv: run make narration-deps there"]);
    expect(toolchainProblems({ ...tools, narration: FACTS })).toEqual([]);
  });
});

describe("discovering the toolchain", () => {
  it("keeps the answer of the read that started last, whichever finishes first", () => {
    const older = startNarrationRead();
    const newer = startNarrationRead();
    expect(settleNarrationRead(newer, FACTS)).toBe(true);
    // The older read timed out after the newer one succeeded: it changes nothing.
    expect(settleNarrationRead(older, null)).toBe(false);
    expect(narrationFacts()).toBe(FACTS);
    // A read started after both still replaces it, a failure included.
    expect(settleNarrationRead(startNarrationRead(), null)).toBe(true);
    expect(narrationFacts()).toBeNull();
  });

  it("forgets gnosia-audio's last answer when it stops answering, so health says fallback", async () => {
    keepNarrationFacts(FACTS);
    const saved = process.env.MANIMKC_ROOT;
    process.env.MANIMKC_ROOT = "/nonexistent/manimkc";
    try {
      const tools = await discoverToolchain();
      expect(tools.narration).toBeNull();
      expect(narrationFacts()).toBeNull();
      expect(narrationHealth().source).toBe("fallback");
    } finally {
      if (saved === undefined) delete process.env.MANIMKC_ROOT;
      else process.env.MANIMKC_ROOT = saved;
    }
  }, 60_000);
});
