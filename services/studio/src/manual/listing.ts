/**
 * `canvas api --json`, read: the helper entries, the listing the manual prints
 * from them, and the lint rule names the `getLints` entry carries.
 *
 * The shape is tldrawkc's `dist/api.json`, a bare array (CLI.md, "api"). Read
 * defensively, because it is another repository's output: an entry without a
 * name or a signature is dropped rather than printed as "undefined", and
 * anything this file does not know about an entry (the `options` field that is
 * on its way, for one) is kept on `raw` for the adapters that do.
 */

export interface ApiEntry {
  name: string;
  signature: string;
  summary: string;
  examples: string[];
  params: string[];
  /** The entry as the tool printed it, for readers of fields not named above. */
  raw: Record<string, unknown>;
}

/** Parse `api --json` output. Null when it is not the array the tool prints. */
export function parseApi(json: unknown): ApiEntry[] | null {
  if (!Array.isArray(json)) return null;
  const entries: ApiEntry[] = [];
  for (const item of json) {
    if (typeof item !== "object" || item === null) continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.name !== "string" || typeof raw.signature !== "string") continue;
    entries.push({
      name: raw.name,
      signature: raw.signature,
      summary: typeof raw.summary === "string" ? raw.summary : "",
      examples: strings(raw.examples),
      params: strings(raw.params),
      raw,
    });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * The lint rule names, from the `getLints` entry's summary.
 *
 * CLI.md says the lint rules are not in `api` output, and they are not as
 * data; but the summary of `getLints` names every one of them in backticks
 * ("Eight shape rules: `friendless-arrow`, ..., plus `missing-topic` on the
 * document"), which is the only place the installed build states its own list.
 * A rule name is a backticked run of lower-case words joined by hyphens, which
 * keeps `getLints` or `Lint[]` from being read as one. Null when there is no
 * such entry or it names nothing: that is "could not tell", not "no rules".
 */
export function lintNamesFromApi(entries: readonly ApiEntry[]): string[] | null {
  const entry = entries.find((candidate) => candidate.name === "getLints");
  if (entry === undefined) return null;
  const names: string[] = [];
  for (const match of entry.summary.matchAll(/`([a-z]+(?:-[a-z]+)+)`/g)) {
    const name = match[1];
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  return names.length === 0 ? null : names;
}

export interface LintComparison {
  /** Named by the tool and absent from the static table: printed with "no fix recorded". */
  unknown: string[];
  /** In the static table and no longer named by the tool: left out of the manual. */
  missing: string[];
}

/** What differs between the tool's rule names and the static table's. */
export function compareLintNames(generated: readonly string[], known: readonly string[]): LintComparison {
  return {
    unknown: generated.filter((name) => !known.includes(name)),
    missing: known.filter((name) => !generated.includes(name)),
  };
}

/** One helper, as the manual lists it: the signature, the summary, and the lines to copy. */
function helperBlock(entry: ApiEntry): string {
  const lines = [`- \`${entry.signature}\`: ${entry.summary}`];
  for (const param of entry.params) lines.push(`  - ${param}`);
  for (const example of entry.examples) lines.push(`  - \`${example.replace(/`/g, "'")}\``);
  return lines.join("\n");
}

/** The generated section: every helper the installed page bundle exposes. */
export function helperListing(entries: readonly ApiEntry[]): string {
  return [
    "## The helpers",
    "",
    `Generated from the installed tool's \`api --json\`: all ${entries.length} helpers a snippet can ` +
      "call, each as `helpers.<name>(...)`, with its summary and lines to copy. Their options are in " +
      "the next section.",
    "",
    ...entries.map(helperBlock),
  ].join("\n");
}
