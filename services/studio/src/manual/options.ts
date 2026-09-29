import type { ApiEntry } from "./listing";

/**
 * The options section: per helper, generated from `api.json` where the tool
 * lists that helper's option fields, and the static block from
 * `sections/60-options.md` where it does not.
 *
 * Why it exists: in the one real job, 11 of 32 requests went to finding option
 * names in the tool's source, because a signature says `opts?: BoxShapesOptions`
 * and not what is in it (docs/STUDIO-CHAT-FIRST.md, D30). D38 asks for the
 * section to come from the tool, so it cannot drift; tldrawkc 95a2bb7 emits it.
 *
 * **Per helper, not all or nothing.** A build that lists options for some
 * helpers and not others gets the generated list for the first and the static
 * block for the rest, so a helper never loses its fields because a neighbour
 * gained some.
 *
 * The shape `readOptions` reads is the one tldrawkc prints (its `api.json`,
 * since #18), present on a helper that takes options and absent on one that
 * does not:
 *
 *     options: { param: "opts", type: "BoxShapesOptions",
 *                fields: [{ name, type, optional, doc, default? }] }
 *
 * `type` is printed as written in the source (`BoxOptions["color"]`,
 * `TLDefaultColorStyle`), never expanded, which is why the value types stay a
 * static list (`VALUE_TYPES`).
 */

export interface OptionField {
  name: string;
  type: string | null;
  optional: boolean;
  /** JSON of the default, when the tool records one. */
  default: string | null;
  doc: string | null;
}

export interface HelperOptions {
  /** The parameter's name in the signature, `opts` in every helper today. */
  param: string | null;
  /** The options type's name, as written. */
  type: string | null;
  fields: OptionField[];
}

export function readOptions(entry: ApiEntry): HelperOptions | null {
  const value = entry.raw.options;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.fields)) return null;
  const fields = record.fields.flatMap((item): OptionField[] => {
    if (typeof item !== "object" || item === null) return [];
    const field = item as Record<string, unknown>;
    if (typeof field.name !== "string") return [];
    return [
      {
        name: field.name,
        type: typeof field.type === "string" ? field.type : null,
        optional: field.optional !== false,
        default: field.default === undefined ? null : JSON.stringify(field.default),
        doc: typeof field.doc === "string" && field.doc.trim() !== "" ? field.doc.trim() : null,
      },
    ];
  });
  if (fields.length === 0) return null;
  return {
    param: typeof record.param === "string" ? record.param : null,
    type: typeof record.type === "string" ? record.type : null,
    fields,
  };
}

/** Types whose name says all there is to say, so a line need not repeat them. */
const PLAIN_TYPES = new Set(["number", "string", "boolean"]);

/**
 * One option, as a line of the section. Kept short because it is sent on
 * every request of every attempt: a plain `number` or `string` type is left
 * out, and so is a default the tool's own doc line already states.
 */
function optionLine(option: OptionField): string {
  const statedDefault =
    option.default !== null &&
    option.doc !== null &&
    option.doc.includes(`\`${option.default.replace(/^"(.*)"$/, "$1")}\``);
  const plainDefault =
    option.default !== null && option.doc !== null && option.doc.includes(`default ${option.default}`);
  const facts = [
    option.type === null || PLAIN_TYPES.has(option.type) ? null : `\`${option.type}\``,
    option.optional ? null : "required",
    option.default === null || statedDefault || plainDefault ? null : `default \`${option.default}\``,
  ].filter((fact): fact is string => fact !== null);
  const head = `- \`${option.name}\`${facts.length === 0 ? "" : ` (${facts.join(", ")})`}`;
  return option.doc === null ? head : `${head}: ${option.doc}`;
}

function generatedBlock(entry: ApiEntry, options: HelperOptions): string {
  const named = options.type === null ? "" : `, a \`${options.type}\``;
  return [`**\`${entry.name}\`** (\`${options.param ?? "opts"}\`${named}):`, ...options.fields.map(optionLine)].join("\n");
}

/**
 * The value types the options take. tldraw's own enums and the helpers' small
 * unions, which `api.json` names and never expands, so an agent reading
 * `TLDefaultColorStyle` still needs the words that are allowed.
 */
