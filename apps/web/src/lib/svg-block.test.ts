import { describe, expect, it } from "vitest";

import { compileSvg, type SvgNode } from "@/lib/svg-block";

/**
 * D105 of docs/STUDIO-MENTIONS.md: the `svg` kind's reply is a fenced block
 * of markup, compiled here — tolerant of the stream's mid-tag cuts, strict
 * on what may reach the DOM.
 */

const figure = (source: string): SvgNode => {
  const compiled = compileSvg(source);
  expect(compiled.kind).toBe("figure");
  return (compiled as { root: SvgNode }).root;
};

describe("a finished picture", () => {
  it("parses a plain document and keeps text as children", () => {
    const root = figure('<svg viewBox="0 0 640 360"><rect x="10" y="10" width="80" height="40"/><text x="20" y="35">SYN</text></svg>');
    expect(root.tag).toBe("svg");
    expect(root.attrs.viewBox).toBe("0 0 640 360");
    expect(root.children[0]).toMatchObject({ tag: "rect", attrs: { x: "10" } });
    expect(root.children[1]).toMatchObject({ tag: "text", children: ["SYN"] });
  });

  it("skips the prolog, comments, doctype and processing instructions", () => {
    const root = figure('<?xml version="1.0"?><!DOCTYPE svg><!-- drawn --><svg viewBox="0 0 1 1"/>');
    expect(root.tag).toBe("svg");
  });

  it("decodes entities in text and attribute values", () => {
    const root = figure('<svg><text>&lt;ack&gt; &amp; &#65;</text><rect x="1" y="2"/></svg>');
    const text = root.children[0] as SvgNode;
    expect(text.children).toEqual(["<ack> & A"]);
  });
});

describe("the stream's cuts (D105)", () => {
  it("is `drawing` while only the opening tag is in", () => {
    expect(compileSvg('<svg viewBox="0 0 640 360"').kind).toBe("drawing");
    expect(compileSvg("<svg").kind).toBe("drawing");
  });

  it("draws every element whose markup finished and drops the dangling tail", () => {
    const root = figure('<svg viewBox="0 0 640 360"><rect width="10"/><circle cx="4" cy="');
    expect(root.children).toHaveLength(1);
    expect((root.children[0] as SvgNode).tag).toBe("rect");
  });

  it("keeps an unclosed parent's completed children: top to bottom as they land", () => {
    const root = figure('<svg viewBox="0 0 1 1"><g><rect width="5"/></g><text x="1">');
    expect(root.children.map((node) => (node as SvgNode).tag)).toEqual(["g", "text"]);
  });

  it("treats a start tag cut mid-attribute as not yet an element", () => {
    const root = figure('<svg viewBox="0 0 1 1"><rect width="10" fill="#aaa');
    expect(root.children).toHaveLength(0);
  });

  it("ignores a close tag that matches nothing open", () => {
    const root = figure("<svg></g><rect width=\"4\"/></svg>");
    expect(root.children).toHaveLength(1);
  });
});

describe("what is not a picture", () => {
  it("is `not-svg` for markup that never opens one", () => {
    expect(compileSvg("hello world").kind).toBe("not-svg");
    expect(compileSvg("<div>not it</div>").kind).toBe("not-svg");
  });

  it("is `not-svg` when the whole `<svg>` element fails the allowlist", () => {
    // `svg` is always allowed; a foreign root alone is not the picture.
    expect(compileSvg("<html><svg-fake/></html>").kind).toBe("not-svg");
  });
});

describe("the allowlist (D105)", () => {
  it("drops script, foreignObject, image and their subtrees, keeping siblings", () => {
    const root = figure(
      '<svg viewBox="0 0 1 1"><script>alert(1)</script><foreignObject><div>html</div></foreignObject><image href="x.png"/><rect width="4"/></svg>',
    );
    expect(root.children.map((node) => (node as SvgNode).tag)).toEqual(["rect"]);
  });

  it("drops event handlers, style and source attributes, keeping the element", () => {
    const root = figure('<svg viewBox="0 0 1 1"><rect width="4" onclick="go()" style="fill:red" src="x"/></svg>');
    const rect = root.children[0] as SvgNode;
    expect(Object.keys(rect.attrs)).toEqual(["width"]);
  });

  it("keeps only same-picture fragments in href, and only url(#id) in url()s", () => {
    const root = figure(
      '<svg><defs><g id="a"/></defs><use href="#a"/><use href="https://x/y.svg#a"/><textPath href="#a"/><rect fill="url(#g)"/><rect fill="url(https://x)"/></svg>',
    );
    const uses = root.children.filter((node) => (node as SvgNode).tag === "use") as SvgNode[];
    expect(uses[0]!.attrs.href).toBe("#a");
    expect(uses[1]!.attrs.href).toBeUndefined();
    const rects = root.children.filter((node) => (node as SvgNode).tag === "rect") as SvgNode[];
    expect(rects[0]!.attrs.fill).toBe("url(#g)");
    expect(rects[1]!.attrs.fill).toBeUndefined();
  });

  it("names the elements and attributes in the casing SVG reads", () => {
    const root = figure('<svg viewbox="0 0 1 1"><lineargradient><stop offset="0" stop-color="#000"/></lineargradient><rect stroke-width="2" fill-opacity=".5"/></svg>');
    expect(root.attrs.viewBox).toBe("0 0 1 1");
    const gradient = root.children[0] as SvgNode;
    expect(gradient.tag).toBe("linearGradient");
    expect((gradient.children[0] as SvgNode).attrs.stopColor).toBe("#000");
    const rect = root.children[1] as SvgNode;
    expect(rect.attrs.strokeWidth).toBe("2");
    expect(rect.attrs.fillOpacity).toBe(".5");
  });

  it("caps a runaway reply: markup past the limit is not read", () => {
    const huge = `<svg viewBox="0 0 1 1"><rect width="4"/>` + "x".repeat(200_000);
    const root = figure(huge);
    expect(root.tag).toBe("svg");
  });
});
