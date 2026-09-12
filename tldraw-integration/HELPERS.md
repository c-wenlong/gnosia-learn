# The helpers bag (specification)

What a snippet passed to `tldrawkc run` can call. Three names are in scope:

| Name | What |
| --- | --- |
| `editor` | The live tldraw `Editor`. Full power, no guard rails. |
| `helpers` | The functions below. Prefer these; they are what keep arrows bound and layouts sane. |
| `tldraw` | The `tldraw` module: `createShapeId`, `toRichText`, `Box`, `Vec`, and every other export. |

The snippet body is wrapped in an async function, so top-level `await`
works and a `return` value comes back to the CLI as `result`. A thrown error
rolls back every change the snippet made.

This API is modelled on the tldraw offline app's `helpers`, which produced a
clean ERD with bound, right-angled arrows in this design session. Where the
offline app has a helper, keep the same name so agents that already know one
tool know the other.

## Shapes

### `helpers.box(id, label, opts)`

Creates a labelled geo shape and returns its id. `id` is a plain string; the
helper calls `createShapeId(id)` so ids are stable and readable
(`shape:query`, not `shape:8f3a...`). Creating an id that already exists
updates that shape instead of throwing, so snippets can be re-run.

`createShapeId(id)` is literally `` `shape:${id}` ``, with no check for a
prefix that is already there, so feeding it a real id would give
`shape:shape:query`. The helpers strip the prefix first and accept either form.

| Option | Default | Notes |
| --- | --- | --- |
| `x`, `y` | required unless `after` or `below` is given | Page coordinates of the top-left corner |
| `w`, `h` | 180 x 64 | `h` is a minimum, not the height: tldraw grows a geo shape with `growY` when its label wraps. Read `getShapePageBounds` when placing something against a box, never `props.h` |
| `geo` | `rectangle` | Any tldraw geo: `rectangle`, `ellipse`, `oval`, `diamond`, `cloud`, `hexagon`, `triangle`, `star`, ... (`oval` is the capsule shape; there is no `pill`) |
| `color`, `fill` | `black`, `none` | tldraw style values |
| `font`, `size` | `draw`, `m` | |
| `align`, `verticalAlign` | `middle`, `middle` | A long label wants `verticalAlign: 'start'` and a taller box, not a separate text shape |
| `after: otherId, gap` | gap 120 | Place to the right of another shape, same y |
| `below: otherId, gap` | gap 120 | Place under another shape, same x |
| `parent` | page | A frame or group id. The coordinates given are page coordinates, as everywhere else in this API; the helper converts them into the parent's space, because tldraw reads a child's `x` and `y` there |

`DEFAULT_GAP` for `after` and `below` is 120 page units. A tighter gap is legal
and sometimes right, but at 60 or less tldraw has almost no line to draw a
label on and the result reads as a word floating between two boxes.

### `helpers.text(id, str, opts)`

A standalone text shape for headings and free labels. Same placement
options as `box`. Words that belong to a shape go in that shape's label, not
here.

### `helpers.note(id, str, opts)`

A sticky note. For asides and "why" callouts in teaching diagrams.

### `helpers.remove(ids)` and `helpers.clear()`

Delete by id, or delete every shape on the current page. `clear` is
refused when the snippet did not create the document, unless called as
`helpers.clear({ force: true })`. This mirrors the offline app's rule about
never clearing a page you did not create.

### `helpers.plainText(shape)`

The visible text of a shape, read from its rich text. Use this rather than
parsing `props.richText`.

## Connections

### `helpers.connect(fromId, toId, opts)`

The only sanctioned way to draw a meaningful arrow. Creates an arrow shape
with a real binding at both ends and returns the arrow id. Both ends follow
their shapes when moved.

