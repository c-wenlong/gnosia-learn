# Proposal: the Learn page is a map of what you know

Status: built, 2026-10-04: all four phases. Decisions G1 to G8 stand as
written; G1 revised decision 13 of [DESIGN.md](../design/DESIGN.md), whose
row now says so.

## The problem

`/learn` opens on a table of every concept
([LearnIndex.tsx](../../apps/web/src/components/learn/LearnIndex.tsx)),
studied ones first and then alphabetical
([page.tsx](../../apps/web/src/app/(app)/learn/page.tsx)). Two rows next to
each other usually have nothing to do with each other: "Softmax" sits between
"Self-attention" and "Transformer block" because of the alphabet, not because
of the graph. The structure lives only in the side card, which draws the
neighbourhood of the selected row: the concept, what it needs and what needs
it.

The Graph button beside Table does not fix it. It draws the same
`ConceptGraph` wider, scoped to the selected concept's course (`courseScope`
in [concept-graph.ts](../../apps/web/src/lib/concept-graph.ts)). It cannot pan
or zoom, never shows more than one course, and lays each row out
alphabetically, so lines cross wherever the alphabet puts their ends.

Decision 13 chose the neighbourhood as the default because "a whole-vault
graph is a hairball on first open". That is true of a graph drawn all at once
at one size. It is not true of a map that opens on one region and lets the
learner move around it, which is what this proposal builds.

## What the data looks like

Measured on `self_learn` on 2026-10-04:

| Fact | Value | What it means for the map |
| --- | --- | --- |
| Concepts | 306 | Few enough to draw every node as SVG without a canvas renderer |
| Prerequisite edges | 332 (216 `requires`, 116 `assumes`) | Sparse: about one edge per concept |
| Separate clusters (connected components) | 34: 33 joined by edges, and one concept with no edge at all | The map is islands, not one graph |
| Largest cluster | 89 concepts, 12 layers deep, 17 wide at its widest layer | Mostly CP4284, CP4282 and CP4285. About 1,900 by 1,200 pixels at today's spacing, so it needs zoom |
| Next clusters | 34 (CS3230), 26 (CS4223), 26 (CS4225), 20 (CS4263) | Most clusters belong to one course |
| Small clusters (4 concepts or fewer) | 23, holding 59 concepts | Need packing, or they scatter across the map |
| Concepts in no course | 10, all of them inside a course's island through their links: 7 in CS3230's, 3 in the CP4284 and CP4282 one | They are the courses' background, so they sit beside the course. None forms an island of its own today |
| Concepts with any observation | 11 | The rest are untouched |
| Concepts mastered | 0 | Colour alone shows almost nothing yet |
| Ready concepts (every `requires` prerequisite mastered, not mastered itself) | 121, every one a concept with no `requires` prerequisite | A global "ready" highlight would light up 40% of the map |

The last two rows shape the design most. A map coloured only by confidence
is about 96% grey today, so it has to be useful as a map of structure first,
and the confidence colour adds to it as the owner studies.

## Decisions

**G1. The map is the default view of `/learn`, and the table is the second
view.** This revises decision 13. The table stays one press away, with its
neighbourhood card, because it is the list view and the screen-reader-friendly
one (G6). `?view=table` opens it; a link with `?view=graph` keeps working.

**G2. The map opens on one region, not on the whole map.** It opens fitted to
the island of the selected concept (`?concept=`, else `defaultSelection`, as
today). "Fit all" is one press away. That keeps what decision 13 protected:
the first screen is a readable region, never all 306 nodes at once.

`?scope=` keeps the meaning it has today. `scope=course` fits every island
that holds a concept of the selected concept's course, so it shows the whole
course however many clusters it spans, and `scope=neighbourhood` fits the
selected concept and its neighbours. With no `scope`, the map fits the
selected concept's island. The workspace's "Open full course graph" button
([StudioCards.tsx](../../apps/web/src/components/workspace/StudioCards.tsx))
links to `/learn?concept=<slug>&view=graph` and relies on `parseScope`
([learn-index.ts](../../apps/web/src/lib/learn-index.ts)) reading a missing
scope as `course` in the graph view. Phase 2 makes the button say
`scope=course` itself, and only then changes the missing-scope default to
the island, so the button keeps opening the whole course. The same phase
changes the page's own URL handling: in the graph view the URL always
carries `scope` (`island`, `course` or `neighbourhood`), never leaves it out
for a default, and the Graph chip opens on the island and writes
`scope=island`. A reload or a shared link then shows exactly what was on the
screen.

