# Kickoff prompt

Paste the block below into a fresh agent session. It is self-contained: it
tells the agent where the brief is, what to build first, and what not to
touch. Run it from the self-learn checkout so the relative paths resolve.

```
Build tldrawkc, a command line tool that lets a coding agent draw diagrams on a real tldraw canvas, screenshot them, look, iterate, and export SVG. The full brief is in /Users/kaichen/Desktop/Personal/Internal/Projects/self-learn/tldraw-integration/. Read README.md there first, then DECISIONS.md, then ARCHITECTURE.md, CLI.md and HELPERS.md in full before writing any code. ROADMAP.md is the work list; tick items in the PR that completes them.

Scope for this session: phases 0, 1 and 2 of ROADMAP.md, in order, one PR per phase. Stop after phase 2 and report. Phase 3 touches self-learn and the global learning plugin and is a separate session.

Hard constraints, all recorded in DECISIONS.md, do not reopen them:
- tldrawkc is its own repository (create github.com/c-wenlong/tldrawkc, MIT, main branch), not a folder in manimkc and not a folder in src/. It gets added to self-learn as a submodule at tldrawkc/ in phase 0, following the same rules the root AGENTS.md sets for manimkc/: commit and push inside the submodule first, then bump the pointer, never to an unpushed commit.
- All drawing logic lives in the browser page bundle. src/lib and src/cli never import tldraw or react.
- Commands are stateless: launch Chromium, do one job, save, exit. No daemon.
- Snippets are JavaScript with editor, helpers and tldraw in scope. Rollback on throw uses editor.markHistoryStoppingPoint and editor.bailToMark (editor.mark does not exist in tldraw v4).
- Stack: TypeScript, ESM, Node 22+, playwright-core with a resolved Chromium (see D9), Vite for the page, vitest for tests, node:http for the static server. Match the conventions of scripts/learn/cli.mjs in self-learn for the CLI (parseArgs, --json on every command, cli is the only module that prints).
- Where the docs say "specification", the names, flags, exit codes and JSON shapes are the contract. Where a claim about tldraw's API turns out wrong, fix the code and write the correction back into the doc in the same PR.

Definition of done for this session, verified by you, not asserted:
1. From a fresh clone of self-learn: git submodule update --init tldrawkc && (cd tldrawkc && npm ci && npm run build) && npm run canvas -- doctor passes.
2. The example snippet at the bottom of HELPERS.md, run with npm run canvas -- run /tmp/loop.tldr --code /tmp/loop.js --shot /tmp/loop.png --create, exits 0, and you have opened /tmp/loop.png with the Read tool and confirmed four legible boxes with bound arrows and no overlaps. Include that PNG in the phase 1 PR description.
3. npm run canvas -- from-mermaid on the flowchart in learn/map.md produces a canvas with zero friendless-arrow lints, and export --svg yields an SVG containing every node label.
4. CI in the tldrawkc repo runs unit and e2e tests (npx playwright install chromium --with-deps) and is green on main.

Working style: read AGENTS.md in self-learn before touching that repo, and create an AGENTS.md in tldrawkc (with CLAUDE.md containing @AGENTS.md) as part of phase 0. Use subagents for independent work: for example one on src/page helpers and one on src/lib browser and server code once the bridge contract in ARCHITECTURE.md is agreed. Follow the PR loop in your instructions for every PR: CI green, review comments answered, merged by you. When a decision is needed that the docs do not cover, make the call, record it as a new entry in tldraw-integration/DECISIONS.md, and move on. Escalate only if blocked after two honest attempts.

Report back per merged PR in the short tagged format, and finish with a list of every doc correction you made.
```

## After phase 2

A second prompt, for the session that wires it into the tutoring loop:

```
Phase 3 of /Users/kaichen/Desktop/Personal/Internal/Projects/self-learn/tldraw-integration/ROADMAP.md. Read INTEGRATION.md and AGENT-WORKFLOW.md there, then the root AGENTS.md and ARCHITECTURE.md of self-learn. Do every item in the phase 3 checklist, including the diagram-maker agent in ~/.quiver/plugins/learning/learning/agents/diagram-maker.md, which is outside this repo. Verify by running a /learn session that reaches the Teach phase and produces a diagram through npm run canvas, with a .tldr and .svg committed beside each other in learn/assets/. One PR in self-learn, one commit in the plugin; report in the tagged format.
```