export const VALUE_TYPES = [
  "The value types, which the lists below name without expanding:",
  "",
  "- Colours (`TLDefaultColorStyle`, `BoxOptions[\"color\"]`): `black`, `grey`, `light-violet`,",
  "  `violet`, `blue`, `light-blue`, `yellow`, `orange`, `green`, `light-green`, `light-red`, `red`,",
  "  `white`.",
  "- Fills (`TLDefaultFillStyle`): `none`, `semi`, `solid`, `pattern`, `fill`, `lined-fill`.",
  "- Dashes (`TLDefaultDashStyle`, `BoxOptions[\"dash\"]`): `draw`, `solid`, `dashed`, `dotted`, `none`.",
  "- Sizes (`TLDefaultSizeStyle`, `BoxOptions[\"size\"]`): `s`, `m`, `l`, `xl`.",
  "- Fonts (`TLDefaultFontStyle`): `draw`, `sans`, `serif`, `mono`.",
  "- Label and text alignment (`TLDefaultHorizontalAlignStyle`, `TLDefaultVerticalAlignStyle`,",
  "  `TLDefaultTextAlignStyle`): `start`, `middle`, `end`.",
  "- `Align` (`row`, `column`): `start`, `center`, `end`. Note `center` here, not `middle`.",
  "- `GeoKind`: `rectangle`, `ellipse`, `oval` (the capsule), `diamond`, `hexagon`, `triangle`,",
  "  `cloud`, `star`, `trapezoid`, `pentagon`, `octagon`, `rhombus`. There is no `pill` and no",
  "  rounded rectangle.",
  "- Arrow `kind` (`TLArrowShape[\"props\"][\"kind\"]`): `elbow`, `arc`.",
  "- `AnchorSpec`: a side, `'top'`, `'right'`, `'bottom'` or `'left'`, or `{ x, y }` in 0..1 of the shape.",
  "- `HeadSpec`: `end`, `start`, `both`, `none`.",
  "- `ShapeKey`: a key such as `'router'`, or a full `'shape:router'` id.",
  "- `ShapeMeta`: an object of your own; `lintIgnore: ['<rule>']` in it mutes that rule on that shape.",
  "- `Direction` (`mermaid`): `TD`, `TB`, `LR`, `RL`, `BT`. `Origin`: `{ x, y }`. `Spacing`: `{ rank, node }`.",
].join("\n");

/** The static blocks of `60-options.md`, by the helper each one is marked for. */
export function staticBlocks(section: string): { preamble: string; blocks: Map<string, string> } {
  const parts = section.split(/^<!-- helper: ([A-Za-z]+) -->\n/m);
  const preamble = (parts[0] ?? "").trim();
  const blocks = new Map<string, string>();
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const name = parts[i];
    const body = parts[i + 1];
    if (name !== undefined && body !== undefined) blocks.set(name, body.trim());
  }
  return { preamble, blocks };
}

export interface OptionsSection {
  text: string;
  /** Helpers whose options came from `api.json`. */
  generated: string[];
  /** Helpers whose options came from the static blocks. */
  fallback: string[];
}

/**
 * The whole section: the static preamble and value types, then one block per
 * helper, in the helpers' order, generated where the tool lists fields and
 * static where it does not. A static block for a helper the tool no longer has
 * is dropped, as a lint rule is.
 */
export function optionsSection(entries: readonly ApiEntry[], staticSection: string): OptionsSection {
  const { preamble, blocks } = staticBlocks(staticSection);
  const generated: string[] = [];
  const fallback: string[] = [];
  const out: string[] = [preamble.replace("{{VALUE_TYPES}}", VALUE_TYPES)];
  for (const entry of entries) {
    const options = readOptions(entry);
    if (options !== null) {
      generated.push(entry.name);
      out.push(generatedBlock(entry, options));
      continue;
    }
    const block = blocks.get(entry.name);
    if (block !== undefined) {
      fallback.push(entry.name);
      out.push(block);
    }
  }
  return { text: out.join("\n\n"), generated, fallback };
}
