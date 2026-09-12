import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // src/ holds the web app (TypeScript); scripts/ holds the learning
    // pipeline (plain ESM, no build step). Both are covered by `npm test`.
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
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
    },
  },
});
