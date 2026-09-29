## Options

What goes in each helper's last argument. Every field is optional unless it
says otherwise; anything not listed here is not an option, and a misspelt one
is ignored rather than refused, so check the spelling against this table.

{{STYLE_VALUES}}

**`box(key, label, opts)`**: `x`, `y` (top-left; required unless `after` or
`below` is given, or the shape exists); `w` 180, `h` 64 (a minimum); `geo`
`rectangle` (also `ellipse`, `oval` the capsule, `diamond`, `hexagon`,
`triangle`, `cloud`, `star`, `trapezoid`, `pentagon`, `octagon`, `rhombus`;
there is no `pill` and no rounded rectangle); `color` `black`; `labelColor`
(follows `color`); `fill` `none`; `dash` `draw`; `font` `draw`; `size` `m`;
`align` `middle`; `verticalAlign` `middle` (a long label wants `start` and a
taller box); `after: key` or `below: key` with `gap` 120; `parent: key` (a frame
or group; coordinates stay page coordinates); `meta` (record metadata, where
`lintIgnore` goes).

**`text(key, str, opts)`**: the placement fields of `box` (`x`, `y`, `after`,
`gap`, `parent`), plus `w` (fixes the width and wraps; without it the text
sizes itself), `color`, `labelColor`, `font` `draw`, `size` `m`, `textAlign`
`start`, `meta`, and three that place it against other shapes after tldraw has
measured it: `centerOn: key | key[]` (centred on their union at the `y` given),
`above: key | key[]` (`gap` clear over them, centred), `below: key | key[]`
(`gap` clear under them; one key shares its left edge, a list centres). Words
that belong to a shape go in that shape's label, not a `text`.

**`note(key, str, opts)`**: the placement fields of `text` (`x`, `y`, `after`,
`gap`, `centerOn`, `above`, `below`, `parent`), `color`, `labelColor`, `font`,
`size`, `align`, `verticalAlign`, `meta`. No `w` or `h`: a sticky note sizes
itself from `size` and grows downwards. For an aside, never for an element of
the diagram.

**`connect(from, to, opts)`**: `label`; `kind` `elbow` (right angles) or `arc`
(straight, or curved with `bend`); `start`, `end`: where each end sits, as a
side (`top`, `right`, `bottom`, `left`) or `{ x, y }` in 0..1 of the shape, auto
by default (facing sides, straight whenever the shapes overlap on one axis);
`bend` 0 (`arc` only; positive bends a quarter turn anticlockwise from the
direction of travel); `mid` 0.5 (`elbow` only: where along the path the bend
lands; give parallel arrows different values to keep them in separate lanes);
`head` `end` (`start`, `both`, `none`); `labelPosition` 0.5 (0..1 along the
arrow); `color` `black`; `labelColor`; `size` `s`; `dash` `draw`; `font` `draw`;
`precise` true (leave it); `id` (a key for a second arrow between the same
pair: the default key is derived from the pair, so a second plain `connect`
updates the first); `meta`.

**`line(key, x1, y1, x2, y2, opts)`** and **`stub(key, x, y, dx, dy, opts)`**:
unbound marks between page points, for axes, ticks, guides and legend dashes.
`color` `black`; `size` `s`; `dash` `draw`; `head` `none` (`end`, `start`,
`both`); `kind` `arc` (`elbow` for right angles); `bend` 0; `label`;
`labelColor`; `parent`; `meta`; `lintIgnore` (defaults to
`['friendless-arrow', 'arrow-crosses-shape']`; `[]` lints it like an arrow,
`true` mutes every rule).

**`attribute(owner, label, side, opts)`**: a short text off one side of a box,
joined by a headless bound line. `at` 0.5 (0..1 along the side, to space
several); `gap` 60 (stub length); `size` `s`; `color` `black`; `font` `draw`;
`id`.

**`boxShapes(keys, opts)`**: a labelled container drawn behind shapes that
already exist, sent to the back, exempt from the overlap and empty-label rules.
`label`; `margin` 40; `color` `grey`; `dash` `draw`; `size` `s` (of the label);
`shapeId` (its key; derived from the label when omitted, so name it when you
will refer to it); `minW`, `minH` (floors on its size); `matchSize: key` (end up
the same size as that other container); `meta`.

**`alignContainers(keys, opts)`**: puts every listed container on the largest
width and the largest height in the set, each keeping its top-left. `axis`
`both` (`x`, `y`).

**`row(keys, opts)`** and **`column(keys, opts)`**: lay existing shapes out left
to right, or top to bottom. `gap` 40; `align` `start` (the cross axis:
`start`, `center`, `end`; note `center` here, not `middle`); `x`, `y` (where the
line begins; default the first shape's position). The default gap of 40 leaves
no room for a labelled arrow; pass a `gap` of 120 or more when arrows will run
between the shapes.

**`grid(keys, cols, opts)`**: rows of `cols` shapes. `gapX` 40, `gapY` 40;
`x`, `y` (top-left; default the first shape's position).

**`clear(opts)`**: `force` (required to wipe a page that held shapes when the
snippet started; never on a document you were handed). **`fitCamera(opts)`**:
`padding`; exports frame themselves, so you do not need it.
**`mermaid(source, opts)`**: `direction` (`TD`, `TB`, `LR`, `RL`, `BT`),
`origin` `{ x, y }` (default 60, 60), `rankGap` 120, `nodeGap` 60, `margin` 40.
