# tldraw integration: planning docs

The brief for building `tldrawkc`, a command line tool that lets a coding
agent draw diagrams on a real tldraw canvas, screenshot them, look, and
iterate, then export an SVG for the notes in `learn/`. It replaces
hand-written SVG and mermaid for teaching diagrams.

`tldrawkc` was a working name chosen to sit beside `manimkc`. It stuck: the
repo is [c-wenlong/tldrawkc](https://github.com/c-wenlong/tldrawkc), added to
this one as a submodule at `tldrawkc/` in phase 0.

## Read in this order

| Document | What it settles | Read when |
| --- | --- | --- |
| [DECISIONS.md](DECISIONS.md) | The thirty-six calls already made and why. Browser owns drawing, stateless commands, no sync, own repo as a submodule, MCP deferred, no new frontend, where these docs live, the calls phase 1 forced (derived arrow ids, precise bindings, typed errors, one browser opener), the ones phase 2 forced (arc back edges, `#n` repeat lanes, a respacing pass after `growY`, foreignObject labels, a scoped `api` reader, no export aimed at its own document), and the ones phase 3 forced: a rewritten snippet stack, which supersedes D33, the 4-unit tolerance on `arrow-crosses-shape`, and document metadata living on the `.tldr` itself rather than a sidecar. | First. Do not reopen these without new facts. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Package layout, the Node to page bridge, one command end to end, file formats, layering rules. | Before writing any code. |
| [CLI.md](CLI.md) | Every command, flag, JSON output and exit code. | While building `src/cli` and `src/lib`. |
| [HELPERS.md](HELPERS.md) | The `helpers` bag a snippet can call, with an example. | While building `src/page/helpers`. |
| [ROADMAP.md](ROADMAP.md) | Seven phases (0 to 6) with checklists; phases 0 to 4 each have a definition of done, 5 and 6 are optional. | To pick up the next item. Tick items in the PR that completes them. |
| [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md) | The draw, shot, look, fix loop, and where files go in this repo. It was the draft of the `tldrawkc-diagram` skill, which now exists in the tool repo; it keeps the reasoning and the corrections its own examples needed. | Whenever writing agent-facing docs. |
| [INTEGRATION.md](INTEGRATION.md) | The seams with `learn/assets/`, the `diagram-maker` agent, manimkc, and why `src/` stays untouched. Every row is now done. | Before changing anything at a seam. |
| [PRIOR-ART.md](PRIOR-ART.md) | What the tldraw docs actually support, existing tools, and what was ruled out. Sources for every claim. | When something in the design seems arbitrary. |

## The one-paragraph version

One Node program and one browser page. The page is a Vite build of tldraw
with a `helpers` bag (bound arrows, boxes, layout, a mermaid importer, a
lint pass) and a small bridge Node can call. Every command launches
headless Chromium, loads a `.tldr` file, runs a JavaScript snippet against
the live editor, saves the file, and optionally writes a PNG or SVG. The
agent reads the PNG with its Read tool and sends the next snippet. A `serve`
command opens the same file in a normal browser tab for a human, reloading
on change and saving Cmd+S back. No daemon, no sync server, no React in the
host repo's dependency tree.

## Who this is for

The agent working in `manimkc` (or wherever the implementation starts)
should be able to build phases 0 to 2 from these docs alone, then phase 3
touches this repo and the global `learning` plugin. Where a doc says
"specification", the shapes and names are the contract; where it says
"draft", adjust and write back what you changed.

## Context that is not in these docs

- The tldraw offline desktop app on this machine was used to prototype the
  loop: an ERD was drawn through its `/exec` API with `helpers` and
  `api.getScreenshot`, iterated twice from screenshots, and came out clean.
  The helper names in [HELPERS.md](HELPERS.md) match that app on purpose.
- The self-learn repo conventions these docs follow: zero-dependency ESM
  CLIs with `parseArgs` (`scripts/learn/cli.mjs`), `AGENTS.md` as the
  operating manual with `CLAUDE.md` as an `@AGENTS.md` pointer, submodules
  committed inside first, and root `ARCHITECTURE.md`'s format of layer
  tables plus numbered layering rules.
