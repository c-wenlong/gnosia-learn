# ResearchRabbit graph: how it is laid out, drawn and driven

Source: `index.js` (3,241,511 bytes, Vite + React + styled-components). Byte offsets are from `grep -b` on the raw minified file; line numbers (`pretty.js:N`) are from a Prettier 3 pass of the same file. Minifier kept most top-level names, so identifiers below are the real ones.

Two facts first:

- The engine is **plain Canvas 2D**, one `<canvas>`, custom entity system. `GraphSurface` (byte 2544571) calls `A.current.render(P.current?.getContext("2d"), ...)`. The WebGL strings in the bundle (`pretty.js:40564`, `:40860`) belong to an unrelated library (screenshot/html-to-image code), not the graph. No d3-force, no physics: `grep` for `forceSimulation`, `forceManyBody`, `d3.` finds nothing.
- The code is the **Litmaps** map engine: the layout help links go to `docs.litmaps.com/.../understand-research-faster-visually`, a layout string says "to other articles on this Litmap", and the tab is called "Map" (`viewOptions = ["split","list","map"]`, byte 2392017). (inferred: ResearchRabbit ships Litmaps' engine.)

Pipeline at a glance:

```
items (articles/authors) ─► useAssembly steps (pure functions, re-run on any dependency change)
   generateDots ─► generateEdges ─► assembleIndependentPositions (x,y from axis modes)
   ─► assembleScaleToBounds (into a 500-tall box) ─► assembleSizes ─► assembleCustomPositions
   ─► assembleMinimumDotSpacing (collision) ─► assembleLabels ─► assembleInteraction (hover/select/recede)
   ─► assembleEdgeArrows ─► handles (hit rects)
   └► entitiesHotState.set(graphId, {dots, edges, labels, ...})
GraphEngine.handleInput ─► per-entity setParameters (animates to new values) ─► dirty
rAF loop (useAnimationFrame) ─► engine.update ─► engine.render (only while dirty / animating)
```

---

## 1. Layout

### 1.1 Axes are data fields, not a force simulation

Each node's x and y come from an independently chosen "layout mode" (`useAssembleIndependentPositions`, byte 2476059). Defaults are in `DEFAULT_LAYOUT_SETTINGS` (byte 2450042):

| Setting | Default |
|---|---|
| `positions.settings.x.mode` | `"date"` with `{ compact: true, reverse: false }` |
| `positions.settings.y.mode` | `"fedges"` (citation count) with `{ interpolation: "log", logBase: 4 }` |
| `sizes.mode` | `"fedges"`, log base 4 |
| `positions.avoidCollisions` | `true` |
| `positions.collisionTolerance` | `0.05` |
| `canvas.renderEdgeArrows` | `"always"` (options `always`, `whenInteracting`, `never`) |
| `canvas.pointArrowsTowards` | `"bedges"` ("Cited article") |
| `canvas.aspect` | `null` (free; options 16:9, 4:3, 1:1) |
| `labels.mode` | `"first-year"` |

Axis modes offered in the UI (`positionLayoutOptions = ["fedges","bedges","date"]`, byte 2435673); size modes `["static","fedges","bedges"]`. The `layouts` table (byte 2435769) also defines `cluster`, `momentum`, `mapRelevance`, `custom` with axis captions; the hint strings the user sees come from `axisDescription`:

| Mode | Label | Axis caption | Value per node (`getArticlesValuesMap`, byte 2473888) |
|---|---|---|---|
| `date` | Publication Date | "More recently published" / "Older publications" | compact: rank of distinct publish-millis; else raw millis. Missing dates get the mean |
| `fedges` | Cite Count | "More citations" | `log(forwardEdgeCount + 1) / log(logBase)` (or linear) |
| `bedges` | Ref Count | "More references" | same on `backwardEdgeCount` |
| `momentum` | Momentum | "More citations (age-adjusted)" | `forwardEdgeCount * 0.1 / days_since_pub ^ exponent` (exponent default 3.3, slider 1 to 3.5) |
| `mapRelevance` | Map Connectivity | "More connected" | `0.1 ×` number of in-map nodes it cites or is cited by |
| `cluster` | Cluster | n/a | y from `cellSort` (see 1.4) |
| `static` | Fixed | "static position" | constant (`static.value`, 20; slider 3 to 50) |

Log base options are 2, 4, 8. "Compact" = "Trims excess space between dates": x becomes the rank of each unique date, so gaps in time collapse to even spacing.

### 1.2 Normalise, flip, then fit into a fixed box

```js
applyLayoutSettingsToField(f, "x", A, u.settings.x, { normalise: true });         // 0..1
applyLayoutSettingsToField(f, "y", A, u.settings.y, { normalise: true, scale: -1 }); // 0..-1, so "more" is up
// later, useAssembleScaleDotsToBounds:
normaliseDotsField(c, "x", a.x, a.x + (a?.width || 200));
normaliseDotsField(c, "y", a.y, a.y + (a?.height || 200));
```

The target box is `looseBounds` from `GraphScreenshotFrame` (`LOOSE_BOUNDS_SCALE = 500`, byte 2464012): height 500 graph units, width `500 × aspect`, where aspect is the container's width/height (or the chosen fixed aspect). So the layout always fills a 500-unit-tall box with the container's shape, then the camera fits it to screen. Scaling inside the box is linear (`remap(..., "linear")`); the log lives in the value function.

### 1.3 Node size

`useAssembleDotSizes` (byte ~2477444): the size value map (default log4 citations) is normalised into a diameter range that shrinks as the graph grows:

```js
minSizeBounds = [10, 25], maxSizeBounds = [25, 50], minSizeArticles = 150
s = Math.min(n / 150, 1); s = s * s;
range = [25 - 15*s, 50 - 25*s]   // diameter in graph units
```

So 1 to ~20 nodes: diameters 25 to 50; 150+ nodes: 10 to 25. Authors get a fixed 10. `size` is a diameter; radius = `size / 2`.

### 1.4 Collision avoidance (on by default)

`useAssembleDotMinimumSpacing` (byte ~2487245), `METHOD = "old"` path, runs after positions and sizes. For each node in order, test it against every other node; overlap means centre distance < `(sizeA + sizeB)/2 × (1 − tolerance)` = 0.95 of touching. On first overlap it jumps to just outside the blocker along the line between them, then walks an outward spiral until free:

```js
MAX_ATTEMPTS = 200, THETA_INCREMENT = 2π/6, ITERATION_SIZE_AMOUNT = 0.5, GRACE_OFFSET_AMOUNT = 0.005
// first hit: P = other + dir * max(size) * 0.505
// each full turn: radius += size * (0.5*0.95 + 0.005); turns++
// each step: angle += (2π/6) / turns   → finer angular steps on outer rings
```

Results are cached per node on `(x, y, size)`, so it only re-solves when the layout really changes. O(n² × attempts). A second solver, `solveNoOverlapStatelessSweepVarR` (byte 2489007, sweep-and-prune on x, 25 iterations, padding 2, anchor pull 0.2 back to the original spot, stop when max overlap < 0.25) exists behind a debug command `switch`; it is off by default.

### 1.5 "Cluster" ordering (offered in code, not in the default axis menu)

`cellSort` / `getCompactY` (bytes 2473170, 2471113): x = rank by `year + month/12`; y = an ordering that greedily inserts each node at the slot that minimises the summed Euclidean length of its edges to already-placed neighbours. Passes: 1 if n > 80, 2 if > 40, 3 if > 20, 4 if > 10, else 5. Candidate slots sampled every `max(1, floor(n/50))`. Both axes then get `normalizeObject` and `addBuffer` (half a slot of padding at each end). This is a 1-D crossing-reduction heuristic, not clustering by community.

### 1.6 Authors view

When the result type is authors, articles keep their axis positions and **authors are placed on a ring** around the centre of the article cloud (`useAssembleIndependentPositions`): radius = `max(xRange, yRange, 10)` (0 if only one author), angle step `2π / authorCount`. Author nodes use the `Author` path icon and size 10.

### 1.7 Manual positions

Dragged nodes are stored in `sessionStorage` per graph (`LocalCustomPositionsContextProvider`, key = graph id, e.g. `explore_<session>_<step>`) and applied by `useAssembleCustomPositions` after scaling. When any exist, the axes are replaced by a pill "Positions Moved" with a Reset action (`GraphBrokenAxes`), since the axes no longer mean anything.

---

## 2. Rendering

### 2.1 Canvas, DPR and the frame loop

- `GraphCanvas` (byte 2539339): canvas `width = cssWidth × dpi`, `height = cssHeight × dpi`, CSS size in px. `dpi` from `useDPI` (byte 1447551) = `window.devicePixelRatio`, updated via `matchMedia("screen and (min-resolution: 2dppx)")`.
- `GraphEngine.render` (byte 2531109): `ctx.scale(dpi)`, `clearRect`, optional background fill, then camera transform `ctx.scale(z, z); ctx.translate(-cam.x, -cam.y)`. So `screen = (graph − cam) × z`.
- Loop: `useAnimationFrame` (byte 2403937) runs rAF forever, but only calls back when > 1000/120 ms have passed, passing `dt` normalised to 60 fps. The engine **draws on demand**: `render` returns early unless `dirty`; `cleanUp()` clears `dirty` once every entity's animations are complete. Camera moves make it dirty indirectly: `assembleHandlePositions` depends on `cameraHotState`, so a camera change re-runs the assembly, which calls `handleInput`, which sets `dirty`.
- Sizes that should stay constant on screen are multiplied by `camera.inverse_z` (line widths, selection rings, label scale). Node radii, edge arrowheads and the collision gap are in graph units and grow with zoom.

### 2.2 Draw order

`renderOrder` array (byte 2414503), lowest first:

`background, area, circle, region, topic, recedingArticle, edge, article, significantArticle, focusEdge, relatedToFocusArticle, pulse, icon, label, selectedArticle, hoveredArticle, title, focusLabel, resizer, box, debug`

So: faded nodes, then edges, then normal nodes, then highlighted edges, then neighbours of the focus, then labels, then the selected and hovered node on top of labels, then the hovered node's full-title label on top of everything.

### 2.3 Nodes (`GraphArticle`, byte 2505645)

Per node, in this order:

1. **Knock-out halo**: fill a circle of radius `r + 4` (graph units) with `globalCompositeOperation = "destination-out"`. This erases the edges under and around the node, giving every node a 4-unit clear gap.
2. `globalAlpha = opacity` (1, or 0.1 when receding).
3. If selected: filled disc `rgba(149,204,255,1)` (#95CCFF), radius `r + 6/z`.
4. Optional `halo` ring at `r + 6`, width `2/z`.
5. `stroke` ring at `r`, width `4/z` if the node has a fill, else `2/z`.
6. Fill: one colour → solid disc; several colours (one per collection folder) → pie slices starting at 45°, separated by 1/z white lines drawn with destination-out.
7. Icon (once `aliveAmount > 0.8`): a 24×24 SVG path (`Path2D`) scaled to `2r × iconSize` (`renderIcon`, byte 2502803). `iconColor: "REMOVE"` draws the icon with destination-out, so it is cut out of the fill.
8. Hover: ring `rgba(149,204,255,1)` at `r + 6/z`, width `2/z`.
9. Highlighted (legend hover): ring `#C8EBFF` at `r + 2/z`, width `4/z`.
10. Modified: ring `#DFA0EF` at `r + 3/z`, width `3/z`.

How that produces the three node looks (from `Graph`, byte 2551146, and `ExploreGraph`, byte 2559207):

| Node | Data | Looks like |
|---|---|---|
| Result (`article`) | `fill: null, stroke: "black"` | black 2 px ring; no fill is drawn, so the punched-out hole shows the white page behind |
| Search input | `icon: "Seed", iconSize: 0.8`; `iconColor: "REMOVE"` if it is a saved `userArticle`, else `"black"` | saved inputs: folder-colour disc with the seed cut out (reads as a white icon); unsaved: white ring node with black seed |
| Saved article (`userArticle`) | `fill: folder colours`, unfiled = CSS `--unsorted` | coloured disc (pie if in several collections) |
| Ticked in the list | `icon: "Tick", iconSize: 0.6` | tick inside the node |

Folder colours are CSS variables `--ugc-amber, --ugc-ruby, --ugc-amethyst, --ugc-violet, --ugc-sky, --ugc-cyan, --ugc-teal, --ugc-leaf` (byte 3003075). The orange the user sees is most likely `--ugc-amber`, the first one (inferred; the hex lives in the CSS file, not the JS). Default node colour if a fill array is empty: `"black"`.

Icon paths available: `Author, EvaluationAlert, EvaluationCaution, Seed, Star, StarCircle, Tick` (`graphIconPathMap`, byte 2502506).

Pro accounts get evaluation badges (`GraphBadge`): a 28-unit disc cut out at `(x + size×0.4, y − size×0.4)` with the alert/caution icon at 0.7 scale.

### 2.4 Edges (`GraphEdge`, byte 2510348)

Straight lines, centre to centre when no arrow. Colours (`staticColors`, byte 2510083):

| Theme | Normal | Focus (either end hovered or selected) | Print mode normal / focus |
|---|---|---|---|
| light | `#ACB8C6` | `#2782F7` | `#666` / `#437EC9` |
| dark | `#777` | `#2782F7` | `#bbb` / `#dedede` |

- Width: `1/z` (1 screen px), focus `2/z`; times `printerLineWidth` (default 1.5) in printer mode.
- Alpha 0.25 when either end recedes.
- Hidden until both endpoints have `aliveAmount ≥ 0.8` (so edges appear after nodes pop in).
- With arrows on: the line runs from the `from` node's rim to 5 units outside the `to` node's rim, plus a filled triangular head at the `to` end:

```js
lt = atan2(from.y - to.y, from.x - to.x);
tip = to + dir(lt) * (to.width + 5) * 0.5;
wingA = tip + dir(lt + 0.5) * 10;   wingB = tip + dir(lt - 0.5) * 10;  // ±0.5 rad, 10 graph units
```

The head is in graph units, so it scales with zoom. Edges come from the API `/edges/between` with `from = forwardEdge`, `to = backwardEdge`; the legend hint reads "Citing → Referenced", so arrows point at the referenced (older) paper (inferred from the hint). Note: `assembleEdgeArrows` only checks the arrow setting is truthy and reads `fromEntity` twice, so `pointArrowsTowards` does not actually flip the head at render time in this build (read; looks like a bug).

### 2.5 Labels (`GraphLabel`, byte 2514554; `positionLabel`, byte 2513492)

- Text: short label = the paper's `nickname` (e.g. "Smith, 2019") with `", "` replaced by a newline, so author on one line, year under it. Full label on hover = `"<nickname> – <title>"`.
- Fonts: normal `12px Plus Jakarta Sans`, neighbour/emphasis `600 12px`, selected `600 14px`. Colour `#363B47` (dark mode `white`). White halo: `strokeText` with `#fff`, width `3/z` (4 in print), plus `shadowColor #fff, shadowBlur 3` (skipped on Firefox).
- Placement: always side `bottom`, centred, 1 px below the node's rim (`y + size/2`). Hovered label is pushed 12 more units down and drawn on a `rgba(255,255,255,0.8)` rounded rect (radius 6, padding 6). Wrap width 300 px. Multi-line height = font box × 1.25, drawn with a 0.75 line-height factor.
- Labels are drawn at a **constant screen size** (`ctx.scale(inverse_z)` inside the label).
- Hiding, in this order:
  1. node is receding or label `hidden` → no label;
  2. while anything is hovered or selected, every label that is not on the focus node or a direct neighbour is hidden (`applyLabelInteraction`, byte 2478900);
  3. **greedy screen-space collision**: each frame's update walks labels in `updateOrder = 100 − priority`, and a label whose screen rect intersects any already-placed rect (`inout_graphLabelPositions`) is skipped. Hovered = priority 3, selected = 2, everything else ends up 0 (the intended citation-count priority is read off the wrong field: `Ie.priority?.forwardEdgeCount`; read, looks like a bug).
- There is **no zoom threshold**. Because labels stay 12 px while node spacing grows with zoom, zooming in lets more labels pass the overlap test (inferred consequence).
- `forceLabels` (screenshot setting) draws every label regardless of collisions.

### 2.6 Other overlays

- Box select rect (`GraphBox`): fill `rgba(151,191,251,0.22)`, stroke `var(--color-cta)` at `0.5/z` (a CSS var is not valid for canvas, so the stroke is likely ignored; inferred).
- `renderSelectionBox` `#5F95FF` 1/z; `renderHoverBox` `#95CCFF` 2/z (used for titles and regions).
- `GraphSnippet`: pill label (14px, bg `#B8DCF6` at 0.8 alpha, radius 24) at a node's top-right; used for text snippets.

### 2.7 Export

`GraphSurface.exportImage` re-renders the scene into an offscreen canvas at `superscale = targetWidth / frameWidth` (default target 1920×1080), then composites the HTML overlay (axes, legend) captured with an html-to-image routine, and returns a PNG. The frame shows with insets 48 px top and bottom, 12 px sides, a `rgba(24,45,85,0.2)` dim outside, and drag handles to change aspect ("Drag handles to change figure aspect ratio"). Screenshot settings: label scale, UI scale, force labels, printer mode, printer line width 1.5, background colour.

---

## 3. Interaction

### 3.1 Input surface

`GraphTouchSurface__TouchSurface` (byte 2539585) is an absolutely positioned div on top of the canvas; the canvas has `pointer-events-none`. Only **mouse** events are handled (`onMouseMove/Down/Up/Enter/Leave`); there are no touch, pointer, pinch, gesture or double-click handlers in the graph code. Coordinates are converted with:

```js
getGraphX = (sx, cam) => (cam.x * cam.z + sx) / cam.z    // = cam.x + sx / z
```

### 3.2 Hover and hit-testing

`GraphTouchHandler.onMouseMove` (byte 2482468) → `getHit(handles, point)` = first handle in array order whose **axis-aligned square** contains the point (`clickFunctions.within`, strict `>`/`<`). A dot's handle is `[x − size/2, x + size/2]²` using the target size, not the animated one. Linear scan, no spatial index. On hit: `graphHoveredHotState.set([handle])`, cursor `pointer`.

Hover effect (`applyDotInteraction`, byte 2479652), applied whenever anything is hovered, selected, or legend-highlighted:

- focus nodes (hovered, selected, highlighted) are kept and become "edge providers";
- their direct neighbours (any edge to a focus node) are kept and drawn in the `relatedToFocusArticle` layer;
- **every other node recedes**: opacity animates to 0.1 over 100 to 200 ms (random per node), its edges drop to alpha 0.25, its label hides;
- edges touching a hovered or selected node turn `#2782F7` and 2 px and move to the `focusEdge` layer;
- the hovered node's label switches to the full title on a white plate.

### 3.3 Click, select, inspect

- Click = mouse up with < 2 px movement (`DRAG_THRESHOLD = 2`).
- Click on a node: selection = `[node]`; with Shift or Meta held (`batchSelect`) it toggles the node in the selection.
- Then `inferInspectionFromSelection`: if the selection contains an article or author, the **last one becomes the "inspected" item** (opens its detail panel and is drawn as selected), and the selection is cleared. So in practice a click inspects one paper; multi-select collapses to the last item (read).
- Click on empty space: clears selection and inspection, fires `onEmptyClick`.
- Backspace/Delete removes the selected items when the host passes `onRemove`.

### 3.4 Drag

Mode = `graph-panByDefault` (localStorage, default `false`, i.e. pointer mode) XOR Space held. The toolbar's first button toggles it ("Toggle Pointer/Pan [Space]").

| Mode | Drag starts on a node | Drag starts on empty space |
|---|---|---|
| Pointer | moves that node, or the whole selection if the node is in it; saved to session storage on drop | rubber-band box; nodes whose **centre** is inside are hovered live and selected on release (Shift/Meta = symmetric toggle) |
| Pan (or Space) | pans | pans: `cam.x = start.cam.x + (start.screenX − screenX) / z` |

Cursor: `grab` in pan mode, `grabbing` while dragging, `pointer` over a node.

### 3.5 Zoom and pan

- Wheel: the handler exists (`ZOOM_SPEED = 0.0055`, `MIN_ZOOM = 0.1`, byte 2539695): Ctrl or Meta + wheel (also trackpad pinch, which arrives as ctrl+wheel) zooms towards the cursor with `z' = max(0.1, z − deltaY × 0.0055 × z)`; plain wheel pans by `delta / z`. **But in this build the function that attaches the wheel listener is an empty stub** (`const ft = reactExports.useCallback(() => {}, [wt])`, byte 2540960), so the wheel does nothing on the graph (read). No maximum zoom is enforced anywhere except during recenter.
- Zoom to a point keeps that point fixed: `zoomCameraTowards` (byte 2407385):

```js
const gx = getGraphX(screenX, cam), gy = getGraphY(screenY, cam);
x = (gx * z' - screenX) / z';   y = (gy * z' - screenY) / z';
```

- Toolbar zoom in/out: factor **1.4** about the centre of the graph bounds, animated **200 ms**.
- Keys: `+`/`=` and `-`/`_` zoom by **1.2** (Shift: **1.8**), 200 ms; arrow keys pan **40 screen px** (Shift: **160**), 200 ms; `F` recenters. Key handlers ignore inputs, textareas and contenteditable.

### 3.6 Recenter / fit (`useGraphRecenter`, byte ~2416813)

Fits the bounding box of all non-inactive nodes (and areas, circles, regions, titles):

```js
padX = max(width * 0.1, 24);  padY = max(height * 0.12, 24);   // 0.4 each when only one node
zFitAll = min((W - 2padX) / bboxW, (H - 2padY) / bboxH);
cam = getEclipsingCamera(activeBBox, viewport, padX, padY, { maxZoom: zFitAll / 0.7 });
```

Animated with the default camera animation; runs once without animation 100 ms after data, edges or loading state change (`setTimeout(() => gt({ noAnimation: true }), 100)`).

### 3.7 Animation

- Camera (`AnimatedCamera`, byte 2408538): default **500 ms, `cubicEaseInOut`**; interpolates `z` directly and the camera position in screen space (`x × z`) so a zoom-and-pan looks straight.
- Nodes: spawn `aliveAmount` 0→1 over **600 to 1100 ms** (random), and the drawn radius is multiplied by `backEaseOut(aliveAmount)`, so nodes pop in with an overshoot. Death fade **300 to 1000 ms**. Position and size changes tween over **200 to 400 ms** (random per node), `cubicEaseInOut`. Recede/unrecede opacity **100 to 200 ms**. Random durations stagger the motion so the graph does not move as one block.
- Edges, labels and icons wait until `aliveAmount > 0.8`.

### 3.8 List and graph stay in sync through shared "hot state"

There is one store keyed `<graphId>_<name>` (`generateHotState`): `graph-hovered`, `graph-selection`, `graph-highlighted`, `graph-isolated`, `graph-box`, `camera`, `entities`, `handles`. The assembly subscribes to them, so any write re-runs layout and redraws.

- List row hover → `withGraphHovers` (byte 1074186) maps the item to its graph handle by `item.compare` and writes `graph-hovered`; the graph applies the full hover treatment (neighbours kept, others fade). Graph hover → the same state → the list row's `isHovered` is true. Two-way.
- Clicking a node sets the "inspected" item, which the step persists (`updateSearchStep(..., { inspected })`) and the side panel shows.
- List checkboxes (`SelectionContext`) → ticked items get the `Tick` icon in the graph.
- Legend chips "Search inputs", "Results", "Added" set `graph-highlighted` on mouse enter (`setHighlighted`), giving the same fade-others effect for that group. "References" has no items, so it only shows the hint "Citing → Referenced".

---

## 4. View modes

- Search results page: `viewOptions = ["split", "list", "map"]` (byte 2392017). **Split** = list (min 400, max 450 px) beside the graph (`flex: 2`); **List** = list only; **Map** = graph only. Split is unavailable below the `lg` breakpoint and falls back to list. Library/collection pages offer `["list", "table", "split", "map"]`, loading 500 items per page for map vs 50 otherwise.
- There is **one** graph engine and one layout family. The variants are layout settings, not different renderers: x/y axis each pick Publication Date, Cite Count or Ref Count (code also has Momentum, Map Connectivity, Cluster, Fixed), node size picks Fixed, Cite Count or Ref Count, linear or log, plus Reverse/Compact. These live in a settings panel opened from the axis captions or the toolbar's last button ("About").
- Authors: when a search outputs authors, author nodes form a ring around the article cloud (section 1.6) with the Author icon.
- Quickstart import uses the same graph with non-seed nodes forced to `recedes: true` and a legend chip "Seed articles".

---

## 5. Design tokens near the graph

| Element | Styles (exact) |
|---|---|
| Toolbar `GraphControls__Container` | `font-size:16px; border-radius:var(--2); display:flex; gap:var(--1)`; placed `position:absolute; bottom:var(--2); right:var(--2); flex-direction:column` |
| Toolbar button `GraphControls__StyledButton` | `border-radius:var(--1); padding:var(--2); font-size:18px; hover background rgba(0,0,0,0.05)` |
| Toolbar buttons, in order | Pointer/Hand toggle "[Space]", Recenter "[F]", Zoom in "[+]", Zoom out "[-]", About (opens layout settings) |
| Axis caption `GraphAxes__AxisLabel` | `font-size:12px; color:var(--grey-secondary); margin:var(--1) var(--2); nowrap` |
| Axis line | `height:1px; background:var(--grey-tertiary); width:var(--8)` (short piece `var(--4)`), arrow icon `var(--grey-tertiary)` |
| Axis gutters | vertical 30 px wide (caption rotated −90°), horizontal 30 px tall, corner 22×22 px; caption hover background white |
| Legend `ExploreGraphLegend__Container` | `display:flex; flex-wrap:wrap; gap:var(--1); font-size:12px; color:var(--grey-primary)`; at `top:6px; right:6px` |
| Legend chip | `padding:var(--1) var(--2); border-radius:24px; cursor:help; hover background white`; icon colour via `$iconColor` |
| Loading note | `font-size:14px; font-weight:var(--font-weight-medium); color:var(--color-dim)`; container `top:48px`, centred, `rgba(255,255,255,0.5)` |
| "Positions Moved" pill | `border-radius:48px; background:var(--activity-important); padding:var(--1) var(--2); bottom-left var(--3)` |
| Canvas colours | selection/hover ring `#95CCFF`, highlight `#C8EBFF`, modified `#DFA0EF`, box `#5F95FF`, edge `#ACB8C6` / `#2782F7`, label `#363B47` on `#fff` halo |
| Font | Plus Jakarta Sans everywhere on the canvas |

---

## What is worth copying for a learning-topics map

(inferred, opinion) The parts that make it feel good are cheap: field-driven axes instead of physics (positions are stable and meaningful), a fixed 500-unit layout box fitted by the camera, the destination-out gap around nodes, constant-pixel labels with greedy collision culling, fade-everything-but-neighbours on hover, random 200 to 400 ms tween durations, and on-demand redraw. The parts to avoid repeating: square hit-testing with a linear scan, label priority being lost, and multi-select collapsing to one inspected item.
