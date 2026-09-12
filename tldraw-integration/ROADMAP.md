# Roadmap

Phases in order. Each has a definition of done that an agent can verify
without asking. Do not start a phase before the previous one's checklist
is green; do open a PR per phase, following the shipping loop in the root
AGENTS.md of whichever repo the change lands in.

Status key: `[ ]` not started, `[x]` done. Update this file in the same PR
that completes an item.

## Phase 0. Bootstrap the repo

Goal: an empty but real package that builds, tests and runs `doctor`.

- [x] Create `c-wenlong/tldrawkc` (name kept) with MIT licence, README stub, `AGENTS.md`, `CLAUDE.md` containing `@AGENTS.md`
- [x] `package.json`: `"type": "module"`, `engines.node >= 22`, `bin.tldrawkc`, `exports["."]`, scripts `build` (tsc plus vite build), `test`, `test:e2e`, `lint`, `typecheck`
- [x] TypeScript for `src/cli` and `src/lib` (tsc to `dist/`), Vite for `src/page` (to `dist/page`)
- [x] `bin/tldrawkc` shim
- [x] `src/lib/paths.ts`, `src/lib/files.ts` with atomic write, unit tested
- [x] `src/cli/index.ts` with `parseArgs`, `--json`, `help`, `doctor` (node, dist, chromium checks only for now)
- [x] GitHub Actions: node 22, `npm ci`, lint, typecheck, unit tests, build
- [x] Add as a submodule to self-learn at `tldrawkc/`; add `"canvas"` script to the root `package.json`; add `tldrawkc/` to the eslint ignore block next to `manimkc/`

Done when: `git submodule update --init tldrawkc && (cd tldrawkc && npm ci && npm run build) && npm run canvas -- doctor` passes on a fresh clone.

**Done 2026-09-13.** Verified from a fresh clone of self-learn. Phase 0 also
went slightly beyond the checklist where it was cheap: `src/cli/args.ts` holds
a pure `parseCommand(argv, env)` so argument parsing is unit tested, a unit
test greps `src/lib` and `src/cli` for `tldraw` and `react` imports (layering
rule 1 as a test), CI has an `e2e` job that installs Chromium so phase 1 only
has to add test files, and `src/page` already mounts `<Tldraw hideUi>` with a
`ping` bridge and bundled fonts. Two doc corrections came out of it, both in
[ARCHITECTURE.md](ARCHITECTURE.md): tldraw is on 5.x, not 4.x, and fonts do
not ship in the `tldraw` package. D9's reasoning was corrected too, and D11
and D12 added, in [DECISIONS.md](DECISIONS.md).

## Phase 1. The core loop: run and shot

Goal: an agent can draw and see.

- [x] `src/page/main.tsx` mounts `<Tldraw>` with `hideUi` in headless mode; fonts copied into the bundle and referenced relatively (done in phase 0; the rendered check it owed is paid, see the note below)
- [x] `src/page/bridge.ts`: `load`, `exec`, `save`, `shot`, `lints` (friendless-arrow only for now)
- [x] `src/lib/browser.ts`: resolve Chromium per [DECISIONS.md](DECISIONS.md) D9, launch, open page, wait for bridge, close in `finally`
- [x] `src/lib/server.ts`: static server for `dist/page` on 127.0.0.1 and a random port
- [x] `run` with `--code`, `--eval`, `--shot`, `--create`, `--no-save`; exit codes 0, 1, 2, 3
- [x] `shot`, `new`
- [x] `helpers.box`, `helpers.text`, `helpers.connect` (with anchors, `kind`, `mid`, `label`), `helpers.plainText`, `helpers.getLints`
- [x] Rollback on throw via `editor.markHistoryStoppingPoint` and `editor.bailToMark`
- [x] `setPage` on the bridge (`ping` landed in phase 0)
- [x] e2e: three boxes and two arrows from a snippet, PNG written and larger than 10 kB, four bindings present, exit 0
- [x] `doctor` gains the page-load and failed-requests checks

