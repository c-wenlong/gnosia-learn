#!/usr/bin/env python3
"""Render style-guide.html from tokens.json + tools/style-guide.template.html.

Every colour, size, radius, shadow and type style in the page is a CSS custom property generated
from tokens.json, so the guide cannot drift from the token file. Re-run after editing tokens.
Aliases like {palette.gray.950} become var(--palette-gray-950), so the theme switch works by
redefining only the light/dark sets.
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent.parent
T = json.loads((HERE / "tokens.json").read_text())
FONT_STACK = {
    "brilliant": '"CoFo Brilliant", "Figtree", system-ui, -apple-system, "Segoe UI", sans-serif',
    "robert": '"CoFo Robert", Georgia, "Times New Roman", serif',
    "semiMono": '"CoFo Semi Mono", "Source Code Pro", ui-monospace, monospace',
    "code": '"Source Code Pro", ui-monospace, "SF Mono", Menlo, monospace',
    "math": 'KaTeX_Main, "Times New Roman", serif',
    "legacy": 'Soleil, "Figtree", system-ui, sans-serif',
}


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


def css_val(name, t):
    v, ty = t["$value"], t["$type"]
    if ty == "cubicBezier":
        return "cubic-bezier(%s)" % ", ".join(str(x) for x in v)
    if ty == "shadow":
        return ", ".join(("inset " if s.get("type") == "innerShadow" else "") + f'{s["offsetX"]} {s["offsetY"]} {s["blur"]} {s["spread"]} {alias(s["color"])}' for s in v)
    if ty == "typography":
        fam = v["fontFamily"].strip("{}").split(".")[1]
        return f'{v["fontWeight"]} {v["fontSize"]}/{v["lineHeight"]} var(--ff-{fam})'
    if ty == "fontFamily":
        return FONT_STACK.get(name.split("-", 1)[1], f'"{v}"')
    return alias(v)


def block(setname):
    lines = []
    for n, t in flat(T[setname]):
        lines.append(f"  {cssname(n)}: {css_val(n, t)};")
        if t["$type"] == "typography":
            v = t["$value"]
            lines.append(f"  {cssname(n)}-ls: {v['letterSpacing']};")
            if v.get("textCase"):
                lines.append(f"  {cssname(n)}-tt: {v['textCase']};")
    return "\n".join(lines)


core_css = block("core") + "\n" + "\n".join(f"  --ff-{k}: {v};" for k, v in FONT_STACK.items())
light_css, dark_css = block("light"), block("dark")

# a compact copy of the token tree for the tables the page draws with JS
def slim(node):
    if isinstance(node, dict) and "$value" in node:
        return {"v": node["$value"], "t": node["$type"], "s": node["$extensions"]["source"], "d": node.get("$description", "")}
    return {k: slim(v) for k, v in node.items() if not k.startswith("$")}


data = json.dumps({k: slim(T[k]) for k in ("core", "light", "dark")}, ensure_ascii=False, separators=(",", ":"))
tpl = (HERE / "tools" / "style-guide.template.html").read_text()
html = (tpl.replace("/*CORE*/", core_css).replace("/*LIGHT*/", light_css).replace("/*DARK*/", dark_css)
        .replace("/*TOKENS*/null", data))
(HERE / "style-guide.html").write_text(html)
print("style-guide.html:", len(html), "bytes;", len(list(flat(T["core"]))), "core +", len(list(flat(T["light"]))), "per theme")
