import { describe, expect, it } from "vitest";

import { compareSortKeys, sortKeyOf, sortRows } from "./library";
import {
  cameBack,
  encodeCursor,
  foldPieces,
  heldPagesKey,
  MAX_RESTORED_PAGES,
  pageOf,
  parseCursor,
  parseHeldPages,
  POP_WINDOW_MS,
  type LibraryPage,
  type PageGroup,
} from "./library-pages";

interface Row {
  id: string;
  kind: string;
  path: string | null;
  url: string | null;
  bytes: number | null;
  title: string | null;
  createdAt: string;
}

/** `n` notes made a minute apart, newest first, ids `<prefix>-<i>`. */
function rows(prefix: string, n: number, day = "2026-10-04"): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `note:${prefix}-${String(i).padStart(3, "0")}`,
    kind: "note",
    path: null,
    url: null,
    bytes: null,
    title: `${prefix} ${i}`,
    createdAt: new Date(Date.parse(`${day}T23:00:00Z`) - i * 60_000).toISOString(),
  }));
}

function group(key: string, list: Row[]): PageGroup<Row> {
  return { key, label: key, rows: list };
}

function ok(page: ReturnType<typeof pageOf<Row>>): LibraryPage<Row> {
  if (page.state !== "ok") throw new Error("stale");
  return page;
}

const ids = (page: LibraryPage<Row>) => page.pieces.flatMap((p) => p.rows.map((r) => r.id));

/** Every page from the first, following the cursors. */
function walk(groups: PageGroup<Row>[], size = 50, max = 100): LibraryPage<Row>[] {
  const pages = [ok(pageOf(groups, sortKeyOf, "newest", null, { size, max }))];
  while (pages[pages.length - 1].next !== null) {
    pages.push(ok(pageOf(groups, sortKeyOf, "newest", parseCursor(pages[pages.length - 1].next), { size, max })));
  }
  return pages;
}

