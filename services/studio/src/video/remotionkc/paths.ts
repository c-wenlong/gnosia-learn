import path from "node:path";

import { resolvedPaths } from "../checkout";
import { moduleOf, STUDIO_DOMAIN, type VideoPaths } from "../paths";

/**
 * A remotionkc job's paths (phase 3 of docs/STUDIO-VIDEO-TOOLS.md).
 *
 * The workspace is a manimkc job's, field for field (`../paths.ts`), as
 * revideokc's is: `render/` is the data root (`REMOTIONKC_HOME`, and
 * `MANIMKC_HOME` for gnosia-audio, whose clip cache is then
 * `render/cache/audio`), and remotionkc's `out/<topic>/<name>.mp4` with its
 * three sidecars lands where a manimkc deliverable does. What differs:
 *
 *   checkout/                          a synthetic remotionkc checkout, REMOTIONKC_ROOT
 *     lib/ src/ tools/                 copies; node_modules and .venv link to the real ones
 *     docs/remotion/                   Remotion's markup guides (its vendored skill), for the agent
 *     topics/studio/<slug>/
 *       composition.tsx                the agent's, with any .ts or .tsx it adds beside it
 *       narration.json                 the script, from the brief; the agent may reword it
 *       topic.yml                      the runner's
 *   render/
 *     public/studio/<slug>/            the staged clips, the manifest, the word times
 *     stills/studio/<slug>/            stills.sheet.png and <name>.sheet.png, which the agent Reads
 *     cache/build/studio/<slug>/       a build's work folders, its lock and its kept timeline
 *
 * Derived from the job's `VideoPaths`, never stored apart from them.
 */

/** A remotionkc topic's path under `topics/`: the studio's domain and the slug. */
export function topicPath(slug: string): string {
  return `${STUDIO_DOMAIN}/${slug}`;
}

/** The scene file every remotionkc topic has. */
export const COMPOSITION_FILE = "composition.tsx";

/** The job's paths as the runner holds them, with `sceneFile` at `composition.tsx`. */
export async function remotionkcVideoPaths(jobId: string, slug: string, jobDirectory?: string): Promise<VideoPaths> {
  const paths = await resolvedPaths(jobId, slug, jobDirectory);
  return { ...paths, sceneFile: path.join(paths.topicDir, COMPOSITION_FILE) };
}

export interface RemotionkcPaths {
  /** `studio/<slug>`, what every CLI verb names the topic by. */
  topic: string;
  slug: string;
  /** The deliverable's stem, `<slug with underscores>`. */
  stem: string;
  narration: string;
  /** `checkout/docs/remotion`: Remotion's own markup guides, copied for the agent to Read. */
  docs: string;
  nodeModules: string;
  venv: string;
  publicDir: string;
  stillsRoot: string;
  stillsDir: string;
  stillsSheet: string;
  buildSheet: string;
  cache: string;
  /** `cache/build`: a build's work folders, the topic's lock, the kept timeline. */
  buildWork: string;
  state: string;
}

export function remotionkcPaths(paths: VideoPaths): RemotionkcPaths {
  const slug = path.basename(paths.topicDir);
  const topic = topicPath(slug);
  const stem = moduleOf(slug);
  const stillsRoot = path.join(paths.render, "stills");
  const stillsDir = path.join(stillsRoot, STUDIO_DOMAIN, slug);
  const cache = path.join(paths.render, "cache");
  return {
    topic,
    slug,
    stem,
    narration: path.join(paths.topicDir, "narration.json"),
    docs: path.join(paths.checkout, "docs", "remotion"),
    nodeModules: path.join(paths.checkout, "node_modules"),
    venv: path.join(paths.checkout, ".venv"),
    publicDir: path.join(paths.render, "public"),
    stillsRoot,
    stillsDir,
    stillsSheet: path.join(stillsDir, "stills.sheet.png"),
    buildSheet: path.join(stillsDir, `${stem}.sheet.png`),
    cache,
    buildWork: path.join(cache, "build"),
    state: path.join(paths.render, "state"),
  };
}
