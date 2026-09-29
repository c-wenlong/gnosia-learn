import type { ApiEntry } from "./listing";

/**
 * The options section, from `api.json` when the tool says what each helper's
 * options are, and from the static text in `sections/60-options.md` when it
 * does not.
 *
 * Why it exists: in the one real job, 11 of 32 requests went to finding option
 * names in the tool's source, because a signature says `opts?: BoxShapesOptions`
 * and not what is in it (docs/STUDIO-CHAT-FIRST.md, D30). The static text is
 * accurate for the build installed when it was written; D38 asks for the
 * section to come from the tool instead, so it cannot drift.
 *
 * **The adapter is deliberately small and tolerant**, because the field it
 * reads is being added to tldrawkc in parallel and its exact shape is not
 * settled. `readOptions` is the one function to change when it is. It accepts
 * an `options` field on an entry that is either
 *
 * - a list of `{ name, type?, default?, summary? | description? | doc? }`, or
 * - an object keyed by option name whose values are that record without `name`
 *   (or a bare string, read as the summary).
 *
 * Anything else on an entry reads as "no options recorded". The section is
 * generated only when at least one entry carries options it can read;
 * otherwise the static text stands, whole.
 */

export interface OptionField {
  name: string;
  type: string | null;
  default: string | null;
  summary: string | null;
}

export function readOptions(entry: ApiEntry): OptionField[] | null {
  const value = entry.raw.options;
  if (Array.isArray(value)) {
    const fields = value.flatMap((item): OptionField[] => {
      if (typeof item !== "object" || item === null) return [];
      const record = item as Record<string, unknown>;
      return typeof record.name === "string" ? [field(record.name, record)] : [];
    });
    return fields.length === 0 ? null : fields;
  }
  if (typeof value === "object" && value !== null) {
    const fields = Object.entries(value as Record<string, unknown>).map(([name, item]) =>
      typeof item === "string"
        ? { name, type: null, default: null, summary: item }
        : field(name, typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {}),
    );
    return fields.length === 0 ? null : fields;
  }
  return null;
}

function field(name: string, record: Record<string, unknown>): OptionField {
  const summary = [record.summary, record.description, record.doc].find((text) => typeof text === "string");
  const fallback = record.default;
  return {
    name,
    type: typeof record.type === "string" ? record.type : null,
    default:
      fallback === undefined || fallback === null
        ? null
        : typeof fallback === "string"
          ? fallback
          : JSON.stringify(fallback),
    summary: typeof summary === "string" ? summary : null,
  };
}

/** One option, as a line of the section. */
function optionLine(option: OptionField): string {
  const facts = [
    option.type === null ? null : `\`${option.type}\``,
    option.default === null ? null : `default \`${option.default}\``,
  ].filter((fact): fact is string => fact !== null);
  const head = `  - \`${option.name}\`${facts.length === 0 ? "" : ` (${facts.join(", ")})`}`;
  return option.summary === null ? head : `${head}: ${option.summary}`;
}

/**
 * The style values, which are tldraw's own enums and belong to no helper, so
 * no helper's options will carry them. Kept whichever way the section is built.
 */
export const STYLE_VALUES = [
  "Style values the options take. Colours: `black`, `grey`, `light-violet`, `violet`,",
  "`blue`, `light-blue`, `yellow`, `orange`, `green`, `light-green`, `light-red`,",
  "`red`, `white`. Fills: `none`, `semi`, `solid`, `pattern`, `fill`,",
  "`lined-fill`. Dashes: `draw`, `solid`, `dashed`, `dotted`, `none`. Sizes: `s`,",
  "`m`, `l`, `xl`. Fonts: `draw`, `sans`, `serif`, `mono`. Alignment: `start`,",
  "`middle`, `end`.",
].join("\n");

/** The generated section, or null when no entry carries options this adapter can read. */
export function generatedOptions(entries: readonly ApiEntry[]): string | null {
  const blocks: string[] = [];
  for (const entry of entries) {
    const options = readOptions(entry);
    if (options === null) continue;
    blocks.push([`- **\`${entry.name}\`**`, ...options.map(optionLine)].join("\n"));
  }
  if (blocks.length === 0) return null;
  return [
    "## Options",
    "",
    "What goes in each helper's options argument, generated from the installed tool. Every field is",
    "optional unless it says otherwise. A misspelt option is ignored rather than refused, so check",
    "the spelling against this list.",
    "",
    STYLE_VALUES,
    "",
    ...blocks,
  ].join("\n");
}
