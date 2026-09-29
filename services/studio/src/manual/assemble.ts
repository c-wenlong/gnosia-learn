import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { MANUAL_SOURCE_DIR } from "../paths";

import { LINT_RULES, STATIC_LINT_NAMES, type LintRule } from "./lints";
import { compareLintNames, helperListing, lintNamesFromApi, type ApiEntry, type LintComparison } from "./listing";
import { generatedOptions, STYLE_VALUES } from "./options";

/**
 * The tldraw manual the drawing agent's system prompt carries: the static
 * sections checked in beside this file, and the halves generated from the
 * installed tool's `api --json`.
 *
 * The order is the design's table (docs/STUDIO-CHAT-FIRST.md, "What it
 * contains"): commands, exit codes, the loop, coordinates and sizes, scope,
 * the helpers, their options, the lint rules, three worked snippets, and
 * Never. The static sections are Markdown files, numbered for their place, so
 * editing one is editing prose and not a string literal full of escaped
 * backticks. Everything is read fresh on each assembly, which happens at
 * runner start and on a changed build, so nothing here is cached.
 */

/** The three worked snippets, each a file in `snippets/` that the suite runs against the tool. */
export interface WorkedSnippet {
  name: string;
  title: string;
  why: string;
}

export const SNIPPETS: readonly WorkedSnippet[] = [
  {
    name: "flow",
    title: "A flow of boxes and bound arrows",
    why: "The shape of `layout: flow-lr`: the first box by coordinates, every other by `after` or `below` with each gap sized to its arrow label, then `connect`, then a title.",
  },
  {
    name: "comparison",
    title: "A labelled comparison of two aligned containers",
    why: "The shape of `layout: comparison`: members first, then a container round each, then `alignContainers` so a panel with fewer members is not drawn smaller.",
  },
  {
    name: "timeline",
    title: "A timeline on an unbound axis",
    why: "The axis and ticks are `line` and `stub`: geometry that joins nothing, so it binds to nothing and the arrow rules are muted on it. Events are boxes of one size placed against the ticks.",
  },
];

export function snippetPath(name: string): string {
  return path.join(MANUAL_SOURCE_DIR, "snippets", `${name}.js`);
}

export function readSnippet(name: string): string {
  return readFileSync(snippetPath(name), "utf8").trimEnd();
}

/** The static sections, by file name, in order. */
function readSections(): Map<string, string> {
  const directory = path.join(MANUAL_SOURCE_DIR, "sections");
  const sections = new Map<string, string>();
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".md")).sort()) {
    sections.set(file, readFileSync(path.join(directory, file), "utf8").trim());
  }
  return sections;
}

function section(sections: Map<string, string>, prefix: string): string {
  const found = [...sections.entries()].find(([file]) => file.startsWith(prefix));
  if (found === undefined) throw new Error(`the manual has no static section ${prefix}-*.md in ${MANUAL_SOURCE_DIR}`);
  return found[1];
}

/** A rule the tool names and the static table does not: named, with the honest gap. */
function unknownRule(name: string): LintRule {
  return { name, severity: "error", fires: "No fix recorded: this rule is newer than the manual.", fix: "Read the lint's own message, which names the shapes and what is wrong." };
}

function lintSection(rules: readonly LintRule[]): string {
  const warnings = rules.filter((rule) => rule.severity === "warn").map((rule) => `\`${rule.name}\``);
  return [
    "## The lint rules",
    "",
    `\`run\` and \`inspect\` lint the current page after every call: ${rules.length} rules. A lint names its rule, ` +
      "the shape ids and what is wrong. Every rule but the warnings is an error and makes the exit code 3" +
      (warnings.length === 0 ? "." : `; ${warnings.join(" and ")} ${warnings.length === 1 ? "is a warning" : "are warnings"}, printed and never in the exit code.`),
    "A finding you mean to keep is muted on that shape with `meta: { lintIgnore: ['<rule>'] }`,",
    "never with `--allow-lints`, which accepts every finding at once.",
    "",
    ...rules.map(
      (rule) =>
        `- \`${rule.name}\`${rule.severity === "warn" ? " (warning)" : ""}: ${rule.fires}\n  Fix: ${rule.fix}`,
    ),
  ].join("\n");
}

function snippetSection(): string {
  return [
    "## Three worked snippets",
    "",
    "Each of these runs against the installed tool with no lint at error level, and the studio's",
    "tests run them again whenever it changes. Copy the patterns, not the words: your labels come",
    "from the brief.",
    "",
    ...SNIPPETS.flatMap((snippet) => [
      `### ${snippet.title}`,
      "",
      snippet.why,
      "",
      "```js",
      readSnippet(snippet.name),
      "```",
      "",
    ]),
  ]
    .join("\n")
    .trimEnd();
}

export interface Manual {
  text: string;
  /** sha256 of `text`: the name of the file it is written to, and `manualHash` on a job. */
  hash: string;
  /** The helper count the listing carries. */
  helpers: number;
  /** Where the options section came from this time. */
  optionsSource: "generated" | "static";
  /** The rule names the tool reported, or null when its `getLints` summary named none. */
  lintNames: string[] | null;
  /** The difference from the static table, or null when there was nothing to compare. */
  lints: LintComparison | null;
}

/** The whole manual, from `api --json` entries and the files beside this one. */
export function assembleManual(entries: readonly ApiEntry[]): Manual {
  const sections = readSections();
  const lintNames = lintNamesFromApi(entries);
  const lints = lintNames === null ? null : compareLintNames(lintNames, STATIC_LINT_NAMES);
  // The tool's names win: the agent is never told about a rule that is gone,
  // and a rule the table does not know is still named (M2).
  const rules =
    lintNames === null
      ? LINT_RULES
      : lintNames.map((name) => LINT_RULES.find((rule) => rule.name === name) ?? unknownRule(name));
  const generated = generatedOptions(entries);
  const options = generated ?? section(sections, "60").replace("{{STYLE_VALUES}}", STYLE_VALUES);

  const text = [
    section(sections, "00"),
    section(sections, "10"),
    section(sections, "20"),
    section(sections, "30"),
    section(sections, "40"),
    section(sections, "50"),
    helperListing(entries),
    options,
    lintSection(rules),
    snippetSection(),
    section(sections, "90"),
  ].join("\n\n");

  return {
    text: `${text}\n`,
    hash: createHash("sha256").update(`${text}\n`).digest("hex"),
    helpers: entries.length,
    optionsSource: generated === null ? "static" : "generated",
    lintNames,
    lints,
  };
}
