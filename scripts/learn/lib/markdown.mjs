/**
 * Minimal, dependency-free frontmatter + wikilink handling.
 *
 * Deliberately supports only the subset the knowledge base uses: scalars,
 * inline arrays (`[a, b]`) and block arrays (`- a`). That keeps the notes
 * Obsidian-compatible without pulling in a YAML parser.
 */

// Consumes the blank line(s) after the closing fence so the body starts at
// real content — otherwise every round-trip accretes another leading newline.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n)*/;

function parseScalar(raw) {
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

function parseInlineArray(raw) {
  const inner = raw.trim().slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((v) => parseScalar(v));
}

/** Split a document into { data, body }. Missing frontmatter yields {}. */
export function parseFrontmatter(text) {
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { data: {}, body: text };

  const data = {};
  const lines = match[1].split(/\r?\n/);
  let currentKey = null;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const blockItem = line.match(/^\s*-\s+(.*)$/);
    if (blockItem && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(parseScalar(blockItem[1]));
      continue;
    }

    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    const [, key, rawValue] = pair;
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

function serializeValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((v) => String(v)).join(", ")}]`;
  }
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Quote anything YAML would misread as structure.
  if (/^[\s]|[:#]\s|^[\[{>|*&!%@`]|[\s]$/.test(str)) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

export function stringifyFrontmatter(data, body = "") {
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${serializeValue(v)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body.replace(/^\n+/, "")}`;
}

/** Extract `[[target]]` and `[[target|alias]]` link targets, in order. */
export function extractWikilinks(text) {
  const out = [];
  const re = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const target = m[1].trim();
    if (target) out.push(target);
  }
  return out;
}

/**
 * Checks are verifiable questions stored inside a concept note, in fenced
 * ```check blocks. Keeping them in the note (rather than a side database)
 * means the thing that asserts a claim and the thing that tests it live
 * together, and both stay readable in any markdown editor.
 *
 *     ```check
 *     q: What does the softmax denominator do?
 *     a: Normalises the exponentiated scores so they sum to 1.
 *     ```
 */
export function parseChecks(body = "") {
  const out = [];
  const re = /```check\s*\r?\n([\s\S]*?)```/g;
  let m;
  let index = 0;

  while ((m = re.exec(body)) !== null) {
    const check = { id: `c${index + 1}` };
    let field = null;

    for (const line of m[1].split(/\r?\n/)) {
      const pair = line.match(/^\s*(q|a|why|source):\s*(.*)$/i);
      if (pair) {
        field = pair[1].toLowerCase();
        check[field] = pair[2].trim();
      } else if (field && line.trim()) {
        check[field] = `${check[field]} ${line.trim()}`.trim();
      }
    }

    if (check.q) {
      out.push({
        id: check.id,
        question: check.q,
        answer: check.a ?? "",
        why: check.why ?? "",
        source: check.source ?? "",
      });
      index += 1;
    }
  }

  return out;
}

/** Render one check as a fenced block. */
export function stringifyCheck(check) {
  const lines = [`q: ${check.question}`];
  if (check.answer) lines.push(`a: ${check.answer}`);
  if (check.why) lines.push(`why: ${check.why}`);
  if (check.source) lines.push(`source: ${check.source}`);
  return ["```check", ...lines, "```"].join("\n");
}

/** Append a check to a note body, creating the `## Checks` section if needed. */
export function appendCheck(body = "", check) {
  const block = stringifyCheck(check);
  if (/^##\s+Checks\s*$/m.test(body)) {
    return `${body.replace(/\s+$/, "")}\n\n${block}\n`;
  }
  return `${body.replace(/\s+$/, "")}\n\n## Checks\n\n${block}\n`;
}

/** Filesystem- and Obsidian-safe slug. */
export function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
