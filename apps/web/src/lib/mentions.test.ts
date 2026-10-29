import { describe, expect, it } from "vitest";

import {
  addMention,
  caretOffset,
  caretPoint,
  carryMentions,
  fallbackTagLine,
  filterMentionOptions,
  firstActive,
  hasMention,
  inlinePieces,
  isBareTag,
  isEmptyValue,
  isUsable,
  mapOffset,
  MENTION_NODE_TYPE,
  mentionQuery,
  menuOpenedAnnouncement,
  plusMenuStays,
  prependValue,
  removeMention,
  rowAnnouncement,
  sameValue,
  serializeMentions,
  toggleMentionEdit,
  trimValue,
  validMentions,
  valueOf,
  valuePieces,
  type CaretLine,
  type MentionOption,
  type MentionValue,
  type SerializedNodeLike,
} from "./mentions";
import { moveActive } from "@/components/ui/roving";

const addMentionValue = <K extends string>(value: MentionValue<K>, kind: K) => addMention(value, kind).value;
const removeMentionValue = <K extends string>(value: MentionValue<K>, kind: K) => removeMention(value, kind).value;
const toggleMentionValue = <K extends string>(value: MentionValue<K>, kind: K) => toggleMentionEdit(value, kind).value;

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

describe("a kind's toggle (D88)", () => {
  const empty = { text: "", mentions: [] };

  it("puts the chip at the start of an empty field, with a space to type after", () => {
    const tagged = addMentionValue(empty, "diagram");
    expect(tagged).toEqual({ text: "@diagram ", mentions: [{ kind: "diagram", start: 0, end: 8 }] });
    expect(hasMention(tagged, "diagram")).toBe(true);
    expect(hasMention(tagged, "video")).toBe(false);
  });

  it("puts the chip in front of words already typed, and moves every other chip with them", () => {
    const typed = valueOf([{ type: "text", text: "how raft keeps a " }, { type: "mention", kind: "video" }]);
    const tagged = addMentionValue(typed, "diagram");
    expect(tagged.text).toBe("@diagram how raft keeps a @video");
    expect(validMentions(tagged.text, tagged.mentions)).toEqual([
      { kind: "diagram", start: 0, end: 8 },
      { kind: "video", start: 26, end: 32 },
    ]);
  });

  it("adds a space of its own even before text that starts with one, so it can take back only that", () => {
    expect(addMentionValue({ text: " tcp", mentions: [] }, "video").text).toBe("@video  tcp");
    expect(removeMentionValue(addMentionValue({ text: " tcp", mentions: [] }, "video"), "video")).toEqual({ text: " tcp", mentions: [] });
  });

  it("is an exact round trip, leading spaces and repeated toggles included (Greptile on #306)", () => {
    const starts: MentionValue<"diagram" | "video">[] = [
      { text: "", mentions: [] },
      { text: " ", mentions: [] },
      { text: "   tcp", mentions: [] },
      { text: "\n tcp", mentions: [] },
      { text: " a @video of tcp", mentions: [{ kind: "video", start: 3, end: 9 }] },
    ];
    for (const start of starts) {
      let value = start;
      for (let round = 0; round < 3; round += 1) {
        value = toggleMentionValue(toggleMentionValue(value, "diagram"), "diagram");
        expect(value).toEqual(start);
      }
      // Both on, then both off in either order.
      const both = toggleMentionValue(toggleMentionValue(start, "diagram"), "video");
      if (!start.mentions.length) {
        expect(toggleMentionValue(toggleMentionValue(both, "diagram"), "video")).toEqual(start);
        expect(toggleMentionValue(toggleMentionValue(both, "video"), "diagram")).toEqual(start);
      }
    }
  });

  it("reports the edit it made, and none when nothing changed", () => {
    expect(toggleMentionEdit({ text: "tcp", mentions: [] }, "video").edit).toEqual({ at: 0, removed: 0, inserted: 7 });
    const tagged = valueOf([{ type: "text", text: "a " }, { type: "mention", kind: "video" }, { type: "text", text: " b" }]);
    expect(toggleMentionEdit(tagged, "video").edit).toEqual({ at: 2, removed: 7, inserted: 0 });
    expect(addMention(tagged, "video")).toEqual({ value: tagged, edit: null });
    expect(removeMention({ text: "tcp", mentions: [] }, "video")).toEqual({ value: { text: "tcp", mentions: [] }, edit: null });
  });

  it("never tags a kind twice", () => {
    const typed = valueOf([{ type: "text", text: "a " }, { type: "mention", kind: "diagram" }]);
    expect(addMentionValue(typed, "diagram")).toBe(typed);
  });

  it("takes the chip out with its space, giving back the words as they were", () => {
    const words = { text: "how raft keeps a log in step", mentions: [] };
    expect(removeMentionValue(addMentionValue(words, "video"), "video")).toEqual(words);
    expect(toggleMentionValue(toggleMentionValue(empty, "diagram"), "diagram")).toEqual(empty);
  });

  it("takes out a chip typed mid-sentence, and moves the chips after it back", () => {
    const typed = valueOf([
      { type: "text", text: "make a " },
      { type: "mention", kind: "video" },
      { type: "text", text: " of tcp and a " },
      { type: "mention", kind: "diagram" },
    ]);
    const out = removeMentionValue(typed, "video");
    expect(out.text).toBe("make a of tcp and a @diagram");
    expect(validMentions(out.text, out.mentions)).toEqual([{ kind: "diagram", start: 20, end: 28 }]);
  });

  it("takes the space before a chip that ends the text", () => {
    const typed = valueOf([{ type: "text", text: "tcp " }, { type: "mention", kind: "video" }]);
    expect(removeMentionValue(typed, "video")).toEqual({ text: "tcp", mentions: [] });
  });

  it("leaves a value that does not tag the kind, and ignores a range that does not read @<kind>", () => {
    const typed = { text: "@video typed as words", mentions: [] };
    expect(removeMentionValue(typed, "video")).toBe(typed);
    expect(hasMention(typed, "video")).toBe(false);
    const stale = { text: "words", mentions: [{ kind: "video", start: 0, end: 5 }] };
    expect(hasMention(stale, "video")).toBe(false);
    expect(addMentionValue(stale, "video")).toEqual({ text: "@video words", mentions: [{ kind: "video", start: 0, end: 6 }] });
  });
});

