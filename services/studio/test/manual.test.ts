import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assembleManual } from "../src/manual/assemble";
import { STATIC_LINT_NAMES } from "../src/manual/lints";
import { compareLintNames, lintNamesFromApi, parseApi, type ApiEntry } from "../src/manual/listing";
import { generatedOptions, readOptions } from "../src/manual/options";
import { ManualSource } from "../src/manual/source";
import { manualPath } from "../src/paths";
import type { RunResult } from "../src/proc";

/**
 * The manual's assembly, against a fixture of `canvas api --json`: the
 * installed build's output on 2026-09-29, saved to `fixtures/api.json`. No
 * tool runs here; `manual-snippets.test.ts` is the half that does.
 */

const FIXTURE = path.join(import.meta.dirname, "fixtures", "api.json");

async function fixture(): Promise<Record<string, unknown>[]> {
  return JSON.parse(await readFile(FIXTURE, "utf8")) as Record<string, unknown>[];
}

async function entries(edit: (raw: Record<string, unknown>[]) => void = () => undefined): Promise<ApiEntry[]> {
  const raw = await fixture();
  edit(raw);
  const parsed = parseApi(raw);
  if (parsed === null) throw new Error("the fixture did not parse");
  return parsed;
}

/** `getLints`' summary, with one rule renamed: what a tldrawkc rename would look like. */
function renameRule(raw: Record<string, unknown>[], from: string, to: string): void {
  const entry = raw.find((item) => item.name === "getLints");
  if (entry === undefined) throw new Error("no getLints in the fixture");
  entry.summary = String(entry.summary).replace(`\`${from}\``, `\`${to}\``);
}

function result(stdout: string, code = 0): RunResult {
  let json: unknown = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  return { code, signal: null, stdout, stderr: code === 0 ? "" : "tldrawkc: dist/api.json is missing", json, timedOut: false };
}

describe("the lint rule names", () => {
  it("are read out of the getLints summary, all nine, and agree with the static table", async () => {
    const names = lintNamesFromApi(await entries());
    expect(names).toHaveLength(9);
    expect(new Set(names)).toEqual(new Set(STATIC_LINT_NAMES));
    expect(compareLintNames(names ?? [], STATIC_LINT_NAMES)).toEqual({ unknown: [], missing: [] });
  });

  it("are null, not empty, when the tool's list cannot be read", async () => {
    expect(lintNamesFromApi(await entries((raw) => raw.splice(raw.findIndex((item) => item.name === "getLints"), 1)))).toBeNull();
    expect(lintNamesFromApi(await entries((raw) => renameRule(raw, "friendless-arrow", "Friendless")))).not.toContain("Friendless");
  });

  it("win over the static table: a new rule is named with no fix, a gone one is left out (M2)", async () => {
    const manual = assembleManual(await entries((raw) => renameRule(raw, "off-page", "far-away")));
    expect(manual.lints).toEqual({ unknown: ["far-away"], missing: ["off-page"] });
    expect(manual.text).toContain("- `far-away`: No fix recorded");
    expect(manual.text).not.toContain("`off-page`");
  });
});

