import { describe, expect, it } from "vitest";

import type { DraftSummary } from "@/lib/studio-drafts";

import {
  draftMatches,
  draftRows,
  historyGroups,
  listPath,
  matchParts,
  readHistory,
  searchRows,
  searchText,
  stateWords,
  type DraftRow,
} from "./studio-draft-list";

/** The drafts list above the studio grid (phase 3): which rows, called what. */

function draft(patch: Partial<DraftSummary>): DraftSummary {
  return {
    draftId: "d",
    kind: "diagram",
    state: "open",
    title: null,
    source: null,
    turns: 1,
    costUsd: null,
    updated: "2026-09-29T10:00:00.000Z",
    jobId: null,
    firstMessage: null,
    ...patch,
  };
}

describe("draftRows", () => {
  it("lists every conversation but a closed one, newest first", () => {
    const rows = draftRows([
      draft({ draftId: "old", updated: "2026-09-28T10:00:00.000Z", title: "Old" }),
      draft({ draftId: "new", updated: "2026-09-29T11:00:00.000Z", state: "briefed", title: "New" }),
      draft({ draftId: "done", updated: "2026-09-27T10:00:00.000Z", state: "done", title: "Done" }),
      draft({ draftId: "gone", state: "abandoned", title: "Gone" }),
      draft({ draftId: "drawing", updated: "2026-09-29T10:30:00.000Z", state: "drawing", title: "Drawing" }),
    ]);
    expect(rows.map((row) => row.draftId)).toEqual(["new", "drawing", "old", "done"]);
    expect(rows[0]).toMatchObject({ state: "Ready to draw", briefed: true });
    expect(rows[1]).toMatchObject({ state: "Drawing", briefed: false });
    expect(rows[2]).toMatchObject({ state: "In conversation", briefed: false });
    expect(rows[3]).toMatchObject({ state: "Done", briefed: false });
  });

  it("names a row by its title, else the first message, else what it extends", () => {
    const rows = draftRows(
      [
        draft({ draftId: "a", title: "Tailscale paths", firstMessage: "how does it" }),
        draft({ draftId: "b", firstMessage: "how does a packet find its peer" }),
        draft({ draftId: "c", source: "raft-log" }),
        draft({ draftId: "d", source: "unknown" }),
        draft({ draftId: "e" }),
      ],
      { "raft-log": "The Raft log" },
    );
    expect(rows.map((row) => [row.heading, row.quoted])).toEqual([
      ["Tailscale paths", false],
      ["how does a packet find its peer", true],
      ["Extending The Raft log", false],
      ["Extending unknown", false],
      ["A conversation with no brief yet", false],
    ]);
  });

  it("tolerates a runner that sends no first message", () => {
    const summary = draft({ draftId: "x" });
    delete summary.firstMessage;
    expect(draftRows([summary])[0]!.heading).toBe("A conversation with no brief yet");
  });
});

describe("a conversation opened from the concept tutor (docs/STUDIO-TUTOR-HANDOFF.md)", () => {
  it("is named by its concept until it has a brief, never by a bare tag", () => {
    const concept = { slug: "tcp-handshake", title: "The TCP three-way handshake" };
    const [waiting, briefed] = draftRows([
      draft({ draftId: "a", updated: "2026-09-29T11:00:00.000Z", firstMessage: "@diagram", concept }),
      draft({ draftId: "b", updated: "2026-09-29T10:00:00.000Z", firstMessage: "@diagram", concept, title: "SYN, SYN-ACK, ACK" }),
    ]);
    expect(waiting).toMatchObject({ heading: "The TCP three-way handshake", quoted: false });
    expect(briefed).toMatchObject({ heading: "SYN, SYN-ACK, ACK", quoted: false });
  });

  it("falls back as before for a runner that sends no concept", () => {
    expect(draftRows([draft({ firstMessage: "hello", concept: null })])[0]).toMatchObject({ heading: "hello", quoted: true });
  });
});

