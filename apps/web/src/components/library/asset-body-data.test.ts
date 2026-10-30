import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetRef } from "@gnosia/catalog/state";

import { loadAssetBody } from "./asset-body-data";

/**
 * `loadAssetBody`: the reads behind every asset body, the asset page's and
 * the previewer's. The catalog is mocked at the four reads it makes (the
 * route's problem check, a row's text, the stored posters and PDFs), each
 * answering from a table the test sets, so which rows were read is a
 * recorded fact.
 */
const reads = vi.hoisted(() => ({
  problems: new Map<string, string>(),
  texts: new Map<string, string>(),
  posters: new Set<string>(),
  pdfs: new Set<string>(),
}));
const readFileProblems = vi.hoisted(() =>
  vi.fn(async (ids: readonly string[]) => new Map(ids.map((id) => [id, reads.problems.get(id) ?? null]))),
);
const readAssetText = vi.hoisted(() => vi.fn(async (_db: unknown, id: string) => reads.texts.get(id) ?? null));

vi.mock("@/lib/asset-library", () => ({
  readFileProblems,
  readAssetText,
  withCatalog: async <T>(fn: (db: unknown) => Promise<T>) => fn({}),
}));
vi.mock("@/lib/asset-files", () => ({
  storedPosters: async () => reads.posters,
  storedPdfs: async () => reads.pdfs,
}));

const row = (over: Partial<AssetRef> & Pick<AssetRef, "id" | "kind">): AssetRef => ({
  path: null,
  url: null,
  bytes: 10,
  title: null,
  sourceRepo: "manimkc",
  ...over,
});

const VIDEO = row({ id: "manimkc:out/demo.mp4", kind: "video", path: "out/demo.mp4" });
const TRANSCRIPT = row({ id: "manimkc:out/demo.transcript.json", kind: "transcript", path: "out/demo.transcript.json" });
const CHAPTERS = row({ id: "manimkc:out/demo.chapters.json", kind: "chapters", path: "out/demo.chapters.json" });

const href = (id: string, tail: string) => `/api/assets/${encodeURIComponent(id)}/${tail}`;

beforeEach(() => {
  reads.problems.clear();
  reads.texts.clear();
  reads.posters.clear();
  reads.pdfs.clear();
  readFileProblems.mockClear();
  readAssetText.mockClear();
});

describe("loadAssetBody for a video", () => {
  it("takes the chapters from their own sidecar when the transcript does not read", async () => {
    reads.texts.set(TRANSCRIPT.id, "{ half a file");
    reads.texts.set(CHAPTERS.id, JSON.stringify([{ start: 0, title: "Opening" }, { start: 12, title: "The idea" }]));
    reads.posters.add(VIDEO.id);

    const body = await loadAssetBody(VIDEO, [TRANSCRIPT, CHAPTERS]);

    expect(body.servable).toBe(true);
    expect(body.sidecars).toEqual({
      state: "read",
      chapters: [
        { scene: undefined, title: "Opening", start: 0, end: 0 },
        { scene: undefined, title: "The idea", start: 12, end: 12 },
      ],
      cues: [],
      dropped: 0,
    });
    expect(body.poster).toBe(href(VIDEO.id, "poster"));
    expect(body.pdfHref).toBeUndefined();
    // A video is drawn by its player, never read as text.
    expect(readAssetText.mock.calls.map(([, id]) => id)).toEqual([TRANSCRIPT.id, CHAPTERS.id]);
    expect(body.text).toBeNull();
  });

  it("reads the transcript alone when it parses, since it carries the chapters too", async () => {
    reads.texts.set(
      TRANSCRIPT.id,
      JSON.stringify({ chapters: [{ start: 0, title: "Opening" }], segments: [{ start: 1, end: 3, text: "Hello." }, { text: "no time" }] }),
    );
    reads.pdfs.add(VIDEO.id);

    const body = await loadAssetBody(VIDEO, [TRANSCRIPT, CHAPTERS]);

    expect(body.sidecars).toMatchObject({ state: "read", chapters: [{ title: "Opening" }], cues: [{ text: "Hello." }], dropped: 1 });
    expect(readAssetText.mock.calls.map(([, id]) => id)).toEqual([TRANSCRIPT.id]);
    expect(body.pdfHref).toBe(href(VIDEO.id, "pdf"));
    expect(body.poster).toBeUndefined();
  });

  it("says none when no sidecar row exists, and unreadable when neither row reads", async () => {
    expect((await loadAssetBody(VIDEO, [])).sidecars).toEqual({ state: "none" });
    expect((await loadAssetBody(VIDEO, [TRANSCRIPT, CHAPTERS])).sidecars).toEqual({ state: "unreadable" });
  });

  it("reads no sidecar, poster or PDF for a video the route cannot serve", async () => {
    reads.problems.set(VIDEO.id, "not-uploaded");
    const body = await loadAssetBody(VIDEO, [TRANSCRIPT, CHAPTERS]);
    expect(body).toMatchObject({ servable: false, fileProblem: "not-uploaded", sidecars: null, poster: undefined, pdfHref: undefined });
    expect(readAssetText).not.toHaveBeenCalled();
  });
});

