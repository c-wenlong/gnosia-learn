import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { manualDir } from "../paths";
import { run } from "../proc";
import type { Toolchain } from "./toolchain";

/**
 * The video agent's manual (docs/STUDIO-VIDEOS.md, "The agent's prompt and
 * manual"): the manimkc-video skill rewritten for a session with one
 * command, appended to Claude Code's own system prompt with
 * `--append-system-prompt-file`, hashed and recorded on the job as
 * `manualHash`, exactly as D38 does for the tldraw manual.
 *
 * Static sections, plus one generated one: the library listing, from the
 * real checkout's `manimkc api`. The agent's own `video api` runs in the job
 * checkout, where the only topic is its own, so its usage lines would be
 * missing; the manual's listing is the complete one.
 *
 * Clean room (the owner's decision 7): no `manimkc example` over the owner's
 * videos. Two worked scenes instead, below, which the suite renders.
 */

/** A narrated worked scene built on `labeled_box` and `routed_arrow`. */
export const WORKED_NARRATED = `class WK1_Pipeline(VoiceScene):
    """A request crosses two services"""

    def construct(self):
        heading = title_text("Two services", size=40)
        heading.to_edge(UP, buff=0.45)
        with self.voiceover("A request starts at the client and ends at the database."):
            self.play(FadeIn(heading, shift=DOWN * 0.2), run_time=0.7)
            client = labeled_box("Client", width=2.2, color=IF_C)
            db = labeled_box("Database", width=2.4, color=MEM_C)
            client.move_to(LEFT * 4 + DOWN * 0.3)
            db.move_to(RIGHT * 4 + DOWN * 0.3)
            self.play(FadeIn(client), FadeIn(db))
        with self.voiceover("In between sits the API, which checks the request before it goes on."):
            api = labeled_box("API", width=1.8, color=EX_C).move_to(DOWN * 0.3)
            first = routed_arrow([client.get_right(), api.get_left()], color=GREY_B)
            second = routed_arrow([api.get_right(), db.get_left()], color=GREY_B)
            self.play(FadeIn(api), ShowCreation(first))
            self.play(ShowCreation(second))
        self.play(FadeOut(VGroup(heading, client, db, api, first, second)))
`;

/** A narrated worked scene built on `DataTable`. */
export const WORKED_TABLE = `class WK2_Table(VoiceScene):
    """Three rows of a table"""

    def construct(self):
        heading = title_text("Who holds what", size=40)
        heading.to_edge(UP, buff=0.45)
        table = DataTable(["Key", "Value"], ["1", "2", "3"], cell_w=1.8, title="Cache")
        table.move_to(DOWN * 0.3)
        with self.voiceover("The cache starts empty: three rows, nothing in them."):
            self.play(FadeIn(heading, shift=DOWN * 0.2), FadeIn(table))
        with self.voiceover("The first write puts the key alpha in row one, with the value seven."):
            self.play(*table.fill_row(0, ["alpha", "7"]))
            mark = table.box_row(0)
            self.play(ShowCreation(mark))
        self.play(FadeOut(VGroup(heading, table, mark)))
`;

/** The header every scene file starts with, as `manimkc new` writes it. */
export const WORKED_HEADER = `import os
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

function sections(wrapper: string, listing: string): string {
  return `# Making a video in the studio

You are the video agent. You write one narrated ManimGL explainer from an approved brief, the way its owner does by hand with the manimkc-video skill: write the scenes, voice them, preview, look at every contact sheet, fix, and build. The runner checks your build when you exit.

## Your commands

You have one command, and everything else is refused:

    ${wrapper} api [name ...]       the rules, the palette and every helper; a name prints one entry
    ${wrapper} lint                 check the scene file; fix every error, read every warning
    ${wrapper} narrate [Scene ...]  voice the file's voiceover lines that are not voiced yet
    ${wrapper} preview [Scene ...]  voice, render at 480p, write one contact sheet per scene
    ${wrapper} build                voice, render every scene at 1080p, join, write the transcript

Spell it exactly like that, with the absolute path, one call per Bash command. There is no shell beyond it: no cat, ls, python, git or network. Read files with the Read tool and change the scene file with the Edit tool. The scene file is the only file you may change.

