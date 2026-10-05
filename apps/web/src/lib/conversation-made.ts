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

/**
 * The route's answer, kept to the items that are whole, or null when it is
 * no answer to show: not one at all, or the route's word that the catalog was
 * not reached (`reachable: false`), whose empty list says nothing about what
 * was made. The panel keeps what it shows on a null.
 */
export function parseMade(body: unknown): MadeItem[] | null {
  if (body === null || typeof body !== "object") return null;
  if ((body as { reachable?: unknown }).reachable === false) return null;
  const made = (body as { made?: unknown }).made;
  if (!Array.isArray(made)) return null;
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
  text?: string;
}

/** Whether a studio line names the slug as a word: "saved as tcp-vs-udp, under ...". */
function names(text: string | undefined, name: string | null): boolean {
  if (text === undefined || name === null) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9-])${escaped}([^a-z0-9-]|$)`).test(text);
}

/**
 * Where each card goes in the thread: under the entry it belongs after,
 * keyed by that entry's seq, and the rest (`tail`) at the end.
 *
 * The runner writes the asset, then the studio line that says it landed
 * ("The diagram ... was accepted and saved as tcp-vs-udp, ..."), milliseconds
 * apart, so a card goes under the first studio line at or after the write
 * that names the asset's slug: where its own job's story ended, even when
 * another job's line landed between the two. A line naming no slug is the
 * fallback (an asset with no slug, or a runner that worded it otherwise),
 * then the last entry before the write, and with no entry at all, the end.
 * Each list is oldest first, as the thread reads.
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
    const later = timed.filter(({ entry, at: when }) => entry.role === "studio" && when >= at);
    const landed = later.find(({ entry }) => names(entry.text, item.name)) ?? later[0];
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
