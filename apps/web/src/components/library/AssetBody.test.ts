import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AssetRef } from "@gnosia/catalog/state";

import type { AssetBodyData } from "./asset-body-data";
import { AssetBody } from "./AssetBody";

/**
 * `AssetBody` drawn from data the server already read: which shape each kind
 * gets. The reads themselves are `loadAssetBody`'s, tested through the routes.
 */

function data(asset: Partial<AssetRef> & Pick<AssetRef, "id" | "kind">, over: Partial<AssetBodyData> = {}): AssetBodyData {
  const row: AssetRef = { path: null, url: null, bytes: 10, title: null, sourceRepo: "gnosia", ...asset };
  return {
    asset: row,
    fileHref: `/api/assets/${encodeURIComponent(row.id)}/file`,
    statusHref: `/api/assets/${encodeURIComponent(row.id)}/status`,
    failureSource: "gnosia",
    downloadHref: `/api/assets/${encodeURIComponent(row.id)}/file?download=1`,
    fileProblem: null,
    servable: true,
    sidecars: null,
    poster: undefined,
    pdfHref: undefined,
    text: null,
    embedProblems: new Map(),
    ...over,
  };
}

const draw = (body: AssetBodyData) =>
  renderToStaticMarkup(createElement(AssetBody, { data: body, title: "Demo", notes: {}, variant: "page" }));

describe("AssetBody", () => {
  it("draws a poster as the picture it is, never as its bytes in text", () => {
    const html = draw(data({ id: "poster:manimkc:out/demo.mp4", kind: "poster", path: "out/demo.jpg" }));
    expect(html).toContain("<img");
    expect(html).toContain(`src="/api/assets/${encodeURIComponent("poster:manimkc:out/demo.mp4")}/file"`);
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("could not be read");
  });

  it("says a poster that cannot be served is a picture", () => {
    const html = draw(
      data({ id: "poster:manimkc:out/demo.mp4", kind: "poster", path: "out/demo.jpg" }, { servable: false, fileProblem: "not-uploaded" }),
    );
    expect(html).toContain("This picture cannot be shown here.");
    expect(html).not.toContain("<img");
  });

  it("links a web URL, and opens it in a new tab", () => {
    const html = draw(data({ id: "link:a", kind: "link", url: "https://example.com/reading" }));
    expect(html).toContain(`href="https://example.com/reading"`);
    expect(html).toContain("Open example.com");
  });

  it("does not make a link of a URL whose scheme the notes would refuse", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,<b>x</b>", "vbscript:msgbox(1)"]) {
      const html = draw(data({ id: "link:a", kind: "link", url }));
      expect(html, url).not.toMatch(/<a [^>]*href=/);
      expect(html, url).toContain("not a web address");
    }
  });
});
