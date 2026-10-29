import { createElement, type ReactNode } from "react";

import type { SvgCompile, SvgNode } from "@/lib/svg-block";
import { cx } from "@/components/ui/classes";

/**
 * The picture an `svg` block is (D105 of docs/STUDIO-MENTIONS.md). A fenced
 * ```svg block anywhere `NoteProse` renders — a planner reply, a tutor
 * answer, a note — draws inline rather than showing its markup, and because
 * `compileSvg` keeps whatever the stream has finished writing, a reply that
 * is still arriving draws its picture top to bottom as the elements land.
 *
 * Pure render only — no state, no hooks — so it draws inside the server
 * component tree NoteProse already is, and re-parses each streamed delta on
 * the client for free.
 */

function nodeView(node: SvgNode | string, key: number): ReactNode {
  if (typeof node === "string") return node;
  return createElement(node.tag, { key, ...node.attrs }, ...node.children.map((child, i) => nodeView(child, i)));
}

/** A number like `640` or `640px`, or null: what a `viewBox` can be built from. */
function px(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function SvgBlock({ compiled, className }: { compiled: Exclude<SvgCompile, { kind: "not-svg" }>; className?: string }) {
  if (compiled.kind === "drawing") {
    // The opening `<svg` is in but no element has finished: the frame says a
    // picture is being drawn here, dashed like the thread's other
    // still-arriving cards. Its words never change while it waits, so the
    // status is read once, not on every delta.
    return (
      <p
        role="status"
        className={cx(
          className,
          "flex items-center rounded-xl border-2 border-dashed border-border px-4 py-8 text-xs text-text3",
        )}
      >
        Drawing a picture…
      </p>
    );
  }
  const { root } = compiled;
  const attrs: Record<string, unknown> = { ...root.attrs };
  if (attrs.viewBox === undefined) {
    const width = px(typeof attrs.width === "string" ? attrs.width : undefined);
    const height = px(typeof attrs.height === "string" ? attrs.height : undefined);
    if (width !== null && height !== null) attrs.viewBox = `0 0 ${width} ${height}`;
  }
  // The picture sizes to the column and keeps its own ratio; the markup's
  // width and height never pin it (D105's `viewBox` always, `width` never).
  delete attrs.width;
  delete attrs.height;
  attrs.role = typeof attrs.role === "string" ? attrs.role : "img";
  // A screen reader names the picture by its own `<title>` (compileSvg points
  // `aria-labelledby` at it), else by what it is.
  if (attrs["aria-label"] === undefined && attrs["aria-labelledby"] === undefined) attrs["aria-label"] = "Picture";
  attrs.style = { display: "block", width: "100%", height: "auto" };
  return (
    <figure className={cx(className, "overflow-hidden rounded-xl border border-border")}>
      {createElement("svg", attrs, ...root.children.map((child, i) => nodeView(child, i)))}
    </figure>
  );
}
