import { typescriptGate } from "../ts-gate";
import { COMPOSITION_FILE, remotionkcPaths } from "./paths";

/**
 * remotionkc's part of the gate (phase 3 of docs/STUDIO-VIDEO-TOOLS.md): the
 * TypeScript tools' steps 1 to 3 and step 10 (`../ts-gate.ts`, D77), with
 * remotionkc's scene file, `composition.tsx`, no `hold` (a scene holds with
 * `extraFrames` in `defineTopic`, which is code the gate does not run), and
 * its two sheets under `render/stills/`.
 */
export const REMOTIONKC_GATE = typescriptGate({
  scene: COMPOSITION_FILE,
  exportHint: "composition.tsx must `export default defineTopic({ component })`: it is what src/Root.tsx registers.",
  hold: false,
  sheets: (paths) => {
    const own = remotionkcPaths(paths);
    return { stills: own.stillsSheet, build: own.buildSheet };
  },
});
