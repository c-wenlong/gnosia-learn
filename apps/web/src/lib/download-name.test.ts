import { describe, expect, it } from "vitest";

import { contentDisposition, downloadName, titleStem } from "./download-name";

describe("contentDisposition", () => {
  it("serves inline under the stored file's name, as the route always did", () => {
    expect(contentDisposition("inline", "demo.mp4")).toBe('inline; filename="demo.mp4"');
    // The title plays no part inline.
    expect(contentDisposition("inline", "demo.mp4", "Master theorem")).toBe('inline; filename="demo.mp4"');
  });

  it("saves an attachment under the title, with the file's extension", () => {
    expect(contentDisposition("attachment", "cs3230_w3.mp4", "Master theorem, cases 1 to 3")).toBe(
      'attachment; filename="Master theorem_ cases 1 to 3.mp4"; filename*=UTF-8\'\'Master%20theorem%2C%20cases%201%20to%203.mp4',
    );
    expect(contentDisposition("attachment", "tlb.md", "The TLB")).toBe('attachment; filename="The TLB.md"');
  });

  it("keeps the file's own name when there is no title", () => {
    expect(contentDisposition("attachment", "demo.mp4", null)).toBe('attachment; filename="demo.mp4"');
    expect(contentDisposition("attachment", "demo.mp4", "  /// ")).toBe('attachment; filename="demo.mp4"');
  });

  it("encodes a title outside ASCII for current browsers and keeps a safe fallback", () => {
    expect(contentDisposition("attachment", "a.svg", "Théorème: cas 1")).toBe(
      "attachment; filename=\"Th_or_me cas 1.svg\"; filename*=UTF-8''Th%C3%A9or%C3%A8me%20cas%201.svg",
    );
  });

  it("cannot end the quoted string or start a header line, whatever the title", () => {
    const header = contentDisposition("attachment", "x.md", 'evil"\r\nSet-Cookie: a=b');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.split('"').length - 1).toBe(2);
  });
});

describe("downloadName and titleStem", () => {
  it("drops separators, controls and refused characters, and trims dots and space", () => {
    expect(titleStem(" ..a/b\\\\c<d>e|f?g*h\u0007 . ")).toBe("a b c d e f g h");
  });

  it("does not add the extension twice", () => {
    expect(downloadName("notes.md", "notes.MD")).toBe("notes.MD");
    expect(downloadName("README", "Read me")).toBe("Read me");
  });

  it("drops a bracketed format that is the extension, rather than saying it twice", () => {
    expect(downloadName("big_o.vtt", "Big-O and big-Omega, from one running time (vtt)")).toBe(
      "Big-O and big-Omega, from one running time.vtt",
    );
    expect(downloadName("x.VTT", "Captions (VTT)")).toBe("Captions.VTT");
    // Any other bracket stays: it is part of the name, not the format.
    expect(downloadName("big_o.json", "Big-O (chapters)")).toBe("Big-O (chapters).json");
    expect(downloadName("loop.mp4", "Loop engineering (narrated)")).toBe("Loop engineering (narrated).mp4");
    // A title that is only the bracket keeps it, and no extension means nothing to drop.
    expect(downloadName("a.vtt", "(vtt)")).toBe("(vtt).vtt");
    expect(downloadName("README", "Read me (vtt)")).toBe("Read me (vtt)");
    expect(contentDisposition("attachment", "a.vtt", "Paging (vtt)")).toBe('attachment; filename="Paging.vtt"');
  });

  it("caps a long title", () => {
    expect(downloadName("a.mp4", "x".repeat(400))).toBe(`${"x".repeat(120)}.mp4`);
  });

  it("caps by characters, so an emoji at the cut is kept whole or dropped, never split", () => {
    // 119 letters then an emoji: the 120th character is the emoji's two halves.
    const title = `${"x".repeat(119)}\u{1F600}${"y".repeat(10)}`;
    expect(titleStem(title)).toBe(`${"x".repeat(119)}\u{1F600}`);
    expect(titleStem(title).isWellFormed()).toBe(true);
    expect(() => contentDisposition("attachment", "a.mp4", title)).not.toThrow();
  });

  it("names a download whose title holds a lone surrogate, rather than throwing", () => {
    // A learner's own name for an asset can carry one: JSON.parse accepts "\ud83c".
    const header = contentDisposition("attachment", "a.mp4", "Lone \ud83c half");
    expect(header).toBe(`attachment; filename="Lone _ half.mp4"; filename*=UTF-8''Lone%20%EF%BF%BD%20half.mp4`);
  });
});
