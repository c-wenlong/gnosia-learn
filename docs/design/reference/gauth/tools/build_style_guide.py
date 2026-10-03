#!/usr/bin/env python3
"""Render style-guide.html from tokens.json + tools/style-guide.template.html.

Every colour, radius, shadow and type style in the page is a CSS custom property generated from
tokens.json, so the guide cannot drift from the token file. Aliases like {palette.ink.900} become
var(--palette-ink-900). Gauth paints one theme, so the page is light only. Adapted from the
Coursera kit's builder.

The template carries three kinds of placeholder:
  /*CORE*/ /*LIGHT*/              CSS custom property blocks
  /*TOKENS*/null                  a compact copy of the token tree for the JS tables
  <!--icon:NAME[:SIZE]-->         an SVG from icons/NAME.svg, inlined

Deterministic: same inputs, byte-identical output. Re-run after editing tokens.
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent.parent
T = json.loads((HERE / "tokens.json").read_text())


def flat(node, prefix=""):
    for k, v in node.items():
        if k.startswith("$"):
            continue
        if isinstance(v, dict) and "$value" in v:
            yield prefix + k, v
        elif isinstance(v, dict):
            yield from flat(v, prefix + k + "-")


def cssname(path):
    return "--" + re.sub(r"[^a-zA-Z0-9-]", "-", path.replace(".", "-"))


def alias(v):
    return re.sub(r"\{([^{}]+)\}", lambda m: f"var({cssname(m.group(1))})", str(v))


def typo(v):
    fam = alias(v["fontFamily"])
    return f'{v["fontWeight"]} {v["fontSize"]}/{v["lineHeight"]} {fam}'


def css_val(name, t):
    v, ty = t["$value"], t["$type"]
    if ty == "cubicBezier":
        return "cubic-bezier(%s)" % ", ".join(str(x) for x in v)
    if ty == "shadow":
        return ", ".join(("inset " if s.get("inset") else "") + f'{s["offsetX"]} {s["offsetY"]} {s["blur"]} {s["spread"]} {alias(s["color"])}' for s in v)
    if ty == "typography":
        return typo(v)
    if ty == "number" and "letterSpacing" in name:
        return f"{v}em"
    if ty == "gradient":
        angle = t["$extensions"].get("angle", "180deg")
        return f"linear-gradient({angle}, " + ", ".join(f'{alias(s["color"])} {round(s["position"] * 100)}%' for s in v) + ")"
    if ty == "fontFamily":
        # Gauth's lesson faces are aliases: Canvas Print is Satoshi, Canvas Chapter is Libre Baskerville
        # Bold. The guide names the real family after each alias, and points Gauth's own
        # var(--canvas-print-font) at the token that holds it.
        return (v.replace('"Canvas Print"', '"Canvas Print", "Satoshi"')
                 .replace('"Canvas Chapter"', '"Canvas Chapter", "Libre Baskerville"')
                 .replace("var(--canvas-print-font)", "var(--fontFamily-canvas-print)"))
    return alias(v)


def block(setname):
    lines = []
    for n, t in flat(T[setname]):
        lines.append(f"  {cssname(n)}: {css_val(n, t)};")
        if t["$type"] == "typography":
            lines.append(f"  {cssname(n)}-ls: {alias(t['$value']['letterSpacing'])};")
    return "\n".join(lines)


def slim(node):
    if isinstance(node, dict) and "$value" in node:
        out = {"v": node["$value"], "t": node["$type"], "s": node["$extensions"]["source"], "d": node.get("$description", "")}
        if node["$extensions"].get("responsive"):
            out["r"] = node["$extensions"]["responsive"]
        return out
    return {k: slim(v) for k, v in node.items() if not k.startswith("$")}


data = json.dumps({k: slim(T[k]) for k in ("core", "light")}, ensure_ascii=False, separators=(",", ":"))

_uid = [0]


def clean_svg(svg, size):
    svg = re.sub(r"<\?xml[^>]*>\s*", "", svg).strip()
    svg = re.sub(r"\s+", " ", svg).replace("> <", "><")
    svg = re.sub(r"<title>.*?</title>", "", svg)
    ids = sorted(set(re.findall(r'id="([^"]+)"', svg)))
    for i in ids:
        _uid[0] += 1
        new = f"i{_uid[0]}"
        svg = svg.replace(f'id="{i}"', f'id="{new}"').replace(f"url(#{i})", f"url(#{new})")
    svg = re.sub(r"<svg\b", '<svg aria-hidden="true" focusable="false" class="ic"', svg, count=1)
    if size:
        svg = re.sub(r'\swidth="[^"]*"', "", svg, count=1)
        svg = re.sub(r'\sheight="[^"]*"', "", svg, count=1)
        svg = svg.replace("<svg ", f'<svg width="{size}" height="{size}" ', 1)
    return svg


ICON_SRC = {}


def icon(m):
    name, size = m.group(1), m.group(2)
    src = ICON_SRC.setdefault(name, (HERE / "icons" / f"{name}.svg").read_text())
    return clean_svg(src, size)


tpl = (HERE / "tools" / "style-guide.template.html").read_text()
html = tpl.replace("/*CORE*/", block("core")).replace("/*LIGHT*/", block("light")).replace("/*TOKENS*/null", data)
html = re.sub(r"<!--icon:([a-z0-9-]+)(?::(\d+))?-->", icon, html)
(HERE / "style-guide.html").write_text(html)
print("style-guide.html:", len(html.encode()), "bytes;", len(list(flat(T["core"]))), "core +", len(list(flat(T["light"]))), "light tokens;", len(ICON_SRC), "icons")
