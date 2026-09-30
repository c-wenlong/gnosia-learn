import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  briefBlocks,
  evaluateBrief,
  fencedBlocks,
  readHold,
  readSuggest,
  stripFencedBlocks,
  type TopicChecker,
} from "../src/planner";
import {
  buildCombinedSystemPrompt,
  changingSummary,
  combinedPrompt,
  lengthOf,
  STORYBOARD_RULES,
  videosBlock,
  voicesBlock,
} from "../src/planner-prompt";
import { narratedBrief } from "./video-fixture";
import { testVocabulary } from "./vocabulary";

/**
 * The combined planner prompt (D59 of docs/STUDIO-MENTIONS.md) and how a reply
 * carrying briefs of several kinds, a `suggest` and a `hold` is read (D58, D60,
 * D61). The turn loop is in `drafts.test.ts` and `mentions.test.ts`.
 */

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs");
const doc = (name: string): string => readFileSync(path.join(docs, name), "utf8");

const noTopics: TopicChecker = { dryRun: async () => ({ ok: false, offline: false, error: "not asked", json: null }) };

describe("the combined prompt", () => {
  it("is the prompt STUDIO-MENTIONS.md quotes, word for word", () => {
    const text = doc("STUDIO-MENTIONS.md");
    const after = text.slice(text.indexOf("### The prompt, in full"));
    const quoted = /````text\n([\s\S]*?)\n````/.exec(after)?.[1];
    expect(quoted).toBe(combinedPrompt(["diagram", "video"]));
  });

  it("carries STUDIO-VIDEOS.md's storyboard rules word for word", () => {
    const text = doc("STUDIO-VIDEOS.md");
    const rules = /# Writing the storyboard\n\n([\s\S]*?)\n\n# The brief/.exec(text)?.[1];
    expect(rules).toBe(STORYBOARD_RULES);
    expect(combinedPrompt(["diagram", "video"])).toContain(STORYBOARD_RULES);
  });

  it("gives a video's shortest and longest length, and what to say when asked for less (Phase 2 measured)", () => {
    const prompt = combinedPrompt(["diagram", "video"]);
    expect(prompt).toContain("The shortest\n   video is one minute and the longest ten");
    expect(prompt).toContain("When the person asks\n   for less than a minute, set 60");
    expect(STORYBOARD_RULES).toContain("never below 60");
  });

  it("asks for a line or two above a card rather than the card again in prose, and scenes named for what they show", () => {
    const prompt = combinedPrompt(["diagram", "video"]);
    // Six of six video replies restated their card, and opened on `why_it_matters`.
    expect(prompt).not.toContain("first write a short summary");
    expect(prompt.match(/never list them again in prose/g)).toHaveLength(2);
    expect(prompt).not.toContain('"name": "why_it_matters"');
    expect(STORYBOARD_RULES).toContain("Name each scene for what it shows");
    expect(STORYBOARD_RULES).not.toContain("The first scene says why a viewer should care");
    // A retry speaks to the person, not about the refusal.
    expect(prompt).toContain("never name the refusal, a field or\nthe fix");
    // And the new topic it named, which a retry once dropped and was refused for.
    expect(prompt).toContain("with its\n`topic` block again when it names a new topic");
  });

  it("is conversation first: no brief without a tag, and the tag is the TAGS block", () => {
    const prompt = combinedPrompt(["diagram", "video"]);
    expect(prompt).toContain("conversation: answer it, and write no brief, whatever it asks for");
    expect(prompt).toContain("A TAGS block ahead of the person's words is their order");
    expect(prompt).toContain("An `@` word the TAGS\n  block does not list");
    expect(prompt).toContain("Write a brief of a kind the TAGS and WAITING blocks do not name.");
    // Each kind's brief block names its kind first.
    expect(prompt).toContain('{"kind": "diagram", "intent"');
    expect(prompt).toContain('{"kind": "video", "title"');
    // Never the fence the VOCABULARY diff reads its baseline from (C4).
    expect(prompt).not.toContain("-----BEGIN VOCABULARY-----");
  });

  it("leaves the video section out of a build without the video kind", () => {
    const diagramOnly = combinedPrompt(["diagram"]);
    expect(diagramOnly).toContain("# A diagram brief");
    expect(diagramOnly).not.toContain("# A video brief");
    expect(diagramOnly).not.toContain(STORYBOARD_RULES);
  });

  it("is followed by VOCABULARY, CORPUS, VIDEOS and VOICES, and CHANGING on a change draft", () => {
    const vocabulary = testVocabulary().entries;
    const full = buildCombinedSystemPrompt({
      kinds: ["diagram", "video"],
      vocabulary,
      corpus: [],
      videos: [
        { origin: "studio", slug: "two-boxes", assetId: "video:two-boxes", title: "Two boxes", topic: "tcp-congestion-control", durationSeconds: 184 },
        { origin: "manimkc", slug: null, assetId: "manimkc:out/x/y.mp4", title: null, topic: null, durationSeconds: null },
      ],
      changing: "slug: two-boxes",
    });
    const order = ["-----BEGIN VOCABULARY-----", "-----BEGIN CORPUS-----", "-----BEGIN VIDEOS-----", "-----BEGIN VOICES-----", "-----BEGIN CHANGING-----"];
    const at = order.map((fence) => full.indexOf(fence));
    expect(at.every((index) => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(full).toContain("two-boxes | Two boxes | tcp-congestion-control | 3 min 4 s | studio");
    expect(full).toContain("manimkc:out/x/y.mp4 | (untitled) | (no topic) | (unknown length) | manimkc");
    expect(full).not.toContain("-----BEGIN EXTENDING-----");

    const diagramOnly = buildCombinedSystemPrompt({ kinds: ["diagram"], vocabulary, corpus: [], videos: [] });
    expect(diagramOnly).not.toContain("-----BEGIN VIDEOS-----");
    expect(diagramOnly).not.toContain("-----BEGIN VOICES-----");
  });

  it("writes the VOICES block from the static list, and says when the video list could not be read", () => {
    expect(voicesBlock()).toContain("af_heart | American English, female");
    expect(videosBlock(null)).toContain("(the video list could not be read)");
    expect(videosBlock([])).toContain("(no videos yet)");
    expect(
      videosBlock([
        { origin: "remotionkc", slug: null, assetId: "remotionkc:out/a/b.mp4", title: "B", topic: "t", durationSeconds: 52 },
      ]),
    ).toContain("remotionkc:out/a/b.mp4 | B | t | 52 s | remotionkc");
    expect(lengthOf(52)).toBe("52 s");
    expect(lengthOf(0)).toBe("(unknown length)");
  });

  it("condenses a studio video's brief into the CHANGING block, line by line", () => {
    const brief = narratedBrief();
    const summary = changingSummary({ slug: "two-boxes", title: "Two boxes", topic: "networking", durationSeconds: 61.4, brief });
    expect(summary).toContain("slug: two-boxes");
    expect(summary).toContain("length: 1 min 1 s");
    expect(summary).toContain("  why_it_matters\n    say: A request starts at the client.");
    expect(summary).toContain("    labels: Client");
    // Capped like the EXTENDING block.
    const long = { ...brief, scenes: Array.from({ length: 8 }, (_, i) => ({ name: `s${i}`, beats: Array.from({ length: 40 }, () => ({ say: "x", show: "y", labels: [] })) })) };
    const capped = changingSummary({ slug: "x", title: null, topic: null, durationSeconds: null, brief: long }).split("\n");
    expect(capped).toHaveLength(200);
    expect(capped.at(-1)).toMatch(/more lines not shown/);
  });
});

describe("reading a reply with several kinds", () => {
  const diagram = { kind: "diagram", intent: "Show it.", title: "TCP window", topic: "tcp-congestion-control", slug: "tcp-window", mode: "new", elements: [{ label: "Sender" }, { label: "Receiver" }], relations: [{ from: "Sender", to: "Receiver" }], concepts: [] };
  const video = { kind: "video", ...narratedBrief(), topic: "tcp-congestion-control" };
  delete (video as Record<string, unknown>).idempotencyKey;
  const reply = (...blocks: string[]): string => ["Here are both.", ...blocks].join("\n\n");
  const fenced = (tag: string, body: unknown): string => `\`\`\`${tag}\n${typeof body === "string" ? body : JSON.stringify(body)}\n\`\`\``;

  it("keeps the last brief of each kind, and a block with no kind is a diagram", () => {
    const text = reply(fenced("brief", { ...diagram, title: "first" }), fenced("brief", video), fenced("brief", { ...diagram, kind: undefined, title: "second" }));
    const blocks = briefBlocks(text);
    expect(blocks.map((block) => block.kind).sort()).toEqual(["diagram", "video"]);
    expect(JSON.parse(blocks.find((block) => block.kind === "diagram")!.body).title).toBe("second");
  });

  it("attributes a block that does not parse by the kind it still spells", () => {
    const blocks = briefBlocks(reply(fenced("brief", '{"kind": "video", "title": "oops",')));
    expect(blocks).toEqual([{ kind: "video", body: '{"kind": "video", "title": "oops",' }]);
    expect(briefBlocks(reply(fenced("brief", "{nope")))[0]?.kind).toBe("diagram");
  });

  it("judges each kind with its own validator, and a diagram brief can never carry a video field", async () => {
    const vocabulary = testVocabulary();
    const text = reply(fenced("brief", video));
    const verdict = await evaluateBrief("video", JSON.stringify(video), text, vocabulary, noTopics);
    expect(verdict.kind).toBe("valid");
    if (verdict.kind === "valid") {
      expect(verdict.brief).not.toHaveProperty("kind");
      expect(verdict.brief).not.toHaveProperty("idempotencyKey");
      expect(verdict.brief).toMatchObject({ slug: "two-boxes", voice: "af_heart" });
    }
    const refused = await evaluateBrief("video", JSON.stringify({ ...video, targetSeconds: 600 }), text, vocabulary, noTopics);
    expect(refused).toMatchObject({ kind: "invalid", field: "targetSeconds" });
    const asDiagram = await evaluateBrief("diagram", JSON.stringify({ ...diagram, scenes: video.scenes, voice: "af_heart" }), text, vocabulary, noTopics);
    expect(asDiagram.kind).toBe("valid");
    if (asDiagram.kind === "valid") {
      expect(asDiagram.brief).not.toHaveProperty("scenes");
      expect(asDiagram.brief).not.toHaveProperty("voice");
    }
  });

  it("reads a suggestion, kept to the kinds the draft carries, and drops a malformed one quietly", () => {
    expect(readSuggest(reply(fenced("suggest", { kinds: ["video", "diagram"] })), ["diagram", "video"])).toEqual(["diagram", "video"]);
    expect(readSuggest(reply(fenced("suggest", { kinds: ["video"] })), ["diagram"])).toEqual([]);
    expect(readSuggest(reply(fenced("suggest", { kinds: ["podcast"] })), ["diagram", "video"])).toEqual([]);
    expect(readSuggest(reply(fenced("suggest", "{kinds")), ["diagram", "video"])).toEqual([]);
    expect(readSuggest("no block", ["diagram", "video"])).toEqual([]);
  });

  it("reads a hold on live cards only, with its reason on one line and capped", () => {
    const hold = fenced("hold", { kinds: ["video", "diagram"], reason: "You said\nthe topic is wrong" });
    expect(readHold(reply(hold), ["video"])).toEqual({ kinds: ["video"], reason: "You said the topic is wrong" });
    expect(readHold(reply(hold), [])).toBeNull();
    expect(readHold(reply(fenced("hold", { kinds: ["video"], reason: "x".repeat(300) })), ["video"])?.reason).toHaveLength(120);
    expect(readHold(reply(fenced("hold", { kinds: ["video"] })), ["video"])?.reason).toBe("The conversation contradicted it");
  });

  it("strips the suggest and hold blocks from what a person reads, and leaves the briefs", () => {
    const text = reply(fenced("brief", diagram), fenced("suggest", { kinds: ["video"] }), fenced("hold", { kinds: ["video"], reason: "no" }));
    const shown = stripFencedBlocks(text, ["suggest", "hold"]);
    expect(shown).toContain("```brief");
    expect(shown).not.toContain("```suggest");
    expect(shown).not.toContain("```hold");
    expect(shown.endsWith("```")).toBe(true);
  });

  it("finds a fence indented under a list item", () => {
    expect(fencedBlocks("- here:\n  ```suggest\n  {\"kinds\": [\"video\"]}\n  ```", "suggest")).toEqual(['  {"kinds": ["video"]}']);
  });
});
