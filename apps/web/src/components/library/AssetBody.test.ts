import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AssetRef } from "@hermes/catalog/state";

import type { AssetBodyData } from "./asset-body-data";
import { AssetBody, type AssetBodyVideo } from "./AssetBody";

/**
 * The player stands in for `LibraryVideo`: what this file checks is what the
 * body hands it (its source, its sidecars, the asides under it), not the
 * player, which is a client component with tests of its own.
 */
vi.mock("@/components/library/LibraryVideo", async () => {
  const { createElement: h } = await import("react");
  return {
    LibraryVideo: (props: { src: string; chapters?: unknown[]; transcript?: unknown[]; notes?: unknown }) =>
      h(
        "div",
        {
          "data-player": props.src,
          "data-chapters": props.chapters === undefined ? "none" : props.chapters.length,
          "data-cues": props.transcript === undefined ? "none" : props.transcript.length,
        },
        props.notes as never,
      ),
  };
});

/**
 * `AssetBody` drawn from data the server already read: which shape each kind
 * gets. The reads themselves are `loadAssetBody`'s, tested in
 * asset-body-data.test.ts.
 */

function data(asset: Partial<AssetRef> & Pick<AssetRef, "id" | "kind">, over: Partial<AssetBodyData> = {}): AssetBodyData {
  const row: AssetRef = { path: null, url: null, bytes: 10, title: null, sourceRepo: "hermes", ...asset };
  return {
    asset: row,
    fileHref: `/api/assets/${encodeURIComponent(row.id)}/file`,
    statusHref: `/api/assets/${encodeURIComponent(row.id)}/status`,
    failureSource: "hermes",
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

const draw = (body: AssetBodyData, video?: AssetBodyVideo) =>
  renderToStaticMarkup(createElement(AssetBody, { data: body, title: "Demo", notes: {}, variant: "page", video }));

const player: AssetBodyVideo = { heading: null, playback: null, watchedDay: null, favorite: false };
const videoRow = { id: "video:manimkc:out/demo.mp4", kind: "video", path: "out/demo.mp4" } as const;

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

    const log = draw(data({ id: "session:a", kind: "session", path: "learn/sessions/a.md" }, { text: source }));
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

  it("says a video that cannot be served cannot be shown, and draws no player", () => {
    const html = draw(data(videoRow, { servable: false, fileProblem: "not-uploaded" }), player);
    expect(html).toContain("This video cannot be shown here.");
    expect(html).not.toContain("data-player");
  });

  it("draws nothing for a servable video it was given no player for", () => {
    expect(draw(data(videoRow))).toBe("");
  });

  it("hands a servable video its file and its read sidecars", () => {
    const html = draw(
      data(videoRow, {
        sidecars: {
          state: "read",
          chapters: [{ start: 0, end: 60, title: "Opening" }],
          cues: [
            { start: 0, end: 5, text: "One." },
            { start: 5, end: 10, text: "Two." },
          ],
          dropped: 0,
        },
      }),
      player,
    );
    expect(html).toContain(`data-player="/api/assets/${encodeURIComponent(videoRow.id)}/file"`);
    expect(html).toContain('data-chapters="1"');
    expect(html).toContain('data-cues="2"');
    expect(html).not.toContain("left out");
  });

  it("says under the video what became of its sidecars", () => {
    const none = draw(data(videoRow, { sidecars: { state: "none" } }), player);
    expect(none).toContain("No transcript or chapter sidecar is indexed");
    expect(none).toContain('data-chapters="none"');

    const unreadable = draw(data(videoRow, { sidecars: { state: "unreadable" } }), player);
    expect(unreadable).toContain("could not be read back as a transcript");
    expect(unreadable).toContain('data-cues="none"');

    const cue = { start: 0, end: 5, text: "One." };
    const one = draw(data(videoRow, { sidecars: { state: "read", chapters: [], cues: [cue], dropped: 1 } }), player);
    expect(one).toContain("1 entry in the transcript had no usable timecode or text and were left out.");
    const three = draw(data(videoRow, { sidecars: { state: "read", chapters: [], cues: [cue], dropped: 3 } }), player);
    expect(three).toContain("3 entries in the transcript");
  });

  it("draws a servable diagram on its mat, and one that is not as the failure", () => {
    const row = { id: "diagram:learn/assets/a.svg", kind: "diagram_svg", path: "learn/assets/a.svg" } as const;
    const shown = draw(data(row));
    expect(shown).toMatch(/<img [^>]*src="\/api\/assets\/diagram%3Alearn%2Fassets%2Fa\.svg\/file"/);

    const failed = draw(data(row, { servable: false, fileProblem: "not-uploaded" }));
    expect(failed).toContain("This diagram cannot be shown here.");
    expect(failed).not.toContain("<img");
  });

  it("falls back to the raw words for a transcript or chapter list that does not parse", () => {
    const transcript = draw(data({ id: "t", kind: "transcript", path: "out/a.transcript.json" }, { text: "not json {" }));
    expect(transcript).toContain("<pre");
    expect(transcript).toContain("not json {");
    expect(transcript).not.toContain("<ol");

    const chapters = draw(data({ id: "c", kind: "chapters", path: "out/a.chapters.json" }, { text: "[oops" }));
    expect(chapters).toContain("<pre");
    expect(chapters).toContain("[oops");
    expect(chapters).not.toContain("<ol");
  });

  it("says a link row with no URL has none, and links nothing", () => {
    const html = draw(data({ id: "link:a", kind: "link", url: null }));
    expect(html).toContain("This link has no URL");
    expect(html).not.toMatch(/<a [^>]*href=/);
  });

  it("says a row with neither words nor a path names no file", () => {
    const html = draw(data({ id: "note:a", kind: "note", path: null }, { text: null }));
    expect(html).toContain("This row names no file.");
    expect(html).not.toContain("This file could not be read.");
  });
});
