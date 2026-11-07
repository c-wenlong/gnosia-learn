import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `@next/env` is the loader `next` itself runs, pinned here so the launchers
 * read `.env` files exactly as the web server does. It is published in step
 * with `next`, one version for both, so a bump of `next` in apps/web that
 * leaves this pin behind would load the files by an older rule.
 */

function declared(path: string, name: string): string {
  const manifest = JSON.parse(readFileSync(resolve(__dirname, path), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const version = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
  if (version === undefined) throw new Error(`${path} declares no ${name}`);
  return version;
}

describe("@next/env", () => {
  it("is pinned to the exact version of next that apps/web declares", () => {
    const pinned = declared("../package.json", "@next/env");
    const next = declared("../../../apps/web/package.json", "next");
    expect(pinned, "an exact version, not a range").toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/);
    expect(pinned, "services/launch-env's @next/env must match apps/web's next").toBe(next);
  });
});
