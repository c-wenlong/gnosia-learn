import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VIDEO_SOURCE_BYTES_MAX } from "../../catalog/src/content/video-source-limits";
import { backendFor } from "../src/video/backend";
import { keepPreviewed, previewedDir, sceneFingerprint } from "../src/video/backends/manimkc-gate";
import { secondsForLines } from "../src/video/brief";
import type { WrapperCall } from "../src/video/calls";
import { compareLines, moovFirst, runVideoGate } from "../src/video/gate";
import { rebasePaths } from "../src/video/checkout";
import { videoPaths, type VideoPaths } from "../src/video/paths";
import { voicedLines } from "../src/video/scan";

import {
  build,
  hasPython,
  layOut,
  localScan,
  mp4Bytes,
  narratedBrief,
  narratedSource,
  preview,
  recordedTools,
  sceneSheet,
  silentBrief,
  silentSource,
} from "./video-fixture";

/**
 * The video gate's steps against recorded fixtures (Phase 1's test list):
 * the script, the labels, the sync, the length and the looked steps, for a
 * narrated brief, a silent one and a reworded line.
 */

const CLASSES = ["TB1_WhyItMatters", "TB2_Recap"];
let root: string;
let paths: VideoPaths;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "studio-video-gate-"));
  paths = rebasePaths(videoPaths("job", "two-boxes"), root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const at = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();

async function narratedJob(lines: [string, string], over: { segments?: string[]; tail?: number; chapters?: unknown[]; source?: string } = {}) {
  const brief = narratedBrief();
  const source = over.source ?? narratedSource(lines);
  const texts = over.segments ?? lines;
  const laid = await layOut(paths, {
    source,
    topic: brief.topic,
    narrated: true,
    segments: [
      { scene: CLASSES[0]!, end: 20, text: texts[0]! },
      { scene: CLASSES[1]!, end: 45, text: texts[1]! },
    ],
    chapters: over.chapters ?? [
      { scene: CLASSES[0]!, end: 21 },
      { scene: CLASSES[1]!, end: 45 + (over.tail ?? 1) },
    ],
  });
  return { brief, laid, duration: Math.round(secondsForLines(lines)) };
}

describe.skipIf(!hasPython())("the video gate", () => {
  it("passes a narrated video whose every step holds, and keeps the lint warning", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats[0]!.say) as [string, string];
    const { laid, duration } = await narratedJob(lines);
    const result = await runVideoGate({
      brief,
      paths,
      classes: CLASSES,
      startedAtMs: Date.now() - 60_000,
      sourceHashBefore: null,
      calls: [preview(at(-5_000), CLASSES, laid.sourceHash), build(at(-1_000), laid.sourceHash)],
      reads: CLASSES.map((scene) => ({ path: sceneSheet(paths, scene), at: at(-4_000) })),
      tools: recordedTools({ duration }),
    });
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.name)).toEqual(["source", "lint", "script", "topic", "build", "probe", "sync", "length", "poster", "looked"]);
    expect(result.warnings).toContain("lint: a warning to keep");
    expect(result.script?.changes.every((change) => change.kind === "unchanged")).toBe(true);
    const copies = JSON.parse(await readFile(paths.copies, "utf8")) as { files: Record<string, { sha256: string }>; durationSeconds: number };
    expect(Object.keys(copies.files).sort()).toEqual([
      "poster.jpg",
      "source/topic.yml",
      "source/two_boxes.py",
      "two-boxes.chapters.json",
      "two-boxes.mp4",
      "two-boxes.transcript.json",
      "two-boxes.vtt",
    ]);
    expect(copies.files["source/two_boxes.py"]?.sha256).toBe(laid.sourceHash);
    expect(copies.durationSeconds).toBe(duration);
  });

  it("reads a line bound with `as line` and cued on its words as the same voiceover (manimkc#38's word cues)", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats[0]!.say) as [string, string];
    const words = lines[0].split(/\s+/).map((word) => word.replace(/[^A-Za-z]/g, "")).filter((word) => word.length > 3);
    const plain = `with self.voiceover("${lines[0]}"):`;
    const source = narratedSource(lines).replace(
      plain,
      `with self.voiceover("${lines[0]}") as line:\n            line.wait_until("${words[0]}")\n            self.play(Write(Text("x")), run_time=line.until("${words[1]}"))`,
    );
    expect(source).toContain("as line:");
    const scan = await localScan(source);
    expect(voicedLines(scan)).toEqual(lines);
    const { laid, duration } = await narratedJob(lines, { source });
    const result = await runVideoGate({
      brief,
      paths,
      classes: CLASSES,
      startedAtMs: Date.now() - 60_000,
      sourceHashBefore: null,
      calls: [preview(at(-5_000), CLASSES, laid.sourceHash), build(at(-1_000), laid.sourceHash)],
      reads: CLASSES.map((scene) => ({ path: sceneSheet(paths, scene), at: at(-4_000) })),
      tools: recordedTools({ duration }),
    });
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.script?.changes.every((change) => change.kind === "unchanged")).toBe(true);
  });

  it("records a reworded line and still passes, since the agent may change the script", async () => {
    const brief = narratedBrief();
    const first = brief.scenes[0]!.beats[0]!.say;
    const reworded = `${brief.scenes[1]!.beats[0]!.say.replace("That is all", "And that is everything")}`;
    const { laid, duration } = await narratedJob([first, reworded]);
    const result = await runVideoGate({
      brief,
      paths,
      classes: CLASSES,
      startedAtMs: Date.now() - 60_000,
      sourceHashBefore: null,
      calls: [preview(at(-5_000), CLASSES, laid.sourceHash), build(at(-1_000), laid.sourceHash)],
      reads: CLASSES.map((scene) => ({ path: sceneSheet(paths, scene), at: at(-4_000) })),
      tools: recordedTools({ duration }),
    });
    expect(result.ok).toBe(true);
    const changed = result.script?.changes.filter((change) => change.kind !== "unchanged") ?? [];
    expect(changed).toEqual([{ scene: "TB2_Recap", kind: "reworded", brief: brief.scenes[1]!.beats[0]!.say, voiced: [reworded] }]);
  });

  it("fails a missing label, a transcript that is not the source, a held tail, a length off prediction, and a sheet nobody read", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats[0]!.say) as [string, string];

    // A label missing.
    brief.scenes[1]!.beats[0]!.labels = ["Database"];
    let job = await narratedJob(lines);
    let result = await runVideoGate({ brief, paths, classes: CLASSES, startedAtMs: 0, sourceHashBefore: null, calls: [build(at(0), job.laid.sourceHash)], reads: [], tools: recordedTools({ duration: job.duration }) });
    expect(result.ok).toBe(false);
    expect(result.findings.join(" ")).toContain('never shows the label "Database"');

    // The transcript's lines are not the source's.
    brief.scenes[1]!.beats[0]!.labels = ["API"];
    await rm(root, { recursive: true, force: true });
    job = await narratedJob(lines, { segments: [lines[0], "something else entirely"] });
    result = await runVideoGate({ brief, paths, classes: CLASSES, startedAtMs: 0, sourceHashBefore: null, calls: [build(at(0), job.laid.sourceHash)], reads: [], tools: recordedTools({ duration: job.duration }) });
    expect(result.steps.find((step) => step.name === "sync")?.ok).toBe(false);

    // A scene that holds its last frame too long.
    await rm(root, { recursive: true, force: true });
    job = await narratedJob(lines, { tail: 9 });
    result = await runVideoGate({ brief, paths, classes: CLASSES, startedAtMs: 0, sourceHashBefore: null, calls: [build(at(0), job.laid.sourceHash)], reads: [], tools: recordedTools({ duration: job.duration }) });
    expect(result.findings.join(" ")).toContain("TB2_Recap holds 9s of picture");

    // Dead air: the video runs well past what the lines predict.
    await rm(root, { recursive: true, force: true });
    job = await narratedJob(lines);
    result = await runVideoGate({ brief, paths, classes: CLASSES, startedAtMs: 0, sourceHashBefore: null, calls: [build(at(0), job.laid.sourceHash)], reads: [], tools: recordedTools({ duration: job.duration * 2 }) });
    expect(result.steps.find((step) => step.name === "length")?.ok).toBe(false);

    // Every step up to looked passes, and a sheet read before its last render does not count (V19).
    await rm(root, { recursive: true, force: true });
    job = await narratedJob(lines);
    result = await runVideoGate({
      brief,
      paths,
      classes: CLASSES,
      startedAtMs: 0,
      sourceHashBefore: null,
      calls: [preview(at(-9_000), CLASSES, job.laid.sourceHash), preview(at(-5_000), ["TB2_Recap"], job.laid.sourceHash), build(at(-1_000), job.laid.sourceHash)],
      reads: CLASSES.map((scene) => ({ path: sceneSheet(paths, scene), at: at(-8_000) })),
      tools: recordedTools({ duration: job.duration }),
    });
    expect(result.steps.find((step) => step.name === "looked")?.ok).toBe(false);
    expect(result.findings.join(" ")).toContain("look at the sheet for TB2_Recap");
    expect(result.looked?.TB1_WhyItMatters?.readAt).not.toBeNull();
  });

  it("fails a chapter list that is not one well-formed chapter per scene with a line in it", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats[0]!.say) as [string, string];
    const cases: [string, unknown[], RegExp][] = [
      ["empty", [], /one per scene/],
      ["one scene short", [{ scene: CLASSES[0]!, end: 21 }], /one per scene/],
      ["out of order", [{ scene: CLASSES[1]!, end: 46 }, { scene: CLASSES[0]!, end: 21 }], /one per scene/],
      ["no scene", [{ end: 21 }, { scene: CLASSES[1]!, end: 46 }], /one per scene/],
      ["no end", [{ scene: CLASSES[0]! }, { scene: CLASSES[1]!, end: 46 }], /TB1_WhyItMatters has no end time/],
      ["an end that is not a number", [{ scene: CLASSES[0]!, end: "21" }, { scene: CLASSES[1]!, end: 46 }], /TB1_WhyItMatters has no end time/],
    ];
    for (const [name, chapters, finding] of cases) {
      await rm(paths.candidate, { recursive: true, force: true });
      const { laid, duration } = await narratedJob(lines, { chapters });
      const result = await runVideoGate({
        brief,
        paths,
        classes: CLASSES,
        startedAtMs: Date.now() - 60_000,
        sourceHashBefore: null,
        calls: [preview(at(-5_000), CLASSES, laid.sourceHash), build(at(-1_000), laid.sourceHash)],
        reads: CLASSES.map((scene) => ({ path: sceneSheet(paths, scene), at: at(-4_000) })),
        tools: recordedTools({ duration }),
      });
      expect({ name, ok: result.ok }).toEqual({ name, ok: false });
      expect(result.steps.find((step) => step.name === "sync")?.ok, name).toBe(false);
      expect(result.findings.join(" "), name).toMatch(finding);
    }
  });

  it("fails a chapter with no line of the transcript in it", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats[0]!.say) as [string, string];
    const { laid, duration } = await narratedJob(lines);
    // The transcript names every line under the first scene: the second
    // scene's chapter has none.
    const transcript = JSON.parse(await readFile(paths.transcript, "utf8")) as { segments: { scene: string }[] };
    for (const segment of transcript.segments) segment.scene = CLASSES[0]!;
    await writeFile(paths.transcript, JSON.stringify(transcript), "utf8");
    const result = await runVideoGate({
      brief,
      paths,
      classes: CLASSES,
      startedAtMs: Date.now() - 60_000,
      sourceHashBefore: null,
      calls: [preview(at(-5_000), CLASSES, laid.sourceHash), build(at(-1_000), laid.sourceHash)],
      reads: CLASSES.map((scene) => ({ path: sceneSheet(paths, scene), at: at(-4_000) })),
      tools: recordedTools({ duration }),
    });
    expect(result.ok).toBe(false);
    expect(result.findings.join(" ")).toMatch(/the chapter for TB2_Recap has no line in the transcript/);
  });

  it("fails a build that is older than the source, and a source that is older than the job", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats[0]!.say) as [string, string];
    const job = await narratedJob(lines);
    let result = await runVideoGate({ brief, paths, classes: CLASSES, startedAtMs: 0, sourceHashBefore: null, calls: [build(at(0), "an-older-source")], reads: [], tools: recordedTools({ duration: job.duration }) });
    expect(result.findings.join(" ")).toContain("changed after the last successful build");
    await utimes(paths.sceneFile, new Date(0), new Date(0));
    result = await runVideoGate({ brief, paths, classes: CLASSES, startedAtMs: Date.now(), sourceHashBefore: null, calls: [], reads: [], tools: recordedTools() });
    expect(result.steps[0]).toMatchObject({ name: "source", ok: false });
  });

  it("holds a silent video to its captions, in order, with no voice and no audio stream", async () => {
    const brief = silentBrief();
    const captions = brief.scenes.map((scene) => scene.beats[0]!.say) as [string, string];
    const laid = await layOut(paths, { source: silentSource(captions), topic: brief.topic, narrated: false });
    const pass = await runVideoGate({
      brief,
      paths,
      classes: CLASSES,
      startedAtMs: 0,
      sourceHashBefore: null,
      calls: [preview(at(-5_000), CLASSES, laid.sourceHash), build(at(-1_000), laid.sourceHash)],
      reads: CLASSES.map((scene) => ({ path: sceneSheet(paths, scene), at: at(-4_000) })),
      tools: recordedTools({ duration: 17, streams: ["video"] }),
    });
    expect(pass.findings).toEqual([]);
    expect(pass.steps.find((step) => step.name === "sync")?.detail).toContain("silent");

    await rm(root, { recursive: true, force: true });
    const wrong = await layOut(paths, { source: silentSource([captions[0], "A caption nobody approved."]), topic: brief.topic, narrated: false });
    const fail = await runVideoGate({ brief, paths, classes: CLASSES, startedAtMs: 0, sourceHashBefore: null, calls: [build(at(0), wrong.sourceHash)], reads: [], tools: recordedTools({ duration: 17, streams: ["video"] }) });
    expect(fail.findings.join(" ")).toContain("must show each beat's caption");
  });

  it("refuses a class list that is not the brief's, and a topic the agent changed", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats[0]!.say) as [string, string];
    await layOut(paths, { source: narratedSource(lines).replace("TB2_Recap", "TB2_Summary"), topic: brief.topic, narrated: true });
    const renamed = await runVideoGate({ brief, paths, classes: CLASSES, startedAtMs: 0, sourceHashBefore: null, calls: [], reads: [], tools: recordedTools() });
    expect(renamed.findings.join(" ")).toContain("must be exactly TB1_WhyItMatters, TB2_Recap");
    await rm(root, { recursive: true, force: true });
    await layOut(paths, { source: narratedSource(lines), topic: "another-topic", narrated: true });
    const moved = await runVideoGate({ brief, paths, classes: CLASSES, startedAtMs: 0, sourceHashBefore: null, calls: [], reads: [], tools: recordedTools() });
    expect(moved.steps.at(-1)).toMatchObject({ name: "topic", ok: false });
  });
});

