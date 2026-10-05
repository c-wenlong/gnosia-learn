import { dayKey } from "@/lib/days";
import { dayLabel, editedLabel } from "@/lib/day-groups";
import type { AssetParents } from "@self-learn/catalog/state";

import { conversationLabel, latestConversation } from "@/lib/library-source";
import { isPlainClick } from "@/lib/plain-click";
import { studioConversationHref } from "@/lib/row-menu";

/**
 * The rules behind the Library's previewer (L6 of
 * docs/proposals/library-by-type-and-day.md): which press on the list opens
 * an asset in the panel rather than leaving for its page, what the URL says
 * while it is open, which row the arrow keys move to, and the date the
 * panel's header prints.
 *
 * Pure and React-free, so the client `Previewer` and a test both call it;
 * a `"use client"` module's exports are client references, and a helper
 * there could not be called from a test or the server.
 */

/** The search parameter that names the asset open in the panel: `/library?open=<id>`. */
export const OPEN_PARAM = "open";

/**
 * Longer than any asset id the catalog writes (a manimkc id is a path under
 * `out/`, well under 300 characters), so only a hand-made URL is refused.
 */
const MAX_ID_LENGTH = 1000;

/**
 * The asset `?open=` names, from the page's `searchParams` value, or null. A
 * blank or over-long value is not an asset, and of a repeated parameter the
 * first value wins, as `firstParam` does for every other filter.
 */
export function parseOpen(value: string | string[] | null | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = raw?.trim() ?? "";
  return id === "" || id.length > MAX_ID_LENGTH ? null : id;
}

/** `parseOpen` of a raw search string, `location.search`, with or without its `?`. */
export function openFromSearch(search: string): string | null {
  return parseOpen(new URLSearchParams(search).get(OPEN_PARAM));
}

/**
 * `search` (a `location.search`, with or without its `?`) with `?open=` set
 * to `id`, or removed when `id` is null. Every other parameter is kept in its
 * place, so the panel opens over exactly the view the reader was in. Answers
 * with the leading `?`, or `""` when nothing is left.
 */
export function withOpen(search: string, id: string | null): string {
  const params = new URLSearchParams(search);
  if (id === null) params.delete(OPEN_PARAM);
  else params.set(OPEN_PARAM, id);
  const next = params.toString();
  return next === "" ? "" : `?${next}`;
}