| Option | Default | Notes |
| --- | --- | --- |
| `label` | none | Arrow label text |
| `kind` | `elbow` | `elbow` for horizontal and vertical segments with right-angle bends, `arc` for a straight or curved line |
| `start`, `end` | auto | Anchor on each shape as `{ x: 0..1, y: 0..1 }`, or a side name: `top`, `right`, `bottom`, `left`. Auto picks the facing sides. |
| `bend` | 0 | For `arc` only |
| `mid` | 0.5 | For `elbow`: where along the path the bend lands, 0..1. Use it to keep parallel arrows in separate lanes. |
| `head` | `end` | `end`, `both`, `none` |
| `labelPosition` | 0.5 | 0..1 along the arrow |
| `color`, `size`, `dash` | `black`, `s`, `draw` | |

The arrow's id is derived from the pair, `shape:arrow:<from>-><to>`, which is
what makes `connect` idempotent: re-running a snippet updates the same arrow
instead of stacking a second one on it. A shape id containing `->` is refused
rather than encoded, because `a->b` to `c` and `a` to `b->c` would derive the
same arrow id and the second call would silently steal the first one's arrow.
`opts.id` names a second arrow between the same pair.

The binding's props also include `snap`, an `ElbowArrowSnap` (`center`,
`edge-point`, `edge` or `none`) that the validator requires.
`ArrowBindingUtil.getDefaultProps()` supplies it, so the helper passes a
partial `props` and does not set it. The same goes for `isExact`.

The arrow schema's own default `kind` is `arc`, not `elbow`, so `connect` sets
`kind` on every arrow rather than relying on the shape default. Elbow routing
reads `props.elbowMidPoint` (that is what `mid` sets); `bend` is an arc-only
field and the two are separate.

Every binding is `isPrecise: true`, auto ends included, because an imprecise
binding ignores `normalizedAnchor` and aims the terminal at the shape's centre.
Two boxes whose centres differ (any row where one label wrapped and grew its
box) then get a short dog-leg that the arrow label sits on top of, and it reads
as a broken arrow. `opts.precise: false` hands the entry point back to tldraw's
router for the rare case that wants it.

An end the caller did not name gets its anchor from the band where the two
shapes' extents overlap: one page-space line is run down that band and both
anchors are put on it, so the arrow is straight whenever a straight arrow is
possible. Shapes that do not overlap at all fall back to the plain side
midpoint, where a bend is unavoidable anyway.

The elbow router is tldraw's own; the helper's job is anchors, mid point and
binding, not path maths.

### `helpers.attribute(ownerId, label, side, opts)`

An ERD convenience: a short text shape placed off one side of a box and
joined by a bound line with no arrowhead. `side` is `top`, `right`,
`bottom` or `left`; `opts.at` (0..1) spaces several attributes along the
same side; `opts.gap` is the stub length. Returns `{ textId, lineId }`.

### `helpers.stub(id, x, y, dx, dy)`

A decorative unbound line. Sets `meta.lintIgnore = ['friendless-arrow']`
so the lint pass knows it is intentional. For the loose marks in a legend
and nothing else.

## Layout

### `helpers.row(ids, opts)` and `helpers.column(ids, opts)`

Lay existing shapes out in a line with `gap` (default 40), aligned on
`align` (`start`, `center`, `end`), starting from the first shape's
position or from `opts.x`, `opts.y`.

### `helpers.grid(ids, cols, opts)`

Rows of `cols` shapes with `gapX`, `gapY`.

### `helpers.boxShapes(ids, opts)`

Draws a labelled container behind a set of shapes with a margin (default
40) and returns the container id. `opts.label`, `opts.color`,
`opts.shapeId`. Used for grouping ("events", "browser process") and for
mermaid subgraphs. The container is a geo rectangle, sent to back, not a
frame, so the enclosed shapes keep page coordinates. It carries
`meta.container = true`, which is how the lint pass knows to exempt it from
`overlapping-shapes` and `empty-label`.

### `helpers.translate(ids, dx, dy)`

Move shapes and let bound arrows follow.

### `helpers.fitCamera(opts)`

Fits the camera to all shapes. With no options it is `editor.zoomToFit()`;
with `opts.padding` it computes the page bounds and calls
`editor.zoomToBounds(bounds, { inset: padding })`, because `zoomToFit`
itself takes no padding. Exports frame to shape bounds on their own, so
this matters only for `--headed` runs and serve mode.

