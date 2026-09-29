import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { shellWord } from "../src/bash-guard";
import type { ValidBrief } from "../src/brief";
import {
  canvasCommandAllowed,
  canvasPolicy,
  DIAGRAM_GUARD_REFUSAL,
  diagramGuardSource,
  guardPath,
  writeDiagramGuard,
  type CanvasPolicy,
} from "../src/diagram-guard";
import { candidatePath, candidateSvgPath, jobDir, mermaidPath, scratchDir, workPath } from "../src/paths";
import { buildPrompt, buildResumePrompt, buildRetryPrompt, buildRevisePrompt } from "../src/prompt";
import { buildSettings } from "../src/settings";

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
    expect(command).toBe(`/usr/local/bin/node ${guardPath(JOB)}`);
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
});
