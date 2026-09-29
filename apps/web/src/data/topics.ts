import "server-only";

import type { TopicEntry } from "@self-learn/content";
import { cache } from "react";

import { contentSource } from "@/data/source";

/**
 * The app's view of the shared topic vocabulary.
 *
 * Through the content seam, which reads the `topic` rows (the database only,
 * since phase 2), so with Postgres down this throws. The studio's screens
 * keep U3 by not depending on it: a topic title is the label on a chip, and
 * they fall back to the slug.
 *
 * Server only, like every other reader here, and once per request, like
 * `getCourses`. The three views below are pure over the list a page already
 * holds.
 */
export const getTopics = cache(async (): Promise<TopicEntry[]> => contentSource().topics());

/** `slug -> title`, for a chip that should read as words rather than as a slug. */
export function topicTitleMap(topics: readonly TopicEntry[]): ReadonlyMap<string, string> {
  return new Map(topics.map((topic) => [topic.slug, topic.title]));
}

/** `slug -> domain`, which is what Display's "group by domain" groups on. */
export function topicDomainMap(topics: readonly TopicEntry[]): ReadonlyMap<string, string> {
  return new Map(topics.map((topic) => [topic.slug, topic.domain]));
}

export interface TopicOption {
  slug: string;
  title: string;
  /** The topic's domain, which groups the confirm card's topic menu. */
  domain?: string;
}

/**
 * The vocabulary as a client component can hold it.
 *
 * The studio's conversation is a client component and this module is
 * `server-only`, so the confirm card cannot import it: what crosses is this
 * array, serialised as a prop. Only the slug, the title the card shows and
 * the domain its topic menu groups by, because a prop is bytes in the page.
 */
export function topicOptionsOf(topics: readonly TopicEntry[]): TopicOption[] {
  return topics.map((topic) => ({ slug: topic.slug, title: topic.title, ...(topic.domain ? { domain: topic.domain } : {}) }));
}