describe.skipIf(!hasPython())("the video gate's looked step, against the source it checked", () => {
  const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
  const brief = narratedBrief();
  const lines = brief.scenes.map((scene) => scene.beats[0]!.say) as [string, string];
  const final = narratedSource(lines);
  /** The final file with only TB2_Recap's class edited. */
  const tb2Edited = final.replace('labeled_box("API")', 'labeled_box("API", color=BLUE)');
  /** With only TB1's class edited. */
  const tb1Edited = final.replace('labeled_box("Client")', 'labeled_box("Client", color=RED)');
  /** With code every scene shares edited. */
  const sharedEdited = final.replace("from narration import VoiceScene", "from narration import VoiceScene\nGAP = 0.5");

  /** Lay out a finished job whose scene file is `final`, after the runner kept each of `previewed` as a preview's source. */
  async function job(previewed: string[]) {
    const laid = await narratedJob(lines, { source: final });
    for (const source of previewed) {
      await writeFile(paths.sceneFile, source, "utf8");
      await keepPreviewed(paths, [preview(at(-10_000), CLASSES, sha(source))]);
    }
    await writeFile(paths.sceneFile, final, "utf8");
    expect(sha(final)).toBe(laid.laid.sourceHash);
    return laid;
  }

  async function gate(calls: WrapperCall[], reads: { scene: string; at: string }[], duration: number) {
    return runVideoGate({
      brief,
      paths,
      classes: CLASSES,
      startedAtMs: Date.now() - 60_000,
      sourceHashBefore: null,
      calls,
      reads: reads.map((read) => ({ path: sceneSheet(paths, read.scene), at: read.at })),
      tools: recordedTools({ duration }),
    });
  }

  it("fails a sheet read before the scene file changed, though it was read after its render", async () => {
    const { laid, duration } = await job([]);
    const result = await gate(
      [preview(at(-9_000), CLASSES, sha(tb2Edited)), build(at(-1_000), laid.sourceHash)],
      CLASSES.map((scene) => ({ scene, at: at(-8_000) })),
      duration,
    );
    expect(result.steps.find((step) => step.name === "looked")?.ok).toBe(false);
    expect(result.findings.join(" ")).toContain("the scene file changed after TB1_WhyItMatters's last preview");
    expect(result.findings.join(" ")).toContain("the scene file changed after TB2_Recap's last preview");
    expect(result.looked?.TB1_WhyItMatters?.readAt).toBeNull();
  });

  it("keeps a look standing when the edit after it was inside another scene's class, as the manual's preview-what-you-changed loop does", async () => {
    // Every scene previewed and read, TB2_Recap fixed, only it previewed again and read.
    const { laid, duration } = await job([tb2Edited]);
    const calls = [preview(at(-9_000), CLASSES, sha(tb2Edited)), preview(at(-5_000), ["TB2_Recap"], laid.sourceHash), build(at(-1_000), laid.sourceHash)];
    const reads = [...CLASSES.map((scene) => ({ scene, at: at(-8_000) })), { scene: "TB2_Recap", at: at(-4_000) }];
    const result = await gate(calls, reads, duration);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.looked?.TB1_WhyItMatters?.readAt).toBe(reads[0]!.at);
  });

  it("fails that look when the edit was in the scene's own class, in shared code, or when the runner kept no copy of the file it rendered", async () => {
    for (const [name, before, kept] of [
      ["its own class", tb1Edited, true],
      ["shared code", sharedEdited, true],
      ["no kept copy", tb2Edited, false],
    ] as const) {
      await rm(root, { recursive: true, force: true });
      const { laid, duration } = await job(kept ? [before] : []);
      const calls = [preview(at(-9_000), CLASSES, sha(before)), preview(at(-5_000), ["TB2_Recap"], laid.sourceHash), build(at(-1_000), laid.sourceHash)];
      const reads = [...CLASSES.map((scene) => ({ scene, at: at(-8_000) })), { scene: "TB2_Recap", at: at(-4_000) }];
      const result = await gate(calls, reads, duration);
      expect({ name, ok: result.ok }).toEqual({ name, ok: false });
      expect(result.findings.join(" "), name).toContain("the scene file changed after TB1_WhyItMatters's last preview");
      expect(result.findings.join(" "), name).not.toContain("TB2_Recap's last preview");
    }
  });

  it("does not count a call that rendered nothing as replacing a sheet: a refused call, or a preview whose render step never ran", async () => {
    const { laid, duration } = await job([]);
    const refused: WrapperCall = { verb: "refused", startedAt: at(-7_000), endedAt: at(-7_000), exitCode: 2 };
    // The wrapper finds a sheet "rendered" by its mtime, with a second of
    // slack, so a preview whose narration failed right after another's
    // render can name a sheet it never wrote. Its steps say no render ran.
    const voiceFailed: WrapperCall = {
      ...preview(at(-6_000), CLASSES, laid.sourceHash),
      exitCode: 1,
      steps: [{ step: "narrate", exitCode: 1, ms: 300 }],
    };
    const result = await gate(
      [preview(at(-9_000), CLASSES, laid.sourceHash), refused, voiceFailed, build(at(-1_000), laid.sourceHash)],
      CLASSES.map((scene) => ({ scene, at: at(-8_000) })),
      duration,
    );
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);

    // A preview that did render replaces the sheet: the read before it is stale.
    const rendered: WrapperCall = { ...voiceFailed, exitCode: 0, steps: [{ step: "narrate", exitCode: 0, ms: 300 }, { step: "render", exitCode: 0, ms: 9_000 }] };
    const replaced = await gate(
      [preview(at(-9_000), CLASSES, laid.sourceHash), rendered, build(at(-1_000), laid.sourceHash)],
      CLASSES.map((scene) => ({ scene, at: at(-8_000) })),
      duration,
    );
    expect(replaced.findings.join(" ")).toContain("look at the sheet for TB1_WhyItMatters");
  });
});

