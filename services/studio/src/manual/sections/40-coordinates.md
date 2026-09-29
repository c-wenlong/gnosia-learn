## Coordinates and sizes

- Page units, with the origin at the top left, x to the right and y **down**.
  Every helper takes page coordinates, including for a shape inside a parent.
- Start the first shape at (60, 60) and place every other one relative to what
  exists: `after` (to the right, same top edge), `below` (underneath, same left
  edge), and for `text` and `note` also `above` and `centerOn`. Work out an
  absolute `x`, `y` only for the first shape of a cluster, or for geometry such
  as an axis.
- A box is 180 by 64 by default. Never make one smaller than 160 by 60 at the
  default size `m`: the label will not fit.
- `h` is a minimum, not the height. tldraw grows a box downwards when its label
  wraps, so two boxes given the same `h` can render at different heights. Give
  every box in a row the same `w` and an `h` tall enough for the longest label
  (about 64 for one line, 96 for two), or read the real bounds with
  `helpers.describe()` or `editor.getShapePageBounds('shape:<key>')`; never
  `props.h`.
- A labelled arrow needs room: about 120 units plus ten per character of its
  label. `after` and `below` default to a gap of 120, which fits a short label
  and nothing longer; `row`, `column` and `grid` default to 40, which fits no
  label at all. At 60 or less the label covers the whole line and lands on
  both boxes.
- Equal widths along a row, equal heights along a column. A reader takes a size
  difference for a meaning.
- Keep the whole drawing inside about 2000 by 1400 units. An export is framed
  to the union of every shape, so one stray shape far away shrinks everything
  else to unreadable, and past 10000 units from the origin it is a lint.
- Fonts: `draw` (the default, hand-drawn), `sans`, `serif`, `mono`. `draw` and
  `mono` have no `θ λ α β σ μ` (`π` and `√` are fine); no font has
  `⇒ ∈ ∉ ⊂ ∪ ∩ ∀ ∃ ∧ ∨ ∇`. Put Greek on a label with `font: 'sans'`, and write
  set notation out in words.
