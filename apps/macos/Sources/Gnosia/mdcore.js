"use strict";
/*
  The markdown parser + HTML renderer shared by note.html and chat.html —
  one copy, loaded with <script src="mdcore.js">, so both surfaces run the
  same port of packages/tutor/src/markdown.ts the web's NoteProse runs.
  Anything unrecognised becomes visible text, never nothing.
*/

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const KATEX_OPTS = {
  throwOnError: false, strict: "ignore", output: "htmlAndMathml",
  trust: false, maxSize: 20, maxExpand: 1000,
};

function math(source, display) {
  try {
    const html = katex.renderToString(source, { ...KATEX_OPTS, displayMode: display });
    return display ? '<div class="kdisplay">' + html + "</div>" : html;
  } catch (e) {
    return '<span class="merr">' + esc(source) + "</span>";
  }
}

/* ==================================================================
   The parser: a port of packages/tutor/src/markdown.ts (blocks and
   inlines alike), extended with GFM pipe tables, ~~strikethrough~~ and
   <scheme:…> autolinks.
   ================================================================== */

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*(\S*).*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const QUOTE = /^ {0,3}>/;
const LIST_ITEM = /^(\s*)([-*+]|(\d{1,9})[.)])(\s+)(.*)$/;
const CALLOUT = /^\[!([A-Za-z][\w-]*)\][-+]?\s*(.*)$/;
/* A table's delimiter row: cells of dashes with an optional colon either
   side, pipes between and optionally around. `---` alone matches too,
   which is fine — RULE is always tried first. */
const TABLE_DELIM = /^ {0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

function splitFrontmatter(source) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);

  if (lines.length === 0 || lines[0].trim() !== "---") return lines;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") return lines.slice(i + 1);
  }
  return lines;
}

/* Does this line end the paragraph above it by starting something else? */
function interrupts(line) {
  return (
    line.trim() === "" ||
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    LIST_ITEM.test(line)
  );
}

/* A table row cut into cells on unescaped pipes (`\|` stays a literal —
   the one escape GFM tables honour, inside code spans too). A leading or
   trailing pipe only brackets the row; the empty edge cells are dropped. */
function splitRow(line) {
  const s = line.trim();
  const cells = [];
  let cur = "";
  for (let k = 0; k < s.length; k += 1) {
    const c = s[k];
    if (c === "\\" && s[k + 1] === "|") { cur += "|"; k += 1; continue; }
    if (c === "|") { cells.push(cur); cur = ""; continue; }
    cur += c;
  }
  cells.push(cur);
  if (cells.length > 1 && cells[0].trim() === "") cells.shift();
  if (cells.length > 1 && cells[cells.length - 1].trim() === "") cells.pop();
  return cells;
}

/* `---`, `:---`, `---:` or `:---:` → the column's alignment, "" for none. */
function delimAlign(cell) {
  const s = cell.trim();
  const left = s[0] === ":", right = s[s.length - 1] === ":";
  return left && right ? "center" : right ? "right" : left ? "left" : "";
}

/* If paragraph[k] is a delimiter row whose column count matches the row
   above it (which has to hold a pipe to be a header at all), the two open
   a table. The paragraph keeps the rows before the header; the rows after
   the delimiter are body rows until the first one without a pipe. */
function tableFromRun(paragraph) {
  for (let k = 1; k < paragraph.length; k += 1) {
    if (!TABLE_DELIM.test(paragraph[k])) continue;
    const header = splitRow(paragraph[k - 1]);
    const aligns = splitRow(paragraph[k]);
    if (!paragraph[k - 1].includes("|") || header.length !== aligns.length) continue;
    const rows = [];
    let end = k + 1;
    for (; end < paragraph.length; end += 1) {
      if (!paragraph[end].includes("|")) break;
      const cells = splitRow(paragraph[end]);
      while (cells.length < header.length) cells.push("");
      rows.push(cells.slice(0, header.length));
    }
    return {
      before: paragraph.slice(0, k - 1).join(" "),
      table: { kind: "table", header, aligns: aligns.map(delimAlign), rows },
      after: paragraph.slice(end).join(" "),
    };
  }
  return null;
}

