import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GateTools } from "../src/video/gate";
import type { VideoPaths } from "../src/video/paths";
import { SCAN_CODE, type Scan } from "../src/video/scan";
import type { ValidVideoBrief } from "../src/video/brief";
import type { WrapperCall } from "../src/video/calls";

/**
 * Recorded fixtures for the video gate: a job laid out on disk the way a
 * finished build leaves it, with the sandboxed tools replaced by recorded
 * answers. The parse is Python's own `ast`, run unsandboxed here because the
 * source is the test's own; the runner always runs it inside the render
 * profile.
 */

export function hasPython(): boolean {
  try {
    execFileSync("python3", ["-c", "print(1)"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function localScan(source: string): Promise<Scan> {
  const out = execFileSync("python3", ["-I", "-c", SCAN_CODE], { input: source, encoding: "utf8" });
  return Promise.resolve(JSON.parse(out.trim().split("\n").at(-1) ?? "{}") as Scan);
}

export const HEADER = `import os
import sys

from manimlib import *

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = _HERE
while not os.path.isdir(os.path.join(_ROOT, "lib")):
    _ROOT = os.path.dirname(_ROOT)
sys.path[:0] = [os.path.join(_ROOT, "lib"), _HERE]

from cslib import *
from narration import VoiceScene
`;

/** A two-scene narrated brief, each line long enough that the length rule holds for a 60 second target. */
export function narratedBrief(): ValidVideoBrief {
  const line = (text: string): string => `${text} ${"And that is the whole of the idea, said slowly and plainly for anyone watching. ".repeat(4)}`.trim();
  return {
    title: "Two boxes",
    topic: "networking",
    slug: "two-boxes",
    mode: "new",
    idea: "A request crosses an API on its way to a database.",
    audience: "familiar",
    targetSeconds: 60,
    voice: "af_heart",
    scenes: [
      { name: "why_it_matters", beats: [{ say: line("A request starts at the client."), show: "two boxes", labels: ["Client"] }] },
      { name: "recap", beats: [{ say: line("That is all there is to it."), show: "a recap", labels: ["API"] }] },
    ],
    concepts: [],
    idempotencyKey: "fixture",
  };
}

export function silentBrief(): ValidVideoBrief {
  return {
    ...narratedBrief(),
    voice: "none",
    targetSeconds: 60,
    scenes: [
      { name: "why_it_matters", beats: [{ say: "A request starts at the client.", show: "two boxes", labels: ["Client"], seconds: 8 }] },
      { name: "recap", beats: [{ say: "That is all there is to it.", show: "a recap", labels: ["API"], seconds: 8 }] },
    ],
  };
}

export function narratedSource(lines: [string, string]): string {
  return `${HEADER}

class TB1_WhyItMatters(VoiceScene):
    def construct(self):
        box = labeled_box("Client")
        with self.voiceover("${lines[0]}"):
            self.play(FadeIn(box))
        self.play(FadeOut(box))


class TB2_Recap(VoiceScene):
    def construct(self):
        box = labeled_box("API")
        with self.voiceover("${lines[1]}"):
            self.play(FadeIn(box))
        self.play(FadeOut(box))
`;
}

export function silentSource(captions: [string, string]): string {
  return `${HEADER}

class TB1_WhyItMatters(Scene):
    def construct(self):
        cap = CaptionBar(self)
        box = labeled_box("Client")
        self.play(FadeIn(box))
        cap.say("${captions[0]}", hold=7)


class TB2_Recap(Scene):
    def construct(self):
        cap = CaptionBar(self)
        box = labeled_box("API")
        self.play(FadeIn(box))
        cap.say("${captions[1]}", hold=7)
`;
}

/** An mp4-shaped file: `ftyp`, then `moov`, then `mdat`, so the faststart walk finds the index first. */
export function mp4Bytes(moovFirst = true): Buffer {
  const box = (type: string, body: Buffer = Buffer.alloc(0)): Buffer => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + body.length, 0);
    header.write(type, 4, "latin1");
    return Buffer.concat([header, body]);
  };
  const ftyp = box("ftyp", Buffer.from("isom0000"));
  const moov = box("moov", Buffer.alloc(16));
  const mdat = box("mdat", Buffer.alloc(64));
  return Buffer.concat(moovFirst ? [ftyp, moov, mdat] : [ftyp, mdat, moov]);
}

export interface LaidOut {
  sourceHash: string;
}

/** Lay out a finished job: the source, topic.yml, the deliverable and its sidecars. */
export async function layOut(
  paths: VideoPaths,
  input: { source: string; topic: string; narrated: boolean; segments?: { scene: string; end: number; text: string }[]; chapters?: unknown[]; mp4?: Buffer },
): Promise<LaidOut> {
  await mkdir(paths.topicDir, { recursive: true });
  await mkdir(paths.outTopic, { recursive: true });
  await mkdir(paths.scenes, { recursive: true });
  await writeFile(paths.sceneFile, input.source, "utf8");
  await writeFile(paths.topicYml, `title: "Two boxes"\ntopic: ${input.topic}\nprefix: TB\n`, "utf8");
  await writeFile(paths.deliverable, input.mp4 ?? mp4Bytes());
  if (input.narrated) {
    await writeFile(paths.transcript, JSON.stringify({ video: "x.mp4", duration: 60, chapters: input.chapters ?? [], segments: input.segments ?? [] }), "utf8");
    await writeFile(paths.chapters, JSON.stringify(input.chapters ?? []), "utf8");
    await writeFile(paths.vtt, "WEBVTT\n", "utf8");
  }
  const { createHash } = await import("node:crypto");
  return { sourceHash: createHash("sha256").update(input.source).digest("hex") };
}

export function build(at: string, sceneSha256: string): WrapperCall {
  return { verb: "build", startedAt: at, endedAt: at, exitCode: 0, sceneSha256, rendered: [], deliverable: { written: true } };
}

export function preview(at: string, scenes: string[]): WrapperCall {
  return { verb: "preview", scenes, startedAt: at, endedAt: at, exitCode: 0, rendered: scenes };
}

/** Recorded answers for the sandboxed steps. */
export function recordedTools(over: Partial<{ duration: number; streams: string[]; lintErrors: { msg: string }[] }> = {}): GateTools {
  return {
    scan: localScan,
    lint: async () => ({ errors: over.lintErrors ?? [], warnings: [{ msg: "a warning to keep" }] }),
    probe: async () => ({ streams: over.streams ?? ["video", "audio"], duration: over.duration ?? 60 }),
    poster: async (_input, out) => {
      await writeFile(out, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));
      return true;
    },
  };
}

export function sceneSheet(paths: VideoPaths, scene: string): string {
  return path.join(paths.scenes, `${scene}.sheet.png`);
}
