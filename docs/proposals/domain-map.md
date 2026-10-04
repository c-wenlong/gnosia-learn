# Proposal: the Learn map is grouped by domain

Status: built, 2026-10-04, all four phases: 1 the tree and the layout
([#354](https://github.com/c-wenlong/self-learn/pull/354)), 2 the views and
the island map removed ([#358](https://github.com/c-wenlong/self-learn/pull/358)),
3 hover and drag ([#365](https://github.com/c-wenlong/self-learn/pull/365)),
4 these docs ([#366](https://github.com/c-wenlong/self-learn/pull/366)). It replaces the island map
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

Measured on `self_learn` on 2026-10-04:

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
(D5), and writes nothing to the URL. Pressing it sets the Status filter to
that group, so the menu, the chip's pressed state and the URL are one state;
pressing it again clears the filter to all. A filter with no chip (due,
keeps slipping, not in a course) leaves none pressed. A press settles the
preview, so what shows after it is the filter alone, until the pointer or
the focus comes back. The chips wrap, so a phone does not scroll sideways.
Taken from [ResearchRabbit's legend](../design/reference/researchrabbit/graph.md).

## Phases

| Phase | What ships | Done when |
| --- | --- | --- |
| 1. Tree and layout | `topic` on the knowledge base read; `domain-map.ts` (`domainTree`, `domainLayout`, cached); `domain-view.ts` (titles, `groupBox`) | Tests pass; every domain of `self_learn` lays out with no two groups overlapping |
| 2. The views | Domain cards, the domain and topic views, the breadcrumb, the list, the panel, search and filters, the URL; the island map and its viewport code removed, since nothing uses them | e2e walks overview, domain, topic and back |
| 3. Interaction | Hover (D5), drag and Reset (D6), the list in step, keyboard (D7) | e2e hovers, drags and resets; frames under 16 ms |
| 4. Clean-up | DESIGN.md and knowledge-map.md updated, measured on the owner's database, what phases 1 to 3 turned up | The docs describe what ships |

## Measured

Phase 1, on `self_learn`: all 11 domains lay out in 61 ms together, the
largest (algorithms) in 18 ms, with no two topic groups overlapping. The
algorithms domain is 976 by 1,870 px; the others are at most 1,084 px wide
and 1,184 px tall.

Phase 2, on `self_learn`: `/learn` and a domain open in about 900 ms with
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

Phase 3, on `self_learn`, in the built app at 1440 by 900: hovering a
concept in algorithms lights it, its neighbours and its 6 edges and fades
the other 49 concepts within 6 ms of the pointer arriving; a 30-step drag
held every frame at 16.7 ms; the moved position was in `sessionStorage`,
survived a reload, and Reset cleared both. Reset glides the concepts home
over 300 ms, or at once with reduced motion.