Done when: the example snippet in [HELPERS.md](HELPERS.md) runs, the PNG shows four boxes with bound arrows and legible labels, and CI runs the e2e suite with `npx playwright install chromium --with-deps`.

**Done 2026-09-13, PR #2.** Verified from self-learn:
`npm run canvas -- run /tmp/loop.tldr --code /tmp/loop.js --shot /tmp/loop.png
--create` exits 0 with 8 shapes and no lints, the PNG shows four boxes with
bound arrows and no overlaps, and `npm run canvas -- doctor` passes all six
checks. The rendered font check phase 0 owed is paid: the labels come out in
Shantell Sans, and `document.fonts` reports `tldraw_draw`, `tldraw_sans`,
`tldraw_serif` and `tldraw_mono` loaded with zero failed requests. The PNG is
committed once as `tldrawkc/docs/example-loop.png` for the tool's README (D21).

Phase 1 also went past the checklist where it was cheap: `helpers/geometry.ts`
and `helpers/keys.ts` are pure and unit tested in node, the failed-request log
counts 400-and-worse responses as well as `requestfailed` (D15), and the
end-to-end suite is split between a stand-in bridge page and the real bundle
(D18). Nine decisions came out of it, D13 to D21. The doc corrections it forced
are in [ARCHITECTURE.md](ARCHITECTURE.md) (the `load`, `shot` and `exec` bridge
rows, `MAX_SHOT_EDGE`, the fonts section, layering rule 8),
[CLI.md](CLI.md) (positional arity, absolute paths, the `shot` and `new` JSON
shapes, the `doctor` rows) and [HELPERS.md](HELPERS.md) (`connect`'s ids,
bindings and anchors, `box`'s height and parent coordinates, and the example's
gaps).

## Phase 2. Read, export, import

Goal: the agent can read the canvas, ship an SVG, and start from mermaid.

- [x] `inspect` with the JSON shape in [CLI.md](CLI.md); `helpers.describe`
- [x] `export --svg` with fonts inlined; `export --png`
- [x] Remaining lints: `overlapping-text`, `overlapping-shapes`, `off-page`, `empty-label`, `unreadable-label`
- [x] `helpers.boxShapes` (with `meta.container`), `row`, `column`, `grid`, `translate`, `attribute`, `stub`, `note`, `fitCamera`, `remove`, `clear`
- [x] `parseMermaid` (pure) and `applyPlan`, exposed as `helpers.mermaid` and `from-mermaid`: flowchart and graph, all five directions, the five node shapes, edge labels, subgraphs, and an `unsupported` list for everything else
- [x] `api` prints the helper reference from JSDoc
- [x] e2e: `from-mermaid` on a fixture with 8 nodes, 9 edges and one subgraph produces 9 bound arrows, zero lints after layout, and an SVG containing every label
- [x] Unit: `parseMermaid` against fixtures, asserting the `Plan` (ranks, slots, geo per node, subgraph membership), including a deliberately broken line landing in `unsupported`

Done when: `learn/map.md`'s flowchart, lifted with `from-mermaid`, renders as a readable canvas with no friendless arrows.

**Done 2026-09-13, PR #3.** Verified from self-learn against `learn/map.md`'s
own flowchart, lifted to `/tmp/map.mmd` by script: `from-mermaid` exits 0 with
32 nodes, 70 edges, 102 shapes and nine declined styling lines; `inspect`
reports 70 bound arrows and zero lints of any rule, `friendless-arrow`
included; the exported SVG carries all 32 node titles. The phase 1 loop still
exits 0 under the full six-rule lint set, `doctor` passes all six checks, and
`api` lists 18 helpers.

