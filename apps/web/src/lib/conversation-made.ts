/**
 * What a studio conversation made, on the page (D89 of
 * docs/STUDIO-CHAT-FIRST.md): the answer of `GET /studio/made/<draft>`, which
 * is the catalog's `conversationMade`, and the rules for drawing it as cards
 * in the thread and as the "Everything made in this conversation" list.
 *
 * React-free, so the placement is testable without a browser.
 */

export type MadeKind = "video" | "diagram_svg";

/** One asset the conversation made, as the route answers it. */
export interface MadeItem {
  id: string;
  kind: MadeKind;
  title: string | null;
  /** The diagram's or the video's slug, for Extend; null when unknown. */
  name: string | null;
  jobId: string;
  /** ISO instant the conversation's job wrote it. */
  madeAt: string;
  /** Whether a picture is stored: the SVG, or the video's poster. */
  thumbnail: boolean;
}

/** The route the panel reads. */
export function madePath(draftId: string): string {
  return `/studio/made/${encodeURIComponent(draftId)}`;
}

/** A draft id as the runner mints them (a UUID), or anything as plain. */
export function isDraftId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/** The route's answer, kept to the items that are whole; anything else is an empty list. */
export function parseMade(body: unknown): MadeItem[] {
  if (body === null || typeof body !== "object") return [];
  const made = (body as { made?: unknown }).made;
  if (!Array.isArray(made)) return [];
  return made.flatMap((value): MadeItem[] => {
    if (value === null || typeof value !== "object") return [];
    const v = value as Record<string, unknown>;
    if (typeof v.id !== "string" || v.id === "") return [];
    if (v.kind !== "video" && v.kind !== "diagram_svg") return [];
    if (typeof v.jobId !== "string" || typeof v.madeAt !== "string" || !Number.isFinite(Date.parse(v.madeAt))) return [];
    return [
      {
        id: v.id,
        kind: v.kind,
        title: typeof v.title === "string" && v.title.trim() !== "" ? v.title : null,
        name: typeof v.name === "string" && v.name !== "" ? v.name : null,
        jobId: v.jobId,
        madeAt: v.madeAt,
        thumbnail: v.thumbnail === true,
      },
    ];
  });
}

/**
 * The Library previewer open on the asset (#389). Spelled out rather than
 * taken from `library-preview.ts`, so the panel's bundle carries no part of
 * the Library's.
 */
export function madeOpenHref(id: string): string {
  return `/library?${new URLSearchParams({ open: id })}`;
}

/** The picture: the SVG itself, or the video's stored poster; null when none is stored. */
export function madeThumbHref(item: Pick<MadeItem, "id" | "kind" | "thumbnail">): string | null {
  if (!item.thumbnail) return null;
  // The Library's own routes (`assetPosterHref`, `assetFileHref`), which check the session and the owner.
  return `/api/assets/${encodeURIComponent(item.id)}/${item.kind === "video" ? "poster" : "file"}`;
}

/** What the card calls it when the row has no title: its slug, else its kind. */
export function madeTitle(item: Pick<MadeItem, "title" | "name" | "kind">): string {
  return item.title ?? item.name ?? (item.kind === "video" ? "Untitled video" : "Untitled diagram");
}

/** The pieces of a transcript entry placement reads. */
export interface PlacedEntry {
  seq: number;
  role: string;
  at: string;
}

/**
 * Where each card goes in the thread: under the entry it belongs after,
 * keyed by that entry's seq, and the rest (`tail`) at the end.
 *
 * The runner writes the asset, then the studio line that says it landed
 * ("The diagram ... was accepted and saved as ..."), milliseconds apart, so
 * a card goes under the first studio line at or after the write: where the
 * job's story ended. With no such line (a runner that wrote none, or a line
 * not yet read) it goes under the last entry before the write, and with no
 * entry at all, at the end. Each list is oldest first, as the thread reads.
 */
export function placeMade(
  entries: readonly PlacedEntry[],
  made: readonly MadeItem[],
): { after: Map<number, MadeItem[]>; tail: MadeItem[] } {
  const after = new Map<number, MadeItem[]>();
  const tail: MadeItem[] = [];
  const timed = entries
    .map((entry) => ({ entry, at: Date.parse(entry.at) }))
    .filter((item) => Number.isFinite(item.at))
    .sort((a, b) => a.entry.seq - b.entry.seq);
  const oldestFirst = [...made].sort((a, b) => Date.parse(a.madeAt) - Date.parse(b.madeAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const item of oldestFirst) {
    const at = Date.parse(item.madeAt);
    const landed = timed.find(({ entry, at: when }) => entry.role === "studio" && when >= at);
    const before = timed.filter(({ at: when }) => when <= at).at(-1);
    const host = landed ?? before;
    if (host === undefined) {
      tail.push(item);
      continue;
    }
    const list = after.get(host.entry.seq) ?? [];
    list.push(item);
    after.set(host.entry.seq, list);
  }
  return { after, tail };
}

/** "Everything made in this conversation (3)", or null when nothing was made. */
export function madeListLabel(count: number): string | null {
  return count > 0 ? `Everything made in this conversation (${count})` : null;
}
