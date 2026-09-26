import { parseNote, type Block } from "@/components/markdown";

/**
 * The parts of a concept note a page needs beyond its prose: the frontmatter
 * fields and the check blocks.
 *
 * Pure and React-free, so a test, a route handler and a page can all use it.
 * It is a port of `parseFrontmatter` and `parseChecks` in
 * `scripts/learn/lib/markdown.mjs`, not an import of them, because the web app
 * never imports from `scripts/` (ARCHITECTURE.md layering rule 1). The two
 * must agree on what a check is, since `review due` hands the CLI's reading to
 * the plugin and a page shows this one; `concept-note-core.test.ts` pins the
 * cases the CLI's own tests pin.
 */

/** One ```check block, in the shape `review due --json` prints it. */
export interface ConceptCheck {
  /** `c1`, `c2`, ... in note order, counting only blocks that have a question. */
  id: string;
  question: string;
  answer: string;
  why: string;
  source: string;
}

/** The frontmatter fields a concept note carries. Missing lists are empty. */
export interface ConceptFrontmatter {
  title: string | null;
  summary: string | null;
  requires: string[];
  assumes: string[];
  tags: string[];
  topics: string[];
  sources: string[];
}

export interface ParsedConceptNote {
  frontmatter: ConceptFrontmatter;
  checks: ConceptCheck[];
}

function parseScalar(raw: string): string {
  const value = raw.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * The subset of YAML the knowledge base writes: scalars, inline arrays
 * (`[a, b]`) and block arrays (`- a`). Everything comes back as a string or a
 * list of strings; the fields read below are all text.
 */
export function parseFrontmatterFields(yaml: string | null): ConceptFrontmatter {
  const data: Record<string, string | string[]> = {};
  let currentKey: string | null = null;

  for (const line of (yaml ?? "").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const blockItem = /^\s*-\s+(.*)$/.exec(line);
    if (blockItem && currentKey) {
      const existing = data[currentKey];
      const list = Array.isArray(existing) ? existing : [];
      list.push(parseScalar(blockItem[1]));
      data[currentKey] = list;
      continue;
    }

    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const [, key, rawValue] = pair;
    currentKey = key;
    const value = rawValue.trim();
    if (value === "") data[key] = [];
    else if (value.startsWith("[")) {
      const inner = value.replace(/^\[/, "").replace(/\]$/, "").trim();
      data[key] = inner === "" ? [] : inner.split(",").map(parseScalar).filter(Boolean);
    } else data[key] = parseScalar(value);
  }

  const text = (key: string): string | null => {
    const value = data[key];
    return typeof value === "string" && value !== "" ? value : null;
  };
  const list = (key: string): string[] => {
    const value = data[key];
    if (Array.isArray(value)) return value.filter((v) => v !== "");
    return typeof value === "string" && value !== "" ? [value] : [];
  };

  return {
    title: text("title"),
    summary: text("summary"),
    requires: list("requires"),
    assumes: list("assumes"),
    tags: list("tags"),
    topics: list("topics"),
    sources: list("sources"),
  };
}

/** Every fenced block with the `check` info string, nested ones included. */
function checkBlocks(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.kind === "code" && block.info.toLowerCase() === "check") out.push(block.text);
    else if (block.kind === "list") for (const item of block.items) out.push(...checkBlocks(item));
    else if (block.kind === "quote") out.push(...checkBlocks(block.blocks));
  }
  return out;
}

/** One check block's text to a check, or null when it has no question. */
function readCheck(text: string): Omit<ConceptCheck, "id"> | null {
  const fields: Record<string, string> = {};
  let field: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const pair = /^\s*(q|a|why|source):\s*(.*)$/i.exec(line);
    if (pair) {
      field = pair[1].toLowerCase();
      fields[field] = pair[2].trim();
    } else if (field && line.trim()) {
      fields[field] = `${fields[field]} ${line.trim()}`.trim();
    }
  }
  if (!fields.q) return null;
  return {
    question: fields.q,
    answer: fields.a ?? "",
    why: fields.why ?? "",
    source: fields.source ?? "",
  };
}

/** The check blocks of a note, frontmatter and all, in order. */
export function parseChecks(source: string): ConceptCheck[] {
  const checks: ConceptCheck[] = [];
  for (const text of checkBlocks(parseNote(source).blocks)) {
    const check = readCheck(text);
    if (check) checks.push({ id: `c${checks.length + 1}`, ...check });
  }
  return checks;
}

/** A whole note file to its frontmatter fields and its checks. */
export function parseConceptNote(source: string): ParsedConceptNote {
  const { frontmatter, blocks } = parseNote(source);
  const checks: ConceptCheck[] = [];
  for (const text of checkBlocks(blocks)) {
    const check = readCheck(text);
    if (check) checks.push({ id: `c${checks.length + 1}`, ...check });
  }
  return { frontmatter: parseFrontmatterFields(frontmatter), checks };
}
