import type { AssetParents, AssetPlace } from "@self-learn/catalog/state";
import { describe, expect, it } from "vitest";

import { conceptOrder } from "./library-source";
import { askSubjectOf, assetDownloadHref, rowMenuItems, studioConversationHref, type RowMenuInput } from "./row-menu";

const place = (over: Partial<AssetPlace> = {}): AssetPlace => ({
  course: "cs3230",
  code: "CS3230",
  courseTitle: "Design and Analysis of Algorithms",
  module: "m3-proof",
  moduleTitle: "Week 3: Proof",
  position: 3,
  via: "item",
  ...over,
});

const parents = (over: Partial<AssetParents> = {}): AssetParents => ({
  places: [],
  concepts: [],
  conversations: [],
  sessions: [],
  ...over,
});

const ORDER = conceptOrder([
  { id: "recurrences", requires: [], assumes: [] },
  { id: "master-theorem", requires: ["recurrences"], assumes: [] },
]);

const input = (over: Partial<RowMenuInput>): RowMenuInput => ({
  id: "manimkc:out/a b.mp4",
  kind: "video",
  parents: undefined,
  order: ORDER,
  course: null,
  served: true,
  starred: false,
  ...over,
});

/** The menu as its groups' labels. */
const labels = (over: Partial<RowMenuInput>) => rowMenuItems(input(over)).map((group) => group.map((item) => item.label));

describe("rowMenuItems", () => {
  it("gives a stored video under a concept and a course every item, in three groups", () => {
    const sections = rowMenuItems(
      input({ parents: parents({ places: [place()], concepts: ["master-theorem", "recurrences"] }) }),
    );
    expect(sections.map((g) => g.map((i) => i.label))).toEqual([
      ["Open", "Open the concept", "Open in course"],
      ["Rename", "Favorite", "Ask", "Mark watched"],
      ["Copy link", "Download"],
    ]);
    const hrefs = Object.fromEntries(sections.flat().flatMap((i) => ("href" in i ? [[i.action, i.href]] : [])));
    expect(hrefs).toEqual({
      open: "/library/manimkc%3Aout%2Fa%20b.mp4",
      // The first in the graph's order, as the source line names it.
      concept: "/learn/recurrences",
      course: "/courses/cs3230/m3-proof",
      copy: "/library/manimkc%3Aout%2Fa%20b.mp4",
      download: "/api/assets/manimkc%3Aout%2Fa%20b.mp4/file?download=1",
    });
  });

  it("leaves out Open the concept, Open in course, Ask and Download when there is nothing behind them", () => {
    expect(labels({ served: false })).toEqual([["Open"], ["Rename", "Favorite", "Mark watched"], ["Copy link"]]);
  });

  it("says Mark read for anything but a video, and Ask only for a note or a diagram it can read", () => {
    expect(labels({ kind: "note" })[1]).toEqual(["Rename", "Favorite", "Ask", "Mark read"]);
    expect(labels({ kind: "diagram_svg" })[1]).toEqual(["Rename", "Favorite", "Ask", "Mark read"]);
    expect(labels({ kind: "session" })[1]).toEqual(["Rename", "Favorite", "Mark read"]);
    expect(labels({ kind: "link", served: false })).toEqual([["Open"], ["Rename", "Favorite", "Mark read"], ["Copy link"]]);
  });

  it("locates a conversation's diagram in it, after Open in course, the most recent of two", () => {
    const sections = rowMenuItems(
      input({
        kind: "diagram_svg",
        parents: parents({
          places: [place()],
          conversations: [
            { id: "draft new", title: "Again", name: "Proof picture", updatedAt: "2026-10-03T00:00:00.000Z" },
            { id: "draft-old", title: "First", name: null, updatedAt: "2026-10-04T00:00:00.000Z" },
          ],
        }),
      }),
    );
    expect(sections[0]?.map((i) => i.label)).toEqual(["Open", "Open in course", "Locate in conversation"]);
    expect(sections[0]?.[2]).toEqual({
      action: "conversation",
      label: "Locate in conversation",
      href: "/studio?draft=draft+new",
    });
    // Alone, with no course or concept, it still comes after Open.
    expect(labels({ parents: parents({ conversations: [{ id: "d1", title: null, name: null, updatedAt: null }] }) })[0]).toEqual([
      "Open",
      "Locate in conversation",
    ]);
  });

  it("links a conversation as the sidebar does, /studio?draft=<id>", () => {
    expect(studioConversationHref("abc-123")).toBe("/studio?draft=abc-123");
  });

  it("offers Unfavorite on a starred asset, and neither when the stars could not be read", () => {
    expect(labels({ starred: true })[1]).toContain("Unfavorite");
    expect(labels({ starred: null })[1]).toEqual(["Rename", "Ask", "Mark watched"]);
  });

  it("opens the course the filter names, and the course page for an asset on the course itself", () => {
    const two = parents({ places: [place(), place({ course: "cs1231", code: "CS1231", module: "m1", position: 1 })] });
    const course = (over: Partial<RowMenuInput>) =>
      rowMenuItems(input(over))
        .flat()
        .find((i) => i.action === "course");
    expect(course({ parents: two })).toMatchObject({ href: "/courses/cs1231/m1" });
    expect(course({ parents: two, course: "cs3230" })).toMatchObject({ href: "/courses/cs3230/m3-proof" });
    expect(course({ parents: parents({ places: [place({ module: null, moduleTitle: null })] }) })).toMatchObject({
      href: "/courses/cs3230",
    });
  });
});

describe("askSubjectOf and assetDownloadHref", () => {
  it("names the three kinds Ask answers for, and nothing else", () => {
    expect(["video", "note", "diagram_svg", "session", "link", "transcript"].map(askSubjectOf)).toEqual([
      "video",
      "note",
      "diagram",
      null,
      null,
      null,
    ]);
  });

  it("is the file route with download on", () => {
    expect(assetDownloadHref("note:a/b")).toBe("/api/assets/note%3Aa%2Fb/file?download=1");
  });
});
