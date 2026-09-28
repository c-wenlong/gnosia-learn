import { readTopicEntries } from "../topics";
import type { TypeReader } from "./reader";

/**
 * The database reader for `topics`: the shared topic vocabulary, as
 * `TopicEntry[]` in authored order, with `maps` and `relations` rebuilt from
 * rows.
 *
 * Track A's file (docs/CONTENT-MIGRATION.md, phase 1). `readTopicEntries`
 * runs the same queries, in the same order, as the export that writes
 * `content/topics.yaml`, so for any database this returns what
 * `fileSource(root).topics()` returns for that database's own export: live
 * topics by position, `relations` from `topic_relation`, `maps.manimkc` from
 * `manimkc_topic`, `maps.concepts` from live concepts' `topic_slug` and
 * `maps.courses` from live modules' topic rows. `test/topic-readers.test.ts`
 * holds the two equal. Scoped to `scope.readable`: a topic, a relation, a
 * mapping or a filed concept another owner holds is left out.
 */
export const reader: TypeReader<"topics"> = {
  ready: true,
  read: (db, scope) => () => readTopicEntries(db, scope.readable),
};
