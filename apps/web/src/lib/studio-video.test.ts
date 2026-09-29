import { describe, expect, it } from "vitest";

import {
  changedLines,
  changeProblem,
  chapterTitle,
  CHANGE_LIMIT,
  filterVideos,
  groupVideos,
  sortVideos,
  videoGroupKey,
  libraryHref,
  logLine,
  mediaHref,
  newestSheet,
  newVideoJobs,
  parseVtt,
  posterHref,
  readSheets,
  readTranscript,
  readVideos,
  readyHeadline,
  reviewActions,
  sceneTitle,
  sheetsInOrder,
  sheetSrc,
  spokenLength,
  stepRows,
  storyboard,
  videoFailure,
  videoHeadline,
  videoJobForSlug,
  videoStepCount,
  videoTileStage,
  type ContactSheet,
  type VideoBrief,
  type VideoJob,
  type VideoStep,
} from "./studio-video";

/**
 * The video job view, the video tiles and the strip are view code; every
 * decision they make is one of these functions of the runner's record.
 */

const T0 = Date.parse("2026-09-29T10:00:00.000Z");
const at = (seconds: number): string => new Date(T0 + seconds * 1000).toISOString();

const BRIEF: VideoBrief = {
  title: "How attention weights are computed",
  topic: "transformer-architecture-and-training",
  slug: "attention-weights",
  mode: "new",
  idea: "Attention weights come from comparing a query with every key, scaling, and softmax.",
  audience: "familiar",
  targetSeconds: 120,
  voice: "af_heart",
  scenes: [
    {
      name: "why_it_matters",
      beats: [
        { say: "Each word decides which other words matter.", show: "A sentence", labels: [] },
        { say: "That choice is a set of weights.", show: "Weights appear", labels: ["0.6"] },
      ],
    },
    { name: "scoring_and_scaling", beats: [{ say: "Scores come from dot products.", show: "Dots", labels: [] }] },
  ],
  concepts: [],
};

const CLASSES = ["Aw1_WhyItMatters", "Aw2_ScoringAndScaling"];

function steps(over: Partial<Record<VideoStep["name"], Partial<VideoStep>>> = {}): VideoStep[] {
  const names: VideoStep["name"][] = ["storyboard", "narration", "setup", "scene-code", "lint", "preview", "look", "build", "check", "poster", "ready"];
  return names.map((name) => ({ name, state: "pending", rounds: 0, note: null, ...over[name] }));
}

function job(over: Partial<VideoJob> = {}): VideoJob {
  return {
    jobId: "vjob-1",
    kind: "video",
    state: "running",
    phase: "preview",
    title: BRIEF.title,
    topic: BRIEF.topic,
    slug: BRIEF.slug,
    target: "videos/attention-weights.mp4",
    classes: CLASSES,
    draftId: "draft-1",
    parentJob: null,
    attempt: 1,
    turns: null,
    costUsd: null,
    costSource: null,
    steps: steps({
      storyboard: { state: "done", rounds: 1 },
      narration: { state: "done", rounds: 1 },
      setup: { state: "done", rounds: 1 },
      "scene-code": { state: "done", rounds: 2 },
      lint: { state: "done", rounds: 1 },
      preview: { state: "running", rounds: 2, note: "round 2: 1 scene(s) rendered" },
    }),
    lineChanges: [],
    gate: null,
    exitCode: null,
    written: [],
    indexed: false,
    error: null,
    errorKind: null,
    requested: at(0),
    started: at(1),
    finished: null,
    updated: at(30),
    cancelRequestedAt: null,
    note: "preview, attempt 1",
    brief: BRIEF,
    ...over,
  };
}

