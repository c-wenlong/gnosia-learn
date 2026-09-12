import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // src/ holds the web app (TypeScript); scripts/ holds the learning
    // pipeline (plain ESM, no build step). Both are covered by `npm test`.
    include: [
      "src/**/*.test.ts",
      "scripts/**/*.test.mjs",
      "services/**/*.test.ts",
      "packages/**/*.test.ts",
    ],
    // services/catalog's tests create and drop a scratch database and apply
    // every migration to it. That is slower than the in-process suites, and on
    // a cold Postgres the first connection can take a while.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      // The scope is deliberate. src/app and src/components are view code and
      // are untested on purpose, so leaving them out keeps the number honest:
      // it measures the logic that is meant to be tested, not the whole tree.
      // vitest 4 dropped coverage.all, so a file not matched here does not
      // show up at all. That is what we want.
      include: ["src/lib/**", "src/data/**", "scripts/learn/**"],
      // cli.mjs is the process entrypoint. cli.test.mjs exercises it by
      // spawning `node cli.mjs ...` with execFileSync, and v8 coverage only
      // sees the test runner's own process, so the file would read as 0%
      // no matter how well tested it is. The lib/ modules stay in scope:
      // they can and should be unit-tested in-process, so a 0% there is a
      // real gap, not a measurement artifact.
      exclude: ["**/*.test.*", "**/*.d.ts", "scripts/learn/cli.mjs"],
      // A backstop against regressions, not a target. Each floor sits a few
      // points under what the suite measures today, so a run goes red when
      // coverage drops rather than every time it fails to climb. Raise these
      // when the real number moves up.
      // services/ and packages/ are deliberately absent. The catalog service is
      // covered by tests that need a real Postgres, so its number would swing
      // between a laptop with the database up and one without, and a coverage
      // floor that moves with the environment is not a floor. The schema
      // package is declarations, with nothing to execute.
      // Measured 2026-09-12: statements 58, branches 54, functions 51, lines 60.
      thresholds: {
        statements: 55,
        branches: 50,
        functions: 45,
        lines: 55,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `src/data/courses` and `src/data/content` import "server-only" so a
      // client component that reaches them fails the Next build. Next resolves
      // that specifier itself; vitest does not, and the npm package's default
      // entry throws on import by design. Point it at the package's own
      // react-server build, which is the empty module Next would have used.
      "server-only": path.resolve(__dirname, "./node_modules/server-only/empty.js"),
    },
  },
});
