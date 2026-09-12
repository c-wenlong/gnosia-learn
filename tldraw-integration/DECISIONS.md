# Decisions

Recorded so they are not relitigated. Each has a verdict and the reason.
Reopen one only with new information, and update this file when you do.

## D1. The browser owns all drawing logic; Node only drives it

**Verdict:** every shape, binding, layout, lint and export is computed
inside a real tldraw `Editor` in Chromium. Node never constructs records.

**Why:** there is no supported headless `Editor` (see
[PRIOR-ART.md](PRIOR-ART.md)). Building records in Node with
`@tldraw/store` is possible but throws away bound-arrow geometry, elbow
routing and text measurement, which are exactly the features that made the
ERD in this design session look right. And screenshots need a browser
anyway, so a browser is already a hard dependency.

## D2. Stateless commands, no daemon

**Verdict:** every command launches Chromium, does one job, saves and
exits. State lives only in the `.tldr` file.

**Why:** a daemon needs a state file, a port, a token, idle timeouts and a
story for stale processes, and every one of those is a bug an agent will
hit. One to two seconds of startup per command is cheap next to the model's
own turn time. A warm-browser cache is a roadmap item if latency turns out
to matter.

## D3. No sync server, no collaboration

**Verdict:** `@tldraw/sync` is not used. The human view is a page that
polls a file and saves back to it.

**Why:** the use case is one agent drawing and one person occasionally
looking or nudging. `TLSocketRoom.updateStore`, the server-side write path a
CLI would need, is deprecated with no replacement. Two writers on one file
with last-write-wins is enough, and it is honest about what it is.

## D4. Its own repo, wired in as a submodule

**Verdict:** `tldrawkc` is a separate repository (`c-wenlong/tldrawkc`,
name pending) added to self-learn at `tldrawkc/`, exactly as `manimkc/` is.
Not a folder inside `manimkc`, not a folder inside `src/`.

**Why:** it is a TypeScript and browser project; manimkc is Python and
manim. Sharing a repo would mean two toolchains, two CIs and two AGENTS.md
in one place. And the stated goal is to open-source it as a tool for
agents, which needs its own README, license and issue tracker. The
submodule pattern already works in this repo, including the symlinked skill
and the "commit inside the submodule first" rule in the root AGENTS.md.

## D5. Snippets are JavaScript, not a fixed command vocabulary

**Verdict:** `run --code` takes JavaScript with `editor`, `helpers` and
`tldraw` in scope. The helpers are the recommended vocabulary, not the only
one.

**Why:** the agents using this are Claude Code sessions that write code
well. A closed vocabulary would need extending every time a diagram wanted
something new, and the escape hatch to `editor` is what let the ERD get
right-angle lanes and custom anchors. The trade-off is that a snippet can
do anything the page can, so the page must never have filesystem or
network access of its own (layering rule 2 in
[ARCHITECTURE.md](ARCHITECTURE.md)).

## D6. MCP entry deferred

**Verdict:** not in v1. The library API is JSON in, JSON out so an MCP
wrapper is a thin later addition (roadmap phase 5).