function parseBlocks(lines) {
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i += 1; continue; }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const body = [];
      i += 1;
      const close = new RegExp(`^ {0,3}${marker}{${fence[1].length},}\\s*$`);
      while (i < lines.length && !close.test(lines[i])) { body.push(lines[i]); i += 1; }
      /* An unclosed fence runs to the end of the file rather than throwing
         it away: a half-written note should still show the half that exists. */
      i += 1;
      blocks.push({ kind: "code", info: fence[2], text: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    if (RULE.test(line)) { blocks.push({ kind: "rule" }); i += 1; continue; }

    if (QUOTE.test(line)) {
      const quoted = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(lines[i].replace(/^ {0,3}> ?/, ""));
        i += 1;
      }
      blocks.push(...parseQuote(quoted));
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const parsed = parseList(lines, i);
      blocks.push(parsed[0]);
      i = parsed[1];
      continue;
    }

    const display = displayMathAt(lines, i);
    if (display) {
      blocks.push({ kind: "math", source: display[0] });
      i = display[1];
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length &&
      !interrupts(lines[i]) &&
      /* `$$` on a line of its own ends the sentence above it, the way it
         does in Obsidian, but only when it really opens a closed display
         block. */
      !(paragraph.length > 0 && displayMathAt(lines, i) !== null)
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    /* A table's header and delimiter sit inside one blank-line run, so the
       run is collected first and the table is split out of it after. */
    const table = tableFromRun(paragraph);
    if (table) {
      if (table.before !== "") blocks.push({ kind: "paragraph", text: table.before });
      blocks.push(table.table);
      if (table.after !== "") blocks.push({ kind: "paragraph", text: table.after });
    } else {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    }
  }

  return blocks;
}

/* A display formula standing as a paragraph: a run of lines whose first
   starts with `$$` and whose last ends with `$$`, no blank line between.
   Answers [latex, next line] or null — markdown.ts's displayMathAt. */
function displayMathAt(lines, from) {
  if (!lines[from].trim().startsWith("$$")) return null;
  const body = [];
  for (let i = from; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === "") return null;
    if (i > from && (HEADING.test(lines[i]) || FENCE.test(lines[i]) || RULE.test(lines[i]))) return null;
    body.push(line);
    const joined = body.join("\n");
    if (joined.length <= 2 || !joined.endsWith("$$")) continue;
    const inner = joined.slice(2, -2);
    if (inner.trim() === "" || /(?<!\\)\$\$/.test(inner)) return null;
    return [inner.trim(), i + 1];
  }
  return null;
}

/* The stripped body of a `>` run into quote blocks — a `> [!kind] Title`
   line anywhere in the run opens a new callout, the same forgiving split
   markdown.ts makes for the corpus's logs. */
function parseQuote(lines) {
  const blocks = [];
  let callout = null;
  let title = "";
  let buffer = [];

  const flush = () => {
    const inner = parseBlocks(buffer);
    if (callout === null && inner.length === 0) return;
    blocks.push({ kind: "quote", callout, title, blocks: inner });
  };

  for (const line of lines) {
    const match = CALLOUT.exec(line);
    if (match) {
      flush();
      callout = match[1].toLowerCase();
      title = match[2].trim() || match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
      buffer = [];
      continue;
    }
    buffer.push(line);
  }
  flush();

  return blocks;
}

/* One list and everything nested under it: a line belongs to the item
   above it when it is indented at least as far as that item's content
   started. The content is dedented and parsed as its own document, so an
   item can hold paragraphs, a nested list, a table or a code block —
   markdown.ts's parseList verbatim. */
function parseList(lines, from) {
  const first = LIST_ITEM.exec(lines[from]);
  const indent = first[1].length;
  const ordered = first[3] !== undefined;
  const start = ordered ? Number(first[3]) : 1;
  const items = [];
  let i = from;

  while (i < lines.length) {
    const match = LIST_ITEM.exec(lines[i]);
    if (!match || match[1].length !== indent) break;
    /* A bullet list and a numbered list touching are two lists, not one. */
    if ((match[3] !== undefined) !== ordered) break;

    const contentIndent = match[1].length + match[2].length + match[4].length;
    const buffer = [match[5]];
    i += 1;

    let blanks = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") { blanks += 1; i += 1; continue; }
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent < Math.min(contentIndent, indent + 2)) break;
      for (; blanks > 0; blanks -= 1) buffer.push("");
      buffer.push(line.slice(Math.min(contentIndent, lineIndent)));
      i += 1;
    }

    items.push(parseBlocks(buffer));
  }

  return [{ kind: "list", ordered, start, items }, i];
}

