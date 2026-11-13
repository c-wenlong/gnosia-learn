import { describe, expect, it } from "vitest";

import {
  aboutLength,
  abbreviations,
  abbreviationWarning,
  beatCount,
  briefTool,
  chapterTitle,
  isVideoBrief,
  predictedSeconds,
  shortLength,
  switchedTool,
  toolRow,
  toolStopLine,
  videoModeLine,
  videoSummaryLine,
  type VideoBrief,
  type VideoToolOption,
} from "./studio-brief-video";

const line = (characters: number) => "x".repeat(characters);

/** The rate health's `video.narration` reports, gnosia-audio's timing.json figure. */
const RATE = 15.2;

const BRIEF: VideoBrief = {
  title: "How attention weights are computed",
  topic: "transformers",
  slug: "attention-weights",
  mode: "new",
  idea: "Attention weights come from comparing a query with every key.",
  audience: "familiar",
  targetSeconds: 180,
  voice: "af_heart",
  scenes: [
    { name: "why_it_matters", beats: [{ say: line(1_266), show: "A sentence.", labels: [] }] },
    { name: "recap", beats: [{ say: line(1_267), show: "A map.", labels: ["QKᵀ"] }] },
  ],
  concepts: [],
};

describe("the video card's arithmetic", () => {
  it("predicts the length from the script at the runner's rate, never from the target", () => {
    // 2,533 characters at 15.2 a second, times 1.08: 180 seconds.
    expect(Math.round(predictedSeconds(BRIEF, RATE))).toBe(180);
    const longTarget: VideoBrief = { ...BRIEF, targetSeconds: 600 };
    expect(videoSummaryLine(longTarget, RATE)).toBe("About 3 minutes, narrated (af_heart), for someone who knows the terms");
    // A faster voice is a shorter video: the rate is the runner's, not a constant here.
    expect(Math.round(predictedSeconds(BRIEF, RATE * 2))).toBe(90);
  });

  it("says the length is unknown rather than guess when the runner reports no rate", () => {
    expect(Number.isNaN(predictedSeconds(BRIEF, undefined))).toBe(true);
    expect(videoSummaryLine(BRIEF, undefined)).toBe("Length unknown, narrated (af_heart), for someone who knows the terms");
    expect(shortLength(Number.NaN)).toBe("length unknown");
  });

  it("uses each beat's seconds for a silent video", () => {
    const silent: VideoBrief = { ...BRIEF, voice: "none", scenes: [{ name: "one", beats: [{ say: "Hi", show: "x", labels: [], seconds: 5 }] }] };
    expect(predictedSeconds(silent, undefined)).toBe(5);
    expect(videoSummaryLine({ ...silent, audience: "new" }, undefined)).toBe("About 10 seconds, silent, for someone new to it");
  });

  it("words lengths the way a person reads them", () => {
    expect(aboutLength(62)).toBe("About 1 minute");
    expect(aboutLength(150)).toBe("About 3 minutes");
    expect(aboutLength(24)).toBe("About 20 seconds");
    expect(shortLength(24.4)).toBe("24 s");
    expect(shortLength(72)).toBe("1 min 12 s");
    expect(shortLength(120)).toBe("2 min");
    expect(beatCount(1)).toBe("1 beat");
  });

  it("names a scene as its chapter and says new or change", () => {
    expect(chapterTitle("why_it_matters")).toBe("Why it matters");
    expect(videoModeLine(BRIEF)).toEqual({ lead: "New video, saved as", slug: "attention-weights" });
    expect(videoModeLine({ ...BRIEF, mode: "change" }).lead).toBe("Changes");
  });

  it("warns of capitals the voice would read as a word, only in a narrated script", () => {
    const acl = { ...BRIEF, scenes: [{ name: "one", beats: [{ say: "The ACL checks TCP and ACL again. I agree.", show: "x", labels: [] }] }] };
    expect(abbreviations(acl)).toEqual(["ACL", "TCP"]);
    expect(abbreviations({ ...acl, voice: "none" })).toEqual([]);
    expect(abbreviationWarning(["ACL"])).toBe('The voice may read ACL as a word. Spell it out ("A C L") where it is said letter by letter.');
    expect(abbreviationWarning([])).toBeNull();
  });

  it("tells a video brief from anything else", () => {
    expect(isVideoBrief(BRIEF)).toBe(true);
    expect(isVideoBrief({ title: "x" })).toBe(false);
  });
});

describe("the card's tool row (docs/STUDIO-VIDEO-TOOLS.md, D73)", () => {
  const manimkc: VideoToolOption = { name: "manimkc", strength: "ManimGL: plots", available: true, reason: null };
  const revideokc: VideoToolOption = { name: "revideokc", strength: "Revideo: depth", available: false, reason: "revideokc is not in the studio yet" };

  it("reads a brief with no tool as manimkc", () => {
    expect(briefTool(BRIEF)).toBe("manimkc");
    expect(briefTool({ tool: "revideokc" })).toBe("revideokc");
  });

  it("shows the planner's reason, else what the tool is best at", () => {
    expect(toolRow({ tool: "manimkc", toolReason: "Boxes and arrows", mode: "new" }, [manimkc, revideokc])).toEqual({
      tool: "manimkc",
      line: "Boxes and arrows",
      choices: [],
      stop: null,
    });
    expect(toolRow({ mode: "new" }, [manimkc, revideokc]).line).toBe("ManimGL: plots");
    expect(toolRow({ mode: "new" }, []).line).toBeNull();
  });

  it("offers a menu only of tools the studio can make, only when there are two, and never on a change", () => {
    expect(toolRow({ mode: "new" }, [manimkc, revideokc]).choices).toEqual([]);
    const ready = { ...revideokc, available: true, reason: null };
    expect(toolRow({ mode: "new" }, [manimkc, ready]).choices).toEqual([manimkc, ready]);
    expect(toolRow({ mode: "change" }, [manimkc, ready]).choices).toEqual([]);
  });

  it("warns under the row when a job of the brief's tool was stopped for dead tools, without taking the tool away (V26)", () => {
    const stopped: VideoToolOption = { ...manimkc, toolchainStop: { jobId: "j1", at: "2026-10-03T18:17:00.000Z", detail: "dead" } };
    const row = toolRow({ mode: "new" }, [stopped, revideokc]);
    expect(row.stop).toBe(
      "Since the studio started, a manimkc job was stopped because its tools could not start on this machine. Check the tool's install before making another.",
    );
    expect(row.stop).toBe(toolStopLine(stopped));
    // Only the brief's own tool: another tool's stop says nothing about this one.
    expect(toolRow({ tool: "revideokc", mode: "new" }, [stopped, revideokc]).stop).toBeNull();
    expect(toolStopLine(manimkc)).toBeNull();
    expect(toolStopLine(undefined)).toBeNull();
  });

  it("saves a switch with the new tool and without the old reason", () => {
    const switched = switchedTool({ ...BRIEF, tool: "manimkc" as const, toolReason: "Boxes and arrows" }, "revideokc");
    expect(switched.tool).toBe("revideokc");
    expect(switched).not.toHaveProperty("toolReason");
    expect(switched.title).toBe(BRIEF.title);
  });
});
