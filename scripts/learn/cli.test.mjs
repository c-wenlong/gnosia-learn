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

describe("propagation", () => {
  /** Diamond: `top` reaches `base` by two routes, through `left` and `right`. */
  function diamond(dir) {
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Base"]);
    run(dir, ["concept", "add", "--title", "Left", "--requires", "base"]);
    run(dir, ["concept", "add", "--title", "Right", "--requires", "base"]);
    run(dir, ["concept", "add", "--title", "Top", "--requires", "left,right"]);
  }

  it("credits a shared prerequisite once, not once per route", () => {
    const dir = sandbox();
    diamond(dir);
    run(dir, ["observe", "--concept", "top", "--correct", "true", "--source", "probe"]);

    const base = mastery(dir, "base").pL;
    const left = mastery(dir, "left").pL;

    // One hop: 0.25 + 0.4·(0.6−0.25) = 0.39. Two hops: 0.25 + 0.16·(0.6−0.25) = 0.306.
    expect(left).toBeCloseTo(0.39, 6);
    expect(base).toBeCloseTo(0.306, 6);

    // Counted once per route, base would have compounded past its sibling.
    expect(base).toBeLessThan(left);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not count propagation as a question the learner was asked", () => {
    const dir = sandbox();
    diamond(dir);
    run(dir, ["observe", "--concept", "top", "--correct", "true", "--source", "probe"]);
    expect(mastery(dir, "top").observations).toBe(1);
    expect(mastery(dir, "base").observations).toBe(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not propagate a wrong answer", () => {
    const dir = sandbox();
    diamond(dir);
    run(dir, ["observe", "--concept", "top", "--correct", "false", "--source", "probe"]);
    expect(mastery(dir, "base")).toBeUndefined();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("rebuilds to exactly the same model", () => {
    const dir = sandbox();
    diamond(dir);
    for (const c of ["true", "true", "false", "true"]) {
      run(dir, ["observe", "--concept", "top", "--correct", c, "--source", "probe"]);
    }
    const before = fs.readFileSync(path.join(dir, "learn", "state", "model.json"), "utf8");
    run(dir, ["model", "--rebuild"]);
    const after = fs.readFileSync(path.join(dir, "learn", "state", "model.json"), "utf8");

    // lastSeen is excluded on purpose: a live observe stamps the wall clock,
    // while a rebuild uses the event's own timestamp. The belief must match.
    const beliefs = (t) =>
      Object.fromEntries(
        Object.entries(JSON.parse(t).concepts).map(([id, c]) => [
          id,
          { pL: c.pL, observations: c.observations, correct: c.correct },
        ]),
      );
    expect(beliefs(after)).toEqual(beliefs(before));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("can be turned off per observation", () => {
    const dir = sandbox();
    diamond(dir);
    run(dir, [
      "observe", "--concept", "top", "--correct", "true",
      "--source", "probe", "--noPropagate",
    ]);
    expect(mastery(dir, "base")).toBeUndefined();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("concept edit and assumes", () => {
  function base(dir) {
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Background"]);
    run(dir, ["concept", "add", "--title", "Foundation"]);
    run(dir, ["concept", "add", "--title", "Goal", "--requires", "foundation"]);
  }

  function frontmatter(dir, id) {
    const raw = fs.readFileSync(
      path.join(dir, "learn", "concepts", `${id}.md`),
      "utf8",
    );
    return raw.slice(0, raw.indexOf("---", 4));
  }

  it("changes an edge without touching the note body", () => {
    const dir = sandbox();
    base(dir);
    const file = path.join(dir, "learn", "concepts", "goal.md");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8") + "\nHand-written prose.\n");

    run(dir, ["concept", "edit", "goal", "--assumes", "background"]);

    expect(fs.readFileSync(file, "utf8")).toContain("Hand-written prose.");
    expect(frontmatter(dir, "goal")).toContain("assumes: [background]");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("clears a list when given an empty value", () => {
    const dir = sandbox();
    base(dir);
    run(dir, ["concept", "edit", "goal", "--requires", ""]);
    expect(frontmatter(dir, "goal")).toContain("requires: []");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses an edit that changes nothing", () => {
    const dir = sandbox();
    base(dir);
    expect(() => run(dir, ["concept", "edit", "goal"])).toThrow();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("background does not gate teaching, a hard prerequisite does", () => {
    const dir = sandbox();
    base(dir);
    run(dir, ["concept", "edit", "goal", "--assumes", "background"]);

    // Nothing answered yet: the hard prerequisite keeps `goal` off the frontier.
    let front = JSON.parse(run(dir, ["frontier", "--json"])).map((f) => f.id);
    expect(front).not.toContain("goal");

    // Master the hard prerequisite only, leaving background untouched.
    for (let i = 0; i < 5; i += 1) {
      run(dir, [
        "observe", "--concept", "foundation", "--correct", "true",
        "--source", "teach", "--noPropagate",
      ]);
    }
    front = JSON.parse(run(dir, ["frontier", "--json"])).map((f) => f.id);
    expect(front).toContain("goal");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("background does not receive propagated evidence", () => {
    const dir = sandbox();
    base(dir);
    run(dir, ["concept", "edit", "goal", "--assumes", "background"]);
    run(dir, ["observe", "--concept", "goal", "--correct", "true", "--source", "probe"]);

    expect(mastery(dir, "foundation").pL).toBeGreaterThan(0.25);
    expect(mastery(dir, "background")).toBeUndefined();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("review scheduling", () => {
  it("schedules a probe answer, so a concept you already knew still comes back", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Widgets"]);
    run(dir, [
      "observe", "--concept", "widgets", "--correct", "true", "--source", "probe",
    ]);

    const reviews = JSON.parse(
      fs.readFileSync(path.join(dir, "learn", "state", "reviews.json"), "utf8"),
    );
    expect(reviews.cards.widgets).toBeDefined();
    expect(reviews.cards.widgets.due).toBeTruthy();

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("can be turned off explicitly", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Widgets"]);
    run(dir, [
      "observe", "--concept", "widgets", "--correct", "true",
      "--source", "probe", "--schedule", "false",
    ]);

    const reviews = JSON.parse(
      fs.readFileSync(path.join(dir, "learn", "state", "reviews.json"), "utf8"),
    );
    expect(reviews.cards.widgets).toBeUndefined();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("session close links both ways", () => {
  it("writes a session link into every concept the session touched", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Widgets"]);
    run(dir, ["session", "start", "--id", "s1", "--topic", "t"]);
    run(dir, [
      "observe", "--concept", "widgets", "--correct", "true",
      "--source", "probe", "--session", "s1",
    ]);
    run(dir, ["session", "close", "--id", "s1"]);

    const note = fs.readFileSync(
      path.join(dir, "learn", "concepts", "widgets.md"), "utf8",
    );
    expect(note).toContain("## Sessions");
    expect(note).toContain("[[s1]]");

    // and the session still names the concept, so the edge exists both ways
    const log = fs.readFileSync(path.join(dir, "learn", "sessions", "s1.md"), "utf8");
    expect(log).toContain("[[widgets]]");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not duplicate the link when a session is closed twice", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Widgets"]);
    run(dir, ["session", "start", "--id", "s1", "--topic", "t"]);
    run(dir, [
      "observe", "--concept", "widgets", "--correct", "true",
      "--source", "probe", "--session", "s1",
    ]);
    run(dir, ["session", "close", "--id", "s1"]);
    run(dir, ["session", "close", "--id", "s1"]);

    const note = fs.readFileSync(
      path.join(dir, "learn", "concepts", "widgets.md"), "utf8",
    );
    expect(note.match(/\[\[s1\]\]/g)).toHaveLength(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("warns when a scheduled concept has no checks to ask", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Widgets"]);
    run(dir, ["session", "start", "--id", "s1", "--topic", "t"]);
    run(dir, [
      "observe", "--concept", "widgets", "--correct", "true",
      "--source", "probe", "--session", "s1",
    ]);

    const out = run(dir, ["session", "close", "--id", "s1"]);
    expect(out).toContain("no checks written");
    expect(out).toContain("widgets");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("domain folders", () => {
  function conceptFile(dir, domain, id) {
    return domain
      ? path.join(dir, "learn", "concepts", domain, `${id}.md`)
      : path.join(dir, "learn", "concepts", `${id}.md`);
  }

  it("files a new concept under its domain", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Softmax", "--domain", "transformers"]);
    expect(fs.existsSync(conceptFile(dir, "transformers", "softmax"))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("keeps the id as the bare slug, with no domain in frontmatter", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Softmax", "--domain", "transformers"]);

    const raw = fs.readFileSync(conceptFile(dir, "transformers", "softmax"), "utf8");
    expect(raw).toContain("id: softmax");
    expect(raw).not.toContain("domain:");

    // The id, not the path, is what edges and wikilinks use.
    const listed = JSON.parse(run(dir, ["concept", "list", "--json"]));
    expect(listed[0].id).toBe("softmax");
    expect(listed[0].domain).toBe("transformers");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("moves the file on --domain and leaves nothing behind", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Softmax"]);
    expect(fs.existsSync(conceptFile(dir, null, "softmax"))).toBe(true);

    run(dir, ["concept", "edit", "softmax", "--domain", "transformers"]);
    expect(fs.existsSync(conceptFile(dir, "transformers", "softmax"))).toBe(true);
    expect(fs.existsSync(conceptFile(dir, null, "softmax"))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("keeps edges working across a move", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Vectors", "--domain", "foundations"]);
    run(dir, [
      "concept", "add", "--title", "Softmax",
      "--domain", "transformers", "--requires", "vectors",
    ]);

    // The prerequisite lives in a different folder; the edge is by id.
    const plan = JSON.parse(run(dir, ["plan", "--goal", "softmax", "--json"]));
    expect(plan.steps.map((s) => s.id)).toEqual(["vectors", "softmax"]);

    run(dir, ["concept", "edit", "vectors", "--domain", "maths"]);
    const after = JSON.parse(run(dir, ["plan", "--goal", "softmax", "--json"]));
    expect(after.steps.map((s) => s.id)).toEqual(["vectors", "softmax"]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("preserves mastery across a move, since the id is the key", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Softmax"]);
    run(dir, ["observe", "--concept", "softmax", "--correct", "true", "--source", "probe"]);
    const before = mastery(dir, "softmax").pL;

    run(dir, ["concept", "edit", "softmax", "--domain", "transformers"]);
    expect(mastery(dir, "softmax").pL).toBe(before);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reports a duplicate id across two folders as an error", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Softmax", "--domain", "transformers"]);

    // Hand-place a clashing basename in another folder.
    const clash = conceptFile(dir, "maths", "softmax");
    fs.mkdirSync(path.dirname(clash), { recursive: true });
    fs.writeFileSync(clash, "---\nid: softmax\ntitle: Other\n---\n");

    const report = JSON.parse(run(dir, ["doctor", "--json"]));
    expect(report.ok).toBe(false);
    expect(report.problems.some((p) => p.kind === "duplicate-id")).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("warns about a concept left at the root", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    run(dir, ["concept", "add", "--title", "Softmax"]);
    const report = JSON.parse(run(dir, ["doctor", "--json"]));
    expect(report.problems.some((p) => p.kind === "unfiled")).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("ignores folders nested more than one level deep", () => {
    const dir = sandbox();
    run(dir, ["init"]);
    const deep = path.join(dir, "learn", "concepts", "a", "b");
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, "buried.md"), "---\nid: buried\n---\n");

    const listed = JSON.parse(run(dir, ["concept", "list", "--json"]));
    expect(listed.map((c) => c.id)).not.toContain("buried");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
