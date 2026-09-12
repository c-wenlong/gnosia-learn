import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Course data is read from `content/` at runtime, not imported.
   *
   * File tracing follows `import` statements, and
   * `readFileSync(path.join(process.cwd(), …))` is not one, so without this the
   * deployed bundle ships without the course files and every page that reads a
   * course fails in production while the build looks fine.
   *
   * Neither `@self-learn/content` nor `@self-learn/catalog` needs a
   * `transpilePackages` entry, even though both ship raw TypeScript with no
   * build step: Turbopack transpiles workspace packages on its own. Verified
   * by removing the entry and building.
   */
  outputFileTracingIncludes: {
    "/*": ["content/**/*.yaml"],
  },

  /**
   * `pg` reaches the learner state, and it is a Node driver: it resolves its
   * optional native binding (`pg-native`) and its Cloudflare socket shim
   * through runtime `require`s that no bundler can follow. Left external, it
   * is required from `node_modules` the ordinary way and behaves the same on a
   * laptop and on Vercel.
   */
  serverExternalPackages: ["pg"],
};

export default nextConfig;