## Import

### `helpers.mermaid(source, opts)`

Parses a mermaid `flowchart` or `graph` and creates boxes, bound arrows and
containers for subgraphs. `opts.direction` overrides the header,
`opts.origin` sets the top-left, `opts.spacing` sets rank and node gaps.
Returns `{ nodes: { mermaidId: shapeId }, edges: [arrowIds], unsupported:
[lines] }`. `from-mermaid` in [CLI.md](CLI.md) is this helper behind a
command.

Internally it is two functions, and the split is what makes the parser
unit-testable without a browser:

| Function | Where | What |
| --- | --- | --- |
| `parseMermaid(source, opts): Plan` | `page/helpers/mermaid.ts`, pure, no editor | Tokenises the flowchart, assigns each node a rank (longest path from the sources) and a slot within the rank, and returns a `Plan`. |
| `applyPlan(plan): result` | same file, needs `editor` | Creates the shapes with `box`, the arrows with `connect`, the subgraph containers with `boxShapes`. |

```ts
type Plan = {
  direction: 'TD' | 'TB' | 'LR' | 'RL' | 'BT'
  nodes: Array<{ id: string; label: string; geo: string; x: number; y: number; w: number; h: number; subgraph?: string }>
  edges: Array<{ from: string; to: string; label?: string; dashed?: boolean }>
  subgraphs: Array<{ id: string; label: string; nodeIds: string[] }>
  unsupported: string[]
}
```

The layout is deliberately simple. The agent is expected to look at the
result and nudge.

## Reading and checking

### `helpers.describe()`

The same structure `inspect` prints: every shape with bounds and text,
every binding, every lint. Snippets call it to decide what to do next
without a second CLI round trip.

### `helpers.getLints()`

Returns `Lint[]`, the same array the bridge's `lints()` returns. Rules in v1:

| Rule | Fires when |
| --- | --- |
| `friendless-arrow` | An arrow has no binding at one or both ends and no `meta.lintIgnore` |
| `overlapping-text` | Two text-bearing shapes' label boxes intersect |
| `overlapping-shapes` | Two geo shapes intersect by more than 10 percent of the smaller one's area. Shapes with `meta.container = true` (from `boxShapes`) are skipped on both sides of the pair. |
| `off-page` | A shape sits at negative coordinates far enough that exports clip it |
| `empty-label` | A geo shape has no text and no fill and is not a container, so it renders as an unexplained outline |
| `unreadable-label` | A label's text width exceeds its shape width and the shape is not set to grow |

`run` calls this after every snippet and returns exit code 3 when the list
is not empty. Lints are advisory about intent (a legend stub is fine) but
strict about the two failure modes that made hand-written SVG unreliable in
this repo: overlaps and arrows pointing at nothing.

## Example snippet

The three-box loop from this design session, written against this API:

```js
helpers.box('agent', 'agent cli', { x: 60, y: 60, w: 170, h: 64 })
helpers.box('page', 'headless page', { after: 'agent', gap: 120, w: 190, h: 64 })
helpers.box('png', 'screenshot png', { below: 'page', gap: 90, w: 190, h: 64 })
helpers.box('tab', 'browser tab', { after: 'page', gap: 140, w: 170, h: 64 })

helpers.connect('agent', 'page', { label: 'exec' })
helpers.connect('page', 'png', { label: 'toImage' })
helpers.connect('png', 'agent', { label: 'read', start: 'left', end: 'bottom' })
helpers.connect('page', 'tab', { label: 'mirror', dash: 'dashed' })

return helpers.getLints()
```

The gaps are 120 and 140 because a labelled arrow needs room: at the 80 and 60
this example used to carry, the `mirror` label covers the whole gap and lands
on both box outlines.

Followed by `tldrawkc shot loop.tldr`, a look at the PNG, and a second
snippet that nudges whatever is off.
