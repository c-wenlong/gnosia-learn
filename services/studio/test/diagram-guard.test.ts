import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { shellWord } from "../src/agent/bash-guard";
import type { ValidBrief } from "../src/diagram/brief";
import {
  canvasCommandAllowed,
  canvasTokens,
  diagramPathProblem,
  canvasPolicy,
  DIAGRAM_GUARD_REFUSAL,
  diagramGuardSource,
  guardPath,
  writeDiagramGuard,
  type CanvasPolicy,
} from "../src/diagram/diagram-guard";
import { candidatePath, candidateSvgPath, jobDir, mermaidPath, scratchDir, workPath } from "../src/paths";
import { buildPrompt, buildResumePrompt, buildRetryPrompt, buildRevisePrompt } from "../src/diagram/prompt";
import { buildSettings } from "../src/diagram/settings";

/**
 * The diagram agent's Bash guard. The hostile forms are the ones the review of
 * #201 named and the two this agent was measured to run without the hook (a
 * pipe into a read-only command, and an output path outside the workspace);
 * the legitimate ones are every command shape the prompt and the manual
 * teach, since a guard that refuses the agent's own work fails every job.
 */

const home = mkdtempSync(path.join(tmpdir(), "studio-dguard-"));
process.env.STUDIO_HOME = home;
afterAll(() => {
  delete process.env.STUDIO_HOME;
  rmSync(home, { recursive: true, force: true });
});

const JOB = "0f0f0f0f-aaaa-4bbb-8ccc-123456789abc";
const SLUG = "binary-search";
mkdirSync(scratchDir(JOB), { recursive: true });
mkdirSync(path.dirname(candidatePath(JOB, SLUG)), { recursive: true });

const policy = canvasPolicy(JOB, SLUG);
const C = candidatePath(JOB, SLUG);
const V = candidateSvgPath(JOB, SLUG);
const X = scratchDir(JOB);
const NPM = "npm run --silent canvas --";
const SECRET = "/Users/someone/.aws/credentials";

const allowed = [
  `${NPM} api`,
  `${NPM} doctor --json`,
  `${NPM} new ${C} --title "Binary search" --topic algorithms --concept binary-search --concept sorted-arrays`,
  `${NPM} new ${C} --title 'Binary search, halving' --topic algorithms`,
  // Single quotes take every character literally in both shells (Greptile on #206).
  `${NPM} new ${C} --title 'Save $50' --topic algorithms`,
  `${NPM} meta set ${C} --title 'Costs $(not run) and \`not run\` and a \\ backslash, "quoted"'`,
  `${NPM} run ${C} --eval 'return "$" + helpers.getLints().length' --json`,
  `${NPM} new ${C} --title "Dijkstra's algorithm"`,
  `${NPM} run ${C} --code ${X}/pass1.js --shot ${X}/pass1.png`,
  `${NPM} run ${C} --code ${X}/pass2.js --shot ${X}/pass2.png --json --timeout 60000`,
  `${NPM} run ${C} --eval "return helpers.getLints()" --json`,
  `${NPM} run ${C} --eval "helpers.translate(['a', 'b'], 40, 0); return helpers.getLints()"`,
  `${NPM} shot ${C} -o ${X}/look.png`,
  `${NPM} shot ${C} --output ${X}/look.png --page 'Page 1'`,
  `${NPM} inspect ${C} --json`,
  `${NPM} inspect ${C}`,
  `${NPM} export ${C} --svg ${V}`,
  `${NPM} export ${C} --svg ${V} --png ${X}/export.png --padding 32 --pixel-ratio 2`,
  `${NPM} verify ${V} -o ${X}/verify.png`,
  `${NPM} verify ${V} -o ${X}/verify.png --width 1500 --json`,
  `${NPM} from-mermaid ${C} --source ${mermaidPath(JOB)}`,
  `${NPM} from-mermaid ${C} --source ${mermaidPath(JOB)} --append --shot ${X}/mermaid.png`,
  `${NPM} meta set ${C} --title "Binary search" --topic algorithms --concept binary-search`,
  `${NPM} inspect ${X}/experiment.tldr --json`,
  `${NPM} inspect ${X}/./sub//experiment.tldr`,
  `  ${NPM} inspect ${C} --json  `,
  `${NPM}  inspect  ${C}  --json`,
];