/* The one URL check, ported verbatim: a URL is admitted only when it has
   no scheme or a scheme on this list. `javascript:` and `data:` come back
   null and the caller renders the text it was written as. */
function safeHref(raw) {
  const url = raw.trim();
  if (url === "") return null;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url.replace(/[\u0000-\u0020]/g, ""));
  if (scheme && !/^(?:https?|mailto)$/i.test(scheme[1])) return null;
  return url;
}

function isExternalHref(href) { return /^https?:/i.test(href); }

/* The $ rules from markdown.ts, unchanged: $$…$$ display, $…$ inline only
   when both dollars hug their content and the closing one is not followed
   by a digit (so "$5-$10" stays prose); \$ is a literal. */
const DISPLAY_SPAN = /^\$\$((?:\\[\s\S]|[^\\$]|\$(?!\$))+?)\$\$/;
const INLINE_SPAN = /^\$((?:\\[^\n]|[^\\$\s])(?:(?:\\[^\n]|[^\\$\n])*(?:\\[^\n]|[^\\$\s]))?)\$(?!\d)/;

function mathSpanAt(src) {
  if (src[0] !== "$") return null;
  if (src[1] === "$") {
    const display = DISPLAY_SPAN.exec(src);
    if (display === null || display[1].trim() === "") return null;
    return { source: display[1].trim(), display: true, length: display[0].length };
  }
  const inline = INLINE_SPAN.exec(src);
  return inline === null ? null : { source: inline[1], display: false, length: inline[0].length };
}

const INLINE_CODE = /^(`+)([\s\S]*?)\1/;
const EMBED = /^!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/;
const WIKILINK = /^\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/;
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/;
const LINK = /^\[([^\]]+)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/;
const STRONG = /^\*\*(\S(?:[\s\S]*?\S)?)\*\*/;
const EM = /^\*(\S(?:[\s\S]*?\S)?)\*/;
const STRIKE = /^~~(\S(?:[\s\S]*?\S)?)~~/;
/* <https://…> and <someone@host> — the autolinks CommonMark knows. Bare
   URLs stay text here exactly as they do on the web, which never linkifies
   them either. */
const AUTOLINK = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*)>/;
const AUTOMAIL = /^<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,253}[A-Za-z0-9])?)>/;

/* One line of prose into its inline pieces — markdown.ts's parseInline
   with strike and autolink added. Order matters: code spans win over
   everything, then the \$ literal, maths, embeds before wikilinks, images
   before links, and a marker that never closes falls through to text. */
function parseInline(src) {
  const nodes = [];
  let text = "";
  let i = 0;

  const flush = () => {
    if (text !== "") nodes.push({ kind: "text", text });
    text = "";
  };
  const push = (node, length) => {
    flush();
    nodes.push(node);
    i += length;
  };

  while (i < src.length) {
    const rest = src.slice(i);
    const char = src[i];

    if (char === "`") {
      const code = INLINE_CODE.exec(rest);
      if (code && code[2].trim() !== "") {
        push({ kind: "code", text: code[2].trim() }, code[0].length);
        continue;
      }
    }

    /* `\$` is a literal dollar, the one backslash escape this parser honours. */
    if (char === "\\" && src[i + 1] === "$") {
      text += "$";
      i += 2;
      continue;
    }

    if (char === "$") {
      const m = mathSpanAt(rest);
      if (m) {
        push({ kind: "math", source: m.source, display: m.display }, m.length);
        continue;
      }
      if (src[i + 1] === "$") {
        text += "$$";
        i += 2;
        continue;
      }
    }

    if (char === "!") {
      const embed = EMBED.exec(rest);
      if (embed) {
        const caption = embed[2] && embed[2].trim();
        push(
          { kind: "embed", target: embed[1].trim(), caption: caption || null },
          embed[0].length
        );
        continue;
      }
      const image = IMAGE.exec(rest);
      if (image) {
        const src2 = safeHref(image[2]);
        if (src2 !== null) {
          push({ kind: "image", src: src2, alt: image[1] }, image[0].length);
          continue;
        }
      }
    }

    if (char === "[") {
      const wiki = WIKILINK.exec(rest);
      if (wiki) {
        const target = wiki[1].trim();
        push({ kind: "note", target, label: (wiki[2] ?? target).trim() }, wiki[0].length);
        continue;
      }
      const link = LINK.exec(rest);
      if (link) {
        const href = safeHref(link[2]);
        /* A rejected scheme is not dropped; the whole [text](url) stays on
           the page as the text it was, so nothing goes missing silently. */
        if (href !== null) {
          push({ kind: "link", href, label: link[1] }, link[0].length);
          continue;
        }
      }
    }

    if (char === "*") {
      const strong = STRONG.exec(rest);
      if (strong) {
        push({ kind: "strong", children: parseInline(strong[1]) }, strong[0].length);
        continue;
      }
      const em = EM.exec(rest);
      if (em) {
        push({ kind: "em", children: parseInline(em[1]) }, em[0].length);
        continue;
      }
    }

    if (char === "~") {
      const strike = STRIKE.exec(rest);
      if (strike) {
        push({ kind: "strike", children: parseInline(strike[1]) }, strike[0].length);
        continue;
      }
    }

    if (char === "<") {
      const auto = AUTOLINK.exec(rest);
      if (auto) {
        const href = safeHref(auto[1]);
        if (href !== null) {
          push({ kind: "link", href, label: auto[1] }, auto[0].length);
          continue;
        }
      }
      const mail = AUTOMAIL.exec(rest);
      if (mail) {
        push({ kind: "link", href: "mailto:" + mail[1], label: mail[1] }, mail[0].length);
        continue;
      }
    }

    text += char;
    i += 1;
  }

  flush();
  return nodes;
}