**Why:** the consumer today is Claude Code, which runs shell commands and
reads files natively; a skill plus a CLI is the same pattern manimkc uses
and it works. MCP earns its place when a second client appears (Claude
Desktop, Cursor, an n8n flow) or when open-source users ask for it, which
[joelhooks/tldraw-agent](https://github.com/joelhooks/tldraw-agent) suggests
they will. Building it first would be building for a user we do not have.

## D7. No new frontend in self-learn for now

**Verdict:** `src/` stays the course encyclopedia. The tool's human view is
`tldrawkc serve`, a local page the tool itself serves. A combined local
"studio" that also shows manimkc jobs and videos is a separate, later
project (roadmap phase 6), and if it happens it lives in its own small app,
not in `src/`.

**Why:** `src/` deploys to Vercel. A headless-browser tool with local file
access has no business in that build, and the app's only visual component
today is a static SVG graph, so there is nothing to reuse. manimkc's server
is a JSON job API with no UI and publishes videos to Seafile, so a video
panel would be new integration work on both sides. Ship the diagram tool
first; decide on a studio once both tools have a few weeks of real use.

## D8. Exports are SVG for notes, PNG for looking

**Verdict:** the committed artefact next to a concept note stays an SVG,
embedded with `![[name.svg]]` as today. PNGs are for the agent's eyes and
are not committed. The `.tldr` source is committed alongside the SVG.

**Why:** everything downstream (Obsidian embeds, the `/learn` page, the
session log renderer) already handles SVG. Committing the `.tldr` is what
makes a diagram editable next time instead of redrawn.

## D9. `playwright-core` with a resolved Chromium, not bundled `playwright`

**Verdict:** depend on `playwright-core` and resolve a browser in this
order: `--chromium`, `TLDRAWKC_CHROMIUM`, Playwright's own registry if the
user ran `npx playwright install chromium`, then installed Chrome or
Chromium apps.

**Why:** `playwright-core` ships no browser of its own, so nothing is
downloaded at install time inside a submodule. Most machines already have a
Chrome; CI installs one explicitly. `doctor` tells the user which one was
picked.

**Corrected 2026-09-13 (phase 0).** This decision originally said the full
`playwright` package "downloads browsers on install". That was true once and
is not true of current versions: `playwright@1.63.0`'s published
`package.json` has no `scripts` block at all, so there is no `postinstall` and
no download. The verdict stands on the other reason, which is the one that
mattered: `playwright-core` is the driver without the browser, and the browser
should come from the machine. See D11 for what changed as a result.

## D10. Lints fail the command

**Verdict:** `run` exits 3 when lints remain, even though the file was
saved. `--allow-lints` plus `meta.lintIgnore` is the opt-out.

**Why:** the failure modes of hand-written SVG in this repo were overlaps
and arrows pointing at nothing. Making those a non-zero exit is the
cheapest way to make an agent look again.

## D11. `playwright` is a devDependency, pinned to the `playwright-core` version

**Verdict:** `playwright-core` stays the one runtime dependency. `playwright`
is added as a devDependency at the **exact same version**, and the two are
bumped together or not at all. The resolution order in D9 is unchanged.

**Why:** `playwright` no longer has an install script (checked by unpacking
the 1.63.0 tarball, not by reading the docs), so it costs nothing at
`npm install` time. What it buys is that `npx playwright install chromium
--with-deps` in CI resolves the local copy and fetches exactly the browser
revision `playwright-core` expects, instead of whatever version the registry
serves that day. A driver and a browser from different Playwright releases
fail at launch with a protocol mismatch, and that failure reads as "the
browser is broken" rather than "the versions drifted". Pinning is the cheapest
way to never debug it.

## D12. The design docs stay in self-learn until phase 3

**Verdict:** for phases 0 to 2, `self-learn/tldraw-integration/` is the source
of truth for the brief. `tldrawkc`'s own `README.md` and `AGENTS.md` link back
to it rather than carrying a copy. Moving or splitting them is a phase 3 or
later concern.

**Why:** self-learn is where the tool is consumed, where the roadmap is
ticked, and where the decision to build it was made, so that is where someone
goes looking. Two copies would drift the way a local skill copy drifts from
the plugin it shadows, which is a trap this repo already names in its root
`AGENTS.md`. Phase 3 is when `tldrawkc` grows outward-facing docs of its own
(a skill, a published README for people who are not us), and that is the right
moment to decide what moves, what stays, and what becomes a link.

## D13. An arrow's id is derived from the pair it joins

**Verdict:** `connect` names its arrow `shape:arrow:<from>-><to>`. A shape key
that already contains `->` is refused with a message, not escaped into the id.

**Why:** deriving the id from the pair is what makes a snippet re-runnable: the
second run updates the arrow instead of stacking another one on it. `->` is the
separator because a dash would collide (`a-b` to `c` against `a` to `b-c`).
Allowing `->` inside a key brings the collision back one level up, and since
`connect` rebinds whatever it finds at that id, the second call would silently
steal the first one's arrow. Escaping would hide that in an id nobody can read.
A second arrow between the same pair passes `opts.id`.

## D14. Auto anchors run down the overlap band, and every binding is precise

**Verdict:** an end the caller did not name gets its anchor from the band where
the two shapes' extents overlap, and every binding is created with
`isPrecise: true` whether the anchor was named or derived.

**Why:** an imprecise binding throws the anchor away. tldraw ignores
`normalizedAnchor` and aims the terminal at the shape's centre, so two boxes
whose centres differ (any row where one label wrapped to a second line and grew
its box) get a short dog-leg with the label sitting on top of it, which reads as
a broken arrow. Precise binding keeps the anchor, and putting both anchors on
one line down the overlap band is what makes the arrow straight whenever a
straight arrow is possible. Shapes that do not overlap at all fall back to the
side midpoint, where a bend was unavoidable anyway.

## D15. A failed request includes any response with status 400 or worse

**Verdict:** the page's failed-request log counts Playwright's `requestfailed`
event **and** every response that came back at 400 or above. `doctor` fails on
either.

**Why:** a missing font is a 404, not a transport failure. The request
succeeded and the answer was "no", so Chromium never fires `requestfailed`, and
a check that watched only that event would pass on the exact case it exists to
catch. The failure downstream is silent: the export falls back to a system font
and looks nearly right.

## D16. `new` goes through the browser, and claims the file exclusively

**Verdict:** `new` launches the page, calls `load(null)` and `save()`, and
writes the result with an exclusive create.

**Why:** the `.tldr` envelope carries a schema version and every record's
migration state. Letting the page serialise an empty editor means the file is
exactly what the installed tldraw writes, and it stays correct when tldraw bumps
its schema, which a hand-built envelope would not. The cost is one browser
launch for a mostly empty file, which is a second, once. The exclusive write is
what makes "refuses to overwrite" true rather than likely: the early existence
check is only there to answer fast, and it cannot cover a file created while the
page was starting up.

## D17. Every `src/lib/` failure is a typed error carrying its own exit code

**Verdict:** `src/lib/` raises one of the classes in `errors.ts`
(`UsageError`, `EnvironmentError`, `ChromiumNotFoundError`, `SnippetError`,
`ExportError`), each with an `exitCode` property. Exit 3 is not among them.

**Why:** the CLI reads a property instead of matching on message text, so
rewording an error cannot change what the shell sees. Exit 3 is deliberately
outside the scheme because nothing failed: the snippet ran, the file was saved,
and lints remain, so `run` returns normally with its lint list and an
`exitCode` of 3. Modelling "the work is done and you should look again" as an
exception would have made the successful path throw.

## D18. The end-to-end suite is split by what it is pinning

**Verdict:** `test/e2e/node-side.test.ts` drives the library against a stand-in
bridge page that answers the contract without tldraw;
`test/e2e/cli.test.ts` spawns the built binary against the real page bundle.

**Why:** they fail for different reasons, and one suite would not say which.
Everything Node decides (the order of load, exec, save and export; which exit
code each failure carries; that a throwing snippet leaves the file byte for
byte as it was) is testable without an editor, and pinning it separately means
a red `cli.test.ts` points at the page. The stand-in has to stay a stand-in:
the moment it starts emulating tldraw it stops telling anyone anything.

## D19. Paths in `--json` output are always absolute

**Verdict:** every path a command prints under `--json` is the resolved
absolute path, never the string that was typed.

**Why:** the consumer is an agent that may read the output from a different
working directory than the one the command ran in, and a relative path is only
meaningful next to a cwd that is not in the output. Absolute costs a longer
line and removes a whole class of "file not found" on a path that exists.

## D20. `withCanvas` is the only thing that opens a browser

**Verdict:** every verb goes through `withCanvas(options, fn)`, which starts the
page server, opens the page, waits for the bridge, runs `fn`, and closes the
browser and the server in a `finally`. No verb calls `openCanvasPage` itself.

**Why:** layering rule 7 says a command never leaves a browser running, and a
rule that each verb has to remember is a rule that a fifth verb will break.
One function means one place to get the cleanup right, and a snippet that hangs
until `--timeout` still leaves a clean process behind.

## D21. One PNG is committed, and it is the README's

**Verdict:** `tldrawkc/docs/example-loop.png` is committed, as the picture in
the tool's README. Every other PNG stays uncommitted, per D8.

**Why:** a tool whose whole claim is "the agent can look at what it drew"
should show the reader what it draws, and a README image has to live in the
repo to render on GitHub. That is one file with a reason, not a loosening of
D8: the working PNGs an agent makes while iterating are still scratch, and
`out/`, `scratch/` and `*.local.png` are gitignored so they stay that way.
