import { describe, expect, it } from "vitest";

import {
  isDraftId,
  madeListLabel,
  madeOpenHref,
  madePath,
  madeThumbHref,
  madeTitle,
  parseMade,
  placeMade,
  type MadeItem,
} from "./conversation-made";

/** What a studio conversation made, as cards in its thread (D89 of docs/STUDIO-CHAT-FIRST.md). */

const item = (over: Partial<MadeItem> = {}): MadeItem => ({
  id: "diagram:learn/assets/tcp-vs-udp.svg",
  kind: "diagram_svg",
  title: "TCP vs UDP",
  name: "tcp-vs-udp",
  jobId: "j1",
  madeAt: "2026-09-30T02:25:41.686Z",
  thumbnail: true,
  ...over,
});

const entry = (seq: number, role: string, at: string) => ({ seq, role, at });

describe("placeMade", () => {
  it("puts a card under the first studio line at or after the write, where the job's story ended", () => {
    const entries = [
      entry(2, "person", "2026-09-30T02:13:34Z"),
      entry(3, "planner", "2026-09-30T02:14:24Z"),
      entry(5, "studio", "2026-09-30T02:23:44Z"), // the topic was created: before the write
      entry(8, "studio", "2026-09-30T02:25:41.703Z"), // accepted: 17ms after the write
      entry(9, "person", "2026-09-30T02:30:00Z"),
    ];
    const { after, tail } = placeMade(entries, [item()]);
    expect([...after.keys()]).toEqual([8]);
    expect(tail).toEqual([]);
  });

  it("falls back to the last entry before the write, then to the end of the thread", () => {
    const entries = [entry(1, "person", "2026-09-30T02:00:00Z"), entry(2, "planner", "2026-09-30T02:01:00Z")];
    expect([...placeMade(entries, [item()]).after.keys()]).toEqual([2]);
    const early = item({ madeAt: "2026-09-29T00:00:00Z" });
    expect(placeMade(entries, [early]).tail).toEqual([early]);
    expect(placeMade([], [early]).tail).toEqual([early]);
  });

  it("follows its own job's line when another job's landed between the write and it", () => {
    const entries = [
      { ...entry(7, "studio", "2026-09-30T02:25:41.690Z"), text: 'The video "Softmax" was accepted and saved as softmax-basics, under ml.' },
      { ...entry(8, "studio", "2026-09-30T02:25:41.703Z"), text: 'The diagram "TCP vs UDP" was accepted and saved as tcp-vs-udp, under tcp.' },
    ];
    expect([...placeMade(entries, [item()]).after.keys()]).toEqual([8]);
    // A slug that is only part of another word is not named.
    const other = [{ ...entry(7, "studio", "2026-09-30T02:25:42Z"), text: "saved as tcp-vs-udp-v2" }, { ...entry(8, "studio", "2026-09-30T02:25:43Z"), text: "done" }];
    expect([...placeMade(other, [item()]).after.keys()]).toEqual([7]);
  });

  it("lists two cards under one line oldest first, as the thread reads", () => {
    const newer = item({ id: "video:dengue", kind: "video", madeAt: "2026-09-30T02:25:41.690Z" });
    const { after } = placeMade([entry(8, "studio", "2026-09-30T02:25:42Z")], [newer, item()]);
    expect(after.get(8)?.map((made) => made.id)).toEqual([item().id, "video:dengue"]);
  });
});

describe("parseMade", () => {
  it("keeps whole items and drops the rest", () => {
    expect(parseMade({ made: [item(), { id: "x", kind: "poster" }, { ...item(), madeAt: "never" }, null] })).toEqual([item()]);
    expect(parseMade({ made: [{ ...item(), title: "  ", name: "" }] })).toEqual([item({ title: null, name: null })]);
    expect(parseMade({ ok: true, reachable: true, made: [] })).toEqual([]);
  });

  it("is no answer for a catalog that was not reached, or a body that is not one, so the panel keeps its cards", () => {
    expect(parseMade({ ok: true, reachable: false, made: [] })).toBeNull();
    expect(parseMade(null)).toBeNull();
    expect(parseMade({ made: "no" })).toBeNull();
  });
});

describe("the card's words and links", () => {
  it("opens the Library's previewer, and shows the SVG or the stored poster", () => {
    expect(madeOpenHref("video:a b")).toBe("/library?open=video%3Aa+b");
    expect(madeThumbHref(item())).toBe("/api/assets/diagram%3Alearn%2Fassets%2Ftcp-vs-udp.svg/file");
    expect(madeThumbHref(item({ id: "video:dengue", kind: "video" }))).toBe("/api/assets/video%3Adengue/poster");
    expect(madeThumbHref(item({ thumbnail: false }))).toBeNull();
  });

  it("names an untitled asset by its slug, then its kind", () => {
    expect(madeTitle(item({ title: null }))).toBe("tcp-vs-udp");
    expect(madeTitle(item({ title: null, name: null, kind: "video" }))).toBe("Untitled video");
  });

  it("counts the list, and has no label for nothing", () => {
    expect(madeListLabel(3)).toBe("Everything made in this conversation (3)");
    expect(madeListLabel(0)).toBeNull();
  });

  it("reads one draft's route, and refuses an id that is not one", () => {
    expect(madePath("48cb177e-5902")).toBe("/studio/made/48cb177e-5902");
    expect(isDraftId("48cb177e-5902-4cd1-984f-9c19ec8ae2d6")).toBe(true);
    expect(isDraftId("../etc")).toBe(false);
    expect(isDraftId("")).toBe(false);
  });
});
