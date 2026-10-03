import * as shared from "../source-set";
import { COMPOSITION_FILE } from "./paths";

/**
 * A remotionkc video's source (D79 of docs/STUDIO-VIDEO-TOOLS.md, phase 3):
 * the topic folder's `composition.tsx`, its `narration.json`, and any `.ts`
 * or `.tsx` the agent adds beside them, one level deep, plus the runner's
 * `topic.yml`. The rules and the combined hash are every TypeScript tool's
 * (`../source-set.ts`). Data a topic owns goes in a `.ts` module beside the
 * composition rather than a `.json` file, so the source stays one pattern.
 */

/** Every file a change starts from: the source and `topic.yml`. The catalog's own rule for a remotionkc topic is the same. */
export const REMOTIONKC_SOURCE_PATTERN = shared.SOURCE_PATTERN;

/** The combined hash as plain JavaScript, for the wrapper. */
export const COMBINED_HASH_JS = shared.hashJs(COMPOSITION_FILE);

/** The combined hash of the source as it is now, or null when there is no `composition.tsx`: what the wrapper would record. */
export function currentSourceHash(topicDir: string): Promise<string | null> {
  return shared.currentSourceHash(topicDir, COMPOSITION_FILE);
}
