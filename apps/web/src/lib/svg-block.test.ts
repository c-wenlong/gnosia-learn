import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SvgBlock } from "@/components/SvgBlock";

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
      '<svg><defs><g id="a"/><linearGradient id="g"/></defs><use href="#a"/><use href="https://x/y.svg#a"/><textPath href="#a"/><rect fill="url(#g)"/><rect fill="url(https://x)"/></svg>',
    );
    const defs = (root.children[0] as SvgNode).children as SvgNode[];
    const uses = root.children.filter((node) => (node as SvgNode).tag === "use") as SvgNode[];
    expect(uses[0]!.attrs.href).toBe(`#${defs[0]!.attrs.id}`);
    expect(uses[1]!.attrs.href).toBeUndefined();
    const rects = root.children.filter((node) => (node as SvgNode).tag === "rect") as SvgNode[];
    expect(rects[0]!.attrs.fill).toBe(`url(#${defs[1]!.attrs.id})`);
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

/** The picture as the page would render it: React must not throw on anything the sanitiser kept. */
function rendered(source: string): string {
  const compiled = compileSvg(source);
  if (compiled.kind === "not-svg") return "";
  return renderToStaticMarkup(createElement(SvgBlock, { compiled }));
}

describe("url() and the CSS parser (S2-01)", () => {
  it.each([
    ["an upper-case function name", '<rect fill="URL(https://evil.example/x.png?d=1)"/>'],
    ["a mixed-case function name", '<rect fill="uRl(https://evil.example/x)"/>'],
    ["a CSS escape inside the name", '<rect fill="u\\72 l(https://evil.example/x)"/>'],
    ["an entity that decodes to url(", '<rect fill="&#117;rl(https://evil.example/x)"/>'],
    ["image-set in a mask", '<rect mask="image-set(\'https://evil.example/x.png\' 1x)"/>'],
    ["a prefixed image-set", '<rect mask="-webkit-image-set(\'https://evil.example/x.png\' 1x)"/>'],
    ["a url() after a fragment", '<rect fill="url(#a), url(https://evil.example/x)"/>'],
    ["a page variable", '<rect fill="var(--accent)"/>'],
  ])("drops %s", (_, rect) => {
    const root = figure(`<svg viewBox="0 0 1 1">${rect}</svg>`);
    const kept = root.children[0] as SvgNode;
    expect(kept.tag).toBe("rect");
    expect(kept.attrs).toEqual({});
  });

  it("drops cursor and filter whatever they hold: a hover can fetch the one, nothing draws the other", () => {
    const root = figure('<svg><rect cursor="URL(https://evil.example/x.png), auto" filter="url(#f)" width="2"/></svg>');
    expect((root.children[0] as SvgNode).attrs).toEqual({ width: "2" });
  });

  it("keeps the colour and transform functions a picture needs, and a quoted font list", () => {
    const root = figure(
      '<svg><rect fill="rgb(1, 2, 3)" stroke="HSLA(0 0% 0% / .5)" transform="rotate(45 5 5) translate(1,2) skewX(3)" font-family="\'Inter\', sans-serif"/></svg>',
    );
    expect((root.children[0] as SvgNode).attrs).toEqual({
      fill: "rgb(1, 2, 3)",
      stroke: "HSLA(0 0% 0% / .5)",
      transform: "rotate(45 5 5) translate(1,2) skewX(3)",
      fontFamily: "'Inter', sans-serif",
    });
  });

  it("reads url(#id) in any case and points it at the prefixed id", () => {
    const root = figure('<svg><marker id="arrow"/><line marker-end="URL( \'#arrow\' )"/></svg>');
    const marker = root.children[0] as SvgNode;
    expect((root.children[1] as SvgNode).attrs.markerEnd).toBe(`url(#${marker.attrs.id})`);
  });
});

