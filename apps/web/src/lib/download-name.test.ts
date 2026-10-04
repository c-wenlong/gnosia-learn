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

  it("caps a long title", () => {
    expect(downloadName("a.mp4", "x".repeat(400))).toBe(`${"x".repeat(120)}.mp4`);
  });
});