**G3. The layout is computed on the server, and drawn as the app's own
SVG.** The page already reads the knowledge base on the server, so it runs
the layout there and sends positions to the browser. The layered layout uses
`@dagrejs/dagre` (MIT, kept up to date; elkjs is larger and EPL or GPL), which
minimises crossings where today's `layoutGraph` sorts each row by title. The
drawing stays `ConceptGraph`'s SVG and tokens, with pan and zoom written in
the app (pointer events, wheel and pinch on the `viewBox`). No graph library
reaches the browser bundle. The fallback, if 306 SVG nodes pan badly on the
phone (phase 3 measures it), is React Flow with the same server layout.

**G4. Colour stays three mastery buckets; confidence detail is an arc.**
Mastered, learning and untouched stay the only fills, as DESIGN.md's
"Mastery buckets" requires: five shades of one accent cannot be told apart at
node size. A learning node adds a ring drawn as an arc whose length is its
p(L), so 0.15 and 0.61 look different without a new colour. Overdue and
"keeps slipping" (a leech) get their own outer mark, the way the table flags
them.

**G5. "Ready to learn" is highlighted only inside the courses the owner is
working through.** The ready set is all 121 roots today. The highlight takes
the courses in the `recentModules` preference (the modules Home's "pick up
where you left off" reads) and marks the ready concepts in those courses
only. With no recent module, nothing is highlighted.

A concept in no course counts as part of every course whose concepts depend
on it, through a `requires` or `assumes` edge, directly or through other
concepts in no course. So the background a course builds on is highlighted
with it: with CS3230 recent, "Cost model and input size" (no course, a
prerequisite of three CS3230 concepts) is marked ready, where the rule above
alone would never mark it.

**G6. The table stays, unchanged except for its place.** It is the list
view, ordered studied first and then by title as today (it has no sort
control, and this proposal adds none), the one a screen reader uses, and the one that shows due dates and last
seen at a glance. The map links to it, and it links back.

**G7. One island per cluster, labelled by its courses, packed by course.**
Each connected cluster is laid out on its own and gets a title: the course
most of its concepts belong to, or up to three course codes when it spans
several, or the note's folder when no concept is in a course. Islands of the
same course sit next to each other, largest first, so CS3230's two clusters
read as one region. The 23 small clusters pack in rows beside their course's
largest island instead of scattering.

**G8. The Status filter can show the concepts in no course.** It keeps
every option it has today and gains a "Not in a course" option, which dims every concept that is in one. The map
already places these concepts beside the courses that use them (G7), so
nothing on it says they are outside every course; the filter finds them, and
the panel's course line ("No course") says it for one. Filing each under a
course stays a change to the course file, made through the course, not on the
map.

## The map

| Element | Behaviour |
| --- | --- |
| Islands | One per cluster (G7), each with its title above it |
| Node fill | Mastery bucket (G4) |
| Node ring | p(L) as an arc on learning nodes; an outer mark when overdue or keeps slipping |
| Ready highlight | The ready concepts in the courses being worked through (G5) |
| Lines | Prerequisites above, as today. Solid for `requires`, dashed for `assumes`, transitively reduced per island (`reduceEdges`) |
| Pan and zoom | Drag, wheel, pinch, and buttons for zoom in, zoom out, fit island and fit all |
| Labels when zoomed out | Below a zoom level the node labels hide and the island titles stay, so the zoomed-out map is a set of named regions |
| Click a node | Selects it: its own lines in the accent, the rest dimmed, and a side panel with mastery, p(L), due, last seen, course, "Open in workspace" and "Start a session" |
| Search | The existing search box zooms to the match and selects it |
| Status filter | The table's options as they are (all, due, learning, mastered, untouched, keeps slipping), plus two the map adds: ready to learn (G5) and not in a course (G8). Dims the nodes that do not match, rather than removing them, so the structure stays readable |
| URL | `?concept=` and `?view=` as today, so a link to a concept on the map still works |

## Phases

Each phase is one PR, through the usual loop, and each leaves `/learn`
working.

| Phase | Ships | Done when |
| --- | --- | --- |
| 1. Layout | `mapLayout` in `apps/web/src/lib/concept-map.ts`: clusters, a dagre layered layout per cluster, island packing and titles (G3, G7). Pure and tested. The existing Graph view draws it as one static SVG in a scrolling box | Tests cover clusters, packing, titles and a cycle. On the owner's database every island has a title, and the crossing count of the largest island is measured and lower than today's `layoutGraph` |
| 2. Viewer | Pan, zoom, pinch, fit island and fit all on the Graph view; labels hide when zoomed out; it opens on the selected concept's island (G2); the workspace's "Open full course graph" button passes `scope=course`, and the graph view always writes `scope` to the URL | `?concept=<slug>&view=graph` opens zoomed to that island, and the button opens fitted to every island of the concept's course. Switching to Graph, then to course scope, then reloading shows the same view each time. A Playwright walk times a pan across the largest island on the owner's database and finds no frame over 50 ms |
| 3. Reading the map | Node selection with the side panel, search to zoom, filter dims, the p(L) arc and the overdue and leech marks (G4), the ready highlight (G5), the "Not in a course" filter (G8). Pinch and drag at 375 pixels wide | Selecting "Vector as a list of numbers" shows its four dependants in the accent and the panel's "Open in workspace" lands on its page. With CS3230 in `recentModules`, only CS3230's ready concepts are highlighted, "Cost model and input size" among them. "Not in a course" leaves exactly the concepts in no course undimmed (10 today). The phone walk pans and zooms the largest island without a frame over 50 ms (else G3's fallback is taken, and this proposal is amended) |
| 4. Keyboard, then the default | Keyboard: Tab and Shift-Tab move between islands in map order, focusing each island's title and fitting the view to it; Enter enters the island at its first concept; the arrow keys then move to a prerequisite, a dependant, or the next concept in the same layer, so every concept of an island is reachable; Enter opens the panel; Escape goes back to the island's title; a text summary for screen readers that names the islands and points to the table. Then, in the same PR, the map becomes the default view (G1) | Every concept on every island, panel included, can be reached with the keyboard alone, starting from the first island, and a screen reader announces the summary. Only then does `/learn` open on the map |

Phase 1 measured on `self_learn`, 2026-10-04: the layout takes about 100 ms
on the server for all 306 concepts. Counting crossings of straight lines
between the dots, island by island, today's alphabetical rows cross 827
times and the map 112; on the largest island 464 against 32. The map is
3,572 by 5,804 at natural size, which phase 2's zoom is for.

Phase 2 measured on `self_learn`, 2026-10-04, in Chromium at 1440 by 900: a
drag across the largest island, fifteen wheel steps in and out, and the fit
animations all held 16.8 ms a frame at worst, none over 50 ms. Two things the
measurement turned up are in the build: zoomed out, a title shows only over an
island wide enough on screen to hold it, and a row of islands may run as wide
as the widest island, so the map is no longer one wide island over a tall thin
column.

DESIGN.md's decision 13 row and the `/learn` screen row are rewritten in
phase 4, when the default changes, not before. Until then the map is the
Graph view, one press away, and the table stays the default, so no phase
leaves a default view a keyboard cannot use.

## What stays

- The concept workspace's neighbourhood card (`/learn/<concept>`), which
  answers a different question: what this one concept sits between.
- `ConceptGraph` for that card and for the table view's side card.
- The knowledge base read (`loadKnowledgeBase`) and its shape. The map needs
  the concepts, the edges, the buckets and the course links it already
  carries; nothing in the catalog changes.
- The `learn` CLI and its `--json` shapes. Nothing here touches them.

## Out of scope

- A force-directed layout. It loses the direction that makes a prerequisite
  map readable: what comes first is above.
- Editing the graph on the map (adding or removing an edge). Edges are a
  note's `requires` and `assumes`, edited through the note.
- A different mastery model or more colours. G4 shows more of p(L) without
  changing what it is.
