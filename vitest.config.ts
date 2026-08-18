import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // src/ holds the web app (TypeScript); scripts/ holds the learning
    // pipeline (plain ESM, no build step). Both are covered by `npm test`.
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