/* Is this paragraph nothing but a picture? `![[diagram.svg]]` on a line of
   its own is the only way the notes embed anything, and it wants a
   <figure>; a <figure> inside a <p> is invalid HTML, so an embed that
   turns up mid-sentence is rendered inline instead — markdown.ts's rule. */
function standaloneFigure(nodes) {
  const meaningful = nodes.filter((n) => n.kind !== "text" || n.text.trim() !== "");
  if (meaningful.length !== 1) return null;
  const only = meaningful[0];
  return only.kind === "embed" || only.kind === "image" ? only : null;
}

/* ==================================================================
   The renderer: the same tree NoteProse draws, as HTML strings. Every
   text node goes through esc(); the only attributes built from note text
   are href and src, and both are safeHref-gated at parse time.
   ================================================================== */

/* The tone of each callout kind as a CSS var — the web's CALLOUT_TONE over
   the G palette: accent for the question kinds, the signal colours for
   the rest, the muted ink for an unknown one. */
const TONE_VAR = {
  question: "var(--accent)", note: "var(--accent)", info: "var(--accent)",
  tip: "var(--accent)", abstract: "var(--accent)",
  success: "var(--ok)", check: "var(--ok)", done: "var(--ok)",
  failure: "var(--danger)", danger: "var(--danger)", error: "var(--danger)",
  bug: "var(--danger)",
  warning: "var(--warn)", caution: "var(--warn)", attention: "var(--warn)",
  example: "var(--violet)", quote: "var(--muted)",
};

function renderInlines(nodes, ctx) {
  let out = "";
  for (const n of nodes) {
    switch (n.kind) {
      case "text": out += esc(n.text); break;
      case "strong": out += "<strong>" + renderInlines(n.children, ctx) + "</strong>"; break;
      case "em": out += "<em>" + renderInlines(n.children, ctx) + "</em>"; break;
      case "strike": out += "<del>" + renderInlines(n.children, ctx) + "</del>"; break;
      case "code": out += "<code>" + esc(n.text) + "</code>"; break;
      case "link":
        out += '<a href="' + esc(n.href) + '">' + esc(n.label) + "</a>";
        break;
      case "note":
        /* No resolver on native yet: the label keeps the shape of a link —
           a dotted underline and the slug in the title — without being one. */
        out += '<span class="wl" title="Note: ' + esc(n.target) + '">' + esc(n.label) + "</span>";
        break;
      case "embed": out += '<span class="embed">' + esc(n.target) + "</span>"; break;
      case "image": out += '<span class="embed">' + esc(n.alt || n.src) + "</span>"; break;
      case "math": out += math(n.source, n.display); break;
    }
  }
  return out;
}

/* The named gap when an embed or image has nowhere to load from — the
   shape of the web's "not available on this page" paragraph. */
function gapParagraph(name) {
  return '<p class="gap">Embedded asset <span class="mono">' + esc(name) +
    "</span> is not available on this page.</p>";
}

/* A picture that loaded after all can still fail: swap its figure for the
   named gap, the way the web's EmbedImage island falls back. */