describe("the assembled manual", () => {
  it("carries every section in the design's order", async () => {
    const manual = assembleManual(await entries());
    const headings = [...manual.text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual([
      "The commands you have",
      "Exit codes",
      "The loop",
      "Coordinates and sizes",
      "What is in scope in a snippet",
      "The helpers",
      "Options",
      "The lint rules",
      "Three worked snippets",
      "Never",
    ]);
  });

  it("lists all 22 helpers with a line to copy, and all three snippets as code", async () => {
    const manual = assembleManual(await entries());
    expect(manual.helpers).toBe(22);
    for (const name of ["box", "connect", "boxShapes", "alignContainers", "line", "stub", "getLints"]) {
      expect(manual.text).toContain(`- \`${name}(`);
    }
    expect(manual.text.match(/```js/g)).toHaveLength(3);
    expect(manual.text).toContain("helpers.alignContainers(['panel-tcp', 'panel-udp'])");
  });

  it("names both warnings as warnings", async () => {
    const manual = assembleManual(await entries());
    expect(manual.text).toContain("`missing-glyph` and `missing-topic` are warnings");
    expect(manual.text).toContain("- `missing-topic` (warning)");
  });

  it("is hashed by its text", async () => {
    const manual = assembleManual(await entries());
    expect(manual.hash).toBe(createHash("sha256").update(manual.text).digest("hex"));
    expect(assembleManual(await entries()).hash).toBe(manual.hash);
  });
});

describe("the options section", () => {
  it("falls back to the static text when no helper carries options, which is today's build", async () => {
    const manual = assembleManual(await entries());
    expect(manual.optionsSource).toBe("static");
    expect(manual.text).toContain("**`boxShapes(keys, opts)`**");
    expect(manual.text).toContain("`matchSize: key`");
    // The style values are shared, and the placeholder never leaks.
    expect(manual.text).toContain("`lined-fill`");
    expect(manual.text).not.toContain("{{STYLE_VALUES}}");
  });

  it("is generated from api.json once a helper carries options as a list", async () => {
    const manual = assembleManual(
      await entries((raw) => {
        const box = raw.find((item) => item.name === "box");
        if (box === undefined) throw new Error("no box");
        box.options = [
          { name: "w", type: "number", default: 180, summary: "Width." },
          { name: "geo", type: "GeoKind", default: "rectangle", description: "The outline." },
        ];
      }),
    );
    expect(manual.optionsSource).toBe("generated");
    expect(manual.text).toContain("- **`box`**");
    expect(manual.text).toContain("  - `w` (`number`, default `180`): Width.");
    expect(manual.text).toContain("  - `geo` (`GeoKind`, default `rectangle`): The outline.");
    expect(manual.text).not.toContain("**`boxShapes(keys, opts)`**");
  });

  it("reads options keyed by name as well, and ignores a shape it does not know", async () => {
    const [box] = await entries();
    if (box === undefined) throw new Error("empty fixture");
    expect(readOptions({ ...box, raw: { options: { gap: { type: "number", default: 120 }, label: "Arrow label." } } })).toEqual([
      { name: "gap", type: "number", default: "120", summary: null },
      { name: "label", type: null, default: null, summary: "Arrow label." },
    ]);
    expect(readOptions({ ...box, raw: { options: "BoxOptions" } })).toBeNull();
    expect(readOptions({ ...box, raw: { options: [] } })).toBeNull();
    expect(generatedOptions([{ ...box, raw: {} }])).toBeNull();
  });
});

describe("ManualSource", () => {
  let home: string;
  let output: string;
  let code: number;
  let calls: number;
  let logged: string[];
  let source: ManualSource;

  beforeEach(async () => {
    home = path.join(tmpdir(), `studio-manual-${Date.now()}-${Math.random()}`);
    process.env.STUDIO_HOME = home;
    output = await readFile(FIXTURE, "utf8");
    code = 0;
    calls = 0;
    logged = [];
    source = new ManualSource({
      api: async () => {
        calls += 1;
        return result(output, code);
      },
      log: (line) => logged.push(line),
    });
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
    delete process.env.STUDIO_HOME;
  });

  it("writes the manual to $STUDIO_HOME/manual/<hash>.md, whose hash is its text's", async () => {
    const info = await source.refresh();
    expect(info).not.toBeNull();
    const body = await readFile(manualPath(info?.hash ?? ""), "utf8");
    expect(createHash("sha256").update(body).digest("hex")).toBe(info?.hash);
    expect(info?.chars).toBe(body.length);
    expect(source.status()).toMatchObject({ state: "ok", reasons: [], hash: info?.hash });
  });

  it("rebuilds only when the api output changed", async () => {
    const first = await source.refresh();
    const again = await source.refresh();
    expect(again).toBe(first);
    expect(calls).toBe(2);

    const raw = JSON.parse(output) as Record<string, unknown>[];
    raw.push({ name: "zigzag", kind: "function", path: "x", signature: "zigzag(): void", summary: "New.", examples: ["helpers.zigzag()"], params: [] });
    output = JSON.stringify(raw);
    const rebuilt = await source.refresh();
    expect(rebuilt?.hash).not.toBe(first?.hash);
    // The first file stays: a job that recorded its hash reads it again (M1).
    expect(await readFile(manualPath(first?.hash ?? ""), "utf8")).toContain("# The tldraw manual");
  });

  it("keeps the manual it had when the tool stops answering, and says so", async () => {
    const first = await source.refresh();
    code = 1;
    output = "";
    expect(await source.refresh()).toBe(first);
    expect(source.status().error).toContain("exited 1");
    expect(logged.at(-1)).toContain(`keeping ${first?.hash.slice(0, 12)}`);
  });

  it("is missing when there never was one", async () => {
    code = 1;
    output = "";
    expect(await source.refresh()).toBeNull();
    expect(source.status()).toMatchObject({ state: "missing", hash: null });
  });

  it("reports stale on /api/health's terms, naming the rule, and logs it (M2)", async () => {
    const raw = JSON.parse(output) as Record<string, unknown>[];
    renameRule(raw, "empty-label", "blank-outline");
    output = JSON.stringify(raw);
    await source.refresh();
    const status = source.status();
    expect(status.state).toBe("stale");
    expect(status.reasons).toEqual([
      'the tool names lint rule "blank-outline", which the manual has no fix for',
      'the manual\'s lint rule "empty-label" is no longer named by the tool, and was left out',
    ]);
    expect(logged.filter((line) => line.startsWith("manual stale:"))).toHaveLength(2);
  });

  it("shares one api call between two refreshes in flight", async () => {
    const [a, b] = await Promise.all([source.refresh(), source.refresh()]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });
});
