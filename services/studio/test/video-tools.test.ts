import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BriefError } from "../src/brief";
import { describeVideoBriefEdit, EDITABLE_VIDEO_FIELDS } from "../src/drafts";
import { PLANNER_VIDEO_FIELDS } from "../src/planner";
import { changingSummary, combinedPrompt, toolsBlock } from "../src/planner-prompt";
import { TOOL_REASON_MAX, validateVideoBrief } from "../src/video/brief";
import { briefTool, notInStudio, toolsHealth, VIDEO_TOOL_CAPABILITIES, VIDEO_TOOL_NAMES, VIDEO_TOOL_ROUTES, VIDEO_TOOLS } from "../src/video/tools";

import { testVocabulary } from "./vocabulary";

/**
 * The studio choosing a video tool, phase 1 (docs/STUDIO-VIDEO-TOOLS.md, D71
 * to D74): the routing rows the planner is given are VIDEO-TOOLS.md's own,
 * the brief carries `tool` and `toolReason` and refuses a tool the studio has
 * no backend for, and a person's switch reaches the planner as a STUDIO note.
 * The runner's refusals at admit are in `video-runner.test.ts`.
 */

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs");

/** VIDEO-TOOLS.md's "Pick by what the video needs" table, as cells. */
function routingRows(): { need: string; tool: string; why: string }[] {
  const text = readFileSync(path.join(docs, "VIDEO-TOOLS.md"), "utf8");
  const section = text.slice(text.indexOf("## Pick by what the video needs"), text.indexOf("## The capability matrix"));
  const rows = section.split("\n").filter((line) => line.startsWith("| ")).slice(2);
  return rows.map((row) => {
    const [need = "", tool = "", why = ""] = row.replace(/^\| /, "").replace(/ \|$/, "").split(" | ");
    return { need, tool, why };
  });
}

describe("the routing rows", () => {
  it("are VIDEO-TOOLS.md's table, word for word and in its order", () => {
    const rows = routingRows();
    expect(rows.length).toBeGreaterThan(5);
    expect(VIDEO_TOOL_ROUTES).toEqual(rows);
  });

  it("name only the three tools, bar the series row", () => {
    for (const route of VIDEO_TOOL_ROUTES.slice(1)) expect(VIDEO_TOOL_NAMES).toContain(route.tool);
  });
});

/** VIDEO-TOOLS.md's capability matrix, as cells. */
function matrixRows(): { capability: string; manimkc: string; remotionkc: string; revideokc: string }[] {
  const text = readFileSync(path.join(docs, "VIDEO-TOOLS.md"), "utf8");
  const section = text.slice(text.indexOf("## The capability matrix"), text.indexOf("## Shared ground"));
  const rows = section.split("\n").filter((line) => line.startsWith("| ")).slice(2);
  return rows.map((row) => {
    const [capability = "", manimkc = "", remotionkc = "", revideokc = ""] = row.replace(/^\| /, "").replace(/ \|$/, "").split(" | ");
    return { capability, manimkc, remotionkc, revideokc };
  });
}

describe("the capability matrix", () => {
  it("is VIDEO-TOOLS.md's matrix, word for word and in its order", () => {
    const rows = matrixRows();
    expect(rows.length).toBeGreaterThan(10);
    expect(VIDEO_TOOL_CAPABILITIES).toEqual(rows);
  });
});

/**
 * Run `body` as if the studio had no backend for `name`: every tool has one
 * since phase 3, so the refusal D72 describes is exercised by taking one away
 * for the length of a test.
 */
function withoutBackend(name: string, body: () => void): void {
  const info = VIDEO_TOOLS.find((tool) => tool.name === name) as { inStudio: boolean };
  info.inStudio = false;
  try {
    body();
  } finally {
    info.inStudio = true;
  }
}

/** A tool's strength line, as the module states it. */
const strength = (name: string): string => VIDEO_TOOLS.find((tool) => tool.name === name)?.strength ?? "";