const refused = [
  // The #201 forms, on this agent's prefix.
  `${NPM} inspect ${C} --json | base64`,
  `${NPM} inspect ${C} --json | grep -r FAKE ${home}/work`,
  `${NPM} new ${X}/p1.tldr --title "$(grep FAKE ${SECRET})"`,
  `${NPM} new ${X}/p1.tldr --title "$(/bin/cat ${SECRET})"`,
  `${NPM} new ${X}/p1.tldr --title "\`grep FAKE ${SECRET}\`"`,
  `${NPM} new ${X}/p1.tldr --title \`grep FAKE ${SECRET}\``,
  `${NPM} new ${X}/p1.tldr --title $(cat ${SECRET})`,
  `${NPM} run ${C} --code <(grep FAKE ${SECRET})`,
  `${NPM} run ${C} --code ${X}/a.js >(tee /tmp/x)`,
  `${NPM} inspect ${C} --json ; grep FAKE ${SECRET}`,
  `${NPM} inspect ${C} --json;grep FAKE ${SECRET}`,
  `${NPM} inspect ${C} --json && /bin/cat ${SECRET}`,
  `${NPM} inspect ${C} --json || grep FAKE ${SECRET}`,
  `${NPM} inspect ${C} --json\ngrep FAKE ${SECRET}`,
  `${NPM} inspect ${C} --json\r\ngrep FAKE ${SECRET}`,
  `${NPM} inspect ${C} --json > /tmp/out`,
  `${NPM} inspect ${C} --json 2>/tmp/out`,
  `${NPM} run ${C} --code - < ${SECRET}`,
  `${NPM} inspect ${C} --json &`,
  `${NPM} inspect ${C} --json # comment`,
  `${NPM} inspect ${C}\t--json`,
  `${NPM} new ${X}/p1.tldr --title "$HOME"`,
  `${NPM} new ${X}/p1.tldr --title \${HOME}`,
  `${NPM} new ${X}/p1.tldr --title "a\\"b"`,
  `${NPM} new ${X}/p1.tldr --title "Save $50"`,
  `${NPM} new ${X}/p1.tldr --title "a \\ b"`,
  `${NPM} new ${X}/p1.tldr --title 'Bob'"'"'s'`,
  `${NPM} new ${X}/p1.tldr --title 'a''b'`,
  `${NPM} new ${X}/p1.tldr --title 'line\nbreak'`.replace("\\n", "\n"),
  `${NPM} new ${X}/p1.tldr --title $'x'`,
  `${NPM} new ${X}/p1.tldr --title "unterminated`,
  `${NPM} new ${X}/p1.tldr --title "a"b`,
  `${NPM} run ${C} --code ${X}/*.js`,
  `${NPM} run ${C} --code ${X}/{a,b}.js`,
  `${NPM} run ${C} --code ~/x.js`,
  `${NPM} run ${C} --code =ls`,
  // Bare commands and anything before the prefix.
  `/bin/cat ${SECRET}`,
  `grep FAKE ${SECRET}`,
  `base64 ${SECRET}`,
  `cd /tmp && ${NPM} inspect ${C}`,
  `TLDRAWKC_ROOT=/tmp/evil ${NPM} inspect ${C}`,
  `env ${NPM} inspect ${C}`,
  `npm run canvas -- inspect ${C}`,
  `npm run --silent canvas inspect ${C}`,
  `npm run --silent other -- inspect ${C}`,
  `npx tldrawkc inspect ${C}`,
  `${NPM}`,
  // Files outside the job: reads (the clean-room rule, secrets) and writes.
  `${NPM} inspect ${workPath("other-diagram")} --json`,
  `${NPM} inspect ${candidatePath("1f1f1f1f-aaaa-4bbb-8ccc-123456789abc", SLUG)} --json`,
  `${NPM} new ${home}/planted.tldr --title x`,
  `${NPM} new /tmp/planted.tldr --title x`,
  `${NPM} run ${C} --code ${SECRET}`,
  `${NPM} run ${C} --code ${X}/../job.json`,
  `${NPM} run ${C} --code ${X}/../../${JOB}/agent-settings.json`,
  `${NPM} run ${C} --code ${X}`,
  `${NPM} run ${C} --code scratch/pass1.js`,
  `${NPM} run ${C} --code ./pass1.js`,
  `${NPM} export ${C} --svg /tmp/escape.svg`,
  `${NPM} export ${C} --svg ${path.dirname(C)}/other.svg`,
  `${NPM} export ${C} --png ${home}/escape.png`,
  `${NPM} shot ${C} -o /tmp/look.png`,
  `${NPM} verify ${V} -o /tmp/verify.png`,
  `${NPM} new ${C} --from ${workPath("other-diagram")}`,
  `${NPM} from-mermaid ${C} --source ${SECRET}`,
  `${NPM} inspect ${jobDir(JOB)}/job.json`,
  `${NPM} inspect ${guardPath(JOB)}`,
  // Verbs and flags the agent is not given.
  `${NPM} list`,
  `${NPM} list ${home}/work`,
  `${NPM} serve ${C}`,
  `${NPM} help`,
  `${NPM} meta get ${C}`,
  `${NPM} meta ${C}`,
  `${NPM} inspect ${C} --chromium /bin/sh`,
  `${NPM} inspect ${C} --headed`,
  `${NPM} inspect ${C} --json=true`,
  `${NPM} shot ${C} -o${X}/look.png`,
  `${NPM} inspect ${C} --svg ${V}`,
  `${NPM} inspect ${C} -- --chromium /bin/sh`,
  `${NPM} new ${C} --title --chromium`,
  `${NPM} run ${C} --timeout 1e9`,
  `${NPM} run ${C} --timeout`,
  // The wrong number of files.
  `${NPM} inspect`,
  `${NPM} inspect ${C} ${V}`,
  `${NPM} api ${C}`,
  `${NPM} run ${C} -`,
];

