# Proposal: the Learn map is grouped by domain

Status: built, 2026-10-04, all four phases: 1 the tree and the layout
([#354](https://github.com/c-wenlong/gnosia/pull/354)), 2 the views and
the island map removed ([#358](https://github.com/c-wenlong/gnosia/pull/358)),
3 hover and drag ([#365](https://github.com/c-wenlong/gnosia/pull/365)),
4 these docs ([#366](https://github.com/c-wenlong/gnosia/pull/366)); the
axes layout (D11) followed on 2026-10-05. It replaces the island map
of [knowledge-map.md](knowledge-map.md), decisions G2 to G8; G1 (the graph
is what `/learn` opens on, the table at `?view=table`) stands.

## The problem

The island map put all 306 concepts on one pannable, zoomable canvas, an
island per connected cluster, titled by course. The owner's verdict on it:
interactive in the wrong ways. A canvas makes the learner do the navigating
(pan, zoom, find the island), and the thing that makes a knowledge graph
readable, seeing what one concept connects to, was a click away rather than
a hover. Grouping by course also misfiled everything learnt outside a
course: such concepts became islands titled "<folder>, no course".

[ResearchRabbit](../design/reference/researchrabbit/graph.md) shows the
alternative: a bounded picture of one collection, hover to light up a
node's edges and fade the rest, drag a node to move it, a list beside the
graph that hovers in step with it.

## What the data looks like

Measured on `gnosia` on 2026-10-04:

| Fact | Value | What it means |
| --- | --- | --- |
| Domains, from the topic each concept is filed under | 11 | Few enough to show as cards |
| Prerequisite edges inside one domain | 304 of 332 (92%) | One domain at a time hides little |
| Edges inside one topic | 190 of 332 | Topics work as groups inside a domain |
| Largest domain | algorithms, 56 concepts in 13 topics | Fits one picture at near full size |
| Concepts in no course | 10 | Sit in their domain like any other |

The note folders (`concept.domain`) give 15 names, where the topics give 11:
transformers, generative models and LLM systems are folders of their own but
all file under the machine learning topics. The topics are the vocabulary
the owner curates, so they decide.

## Decisions

**D1. A concept's domain is its topic's domain.** `concept.topic_slug` is
required, and each topic row has a `domain`. A topic the reader cannot read
falls back to the note's folder, and a concept with neither is under
"Other". A domain's title is its slug as words, acronyms kept upper case
("Classical AI", "HCI").

**D2. Three levels, each its own view.** `/learn` shows one card per domain:
its concept and topic counts, a bar of how much is mastered and learning,
and the domains it links to. `/learn?domain=<slug>` shows that domain's
graph with a list of its topics and concepts beside it.
`?domain=<slug>&topic=<slug>` narrows the graph to one topic. A breadcrumb
(Learn, the domain, the topic) goes back up. Domains with something studied
come first.

**D3. A domain is one bounded picture, drawn near full size.** Each topic is
a group: its concepts laid out in layers by dagre, prerequisites above. The
groups are packed left to right in rows of at most 900 px: a topic after
the topics it needs, and among equals the one more topics need first. The picture fits the width of its card and grows down
the page, which scrolls as a page does: there is no pan and no zoom. The
layout runs on the server, as the island map's did, so dagre stays out of
the browser.

**D4. An edge to another domain is not drawn.** It is listed: the domain
view says which domains it links to and how often, and a concept's panel
lists its prerequisites and dependants elsewhere with their domain, one
press away.

**D5. Hover shows a concept's edges.** Hovering a concept, or its row in the
list, keeps it and its direct neighbours and fades everything else; the
edges touching it turn the accent colour, thicker, drawn above the rest.
The full title shows on a plate. The list follows the graph and the graph
follows the list. Hovering a topic's title lights up its group.

**D6. A concept can be dragged.** Dragging moves it and its edges, and its
topic's group grows or shrinks to follow. Positions are kept for the browser
session per domain, and a "Positions moved" pill with Reset puts them back.
A press without a drag selects.

**D7. The list is the keyboard's way in.** Every concept is a button in the
list. Focus on one highlights it in the graph as hover does, and Enter or a
press opens it in the panel. The graph's nodes take a press but no tab stop,
so tabbing through a domain is the list's length, not twice that.

**D8. Search and filters work across domains.** On the domain cards, a
search counts matches per domain and dims the cards with none; Enter opens
the best match in its domain. Inside a domain, a filter or a search dims the
concepts it would hide, as the island map did.

**D9. The legend's chips preview, and a press commits.** Over the picture
sits a chip per group: Mastered, Learning, Not started and Ready to learn,
each with its swatch (the mastery dot, or the dashed ready ring) and how many
of the concepts on screen are in it, the domain's or the open topic's,
counted whatever the search, as the Status menu counts. Hovering or focusing
a chip keeps that group lit and fades the rest, as a topic's title does
(D5), and writes nothing to the URL; a chip whose count is 0 previews
nothing rather than fading the whole picture. Pressing it sets the Status filter to
that group, so the menu, the chip's pressed state and the URL are one state;
pressing it again clears the filter to all. A filter with no chip (due,
keeps slipping, not in a course) leaves none pressed. A press settles the
preview, so what shows after it is the filter alone, until the pointer or
the focus comes back. The chips wrap, so a phone does not scroll sideways.
Taken from [ResearchRabbit's legend](../design/reference/researchrabbit/graph.md).

**D10. Labels keep their size on screen, and the ones that collide are
culled.** As in [ResearchRabbit](../design/reference/researchrabbit/graph.md),
a label is drawn at 12.5 layout units or at 11px on screen, whichever is
larger, measured from the picture's drawn width. Labels are then placed
greedily in priority order: the hovered concept (always drawn), the
selected one, the ones kept lit (by the hover, a topic's title or a legend
chip, D5 and D9), then mastered, learning and
ready to learn, then by how many drawn edges lead from the concept, then by
id. A label that would overlap one already placed, another concept's dot or
a topic's title is not drawn. Its dot stays, its full title is on the hover
plate, and its accessible name is unchanged. The edges of a culled concept
run to its dot, and a label near the frame is pushed inside it. Labels fade
as they come and go. With the text no longer the limit, the picture is
drawn down to 0.35 of its layout size before it scrolls in its card. That
is the scale where a two-line 11px label still fits between one layer and
the next, and the owner's widest domains fit a 390px phone. Measured on
`gnosia` on 2026-10-05: at 1440 by 900 every domain draws every label;
at 390 wide, 36 of the 56 in algorithms, 29 of 43 in computer architecture
and 16 of 27 in machine learning, with no domain scrolling sideways but
computer architecture (6px). A label's width is the sum of Figtree's
measured glyph widths, so a line of wide letters is not undercounted. Hover and drag frames held at 16.7 ms, and one
culling pass over 60 labels takes about 20 µs.

A topic's title keeps its size the same way (2026-10-05): 12.5 units or
11px on screen, whichever is larger, bold. Its band at the top of the group
grows upward with it, from 22 units at the layout size to 45 at 0.35, where
it stops, since the picture is never drawn smaller. The server packs every
group with the 45-unit band, so a title at its largest never reaches the
row above. A picture drawn larger draws the smaller band and the room left
goes between the rows, so the groups themselves look as they did. That
costs 23 units a row: on `gnosia`'s algorithms (six rows) the picture
grew from 2108 to 2223 units tall, 101px more page at 1440 by 900, and
computer architecture from 1789 to 1882. A group stays as wide as its title
at 12.5 units (the old 7.4 units a letter, or the glyph widths when those
are wider), and a title that grows past its room ends in an ellipsis, the
whole title on a plate when hovered and in the list. Sizing groups for the title at
0.35 instead would make a title-limited group about 2.5 times as wide on
every screen. At 1440 no title is cut; at 1280, 4 of 13 in algorithms and 6
of 11 in computer architecture are; at 390 most are, at 11px where they were
4.4px. A label keeps 2px on screen from a title as from another label, so at
390 algorithms draws 31 of its 56 labels and computer architecture 24 of 43.
A cut title shows whole on a plate over it while the pointer rests there,
in the concept plate's style, at the title's size, kept inside the picture's
frame and fading in and out; a title wider than the frame wraps onto further
lines, and a title that is not cut shows none.

**D11. A domain can be drawn on axes (2026-10-05).** A "Groups / Axes"
switch sits at the right of the breadcrumb row in the domain view, the
kit's `SegmentedControl`. Axes puts each concept at x = its layer, the
longest chain of prerequisites it has inside the domain, and y = how many
concepts of the domain need it, directly or through others, on a log scale
with the most at the top. The axes are captioned "Learn earlier" to "Learn
later" along the bottom and "Needed by more concepts" up the side, and a
soft "Foundational" zone covers the earliest third of the columns down to
the lowest of them in the top half of the scale. There are no topic boxes;
hovering a topic's header in the list lights its concepts, the one way to
see a topic there. Concepts that need each other count as one layer, the
same Tarjan pass the topics use (D3), and each is needed by the others.

The positions are worked out on the server beside the groups
(`DomainLayout.axes`, `axesLayout` in `domain-map.ts`), cached with them, so
the browser runs no graph layout. A column per layer, at most 880 units
across so the owner's ten layers fit a 390px phone at 0.35. Concepts that
would share a spot are spread deterministically: each count of dependants
is a row, the concepts of one layer and one count sit two to a line in
their column, by id, and a row starts no higher than its place on the
scale, below every row above it, and a stack's height below the last dot
in each of its columns. So the more needed concept is always the higher,
the earlier always to the left, and no two dots are within 40 units, which
keeps their hover rings apart. Tests hold that on a fixture and on the
shapes of the owner's algorithms and HCI domains (the HCI one has 14
concepts in one layer that nothing needs).

The choice is in the URL as `layout=axes` (none means groups), survives a
reload and Back, and is kept in memory while the learner moves between
domains and topics. It is left out of the URL on the cards, in the table
and in a topic, which is always drawn in groups and shows no switch.
Switching glides every concept between its two places over 400 ms, ease
out, with the frame gliding too, while the topic boxes and the axes fade
out and in; with motion reduced it is instant. Hover, the plate, the
legend's chips, the list, search, the Status menu and label culling work as
in groups, the captions kept clear of labels as titles are. Nothing drags on
the axes, where a place means something: the groups' dragged places are not
applied there, the "Positions moved" pill is hidden, and both come back
with Groups.

Measured on `gnosia` in the built app: algorithms is 873 by 714 units
on axes (865 by 2230 in groups), so the whole domain fits a 1440 by 900
screen without scrolling; its most needed concept (30 dependants) is in
the top left of the zone. At 1440 wide 23 of its 56 labels are drawn and
22 of computer architecture's 43; at 390 wide, 6 of each, none overlapping
and none under 11px. The glide each way and a hover across 30 concepts held
every frame at 16.7 ms.

## Phases

| Phase | What ships | Done when |
| --- | --- | --- |
| 1. Tree and layout | `topic` on the knowledge base read; `domain-map.ts` (`domainTree`, `domainLayout`, cached); `domain-view.ts` (titles, `groupBox`) | Tests pass; every domain of `gnosia` lays out with no two groups overlapping |
| 2. The views | Domain cards, the domain and topic views, the breadcrumb, the list, the panel, search and filters, the URL; the island map and its viewport code removed, since nothing uses them | e2e walks overview, domain, topic and back |
| 3. Interaction | Hover (D5), drag and Reset (D6), the list in step, keyboard (D7) | e2e hovers, drags and resets; frames under 16 ms |
| 4. Clean-up | DESIGN.md and knowledge-map.md updated, measured on the owner's database, what phases 1 to 3 turned up | The docs describe what ships |

## Measured

Phase 1, on `gnosia`: all 11 domains lay out in 61 ms together, the
largest (algorithms) in 18 ms, with no two topic groups overlapping. The
algorithms domain is 976 by 1,870 px; the others are at most 1,084 px wide
and 1,184 px tall.

Phase 2, on `gnosia`: `/learn` and a domain open in about 900 ms with
the built app (the pictures for all 11 domains travel with the page, so
moving between domains is no round trip). Looking at it turned up three
things, fixed in this phase:

- Topics that need each other in a loop (asymptotic notation, analysis,
  recurrences, amortised analysis) were all pushed to the end. Cycles are
  now one level, and topics order by level, then by how many topics need
  them.
- A line leaving a dot downward ran through that concept's own label.
  Edges now start under the prerequisite's label and stop above the dot.
- Labels were about 9 px at a 1,100 px row. Rows are 900 px, so a domain is
  drawn near full size and grows down the page.

Phase 3, on `gnosia`, in the built app at 1440 by 900: hovering a
concept in algorithms lights it, its neighbours and its 6 edges and fades
the other 49 concepts within 6 ms of the pointer arriving; a 30-step drag
held every frame at 16.7 ms; the moved position was in `sessionStorage`,
survived a reload, and Reset cleared both. Reset glides the concepts home
over 300 ms, or at once with reduced motion.

The picture draws no SVG `<title>` (the owner's call, 2026-10-05): the
browser showed it as its own small grey tooltip a moment after the hover
plate, saying the same thing again. A concept's name for a screen reader is
its `aria-label`, which carries the title, the mastery and the marks; a
topic's is the list's button, since the picture's titles are `aria-hidden`.
