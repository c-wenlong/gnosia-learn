import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AssetRef } from "@gnosia/catalog/state";

import type { AssetBodyData } from "./asset-body-data";
import { AssetBody } from "./AssetBody";

/**
 * `AssetBody` drawn from data the server already read: which shape each kind
 * gets. The reads themselves are `loadAssetBody`'s, tested in
 * asset-body-data.test.ts.
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

  it("shows a note's picture, and makes a session log's a link", () => {
    const source = "Before.\n\n![a picture](/a.png)\n";
    const note = draw(data({ id: "note:a", kind: "note", path: "learn/concepts/a.md" }, { text: source }));
    expect(note).toMatch(/<img [^>]*src="\/a.png"/);

    const log = draw(data({ id: "session:a", kind: "session_log", path: "learn/sessions/a.md" }, { text: source }));
    expect(log).not.toContain("<img");
    expect(log).toMatch(/<a [^>]*href="\/a.png"/);
  });

  it("makes a note's off-site picture a link too, since the CSP would block it", () => {
    const source = "Before.\n\n![a picture](https://example.com/a.png)\n";
    const note = draw(data({ id: "note:a", kind: "note", path: "learn/concepts/a.md" }, { text: source }));
    expect(note).not.toContain("<img");
    expect(note).toMatch(/<a [^>]*href="https:\/\/example.com\/a.png"/);
  });

  it("draws a note's embed the server knows is missing as the failure, without a request for it", () => {
    const html = draw(
      data(
        { id: "note:a", kind: "note", path: "learn/concepts/a.md" },
        { text: "![[gone.svg]]\n", embedProblems: new Map([["diagram:learn/assets/gone.svg", "not-uploaded" as const]]) },
      ),
    );
    expect(html).toContain('data-problem="not-uploaded"');
    expect(html).not.toContain("<img");
  });

  it("lists a transcript and a chapter list by their timecodes", () => {
    const transcript = draw(
      data(
        { id: "t", kind: "transcript", path: "out/a.transcript.json" },
        { text: JSON.stringify({ segments: [{ start: 65, text: "The second minute." }] }) },
      ),
    );
    expect(transcript).toContain("1:05");
    expect(transcript).toContain("The second minute.");

    const chapters = draw(
      data({ id: "c", kind: "chapters", path: "out/a.chapters.json" }, { text: JSON.stringify([{ start: 0, title: "Opening" }]) }),
    );
    expect(chapters).toContain("Opening");
    expect(chapters).toContain("<ol");
  });

  it("opens a PDF in the browser's own viewer", () => {
    const html = draw(data({ id: "pdf:a", kind: "pdf", path: "out/a.pdf" }));
    expect(html).toContain(`<object data="/api/assets/pdf%3Aa/file" type="application/pdf"`);
  });

  it("says a servable file whose words did not come back could not be read, and keeps the raw link", () => {
    const html = draw(data({ id: "note:a", kind: "note", path: "learn/concepts/a.md" }, { text: null }));
    expect(html).toContain("This file could not be read.");
    expect(html).toContain(`href="/api/assets/note%3Aa/file"`);
  });
});
