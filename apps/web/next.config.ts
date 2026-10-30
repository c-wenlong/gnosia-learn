import path from "node:path";

import type { NextConfig } from "next";

import { BASE_HEADERS, PAGE_SOURCE, pageHeaders } from "./src/lib/auth/csp";

/**
 * The repository root, two levels above `apps/web/`.
 *
 * `import.meta.dirname` rather than `__dirname`: this file is ESM, and Next
 * loads it as written.
 */
const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const nextConfig: NextConfig = {
  /**
   * The app is one workspace in a monorepo, and the workspace packages it
   * imports are not inside it.
   *
   * Tracing starts at the directory holding this file, so without this every
   * path outside `apps/web/` (the workspace packages under `packages/` and
   * `services/`) is out of scope and silently dropped from the deployed
   * bundle.
   *
   * There is no `outputFileTracingIncludes` beside it any more: the app used
   * to read `content/**\/*.yaml` and the concept notes from disk at request
   * time, which tracing cannot follow, and since phase 2 of
   * docs/CONTENT-MIGRATION.md it reads every piece of authored content from
   * the database instead. Nothing the app serves is a file in the tree.
   *
   * Neither `@gnosia/content` nor `@gnosia/catalog` needs a
   * `transpilePackages` entry, even though both ship raw TypeScript with no
   * build step: Turbopack transpiles workspace packages on its own. Verified
   * by removing the entry and building.
   */
  outputFileTracingRoot: repoRoot,

  /**
   * Next 16.3 writes an `AGENTS.md` and a `CLAUDE.md` into this directory on
   * every `next dev`, pointing agents at its bundled docs. The repository
   * already carries that notice at the top of the root `AGENTS.md`, which is
   * the single source of truth for agent instructions, and a second pair
   * under `apps/web/` would be loaded on top of it by any session working in
   * this directory. Off, so the tree stays as committed after a dev run.
   */
  agentRules: false,

  /**
   * Today became Home (H2 of docs/proposals/home-page.md). Permanent, so a
   * bookmark or a link in an old note lands on the page that replaced it.
   * `redirects` run before the proxy, so a signed-out visitor is sent on to
   * `/home` first and only then to sign-in.
   */
  async redirects() {
    return [{ source: "/today", destination: "/home", permanent: true }];
  },

  /** No `X-Powered-By: Next.js`: it tells a stranger which exploits to try. */
  poweredByHeader: false,

  /**
   * Security headers (S7-04 of the 2026-10 audit). `src/lib/auth/csp.ts`
   * says what each one allows and why. A later entry that sets the same key
   * wins, so pages get `X-Frame-Options: DENY` over the base `SAMEORIGIN`.
   *
   * The page policy here carries no nonce. The proxy replaces it with one that
   * does on every page it sees; this copy is for the pages its matcher skips.
   */
  async headers() {
    const dev = process.env.NODE_ENV !== "production";
    return [
      { source: "/:path*", headers: [...BASE_HEADERS] },
      { source: PAGE_SOURCE, headers: pageHeaders(dev) },
    ];
  },
};

export default nextConfig;