/** A click as the previewer sees it: the event's buttons and keys, and whether something handled it already. */
export interface PreviewClick {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/** The anchor the click landed in, by its attributes as written (not the resolved `href` property). */
export interface PreviewAnchor {
  /** `getAttribute("href")`: `/library/manimkc%3Aout%2F…`. */
  href: string | null;
  /** `getAttribute("target")`. */
  target: string | null;
  /** Whether the anchor carries `download`. */
  download: boolean;
}

/**
 * The asset a click on `anchor` should open in the panel, or null to let the
 * browser follow the link as it would anyway.
 *
 * Only a plain left click opens the panel: a click with Cmd, Ctrl, Shift or
 * Alt means "a new tab", "a new window" or "save", and the reader gets that.
 * So does a click something else already handled (`defaultPrevented`: a row's
 * more button stops its own), one inside a control nested in the row
 * (`inControl`: a button or a menu drawn inside the link), and a link that
 * opens elsewhere (`target`) or downloads. Only a link to one asset's page,
 * `/library/<one encoded segment>`, counts, with or without a query or hash;
 * `/library` itself, `/library/<id>/anything` and every other path do not.
 */
export function previewTarget(click: PreviewClick, anchor: PreviewAnchor, inControl = false): string | null {
  if (click.defaultPrevented || inControl || !isPlainClick(click)) return null;
  if (anchor.download) return null;
  if (anchor.target !== null && anchor.target !== "" && anchor.target !== "_self") return null;
  return assetIdOfHref(anchor.href);
}

/** The asset id an asset page's link names, decoded, or null for any other link. */
export function assetIdOfHref(href: string | null): string | null {
  if (href === null) return null;
  const match = /^\/library\/([^/?#]+)(?:[?#].*)?$/.exec(href);
  if (match === null) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    // A malformed escape is not a link `assetHref` wrote: the page answers it.
    return null;
  }
  return id === "" ? null : id;
}

/**
 * The id `step` rows away from `current` in the list as it is drawn, or null
 * at either end (the panel does not wrap: the last row is the last). A
 * `current` the list does not hold (opened from a link to an asset another
 * filter shows) has no neighbours.
 */
export function neighbour(ids: readonly string[], current: string, step: -1 | 1): string | null {
  const at = ids.indexOf(current);
  if (at === -1) return null;
  return ids[at + step] ?? null;
}

/** What an arrow key is for, given where focus is. */
export interface ArrowContext {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /**
   * Whether focus is somewhere the arrows already mean something: a field, a
   * video (seek), a slider, a tab list (move between tabs), a menu, an
   * editable region. The panel never takes the key from those.
   */
  inWidget: boolean;
}

/** -1 for the previous row, 1 for the next, null to leave the key alone. */
export function arrowStep(context: ArrowContext): -1 | 1 | null {
  if (context.inWidget || context.metaKey || context.ctrlKey || context.shiftKey || context.altKey) return null;
  if (context.key === "ArrowLeft") return -1;
  if (context.key === "ArrowRight") return 1;
  return null;
}

/**
 * The date the panel's header prints in grey beside the title: "edited 2
 * Oct" when a person changed the asset more than a day after it was made
 * (the row's rule, `editedLabel`), else the day it was made, "4 Oct", with
 * the year when it is not this one; `date` null when neither instant parses.
 * `dateTime` is the instant the label is from, for `<time dateTime>`.
 */
export function previewDate(
  createdAt: string,
  editedAt: string | null,
  options: { now: Date; timeZone?: string },
): { date: string | null; dateTime: string } {
  const edited = editedLabel(createdAt, editedAt, options);
  if (edited !== null && editedAt !== null) return { date: edited, dateTime: editedAt };
  const made = Date.parse(createdAt);
  if (Number.isNaN(made)) return { date: null, dateTime: createdAt };
  return {
    date: dayLabel(dayKey(new Date(made), options.timeZone), dayKey(options.now, options.timeZone)),
    dateTime: createdAt,
  };
}

/** What the panel's header shows for the asset open in it, as the server answers it. */
/**
 * The previewer header's Conversation tool: the conversation the row menu's
 * Locate in conversation opens (`latestConversation`, the one whose job wrote
 * the asset last), as its link and its name. Null when no conversation made
 * the asset, or its parents could not be read (`loadAssetParents` answers
 * undefined then), which costs the tool and nothing else.
 */
export function previewConversation(parents: AssetParents | undefined): { href: string; title: string } | null {
  const conversation = latestConversation(parents);
  return conversation === null
    ? null
    : { href: studioConversationHref(conversation.id), title: conversationLabel(conversation) };
}

export interface PreviewHeader {
  /** The asset's family, for the glyph: video, diagram, text or link. */
  family: "video" | "diagram" | "text" | "link";
  /** "Video", "Concept note": said to a screen reader beside the glyph. */
  kindLabel: string;
  title: string;
  /** Whether `title` is a filename or a host rather than a title, set in mono as the row sets it. */
  plainName: boolean;
  /** `previewDate`: "edited 2 Oct" or "4 Oct". */
  date: string | null;
  /** The instant `date` is from, for `<time dateTime>`. */
  dateTime: string;
  /** The first concept it explains: its workspace, and its name for the tool's label. */
  concept: { href: string; title: string } | null;
  /**
   * The studio conversation that made it, the most recent of two
   * (`latestConversation`): `/studio?draft=<id>` and its name, for the
   * Conversation tool, the row menu's Locate in conversation.
   */
  conversation?: { href: string; title: string } | null;
  /** The file route, when there is a stored file to hand over. */
  download: { href: string; filename?: string } | null;
  /** `/library/<id>`: "Open page". */
  page: string;
  /** Whether the body is a picture or a player, drawn wider than a column of words. */
  wide: boolean;
}
