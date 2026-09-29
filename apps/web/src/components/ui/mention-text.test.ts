import { describe, expect, it } from "vitest";

import {
  filterMentionOptions,
  firstActive,
  inlinePieces,
  isBareTag,
  isEmptyValue,
  MENTION_NODE_TYPE,
  mentionQuery,
  menuOpenedAnnouncement,
  moveActive,
  plusMenuStays,
  prependValue,
  rowAnnouncement,
  sameValue,
  serializeMentions,
  trimValue,
  validMentions,
  valueOf,
  valuePieces,
  type MentionOption,
  type SerializedNodeLike,
} from "./mention-text";

const text = (value: string): SerializedNodeLike => ({ type: "text", text: value });
const chip = (kind: string): SerializedNodeLike => ({ type: MENTION_NODE_TYPE, kind });
const paragraph = (...children: SerializedNodeLike[]): SerializedNodeLike => ({ type: "paragraph", children });
const root = (...children: SerializedNodeLike[]): SerializedNodeLike => ({ type: "root", children });

const OPTIONS: MentionOption[] = [
  { id: "diagram", name: "Diagram", description: "Shapes and arrows that show how it fits together", aliases: ["draw", "drawing"] },
  { id: "video", name: "Video", description: "A narrated animation, one to ten minutes", aliases: ["animation", "explainer"] },
];

describe("serializeMentions", () => {
  it("writes each chip into the text as @<kind>, with its position (the doc's example)", () => {
    const value = serializeMentions(
      root(paragraph(text("make a "), chip("video"), text(" of how TCP opens a connection, and a "), chip("diagram"), text(" too"))),
    );
    expect(value).toEqual({
      text: "make a @video of how TCP opens a connection, and a @diagram too",
      mentions: [
        { kind: "video", start: 7, end: 13 },
        { kind: "diagram", start: 51, end: 59 },
      ],
    });
    for (const mention of value.mentions) expect(value.text.slice(mention.start, mention.end)).toBe(`@${mention.kind}`);
  });

  it("joins paragraphs and line breaks with a newline, as the textarea did", () => {
    const value = serializeMentions(root(paragraph(text("one"), { type: "linebreak" }, text("two")), paragraph(chip("video"))));
    expect(value).toEqual({ text: "one\ntwo\n@video", mentions: [{ kind: "video", start: 8, end: 14 }] });
  });

  it("counts positions in UTF-16 code units, the unit slice counts in", () => {
    const value = serializeMentions(root(paragraph(text("日本 🙂 "), chip("diagram"))));
    expect(value.text.slice(value.mentions[0]!.start, value.mentions[0]!.end)).toBe("@diagram");
  });

  it("reads an empty field as empty", () => {
    expect(serializeMentions(root(paragraph()))).toEqual({ text: "", mentions: [] });
    expect(isEmptyValue(serializeMentions(root()))).toBe(true);
  });
});

describe("validMentions", () => {
  const body = "a @video and @diagram";
  it("keeps ranges that read @<kind>, in text order", () => {
    expect(
      validMentions(body, [
        { kind: "diagram", start: 13, end: 21 },
        { kind: "video", start: 2, end: 8 },
      ]),
    ).toEqual([
      { kind: "video", start: 2, end: 8 },
      { kind: "diagram", start: 13, end: 21 },
    ]);
  });

  it("drops a range out of bounds, one that does not read its kind, an overlap and a repeated kind", () => {
    expect(validMentions(body, [{ kind: "video", start: 2, end: 99 }])).toEqual([]);
    expect(validMentions(body, [{ kind: "video", start: 3, end: 9 }])).toEqual([]);
    expect(
      validMentions("@video@video", [
        { kind: "video", start: 0, end: 6 },
        { kind: "video", start: 6, end: 12 },
      ]),
    ).toHaveLength(1);
    expect(validMentions(body, null)).toEqual([]);
  });
});

describe("pieces", () => {
  it("draws a sent message's chips back where they were", () => {
    const value = valueOf([{ type: "text", text: "make a " }, { type: "mention", kind: "video" }, { type: "text", text: " now" }]);
    expect(inlinePieces(value)).toEqual([
      { type: "text", text: "make a " },
      { type: "mention", kind: "video" },
      { type: "text", text: " now" },
    ]);
  });

  it("shows a mention it cannot vouch for as the words it covers", () => {
    expect(inlinePieces({ text: "a @vid", mentions: [{ kind: "video", start: 2, end: 6 }] })).toEqual([{ type: "text", text: "a @vid" }]);
  });

  it("splits lines for rebuilding the field, keeping chips on their line", () => {
    const value = valueOf([{ type: "text", text: "one\n" }, { type: "mention", kind: "diagram" }, { type: "text", text: " two" }]);
    expect(valuePieces(value)).toEqual([[{ type: "text", text: "one" }], [{ type: "mention", kind: "diagram" }, { type: "text", text: " two" }]]);
  });

  it("round-trips a value through pieces and back", () => {
    const value = valueOf([{ type: "text", text: "a " }, { type: "mention", kind: "diagram" }, { type: "text", text: "\nb" }]);
    const rebuilt = serializeMentions(
      root(
        ...valuePieces(value).map((line) =>
          paragraph(...line.map((piece) => (piece.type === "text" ? text(piece.text) : chip(piece.kind)))),
        ),
      ),
    );
    expect(sameValue(rebuilt, value)).toBe(true);
  });
});

