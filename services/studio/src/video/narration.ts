import { readFile } from "node:fs/promises";
import path from "node:path";

import { run } from "../proc";

/**
 * What the studio takes from gnosia-audio, manimkc's narration layer as a
 * package of its own (github.com/c-wenlong/gnosia-audio, installed into
 * manimkc's `.venv` by `make narration-deps`).
 *
 * Three things, all through its JSON contract (schema 1, its docs/CLI.md)
 * rather than by importing manimkc's `lib/`:
 *
 * - **The speech rate** (`charsPerSecond`, from its `data/timing.json`), which
 *   predicts a script's length before anything is voiced. The brief's
 *   validator reads it here, and `/api/health` hands it to the web app's card,
 *   so there is one figure and gnosia-audio owns it.
 * - **The pronunciation table's written forms** (the keys of its
 *   `data/spoken.json`), which say which capitalised words the voice already
 *   spells out. The card's abbreviation warning (V11) is built from them.
 * - **The clip keys** (`seed.ts`, `gnosia-audio keys --json`), which run in a
 *   job's render profile and not here.
 *
 * `home --json` is asked once per toolchain discovery, outside any sandbox:
 * it is the runner's own step, reads no agent input and writes nothing, like
 * the `manimkc home --json` beside it in `toolchain.ts`. Its answer is kept in
 * this module so the synchronous validator can read it.
 */

/** The speech rate before gnosia-audio has answered, or on a machine without it (where videos are off anyway). */
export const FALLBACK_CHARS_PER_SECOND = 15.2;

export interface NarrationFacts {
  /** gnosia-audio's package version, for health and logs. */
  version: string;
  /** Characters of written narration per second of speech: the planning figure. */
  charsPerSecond: number;
  /** Seconds before a clip starts, and held after it ends. */
  leadIn: number;
  tail: number;
  /** Every written form the pronunciation table rewrites, case-sensitive. */
  spoken: string[];
  /** Where the two data files are, as `home --json` reported them. */
  data: { spoken: string; timing: string };
}

let current: NarrationFacts | null = null;

/** The facts in force: gnosia-audio's latest answer, or null before one or after a discovery it did not answer. */
export function narrationFacts(): NarrationFacts | null {
  return current;
}

/** Keep an answer, or forget it (tests, and `settleNarrationRead`). */
export function keepNarrationFacts(facts: NarrationFacts | null): void {
  current = facts;
}

let reads = 0;
let settled = 0;

/**
 * Number a read of gnosia-audio as it starts. Discoveries overlap (the
 * doctor's periodic check and a job's start), and an older one can finish
 * after a newer one, a timeout after a success; so what a read found is kept
 * only when no read that started after it has already been kept (Greptile on
 * #257).
 */
export function startNarrationRead(): number {
  reads += 1;
  return reads;
}

/** Keep what read `ticket` found, unless a later-started read's answer is already kept. Whether it was kept. */
export function settleNarrationRead(ticket: number, facts: NarrationFacts | null): boolean {
  if (ticket <= settled) return false;
  settled = ticket;
  keepNarrationFacts(facts);
  return true;
}

/** The speech rate the validator and the card use. */
export function charsPerSecond(): number {
  return current?.charsPerSecond ?? FALLBACK_CHARS_PER_SECOND;
}

