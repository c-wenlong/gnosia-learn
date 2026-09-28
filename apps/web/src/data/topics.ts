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
  domain: string;
  /** `maps.concepts`, which is what the brief's concept picker may offer. */
  concepts: string[];
}

/**
 * The vocabulary as a client component can hold it.
 *
 * The brief form is a client component and this module is `server-only`, so
 * the combobox cannot import it: what crosses is this array, serialised as a
 * prop. Only the four fields a picker needs, because a prop is bytes in the
 * page and the summaries and aliases are not on that screen.
 *
 * The concepts come with it for the same reason the runner checks them: a
 * concept that is not filed under the chosen topic would be dropped from the
 * asset row after the diagram was drawn, so the form offers the topic's own and
 * nothing else.
 */
export function topicOptionsOf(topics: readonly TopicEntry[]): TopicOption[] {
  return topics.map((topic) => ({
    slug: topic.slug,
    title: topic.title,
    domain: topic.domain,
    concepts: topic.maps.concepts,
  }));
}
