import { describe, expect, it } from "vitest";

import {
  changedLines,
  changeDraftOutcome,
  childJob,
  changeProblem,
  chapterTitle,
  CHANGE_LIMIT,
  filterVideos,
  gridSections,
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
  uniqueWarnings,
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
    const two = steps({ storyboard: { state: "done" }, preview: { state: "running", rounds: 2 }, look: { state: "running" } });
    const rows = stepRows(job({ state: "failed", steps: two }));
    // The furthest running step is where it stopped; the earlier one had run.
    expect(rows.filter((row) => row.status === "failed").map((row) => row.key)).toEqual(["look"]);
    expect(rows.find((row) => row.key === "preview")?.status).toBe("done");
    const gate = steps({ preview: { state: "running" }, check: { state: "failed" } });
    expect(stepRows(job({ state: "failed", steps: gate })).filter((row) => row.status === "failed").map((row) => row.key)).toEqual(["check"]);
  });

  it("shows one step active when the runner reports several running, the furthest", () => {
    // Narration waits for a narrate call while the scenes are written.
    const several = job({
      phase: "narration",
      steps: steps({
        storyboard: { state: "done", rounds: 1 },
        narration: { state: "running", rounds: 0, note: "4 of 6 lines already voiced" },
        setup: { state: "done", rounds: 1 },
        "scene-code": { state: "running", rounds: 1 },
      }),
    });
    const rows = stepRows(several);
    expect(rows.filter((row) => row.status === "current").map((row) => row.key)).toEqual(["scene-code"]);
    expect(rows.find((row) => row.key === "narration")).toMatchObject({ status: "pending", note: "4 of 6 lines already voiced" });
    expect(videoHeadline(several)).toBe("Writing the scenes");
    expect(videoStepCount(several)).toBe("Step 4 of 11");
    // A timeout with no step failed by the runner lands on the step that was active, not on narration.
    const timedOut = stepRows({ ...several, state: "failed", errorKind: "timeout" });
    expect(timedOut.filter((row) => row.status === "failed").map((row) => row.key)).toEqual(["scene-code"]);
  });

  it("keeps narration pending, with its note, until the agent's first narrate call", () => {
    // As the runner reports it since step 2a: seeding is a note, not the step running.
    const early = job({
      phase: "scene-code",
      steps: steps({
        storyboard: { state: "done", rounds: 1 },
        narration: { state: "pending", note: "4 of 6 lines already voiced" },
        setup: { state: "done", rounds: 1 },
        "scene-code": { state: "running", rounds: 1 },
      }),
    });
    expect(stepRows(early).find((row) => row.key === "narration")).toMatchObject({ status: "pending", note: "4 of 6 lines already voiced" });
    expect(videoHeadline(early)).toBe("Writing the scenes");
    // Killed mid-build, nothing running and narration never called: the failure is the build, not narration.
    const killed = job({
      state: "interrupted",
      steps: steps({
        storyboard: { state: "done" },
        narration: { state: "pending" },
        setup: { state: "done" },
        "scene-code": { state: "done" },
        lint: { state: "done" },
        preview: { state: "done" },
        look: { state: "done" },
      }),
    });
    expect(stepRows(killed).filter((row) => row.status === "failed").map((row) => row.key)).toEqual(["build"]);
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
    // An escaped entity stays escaped once: `&amp;lt;` is the text "&lt;", never "<".
    expect(parseVtt("WEBVTT\n\n00:00.000 --> 00:01.000\na &amp;lt; b &lt; c")[0]?.text).toBe("a &lt; b < c");
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

  it("lists each warning once, with how often it came up", () => {
    expect(uniqueWarnings(["lint: a", "lint: b", "lint: a"])).toEqual([
      { text: "lint: a", count: 2 },
      { text: "lint: b", count: 1 },
    ]);
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
    expect(videoFailure(job({ state: "failed", errorKind: "timeout" })).headline).toBe("It stopped: nothing moved for too long");
    expect(videoFailure(job({ state: "interrupted" })).actions).toEqual(["resume"]);
    expect(videoFailure(job({ state: "failed", errorKind: "agent", error: "401" }))).toMatchObject({ actions: [], detail: "401" });
  });
});