describe("the value's shape", () => {
  it("knows a bare tag from a tag with words (T15, T16)", () => {
    expect(isBareTag(valueOf([{ type: "mention", kind: "video" }, { type: "text", text: "  " }]))).toBe(true);
    expect(isBareTag(valueOf([{ type: "mention", kind: "video" }, { type: "text", text: " attention" }]))).toBe(false);
    expect(isBareTag({ text: "words", mentions: [] })).toBe(false);
  });

  it("trims for sending and moves every position with the text", () => {
    const trimmed = trimValue(valueOf([{ type: "text", text: "  \n make a " }, { type: "mention", kind: "video" }, { type: "text", text: "  " }]));
    expect(trimmed).toEqual({ text: "make a @video", mentions: [{ kind: "video", start: 7, end: 13 }] });
  });

  it("puts refused words back in front of what was typed since, and never tags a kind twice (T17)", () => {
    const refused = valueOf([{ type: "mention", kind: "video" }, { type: "text", text: " tcp" }]);
    const typed = valueOf([{ type: "text", text: "and " }, { type: "mention", kind: "video" }]);
    const back = prependValue(refused, typed);
    expect(back.text).toBe("@video tcp\nand @video");
    expect(validMentions(back.text, back.mentions)).toEqual([{ kind: "video", start: 15, end: 21 }]);
    expect(prependValue(refused, { text: "", mentions: [] })).toBe(refused);
  });
});

describe("the @ trigger (T1, T3)", () => {
  it("opens at the start, after a space and after a newline", () => {
    expect(mentionQuery("@")).toEqual({ query: "", offset: 0 });
    expect(mentionQuery("make a @vi")).toEqual({ query: "vi", offset: 7 });
    expect(mentionQuery("line\n@d")).toEqual({ query: "d", offset: 5 });
  });

  it("is text inside a word, after a space typed past it, and as a full-width ＠", () => {
    expect(mentionQuery("mail a@b.com")).toBeNull();
    expect(mentionQuery("a @video ")).toBeNull();
    expect(mentionQuery("＠video")).toBeNull();
  });
});

describe("the menu", () => {
  it("filters by a case-insensitive prefix of the name, the id or an alias", () => {
    expect(filterMentionOptions(OPTIONS, "").map((option) => option.id)).toEqual(["diagram", "video"]);
    expect(filterMentionOptions(OPTIONS, "VI").map((option) => option.id)).toEqual(["video"]);
    expect(filterMentionOptions(OPTIONS, "draw").map((option) => option.id)).toEqual(["diagram"]);
    expect(filterMentionOptions(OPTIONS, "expl").map((option) => option.id)).toEqual(["video"]);
    expect(filterMentionOptions(OPTIONS, "zzz")).toEqual([]);
  });

  it("moves the active row with wrapping, skipping a disabled one", () => {
    const options = [OPTIONS[0]!, { ...OPTIONS[1]!, disabledReason: "Videos are unavailable: kokoro is missing" }];
    expect(firstActive(options)).toBe(0);
    expect(moveActive(options, 0, 1)).toBe(0);
    expect(moveActive(OPTIONS, 1, 1)).toBe(0);
    expect(moveActive(OPTIONS, 0, -1)).toBe(1);
    expect(firstActive([{ ...OPTIONS[1]!, disabledReason: "no" }])).toBe(-1);
  });

  it("says what a screen reader would otherwise miss", () => {
    expect(menuOpenedAnnouncement(OPTIONS, 0)).toBe("2 options. Diagram, shapes and arrows that show how it fits together.");
    expect(rowAnnouncement({ ...OPTIONS[1]!, disabledReason: "Start a new conversation to make a video" })).toBe(
      "Video, start a new conversation to make a video.",
    );
    expect(menuOpenedAnnouncement([], -1)).toBe("Nothing matches.");
  });
});

describe("the plus menu", () => {
  const opened = { key: "3", offset: 5, text: "hello" };
  it("stays while the caret sits where it opened and nothing was typed", () => {
    expect(plusMenuStays(opened, { key: "3", offset: 5, collapsed: true }, "hello")).toBe(true);
  });
  it("closes on typing, on a caret move, on a range selection and on no selection", () => {
    expect(plusMenuStays(opened, { key: "3", offset: 6, collapsed: true }, "hello!")).toBe(false);
    expect(plusMenuStays(opened, { key: "3", offset: 4, collapsed: true }, "hello")).toBe(false);
    expect(plusMenuStays(opened, { key: "3", offset: 5, collapsed: false }, "hello")).toBe(false);
    expect(plusMenuStays(opened, null, "hello")).toBe(false);
  });
});
