import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import { dataHomeEnvFile, readEnvFile } from "../src/env";

/**
 * The sidecar's environment (S9-02): the web's, in the web's order, so the
 * `AUTH_SECRET` that sealed a saved key on the web opens it here. The loader
 * writes `process.env`, which is why it runs in a child process of its own.
 */

const run = promisify(execFile);
const ENTRY = resolve(__dirname, "../src/env.ts");
const TSX = resolve(__dirname, "../../../node_modules/tsx/dist/esm/index.mjs");

let dirs: string[] = [];
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "sidecar-env-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

/** The keys `loadSidecarEnv` leaves in a child's environment, given its own environment and an app dir. */
async function loaded(env: Record<string, string>, appDir: string, keys: string[]): Promise<Record<string, string>> {
  const script = `
    const { loadSidecarEnv } = await import(${JSON.stringify(ENTRY)});
    await loadSidecarEnv({ appDir: ${JSON.stringify(appDir)} });
    const keys = ${JSON.stringify(keys)};
    process.stdout.write(JSON.stringify(Object.fromEntries(keys.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]))));
  `;
  // Only PATH and HOME from this process: a developer's own AUTH_SECRET must not leak into the case.
  const { stdout } = await run(process.execPath, ["--import", TSX, "--input-type=module", "-e", script], {
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
  });
  return JSON.parse(stdout) as Record<string, string>;
}

describe("the sidecar's environment", () => {
  it("reads the data home's .env, under what the process exports", async () => {
    const home = temp();
    writeFileSync(join(home, ".env"), 'AUTH_SECRET="from-the-data-home"\nSTUDIO_OWNER=home # a comment\n');
    const app = temp();
    const env = await loaded({ GNOSIA_HOME: home, STUDIO_OWNER: "exported" }, app, ["AUTH_SECRET", "STUDIO_OWNER"]);
    expect(env).toEqual({ AUTH_SECRET: "from-the-data-home", STUDIO_OWNER: "exported" });
  });

  it("reads the web app's .env.local under the data home's", async () => {
    const home = temp();
    writeFileSync(join(home, ".env"), "GEMINI_API_KEY=from-home\n");
    const app = temp();
    writeFileSync(join(app, ".env.local"), "AUTH_SECRET=from-the-app\nGEMINI_API_KEY=from-the-app\n");
    const env = await loaded({ GNOSIA_HOME: home }, app, ["AUTH_SECRET", "GEMINI_API_KEY"]);
    expect(env).toEqual({ AUTH_SECRET: "from-the-app", GEMINI_API_KEY: "from-home" });
  });

  it("starts with neither file", async () => {
    const env = await loaded({ GNOSIA_HOME: temp() }, join(temp(), "missing"), ["AUTH_SECRET"]);
    expect(env).toEqual({});
  });

  it("reads the data home's file as the desktop shell does", () => {
    // The same fixture apps/desktop's CheckoutTests holds Checkout.parseDotenv
    // to: the shell hands the web the AUTH_SECRET it reads, and this read
    // must open what that secret sealed.
    const fixture = JSON.parse(readFileSync(resolve(__dirname, "fixtures/dotenv.json"), "utf8")) as {
      text: string;
      expected: Record<string, string>;
    };
    const file = join(temp(), ".env");
    writeFileSync(file, fixture.text);
    expect(readEnvFile(file)).toEqual(fixture.expected);
  });

  it("names the data home's file and reads a dotenv", () => {
    expect(dataHomeEnvFile({ GNOSIA_HOME: "/x/y" })).toBe("/x/y/.env");
    expect(dataHomeEnvFile({})).toMatch(/\.gnosia\/\.env$/);
    expect(readEnvFile("/nonexistent/.env")).toEqual({});
  });
});
