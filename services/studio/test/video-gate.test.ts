import { mkdtemp, readFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { secondsForLines } from "../src/video/brief";
import { compareLines, moovFirst, runVideoGate } from "../src/video/gate";
import { rebasePaths } from "../src/video/checkout";
import { videoPaths, type VideoPaths } from "../src/video/paths";

import {
  build,
  hasPython,
  layOut,
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

async function narratedJob(lines: [string, string], over: { segments?: string[]; tail?: number } = {}) {
  const brief = narratedBrief();
  const source = narratedSource(lines);
  const texts = over.segments ?? lines;
  const laid = await layOut(paths, {
    source,
    topic: brief.topic,
    narrated: true,
    segments: [
      { scene: CLASSES[0]!, end: 20, text: texts[0]! },
      { scene: CLASSES[1]!, end: 45, text: texts[1]! },
    ],
    chapters: [
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
      calls: [preview(at(-5_000), CLASSES), build(at(-1_000), laid.sourceHash)],
      reads: CLASSES.map((scene) => ({ path: sceneSheet(paths, scene), at: at(-4_000) })),
      tools: recordedTools({ duration }),
    });
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.name)).toEqual(["source", "lint", "script", "topic", "build", "probe", "sync", "length", "poster", "looked"]);
    expect(result.warnings).toContain("lint: a warning to keep");
    expect(result.script?.changes.every((change) => change.kind === "unchanged")).toBe(true);
    const copies = JSON.parse(await readFile(paths.copies, "utf8")) as { files: Record<string, { sha256: string }>; durationSeconds: number };
    expect(Object.keys(copies.files).sort()).toEqual(["poster.jpg", "two-boxes.chapters.json", "two-boxes.mp4", "two-boxes.transcript.json", "two-boxes.vtt"]);
    expect(copies.durationSeconds).toBe(duration);
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
      calls: [preview(at(-5_000), CLASSES), build(at(-1_000), laid.sourceHash)],
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
      calls: [preview(at(-9_000), CLASSES), preview(at(-5_000), ["TB2_Recap"]), build(at(-1_000), job.laid.sourceHash)],
      reads: CLASSES.map((scene) => ({ path: sceneSheet(paths, scene), at: at(-8_000) })),
      tools: recordedTools({ duration: job.duration }),
    });
    expect(result.steps.find((step) => step.name === "looked")?.ok).toBe(false);
    expect(result.findings.join(" ")).toContain("look at the sheet for TB2_Recap");
    expect(result.looked?.TB1_WhyItMatters?.readAt).not.toBeNull();
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
      calls: [preview(at(-5_000), CLASSES), build(at(-1_000), laid.sourceHash)],
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
