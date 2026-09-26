import path from "node:path";

import type { NextConfig } from "next";

/**
 * The repository root, two levels above `apps/web/`.
 *
 * `import.meta.dirname` rather than `__dirname`: this file is ESM, and Next
 * loads it as written.
 */
const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const nextConfig: NextConfig = {
  /**
   * The app is one workspace in a monorepo, and the files it reads at runtime
   * are not.
   *
   * Tracing starts at the directory holding this file, so without this every
   * path outside `apps/web/` — `content/`, the workspace packages under
   * `packages/` and `services/` — is out of scope and silently dropped from
   * the deployed bundle.
   */
  outputFileTracingRoot: repoRoot,

  /**
   * Course data is read from `content/` at runtime, not imported.
   *
   * File tracing follows `import` statements, and
   * `readFileSync(path.join(root, …))` is not one, so without this the
   * deployed bundle ships without the course files and every page that reads a
   * course fails in production while the build looks fine.
   *
   * The concept notes are the same case. `/review` reads each due note's check
   * blocks at request time (through the catalog's note asset and
   * `resolveAssetFile`), and a deployment without the files would quietly ask
   * every check card as summary recall instead.
   *
   * The pattern is resolved from this directory, not from the tracing root
   * above, which is why it starts with `../../`.
   *
   * Neither `@self-learn/content` nor `@self-learn/catalog` needs a
   * `transpilePackages` entry, even though both ship raw TypeScript with no
   * build step: Turbopack transpiles workspace packages on its own. Verified
   * by removing the entry and building.
   */
  outputFileTracingIncludes: {
    "/*": ["../../content/**/*.yaml", "../../learn/concepts/**/*.md"],
  },

  /**
   * `pg` reaches the learner state, and it is a Node driver: it resolves its
   * optional native binding (`pg-native`) and its Cloudflare socket shim
   * through runtime `require`s that no bundler can follow. Left external, it
   * is required from `node_modules` the ordinary way and behaves the same on a
   * laptop and on Vercel.
   */
  serverExternalPackages: ["pg"],

  /**
   * Next 16.3 writes an `AGENTS.md` and a `CLAUDE.md` into this directory on
   * every `next dev`, pointing agents at its bundled docs. The repository
   * already carries that notice at the top of the root `AGENTS.md`, which is
   * the single source of truth for agent instructions, and a second pair
   * under `apps/web/` would be loaded on top of it by any session working in
   * this directory. Off, so the tree stays as committed after a dev run.
   */
  agentRules: false,
};

export default nextConfig;
