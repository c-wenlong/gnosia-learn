#!/usr/bin/env python3
"""Render style-guide.html from tokens.json + tools/style-guide.template.html.

Every colour in the page is a CSS custom property generated from tokens.json, so the
guide cannot drift from the token file. Re-run after editing tokens.
"""
import json, pathlib, html
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

def family_key(v):
    return v["fontFamily"].strip("{}").split(".")[1]

def css_val(t):
    v, ty = t["$value"], t["$type"]
    if ty == "cubicBezier":
        return "cubic-bezier(%s)" % ", ".join(str(x) for x in v)
    if ty == "shadow":
        return ", ".join(f'{s["offsetX"]} {s["offsetY"]} {s["blur"]} {s["spread"]} {s["color"]}' for s in v)
    if ty == "typography":
        # Point at the page's font stack (--ff-*), not the bare family, so the public
        # fallbacks apply when Google Sans is not installed.
        return f'{v["fontWeight"]} {v["fontSize"]}/{v["lineHeight"]} var(--ff-{family_key(v)})'
    if ty == "fontFamily":
        return f'"{v}"'
    return str(v)

core_css = "\n".join(f"  --{n}: {css_val(t)};" for n, t in flat(T["core"]))
light_css = "\n".join(f"  --{n}: {css_val(t)};" for n, t in flat(T["light"]))
dark_css = "\n".join(f"  --{n}: {css_val(t)};" for n, t in flat(T["dark"]))

# swatch tables per group
def swatches(group):
    rows = []
    for n, t in flat(T["light"][group], group + "-"):
        d = dict(flat(T["dark"][group], group + "-"))[n]
        est = "estimated" in t["$extensions"]["source"] or "estimated" in d["$extensions"]["source"]
        rows.append(
            f'<div class="sw"><div class="chip" style="background:var(--{n})"></div>'
            f'<div class="sw-meta"><code>{n}</code><span>{t["$value"]} / {d["$value"]}</span>'
            f'<small>{html.escape(t.get("$description",""))}{" · <b>estimated</b>" if est else ""}</small></div></div>')
    return "\n".join(rows)

def ink(hexv):
    # dark label on light steps, light label on dark steps
    h = hexv.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return "#1b1b1c" if (0.299 * r + 0.587 * g + 0.114 * b) > 150 else "#ffffff"

def palette(fam):
    return "\n".join(f'<div class="ramp-step" style="background:var(--palette-{fam}-{k});color:{ink(t["$value"])}"><span>{k}</span><span>{t["$value"]}</span></div>'
                     for k, t in T["core"]["palette"][fam].items())

type_rows = "\n".join(
    f'<tr><td><code>{k}</code></td><td style="font:var(--typography-{k});letter-spacing:{t["$value"]["letterSpacing"]}">The quick brown fox</td>'
    f'<td>{T["core"]["fontFamily"][family_key(t["$value"])]["$value"]} · {t["$value"]["fontSize"]}/{t["$value"]["lineHeight"]} · {t["$value"]["fontWeight"]} · {t["$value"]["letterSpacing"]}</td>'
    f'<td>{html.escape(t.get("$description",""))}</td></tr>'
    for k, t in T["core"]["typography"].items())

def dim_rows(group):
    return "\n".join(f'<tr><td><code>{group}.{k}</code></td><td>{t["$value"]}</td><td>{html.escape(t.get("$description",""))}</td><td class="src">{html.escape(t["$extensions"]["source"])}</td></tr>'
                     for k, t in T["core"][group].items())

radius_demo = "\n".join(f'<div class="rad" style="border-radius:var(--radius-{k})"><code>{k}</code><span>{t["$value"]}</span></div>' for k, t in T["core"]["radius"].items())
shadow_demo = "\n".join(f'<div class="shd" style="box-shadow:var(--shadow-{k})"><code>{k}</code><small>{html.escape(t.get("$description",""))}</small></div>' for k, t in T["core"]["shadow"].items())
spacing_demo = "\n".join(f'<div class="sp"><div style="width:var(--spacing-{k})"></div><code>{k}</code></div>' for k in T["core"]["spacing"])
motion_rows = "\n".join(f'<tr><td><code>easing.{k}</code></td><td>{css_val(t)}</td><td class="src">{t["$extensions"]["source"]}</td><td><div class="ease-track"><div class="ease-dot" style="transition-timing-function:var(--easing-{k})"></div></div></td></tr>' for k, t in T["core"]["easing"].items())
dur_rows = " · ".join(f'<code>{k}</code> {t["$value"]}' for k, t in T["core"]["duration"].items())

tpl = (HERE / "tools" / "style-guide.template.html").read_text()
for key, val in {
    "CORE_CSS": core_css, "LIGHT_CSS": light_css, "DARK_CSS": dark_css,
    "SW_BG": swatches("bg"), "SW_SURFACE": swatches("surface"), "SW_BORDER": swatches("border"),
    "SW_TEXT": swatches("text"), "SW_ACCENT": swatches("accent"), "SW_STATE": swatches("state"),
    "SW_STATUS": swatches("status"), "SW_TILE": swatches("tile"), "SW_PASTEL": swatches("pastel"),
    "SW_DATAVIZ": swatches("dataviz"), "SW_SKEL": swatches("skeleton"),
    "PAL_GREY": palette("grey"), "PAL_BLUE": palette("blue"), "PAL_GREEN": palette("green"), "PAL_BRAND": palette("brand"), "PAL_ICON": palette("icon"),
    "TYPE_ROWS": type_rows, "RADIUS": radius_demo, "SHADOWS": shadow_demo, "SPACING": spacing_demo,
    "SIZE_ROWS": dim_rows("size"), "BP_ROWS": dim_rows("breakpoint"), "BW_ROWS": dim_rows("borderWidth"),
    "BLUR_ROWS": dim_rows("blur"), "MOTION_ROWS": motion_rows, "DUR_ROWS": dur_rows,
}.items():
    tpl = tpl.replace("{{" + key + "}}", val)
(HERE / "style-guide.html").write_text(tpl)
print("wrote style-guide.html", len(tpl), "bytes")