describe("href is only a fragment, however it is spelled (S2-02)", () => {
  it.each(["xlinkHref", "XLINK:HREF", "xlink-href", "HREF"])("reads %s as href", (name) => {
    const root = figure(`<svg><g id="a"/><use ${name}="/api/assets/x/file#a"/><use ${name}="#a"/></svg>`);
    const [, outside, inside] = root.children as SvgNode[];
    expect(outside!.attrs).toEqual({});
    expect(inside!.attrs).toEqual({ href: `#${(root.children[0] as SvgNode).attrs.id}` });
  });

  it("drops a data: or javascript: href", () => {
    const root = figure('<svg><use href="data:image/svg+xml,<svg/>"/><use xlink:href="javascript:alert(1)"/></svg>');
    expect((root.children as SvgNode[]).map((use) => use.attrs)).toEqual([{}, {}]);
  });
});

describe("an animation changes only what the picture could have written (S1-14, S2-02)", () => {
  it.each(["href", "xlink:href", "xlinkHref", " HREF ", "class", "className", "style", "id", "onclick", "onbegin", "cursor", "role"])(
    "drops a set or animate naming %s, element and all",
    (target) => {
      const root = figure(
        `<svg><use href="#a"><set attributeName="${target}" to="https://evil.example/x.svg#a"/><animate attributeName="${target}" values="fixed inset-0"/><animateTransform attributeName="${target}"/></use></svg>`,
      );
      expect((root.children[0] as SvgNode).children).toEqual([]);
    },
  );

  it("keeps an animation of geometry or paint, and checks the values it sets", () => {
    const root = figure(
      '<svg><circle r="4"><animate attributeName="opacity" values="0;1" dur="1s"/><set attributeName="fill" to="URL(https://evil.example/x)"/><animateTransform attributeName="transform" type="rotate" from="0 5 5" to="360 5 5"/></circle></svg>',
    );
    const [fade, paint, spin] = (root.children[0] as SvgNode).children as SvgNode[];
    expect(fade).toMatchObject({ tag: "animate", attrs: { attributeName: "opacity", values: "0;1", dur: "1s" } });
    expect(paint).toMatchObject({ tag: "set", attrs: { attributeName: "fill" } });
    expect(paint!.attrs.to).toBeUndefined();
    expect(spin).toMatchObject({ tag: "animateTransform", attrs: { attributeName: "transform", type: "rotate" } });
  });

  it("moves a timing reference to another element with the prefix", () => {
    const root = figure('<svg><animate id="one" attributeName="x" dur="1s"/><animate attributeName="y" begin="one.end+1s; 2s" end="one.click"/></svg>');
    const [one, two] = root.children as SvgNode[];
    expect(two!.attrs.begin).toBe(`${one!.attrs.id}.end+1s; 2s`);
    expect(two!.attrs.end).toBe(`${one!.attrs.id}.click`);
  });
});

describe("compileSvg never throws, and nothing it keeps makes React throw (S2-03)", () => {
  it.each(["&#1114112;", "&#x110000;", "&#xD800;", "&#0;", "&#99999999999999999999;"])("leaves %s literal", (entity) => {
    const root = figure(`<svg><text>a${entity}b</text></svg>`);
    expect((root.children[0] as SvgNode).children).toEqual([`a${entity}b`]);
    expect(() => rendered(`<svg><text fill="${entity}">x</text></svg>`)).not.toThrow();
  });

  it("drops React's own props, which would throw or replace a key", () => {
    const source =
      '<svg dangerouslySetInnerHTML="x" ref="r" key="k" children="c" suppressHydrationWarning=""><rect dangerouslysetinnerhtml="x" width="1"/></svg>';
    const root = figure(source);
    expect(root.attrs).toEqual({});
    expect((root.children[0] as SvgNode).attrs).toEqual({ width: "1" });
    expect(() => rendered(source)).not.toThrow();
  });

  it("drops an element or attribute named after an Object.prototype member", () => {
    const source = '<svg constructor="x" toString="y" __proto__="z"><constructor/><toString/><hasOwnProperty/><rect valueOf="1" width="2"/></svg>';
    const root = figure(source);
    expect(root.attrs).toEqual({});
    expect(root.children).toHaveLength(1);
    expect((root.children[0] as SvgNode).attrs).toEqual({ width: "2" });
    expect(() => rendered(source)).not.toThrow();
  });

  it("drops namespaced and unlisted elements, script and style included", () => {
    const root = figure('<svg><svg:script>alert(1)</svg:script><style>*{}</style><a href="#x"><rect/></a><feImage href="x"/><rect width="1"/></svg>');
    expect((root.children as SvgNode[]).map((node) => node.tag)).toEqual(["rect"]);
  });

  it("stops at the depth cap rather than recursing without end", () => {
    const deep = "<g>".repeat(5_000);
    expect(() => compileSvg(`<svg>${deep}<rect/>`)).not.toThrow();
  });
});