describe.skipIf(!hasPython())("the video gate's size limit, the one Accept stores to", () => {
  it("refuses a scene file that would pass a 2 MiB read but not Accept, and counts topic.yml in the total", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats[0]!.say) as [string, string];
    const base = narratedSource(lines);
    // A trailing comment pads the file without changing what it does.
    const padded = (bytes: number): string => `${base}# ${"x".repeat(bytes - Buffer.byteLength(base) - 3)}\n`;

    const big = await narratedJob(lines, { source: padded(600 * 1024) });
    let result = await runVideoGate({ brief, paths, classes: CLASSES, startedAtMs: 0, sourceHashBefore: null, calls: [build(at(0), big.laid.sourceHash)], reads: [], tools: recordedTools({ duration: big.duration }) });
    expect(result.steps[0]).toMatchObject({ name: "source", ok: false });
    expect(result.findings.join(" ")).toContain(`at most ${VIDEO_SOURCE_BYTES_MAX} bytes of source`);
    expect(result.steps[0]?.detail).toBe(`${600 * 1024} bytes in the scene file alone, over the ${VIDEO_SOURCE_BYTES_MAX} Accept stores`);

    // Under the limit alone, over it with topic.yml.
    const topicBytes = (await stat(paths.topicYml)).size;
    await rm(root, { recursive: true, force: true });
    const over = await narratedJob(lines, { source: padded(VIDEO_SOURCE_BYTES_MAX - topicBytes + 1) });
    expect((await stat(paths.sceneFile)).size).toBeLessThan(VIDEO_SOURCE_BYTES_MAX);
    result = await runVideoGate({ brief, paths, classes: CLASSES, startedAtMs: 0, sourceHashBefore: null, calls: [build(at(0), over.laid.sourceHash)], reads: [], tools: recordedTools({ duration: over.duration }) });
    expect(result.steps[0]).toMatchObject({ name: "source", ok: false });
    expect(result.steps[0]?.detail).toContain(`${VIDEO_SOURCE_BYTES_MAX + 1} bytes of source with topic.yml`);

    // Exactly the limit together passes, through every step.
    await rm(root, { recursive: true, force: true });
    const exact = await narratedJob(lines, { source: padded(VIDEO_SOURCE_BYTES_MAX - topicBytes) });
    result = await runVideoGate({
      brief,
      paths,
      classes: CLASSES,
      startedAtMs: Date.now() - 60_000,
      sourceHashBefore: null,
      calls: [preview(at(-5_000), CLASSES, exact.laid.sourceHash), build(at(-1_000), exact.laid.sourceHash)],
      reads: CLASSES.map((scene) => ({ path: sceneSheet(paths, scene), at: at(-4_000) })),
      tools: recordedTools({ duration: exact.duration }),
    });
    expect(result.findings).toEqual([]);
    const copies = JSON.parse(await readFile(paths.copies, "utf8")) as { files: Record<string, { bytes: number }> };
    expect(copies.files["source/two_boxes.py"]!.bytes + copies.files["source/topic.yml"]!.bytes).toBe(VIDEO_SOURCE_BYTES_MAX);
  });
});