describe("loadAssetBody for anything else", () => {
  it("reads a note's words and checks each picture it embeds", async () => {
    const note = row({ id: "note:linear-algebra/vectors", kind: "note", path: "learn/concepts/linear-algebra/vectors.md" });
    reads.texts.set(note.id, "# Vectors\n\n![[gone.svg]]\n\n![[here.svg]]\n");
    reads.problems.set("diagram:learn/assets/gone.svg", "not-uploaded");

    const body = await loadAssetBody(note, []);

    expect(body.text).toContain("# Vectors");
    expect(readFileProblems).toHaveBeenLastCalledWith(["diagram:learn/assets/gone.svg", "diagram:learn/assets/here.svg"]);
    expect([...body.embedProblems]).toEqual([
      ["diagram:learn/assets/gone.svg", "not-uploaded"],
      ["diagram:learn/assets/here.svg", null],
    ]);
  });

  it("never reads a PDF, a poster or a diagram as text", async () => {
    for (const kind of ["pdf", "poster", "diagram_svg"]) {
      const asset = row({ id: `${kind}:a`, kind, path: `out/a.${kind === "pdf" ? "pdf" : kind === "poster" ? "jpg" : "svg"}` });
      const body = await loadAssetBody(asset, []);
      expect(body.servable, kind).toBe(true);
      expect(body.text, kind).toBeNull();
    }
    expect(readAssetText).not.toHaveBeenCalled();
  });

  it("leaves the text null for a servable file that did not read, and checks no embeds", async () => {
    const log = row({ id: "session:2026-10-01-vectors", kind: "session_log", path: "learn/sessions/2026-10-01-vectors.md" });
    const body = await loadAssetBody(log, []);
    expect(body).toMatchObject({ servable: true, fileProblem: null, text: null });
    expect(readAssetText).toHaveBeenCalledWith({}, log.id);
    expect(readFileProblems).toHaveBeenCalledTimes(1);
    expect(body.embedProblems.size).toBe(0);
  });

  it("asks the route nothing about a link, which has no file", async () => {
    const link = row({ id: "link:a", kind: "link", url: "https://example.com/reading" });
    const body = await loadAssetBody(link, []);
    expect(body).toMatchObject({ servable: false, fileProblem: null, text: null, sidecars: null });
    expect(readFileProblems).not.toHaveBeenCalled();
    expect(readAssetText).not.toHaveBeenCalled();
  });

  it("names the studio as the way back for a studio video's poster", async () => {
    const poster = row({ id: "poster:video:demo", kind: "poster", path: "demo.jpg", sourceRepo: "studio-video" });
    expect((await loadAssetBody(poster, [])).failureSource).toBe("studio");
  });
});
