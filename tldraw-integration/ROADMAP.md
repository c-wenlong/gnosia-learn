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

- [x] `src/page/main.tsx` mounts `<Tldraw>` with `hideUi` in headless mode; fonts copied into the bundle and referenced relatively (done in phase 0; still owes a rendered check that the label is Shantell Sans and not a system fallback, because that failure is silent)
- [ ] `src/page/bridge.ts`: `load`, `exec`, `save`, `shot`, `lints` (friendless-arrow only for now)
- [ ] `src/lib/browser.ts`: resolve Chromium per [DECISIONS.md](DECISIONS.md) D9, launch, open page, wait for bridge, close in `finally`
- [ ] `src/lib/server.ts`: static server for `dist/page` on 127.0.0.1 and a random port
- [ ] `run` with `--code`, `--eval`, `--shot`, `--create`, `--no-save`; exit codes 0, 1, 2, 3
- [ ] `shot`, `new`
- [ ] `helpers.box`, `helpers.text`, `helpers.connect` (with anchors, `kind`, `mid`, `label`), `helpers.plainText`, `helpers.getLints`
- [ ] Rollback on throw via `editor.markHistoryStoppingPoint` and `editor.bailToMark`
- [ ] `setPage` on the bridge (`ping` landed in phase 0)
- [ ] e2e: three boxes and two arrows from a snippet, PNG written and larger than 10 kB, four bindings present, exit 0
- [ ] `doctor` gains the page-load and failed-requests checks

Done when: the example snippet in [HELPERS.md](HELPERS.md) runs, the PNG shows four boxes with bound arrows and legible labels, and CI runs the e2e suite with `npx playwright install chromium --with-deps`.

## Phase 2. Read, export, import

Goal: the agent can read the canvas, ship an SVG, and start from mermaid.

- [ ] `inspect` with the JSON shape in [CLI.md](CLI.md); `helpers.describe`
- [ ] `export --svg` with fonts inlined; `export --png`
- [ ] Remaining lints: `overlapping-text`, `overlapping-shapes`, `off-page`, `empty-label`, `unreadable-label`
- [ ] `helpers.boxShapes` (with `meta.container`), `row`, `column`, `grid`, `translate`, `attribute`, `stub`, `note`, `fitCamera`, `remove`, `clear`
- [ ] `parseMermaid` (pure) and `applyPlan`, exposed as `helpers.mermaid` and `from-mermaid`: flowchart and graph, all five directions, the five node shapes, edge labels, subgraphs, and an `unsupported` list for everything else
- [ ] `api` prints the helper reference from JSDoc
- [ ] e2e: `from-mermaid` on a fixture with 8 nodes, 9 edges and one subgraph produces 9 bound arrows, zero lints after layout, and an SVG containing every label
- [ ] Unit: `parseMermaid` against fixtures, asserting the `Plan` (ranks, slots, geo per node, subgraph membership), including a deliberately broken line landing in `unsupported`

Done when: `learn/map.md`'s flowchart, lifted with `from-mermaid`, renders as a readable canvas with no friendless arrows.

## Phase 3. Skill and integration into self-learn

Goal: the tutoring loop uses it.

- [ ] `.claude/skills/tldrawkc-diagram/SKILL.md` in the tool repo, from [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md); symlink it into `self-learn/.claude/skills/`
- [ ] Update the `diagram-maker` agent in the `learning` plugin (`~/.quiver/plugins/learning/learning/agents/diagram-maker.md`) to run the loop through `npm run canvas` and write both `.tldr` and `.svg` to `learn/assets/`
- [ ] Root `AGENTS.md` in self-learn: a section on `tldrawkc/` modelled on the `manimkc/` one (submodule rules, drive it through the CLI, where outputs go)
- [ ] `ARCHITECTURE.md` in self-learn: add the submodule to the layer table and `learn/assets/<id>.tldr` to the knowledge-base layout
- [ ] Redraw one existing diagram (`learn/assets/vector-as-a-list-of-numbers.svg`) with the tool and commit the `.tldr` beside it
- [ ] Bump the submodule pointer only to a pushed commit, per the root AGENTS.md rule

Done when: a `/learn` session that reaches the Teach phase produces a diagram through the tool, the session log embeds the SVG, and `git status` shows a `.tldr` next to it.

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
