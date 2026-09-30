## Options

What goes in each helper's last argument. Every field is optional unless it
says otherwise. A misspelt option is ignored rather than refused, so check the
spelling against this list. Re-running a helper on an existing key rewrites
every option you leave out back to its default, so restate what you set before.

{{VALUE_TYPES}}

<!-- helper: box -->
**`box(key, label, opts)`**: `x`, `y` (top-left; required unless `after` or
`below` is given, or the shape exists); `w` 180, `h` 64 (a minimum); `geo`
`rectangle`; `color` `black`; `labelColor` (follows `color`); `fill` `none`;
`dash` `draw`; `font` `draw`; `size` `m`; `align` `middle`; `verticalAlign`
`middle` (a long label wants `start` and a taller box); `after: key` or
`below: key` with `gap` 120; `parent: key` (a frame or group; coordinates stay
page coordinates); `meta` (record metadata, where `lintIgnore` goes).

<!-- helper: text -->
**`text(key, str, opts)`**: `x`, `y`, `after`, `gap`, `parent`, plus `w`
(fixes the width and wraps; without it the text sizes itself), `color` (the
text's colour), `font` `draw`, `size` `m`, `textAlign` `start`, `meta`, and
three that place it against other shapes after tldraw has measured it:
`centerOn: key | key[]` (centred on their union at the `y` given),
`above: key | key[]` (`gap` clear over them, centred), `below: key | key[]`
(`gap` clear under them; one key shares its left edge, a list centres). Words
that belong to a shape go in that shape's label, not a `text`.

<!-- helper: note -->
**`note(key, str, opts)`**: `x`, `y`, `after`, `gap`, `centerOn`, `above`,
`below`, `parent`, `color`, `labelColor`, `font`, `size`, `align`,
`verticalAlign`, `meta`. No `w` or `h`: a sticky note sizes itself from `size`
and grows downwards. For an aside, never for an element of the diagram.

<!-- helper: connect -->
**`connect(from, to, opts)`**: `label`; `kind` `elbow` (right angles) or `arc`
(straight, or curved with `bend`); `start`, `end` (an `AnchorSpec`; auto by
default: facing sides, straight whenever the shapes overlap on one axis);
`bend` 0 (`arc` only; positive bends a quarter turn anticlockwise from the
direction of travel); `mid` 0.5 (`elbow` only: where along the path the bend
lands; give parallel arrows different values to keep them in separate lanes);
`head` `end`; `labelPosition` 0.5 (0..1 along the arrow); `color` `black`;
`labelColor`; `size` `s`; `dash` `draw`; `font` `draw`; `precise` true (leave
it); `id` (a key for a second arrow between the same pair: the default key is
derived from the pair, so a second plain `connect` rewrites the first); `meta`.

<!-- helper: line -->
**`line(key, x1, y1, x2, y2, opts)`**: an unbound mark between page points,
for axes, ticks, guides and legend dashes. `color` `black`; `size` `s`; `dash`
`draw`; `head` `none`; `kind` `arc`; `bend` 0; `label`; `labelColor`; `parent`;
`meta`; `lintIgnore` (defaults to `['friendless-arrow', 'arrow-crosses-shape']`;
`[]` lints it like an arrow, `true` mutes every rule). The default leaves
`line-crosses-label` on: a line may cross a shape, never its words.

<!-- helper: stub -->
**`stub(key, x, y, dx, dy, opts)`**: `line` with a delta instead of a second
point. The same options as `line`.

<!-- helper: attribute -->
**`attribute(owner, label, side, opts)`**: a short text off one side of a box,
joined by a headless bound line. `at` 0.5 (0..1 along the side, to space
several); `gap` 60 (stub length); `size` `s`; `color` `black`; `font` `draw`;
`id`.

<!-- helper: boxShapes -->
**`boxShapes(keys, opts)`**: a labelled container drawn behind shapes that
already exist, sent to the back, exempt from the overlap and empty-label rules.
`label`; `margin` 40; `color` `grey`; `dash` `draw`; `size` `s` (of the label);
`shapeId` (its key; derived from the label when omitted, so name it when you
will refer to it); `minW`, `minH` (floors on its size); `matchSize: key` (end up
the same size as that other container); `meta`.

<!-- helper: alignContainers -->
**`alignContainers(keys, opts)`**: puts every listed container on the largest
width and the largest height in the set, each keeping its top-left. `axis`
`both` (`x`, `y`).

<!-- helper: row -->
**`row(keys, opts)`**: lays existing shapes out left to right. `gap` 40;
`align` `start` (an `Align`, on the cross axis); `x`, `y` (where the line
begins; default the first shape's position). The default gap of 40 leaves no
room for a labelled arrow; pass 120 or more when arrows will run between them.

<!-- helper: column -->
**`column(keys, opts)`**: `row`, top to bottom. The same options.

<!-- helper: grid -->
**`grid(keys, cols, opts)`**: rows of `cols` shapes. `gapX` 40, `gapY` 40;
`x`, `y` (top-left; default the first shape's position).

<!-- helper: clear -->
**`clear(opts)`**: `force` (required to wipe a page that held shapes when the
snippet started; never on a document you were handed).

<!-- helper: fitCamera -->
**`fitCamera(opts)`**: `padding`. Exports frame themselves, so you do not need
it.

<!-- helper: mermaid -->
**`mermaid(source, opts)`**: `direction`, `origin` `{ x, y }` (default 60,
60), `rankGap` 120, `nodeGap` 60, `margin` 40.