describe("a scene's fingerprint: the scene file with every other scene class set aside", () => {
  const classes = ["TB1_A", "TB2_B"];
  const file = (a: string, b: string, shared = ""): string =>
    `from manimlib import *\n${shared}\nclass TB1_A(Scene):\n    def construct(self):\n        ${a}\n\n# between\nclass TB2_B(Scene):\n    def construct(self):\n        ${b}\n`;

  it("is the same across an edit inside another scene's class, and differs across one in its own or in shared code", () => {
    const before = file("x = 1", "y = 1");
    expect(sceneFingerprint(file("x = 1", "y = 2"), "TB1_A", classes)).toBe(sceneFingerprint(before, "TB1_A", classes));
    expect(sceneFingerprint(file("x = 2", "y = 1"), "TB1_A", classes)).not.toBe(sceneFingerprint(before, "TB1_A", classes));
    expect(sceneFingerprint(file("x = 1", "y = 1", "GAP = 1"), "TB1_A", classes)).not.toBe(sceneFingerprint(before, "TB1_A", classes));
    expect(sceneFingerprint(file("x = 1", "y = 2"), "TB2_B", classes)).not.toBe(sceneFingerprint(before, "TB2_B", classes));
  });

  it("errs toward a stale look: a line at the margin inside a class ends it early, so what follows counts as shared", () => {
    const multiline = (text: string): string => file("x = 1", `y = """\n${text}\n"""`);
    // The text of TB2_B's string sits at the margin, so it is read as shared code, and an edit to it makes TB1_A's look stale too.
    expect(sceneFingerprint(multiline("one"), "TB1_A", classes)).not.toBe(sceneFingerprint(multiline("two"), "TB1_A", classes));
  });

  it("is null when the scene names another scene class, when one is defined twice, or when the scene is not a class at the margin", () => {
    expect(sceneFingerprint(file("TB2_B.helper(self)", "y = 1"), "TB1_A", classes)).toBeNull();
    expect(sceneFingerprint(file("x = 1", "y = 1", "SCENES = [TB2_B]"), "TB1_A", classes)).toBeNull();
    expect(sceneFingerprint(file("x = 1", "y = 1").replace("class TB1_A(Scene)", "class TB1_A(TB2_B)"), "TB1_A", classes)).toBeNull();
    expect(sceneFingerprint(`${file("x = 1", "y = 1")}class TB2_B(Scene):\n    pass\n`, "TB1_A", classes)).toBeNull();
    expect(sceneFingerprint("from manimlib import *\n", "TB1_A", classes)).toBeNull();
  });
});