describe("listPath", () => {
  it("asks the runner for every unclosed draft somebody said something in, filtered before the limit", () => {
    expect(listPath()).toBe("/api/drafts?state=open,briefed,drawing,done&nonEmpty=1&limit=50");
  });
});

describe("stateWords", () => {
  it("says every state in plain words", () => {
    expect(["open", "briefed", "drawing", "done", "abandoned"].map((state) => stateWords(state as DraftSummary["state"]))).toEqual([
      "In conversation",
      "Ready to draw",
      "Drawing",
      "Done",
      "Closed",
    ]);
  });
});

describe("kinds (docs/STUDIO-MENTIONS.md)", () => {
  it("carries a draft's kinds for its glyphs, and says a briefed video is ready to make", () => {
    const base = {
      draftId: "d1",
      kind: "video" as const,
      state: "briefed" as const,
      title: "How attention weights are computed",
      source: null,
      turns: 2,
      costUsd: null,
      updated: "2026-09-29T00:00:00Z",
      jobId: null,
    };
    const [row] = draftRows([{ ...base, kinds: ["diagram", "video", "nope" as never, "video"] }]);
    expect(row!.kinds).toEqual(["diagram", "video"]);
    expect(row!.state).toBe("Ready to make");
    expect(draftRows([base])[0]!.kinds).toEqual([]);
    expect(stateWords("briefed", ["diagram"])).toBe("Ready to draw");
  });
});


describe("historyGroups", () => {
  const row = (draftId: string, updated: string): DraftRow => ({
    draftId,
    heading: draftId,
    quoted: false,
    state: "In conversation",
    briefed: false,
    updated,
    kinds: [],
  });
  // Local times, so the test holds in any time zone.
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
  const now = new Date(2026, 9, 4, 9);

  it("files rows under the day they were last touched, in order, leaving out empty groups", () => {
    const groups = historyGroups(
      [
        row("early-today", at(2026, 10, 4, 0)),
        row("yesterday-late", at(2026, 10, 3, 23)),
        row("week", at(2026, 9, 27)),
        row("month", at(2026, 9, 10)),
        row("old", at(2026, 8, 1)),
      ],
      now,
    );
    expect(groups.map((group) => [group.label, group.rows.map((entry) => entry.draftId)])).toEqual([
      ["Today", ["early-today"]],
      ["Yesterday", ["yesterday-late"]],
      ["Previous 7 days", ["week"]],
      ["Previous 30 days", ["month"]],
      ["Older", ["old"]],
    ]);
  });

  it("counts a row from a clock running ahead as today, and an unreadable time as older", () => {
    const groups = historyGroups([row("ahead", at(2026, 10, 5)), row("bad", "not a time")], now);
    expect(groups.map((group) => [group.label, group.rows.map((entry) => entry.draftId)])).toEqual([
      ["Today", ["ahead"]],
      ["Older", ["bad"]],
    ]);
  });
});