describe("keeping the caret through a toggle (Greptile on #306)", () => {
  it("moves a caret after the edit with it, and keeps one before it", () => {
    const insert = { at: 0, removed: 0, inserted: 9 };
    expect(mapOffset(0, insert)).toBe(9);
    expect(mapOffset(4, insert)).toBe(13);
    const remove = { at: 2, removed: 7, inserted: 0 };
    expect(mapOffset(1, remove)).toBe(1);
    expect(mapOffset(2, remove)).toBe(2);
    expect(mapOffset(5, remove)).toBe(2);
    expect(mapOffset(12, remove)).toBe(5);
  });

  // "make a @video\nof tcp": a text, a chip, a text, then a second line.
  const lines: CaretLine[] = [
    {
      key: "p1",
      children: [
        { key: "t1", type: "text", length: 7 },
        { key: "c1", type: "chip", length: 6 },
      ],
    },
    { key: "p2", children: [{ key: "t2", type: "text", length: 6 }] },
  ];

  it("turns a point into an offset in the value's text", () => {
    expect(caretOffset(lines, { key: "t1", offset: 3, type: "text" }, "root")).toBe(3);
    expect(caretOffset(lines, { key: "p1", offset: 1, type: "element" }, "root")).toBe(7);
    expect(caretOffset(lines, { key: "p1", offset: 2, type: "element" }, "root")).toBe(13);
    expect(caretOffset(lines, { key: "t2", offset: 2, type: "text" }, "root")).toBe(16);
    expect(caretOffset(lines, { key: "root", offset: 1, type: "element" }, "root")).toBe(14);
    expect(caretOffset(lines, { key: "gone", offset: 0, type: "text" }, "root")).toBeNull();
  });

  it("turns an offset back into a point, never inside a chip", () => {
    expect(caretPoint(lines, 3)).toEqual({ key: "t1", offset: 3, type: "text" });
    expect(caretPoint(lines, 7)).toEqual({ key: "t1", offset: 7, type: "text" });
    expect(caretPoint(lines, 10)).toEqual({ key: "p1", offset: 2, type: "element" });
    expect(caretPoint(lines, 13)).toEqual({ key: "p1", offset: 2, type: "element" });
    expect(caretPoint(lines, 14)).toEqual({ key: "t2", offset: 0, type: "text" });
    expect(caretPoint(lines, 99)).toEqual({ key: "p2", offset: 1, type: "element" });
    expect(caretPoint([], 0)).toBeNull();
    expect(caretPoint([{ key: "p", children: [{ key: "c", type: "chip", length: 8 }] }], 0)).toEqual({ key: "p", offset: 0, type: "element" });
  });

  it("round-trips every offset of the text through a point", () => {
    for (let offset = 0; offset <= 20; offset += 1) {
      const point = caretPoint(lines, offset)!;
      const back = caretOffset(lines, point, "root")!;
      // Inside the chip (8 to 12) comes back as after it.
      expect(back).toBe(offset > 7 && offset < 13 ? 13 : Math.min(offset, 20));
    }
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
    expect(moveActive(options, 0, 1, isUsable)).toBe(0);
    expect(moveActive(OPTIONS, 1, 1, isUsable)).toBe(0);
    expect(moveActive(OPTIONS, 0, -1, isUsable)).toBe(1);
    expect(firstActive([{ ...OPTIONS[1]!, disabledReason: "no" }])).toBe(-1);
  });

  it("moves past a disabled row only when told it is unusable", () => {
    const options = [OPTIONS[0]!, { ...OPTIONS[1]!, disabledReason: "no" }];
    expect(moveActive(options, 0, 1)).toBe(1);
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

describe("carryMentions (the plain fallback)", () => {
  const tagged = { text: "@video the loop", mentions: [{ kind: "video" as const, start: 0, end: 6 }] };

  it("keeps a tag through an edit before or after it", () => {
    expect(carryMentions(tagged, "Make a @video the loop")).toEqual([{ kind: "video", start: 7, end: 13 }]);
    expect(carryMentions(tagged, "@video the whole loop")).toEqual([{ kind: "video", start: 0, end: 6 }]);
    expect(carryMentions(tagged, tagged.text)).toEqual(tagged.mentions);
  });

  it("drops a tag the edit touched, and never makes one from typed text", () => {
    expect(carryMentions(tagged, "@vide the loop")).toEqual([]);
    expect(carryMentions({ text: "the loop", mentions: [] }, "@video the loop")).toEqual([]);
  });

  it("does not attach a deleted tag to an @video typed elsewhere (Greptile on #204)", () => {
    // The tag deleted in one edit, then @video typed at the end in the next.
    const deleted = carryMentions(tagged, " the loop");
    expect(deleted).toEqual([]);
    expect(carryMentions({ text: " the loop", mentions: deleted }, " the loop @video")).toEqual([]);
    // Or both in one edit that replaces the tag's span along with more text.
    expect(carryMentions(tagged, "the loop @video")).toEqual([]);
  });

  it("keeps two tags, and a typed @video beside a tag stays a word", () => {
    const both = { text: "@diagram and @video", mentions: [{ kind: "diagram" as const, start: 0, end: 8 }, { kind: "video" as const, start: 13, end: 19 }] };
    expect(carryMentions(both, "@diagram and also @video")).toEqual([
      { kind: "diagram", start: 0, end: 8 },
      { kind: "video", start: 18, end: 24 },
    ]);
    expect(carryMentions(tagged, "@video the loop, not @video")).toEqual([{ kind: "video", start: 0, end: 6 }]);
  });
});

describe("fallbackTagLine", () => {
  const options = [
    { id: "diagram" as const, name: "Diagram", description: "" },
    { id: "video" as const, name: "Video", description: "" },
  ];
  it("names the tags the fallback will send, and nothing for a typed @video", () => {
    expect(fallbackTagLine({ text: "@video the loop", mentions: [{ kind: "video", start: 0, end: 6 }] }, options)).toBe(
      "Sends tagged: Video. Tags could not load; reload the page to add one.",
    );
    expect(fallbackTagLine({ text: "@video the loop", mentions: [] }, options)).toBe("Tags could not load; reload the page to add one.");
    // A panel where a reload would lose the typing says its own closing sentence.
    expect(fallbackTagLine({ text: "hello", mentions: [] }, options, "None can be added here.")).toBe("None can be added here.");
    expect(
      fallbackTagLine({ text: "@video the loop", mentions: [{ kind: "video", start: 0, end: 6 }] }, options, "None can be added here."),
    ).toBe("Sends tagged: Video. None can be added here.");
  });
});