## The loop

1. Write every scene into the scene file. The stubs are there already, one class per scene of the brief, named \`<PREFIX><n>_<Name>\`; keep those names and that order.
2. \`lint\`, and fix every error.
3. \`preview\`. It prints one sheet path per scene. **Read every sheet path it prints** with the Read tool and look at it. This is the step no tool does.
4. Fix what you saw, and preview only the scenes you changed: \`preview <Scene> <Scene>\`. A preview of a few scenes is faster, so when a call runs long, preview a few at a time.
5. When every sheet is clean, \`build\`, and read its report. It must say \`built\` with \`faststart yes\`.
6. Your final message says the length, which lines you changed and why, and anything you could not verify.

An error anywhere is yours to fix and run again, as the owner would: a traceback in a render (the full log is \`<Scene>.log\` beside the scene's mp4, which you may Read), a line the voice stumbles on, a join that fails. The runner does not fix renders.

## The script

The brief's lines are the script the person approved. In a narrated video, start with each beat as one \`with self.voiceover("..."):\` block holding that beat's \`say\`, in order, as a double-quoted string literal; the animations for the beat go inside the block. The closing fade goes after the last block, not inside it, or the screen goes blank for the rest of the line.

You may reword, split or respell a line when the picture or the voice needs it, as the owner would; say which and why in your final message. \`preview\` and \`build\` voice whatever the file says, and \`narrate\` re-voices on its own. Every changed line is shown to the person beside the brief's. A voiceover argument must be one plain double-quoted literal: no f-string, no variable, no concatenation at run time, because the narration step reads the file's literals and a line it cannot read has no clip.

In a silent video there is no voiceover at all. Each beat's \`say\` is its caption, shown with \`CaptionBar\` exactly as written: \`cap = CaptionBar(self)\`, then \`cap.say("the caption", hold=<the beat's seconds>)\` (or \`self.play(cap.set("the caption"))\`), in beat order.

Every beat's \`labels\` must appear on screen, and the check looks for each inside a string literal in that scene's class: put the label's text in the \`Text\`, \`labeled_box\` or \`value_tag\` that shows it.

## The frame and the house style

- The frame is 14.22 by 8 units. Keep every mobject inside x in [-6.9, 6.9] and y in [-3.8, 3.8].
- Heading at \`to_edge(UP, buff=0.45)\`; body centred around y = -0.3, so the bottom third is not empty.
- Fade the previous beat's objects out before the next beat's come in, unless they are the point of the next beat. A stale caption outliving its beat is the commonest defect.
- No \`self.wait()\` for pacing in a narrated scene: the voice sets the length.
- \`Text\` for every word on screen. \`Tex\` is not available in the studio. \`MathTex\`, \`Brace\`, \`Create\` and \`Circumscribe\` do not exist here (ManimGL 1.7.2, not Manim Community): \`ShowCreation\` and \`FlashAround\` are the names.
- Use the cslib helpers before drawing from primitives: \`labeled_box\`, \`code_text\`, \`code_lines\`, \`DataTable\`, \`CaptionBar\`, \`routed_arrow\`, \`value_tag\`.
- Numbers, names and paths on screen match what is spoken.

## The library

The whole vocabulary, from the manimkc checkout. \`api <name>\` prints one entry again.

\`\`\`text
${listing.trim()}
\`\`\`

## Looking at a sheet

For each scene's sheet, check in this order: anything cut off at the frame edge; two texts overlapping; a label sitting on the wrong row or box; an arrow pointing at a neighbour; a caption or object from an earlier beat still on screen; a \`ReplacementTransform\` between texts of different lengths (garbled glyphs: use FadeOut and FadeIn); an empty bottom half. Then the preview's timing report: a scene that runs more than four seconds past its narration is a held frame, and a silence over 2.5 seconds mid-scene is a beat with no voice.

The runner checks that you Read every scene's sheet after the render that made it, so a sheet you looked at before your last change of that scene does not count.

## Two worked scenes

The file header, which the stubs already have:

\`\`\`python
${WORKED_HEADER.trim()}
\`\`\`

A narrated scene built from \`labeled_box\` and \`routed_arrow\`:

\`\`\`python
${WORKED_NARRATED.trim()}
\`\`\`

A narrated scene built on \`DataTable\`:

\`\`\`python
${WORKED_TABLE.trim()}
\`\`\`

## Known traps

- A \`TracedPath\` keeps appending points while it is being faded: call \`trace.clear_updaters()\` before the \`FadeOut\`.
- \`Annulus\` takes \`center=\`, not \`arc_center=\`.
- \`mobject.animate.move_to(...)\` captures its target when the animation is built, so batching a move with a separate recolour in one \`self.play(...)\` silently reverts the colours. Split them into two \`play\` calls.
- \`ReplacementTransform\` between texts of different lengths garbles the glyphs. Fade one out and the other in.
- Two scenes drawing the same string at once can collide on ManimGL's temporary text file and one dies with FileNotFoundError; \`preview\` retries a failed scene on its own, and a solo preview of that scene always works.

## Never

- Change the scenes the brief names, their names or their order.
- Reach for other topics, \`new\`, \`example\`, the network, or any file outside the topic folder, the lib copy and the renders.
- Read \`lib/\` to find a helper \`api\` already lists.
`;
}

