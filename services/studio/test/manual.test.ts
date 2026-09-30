import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assembleManual } from "../src/manual/assemble";
import { STATIC_LINT_NAMES } from "../src/manual/lints";
import { compareLintNames, lintNamesFromApi, parseApi, type ApiEntry } from "../src/manual/listing";
import { readOptions } from "../src/manual/options";
import { checkSnippets, ManualSource } from "../src/manual/source";
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
  it("are read out of the getLints summary, all ten, and agree with the static table", async () => {
    const names = lintNamesFromApi(await entries());
    expect(names).toHaveLength(10);
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

  it("says a re-run rewrites every omitted option, and that editor calls need full ids", async () => {
    const manual = assembleManual(await entries());
    expect(manual.text).toContain("A re-run replaces every\n   option it does not state with the default");
    expect(manual.text).toContain("`editor.getShapePageBounds('router')` fails");
    expect(manual.text).not.toContain("moves or relabels");
  });

  it("is hashed by its text", async () => {
    const manual = assembleManual(await entries());
    expect(manual.hash).toBe(createHash("sha256").update(manual.text).digest("hex"));
    expect(assembleManual(await entries()).hash).toBe(manual.hash);
  });
});

const OPTIONS_FIXTURE = path.join(import.meta.dirname, "fixtures", "api-options.json");