describe("keeping the scene file a preview rendered", () => {
  it("keeps the file only when it is still the one a preview hashed, named by that hash", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "studio-previewed-"));
    const kept = rebasePaths(videoPaths("job", "two-boxes"), dir);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(kept.sceneFile), { recursive: true });
    const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
    const call = (hash: string): WrapperCall => ({ verb: "preview", scenes: CLASSES, startedAt: at(0), endedAt: at(0), exitCode: 0, sceneSha256: hash, rendered: CLASSES });
    await writeFile(kept.sceneFile, "edited since", "utf8");
    await keepPreviewed(kept, [call(sha("as previewed"))]);
    expect(await readdir(previewedDir(kept)).catch(() => [])).toEqual([]);
    await writeFile(kept.sceneFile, "as previewed", "utf8");
    await keepPreviewed(kept, [call(sha("as previewed")), { ...call("not-a-hash"), verb: "build" }]);
    expect(await readdir(previewedDir(kept))).toEqual([`${sha("as previewed")}.py`]);
    expect(await readFile(path.join(previewedDir(kept), `${sha("as previewed")}.py`), "utf8")).toBe("as previewed");
    await rm(dir, { recursive: true, force: true });
    // The runner reaches it through the job's backend: manimkc's has it, revideokc's (whose still hashes every file) does not.
    expect(backendFor("manimkc").keepPreviewed).toBe(keepPreviewed);
    expect(backendFor("revideokc").keepPreviewed).toBeUndefined();
  });

  it("at its limit, drops the oldest kept file to keep the newest", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "studio-previewed-"));
    const kept = rebasePaths(videoPaths("job", "two-boxes"), dir);
    const { mkdir, utimes } = await import("node:fs/promises");
    await mkdir(path.dirname(kept.sceneFile), { recursive: true });
    const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
    const call = (hash: string): WrapperCall => ({ verb: "preview", scenes: CLASSES, startedAt: at(0), endedAt: at(0), exitCode: 0, sceneSha256: hash, rendered: CLASSES });
    for (const [i, text] of ["first", "second", "third"].entries()) {
      await writeFile(kept.sceneFile, text, "utf8");
      await keepPreviewed(kept, [call(sha(text))], 2);
      // Whole seconds apart, so the order is the files' own on every filesystem.
      const when = new Date(Date.UTC(2026, 0, 1, 0, 0, i));
      await utimes(path.join(previewedDir(kept), `${sha(text)}.py`), when, when);
    }
    expect((await readdir(previewedDir(kept))).sort()).toEqual([`${sha("second")}.py`, `${sha("third")}.py`].sort());
    await rm(dir, { recursive: true, force: true });
  });
});

