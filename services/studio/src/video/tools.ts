/**
 * The three video tools, and which of them the studio can make a video with
 * (docs/STUDIO-VIDEO-TOOLS.md, D71 to D74).
 *
 * The planner never reads a file, so what it knows about choosing a tool is
 * this module, fenced into its system prompt as the TOOLS block. The routing
 * rows are docs/VIDEO-TOOLS.md's "Pick by what the video needs", verbatim and
 * in its order; `test/video-tools.test.ts` fails when the two disagree, so
 * that page stays the one place routing is decided, for an agent at a
 * terminal and for the studio alike.
 */

export const VIDEO_TOOL_NAMES = ["manimkc", "remotionkc", "revideokc"] as const;
export type VideoToolName = (typeof VIDEO_TOOL_NAMES)[number];

/** A brief with no `tool` is a manimkc brief: every one written before D72. */
export const DEFAULT_VIDEO_TOOL: VideoToolName = "manimkc";

export interface VideoToolInfo {
  name: VideoToolName;
  /** What it is best at, in one line: the TOOLS block and the card's menu. */
  strength: string;
  /**
   * Whether the studio's runner has a backend for it. False is a refusal at
   * validation (D72); true still needs this machine's video doctor to pass,
   * which the card and the press check.
   */
  inStudio: boolean;
}

export const VIDEO_TOOLS: readonly VideoToolInfo[] = [
  {
    name: "manimkc",
    strength: "ManimGL: function plots, equation morphs, 3D maths, and the boxes-and-arrows house style of every series so far",
    inStudio: true,
  },
  {
    name: "revideokc",
    strength: "Revideo: depth and light on a three.js stage, code edited in place, springy hand-choreographed diagram motion",
    inStudio: true,
  },
  {
    name: "remotionkc",
    strength: "Remotion: real data on charts, word-level captions, editor and terminal walkthroughs, footage and transitions",
    inStudio: false,
  },
];

export function isVideoToolName(value: unknown): value is VideoToolName {
  return typeof value === "string" && (VIDEO_TOOL_NAMES as readonly string[]).includes(value);
}

export function videoToolInfo(name: VideoToolName): VideoToolInfo {
  const info = VIDEO_TOOLS.find((tool) => tool.name === name);
  if (info === undefined) throw new Error(`no video tool ${name}`);
  return info;
}

/** Why the studio cannot make a video with this tool, or null when it can. */
export function notInStudio(name: VideoToolName): string | null {
  return videoToolInfo(name).inStudio ? null : `${name} is not in the studio yet`;
}

/** The tool a stored brief names, defaulting as D72 says. */
export function briefTool(brief: unknown): VideoToolName {
  const tool = typeof brief === "object" && brief !== null ? (brief as { tool?: unknown }).tool : undefined;
  return isVideoToolName(tool) ? tool : DEFAULT_VIDEO_TOOL;
}

export interface VideoToolRoute {
  /** "The video mainly needs". */
  need: string;
  /** "Tool", as the page writes it ("the series' tool, usually manimkc"). */
  tool: string;
  /** "Why". */
  why: string;
}

/** docs/VIDEO-TOOLS.md, "Pick by what the video needs", in order; the test holds the two equal. */
export const VIDEO_TOOL_ROUTES: readonly VideoToolRoute[] = [
  {
    need: "A new week of a series that already exists (CS3230, CS4223, CS4225 lecture videos)",
    tool: "the series' tool, usually manimkc",
    why: "Viewers watch a series in order; a change of look between weeks reads as a mistake",
  },
  {
    need: "Continuous maths: function plots, areas, Riemann sums, geometric proofs, linear maps, vector fields",
    tool: "manimkc",
    why: "`Axes`, `get_graph`, `NumberPlane` with `ApplyMatrix`, `VectorField` and `StreamLines` exist and are exact; nothing else here has them",
  },
  {
    need: "An equation whose symbols slide into their new places (a derivation, a recurrence being unrolled)",
    tool: "manimkc",
    why: "`TransformMatchingTex` moves glyphs; Revideo's `Latex` is an image that only cross-fades, and remotionkc's label-to-label morph is weaker than manim's glyph transforms",
  },
  {
    need: "3D maths objects: surfaces, solids, cutaways, a camera orbiting a shape",
    tool: "manimkc",
    why: "Lit `Sphere`, `Torus`, `Prismify`, `ThreeDAxes.get_graph`, clip planes, `fix_in_frame` labels, all headless",
  },
  {
    need: "Real data on a chart (a series from a file, log axes, a trend line)",
    tool: "remotionkc",
    why: "d3-style scales and SVG in React, driven by the frame; its prototype's data chart was the strongest of the three",
  },
  {
    need: "Words on screen that must match the voice (word-level captions, kinetic text)",
    tool: "remotionkc",
    why: "`@remotion/captions` and whisper.cpp give paged, per-word captions; the other two have no captions pipeline",
  },
  {
    need: "A code walkthrough in an editor and a terminal, variables changing beside it",
    tool: "remotionkc",
    why: "CSS layout makes an editor, a variables panel and a terminal cheap; its prototype beat manimkc clearly here",
  },
  {
    need: "Real footage or a screen recording, transitions between shots, sound effects",
    tool: "remotionkc",
    why: "`<Video>` with trim and effects, `TransitionSeries` with twenty presentations, `@remotion/sfx`; neither other tool composites footage well",
  },
  {
    need: "The same composition embedded live in the web app, or many videos from one template",
    tool: "remotionkc",
    why: "`<Player>` runs a composition in Next.js without rendering, and props make one composition a template",
  },
  {
    need: "Depth and light: layers stacked in perspective, a spotlight following the story, soft shadows, glass cards",
    tool: "revideokc",
    why: "A three.js scene inside the 2D stage, with 2D titles, code and formulas drawn over it; filters dim or blur the stage behind a panel",
  },
  {
    need: "Code that is edited in place while the voice explains the change (a loop from `a[i]` to `a[16 * i]`), with the other lines dimmed",
    tool: "revideokc",
    why: "`Code` reflows lines around an insert or a replace and tweens a selection; this is its strongest 2D feature",
  },
  {
    need: "Hand-choreographed diagram motion: things that spring into place, masks and reveals, light that adds over a diagram",
    tool: "revideokc",
    why: "Springs, `compositeOperation`, `cache` masks, radial gradients, flexbox layout, signals binding one node to another",
  },
  {
    need: "Boxes, tables and arrows with nothing above",
    tool: "manimkc",
    why: "It is the house style of every series so far, and the studio can already make it",
  },
];

