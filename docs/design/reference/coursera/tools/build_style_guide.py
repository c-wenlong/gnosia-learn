#!/usr/bin/env python3
"""Render style-guide.html from tokens.json + tools/style-guide.template.html.

Every colour, radius, shadow and type style in the page is a CSS custom property generated from
tokens.json, so the guide cannot drift from the token file. Aliases like {palette.blue.800} become
var(--palette-blue-800); the palette ramps hold CDS's light values, and the theme switch works by
redefining only the light/dark sets (the semantic roles and the component colours).

The template carries three kinds of placeholder:
  /*CORE*/ /*LIGHT*/ /*DARK*/ /*RESPONSIVE*/   CSS custom property blocks
  /*TOKENS*/null                               a compact copy of the token tree for the JS tables
  <!--icon:NAME[:SIZE]-->                      an SVG from icons/NAME.svg, inlined
  <!--snap:NAME[:SIZE]-->                      an SVG lifted from a raw/snapshots page (SNAP_ICONS below)

Deterministic: same inputs, byte-identical output. Re-run after editing tokens.
"""
import gzip, json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent.parent
T = json.loads((HERE / "tokens.json").read_text())
FONT_STACK = {
    # Coursera serves Source Sans Pro as Source Sans 3 (open licence); the page loads Source Sans 3
    "source-sans-pro": '"Source Sans Pro", "Source Sans 3", Arial, sans-serif',
}
BREAKPOINTS = {"below 1024": "(max-width: 1023.95px)", "below 600": "(max-width: 599.95px)"}

# Icons the signed-in pages draw that icons/ does not hold: taken from the redacted snapshot the
# measurements were read from, by the class or anchor named here.
SNAP_ICONS = {
    "completed": ("learn-home-module-in-progress", "rc-WeekSingleItemDisplayRefresh", 'class="css-1uz4a97"'),
    "timeline-start": ("learn-home-module-in-progress", 'data-testid="course-timeline-card"', "<svg"),
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


def font_stack(name, value):
    if name in FONT_STACK:
        return FONT_STACK[name]
    return ", ".join(f'"{p.strip()}"' if " " in p.strip() else p.strip() for p in value.split(","))


def typo(v):
    fam = v["fontFamily"].strip("{}").split(".")[1]
    return f'{v["fontWeight"]} {v["fontSize"]}/{v["lineHeight"]} var(--ff-{fam})'


def css_val(name, t):
    v, ty = t["$value"], t["$type"]
    if ty == "cubicBezier":
        return "cubic-bezier(%s)" % ", ".join(str(x) for x in v)
    if ty == "shadow":
        return ", ".join(("inset " if s.get("inset") else "") + f'{s["offsetX"]} {s["offsetY"]} {s["blur"]} {s["spread"]} {alias(s["color"])}' for s in v)
    if ty == "typography":
        return typo(v)
    if ty == "number" and name.startswith("letterSpacing-"):
        return f"{v}em"  # tokens.json stores an em letter-spacing as its number of ems
    if ty == "fontFamily":
        return font_stack(name.split("-", 1)[1], v)
    return alias(v)


def block(setname):
    lines = []
    for n, t in flat(T[setname]):
        lines.append(f"  {cssname(n)}: {css_val(n, t)};")
        if t["$type"] == "typography":
            lines.append(f"  {cssname(n)}-ls: {t['$value']['letterSpacing']};")
    return "\n".join(lines)


def responsive():
    out = []
    for label, query in BREAKPOINTS.items():
        lines = []
        for n, t in flat(T["core"]["typography"], "typography-"):
            r = t["$extensions"].get("responsive", {}).get(label)
            if r:
                v = dict(t["$value"], **r)
                lines.append(f"  {cssname(n)}: {typo(v)};")
        if lines:
            out.append(f"@media {query} {{ :root {{\n" + "\n".join(lines) + "\n} }")
    return "\n".join(out)


core_css = block("core") + "\n" + "\n".join(f"  --ff-{n.split('-', 1)[1]}: {font_stack(n.split('-', 1)[1], t['$value'])};"
                                             for n, t in flat(T["core"]["fontFamily"], "fontFamily-"))
light_css, dark_css = block("light"), block("dark")


def slim(node):
    if isinstance(node, dict) and "$value" in node:
        out = {"v": node["$value"], "t": node["$type"], "s": node["$extensions"]["source"], "d": node.get("$description", "")}
        if node["$extensions"].get("responsive"):
            out["r"] = node["$extensions"]["responsive"]
        return out
    return {k: slim(v) for k, v in node.items() if not k.startswith("$")}


data = json.dumps({k: slim(T[k]) for k in ("core", "light", "dark")}, ensure_ascii=False, separators=(",", ":"), sort_keys=False)

# ---------- icons ----------
_uid = [0]


def clean_svg(svg, size):
    svg = re.sub(r"<\?xml[^>]*>\s*", "", svg).strip()
    svg = re.sub(r"\s+", " ", svg).replace("> <", "><")
    svg = re.sub(r"<title>.*?</title>", "", svg)
    svg = svg.replace(' role="img"', "")
    # the shaded disc behind item-type icons: CDS paints it with --cds-color-emphasis-neutral-background-weak
    svg = svg.replace('fill="#e9eef7"', 'fill="var(--emphasis-neutral-background-weak)"')
    svg = re.sub(r'\s(?:class|focusable|aria-hidden|style|color)="[^"]*"', "", svg)
    ids = sorted(set(re.findall(r'id="([^"]+)"', svg)))
    for i in ids:
        _uid[0] += 1
        new = f"i{_uid[0]}"
        svg = svg.replace(f'id="{i}"', f'id="{new}"').replace(f"url(#{i})", f"url(#{new})")
    svg = re.sub(r'url\(#\)', "none", svg)
    svg = re.sub(r'<svg\b', '<svg aria-hidden="true" focusable="false" class="ic"', svg, count=1)
    if size:
        svg = re.sub(r'\swidth="[^"]*"', "", svg, count=1)
        svg = re.sub(r'\sheight="[^"]*"', "", svg, count=1)
        svg = svg.replace("<svg ", f'<svg width="{size}" height="{size}" ', 1)
    return svg


ICON_SRC = {}


def icon(m):
    kind, name, size = m.group(1), m.group(2), m.group(3)
    if kind == "icon":
        src = ICON_SRC.setdefault(name, (HERE / "icons" / f"{name}.svg").read_text())
    else:
        snap, anchor, marker = SNAP_ICONS[name]
        if name not in ICON_SRC:
            html = gzip.open(HERE / "raw" / "snapshots" / f"{snap}.html.gz", "rt", encoding="utf-8", errors="ignore").read()
            start = html.index(marker, html.index(anchor))
            start = html.rindex("<svg", 0, start + len(marker))
            ICON_SRC[name] = html[start:html.index("</svg>", start) + 6]
        src = ICON_SRC[name]
    return clean_svg(src, size)


tpl = (HERE / "tools" / "style-guide.template.html").read_text()
html = (tpl.replace("/*CORE*/", core_css).replace("/*LIGHT*/", light_css).replace("/*DARK*/", dark_css)
        .replace("/*RESPONSIVE*/", responsive()).replace("/*TOKENS*/null", data))
html = re.sub(r"<!--(icon|snap):([a-z0-9-]+)(?::(\d+))?-->", icon, html)
(HERE / "style-guide.html").write_text(html)
print("style-guide.html:", len(html.encode()), "bytes;", len(list(flat(T["core"]))), "core +", len(list(flat(T["light"]))), "light +",
      len(list(flat(T["dark"]))), "dark tokens;", len(ICON_SRC), "icons")