describe("pageOf", () => {
  it("rounds the first page up to finish the group it ends in", () => {
    const groups = [group("2026-10-04", rows("a", 30)), group("2026-10-03", rows("b", 40, "2026-10-03")), group("2026-10-02", rows("c", 10, "2026-10-02"))];
    const first = ok(pageOf(groups, sortKeyOf, "newest", null));
    expect(ids(first)).toHaveLength(70);
    expect(first.pieces.map((p) => p.group.key)).toEqual(["2026-10-04", "2026-10-03"]);
    expect(first.remaining).toBe(10);
    const second = ok(pageOf(groups, sortKeyOf, "newest", parseCursor(first.next)));
    expect(second.pieces.map((p) => p.group.key)).toEqual(["2026-10-02"]);
    expect(second.next).toBeNull();
    expect(second.remaining).toBe(0);
  });

  it("splits a group too big to finish, and goes on under its heading with its whole count", () => {
    const groups = [group("2026-10-04", rows("a", 197)), group("2026-10-03", rows("b", 5, "2026-10-03"))];
    const pages = walk(groups);
    // The third page finishes the day: its last 97 rows are within the cap.
    expect(pages.map((p) => ids(p).length)).toEqual([50, 50, 97, 5]);
    // Every piece of the big day says the day's whole count.
    expect(pages.flatMap((p) => p.pieces).filter((p) => p.group.key === "2026-10-04").every((p) => p.group.count === 197)).toBe(true);
    // Drawn together, one heading per day, every row once and in order.
    const folded = foldPieces(pages.flatMap((p) => p.pieces));
    expect(folded.map((g) => g.group.key)).toEqual(["2026-10-04", "2026-10-03"]);
    const all = folded.flatMap((g) => g.sections.flatMap((s) => s.rows.map((r) => r.id)));
    expect(all).toEqual([...groups[0].rows, ...groups[1].rows].map((r) => r.id));
  });

  it("holds every row exactly once across the pages, whatever the size", () => {
    const groups = Array.from({ length: 23 }, (_, i) => group(`2026-09-${String(i + 1).padStart(2, "0")}`, rows(`d${i}`, (i * 7) % 31)));
    const total = groups.reduce((n, g) => n + g.rows.length, 0);
    for (const size of [1, 7, 50]) {
      const pages = walk(groups, size, size * 2);
      const seen = pages.flatMap(ids);
      expect(new Set(seen).size).toBe(total);
      expect(seen).toHaveLength(total);
    }
  });

  it("starts after the cursor's row even when rows were added above it", () => {
    const before = [group("2026-10-04", rows("a", 120))];
    const first = ok(pageOf(before, sortKeyOf, "newest", null));
    const lastShown = ids(first).at(-1);
    // Three new rows land at the top of the day before the reader scrolls.
    const fresh = rows("new", 3).map((r) => ({ ...r, createdAt: "2026-10-04T23:59:00Z" }));
    const after = [group("2026-10-04", [...fresh, ...before[0].rows])];
    const second = ok(pageOf(after, sortKeyOf, "newest", parseCursor(first.next)));
    expect(ids(second)[0]).toBe(before[0].rows[before[0].rows.findIndex((r) => r.id === lastShown) + 1].id);
  });

  it("starts where the cursor's row would sort when that row is gone", () => {
    const list = rows("a", 120);
    const first = ok(pageOf([group("d", list)], sortKeyOf, "newest", null));
    const lastShown = ids(first).at(-1);
    const without = list.filter((r) => r.id !== lastShown);
    const second = ok(pageOf([group("d", without)], sortKeyOf, "newest", parseCursor(first.next)));
    expect(ids(second)[0]).toBe(list[list.findIndex((r) => r.id === lastShown) + 1].id);
  });

  it("is stale when the cursor's group or module is gone", () => {
    const first = ok(pageOf([group("a", rows("a", 120))], sortKeyOf, "newest", null));
    const cursor = parseCursor(first.next);
    expect(pageOf([group("b", rows("b", 10))], sortKeyOf, "newest", cursor).state).toBe("stale");
    const withModules: PageGroup<Row>[] = [{ key: "a", label: "A", rows: [], sections: [{ key: "m1", label: "M1", rows: [] }] }];
    expect(pageOf(withModules, sortKeyOf, "newest", cursor).state).toBe("stale");
    const sectioned = parseCursor(encodeCursor({ group: "a", section: "m9", key: sortKeyOf(rows("a", 1)[0]) }));
    expect(pageOf(withModules, sortKeyOf, "newest", sectioned).state).toBe("stale");
    expect(pageOf([group("a", rows("a", 3))], sortKeyOf, "newest", sectioned).state).toBe("stale");
  });

  it("pages a course's modules in order, each module once under its own heading", () => {
    const m1 = rows("m1", 40);
    const m2 = rows("m2", 40);
    const course: PageGroup<Row> = {
      key: "course:cs3230",
      label: "CS3230",
      detail: "Algorithms",
      rows: [...m1, ...m2],
      sections: [
        { key: "", label: "Whole course", rows: m1 },
        { key: "w2", label: "Week 2", rows: m2 },
      ],
    };
    const loose = group("none", rows("loose", 90));
    const pages = walk([course, loose], 50, 60);
    expect(ids(pages[0])).toHaveLength(50);
    expect(pages[0].pieces.map((p) => [p.group.key, p.section?.key, p.section?.count, p.rows.length])).toEqual([
      ["course:cs3230", "", 40, 40],
      ["course:cs3230", "w2", 40, 10],
    ]);
    // The second page goes on in Week 2, then finishes nothing past its cap.
    expect(pages[1].pieces[0]).toMatchObject({ group: { key: "course:cs3230", count: 80, detail: "Algorithms" }, section: { key: "w2" } });
    const folded = foldPieces(pages.flatMap((p) => p.pieces));
    expect(folded.map((g) => [g.group.key, g.sections.map((s) => [s.section?.key ?? null, s.rows.length])])).toEqual([
      ["course:cs3230", [["", 40], ["w2", 40]]],
      ["none", [[null, 90]]],
    ]);
    // A module's cursor goes on after its row there.
    const cursor = parseCursor(pages[0].next);
    expect(cursor).toMatchObject({ group: "course:cs3230", section: "w2" });
  });

  it("follows the title sort inside a group, as sortRows draws it", () => {
    const list = sortRows(rows("t", 130), "title");
    const pages = (() => {
      const out = [ok(pageOf([group("d", list)], sortKeyOf, "title", null))];
      while (out[out.length - 1].next !== null)
        out.push(ok(pageOf([group("d", list)], sortKeyOf, "title", parseCursor(out[out.length - 1].next))));
      return out;
    })();
    expect(pages.flatMap(ids)).toEqual(list.map((r) => r.id));
    // A gone row's place by title.
    const gone = ids(pages[0]).at(-1);
    const next = ok(pageOf([group("d", list.filter((r) => r.id !== gone))], sortKeyOf, "title", parseCursor(pages[0].next)));
    expect(ids(next)[0]).toBe(ids(pages[1])[0]);
  });

  it("answers an empty last page after the final row, and nothing for no rows", () => {
    const list = rows("a", 3);
    const last = parseCursor(encodeCursor({ group: "a", section: null, key: sortKeyOf(list[2]) }));
    expect(ok(pageOf([group("a", list)], sortKeyOf, "newest", last))).toEqual({ state: "ok", pieces: [], next: null, remaining: 0 });
    expect(ok(pageOf([], sortKeyOf, "newest", null))).toEqual({ state: "ok", pieces: [], next: null, remaining: 0 });
  });

  it("carries a heading's detail and mastery dot", () => {
    const page = ok(pageOf([{ key: "topic:x", label: "X", detail: "4 Oct", bucket: "learning", rows: rows("x", 2) }], sortKeyOf, "newest", null));
    expect(page.pieces[0].group).toEqual({ key: "topic:x", label: "X", detail: "4 Oct", bucket: "learning", count: 2 });
  });
});

