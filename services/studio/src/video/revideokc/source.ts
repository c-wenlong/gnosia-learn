import * as shared from "../source-set";

/**
 * A revideokc video's source (D77, D79 of docs/STUDIO-VIDEO-TOOLS.md): the
 * topic folder's `scene.tsx`, its `narration.json`, and any `.ts` or `.tsx`
 * the agent adds beside them, one level deep, plus the runner's `topic.yml`.
 * The rules and the combined hash are every TypeScript tool's
 * (`../source-set.ts`); what is revideokc's is the scene file's name.
 */

export { combinedHash, readSources, SOURCE_BYTES_MAX, SOURCE_FILE, SOURCE_FILES_MAX, SourceRefused, sourceFilePaths, type SourceFile } from "../source-set";

/** The scene file every revideokc topic has. */
export const SCENE_FILE = "scene.tsx";

/** Every file a change starts from: the source and `topic.yml`. The catalog's own rule for a revideokc topic is the same. */
export const REVIDEOKC_SOURCE_PATTERN = shared.SOURCE_PATTERN;

/** The combined hash as plain JavaScript, for the wrapper. */
export const COMBINED_HASH_JS = shared.hashJs(SCENE_FILE);

/** The combined hash of the source as it is now, or null when there is no `scene.tsx` or a file is refused: what the wrapper would record. */
export function currentSourceHash(topicDir: string): Promise<string | null> {
  return shared.currentSourceHash(topicDir, SCENE_FILE);
}