describe("readHistory", () => {
  // The runner's list, newest first, a page of `limit` after `before`.
  const runner = (ids: string[]) => {
    const rows = ids.map((draftId, at) => draft({ draftId, updated: new Date(Date.UTC(2026, 9, 4) - at * 60_000).toISOString() }));
    const asked: (string | undefined)[] = [];
    const page = async (before: { updated: string; draftId: string } | undefined) => {
      asked.push(before?.draftId);
      const from = before === undefined ? 0 : rows.findIndex((row) => row.draftId === before.draftId) + 1;
      return rows.slice(from, from + 2);
    };
    return { page, asked };
  };

  it("reads each page after the last row of the one before, and says whether there may be more", async () => {
    const { page, asked } = runner(["a", "b", "c", "d", "e"]);
    const two = await readHistory(2, page, 2);
    expect(two?.drafts.map((row) => row.draftId)).toEqual(["a", "b", "c", "d"]);
    expect(two?.more).toBe(true);
    expect(asked).toEqual([undefined, "b"]);
    const all = await readHistory(5, page, 2);
    expect(all?.drafts.map((row) => row.draftId)).toEqual(["a", "b", "c", "d", "e"]);
    expect(all?.more).toBe(false);
  });

  it("reads from the top again, so a row pushed onto the next page is still there", async () => {
    // "c" was the first row of page two; a new conversation "z" pushed "b" down.
    const before = await readHistory(2, runner(["a", "b", "c", "d"]).page, 2);
    const after = await readHistory(2, runner(["z", "a", "b", "c"]).page, 2);
    expect(before?.drafts.map((row) => row.draftId)).toEqual(["a", "b", "c", "d"]);
    expect(after?.drafts.map((row) => row.draftId)).toEqual(["z", "a", "b", "c"]);
  });

  it("is null when a page fails, so what is shown stays", async () => {
    let calls = 0;
    const failing = async () => (calls++ === 0 ? [draft({ draftId: "a" }), draft({ draftId: "b" })] : null);
    expect(await readHistory(2, failing, 2)).toBeNull();
  });
});