/** What `/api/health` says about narration: the figure in force and where it came from. */
export function narrationHealth(): { source: "gnosia-audio" | "fallback"; version: string | null; charsPerSecond: number; spokenWords: number } {
  return {
    source: current === null ? "fallback" : "gnosia-audio",
    version: current?.version ?? null,
    charsPerSecond: charsPerSecond(),
    spokenWords: current?.spoken.length ?? 0,
  };
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** The written forms in spoken.json: its `spoken` groups flattened in file order, as gnosia-audio's own reader does. */
export function spokenForms(file: unknown): string[] {
  const groups = (file as { spoken?: unknown } | null)?.spoken;
  if (!Array.isArray(groups)) throw new Error("spoken.json has no `spoken` list of groups");
  const out: string[] = [];
  for (const group of groups) {
    const words = (group as { words?: unknown } | null)?.words;
    if (words === null || typeof words !== "object" || Array.isArray(words)) throw new Error("a spoken.json group has no `words` table");
    for (const written of Object.keys(words)) if (!out.includes(written)) out.push(written);
  }
  return out;
}

/** `home --json`'s reply, checked: the fields this module reads, or an error naming what is wrong. */
export function parseHome(reply: unknown): { version: string; charsPerSecond: number; leadIn: number; tail: number; data: { spoken: string; timing: string } } {
  const home = reply as Record<string, unknown> | null;
  if (home === null || typeof home !== "object") throw new Error("gnosia-audio home did not answer with a JSON object");
  if (home.error !== undefined) throw new Error(`gnosia-audio home failed: ${String((home.error as { message?: unknown })?.message ?? home.error)}`);
  if (home.schema !== 1) throw new Error(`gnosia-audio speaks schema ${String(home.schema)}, and this runner reads schema 1`);
  const data = home.data as { spoken?: unknown; timing?: unknown } | undefined;
  if (!finite(home.charsPerSecond) || home.charsPerSecond <= 0) throw new Error("gnosia-audio home named no speech rate");
  if (!finite(home.leadIn) || !finite(home.tail)) throw new Error("gnosia-audio home named no lead-in or tail");
  if (typeof data?.spoken !== "string" || !path.isAbsolute(data.spoken) || typeof data.timing !== "string" || !path.isAbsolute(data.timing)) {
    throw new Error("gnosia-audio home did not say where its data files are");
  }
  return {
    version: typeof home.version === "string" ? home.version : "unknown",
    charsPerSecond: home.charsPerSecond,
    leadIn: home.leadIn,
    tail: home.tail,
    data: { spoken: data.spoken, timing: data.timing },
  };
}

/**
 * Ask the manimkc checkout's gnosia-audio where it stands, and read its
 * pronunciation table. Null when it is not installed or does not answer in a
 * shape this runner knows, which `toolchainProblems` reports.
 */
export async function readNarrationFacts(root: string, python: string | null): Promise<NarrationFacts | null> {
  if (python === null) return null;
  const env: NodeJS.ProcessEnv = {
    PATH: "/usr/bin:/bin",
    HOME: process.env.HOME ?? "",
    LANG: "en_US.UTF-8",
    ...(process.env.MANIMKC_HOME === undefined ? {} : { MANIMKC_HOME: process.env.MANIMKC_HOME }),
  };
  const result = await run(python, ["-I", "-m", "gnosia_audio", "home", "--json", "--manimkc-root", root], { cwd: root, env, timeoutMs: 30_000 }).catch(() => null);
  if (result === null || result.code !== 0) return null;
  try {
    const home = parseHome(JSON.parse(result.stdout));
    const spoken = spokenForms(JSON.parse(await readFile(home.data.spoken, "utf8")));
    return { ...home, spoken };
  } catch {
    return null;
  }
}

/*
 * The abbreviation rule, as manimkc's own lint has it
 * (`tools/cli/manimkc_cli/lint.py`, `unknown_acronyms`): a token with a run
 * of two or more capitals (JSON, NixOS, CS4223) is what a voice spells or
 * mangles, CamelCase it reads fine, and a token the pronunciation table
 * rewrites, or one of the few said as words correctly, is not flagged.
 */
const ACRONYM = /\b[A-Za-z0-9]*[A-Z]{2,}[A-Za-z0-9]*\b/g;
const SAID_AS_WORDS = new Set(["OK", "TODO", "ID", "JSON", "PATH"]);

/** The words in these lines the voice would read as words, in first-seen order. */
export function abbreviationsIn(lines: readonly string[], spoken: readonly string[]): string[] {
  const known = new Set(spoken);
  const out: string[] = [];
  for (const line of lines) {
    for (const match of line.matchAll(ACRONYM)) {
      const token = match[0];
      if (known.has(token) || SAID_AS_WORDS.has(token) || out.includes(token)) continue;
      out.push(token);
    }
  }
  return out;
}

/**
 * V11 for a video brief: the words its lines hold that the voice would read
 * as words. Null when gnosia-audio has not answered, so the card falls back to
 * its own rough check rather than being told "none" by a runner that does not
 * know; empty for a silent video, which no voice reads.
 */
export function videoAbbreviations(brief: { voice?: unknown; scenes?: unknown }): string[] | null {
  if (current === null) return null;
  if (brief.voice === "none" || !Array.isArray(brief.scenes)) return [];
  const lines: string[] = [];
  for (const scene of brief.scenes as { beats?: unknown }[]) {
    if (!Array.isArray(scene?.beats)) continue;
    for (const beat of scene.beats as { say?: unknown }[]) if (typeof beat?.say === "string") lines.push(beat.say);
  }
  return abbreviationsIn(lines, current.spoken);
}