describe("the step list", () => {
  it("lists every step from the first second, with the running one current", () => {
    const rows = stepRows(job());
    expect(rows.map((row) => row.label)).toEqual([
      "Storyboard",
      "Narration",
      "Setup",
      "Scene code",
      "Lint",
      "Preview",
      "Look at the sheets",
      "Build",
      "Check",
      "Poster",
      "Ready for review",
    ]);
    expect(rows.find((row) => row.key === "preview")).toMatchObject({ status: "current", rounds: "Round 2", note: "Round 2: 1 scene(s) rendered" });
    expect(rows.find((row) => row.key === "build")?.status).toBe("pending");
  });

  it("is all pending but the storyboard while queued, and leaves narration out of a silent brief", () => {
    const rows = stepRows(job({ state: "queued", steps: [], brief: { ...BRIEF, voice: "none" } }));
    expect(rows.map((row) => row.key)).not.toContain("narration");
    expect(rows[0]).toMatchObject({ key: "storyboard", status: "done" });
    expect(rows.slice(1).every((row) => row.status === "pending")).toBe(true);
  });

  it("puts the lines the agent changed right after narration, while the job still runs", () => {
    const rows = stepRows(
      job({ lineChanges: [{ scene: CLASSES[0]!, kind: "reworded", brief: "That choice is a set of weights.", voiced: ["That choice is a list of weights."] }] }),
    );
    const at = rows.findIndex((row) => row.key === "lines");
    expect(rows[at - 1]?.key).toBe("narration");
    expect(rows[at]?.note).toBe("1 line differs from the brief");
  });

  it("marks the step a failed job stopped in as failed, not still running", () => {
    const rows = stepRows(job({ state: "failed", finished: at(90) }));
    expect(rows.find((row) => row.key === "preview")?.status).toBe("failed");
    expect(rows.filter((row) => row.status === "failed")).toHaveLength(1);
  });

  it("marks one step, never two, and the runner's own failed step over a running one", () => {
    const two = steps({ storyboard: { state: "done" }, preview: { state: "running" }, look: { state: "running" } });
    const rows = stepRows(job({ state: "failed", steps: two }));
    expect(rows.filter((row) => row.status === "failed").map((row) => row.key)).toEqual(["preview"]);
    expect(rows.find((row) => row.key === "look")?.status).toBe("pending");
    const gate = steps({ preview: { state: "running" }, check: { state: "failed" } });
    expect(stepRows(job({ state: "failed", steps: gate })).filter((row) => row.status === "failed").map((row) => row.key)).toEqual(["check"]);
  });

  it("marks where a job stopped between steps, when nothing was running", () => {
    const rows = stepRows(job({ state: "interrupted", steps: steps({ storyboard: { state: "done" }, narration: { state: "done" } }) }));
    expect(rows.find((row) => row.status === "failed")?.key).toBe("setup");
  });

  it("is all done once the video is ready", () => {
    const rows = stepRows(job({ state: "awaiting_review", steps: steps({ storyboard: { state: "done" }, check: { state: "running" } }) }));
    expect(rows.every((row) => row.status === "done")).toBe(true);
  });

  it("says what is happening now, and counts steps, never a percentage", () => {
    expect(videoHeadline(job())).toBe("Previewing, round 2");
    expect(videoStepCount(job())).toBe("Step 6 of 11");
    expect(videoStepCount(job({ steps: steps({ narration: { state: "done" } }).filter((s) => s.name !== "narration").map((s) => (s.name === "lint" ? { ...s, state: "running" } : s)) }))).toBe("Step 4 of 10");
    expect(videoHeadline(job({ state: "queued" }))).toBe("Waiting to start");
    expect(videoHeadline(job({ state: "awaiting_review" }))).toBe("Ready to review");
    expect(videoHeadline(job({ cancelRequestedAt: at(40) }))).toBe("Stopping");
    expect(videoStepCount(job({ state: "awaiting_review" }))).toBeNull();
  });
});

describe("the making-of log", () => {
  it("names a scene by its chapter title, not its class", () => {
    expect(logLine("read the sheet Aw2_ScoringAndScaling", job())).toBe("Read the sheet for Scoring and scaling");
    expect(logLine("read the sheet Aw1_WhyItMatters.sheet", job())).toBe("Read the sheet for Why it matters");
    expect(logLine("rendered 3 scenes at 480p in 14 s", job())).toBe("Rendered 3 scenes at 480p in 14 s");
  });
});

