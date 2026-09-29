import { describe, expect, it } from "vitest";

import {
  aboutLength,
  abbreviations,
  abbreviationWarning,
  beatCount,
  chapterTitle,
  isVideoBrief,
  predictedSeconds,
  shortLength,
  videoModeLine,
  videoSummaryLine,
  type VideoBrief,
} from "./studio-brief-video";

const line = (characters: number) => "x".repeat(characters);

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
  it("predicts the length from the script at the measured rate, never from the target", () => {
    // 2,533 characters at 15.2 a second, times 1.08: 180 seconds.
    expect(Math.round(predictedSeconds(BRIEF))).toBe(180);
    const longTarget: VideoBrief = { ...BRIEF, targetSeconds: 600 };
    expect(videoSummaryLine(longTarget)).toBe("About 3 minutes, narrated (af_heart), for someone who knows the terms");
  });

  it("uses each beat's seconds for a silent video", () => {
    const silent: VideoBrief = { ...BRIEF, voice: "none", scenes: [{ name: "one", beats: [{ say: "Hi", show: "x", labels: [], seconds: 5 }] }] };
    expect(predictedSeconds(silent)).toBe(5);
    expect(videoSummaryLine({ ...silent, audience: "new" })).toBe("About 10 seconds, silent, for someone new to it");
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