describe("sort keys", () => {
  it("order rows exactly as sortRows does", () => {
    const list = [...rows("a", 5), { ...rows("b", 1)[0], createdAt: "not a date" }, { ...rows("c", 1)[0], kind: "video" }];
    for (const sort of ["newest", "title"] as const) {
      const byKeys = [...list].sort((a, b) => compareSortKeys(sortKeyOf(a), sortKeyOf(b), sort));
      expect(byKeys.map((r) => r.id)).toEqual(sortRows(list, sort).map((r) => r.id));
    }
    expect(sortKeyOf({ ...list[0], createdAt: "nope" }).at).toBe(0);
  });
});

describe("parseCursor", () => {
  it("reads back what encodeCursor wrote", () => {
    const cursor = { group: "g", section: "s", key: { at: 5, title: "T", kind: "note", id: "note:x" } };
    expect(parseCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(parseCursor(encodeCursor({ ...cursor, section: null }))).toEqual({ ...cursor, section: null });
  });

  it("refuses anything else", () => {
    for (const bad of [
      null,
      42,
      "",
      "{",
      "[]",
      "null",
      "x".repeat(5000),
      JSON.stringify({ g: 1, s: null, k: [0, "", "", ""] }),
      JSON.stringify({ g: "g", s: 3, k: [0, "", "", ""] }),
      JSON.stringify({ g: "g", s: null, k: [0, "", ""] }),
      JSON.stringify({ g: "g", s: null, k: ["0", "", "", ""] }),
      JSON.stringify({ g: "g", s: null, k: [null, "", "", ""] }),
      JSON.stringify({ g: "g", s: null, k: [0, 1, "", ""] }),
      JSON.stringify({ g: "g", s: null, k: "nope" }),
    ]) {
      expect(parseCursor(bad), String(bad).slice(0, 40)).toBeNull();
    }
  });
});

describe("foldPieces", () => {
  it("keeps one heading for a group that turns up again", () => {
    const heading = (key: string) => ({ key, label: key, count: 9 });
    const folded = foldPieces([
      { group: heading("a"), section: null, rows: [1, 2] },
      { group: heading("b"), section: null, rows: [3] },
      { group: heading("a"), section: null, rows: [4] },
    ]);
    expect(folded.map((g) => [g.group.key, g.sections[0].rows])).toEqual([
      ["a", [1, 2, 4]],
      ["b", [3]],
    ]);
  });
});

describe("back and forward", () => {
  it("keys the held pages by the view's URL", () => {
    expect(heldPagesKey("/library?view=list")).toBe("library-pages:/library?view=list");
  });

  it("reads a held count and offset, and refuses the rest", () => {
    expect(parseHeldPages(JSON.stringify({ pages: 3, y: 1200.5 }))).toEqual({ pages: 3, y: 1200.5 });
    expect(parseHeldPages(JSON.stringify({ pages: 9999, y: 0 }))).toEqual({ pages: MAX_RESTORED_PAGES, y: 0 });
    for (const bad of [null, "", "{", "7", JSON.stringify({ pages: 0, y: 0 }), JSON.stringify({ pages: 1.5, y: 0 }), JSON.stringify({ pages: 2, y: -1 }), JSON.stringify({ pages: 2 })]) {
      expect(parseHeldPages(bad)).toBeNull();
    }
  });

  it("restores after a recent popstate, or on a document loaded by back or reload", () => {
    const now = 10_000;
    expect(cameBack({ now, lastPop: now - 100, navigation: "navigate", firstMount: false })).toBe(true);
    expect(cameBack({ now, lastPop: now - POP_WINDOW_MS, navigation: "navigate", firstMount: false })).toBe(false);
    expect(cameBack({ now, lastPop: now + 5, navigation: null, firstMount: false })).toBe(false);
    expect(cameBack({ now, lastPop: null, navigation: "back_forward", firstMount: true })).toBe(true);
    expect(cameBack({ now, lastPop: null, navigation: "reload", firstMount: true })).toBe(true);
    expect(cameBack({ now, lastPop: null, navigation: "reload", firstMount: false })).toBe(false);
    expect(cameBack({ now, lastPop: null, navigation: "navigate", firstMount: true })).toBe(false);
  });
});
