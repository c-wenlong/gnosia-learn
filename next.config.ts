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
};

export default nextConfig;
