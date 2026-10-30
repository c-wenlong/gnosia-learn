import type { GlyphName } from "@/components/ui/Glyph";
import { isCourseVisit, type RecentKind } from "@/lib/recent-core";

/**
 * Each Recent kind's glyph and the word a screen reader hears before its
 * title, for every list of Recent's rows: the sidebar's Recent, its search,
 * and Home's "Pick up where you left off", so one row is called the same
 * thing in each. A conversation is the studio's compose glyph, as New chat
 * is; a tutor session is the chat glyph.
 *
 * React-free, so a server component (Home's card) and a client one (the
 * sidebar) both take it.
 */
export const RECENT_GLYPHS: Record<RecentKind, { glyph: GlyphName; word: string }> = {
  module: { glyph: "book", word: "Course module" },
  video: { glyph: "video", word: "Video" },
  draft: { glyph: "compose", word: "Conversation" },
  concept: { glyph: "concepts", word: "Concept" },
  session: { glyph: "chat", word: "Tutor session" },
};

/** A row's glyph and word: a course page visited with no module open is a "Course" (`isCourseVisit`). */
export function recentGlyph(item: { kind: RecentKind; key: string }): { glyph: GlyphName; word: string } {
  const kind = RECENT_GLYPHS[item.kind];
  return isCourseVisit(item) ? { ...kind, word: "Course" } : kind;
}
