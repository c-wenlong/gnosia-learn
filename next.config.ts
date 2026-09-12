import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Course data is read from `content/` at runtime, not imported.
   *
   * Most routes are prerendered and never look at the files again, but the
   * session page and the two agent routes are server-rendered on demand and
   * call into `@/data/courses` per request. File tracing follows `import`
   * statements, and `readFileSync(path.join(process.cwd(), …))` is not one, so
   * without this the deployed bundle ships without the course files and those
   * three routes fail in production while every build and every preview of a
   * static page looks fine.
   *
   * `@self-learn/content` itself needs no `transpilePackages` entry: Turbopack
   * transpiles workspace packages on its own.
   */
  outputFileTracingIncludes: {
    "/*": ["content/**/*.yaml"],
  },
  /*
   * The two workspaces the app imports ship raw TypeScript with no build step
   * (see the note in packages/schema/package.json), so Next has to compile
   * them rather than treat them as prebuilt dependencies.
   *
   * `@self-learn/schema` is types and constants and would be safe anywhere.
   * `@self-learn/catalog/state` is the learner store, and is imported only by
   * server components and route handlers: it pulls in drizzle and `pg`.
   */
  transpilePackages: ["@self-learn/schema", "@self-learn/catalog"],

  /*
   * `pg` loads its optional native binding (`pg-native`) through a runtime
   * require and picks a driver at runtime. Bundling that produces a build-time
   * resolution error for a module nobody installed, so it stays external and
   * is required from node_modules the ordinary way.
   */
  serverExternalPackages: ["pg"],
};

export default nextConfig;