describe("class and id are the picture's own (S2-04)", () => {
  it("drops class, so the app's utilities cannot lift a picture over the page", () => {
    const root = figure('<svg class="fixed inset-0 z-50" className="x"><rect class="fixed"/></svg>');
    expect(root.attrs).toEqual({});
    expect((root.children[0] as SvgNode).attrs).toEqual({});
    expect(rendered('<svg class="fixed inset-0"><rect/></svg>')).not.toContain("fixed");
  });

  it("prefixes every id per picture, so two pictures never share one", () => {
    const one = figure('<svg><marker id="arrow"/><line marker-end="url(#arrow)"/></svg>');
    const two = figure('<svg viewBox="0 0 2 2"><marker id="arrow"/><line marker-end="url(#arrow)"/></svg>');
    const idOne = (one.children[0] as SvgNode).attrs.id!;
    const idTwo = (two.children[0] as SvgNode).attrs.id!;
    expect(idOne).toMatch(/^svg[0-9a-z]+-arrow$/);
    expect(idOne).not.toBe(idTwo);
    // The same text is the same picture on the server and in the browser.
    expect(figure('<svg><marker id="arrow"/><line marker-end="url(#arrow)"/></svg>')).toEqual(one);
  });

  it("drops an id no fragment could name", () => {
    const root = figure('<svg><g id="a b"/><g id="fetch"/></svg>');
    const [spaced, plain] = root.children as SvgNode[];
    expect(spaced!.attrs.id).toBeUndefined();
    expect(plain!.attrs.id).toMatch(/^svg[0-9a-z]+-fetch$/);
  });

  it("gives two copies of the same picture on one page their own ids, references included", () => {
    const source = '<svg><circle id="button" r="2"/><animate attributeName="r" begin="button.click" to="4"/><use href="#button"/></svg>';
    const compiled = compileSvg(source);
    if (compiled.kind === "not-svg") throw new Error("expected a picture");
    const markup = renderToStaticMarkup(
      createElement(Fragment, null, createElement(SvgBlock, { compiled }), createElement(SvgBlock, { compiled })),
    );
    const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]!);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    for (const id of ids) {
      expect(markup).toContain(`begin="${id}.click"`);
      expect(markup).toContain(`href="#${id}"`);
    }
  });

  it("points aria references at the prefixed ids", () => {
    const root = figure('<svg aria-describedby="d"><desc id="d">Two arrows</desc></svg>');
    expect(root.attrs["aria-describedby"]).toBe((root.children[0] as SvgNode).attrs.id);
  });
});

describe("the picture's accessible name (S2-22)", () => {
  it("is its own title when it has one", () => {
    const markup = rendered("<svg><title>TCP handshake</title><rect/></svg>");
    const id = /<title id="([^"]+)"/.exec(markup)?.[1];
    expect(id).toBeDefined();
    expect(markup).toContain(`aria-labelledby="${id}"`);
    expect(markup).not.toContain("aria-label=");
  });

  it("keeps a label's words as written, brackets and all", () => {
    expect(rendered('<svg aria-label="CPU (core 1) \\ cache"><rect/></svg>')).toContain('aria-label="CPU (core 1) \\ cache"');
  });

  it("keeps a name the markup gave it", () => {
    expect(rendered('<svg aria-label="Ack flow"><title>x</title></svg>')).toContain('aria-label="Ack flow"');
  });

  it("is a plain word when there is no title", () => {
    expect(rendered("<svg><rect/></svg>")).toContain('aria-label="Picture"');
  });

  it("says a picture is being drawn while only the opening is in", () => {
    const markup = rendered('<svg viewBox="0 0 1 1"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Drawing a picture…");
  });
});