Phase 2 also went past the checklist where it was cheap: all six lint rules
are pure functions over a shape list, the parser lives in a file that imports
no editor so the unit suite runs it in node, and the end-to-end suite covers
the CLI's own exit codes for a stale bundle and a self-aimed export. Twelve
decisions came out of it, D22 to D33. The doc corrections it forced are in
[HELPERS.md](HELPERS.md) (the Import section, three lint rows, `attribute`,
`note`, `clear`, and `connect`'s repeat and back edges),
[ARCHITECTURE.md](ARCHITECTURE.md) (the `shot` bridge row and the fonts
section) and [CLI.md](CLI.md) (`api`, the `export` and `from-mermaid` JSON
shapes, `inspect` on an empty page, and the self-overwrite rule).

## Known gaps after phase 3

Not a phase. What is still missing, written down so it is found deliberately
rather than in a diagram that looks wrong. Two entries that stood here after
phase 2 are gone because phase 3 closed them: no lint caught an arrow crossing
a shape (`arrow-crosses-shape`, tldrawkc PR #5) and a snippet's stack printed
two lines too high (D34, same PR).

- **A diamond's label can exceed its outline without a lint.**
  `unreadable-label` compares against the shape's width, and a diamond's
  usable width at the label's height is a fraction of that.
- **No exported SVG has been opened in a browser.** They were checked by
  grepping the file and by rendering the same canvas to PNG.
- **`RL` and `BT` have never been looked at rendered.** All five directions
  are covered by unit fixtures over the `Plan`, not by a picture.
- **`--page`, `--allow-lints` and `meta.lintIgnore` are unexercised on a real
  multi-page document.** Every document this phase touched had one page.
- **Rendering on Linux has never been eyeballed.** CI runs the end-to-end
  suite there and asserts sizes and labels; nobody has looked at the output.
- **An exported SVG is about 440 kB, whatever the diagram.** `export --svg`
  inlines both fonts it uses as base64, so the vector diagram went from a
  5 kB hand-written file to 444 kB, of which 220 kB is font. Self-contained
  was the point (D26), but it is a per-repo cost that compounds one diagram
  at a time and needs a decision: keep it, subset the fonts, or link them.
- **The agent cannot read its own export.** An SVG that size is refused by
  the Read tool, which counts the file at roughly 194000 tokens against a
  25000 cap, and the export is one enormous line so paging through it with
  `offset` buys nothing. The loop already looks at the PNG instead, but
  "check the SVG you shipped" is not a step that exists.
- **The hand-drawn font has no square-root glyph.** In `font: 'draw'`
  (Shantell Sans) a square-root sign renders as a plain `v` with no bar, which
  reads as a variable. Every maths label needs `font: 'sans'`, and nothing
  warns.
- **`helpers.stub` takes no options at all.** The signature is
  `stub(key, x, y, dx, dy)`: no colour, no size, no dash, no arrowhead. A
  teaching diagram is mostly decorative marks (axes, ticks, dashed guides,
  each in the colour of the thing it belongs to), so the vector redraw ended
  up hand-rolling a `line()` that builds a raw arrow shape with
  `meta.lintIgnore` set, which is exactly what the helper bag exists to avoid.
  `stub` wants the same `{ color, size, dash, head }` bag `connect` already
  has.
- **No helper sizes two containers alike.** Two side-by-side panels that
  should read as a matched pair have to be given identical `w` and `h` by
  hand, and `boxShapes` sizes each to its own contents.
- **No helper places a label against a group.** "Centre this text under those
  four shapes" is arithmetic on `describe()` output every time; `row`,
  `column` and `grid` move shapes but nothing positions one shape relative to
  the bounds of several.

## Phase 3. Skill and integration into self-learn

Goal: the tutoring loop uses it.

- [x] `.claude/skills/tldrawkc-diagram/SKILL.md` in the tool repo, from [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md); symlink it into `self-learn/.claude/skills/`
- [x] Update the `diagram-maker` agent in the `learning` plugin (`~/.quiver/plugins/learning/learning/agents/diagram-maker.md`) to run the loop through `npm run canvas` and write both `.tldr` and `.svg` to `learn/assets/`
- [x] Root `AGENTS.md` in self-learn: a section on `tldrawkc/` modelled on the `manimkc/` one (submodule rules, drive it through the CLI, where outputs go)
- [x] `ARCHITECTURE.md` in self-learn: add the submodule to the layer table and `learn/assets/<id>.tldr` to the knowledge-base layout
- [x] Redraw one existing diagram (`learn/assets/vector-as-a-list-of-numbers.svg`) with the tool and commit the `.tldr` beside it
- [x] Bump the submodule pointer only to a pushed commit, per the root AGENTS.md rule

Done when: a `/learn` session that reaches the Teach phase produces a diagram through the tool, the session log embeds the SVG, and `git status` shows a `.tldr` next to it.

**Done 2026-09-13, self-learn PR #30.** The skill landed in the tool repo as
tldrawkc PR #4 and is symlinked in beside `manimkc-video`, so `.claude/` here
still holds nothing but `launch.json` and two symlinks. The plugin change
landed separately in quiver-hub PR #2, which also bumped the `learning`
plugin from 0.2.0 to 0.2.2; a follow-up carries it to 0.2.3. The vector
diagram was redrawn from scratch in four passes and came back with six
`arrow-crosses-shape` findings, every one of them the axes and the vector
running through the 16-unit origin dot they are drawn from. A fifth pass set
`meta.lintIgnore: ['arrow-crosses-shape']` on the two dots, the documented
opt-out, and `inspect` now exits 0 with 43 shapes and no lints of any rule.

Phase 3 also shipped the lint that gap list asked for. `arrow-crosses-shape`
and the snippet stack rewrite are tldrawkc PR #5, not part of the checklist
above, and both came out of drawing this one diagram: the first pass routed
an arrow through a box and nothing said so, and a snippet that threw pointed
at the wrong line. Three doc corrections came out of phase 3, in
[AGENT-WORKFLOW.md](AGENT-WORKFLOW.md) (every command example ran as a bare
`tldrawkc`, which is not how a host repo invokes it, and `serve` was written
as if it existed), [HELPERS.md](HELPERS.md) (the lint table and the container
exemption both predate the seventh rule) and [DECISIONS.md](DECISIONS.md)
(D33 was superseded, D34 and D35 added).

## Phase 4. The human view

Goal: someone can watch and nudge.

- [ ] `serve` with `/api/document` GET and PUT, `/api/health`, opens the default browser
- [ ] `src/page/mirror.tsx`: full tldraw UI, poll every second, `loadSnapshot({ document })` on mtime change, Cmd+S saves back, banner on reload over unsaved edits
- [ ] `--headed` on every command, for debugging
- [ ] e2e: start `serve`, write the file from a `run` in another process, assert the page's shape count changes within two seconds

Done when: a human can drag a box in the served tab, save, and the next `inspect` shows the new position.

## Phase 5. Optional: MCP entry and a warm browser

Only if a second client shows up or latency hurts. See
[DECISIONS.md](DECISIONS.md) D2 and D6.

- [ ] `src/mcp/index.ts` exposing `run`, `shot`, `inspect`, `export`, `from_mermaid` as tools over stdio, reusing `src/lib/`
- [ ] A `--keep-alive <s>` flag that leaves Chromium up between commands in the same shell session, with a pid file, if measurements show startup dominates

## Phase 6. Optional: a local studio

Only after phases 1 to 4 have real use. A small local-only app that shows
the canvas mirror and manimkc job status and videos side by side. Lives in
its own folder or repo, never in `src/`. Needs manimkc's server to serve
video files or a proxy to Seafile first. Not designed here on purpose.

## Out of scope

- Multiplayer or a sync server (D3)
- Hosting the canvas on the deployed site (D7)
- Generating diagrams from a prompt with a second model call; the agent in the loop is the model
- Excalidraw or mermaid rendering themes
