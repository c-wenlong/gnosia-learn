import "server-only";

import { loadTopics } from "@self-learn/content";

import { REPO_ROOT } from "@/data/repo-root";

/**
 * The app's view of `content/topics.yaml`: the shared topic vocabulary.
 *
 * Read from the file rather than from the `topic` table on purpose. U3 says the
 * studio keeps working with Postgres down — the corpus comes from `list --json`
 * and the vocabulary from this file — and a topic title is the label on a chip,
 * which is not a good enough reason to make a screen depend on a database.
 *
 * Server only, like every other reader here: it reads the filesystem, and
 * `REPO_ROOT` is why it works when the app is not started from the repo root.
 *
 * Read once per process, the same as `tags` in `content.ts`.
 */
export const topics = loadTopics({ root: REPO_ROOT });

/** `slug -> title`, for a chip that should read as words rather than as a slug. */
export const topicTitles: ReadonlyMap<string, string> = new Map(
  topics.map((topic) => [topic.slug, topic.title]),
);

/** `slug -> domain`, which is what Display's "group by domain" groups on. */
export const topicDomains: ReadonlyMap<string, string> = new Map(
  topics.map((topic) => [topic.slug, topic.domain]),
);

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
export const topicOptions: TopicOption[] = topics.map((topic) => ({
  slug: topic.slug,
  title: topic.title,
  domain: topic.domain,
  concepts: topic.maps.concepts,
}));
