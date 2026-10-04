import type { SceneParse } from "../gate";
import { readNarration as readAny, reachable as reachableFrom, typescriptGate } from "../ts-gate";
import { revideokcPaths } from "./paths";
import { SCENE_FILE } from "./source";

/**
 * revideokc's part of the gate (D77 of docs/STUDIO-VIDEO-TOOLS.md): the
 * TypeScript tools' steps 1 to 3 and step 10 (`../ts-gate.ts`), with
 * revideokc's scene file, `scene.tsx`, a chapter's `hold`, and its two
 * sheets under `render/stills/`.
 */

export { HOLD_MAX_SECONDS } from "../ts-gate";

/** `narration.json`'s chapters, `hold` allowed, or the first thing wrong with it. */
export function readNarration(body: Buffer): ReturnType<typeof readAny> {
  return readAny(body, { hold: true });
}

/** The files `scene.tsx` reaches through relative imports of the topic folder, itself first. */
export function reachable(parses: ReadonlyMap<string, SceneParse>): string[] {
  return reachableFrom(parses, SCENE_FILE);
}

export const REVIDEOKC_GATE = typescriptGate({
  scene: SCENE_FILE,
  exportHint: "scene.tsx must `export default defineTopic(...)`: it is what the project loads.",
  hold: true,
  sheets: (paths) => {
    const own = revideokcPaths(paths);
    return { stills: own.stillsSheet, build: own.buildSheet };
  },
});
