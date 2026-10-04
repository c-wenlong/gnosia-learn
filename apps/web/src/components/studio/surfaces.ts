import { buttonClasses, cx } from "@/components/ui/classes";

/**
 * The studio's own surfaces: the tile every diagram and video sits on, the
 * bar a job draws over its picture, and the sheet the home view's grid sits
 * in. Studio-local on purpose. A tile is the kit `Card`'s idea at the
 * studio's density (radius 12 and a 1px edge where the card has 20 and 2px,
 * since a grid of them at 200px a column is the screen's whole content), so
 * it is written once here rather than five times in the files that draw one.
 *
 * React-free, so the server components (the loading frame) and the client
 * ones (the tiles) take the same strings.
 */

/** A tile's frame: radius 12, a 1px edge, the surface. The caller lays out what is inside. */
const TILE_SHAPE = "relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface";

/** A tile, a new diagram's or video's card, and the loading frame's placeholder for one. */
export const TILE = cx(TILE_SHAPE, "border-border");

/**
 * A diagram's tile with no topic: the edge in the warn colour, since the
 * catalog refuses such a diagram by name and this tile is the only place it
 * shows.
 */
export const TILE_WARNED = cx(TILE_SHAPE, "border-warn");

/**
 * A tile's lift: a few pixels up under the pointer or keyboard focus, as
 * Gauth's story card does, still under reduced motion. No shadow with it: the
 * kit has none besides the button's lip (docs/design/IMPLEMENTATION.md), and a
 * black one does not show on a dark ground. box-shadow stays in the
 * transition so a selected tile's ring still eases in.
 */
export const TILE_LIFT =
  "transition-[translate,box-shadow,background-color] duration-200 ease-out hover:-translate-y-[3px] focus-within:-translate-y-[3px] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-within:translate-y-0";

/**
 * The row of actions over a tile's thumbnail, top right: Open canvas and
 * Extend on a diagram, Change on a video. Shown on hover, on keyboard focus
 * anywhere in the tile so Tab reaches them, and while Extend is opening
 * (`data-pending`); invisible controls take no clicks. The tile carries
 * `group`. Each control is an `overlay` `Button` at `xs`.
 */
export const TILE_ACTIONS =
  "pointer-events-none absolute top-2 right-2 flex gap-1.5 opacity-0 transition-opacity duration-100 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 has-[[data-pending]]:pointer-events-auto has-[[data-pending]]:opacity-100 motion-reduce:transition-none";

/**
 * The bar at the foot of a job's picture, a diagram's or a video's: what the
 * job is doing and the one control that belongs there. `studio-glass` is its
 * frosted ground (globals.css). `pointer-events-none`, and back on for its
 * controls, so a click on the words opens the job like a click anywhere else
 * on the picture.
 */
export const JOB_BAR =
  "studio-glass pointer-events-none absolute inset-x-2 bottom-2 flex min-w-0 items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs shadow-sm";

/**
 * A control in that bar drawn on a link (Talk it through, a `PanelLink`): a
 * secondary kit `Button`'s classes at `xs`, its pointer events back on. A
 * button there is the kit `Button` itself, with the same two props.
 */
export const JOB_CONTROL = buttonClasses({ variant: "secondary", size: "xs", className: "pointer-events-auto" });

/**
 * The home view's sheet: the panel the strip and the grid sit in under the
 * composer, rounded at the top only and running off the foot of the page.
 * The strip inside it rounds its own top to match (`StudioStrip surface`).
 */
export const SHEET = "mx-2 rounded-t-3xl border border-b-0 border-hair bg-surface md:mx-4";
