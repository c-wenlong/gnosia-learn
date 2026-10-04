/**
 * The words a diagram shows, read out of its SVG: every label, title and
 * caption, one per line, in document order, for a prompt that has to know
 * what the picture says.
 *
 * A tldrawkc export embeds its fonts as base64 inside `<style>` and draws
 * its labels as `<text>` or as HTML inside `<foreignObject>`, so the styles,
 * scripts and `<defs>` are dropped first, then every tag becomes a line
 * break and the entities are decoded. Attribute values (paths, data URLs)
 * go with their tags. No markup is interpreted, and nothing here is
 * rendered, so a hostile SVG can only contribute text.
 */
export function svgText(svg: string): string {
  const body = svg.replace(/<(style|script|defs)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const text = body.replace(/<[^>]*>/g, "\n");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[name.toLowerCase()] ?? whole;
  });
}