describe("the contact sheets", () => {
  const sheet = (scene: string, renderedAt: string | null, round = 1): ContactSheet => ({
    scene,
    title: scene,
    url: `/api/jobs/vjob-1/sheets/${scene}.png`,
    renderedAt,
    round,
  });

  it("are shown in play order, whatever order they came in", () => {
    const list = sheetsInOrder([sheet("Aw2_ScoringAndScaling", at(20)), sheet("Aw1_WhyItMatters", at(10))], CLASSES);
    expect(list.map((entry) => entry.scene)).toEqual(CLASSES);
  });

  it("give the tile the one rendered last", () => {
    expect(newestSheet([sheet("A", at(10)), sheet("B", at(40)), sheet("C", null)])?.scene).toBe("B");
    expect(newestSheet([])).toBeNull();
  });

  it("each have a URL behind the proxy that changes with every render", () => {
    expect(sheetSrc("job 1", sheet("Aw1_WhyItMatters", at(10)))).toBe(
      `/studio/api/jobs/job%201/sheets/Aw1_WhyItMatters.png?v=${encodeURIComponent(at(10))}`,
    );
    expect(sheetSrc("j", sheet("S", null))).toBe("/studio/api/jobs/j/sheets/S.png");
  });

  it("are read defensively: a malformed entry is dropped, never thrown", () => {
    expect(readSheets({ sheets: [{ scene: "A", title: "Why", url: "/x", renderedAt: at(1), round: 2 }, { title: "no scene" }, null] })).toEqual([
      { scene: "A", title: "Why", url: "/x", renderedAt: at(1), round: 2 },
    ]);
    expect(readSheets(null)).toEqual([]);
    expect(readSheets({ sheets: "nope" })).toEqual([]);
  });
});

describe("the player's captions and chapters", () => {
  it("reads a WebVTT file into cues, skipping notes, ids and tags", () => {
    const vtt = [
      "WEBVTT",
      "",
      "NOTE written by manimkc",
      "",
      "1",
      "00:00:00.500 --> 00:00:02.000 align:center",
      "<v Narrator>Each word decides</v>",
      "which words matter.",
      "",
      "00:01.250 --> 00:03.000",
      "Tom &amp; Jerry",
      "",
      "garbage --> worse",
      "nothing",
    ].join("\n");
    expect(parseVtt(vtt)).toEqual([
      { start: 0.5, end: 2, text: "Each word decides which words matter." },
      { start: 1.25, end: 3, text: "Tom & Jerry" },
    ]);
    expect(parseVtt("WEBVTT\r\n\r\n01:00:00.000 --> 01:00:01.5\r\nhi")).toEqual([{ start: 3600, end: 3601.5, text: "hi" }]);
  });

  it("reads manimkc's transcript when the runner serves it, and nothing else", () => {
    const body = {
      chapters: [{ scene: CLASSES[0], title: "Why it matters", start: 0, end: 10 }, { title: "bad" }],
      segments: [{ scene: CLASSES[0], start: 0.5, end: 2, text: "Hi" }],
    };
    expect(readTranscript(body)).toEqual({
      chapters: [{ scene: CLASSES[0], title: "Why it matters", start: 0, end: 10 }],
      cues: [{ scene: CLASSES[0], start: 0.5, end: 2, text: "Hi" }],
    });
    expect(readTranscript({ error: "not there" })).toBeNull();
    expect(readTranscript(null)).toBeNull();
  });

  it("titles a scene by its brief name, else by its class", () => {
    expect(chapterTitle("why_it_matters")).toBe("Why it matters");
    expect(sceneTitle({ classes: CLASSES, brief: BRIEF }, CLASSES[1]!)).toBe("Scoring and scaling");
    expect(sceneTitle({ classes: CLASSES, brief: undefined }, "Aw2_ScoringAndScaling")).toBe("Scoring and scaling");
  });
});