describe("the history search", () => {
  const drafts = [
    draft({ draftId: "titled", title: "TCP congestion window", firstMessage: "@diagram draw how a sender backs off", updated: "2026-09-29T10:00:00.000Z" }),
    draft({ draftId: "first", firstMessage: "Show how TCP slow start works", updated: "2026-09-29T12:00:00.000Z" }),
    draft({ draftId: "concept", firstMessage: "@diagram", concept: { slug: "cosine", title: "Cosine similarity" }, updated: "2026-09-29T11:00:00.000Z" }),
    draft({ draftId: "other", firstMessage: "Something else entirely", updated: "2026-09-29T13:00:00.000Z" }),
  ];

  it("normalises the way the runner does: one space, trimmed, any case", () => {
    expect(searchText("  Dot \n  PRODUCT ")).toBe("dot product");
  });

  it("matches a title, a first message or a concept title, in any case, and nothing else", () => {
    expect(drafts.filter((d) => draftMatches(d, "tcp")).map((d) => d.draftId)).toEqual(["titled", "first"]);
    expect(drafts.filter((d) => draftMatches(d, "  COSINE ")).map((d) => d.draftId)).toEqual(["concept"]);
    expect(drafts.filter((d) => draftMatches(d, "backs  off")).map((d) => d.draftId)).toEqual(["titled"]);
    expect(drafts.filter((d) => draftMatches(d, "nothing"))).toEqual([]);
    // A blank search keeps everything; a runner that predates the field sends no first message.
    expect(drafts.every((d) => draftMatches(d, "  "))).toBe(true);
    expect(draftMatches(draft({ title: "TCP", firstMessage: undefined, concept: undefined }), "tcp")).toBe(true);
  });

  it("lists the hits as one run, newest first, with the words around a match the heading does not hold", () => {
    const rows = searchRows(drafts, {}, "tcp");
    expect(rows.map((row) => row.draftId)).toEqual(["first", "titled"]);
    // The heading is the first message: it holds the match.
    expect(rows[0]).toMatchObject({ heading: "Show how TCP slow start works", snippet: null });

    // The heading is the brief's title, and the match is in the first message.
    const inFirst = searchRows(drafts, {}, "sender");
    expect(inFirst[0]).toMatchObject({ draftId: "titled", heading: "TCP congestion window", snippet: "@diagram draw how a sender backs off" });
    // A concept's title heads a row whose first message is a bare tag, and holds the match.
    expect(searchRows(drafts, {}, "similarity")[0]).toMatchObject({ draftId: "concept", heading: "Cosine similarity", snippet: null });
  });

  it("cuts a long snippet to start a little before the match", () => {
    const long = draft({ draftId: "long", title: "Routing", firstMessage: `${"filler words ".repeat(8)}the needle is here` });
    const [row] = searchRows([long], {}, "needle");
    expect(row.snippet?.startsWith("…")).toBe(true);
    expect(row.snippet).toContain("the needle is here");
    expect(row.snippet!.length).toBeLessThan(long.firstMessage!.length);
  });

  it("splits a text into the parts that match, in any case, whatever the search holds", () => {
    expect(matchParts("Show how TCP slow start tcp works", "tcp")).toEqual([
      { text: "Show how ", hit: false },
      { text: "TCP", hit: true },
      { text: " slow start ", hit: false },
      { text: "tcp", hit: true },
      { text: " works", hit: false },
    ]);
    expect(matchParts("a  dot   product", "dot product")).toEqual([
      { text: "a  ", hit: false },
      { text: "dot   product", hit: true },
    ]);
    // Characters a pattern would read as syntax are text.
    expect(matchParts("f(x) = (a+b)*c", "(a+b)*")).toEqual([
      { text: "f(x) = ", hit: false },
      { text: "(a+b)*", hit: true },
      { text: "c", hit: false },
    ]);
    expect(matchParts("nothing here", "tcp")).toEqual([{ text: "nothing here", hit: false }]);
    expect(matchParts("anything", " ")).toEqual([{ text: "anything", hit: false }]);
  });

  it("marks a character whose lower case is longer than itself, which the search found", () => {
    // "İ" lower-cases to "i" and a combining dot: the search for "i" finds it, and the mark must land on it.
    const title = "Plan de l'İstanbul";
    expect(draftMatches(draft({ title }), "i")).toBe(true);
    expect(matchParts("İstanbul", "i")).toEqual([
      { text: "İ", hit: true },
      { text: "stanbul", hit: false },
    ]);
    // Earlier letters that fold longer do not shift the marks that follow.
    expect(matchParts("İİ dot product", "dot")).toEqual([
      { text: "İİ ", hit: false },
      { text: "dot", hit: true },
      { text: " product", hit: false },
    ]);
    expect(matchParts("a  İ  b", "İ")).toEqual([
      { text: "a  ", hit: false },
      { text: "İ", hit: true },
      { text: "  b", hit: false },
    ]);
    // A snippet starts at the match, measured in the original text.
    const [row] = searchRows([draft({ draftId: "tr", title: "Routing", firstMessage: `${"İ".repeat(30)} needle` })], {}, "needle");
    expect(row.snippet).toBe(`…${"İ".repeat(23)} needle`);
  });

  it("finds Greek words whichever sigma they are written with", () => {
    // A capital sigma ends a word as "ς" when a whole string is lower-cased, and is "σ" on its own.
    for (const q of ["ας", "ασ", "ΑΣ"]) {
      expect(draftMatches(draft({ title: "ΑΣ" }), q)).toBe(true);
      expect(draftMatches(draft({ title: "ας" }), q)).toBe(true);
    }
    expect(matchParts("η ΟΔΟΣ", "οδος")).toEqual([
      { text: "η ", hit: false },
      { text: "ΟΔΟΣ", hit: true },
    ]);
  });

  it("finds exactly what the search compares, whatever the text holds", () => {
    // Whatever matchParts marks is a place where the folded text holds the folded search.
    const texts = ["İstanbul İZMİR", "  lead  and   trail  ", "ΑΣ ΟΔΟΣ", "tab\tsplit\nlines", "emoji 😀 and e\u0301 mark"];
    for (const text of texts) {
      for (const q of ["i", "i̇", "and", "ο", "σ", "e", "😀", "split lines", "z"]) {
        const marked = matchParts(text, q).filter((part) => part.hit);
        expect(marked.length > 0).toBe(searchText(text).includes(searchText(q)));
        expect(matchParts(text, q).map((part) => part.text).join("")).toBe(text);
        for (const part of marked) expect(searchText(part.text)).toContain(searchText(q));
      }
    }
  });
});
