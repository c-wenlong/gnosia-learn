#!/usr/bin/env python3
"""Render style-guide.html from tokens.json + tools/style-guide.template.html.

Every colour, radius, shadow and type style on the page is a CSS custom property generated from
tokens.json, so the guide cannot drift from the token file. The `core` and `light` sets go on
`:root` and the `dark` set on `.dark`, which is how Manus itself switches: the guide's theme toggle
flips that one class. Aliases like {text.primary} become var(--text-primary).

Placeholders in the template:
  /*CORE*/ /*LIGHT*/ /*DARK*/     CSS custom property blocks
  /*TOKENS*/null                  a compact copy of the token tree for the JS tables
  <!--icon:NAME[:SIZE]-->         an SVG from icons/NAME.svg, inlined

Deterministic: same inputs, byte-identical output. Adapted from the Gauth kit's builder.
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


def css_val(name, t):
    v, ty = t["$value"], t["$type"]
    if ty == "cubicBezier":
        return "cubic-bezier(%s)" % ", ".join(str(x) for x in v)
    if ty == "shadow":
        return ", ".join(("inset " if s.get("inset") else "") + f'{s["offsetX"]} {s["offsetY"]} {s["blur"]} {s["spread"]} {alias(s["color"])}' for s in v)
    if ty == "typography":
        return f'{alias(v["fontWeight"])} {alias(v["fontSize"])}/{alias(v["lineHeight"])} {alias(v["fontFamily"])}'
    if ty == "gradient":
        angle = t["$extensions"].get("angle", "180deg")
        return f"linear-gradient({angle}, " + ", ".join(f'{alias(s["color"])} {round(s["position"] * 100, 2)}%' for s in v) + ")"
    return alias(v)


def block(setname):
    return "\n".join(f"  {cssname(n)}: {css_val(n, t)};" for n, t in flat(T[setname]))


def slim(node):
    if isinstance(node, dict) and "$value" in node:
        out = {"v": node["$value"], "t": node["$type"], "s": node["$extensions"]["source"]}
        for k in ("compact", "standardDesktop", "angle"):
            if k in node["$extensions"]:
                out[k] = node["$extensions"][k]
        if node.get("$description"):
            out["d"] = node["$description"]
        return out
    return {k: slim(v) for k, v in node.items() if not k.startswith("$")}


data = json.dumps({k: slim(T[k]) for k in ("core", "light", "dark")}, ensure_ascii=False, separators=(",", ":"))

_uid = [0]
ICON_SRC = {}


def clean_svg(svg, size):
    svg = re.sub(r"<\?xml[^>]*>\s*", "", svg).strip()
    svg = re.sub(r"\s+", " ", svg).replace("> <", "><")
    for i in sorted(set(re.findall(r'id="([^"]+)"', svg))):
        _uid[0] += 1
        svg = svg.replace(f'id="{i}"', f'id="i{_uid[0]}"').replace(f"url(#{i})", f"url(#i{_uid[0]})")
    svg = re.sub(r"<svg\b", '<svg aria-hidden="true" focusable="false" class="ic"', svg, count=1)
    if size:
        svg = re.sub(r'\swidth="[^"]*"', "", svg, count=1)
        svg = re.sub(r'\sheight="[^"]*"', "", svg, count=1)
        svg = svg.replace("<svg ", f'<svg width="{size}" height="{size}" ', 1)
    return svg


def icon(m):
    name, size = m.group(1), m.group(2)
    src = ICON_SRC.setdefault(name, (HERE / "icons" / f"{name}.svg").read_text())
    return clean_svg(src, size)


tpl = (HERE / "tools" / "style-guide.template.html").read_text()
html = (tpl.replace("/*CORE*/", block("core")).replace("/*LIGHT*/", block("light")).replace("/*DARK*/", block("dark"))
        .replace("/*TOKENS*/null", data))
html = re.sub(r"<!--icon:([a-z0-9-]+)(?::(\d+))?-->", icon, html)
(HERE / "style-guide.html").write_text(html)
print("style-guide.html:", len(html.encode()), "bytes;", len(list(flat(T["core"]))), "core +", len(list(flat(T["light"]))), "light +",
      len(list(flat(T["dark"]))), "dark tokens;", len(ICON_SRC), "icons")