describe("the storyboard beside the player", () => {
  const changes: VideoJob["lineChanges"] = [
    { scene: CLASSES[0]!, kind: "split", brief: "That choice is a set of weights.", voiced: ["That choice is a set.", "A set of weights."] },
    { scene: CLASSES[1]!, kind: "dropped", brief: "Scores come from dot products.", voiced: [] },
    { scene: CLASSES[1]!, kind: "added", brief: null, voiced: ["Each score is a dot product."] },
  ];

  it("is the brief's lines with the agent's changes applied, each changed line marked", () => {
    const board = storyboard({ classes: CLASSES, brief: BRIEF, lineChanges: changes }, null);
    expect(board[0]).toEqual({
      scene: CLASSES[0],
      title: "Why it matters",
      start: null,
      lines: [
        { text: "Each word decides which other words matter.", changed: false },
        { text: "That choice is a set.", changed: true },
        { text: "A set of weights.", changed: true },
      ],
    });
    expect(board[1]?.lines).toEqual([{ text: "Each score is a dot product.", changed: true }]);
  });

  it("links each scene to its start, by scene name, else by position when the counts agree", () => {
    const byScene = storyboard({ classes: CLASSES, brief: BRIEF, lineChanges: [] }, [
      { scene: CLASSES[1], title: "b", start: 12, end: 20 },
      { scene: CLASSES[0], title: "a", start: 0, end: 12 },
    ]);
    expect(byScene.map((scene) => scene.start)).toEqual([0, 12]);
    const byPosition = storyboard({ classes: CLASSES, brief: BRIEF, lineChanges: [] }, [
      { title: "a", start: 0, end: 12 },
      { title: "b", start: 12.5, end: 20 },
    ]);
    expect(byPosition.map((scene) => scene.start)).toEqual([0, 12.5]);
  });

  it("lists every changed line with its scene's title, for the list under the player", () => {
    expect(changedLines({ classes: CLASSES, brief: BRIEF, lineChanges: changes }).map((line) => `${line.title}: ${line.kind}`)).toEqual([
      "Why it matters: split",
      "Scoring and scaling: dropped",
      "Scoring and scaling: added",
    ]);
  });
});

describe("the review", () => {
  const gate = {
    ok: true,
    steps: [],
    findings: [],
    warnings: ["Lint: 1 warning"],
    script: null,
    sync: null,
    length: null,
    looked: null,
    durationSeconds: 184.2,
    checkedAt: at(500),
  };

  it("says the length and how many warnings, in words", () => {
    expect(readyHeadline(job({ state: "awaiting_review", gate }))).toBe("The video is ready, 3 min 4 s, with 1 warning");
    expect(readyHeadline(job({ state: "awaiting_review", gate: { ...gate, warnings: [], durationSeconds: 58 } }))).toBe("The video is ready, 58 s");
    expect(spokenLength(120)).toBe("2 min");
    expect(spokenLength(null)).toBe("");
  });

  it("offers Accept and Discard only in review, and Change after an accept too", () => {
    expect(reviewActions(job({ state: "awaiting_review" }))).toEqual({ accept: true, discard: true, change: true });
    expect(reviewActions(job({ state: "accepted" }))).toEqual({ accept: false, discard: false, change: true });
    expect(reviewActions(job({ state: "running" }))).toEqual({ accept: false, discard: false, change: false });
  });

  it("refuses an empty change, or one longer than the runner takes", () => {
    expect(changeProblem("   ")).toBe("Say what should change.");
    expect(changeProblem("x".repeat(CHANGE_LIMIT + 1))).toMatch(/^At most 2,000 characters/);
    expect(changeProblem("The arrow in scene 3 points at the wrong box")).toBeNull();
  });

  it("names a failure by the runner's error kind, and the gate's findings when it refused", () => {
    expect(videoFailure(job({ state: "failed", errorKind: "gate", gate: { ...gate, ok: false, findings: ["No build after the last change."] } }))).toEqual({
      headline: "The checks refused the video",
      detail: "No build after the last change.",
      actions: ["revise", "talk"],
    });
    expect(videoFailure(job({ state: "failed", errorKind: "timeout" })).headline).toBe("It stopped: nothing moved for twenty minutes");
    expect(videoFailure(job({ state: "interrupted" })).actions).toEqual(["resume"]);
    expect(videoFailure(job({ state: "failed", errorKind: "agent", error: "401" }))).toMatchObject({ actions: [], detail: "401" });
  });
});

