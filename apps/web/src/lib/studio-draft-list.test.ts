import { describe, expect, it } from "vitest";

import type { DraftSummary } from "@/lib/studio-drafts";

import { draftRows, stateWords } from "./studio-draft-list";

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
  it("lists talking and briefed drafts, newest first", () => {
    const rows = draftRows([
      draft({ draftId: "old", updated: "2026-09-28T10:00:00.000Z", title: "Old" }),
      draft({ draftId: "new", updated: "2026-09-29T11:00:00.000Z", state: "briefed", title: "New" }),
      draft({ draftId: "done", state: "done", title: "Done" }),
      draft({ draftId: "gone", state: "abandoned", title: "Gone" }),
      draft({ draftId: "drawing", state: "drawing", title: "Drawing" }),
    ]);
    expect(rows.map((row) => row.draftId)).toEqual(["new", "old"]);
    expect(rows[0]).toMatchObject({ state: "Ready to draw", briefed: true });
    expect(rows[1]).toMatchObject({ state: "In conversation", briefed: false });
  });

  it("leaves out a conversation nobody said anything in", () => {
    expect(draftRows([draft({ turns: 0 })])).toEqual([]);
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
