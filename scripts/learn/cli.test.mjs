import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "cli.mjs");
const ROOT = path.resolve(path.dirname(CLI), "..", "..");

/**
 * The CLI resolves the knowledge base relative to its own location, so these
 * tests run against a temporary copy of the repo layout rather than the real
 * learn/ directory.
 */
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "learn-cli-"));
  fs.mkdirSync(path.join(dir, "scripts", "learn"), { recursive: true });
  fs.cpSync(path.join(ROOT, "scripts", "learn"), path.join(dir, "scripts", "learn"), {
    recursive: true,
  });
  return dir;
}

function run(dir, args) {
  return execFileSync(
    process.execPath,
    [path.join(dir, "scripts", "learn", "cli.mjs"), ...args],
    { encoding: "utf8" },
  );
}

function mastery(dir, id) {
  const model = JSON.parse(
    fs.readFileSync(path.join(dir, "learn", "state", "model.json"), "utf8"),
  );
  return model.concepts[id];
}

describe("void", () => {
  it("drops a session's evidence from the model but keeps it in the log", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Widgets"]);
    run(dir, ["session", "start", "--id", "s1", "--topic", "t"]);

    for (let i = 0; i < 3; i += 1) {
      run(dir, [
        "observe", "--concept", "widgets", "--correct", "true",
        "--source", "probe", "--session", "s1",
      ]);
    }
    expect(mastery(dir, "widgets").pL).toBeGreaterThan(0.9);

    run(dir, ["void", "--session", "s1", "--reason", "answer was always first"]);
    run(dir, ["model", "--rebuild"]);

    expect(mastery(dir, "widgets")).toBeUndefined();

    // The observations are retained for audit, alongside the void marker.
    const log = fs
      .readFileSync(path.join(dir, "learn", "state", "events.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(log.filter((e) => e.type === "observation")).toHaveLength(3);
    const marker = log.find((e) => e.type === "void");
    expect(marker.session).toBe("s1");
    expect(marker.reason).toBe("answer was always first");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("leaves other sessions untouched", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Widgets"]);
    run(dir, ["concept", "add", "--title", "Gadgets"]);

    run(dir, ["observe", "--concept", "widgets", "--correct", "true", "--source", "probe", "--session", "bad"]);
    run(dir, ["observe", "--concept", "gadgets", "--correct", "true", "--source", "probe", "--session", "good"]);

    run(dir, ["void", "--session", "bad", "--reason", "leading questions"]);
    run(dir, ["model", "--rebuild"]);

    expect(mastery(dir, "widgets")).toBeUndefined();
    expect(mastery(dir, "gadgets").observations).toBe(1);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses to void a session with no observations", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    expect(() => run(dir, ["void", "--session", "nope", "--reason", "x"])).toThrow();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("observe writes the session log", () => {
  it("appends the question and the result as Obsidian callouts", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Divergence"]);
    run(dir, ["session", "start", "--id", "s1", "--topic", "vector calculus"]);

    run(dir, [
      "observe", "--concept", "divergence", "--correct", "true",
      "--source", "probe", "--session", "s1",
      "--question", "What does $\\nabla \\cdot \\mathbf{F}$ measure?",
      "--options", "Rate of change along itself|Circulation per unit area|Net flux through any closed surface|Net outward flux per unit volume",
      "--chosen", "4. Net outward flux per unit volume",
      "--answer", "4",
      "--note", "it is a density, so per unit volume",
      "--explain", "Circulation per unit area is curl, not divergence.",
    ]);

    const log = fs.readFileSync(path.join(dir, "learn", "sessions", "s1.md"), "utf8");
    expect(log).toContain("> [!question] Quiz");
    expect(log).toContain("> 4. Net outward flux per unit volume");
    expect(log).toContain("> [!success] Correct");
    expect(log).toContain("**In your words:** it is a density");
    // LaTeX must survive untouched for Obsidian to render it.
    expect(log).toContain("$\\nabla \\cdot \\mathbf{F}$");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("marks a wrong answer as a failure callout", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Curl"]);
    run(dir, ["session", "start", "--id", "s1", "--topic", "t"]);

    run(dir, [
      "observe", "--concept", "curl", "--correct", "false",
      "--source", "probe", "--session", "s1",
      "--question", "What does curl measure?",
      "--options", "a|b",
      "--chosen", "1. a",
    ]);

    const log = fs.readFileSync(path.join(dir, "learn", "sessions", "s1.md"), "utf8");
    expect(log).toContain("> [!failure] Not quite");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not write to the log when no question is supplied", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Curl"]);
    run(dir, ["session", "start", "--id", "s1", "--topic", "t"]);
    const before = fs.readFileSync(path.join(dir, "learn", "sessions", "s1.md"), "utf8");

    run(dir, ["observe", "--concept", "curl", "--correct", "true", "--session", "s1"]);

    const after = fs.readFileSync(path.join(dir, "learn", "sessions", "s1.md"), "utf8");
    expect(after).toBe(before);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
