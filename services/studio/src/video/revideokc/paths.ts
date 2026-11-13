import path from "node:path";

import { resolvedPaths } from "../checkout";
import { moduleOf, STUDIO_DOMAIN, type VideoPaths } from "../paths";

/**
 * A revideokc job's paths (phase 2c of docs/STUDIO-VIDEO-TOOLS.md).
 *
 * The workspace is a manimkc job's, field for field (`../paths.ts`), so the
 * runner, the gate and Accept read it unchanged: `render/` is the data root
 * (`REVIDEOKC_HOME`, and `MANIMKC_HOME` for gnosia-audio, whose clip cache is
 * then `render/cache/audio`, the same `audio` a manimkc job has), and
 * revideokc's `out/<topic>/<name>.mp4` with its three sidecars lands exactly
 * where a manimkc deliverable does, since both name the file after the slug
 * with its hyphens made underscores. What differs:
 *
 *   checkout/                          a synthetic revideokc checkout, REVIDEOKC_ROOT
 *     lib/ src/ tools/ docs/           copies; node_modules and .venv link to the real ones
 *     topics/studio/<slug>/
 *       scene.tsx                      the agent's, with any .ts or .tsx it adds beside it
 *       narration.json                 the script, from the brief; the agent may reword it
 *       topic.yml                      the runner's
 *   render/
 *     public/studio/<slug>/            the staged clips, the manifest, the word times
 *     stills/studio/<slug>/            stills.sheet.png and <name>.sheet.png, which the agent Reads
 *     cache/vite, cache/build          Vite's cache; a build's work folder and its timeline
 *
 * These are derived from the job's `VideoPaths`, never stored apart from
 * them, so a rebased job directory moves them too.
 */

/** A revideokc topic's path under `topics/`: the studio's domain and the slug. */
export function topicPath(slug: string): string {
  return `${STUDIO_DOMAIN}/${slug}`;
}

/** The job's paths as the runner holds them, with `sceneFile` at `scene.tsx`. */
export async function revideokcVideoPaths(jobId: string, slug: string, jobDirectory?: string): Promise<VideoPaths> {
  const paths = await resolvedPaths(jobId, slug, jobDirectory);
  return { ...paths, sceneFile: path.join(paths.topicDir, "scene.tsx") };
}

export interface RevideokcPaths {
  /** `studio/<slug>`, what every CLI verb names the topic by. */
  topic: string;
  slug: string;
  /** The deliverable's stem, `<slug with underscores>`. */
  stem: string;
  narration: string;
  docs: string;
  nodeModules: string;
  venv: string;
  publicDir: string;
  stillsRoot: string;
  stillsDir: string;
  stillsSheet: string;
  buildSheet: string;
  cache: string;
  vite: string;
  buildWork: string;
  state: string;
}

export function revideokcPaths(paths: VideoPaths): RevideokcPaths {
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
    docs: path.join(paths.checkout, "docs"),
    nodeModules: path.join(paths.checkout, "node_modules"),
    venv: path.join(paths.checkout, ".venv"),
    publicDir: path.join(paths.render, "public"),
    stillsRoot,
    stillsDir,
    stillsSheet: path.join(stillsDir, "stills.sheet.png"),
    buildSheet: path.join(stillsDir, `${stem}.sheet.png`),
    cache,
    vite: path.join(cache, "vite"),
    buildWork: path.join(cache, "build"),
    state: path.join(paths.render, "state"),
  };
}