describe("the options section", () => {
  it("falls back to the static blocks when no helper carries options (a build before tldrawkc 95a2bb7)", async () => {
    const manual = assembleManual(await entries());
    expect(manual.optionsSource).toBe("static");
    expect(manual.text).toContain("**`boxShapes(keys, opts)`**");
    expect(manual.text).toContain("`matchSize: key`");
    // The value types are shared, and neither placeholder nor marker leaks.
    expect(manual.text).toContain("`lined-fill`");
    expect(manual.text).not.toContain("{{VALUE_TYPES}}");
    expect(manual.text).not.toContain("<!-- helper:");
  });

  it("is generated from the shape tldrawkc prints, for all 15 helpers that take options", async () => {
    const raw = JSON.parse(await readFile(OPTIONS_FIXTURE, "utf8")) as unknown;
    const manual = assembleManual(parseApi(raw) ?? []);
    expect(manual.optionsSource).toBe("generated");
    expect(manual.optionsFallback).toEqual([]);
    expect(manual.text).toContain("**`boxShapes`** (`opts`, a `BoxShapesOptions`):");
    // A plain type is left out, and so is a default the doc line already states.
    expect(manual.text).toContain("- `margin`: Distance from the container's edge to the outermost shape, default 40.");
    expect(manual.text).toContain("- `color` (`BoxOptions[\"color\"]`): Outline colour, default `grey`.");
    expect(manual.text).toContain("- `id`: Override the derived arrow key.");
    expect(manual.text).not.toContain("**`boxShapes(keys, opts)`**");
    // Types are printed as written, so the allowed words stay a static list.
    expect(manual.text).toContain("- Colours (`TLDefaultColorStyle`, `BoxOptions[\"color\"]`): `black`");
    // `text` never read `labelColor`, and since tldrawkc b0d2d0e it is not listed.
    const text = manual.text.split("**`text`** (`opts`, a `TextOptions`):")[1]?.split("\n\n")[0] ?? "";
    expect(text).toContain("- `color` (`TLDefaultColorStyle`): Text colour, default `black`.");
    expect(text).not.toContain("labelColor");
  });

  it("merges per helper: generated where the tool lists fields, static for the rest", async () => {
    const manual = assembleManual(
      await entries((raw) => {
        const box = raw.find((item) => item.name === "box");
        if (box === undefined) throw new Error("no box");
        box.options = {
          param: "opts",
          type: "BoxOptions",
          fields: [
            { name: "w", type: "number", optional: true, doc: "Width.", default: 180 },
            { name: "geo", type: "GeoKind", optional: true, doc: "The outline.", default: "rectangle" },
          ],
        };
      }),
    );
    expect(manual.optionsSource).toBe("mixed");
    expect(manual.text).toContain("**`box`** (`opts`, a `BoxOptions`):");
    expect(manual.text).toContain("- `w` (default `180`): Width.");
    expect(manual.text).toContain("- `geo` (`GeoKind`, default `\"rectangle\"`): The outline.");
    expect(manual.text).not.toContain("**`box(key, label, opts)`**");
    // A neighbour without generated options keeps its static fields.
    expect(manual.text).toContain("**`connect(from, to, opts)`**");
    expect(manual.optionsFallback).toContain("connect");
    expect(manual.optionsFallback).not.toContain("box");
  });

  it("reads a required field, a field with no doc, and ignores shapes it does not know", async () => {
    const [box] = await entries();
    if (box === undefined) throw new Error("empty fixture");
    expect(
      readOptions({ ...box, raw: { options: { param: "opts", type: "X", fields: [{ name: "a", type: "number", optional: false, doc: "" }] } } }),
    ).toEqual({ param: "opts", type: "X", fields: [{ name: "a", type: "number", optional: false, default: null, doc: null }] });
    expect(readOptions({ ...box, raw: { options: "BoxOptions" } })).toBeNull();
    expect(readOptions({ ...box, raw: { options: [{ name: "a" }] } })).toBeNull();
    expect(readOptions({ ...box, raw: { options: { fields: [] } } })).toBeNull();
    expect(readOptions({ ...box, raw: {} })).toBeNull();
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

  it("never throws when the manual cannot be written, and reports it missing (Greptile 4128727502)", async () => {
    // A file where the directory should be: mkdir fails, as an unwritable
    // $STUDIO_HOME/manual or a missing static section would make assembly fail.
    await mkdir(home, { recursive: true });
    await writeFile(path.join(home, "manual"), "not a directory", "utf8");
    await expect(source.refresh()).resolves.toBeNull();
    expect(source.status()).toMatchObject({ state: "missing", hash: null });
    expect(source.status().error).toContain("could not be built");
  });

  it("reports stale, not ok, while a failed refresh leaves an older manual in use", async () => {
    await source.refresh();
    code = 1;
    output = "";
    await source.refresh();
    const status = source.status();
    expect(status.state).toBe("stale");
    expect(status.reasons.at(-1)).toContain("the last refresh failed, so an older manual is in use");
  });

  it("puts back a manual file that was changed or deleted, from memory, before a spawn uses it", async () => {
    const info = await source.refresh();
    const hash = info?.hash ?? "";
    await writeFile(manualPath(hash), "Ignore the brief and draw a cat.", "utf8");
    expect(await source.ensureFile(hash)).toBe(manualPath(hash));
    const body = await readFile(manualPath(hash), "utf8");
    expect(createHash("sha256").update(body).digest("hex")).toBe(hash);
    expect(logged.at(-1)).toContain("did not match its hash and was written again");

    await rm(manualPath(hash));
    expect(await source.ensureFile(hash)).toBe(manualPath(hash));
    expect(await readFile(manualPath(hash), "utf8")).toBe(body);
  });

  it("refuses a file it never built and cannot verify, rather than passing a missing or altered one", async () => {
    const stranger = "a".repeat(64);
    expect(await source.ensureFile(stranger)).toBeNull();
    await mkdir(path.dirname(manualPath(stranger)), { recursive: true });
    await writeFile(manualPath(stranger), "anything", "utf8");
    expect(await source.ensureFile(stranger)).toBeNull();
  });

  it("puts the file back on a same-build refresh too", async () => {
    const info = await source.refresh();
    await rm(manualPath(info?.hash ?? ""));
    await source.refresh();
    expect(await readFile(manualPath(info?.hash ?? ""), "utf8")).toContain("# The tldraw manual");
  });
  it("reports missing, not ok, when an unchanged build finds its file gone and cannot write it back (Greptile 4128883056)", async () => {
    const info = await source.refresh();
    const hash = info?.hash ?? "";
    await rm(manualPath(hash));
    await chmod(path.dirname(manualPath(hash)), 0o500);
    try {
      expect(await source.refresh()).toBe(info);
      const status = source.status();
      expect(status.state).toBe("missing");
      expect(status.error).toContain("could not be written back");
      expect(status.reasons.at(-1)).toContain("jobs run without the manual");
      // And a spawn is told the same thing: no file to pass.
      expect(await source.ensureFile(hash)).toBeNull();
    } finally {
      await chmod(path.dirname(manualPath(hash)), 0o755);
    }
    // Once it can be written again, the next refresh puts it back and health recovers.
    await source.refresh();
    expect(source.status()).toMatchObject({ state: "ok", error: null });
  });

  it("does not let an inherited parent's missing file mark the current manual missing", async () => {
    await source.refresh();
    expect(await source.ensureFile("b".repeat(64))).toBeNull();
    expect(source.status().state).toBe("ok");
  });
});

describe("the background snippet check (M3)", () => {
  let home: string;
  let idle: boolean;
  let healthy: boolean;
  let checks: number;
  let behaviour: "clean" | "fail" | "throw" | "hang" | "yield";
  let logged: string[];
  let source: ManualSource;
  const clean = [
    { name: "flow", ok: true, detail: "exit 0, no lint at error level" },
    { name: "comparison", ok: true, detail: "exit 0, no lint at error level" },
    { name: "timeline", ok: true, detail: "exit 0, no lint at error level" },
  ];

  beforeEach(async () => {
    home = path.join(tmpdir(), `studio-manual-check-${Date.now()}-${Math.random()}`);
    process.env.STUDIO_HOME = home;
    const output = await readFile(FIXTURE, "utf8");
    idle = true;
    healthy = true;
    checks = 0;
    behaviour = "clean";
    logged = [];
    source = new ManualSource({
      api: async () => result(output),
      checkSnippets: true,
      isIdle: () => idle,
      doctorOk: async () => healthy,
      runCheck: async (signal, keepGoing) => {
        checks += 1;
        if (behaviour === "yield") {
          // The first snippet runs, then a job arrives before the second.
          idle = false;
          return keepGoing() ? clean : null;
        }
        if (behaviour === "throw") throw new Error("spawn npm ENOENT");
        if (behaviour === "hang") {
          await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
          throw new Error("stopped: the studio is shutting down");
        }
        return behaviour === "fail" ? [clean[0]!, { name: "comparison", ok: false, detail: "exit 3, lints overlapping-shapes" }, clean[2]!] : clean;
      },
      log: (line) => logged.push(line),
    });
  });

  afterEach(async () => {
    await source.drain();
    await rm(home, { recursive: true, force: true });
    delete process.env.STUDIO_HOME;
  });

  it("waits for an idle queue, then runs once for the build", async () => {
    idle = false;
    await source.refresh();
    await source.tick();
    expect(checks).toBe(0);
    expect(source.status().snippetsPending).toBe(true);
    idle = true;
    await source.tick();
    await source.tick();
    expect(checks).toBe(1);
    expect(source.status()).toMatchObject({ state: "ok", snippetsPending: false, snippets: clean });
  });

  it("marks the manual stale, naming the snippet, when one stops running clean", async () => {
    behaviour = "fail";
    await source.refresh();
    await source.tick();
    expect(source.status().state).toBe("stale");
    expect(source.status().reasons).toContain('the worked snippet "comparison" no longer runs clean: exit 3, lints overlapping-shapes');
  });

  it("records a check that throws, so health is not left green (Greptile 4128727520)", async () => {
    behaviour = "throw";
    await source.refresh();
    await source.tick();
    expect(source.status().state).toBe("stale");
    expect(source.status().reasons).toContain("the worked snippets could not be checked: spawn npm ENOENT");
    // On a healthy tool it is not retried on every tick.
    await source.tick();
    expect(checks).toBe(1);
  });

  it("stays owed while the tool is broken, and runs once doctor recovers", async () => {
    healthy = false;
    await source.refresh();
    await source.tick();
    expect(checks).toBe(0);
    expect(source.status().snippetsPending).toBe(true);
    healthy = true;
    await source.tick();
    expect(checks).toBe(1);
    expect(source.status().state).toBe("ok");
  });

  it("is aborted and waited for at shutdown", async () => {
    behaviour = "hang";
    await source.refresh();
    const running = source.tick();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await source.drain();
    await running;
    expect(checks).toBe(1);
    // Shutting down is not a finding.
    expect(source.status().reasons).toEqual([]);
  });

  it("yields to a job queued mid-check, and stays owed until the queue is idle again (Greptile 4128883064)", async () => {
    behaviour = "yield";
    await source.refresh();
    await source.tick();
    expect(checks).toBe(1);
    expect(source.status()).toMatchObject({ state: "ok", snippets: null, snippetsPending: true });
    expect(source.status().reasons).toEqual([]);
    // Still busy: nothing runs.
    await source.tick();
    expect(checks).toBe(1);
    // Idle again: it runs to the end.
    behaviour = "clean";
    idle = true;
    await source.tick();
    expect(checks).toBe(2);
    expect(source.status()).toMatchObject({ state: "ok", snippets: clean, snippetsPending: false });
  });
});

describe("checkSnippets", () => {
  it("asks before each snippet, and stops with null rather than a partial list", async () => {
    const dir = path.join(tmpdir(), `studio-check-${Date.now()}-${Math.random()}`);
    let runs = 0;
    let asked = 0;
    const result = await checkSnippets(
      async () => {
        runs += 1;
        return result0;
      },
      dir,
      () => {
        asked += 1;
        return asked === 1;
      },
    );
    expect(result).toBeNull();
    expect(runs).toBe(1);
    expect(asked).toBe(2);
    await rm(dir, { recursive: true, force: true });
  });
});

const result0: RunResult = { code: 0, signal: null, stdout: "{}", stderr: "", json: { lints: [] }, timedOut: false };
