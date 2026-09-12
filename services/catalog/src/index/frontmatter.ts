/**
 * The knowledge base's frontmatter dialect, in TypeScript.
 *
 * This is a port of the subset `scripts/learn/lib/markdown.mjs` reads: scalars,
 * inline arrays (`[a, b]`) and block arrays (`- a`). Not a general YAML parser,
 * on purpose — the notes are written to stay Obsidian-compatible, and the
 * `learn` CLI parses them with no dependency at all.
 *
 * Why a port rather than an import. That file is untyped ESM outside this
 * service's tsconfig, so consuming it from strict TypeScript means either
 * `allowJs` plus a hand-written declaration or a runtime `any`, and both are
 * worse than eighty lines. The duplication is held honest by
 * `test/frontmatter.test.ts`, which runs both parsers over every real note and
 * asserts they agree: if the `learn` CLI's dialect changes, that test fails
 * here rather than the catalog quietly reading notes a different way.
 */

// Consumes the blank line(s) after the closing fence, exactly as markdown.mjs
// does, so the body starts at real content.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n)*/;
const BLOCK_ITEM_RE = /^\s*-\s+(.*)$/;
const PAIR_RE = /^([A-Za-z0-9_-]+):\s*(.*)$/;

export type Scalar = string | number | boolean | null;
export type FrontmatterValue = Scalar | Scalar[];
export type Frontmatter = Record<string, FrontmatterValue>;

export interface ParsedDocument {
  data: Frontmatter;
  body: string;
}

function parseScalar(raw: string): Scalar {
  const value = raw.trim();
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseInlineArray(raw: string): Scalar[] {
  const inner = raw.trim().slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((v) => parseScalar(v));
}

/** Split a document into `{ data, body }`. Missing frontmatter yields `{}`. */
export function parseFrontmatter(text: string): ParsedDocument {
  const match = FRONTMATTER_RE.exec(text);
  if (!match?.[1]) return { data: {}, body: text };

  const data: Frontmatter = {};
  let currentKey: string | null = null;

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const blockItem = BLOCK_ITEM_RE.exec(line);
    if (blockItem?.[1] !== undefined && currentKey !== null) {
      const existing = data[currentKey];
      const list = Array.isArray(existing) ? existing : [];
      list.push(parseScalar(blockItem[1]));
      data[currentKey] = list;
      continue;
    }

    const pair = PAIR_RE.exec(line);
    if (!pair?.[1]) continue;
    const key = pair[1];
    const rawValue = pair[2] ?? "";
    currentKey = key;

    if (rawValue.trim() === "") {
      data[key] = [];
    } else if (rawValue.trim().startsWith("[")) {
      data[key] = parseInlineArray(rawValue);
    } else {
      data[key] = parseScalar(rawValue);
    }
  }

  return { data, body: text.slice(match[0].length) };
}

/** A frontmatter value read as text. Absent, empty and null all give `null`. */
export function readText(data: Frontmatter, key: string): string | null {
  const value = data[key];
  if (value === undefined || value === null || Array.isArray(value)) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/**
 * A frontmatter value read as a list of non-empty strings. A scalar becomes a
 * one-element list, because `tags: algorithms` and `tags: [algorithms]` mean
 * the same thing to a person writing a note and should to the indexer too.
 */
export function readList(data: Frontmatter, key: string): string[] {
  const value = data[key];
  if (value === undefined || value === null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .filter((item): item is Scalar => item !== null && item !== undefined)
    .map((item) => String(item).trim())
    .filter((item) => item !== "");
}

/**
 * `[[target]]` and `[[target|alias]]` link targets, in order and deduplicated.
 * Deduplicated because a session note that mentions the same concept in three
 * places is still one `asset_concept` row, and the primary key would reject the
 * repeats anyway.
 */
export function extractWikilinks(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const target = match[1]?.trim();
    if (target && !seen.has(target)) {
      seen.add(target);
      out.push(target);
    }
  }
  return out;
}