describe("where a change leads", () => {
  it("opens only a conversation the runner names, and not one about a diagram", () => {
    expect(changeDraftOutcome({ ok: true, data: { draftId: "d-9", sourceKind: "video" } })).toEqual({ draftId: "d-9" });
    expect(changeDraftOutcome({ ok: true, data: { draftId: "d-9" } })).toEqual({ draftId: "d-9" });
    expect(changeDraftOutcome({ ok: true, data: { draftId: "d-9", kind: "diagram" } })).toHaveProperty("problem");
    expect(changeDraftOutcome({ ok: true, data: {} })).toHaveProperty("problem");
    // A runner before `sourceKind` looks for a diagram with the slug and answers 404.
    // Step 2a's own refusals, by reason.
    expect(changeDraftOutcome({ ok: false, status: 404, refusal: { error: "no video", detail: { reason: "no-video", source: "gone" } } })).toEqual({
      problem: "This video is no longer in the catalog, so there is nothing to change.",
    });
    expect(changeDraftOutcome({ ok: false, status: 409, refusal: { error: "x", detail: { reason: "kind-not-in-conversation" } } })).toHaveProperty("problem", "This studio cannot make videos in a conversation yet.");
    expect(changeDraftOutcome({ ok: false, status: 404, refusal: { error: "no diagram attention-weights" } })).toEqual({
      problem: "The runner found nothing to change: no diagram attention-weights",
    });
  });

  it("finds the newest job continuing this one, even when the reply naming it was lost", () => {
    const list = [job({ jobId: "child-2", parentJob: "p" }), job({ jobId: "child-1", parentJob: "p" }), job({ jobId: "p" }), { kind: "diagram", parentJob: "p" }];
    expect(childJob(list, "p")?.jobId).toBe("child-2");
    expect(childJob(list, "child-2")).toBeNull();
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

  it("reads the planned video list, and the catalog's shape too, keeping only studio videos", () => {
    // The shape step 2a plans for `GET /api/videos`.
    expect(
      readVideos({
        videos: [
          { slug: "attention-weights", title: "Attention", topic: "t", posterAssetId: "video:attention-weights", updated: at(0) },
          { slug: "no-poster", title: null, topic: null, posterAssetId: null, updated: at(1) },
          { title: "no slug" },
          null,
        ],
      }),
    ).toEqual([
      { slug: "attention-weights", title: "Attention", topic: "t", posterAssetId: "video:attention-weights", durationSeconds: null, updated: at(0) },
      { slug: "no-poster", title: null, topic: null, posterAssetId: null, durationSeconds: null, updated: at(1) },
    ]);
    // `catalog video list --json`, should the route pass it through.
    const catalog = readVideos({
      videos: [
        { origin: "studio", slug: "a", assetId: "video:a", title: "A", topic: "t", durationSeconds: 184, poster: { assetId: "poster:video:a", key: "k" }, updatedAt: at(2) },
        { origin: "manimkc", slug: null, assetId: "manimkc:x", poster: { assetId: "poster:manimkc:x" } },
        { origin: "studio", slug: "b", assetId: "video:b", poster: null },
      ],
    });
    expect(catalog.map((video) => [video.slug, video.posterAssetId, video.durationSeconds, video.updated])).toEqual([
      ["a", "video:a", 184, at(2)],
      ["b", null, null, ""],
    ]);
    expect(readVideos({ error: "no route" })).toEqual([]);
  });

  it("filters videos with the same topic chips and search as the diagrams", () => {
    const videos = readVideos({
      videos: [
        { slug: "a", title: "Attention weights", topic: "transformers", posterAssetId: "video:a" },
        { slug: "b", title: "Tunnels", topic: "networking", posterAssetId: "video:b" },
        { slug: "c", title: "Loose", topic: null, posterAssetId: null },
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
      { slug: "old", title: "Zebra", topic: "networking", updated: "2026-09-01T00:00:00.000Z" },
      { slug: "new", title: "Apple", topic: "transformers", updated: "2026-09-20T00:00:00.000Z" },
      { slug: "loose", title: "Mango", topic: null, updated: "2026-09-10T00:00:00.000Z" },
      { slug: "undated", title: "Kiwi", topic: null },
    ],
  });

  it("sorts by the view's Sort and direction, undated last either way", () => {
    expect(sortVideos(list).map((video) => video.slug)).toEqual(["new", "loose", "old", "undated"]);
    expect(sortVideos(list, { sort: "modified", direction: "asc" }).map((video) => video.slug)).toEqual(["old", "loose", "new", "undated"]);
    expect(sortVideos(list, { sort: "title", direction: "asc" }).map((video) => video.slug)).toEqual(["new", "undated", "loose", "old"]);
    expect(sortVideos(list, { sort: "created", direction: "desc" })[0]?.slug).toBe("new");
  });

  const diagrams = [
    { key: "networking", label: "Networking", items: ["tcp"] },
    { key: "none", label: "No topic", items: ["scribble"] },
  ];
  const titles = new Map([
    ["networking", "Networking"],
    ["transformers", "Attention and transformers"],
  ]);

  it("puts videos in their topic's section, and a video-only topic in its place among the rest", () => {
    const sections = gridSections(diagrams, list, "topic", titles);
    expect(sections.map((section) => `${section.label}: ${section.diagrams.join(",")} | ${section.videos.map((v) => v.slug).join(",")}`)).toEqual([
      "Attention and transformers:  | new",
      "Networking: tcp | old",
      "No topic: scribble | loose,undated",
    ]);
  });

  it("groups videos even when no diagram matches, and keeps one section with no grouping", () => {
    expect(gridSections([], list, "topic", titles).map((section) => section.key)).toEqual(["transformers", "networking", "none"]);
    const one = gridSections([{ key: "all", label: "", items: [] as string[] }], list, "none");
    expect(one).toHaveLength(1);
    expect(one[0]?.videos).toHaveLength(4);
    expect(videoGroupKey(list[0]!, "domain", new Map([["networking", "networks"]]))).toBe("networks");
    expect(videoGroupKey(list[1]!, "domain", new Map())).toBe("none");
  });
});