describe("the TOOLS block", () => {
  it("lists every tool with whether the studio can make it, then every routing row", () => {
    const block = toolsBlock();
    expect(block.startsWith("-----BEGIN TOOLS-----\n")).toBe(true);
    expect(block).toContain(`manimkc | available here | ${strength("manimkc")}`);
    expect(block).toContain(`revideokc | available here | ${strength("revideokc")}`);
    expect(block).toContain(`remotionkc | available here | ${strength("remotionkc")}`);
    let at = 0;
    for (const route of VIDEO_TOOL_ROUTES) {
      const next = block.indexOf(`${route.need} | ${route.tool} | ${route.why}`, at);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    expect(block).toContain("use manimkc.");
    for (const row of VIDEO_TOOL_CAPABILITIES) {
      const next = block.indexOf(`${row.capability} | ${row.manimkc} | ${row.remotionkc} | ${row.revideokc}`, at);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
  });

  it("is what health reports, tool for tool", () => {
    expect(toolsHealth()).toEqual([
      { name: "manimkc", strength: strength("manimkc"), available: true, reason: null },
      { name: "revideokc", strength: strength("revideokc"), available: true, reason: null },
      { name: "remotionkc", strength: strength("remotionkc"), available: true, reason: null },
    ]);
    expect(notInStudio("manimkc")).toBeNull();
    expect(notInStudio("revideokc")).toBeNull();
    expect(notInStudio("remotionkc")).toBeNull();
  });

  it("offers a tool only on its own doctor's verdict, once health has the verdicts (D75)", () => {
    const passing = { ok: true, checks: [] };
    const failing = { ok: false, checks: [{ name: "toolchain", ok: false, detail: "no Chrome or Chromium was found" }] };
    const health = toolsHealth({ manimkc: passing, revideokc: failing });
    expect(health.find((tool) => tool.name === "manimkc")).toMatchObject({ available: true, reason: null });
    expect(health.find((tool) => tool.name === "revideokc")).toMatchObject({
      available: false,
      reason: "this machine cannot make revideokc videos right now: toolchain: no Chrome or Chromium was found",
    });
    expect(health.find((tool) => tool.name === "remotionkc")).toMatchObject({ available: false, reason: "the remotionkc doctor has not finished its first check" });
    // No backend outweighs any verdict.
    withoutBackend("remotionkc", () => {
      expect(toolsHealth({ remotionkc: passing }).find((tool) => tool.name === "remotionkc")).toMatchObject({ available: false, reason: "remotionkc is not in the studio yet" });
    });
    // A doctor that has not answered yet offers nothing.
    expect(toolsHealth({ manimkc: passing }).find((tool) => tool.name === "revideokc")).toMatchObject({ available: false, reason: "the revideokc doctor has not finished its first check" });
  });
});

describe("the prompt's routing steps", () => {
  it("ask before proposing when the person named a tool the studio cannot make yet", () => {
    const video = combinedPrompt(["diagram", "video"]);
    expect(video).toContain("propose\n   no video brief in that reply (a diagram asked for with it still gets\n   its brief)");
    expect(video).toContain("the tool its video was made with (the CHANGING block)");
  });
});

describe("the brief's tool", () => {
  const line = "A request starts at the client and ends at the database, and every step between is one box. ".repeat(3).trim();
  const base = (): Record<string, unknown> => ({
    title: "Two boxes",
    topic: "tcp-congestion-control",
    slug: "two-boxes",
    mode: "new",
    idea: "A request crosses an API.",
    audience: "familiar",
    targetSeconds: 60,
    voice: "af_heart",
    scenes: [
      { name: "why_it_matters", beats: [{ say: line, show: "two boxes", labels: ["Client"] }, { say: line, show: "an arrow", labels: [] }] },
      { name: "recap", beats: [{ say: line, show: "a recap", labels: [] }] },
    ],
    concepts: [],
  });

  it("is optional, and absent means manimkc (D72)", () => {
    const brief = validateVideoBrief(base(), testVocabulary());
    expect(brief).not.toHaveProperty("tool");
    expect(briefTool(brief)).toBe("manimkc");
    expect(briefTool(null)).toBe("manimkc");
    expect(briefTool({ tool: "nonsense" })).toBe("manimkc");
  });

  it("keeps a tool and its reason", () => {
    const reason = "Boxes and arrows; runner-up revideokc for depth, not in the studio yet";
    const brief = validateVideoBrief({ ...base(), tool: "manimkc", toolReason: reason }, testVocabulary());
    expect(brief.tool).toBe("manimkc");
    expect(brief.toolReason).toBe(reason);
  });

  it("refuses a tool it does not know, and one the studio cannot make yet, naming the field", () => {
    const refusal = (input: Record<string, unknown>): BriefError => {
      try {
        validateVideoBrief(input, testVocabulary());
      } catch (error) {
        if (error instanceof BriefError) return error;
        throw error;
      }
      throw new Error("expected a refusal");
    };
    expect(refusal({ ...base(), tool: "blender" })).toMatchObject({ field: "tool", message: expect.stringContaining("manimkc, remotionkc, revideokc") });
    withoutBackend("remotionkc", () => {
      const later = refusal({ ...base(), tool: "remotionkc", toolReason: "Real data on a chart" });
      expect(later.field).toBe("tool");
      expect(later.message).toContain("remotionkc is not in the studio yet");
      expect(later.message).toContain("name remotionkc as the runner-up in toolReason");
    });
  });

  it("takes revideokc for a narrated video, and refuses it for a silent one", () => {
    const made = validateVideoBrief({ ...base(), tool: "revideokc", toolReason: "Depth and light on a three.js stage; runner-up manimkc" }, testVocabulary());
    expect(made.tool).toBe("revideokc");
    const scenes = (base().scenes as { name: string; beats: { say: string; show: string; labels: string[] }[] }[]).map((scene) => ({
      ...scene,
      beats: scene.beats.map((beat) => ({ ...beat, seconds: 6 })),
    }));
    expect(() => validateVideoBrief({ ...base(), voice: "none", scenes, tool: "revideokc" }, testVocabulary())).toThrow(/revideokc makes narrated videos only/);
  });

  it("takes remotionkc for a narrated video, and refuses it for a silent one (phase 3)", () => {
    const made = validateVideoBrief({ ...base(), tool: "remotionkc", toolReason: "Real data on a chart; runner-up manimkc" }, testVocabulary());
    expect(made.tool).toBe("remotionkc");
    const scenes = (base().scenes as { name: string; beats: { say: string; show: string; labels: string[] }[] }[]).map((scene) => ({
      ...scene,
      beats: scene.beats.map((beat) => ({ ...beat, seconds: 6 })),
    }));
    expect(() => validateVideoBrief({ ...base(), voice: "none", scenes, tool: "remotionkc" }, testVocabulary())).toThrow(/remotionkc makes narrated videos only/);
  });

  it("refuses a reason with no tool, one too long, and one on two lines", () => {
    expect(() => validateVideoBrief({ ...base(), toolReason: "Because" }, testVocabulary())).toThrow(/explains "tool"/);
    expect(() => validateVideoBrief({ ...base(), tool: "manimkc", toolReason: "x".repeat(TOOL_REASON_MAX + 1) }, testVocabulary())).toThrow(/toolReason/);
    expect(() => validateVideoBrief({ ...base(), tool: "manimkc", toolReason: "one\ntwo" }, testVocabulary())).toThrow(/line break/);
  });

  it("is a field the planner may write and a person may edit", () => {
    expect(PLANNER_VIDEO_FIELDS).toContain("tool");
    expect(PLANNER_VIDEO_FIELDS).toContain("toolReason");
    expect(EDITABLE_VIDEO_FIELDS).toContain("tool");
  });

  it("reaches the planner when a person switches it, and in a change's summary", () => {
    const before = { ...validateVideoBrief({ ...base(), tool: "manimkc", toolReason: "Boxes and arrows" }, testVocabulary()), idempotencyKey: undefined };
    const after = { ...before, tool: undefined, toolReason: undefined };
    delete (before as { idempotencyKey?: string }).idempotencyKey;
    delete (after as { idempotencyKey?: string }).idempotencyKey;
    // Same tool (absent is manimkc), a dropped reason: said as a reason change.
    expect(describeVideoBriefEdit(before, after)).toContain('- toolReason: "Boxes and arrows" -> (none)');
    const switched = describeVideoBriefEdit(after, { ...after, tool: "revideokc" as const });
    expect(switched).toContain("- tool: manimkc -> revideokc, the person's choice: keep it in every brief after this one");

    expect(changingSummary({ slug: "two-boxes", title: "Two boxes", topic: null, durationSeconds: null, brief: { tool: "revideokc" } })).toContain("tool: revideokc");
    expect(changingSummary({ slug: "two-boxes", title: "Two boxes", topic: null, durationSeconds: null, brief: {} })).toContain("tool: manimkc");
  });
});
