import type { TopicEntry } from "@self-learn/content";

/**
 * The topic vocabulary as the studio screens get it: from the runner, never
 * from the app's own content read.
 *
 * The app reads content from the database only, so with Postgres down its
 * topic read throws, and U3 says the studio still browses and draws. The
 * runner keeps the last topic list it read under `$STUDIO_HOME/cache/`
 * (D13 of docs/CONTENT-MIGRATION.md) and serves it at `/api/vocabulary`, with
 * `stale` and `readAt` beside it; `/api/health` reports the same two fields.
 * This file turns those answers into what a page shows.
 *
 * Pure, like `studio-view.ts`: no fetch, no React, no `server-only`, so the
 * wording is tested here and the pages only render it.
 */

/** `health.vocabulary` from the runner. `readAt: null` means there is no copy at all. */
export interface VocabularyState {
  stale: boolean;
  readAt: string | null;
  error?: string;
}

/** What the banner says, and how loudly. */
export interface VocabularyBanner {
  tone: "warn" | "danger";
  text: string;
}

function isState(value: unknown): value is VocabularyState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return typeof state.stale === "boolean" && (typeof state.readAt === "string" || state.readAt === null);
}

/** A readAt as a person reads it. Injected so the tests do not depend on the machine's zone. */
export type FormatTime = (iso: string) => string;

const localTime: FormatTime = (iso) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
};

/**
 * The D13 banner for a health answer's `vocabulary`, or null when there is
 * nothing to say: the list is current, or the runner is older than the field
 * and says nothing about it.
 *
 * Stale with a `readAt` is a warning, since drawing and briefs still work
 * against the copy. Stale with none is louder: no copy means a brief cannot be
 * checked at all, so Start will be refused until the catalog answers.
 */
export function vocabularyBanner(value: unknown, format: FormatTime = localTime): VocabularyBanner | null {
  if (!isState(value) || !value.stale) return null;
  const why = value.error !== undefined && value.error.trim() !== "" ? ` (${value.error.trim()})` : "";
  if (value.readAt === null) {
    return {
      tone: "danger",
      text:
        `The topic list cannot be read and there is no saved copy${why}, so briefs cannot be ` +
        `checked. Browsing and drawing still work; start a job once the catalog answers.`,
    };
  }
  return {
    tone: "warn",
    text:
      `The topic list is stale since ${format(value.readAt)}: the catalog could not be read${why}, ` +
      `so topics and briefs are checked against the copy saved then.`,
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * The topics in a `/api/vocabulary` answer, as the same `TopicEntry` the rest
 * of the app holds, so the chip and picker helpers take them unchanged.
 *
 * An entry without a slug and a title is dropped rather than guessed at, and
 * anything that is not the expected shape is an empty list: the chips then
 * show slugs, which is what they show for a topic nobody has titled.
 */
export function vocabularyTopics(payload: unknown): TopicEntry[] {
  const topics = (typeof payload === "object" && payload !== null ? (payload as { topics?: unknown }).topics : null);
  if (!Array.isArray(topics)) return [];
  const entries: TopicEntry[] = [];
  for (const item of topics) {
    if (typeof item !== "object" || item === null) continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.slug !== "string" || typeof raw.title !== "string") continue;
    const maps = (typeof raw.maps === "object" && raw.maps !== null ? raw.maps : {}) as Record<string, unknown>;
    entries.push({
      slug: raw.slug,
      title: raw.title,
      domain: typeof raw.domain === "string" ? raw.domain : "",
      summary: typeof raw.summary === "string" ? raw.summary : null,
      aliases: strings(raw.aliases),
      relations: Array.isArray(raw.relations) ? (raw.relations as TopicEntry["relations"]) : [],
      maps: { manimkc: strings(maps.manimkc), courses: strings(maps.courses), concepts: strings(maps.concepts) },
    });
  }
  return entries;
}