function imgFail(img) {
  const fig = img.closest("figure");
  if (fig) fig.outerHTML = gapParagraph(img.alt || img.getAttribute("src") || "");
}

function renderFigure(node, ctx) {
  if (node.kind === "image") {
    const name = node.alt || node.src;
    /* safeHref already admitted this src at parse time, but a webview only
       fetches http(s) — anything else (a relative path, a schemeless name)
       is the named gap rather than a broken frame. */
    if (!/^https?:/i.test(node.src)) return gapParagraph(name);
    const vector = /\.svgz?(?:[?#]|$)/i.test(node.src);
    let fig = "<figure>" +
      '<div class="' + (vector ? "mat" : "rmat") + '">' +
      '<img src="' + esc(node.src) + '" alt="' + esc(name) + '" onerror="imgFail(this)"></div>';
    if (node.alt !== "") fig += "<figcaption>" + esc(node.alt) + "</figcaption>";
    return fig + "</figure>";
  }
  /* ![[name]] — resolved by the caller to a data URI, else the gap. */
  const src = ctx.embeds && ctx.embeds[node.target];
  if (!src) return gapParagraph(node.target);
  const vector = /\.svgz?$/i.test(node.target);
  let fig = "<figure>" +
    '<div class="' + (vector ? "mat" : "rmat") + '">' +
    '<img src="' + src + '" alt="' + esc(node.target) + '" onerror="imgFail(this)"></div>';
  if (node.caption) fig += "<figcaption>" + esc(node.caption) + "</figcaption>";
  return fig + "</figure>";
}

function renderCode(b) {
  return '<div class="cb">' +
    (b.info !== "" ? '<p class="cbinfo">' + esc(b.info) + "</p>" : "") +
    "<pre><code>" + esc(b.text) + "</code></pre></div>";
}

function renderTable(b, ctx) {
  const align = (i) => (b.aligns[i] ? ' style="text-align:' + b.aligns[i] + '"' : "");
  let html = '<div class="tw"><table><thead><tr>';
  b.header.forEach((cell, ci) => {
    html += "<th" + align(ci) + ">" + renderInlines(parseInline(cell.trim()), ctx) + "</th>";
  });
  html += "</tr></thead>";
  if (b.rows.length > 0) {
    html += "<tbody>";
    for (const row of b.rows) {
      html += "<tr>";
      row.forEach((cell, ci) => {
        html += "<td" + align(ci) + ">" + renderInlines(parseInline(cell.trim()), ctx) + "</td>";
      });
      html += "</tr>";
    }
    html += "</tbody>";
  }
  return html + "</table></div>";
}

function renderBlocks(blocks, ctx) {
  let html = "";
  for (const b of blocks) {
    switch (b.kind) {
      case "heading": {
        /* h4 is the last drawn size — the web's clamp, so #### and below
           read alike rather than shrinking past the body text. */
        const l = Math.min(4, Math.max(1, b.level));
        html += "<h" + l + ">" + renderInlines(parseInline(b.text), ctx) + "</h" + l + ">";
        break;
      }
      case "paragraph": {
        const nodes = parseInline(b.text);
        const fig = standaloneFigure(nodes);
        html += fig ? renderFigure(fig, ctx) : "<p>" + renderInlines(nodes, ctx) + "</p>";
        break;
      }
      case "code": html += renderCode(b); break;
      case "rule": html += "<hr>"; break;
      case "list": {
        const tag = b.ordered ? "ol" : "ul";
        html += "<" + tag + (b.ordered && b.start !== 1 ? ' start="' + b.start + '"' : "") + ">";
        for (const item of b.items) html += "<li>" + renderBlocks(item, ctx) + "</li>";
        html += "</" + tag + ">";
        break;
      }
      case "quote": {
        if (b.callout === null) {
          html += "<blockquote>" + renderBlocks(b.blocks, ctx) + "</blockquote>";
        } else {
          const tone = TONE_VAR[b.callout] || "var(--muted)";
          html += '<aside class="callout" style="--tone:' + tone + '">' +
            '<p class="ctitle">' + esc(b.title) + "</p>" +
            '<div class="cbody">' + renderBlocks(b.blocks, ctx) + "</div></aside>";
        }
        break;
      }
      case "math": html += math(b.source, true); break;
      case "table": html += renderTable(b, ctx); break;
    }
  }
  return html;
}