export interface VideoManual {
  hash: string;
  path: string;
  chars: number;
}

/**
 * The library listing, from the real checkout's `manimkc api`, run outside
 * any job with a clean environment and its timing line off. It reads the
 * owner's `lib/` and `topics/` and writes nothing.
 */
export async function apiListing(tools: Toolchain): Promise<{ text: string; names: string[] } | null> {
  if (tools.python3 === null) return null;
  const cli = path.join(tools.manimkcRoot, "tools", "cli", "manimkc");
  const env = { PATH: "/usr/bin:/bin", HOME: process.env.HOME ?? "", MANIMKC_TIMING: "0", LANG: "en_US.UTF-8" };
  const [text, json] = await Promise.all([
    run(tools.python3.real, [cli, "--root", tools.manimkcRoot, "api"], { cwd: tools.manimkcRoot, env, timeoutMs: 60_000 }).catch(() => null),
    run(tools.python3.real, [cli, "--root", tools.manimkcRoot, "api", "--json"], { cwd: tools.manimkcRoot, env, timeoutMs: 60_000 }).catch(() => null),
  ]);
  if (text === null || text.code !== 0 || json === null || json.code !== 0) return null;
  const parsed = json.json as { libs?: { constants?: [string, string][]; functions?: { name: string }[]; classes?: { name: string }[] }[]; manimlib?: { name: string }[] } | null;
  const names = new Set<string>();
  for (const lib of parsed?.libs ?? []) {
    for (const constant of lib.constants ?? []) if (Array.isArray(constant) && typeof constant[0] === "string") names.add(constant[0]);
    for (const fn of lib.functions ?? []) if (typeof fn.name === "string") names.add(fn.name);
    for (const cls of lib.classes ?? []) if (typeof cls.name === "string") names.add(cls.name);
  }
  for (const entry of parsed?.manimlib ?? []) if (typeof entry.name === "string") names.add(entry.name);
  return { text: text.stdout, names: [...names].filter((name) => /^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(name)).sort() };
}

/** The manual's text for a wrapper path and a listing. */
export function manualText(wrapper: string, listing: string): string {
  return sections(wrapper, listing);
}

/**
 * Write the manual under its hash and return it. The wrapper's path is in
 * the text, so each job's manual is its own file; a revise or a resume
 * continues its parent's session, whose recorded system prompt is the
 * parent's, and keeps the parent's hash.
 */
export async function writeManual(text: string): Promise<VideoManual> {
  const hash = createHash("sha256").update(text).digest("hex");
  const dir = path.join(manualDir(), "video");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${hash}.md`);
  const existing = await readFile(file, "utf8").catch(() => null);
  if (existing !== text) await writeFile(file, text, "utf8");
  return { hash, path: file, chars: text.length };
}

/** The path of a manual already written under its hash, if its bytes still match. */
export async function manualFile(hash: string): Promise<string | null> {
  const file = path.join(manualDir(), "video", `${hash}.md`);
  const body = await readFile(file, "utf8").catch(() => null);
  if (body === null) return null;
  return createHash("sha256").update(body).digest("hex") === hash ? file : null;
}