describe("comparing the voiced lines with the brief's", () => {
  it("names each kind of change", () => {
    expect(compareLines("S", ["a", "b", "c"], ["a", "b", "c"]).map((change) => change.kind)).toEqual(["unchanged", "unchanged", "unchanged"]);
    expect(compareLines("S", ["a", "b", "c"], ["a", "B", "c"]).map((change) => change.kind)).toEqual(["unchanged", "reworded", "unchanged"]);
    expect(compareLines("S", ["a", "b", "c"], ["a", "b1", "b2", "c"])[1]).toMatchObject({ kind: "split", brief: "b", voiced: ["b1", "b2"] });
    expect(compareLines("S", ["a", "c"], ["a", "x", "c"])[1]).toMatchObject({ kind: "added", voiced: ["x"] });
    expect(compareLines("S", ["a", "b", "c"], ["a", "c"])[1]).toMatchObject({ kind: "dropped", brief: "b" });
  });
});

describe("the faststart check", () => {
  it("finds the index before the media, and not after it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "studio-moov-"));
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(dir, "front.mp4"), mp4Bytes(true));
    await writeFile(path.join(dir, "back.mp4"), mp4Bytes(false));
    expect(await moovFirst(path.join(dir, "front.mp4"))).toBe(true);
    expect(await moovFirst(path.join(dir, "back.mp4"))).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});