describe("the grid", () => {
  const video = (over: Partial<VideoJob>): VideoJob => job(over);

  it("gives a new video's job a card of its own, one per slug, and never a diagram job", () => {
    const jobs = [
      video({ jobId: "retry", state: "queued" }),
      video({ jobId: "first", state: "failed" }),
      { kind: "diagram", jobId: "d", state: "running", target: "learn/assets/x.tldr" },
      video({ jobId: "change", slug: "landed", target: "videos/landed.mp4" }),
    ];
    expect(newVideoJobs(jobs, new Set(["landed"]), ["first"], []).map((entry) => entry.jobId)).toEqual(["retry"]);
  });

  it("puts a change job over the landed video's tile, only while the grid shows it", () => {
    const jobs = [video({ jobId: "c", slug: "landed", target: "videos/landed.mp4", state: "cancelled" }), video({ jobId: "old", slug: "landed" })];
    expect(videoJobForSlug(jobs, "landed", [], [])).toBeNull();
    expect(videoJobForSlug([video({ jobId: "c", slug: "landed", state: "awaiting_review" })], "landed", [], [])?.jobId).toBe("c");
    expect(videoTileStage(video({ state: "awaiting_review" }))).toBe("review");
    expect(videoTileStage(video({ state: "interrupted" }))).toBe("failed");
  });

  it("reads the video list defensively and keeps only studio videos", () => {
    const videos = readVideos({
      videos: [
        { origin: "studio", slug: "attention-weights", assetId: "video:attention-weights", title: "Attention", topic: "t", concepts: ["a", 3], durationSeconds: 184, poster: { assetId: "poster:video:attention-weights", key: "k" }, narrated: true, revision: 2, revisionJob: "j", updatedAt: at(0) },
        { origin: "manimkc", slug: null, assetId: "manimkc:x" },
        { origin: "studio", slug: "no-poster", assetId: "video:no-poster", poster: null },
      ],
    });
    expect(videos.map((entry) => entry.slug)).toEqual(["attention-weights", "no-poster"]);
    expect(videos[0]?.concepts).toEqual(["a"]);
    expect(videos[1]?.poster).toBeNull();
    expect(readVideos({ error: "no route" })).toEqual([]);
  });

  it("filters videos with the same topic chips and search as the diagrams", () => {
    const videos = readVideos({
      videos: [
        { origin: "studio", slug: "a", assetId: "video:a", title: "Attention weights", topic: "transformers" },
        { origin: "studio", slug: "b", assetId: "video:b", title: "Tunnels", topic: "networking" },
        { origin: "studio", slug: "c", assetId: "video:c", title: "Loose", topic: null },
      ],
    });
    expect(filterVideos(videos, { topics: ["networking", "none"], query: "" }).map((v) => v.slug)).toEqual(["b", "c"]);
    expect(filterVideos(videos, { topics: [], query: "ATTENTION" }).map((v) => v.slug)).toEqual(["a"]);
  });

  it("links the poster, the library page and the gate's copies through the right routes", () => {
    expect(posterHref("video:a b")).toBe("/api/assets/video%3Aa%20b/poster");
    expect(libraryHref("attention-weights")).toBe("/library/video%3Aattention-weights");
    expect(mediaHref("j/1", "a.mp4")).toBe("/studio/api/jobs/j%2F1/media/a.mp4");
  });
});

describe("videos among the grid's groups", () => {
  const list = readVideos({
    videos: [
      { origin: "studio", slug: "old", assetId: "video:old", topic: "networking", updatedAt: "2026-09-01T00:00:00.000Z" },
      { origin: "studio", slug: "new", assetId: "video:new", topic: "transformers", updatedAt: "2026-09-20T00:00:00.000Z" },
      { origin: "studio", slug: "loose", assetId: "video:loose", topic: null, updatedAt: "2026-09-10T00:00:00.000Z" },
    ],
  });

  it("puts the newest first", () => {
    expect(sortVideos(list).map((video) => video.slug)).toEqual(["new", "loose", "old"]);
  });

  it("files each video where its topic's diagrams are, and makes a section for a topic with none", () => {
    const { byGroup, extra } = groupVideos(list, "topic", ["networking"], new Map([["transformers", "Transformers"]]));
    expect(byGroup.get("networking")?.map((video) => video.slug)).toEqual(["old"]);
    expect(extra.map((entry) => `${entry.key}:${entry.label}`)).toEqual(["transformers:Transformers", "none:No topic"]);
  });

  it("keeps them in one group with no grouping, and by domain when asked", () => {
    expect(groupVideos(list, "none", ["all"]).extra).toEqual([]);
    expect(videoGroupKey(list[0]!, "domain", new Map([["networking", "networks"]]))).toBe("networks");
    expect(videoGroupKey(list[1]!, "domain", new Map())).toBe("none");
  });
});