describe("the diagram agent's Bash guard", () => {
  it("allows a canvas call on the job's own files, and nothing else", () => {
    for (const command of allowed) expect({ command, ok: canvasCommandAllowed(command, policy) }).toEqual({ command, ok: true });
    for (const command of refused) expect({ command, ok: canvasCommandAllowed(command, policy) }).toEqual({ command, ok: false });
  });

  it("refuses everything when it is handed something that is not a command or a policy", () => {
    expect(canvasCommandAllowed(undefined, policy)).toBe(false);
    expect(canvasCommandAllowed(42, policy)).toBe(false);
    expect(canvasCommandAllowed(`${NPM} inspect ${C}`, null as unknown as CanvasPolicy)).toBe(false);
    expect(canvasCommandAllowed(`${NPM} inspect ${C}`, { files: [], dirs: [] })).toBe(false);
  });

  it("allows every canvas call the prompts teach, with their placeholders filled in", () => {
    const brief: ValidBrief = {
      intent: "draw binary search",
      topic: "algorithms",
      slug: SLUG,
      title: "Binary search",
      mode: "new",
      elements: [{ label: "sorted array" }],
      relations: [],
      concepts: ["binary-search"],
      notes: "",
      model: "sonnet",
      idempotencyKey: "test",
    };
    const files = { tldr: C, svg: V, scratch: X };
    const prompts = [
      buildPrompt({ jobId: JOB, brief, hasMermaid: false }),
      buildPrompt({ jobId: JOB, brief, hasMermaid: true }),
      buildPrompt({ jobId: JOB, brief: { ...brief, mode: "extend" }, hasMermaid: true }),
      buildRevisePrompt("make it blue", files),
      buildResumePrompt(files),
      buildRetryPrompt(["a lint"], files),
    ];
    const fill: [RegExp, string][] = [
      [/<title>/g, '"Binary search"'],
      [/<topic>/g, "algorithms"],
      [/<slug>/g, "binary-search"],
      [/<snippet\.js>/g, `${X}/pass1.js`],
      [/<shot\.png>/g, `${X}/pass1.png`],
    ];
    const taught = new Set<string>();
    for (const prompt of prompts) {
      for (const [, span] of prompt.matchAll(/`(npm run --silent canvas -- [^`]*)`/g)) {
        // A bare verb with `...` after it, or a verb alone, is prose about the command, not one.
        if (span === undefined || span.includes("...") || /^npm run --silent canvas -- [a-z-]+$/.test(span) && !span.endsWith(" api")) continue;
        taught.add(fill.reduce((text, [pattern, value]) => text.replace(pattern, value), span));
      }
    }
    expect(taught.size).toBeGreaterThan(6);
    for (const command of taught) expect({ command, ok: canvasCommandAllowed(command, policy) }).toEqual({ command, ok: true });
  });

  it("knows the job's paths in both spellings when STUDIO_HOME sits behind a link", () => {
    const real = realpathSync(home);
    const linked = mkdtempSync(path.join(tmpdir(), "studio-dguard-link-"));
    rmSync(linked, { recursive: true });
    execFileSync("ln", ["-s", real, linked]);
    const saved = process.env.STUDIO_HOME;
    process.env.STUDIO_HOME = linked;
    try {
      const both = canvasPolicy(JOB, SLUG);
      expect(both.files).toContain(path.join(linked, "jobs", JOB, "candidate", `${SLUG}.tldr`));
      expect(both.files).toContain(path.join(real, "jobs", JOB, "candidate", `${SLUG}.tldr`));
      expect(both.dirs).toEqual([path.join(linked, "jobs", JOB, "scratch"), path.join(real, "jobs", JOB, "scratch")]);
      expect(canvasCommandAllowed(`${NPM} inspect ${path.join(real, "jobs", JOB, "candidate", `${SLUG}.tldr`)}`, both)).toBe(true);
    } finally {
      process.env.STUDIO_HOME = saved;
      rmSync(linked, { force: true });
    }
  });

  it("runs as the hook the CLI calls: exit 2 with a fixed sentence to refuse, and closed on anything it cannot read", () => {
    const file = path.join(home, "hook-under-test.cjs");
    writeFileSync(file, diagramGuardSource(policy), "utf8");
    const call = (stdin: string): { code: number; stderr: string } => {
      try {
        execFileSync(process.execPath, [file], { input: stdin, stdio: ["pipe", "pipe", "pipe"] });
        return { code: 0, stderr: "" };
      } catch (error) {
        const failed = error as { status: number; stderr: Buffer };
        return { code: failed.status, stderr: failed.stderr.toString() };
      }
    };
    const bash = (command: string): string => JSON.stringify({ session_id: "s", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
    for (const command of allowed) expect({ command, ...call(bash(command)) }).toEqual({ command, code: 0, stderr: "" });
    for (const command of refused) {
      const result = call(bash(command));
      expect({ command, code: result.code }).toEqual({ command, code: 2 });
      expect(result.stderr).toBe(`${DIAGRAM_GUARD_REFUSAL}\n`);
    }
    expect(call("not json").code).toBe(2);
    expect(call("").code).toBe(2);
    expect(call(JSON.stringify({ tool_name: "Bash", tool_input: {} })).code).toBe(2);
    expect(call(JSON.stringify({ tool_name: "Bash" })).code).toBe(2);
    expect(call(JSON.stringify({ tool_name: "Read", tool_input: { file_path: "/x" } })).code).toBe(0);
  });

  it("is written read-only into the job's workspace and named in its permission file", async () => {
    const command = await writeDiagramGuard(JOB, SLUG, "/usr/local/bin/node");
    // `|| exit 2`: the CLI blocks only on exit 2, so a hook that crashes must not fail open.
    expect(command).toBe(`/usr/local/bin/node ${guardPath(JOB)} || exit 2`);
    expect(path.dirname(guardPath(JOB))).toBe(jobDir(JOB));
    expect(statSync(guardPath(JOB)).mode & 0o777).toBe(0o444);
    // Written again for a second attempt, over its own read-only copy.
    await writeDiagramGuard(JOB, SLUG, "/usr/local/bin/node");
    const settings = buildSettings({ jobId: JOB, slug: SLUG, guard: command });
    expect(settings.hooks).toEqual({ PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command }] }] });
    expect(settings.permissions.deny).toContain(`Read(/${guardPath(JOB)})`);
    expect(settings.permissions.deny).toContain(`Edit(/${guardPath(JOB)})`);
  });

  it("quotes a path with a space on the hook's command line, and refuses one it cannot quote", () => {
    expect(shellWord("/usr/local/bin/node")).toBe("/usr/local/bin/node");
    expect(shellWord("/Users/a b/.studio/jobs/x/bash-guard.cjs")).toBe("'/Users/a b/.studio/jobs/x/bash-guard.cjs'");
    expect(() => shellWord("/Users/o'brien/node")).toThrow();
    expect(() => shellWord("/a\nb")).toThrow();
  });

  it("accepts a candidate path with a space when the agent quotes it", () => {
    const spaced: CanvasPolicy = { files: ["/Users/a b/.studio/jobs/j/candidate/x.tldr"], dirs: ["/Users/a b/.studio/jobs/j/scratch"] };
    expect(canvasCommandAllowed(`${NPM} run "/Users/a b/.studio/jobs/j/candidate/x.tldr" --code '/Users/a b/.studio/jobs/j/scratch/p.js'`, spaced)).toBe(true);
    expect(canvasCommandAllowed(`${NPM} run /Users/a b/.studio/jobs/j/candidate/x.tldr`, spaced)).toBe(false);
  });

  it("fails closed when the hook itself cannot run: any non-zero exit on its command line becomes 2", () => {
    const command = `${process.execPath} ${path.join(home, "no-such-dir", "bash-guard.cjs")} || exit 2`;
    const status = (line: string): number => {
      try {
        execFileSync("/bin/sh", ["-c", line], { input: "{}", stdio: ["pipe", "pipe", "pipe"] });
        return 0;
      } catch (error) {
        return (error as { status: number }).status;
      }
    };
    expect(status(command.replace(" || exit 2", ""))).toBe(1);
    expect(status(command)).toBe(2);
    expect(status(`${process.execPath} -e "process.kill(process.pid, 'SIGKILL')" || exit 2`)).toBe(2);
  });

  it("agrees with bash and zsh on the words of every line it reads", () => {
    const shells = [["bash", "--norc", "--noprofile"], ["zsh", "-f"], ["zsh", "-f", "-o", "rcquotes", "-o", "extendedglob"]].filter(([shell]) => {
      try {
        execFileSync("/usr/bin/env", ["which", shell!], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    });
    // A seeded generator, so a failure is the same failure on the next run.
    let seed = 206;
    // mulberry32: a small generator whose low bits are not periodic, unlike a bare LCG's.
    const next = (n: number): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) % n;
    };
    const pick = <T,>(items: readonly T[]): T => items[next(items.length)]!;
    const nasty = ["$", "`", "\\", "'", '"', "!", "*", "?", "~", "#", "%", "^", "&", ";", "|", "<", ">", "(", ")", "{", "}", "[", "]", "=", " ", "\t", "$(", "${", "$'", "a", "Z", "9", ".", "/", ":", ",", "@", "+", "-", "é", "·"];
    const text = (): string => Array.from({ length: 1 + next(8) }, () => pick(nasty)).join("");
    const word = (): string => {
      switch (next(6)) {
        case 0:
          return `'${text()}'`;
        case 5:
          return `'${text()}$${text()}'`;
        case 1:
          return `"${text()}"`;
        case 2:
          return text();
        case 3:
          return pick(["--title", "--json", C, `${X}/p.js`, "'Save $50'", "'$(id)'", "'`id`'", "'a\\b'", '"it\'s"']);
        default:
          return Array.from({ length: 1 + next(6) }, () => pick([..."abcXYZ019_./:,@+=-"])).join("");
      }
    };
    const lines: string[] = [];
    for (let i = 0; lines.length < 400 && i < 200_000; i += 1) {
      const line = `${NPM} ${Array.from({ length: 1 + next(4) }, word).join(pick([" ", "  "]))}`;
      if (canvasTokens(line) !== null) lines.push(line);
    }
    expect(lines.length).toBe(400);
    // Lines holding `$` inside single quotes, which is what this change allows.
    expect(lines.filter((line) => /'[^']*\$[^']*'/.test(line)).length).toBeGreaterThan(40);
    // Each line runs with `npm` as a function printing its arguments, NUL-separated, then a record separator.
    const script = `npm() { printf '%s\\0' "$@"; }\n${lines.map((line) => `${line}\nprintf '\\036'`).join("\n")}\n`;
    const file = path.join(home, "fuzz.sh");
    writeFileSync(file, script, "utf8");
    expect(shells.length).toBeGreaterThan(0);
    for (const [shell, ...flags] of shells) {
      const out = execFileSync("/usr/bin/env", [shell!, ...flags, file], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const records = out.split("\u001e").slice(0, -1);
      expect(records.length).toBe(lines.length);
      records.forEach((record, i) => {
        const words = record.split("\0").slice(0, -1);
        expect({ shell: [shell, ...flags].join(" "), line: lines[i], words }).toEqual({ shell: [shell, ...flags].join(" "), line: lines[i], words: canvasTokens(lines[i]!)!.slice(1) });
      });
    }
  });

  it("names a studio home the agent could not type, and allows letters, digits and spaces", () => {
    expect(diagramPathProblem("/Users/a/Projects/gnosia/.studio", "/usr/bin/node")).toBeNull();
    expect(diagramPathProblem("/Users/a b/.studio", "/usr/bin/node")).toBeNull();
    for (const bad of ["/Users/a$b/.studio", "/Users/a`b/.studio", "/Users/o'brien/.studio", '/Users/a"b/.studio', "/Users/a\\b/.studio", "/Users/a*b/.studio", "/Users/~a/.studio", "/Users/a;b/.studio"]) {
      expect({ bad, problem: diagramPathProblem(bad, "/usr/bin/node") }).toEqual({ bad, problem: expect.stringContaining("the studio home path holds") });
    }
    expect(diagramPathProblem("/Users/a/.studio", "/opt/o'brien/node")).toContain("quote");
  });
});