/** What a tool's doctor last said, as health reads it: absent before its first answer. */
export interface ToolDoctorVerdict {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
}

/**
 * Health's `video.tools` (D73): each tool, what it is best at, and why the
 * studio cannot make a video with it when it cannot. Given the doctors'
 * verdicts (D75: one per backend), a tool is available only when its own
 * doctor passes on this machine, and its reason is the doctor's first
 * failing check; without them, only whether the studio has a backend.
 */
export function toolsHealth(
  verdicts?: Partial<Record<VideoToolName, ToolDoctorVerdict | null>>,
): { name: VideoToolName; strength: string; available: boolean; reason: string | null }[] {
  return VIDEO_TOOLS.map((tool) => {
    const missing = notInStudio(tool.name);
    if (missing !== null || verdicts === undefined) return { name: tool.name, strength: tool.strength, available: tool.inStudio, reason: missing };
    const verdict = verdicts[tool.name];
    if (verdict === undefined || verdict === null) {
      return { name: tool.name, strength: tool.strength, available: false, reason: `the ${tool.name} doctor has not finished its first check` };
    }
    const failing = verdict.checks.find((check) => !check.ok);
    return {
      name: tool.name,
      strength: tool.strength,
      available: verdict.ok,
      reason: verdict.ok ? null : `this machine cannot make ${tool.name} videos right now: ${failing === undefined ? "its doctor fails" : `${failing.name}: ${failing.detail}`}`,
    };
  });
}

export interface VideoToolCapability {
  capability: string;
  manimkc: string;
  remotionkc: string;
  revideokc: string;
}

/** docs/VIDEO-TOOLS.md, "The capability matrix", in order: step 5 of its procedure checks a second visual here. */
export const VIDEO_TOOL_CAPABILITIES: readonly VideoToolCapability[] = [
  { capability: "Function plots, axes, areas", manimkc: "built", remotionkc: "via d3 and SVG", revideokc: "no" },
  { capability: "Glyph-level equation morphs", manimkc: "built", remotionkc: "weak", revideokc: "no (cross-fade)" },
  { capability: "Typeset maths", manimkc: "yes (Tex through Tectonic)", remotionkc: "yes (KaTeX)", revideokc: "yes (MathJax)" },
  { capability: "3D maths surfaces and solids", manimkc: "yes", remotionkc: "via three.js", revideokc: "via three.js" },
  { capability: "3D scene with lights and shadows", manimkc: "yes (shading, moving light)", remotionkc: "yes (`@remotion/three`; looked plain in the prototype)", revideokc: "yes (spotlight, shadow maps, glass)" },
  { capability: "Vector fields, stream lines", manimkc: "built", remotionkc: "no", revideokc: "no" },
  { capability: "Boolean shape ops (Venn, overlaps)", manimkc: "built", remotionkc: "via SVG paths", revideokc: "no" },
  { capability: "Data charts from real data", manimkc: "built (`BarChart`, `Axes`)", remotionkc: "yes", revideokc: "possible, untested" },
  { capability: "Word-level captions", manimkc: "no", remotionkc: "yes", revideokc: "no" },
  { capability: "Code panel with syntax highlighting", manimkc: "built (`Code`, Pango)", remotionkc: "yes", revideokc: "yes (Lezer)" },
  { capability: "Code edited in place with reflow", manimkc: "no", remotionkc: "by hand", revideokc: "yes" },
  { capability: "Terminal and UI mock-ups", manimkc: "by hand", remotionkc: "yes", revideokc: "by hand" },
  { capability: "Footage, screen recordings, transitions, SFX", manimkc: "no", remotionkc: "yes", revideokc: "partial (`Video`, few transitions)" },
  { capability: "Springs, masks, additive light, filters", manimkc: "partial", remotionkc: "yes (CSS)", revideokc: "yes" },
  { capability: "Visuals cued on the spoken word", manimkc: "yes (`narration.word_times`)", remotionkc: "yes", revideokc: "yes" },
  { capability: "Studio can make it unattended", manimkc: "on macOS only", remotionkc: "not yet", revideokc: "on macOS only" },
  { capability: "Render speed, 1080p, measured on the owner's Mac", manimkc: "about 30 s for a 79 s scene, 8 scenes in parallel", remotionkc: "32 to 75 s for 68 to 113 s videos, concurrency 3", revideokc: "about 25 s for a 62 s video with a 3D stage, 2 workers" },
];
