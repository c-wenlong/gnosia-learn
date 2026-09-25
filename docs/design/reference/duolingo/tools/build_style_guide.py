#!/usr/bin/env python3
"""Render style-guide.html from tokens.json + tools/style-guide.template.html.

Every colour, size and curve in the page is a CSS custom property generated from
tokens.json, so the guide cannot drift from the token file. Re-run after editing
tokens or the template; never edit style-guide.html by hand.

    cd tools && python3 build_style_guide.py            # writes ../style-guide.html
    python3 build_style_guide.py --out ../x.html --only buttons   # one section (preview)

Template placeholders:
    {{TOKEN_CSS}}          every token as a custom property (core, light, dark)
    {{PALETTE}} {{ROLES}} {{TYPE_ROWS}} {{SPACING}} {{RADII}} {{BORDER_WIDTHS}}
    {{SHADOWS}} {{OPACITY}} {{FILTERS}} {{MOTION}} {{DURATIONS}} {{BREAKPOINTS}}
    {{SIZES}} {{ZINDEX}} {{FONTS}} {{COUNTS}}
    {{CROP:base}}          the product crop(s) crops/<base>-light.png / -dark.png,
                           shown for the current theme (falls back to the other theme)
    {{INCLUDE:file}}       inline another template file (path relative to tools/)
    <!--SECTION:name--> ... <!--/SECTION:name-->   blocks that --only can select
"""
import argparse, html, json, pathlib, re, struct

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
T = json.loads((ROOT / "tokens.json").read_text())
CORE, LIGHT, DARK = T["core"], T["light"], T["dark"]
PAL_L, PAL_D = CORE["palette"]["light"], CORE["palette"]["dark"]


# ------------------------------------------------------------------ helpers
def flat(node, prefix=""):
    """Yield (dotted.path, token) for every leaf token under node."""
    for k, v in node.items():
        if k.startswith("$"):
            continue
        if isinstance(v, dict) and "$value" in v:
            yield prefix + k, v
        elif isinstance(v, dict):
            yield from flat(v, prefix + k + ".")


def var_name(path):
    return "--" + path.replace(".", "-")


def esc(s):
    return html.escape(str(s or ""), quote=True)


def src(t):
    return t.get("$extensions", {}).get("source", "")


def hex_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def luminance(h):
    lin = []
    for c in hex_rgb(h):
        c /= 255
        lin.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def ink(h):
    """Swatch label colour with the higher WCAG contrast against the swatch."""
    return max(("#1b1b1b", "#ffffff"), key=lambda c: contrast(c, h))


SEM_THEMES = {"light": LIGHT, "dark": DARK}


def resolve_ref(ref, theme):
    """'{palette.light.owl}' -> ('owl', '#58cc02'); '{accent.primary.lip}' -> semantic var."""
    path = ref.strip("{}").split(".")
    if path[0] == "palette":
        name = path[2]
        return ("palette", name, CORE["palette"][path[1]][name]["$value"])
    node = SEM_THEMES[theme]
    for p in path:
        node = node[p]
    return ("semantic", ".".join(path), node)


def sem_css_value(tok, theme):
    """CSS value of a semantic colour token: a var() on the theme palette, alpha applied."""
    kind, name, val = resolve_ref(tok["$value"], theme)
    mod = tok.get("$extensions", {}).get("studio.tokens", {}).get("modify")
    if mod and mod.get("type") == "alpha":
        r, g, b = hex_rgb(val)
        return f"rgb({r} {g} {b} / {mod['value']})"
    return f"var(--palette-{theme}-{name})"


def sem_hex(tok, theme):
    kind, name, val = resolve_ref(tok["$value"], theme)
    mod = tok.get("$extensions", {}).get("studio.tokens", {}).get("modify")
    return name, val, (mod or {}).get("value")


def color_css(v):
    if isinstance(v, str) and v.startswith("{"):
        return f"var({var_name(v.strip('{}'))})"
    return v


def typo_font(v):
    w = v["fontWeight"]
    if isinstance(w, str) and w.startswith("{"):
        w = CORE["fontWeight"][w.strip("{}").split(".")[1]]["$value"]
    fam = v["fontFamily"].strip("{}").split(".")[1]
    return w, f'{w} {v["fontSize"]}/{v["lineHeight"]} var(--ff-{fam})'


def css_val(t):
    v, ty = t["$value"], t["$type"]
    if ty == "cubicBezier":
        return "cubic-bezier(%s)" % ", ".join(str(x) for x in v)
    if ty == "shadow":
        items = v if isinstance(v, list) else [v]
        return ", ".join(f'{s["offsetX"]} {s["offsetY"]} {s["blur"]} {s["spread"]} {color_css(s["color"])}' for s in items)
    if ty == "fontFamily":
        return f'"{v}"'
    return str(v)


# ------------------------------------------------------------------ token CSS
def token_css():
    out = ["/* ===== core: palette, both themes (generated) ===== */", ":root {"]
    for name, t in PAL_L.items():
        out.append(f"  --palette-light-{name}: {t['$value']};")
    for name, t in PAL_D.items():
        out.append(f"  --palette-dark-{name}: {t['$value']};")
    out.append("}")
    out.append("/* ===== core: everything else (generated) ===== */")
    out.append(":root {")
    for group, node in CORE.items():
        if group == "palette":
            continue
        for path, t in flat(node, group + "."):
            if t["$type"] == "typography":
                v = t["$value"]
                _, font = typo_font(v)
                out.append(f"  {var_name(path)}: {font};")
                out.append(f"  {var_name(path)}-tracking: {v.get('letterSpacing', '0px')};")
                out.append(f"  {var_name(path)}-case: {v.get('textCase', 'none')};")
            else:
                out.append(f"  {var_name(path)}: {css_val(t)};")
    out.append("}")
    for theme, sem in (("light", LIGHT), ("dark", DARK)):
        sel = ':root, :root[data-theme="light"], [data-theme="light"]' if theme == "light" else ':root[data-theme="dark"], [data-theme="dark"]'
        out.append(f"/* ===== {theme} theme: semantic roles + theme palette (generated) ===== */")
        out.append(sel + " {")
        out.append(f"  color-scheme: {theme};")
        for path, t in flat(sem):
            out.append(f"  {var_name(path)}: {sem_css_value(t, theme)};")
        out.append(f"  /* the Duolingo palette as the app sees it in this theme: --c-<name> */")
        for name in PAL_L:
            out.append(f"  --c-{name}: var(--palette-{theme}-{name});")
        out.append("}")
    return "\n".join(out)


# ------------------------------------------------------------------ sections
def palette_html():
    groups = {}
    for name, t in PAL_L.items():
        groups.setdefault(src(t), []).append(name)
    parts = []
    labels = {}
    for i, (s, names) in enumerate(sorted(groups.items(), key=lambda kv: len(kv[1]))):
        title = "Core palette" if len(names) < 100 else "Extended palette"
        parts.append(f'<h3>{title} <small>{len(names)} names, {esc(s)}</small></h3><div class="pal-grid">')
        for n in names:
            lh, dh = PAL_L[n]["$value"], PAL_D[n]["$value"]
            parts.append(
                f'<div class="pal" title="{esc(n)}"><div class="pal-sw">'
                f'<span style="background:var(--palette-light-{n});color:{ink(lh)}">{lh}</span>'
                f'<span style="background:var(--palette-dark-{n});color:{ink(dh)}">{dh}</span></div>'
                f'<code>{esc(n)}</code></div>')
        parts.append("</div>")
    return "\n".join(parts)


def roles_html():
    out = []
    top = [k for k in LIGHT if not k.startswith("$")]
    for g in top:
        out.append(f'<h3>{esc(g)}</h3><div class="role-grid">')
        for path, t in flat(LIGHT[g], g + "."):
            d = dict(flat(DARK))[path]
            ln, lh, la = sem_hex(t, "light")
            dn, dh, da = sem_hex(d, "dark")
            la_s = f" @{la}" if la else ""
            da_s = f" @{da}" if da else ""
            out.append(
                f'<div class="role"><div class="role-sw">'
                f'<span class="lt" style="background:{sem_css_value(t, "light")};color:{ink(lh) if not la else "#1b1b1b"}">{lh}{la_s}</span>'
                f'<span class="dk" style="background:{sem_css_value(d, "dark")};color:{ink(dh) if not da else "#ffffff"}">{dh}{da_s}</span></div>'
                f'<div class="role-meta"><code>{var_name(path)}</code>'
                f'<span class="role-alias">{esc(ln)} / {esc(dn)}</span>'
                f'<small>{esc(t.get("$description", ""))}</small></div></div>')
        out.append("</div>")
    return "\n".join(out)


def type_rows():
    rows = []
    for path, t in flat(CORE["typography"], "typography."):
        v = t["$value"]
        w, _ = typo_font(v)
        case = v.get("textCase", "none")
        vn = var_name(path)
        rows.append(
            f'<tr><td><code>{path[len("typography."):]}</code></td>'
            f'<td><div class="type-sample" style="font:var({vn});letter-spacing:var({vn}-tracking);text-transform:var({vn}-case)">Learn a language for free</div></td>'
            f'<td class="nowrap">{v["fontSize"]} / {v["lineHeight"]}<br>{w} · {v.get("letterSpacing", "0px")}{" · " + case if case != "none" else ""}</td>'
            f'<td>{esc(t.get("$description", ""))}</td></tr>')
    return "\n".join(rows)


def fonts_html():
    rows = []
    for k, t in CORE["fontFamily"].items():
        fam = "var(--ff-%s)" % k
        rows.append(f'<tr><td><code>fontFamily.{k}</code></td><td>{esc(t["$value"])}</td>'
                    f'<td><span style="font:700 28px/1.2 {fam}">Duolingo 700</span>'
                    + ('' if k == 'display' else f' <span style="font:400 28px/1.2 {fam}">Duolingo 400</span>') +
                    f'</td><td>{esc(t.get("$description", ""))}</td></tr>')
    for k, t in CORE["fontWeight"].items():
        rows.append(f'<tr><td><code>fontWeight.{k}</code></td><td>{t["$value"]}</td>'
                    f'<td><span style="font:{t["$value"]} 20px/1.2 var(--ff-body)">The quick brown owl</span></td><td>{esc(t.get("$description", ""))}</td></tr>')
    return "\n".join(rows)


def dim_rows(group, demo=None):
    rows = []
    for path, t in flat(CORE[group], group + "."):
        d = demo(path, t) if demo else ""
        rows.append(f'<tr><td><code>{path}</code></td><td class="nowrap">{esc(css_val(t))}</td>'
                    + (f'<td>{d}</td>' if demo else '') +
                    f'<td>{esc(t.get("$description", ""))}</td><td class="src">{esc(src(t))}</td></tr>')
    return "\n".join(rows)


def spacing_html():
    return "\n".join(
        f'<div class="sp-row"><code>{k}</code><div class="sp-bar" style="width:var(--space-{k})"></div><span>{t["$value"]}</span></div>'
        for k, t in CORE["space"].items() if not k.startswith("$"))


def radii_html():
    return "\n".join(
        f'<div class="rad"><div class="rad-box" style="border-radius:var(--radius-{k})"></div><code>radius.{k}</code><span>{t["$value"]}</span><small>{esc(t.get("$description", ""))}</small></div>'
        for k, t in CORE["radius"].items() if not k.startswith("$"))


def bw_html():
    return "\n".join(
        f'<div class="bw"><div class="bw-box" style="border-width:var(--borderWidth-{k})"></div><code>borderWidth.{k}</code><small>{esc(t.get("$description", ""))}</small></div>'
        for k, t in CORE["borderWidth"].items() if not k.startswith("$"))


def shadows_html():
    out = []
    for path, t in flat(CORE["shadow"], "shadow."):
        vn = var_name(path)
        short = path[len("shadow."):]
        if short == "lip.pathNode":
            demo = f'<div class="lip-node" style="box-shadow:var({vn})"></div>'
        elif short in ("lip.outline", "lip.selected", "lip.card"):
            col = "var(--border-selected)" if short == "lip.selected" else "var(--border-default)"
            demo = f'<div class="lip-demo" style="border:2px solid {col};background:var(--surface-default);box-shadow:var({vn})"></div>'
        elif short == "lip.thin":
            demo = f'<div class="lip-demo" style="border:1px solid var(--border-default);background:var(--surface-default);box-shadow:var({vn})"></div>'
        else:
            face = {"lip.primary": "--accent-primary-face", "lip.secondary": "--accent-secondary-face",
                    "lip.danger": "--accent-danger-face", "lip.super": "--gamification-super-face"}.get(short, "--surface-disabled")
            demo = f'<div class="lip-demo" style="background:var({face});box-shadow:var({vn})"></div>'
        out.append(f'<div class="shd">{demo}<code>{short}</code><span class="shd-val">{esc(css_val(t))}</span><small>{esc(t.get("$description", ""))}</small></div>')
    return "\n".join(out)


def opacity_html():
    return "\n".join(
        f'<div class="op"><div class="op-box"><div style="opacity:var(--opacity-{k})"></div></div><code>opacity.{k}</code><span>{t["$value"]}</span><small>{esc(t.get("$description", ""))}</small></div>'
        for k, t in CORE["opacity"].items() if not k.startswith("$"))


def filters_html():
    return dim_rows("filter")


def motion_html():
    rows = []
    for k, t in CORE["easing"].items():
        if k.startswith("$"):
            continue
        rows.append(f'<tr><td><code>easing.{k}</code></td><td class="nowrap">{css_val(t)}</td>'
                    f'<td><div class="ease-track"><div class="ease-dot" style="transition-timing-function:var(--easing-{k})"></div></div></td>'
                    f'<td>{esc(t.get("$description", ""))}</td></tr>')
    return "\n".join(rows)


def durations_html():
    rows = []
    for k, t in CORE["duration"].items():
        if k.startswith("$"):
            continue
        rows.append(f'<tr><td><code>duration.{k}</code></td><td>{t["$value"]}</td>'
                    f'<td><div class="ease-track"><div class="ease-dot" style="transition-duration:var(--duration-{k})"></div></div></td>'
                    f'<td>{esc(t.get("$description", ""))}</td></tr>')
    return "\n".join(rows)


def bp_html():
    rows = []
    mx = max(int(t["$value"].rstrip("px")) for k, t in CORE["breakpoint"].items() if not k.startswith("$"))
    for k, t in CORE["breakpoint"].items():
        if k.startswith("$"):
            continue
        px = int(t["$value"].rstrip("px"))
        rows.append(f'<tr><td><code>breakpoint.{k}</code></td><td>{t["$value"]}</td>'
                    f'<td><div class="bp-bar" style="width:{px / mx * 100:.1f}%"></div></td>'
                    f'<td>{esc(t.get("$description", ""))}</td></tr>')
    return "\n".join(rows)


def counts():
    n_sem = len(list(flat(LIGHT)))
    n_core = len(list(flat(CORE)))
    return f"{n_core} core tokens (600 palette entries), {n_sem} semantic roles per theme"


# ------------------------------------------------------------------ crops
def png_size(p):
    with open(p, "rb") as f:
        head = f.read(24)
    w, h = struct.unpack(">II", head[16:24])
    return w, h


def crop_html(base):
    files = {th: ROOT / "components" / "crops" / f"{base}-{th}.png" for th in ("light", "dark")}
    have = {th: p.exists() for th, p in files.items()}
    if not any(have.values()):
        raise SystemExit(f"no crop for {base}")
    imgs = []
    for th in ("light", "dark"):
        use = th if have[th] else ("dark" if th == "light" else "light")
        p = files[use]
        w, h = png_size(p)
        note = "" if use == th else f'<span class="ref-note">{th} not captured, showing {use}</span>'
        imgs.append(
            f'<figure class="ref ref-{th}"><img src="components/crops/{p.name}" width="{w // 2}" height="{h // 2}" alt="Product crop: {esc(base)} ({use})" loading="lazy">'
            f'<figcaption>product · {use}{note}</figcaption></figure>')
    return '<div class="sp-ref" data-crop="%s">%s</div>' % (esc(base), "".join(imgs))


# ------------------------------------------------------------------ assemble
def expand_includes(text, depth=0):
    def rep(m):
        return expand_includes((HERE / m.group(1)).read_text(), depth + 1)
    return re.sub(r"\{\{INCLUDE:([^}]+)\}\}", rep, text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "style-guide.html"))
    ap.add_argument("--only", help="comma list of <!--SECTION:name--> blocks to keep (preview builds)")
    a = ap.parse_args()

    tpl = expand_includes((HERE / "style-guide.template.html").read_text())
    if a.only:
        keep = set(a.only.split(","))

        def drop(m):
            return m.group(0) if m.group(1) in keep else ""
        tpl = re.sub(r"<!--SECTION:([\w-]+)-->.*?<!--/SECTION:\1-->", drop, tpl, flags=re.S)

    tpl = re.sub(r"\{\{CROP:([^}]+)\}\}", lambda m: crop_html(m.group(1).strip()), tpl)
    subs = {
        "TOKEN_CSS": token_css, "PALETTE": palette_html, "ROLES": roles_html, "TYPE_ROWS": type_rows,
        "FONTS": fonts_html, "SPACING": spacing_html, "RADII": radii_html, "BORDER_WIDTHS": bw_html,
        "SHADOWS": shadows_html, "OPACITY": opacity_html, "FILTERS": filters_html, "MOTION": motion_html,
        "DURATIONS": durations_html, "BREAKPOINTS": bp_html,
        "SIZES": lambda: dim_rows("size"), "ZINDEX": lambda: dim_rows("zIndex"), "COUNTS": counts,
    }
    for k, fn in subs.items():
        if "{{" + k + "}}" in tpl:
            tpl = tpl.replace("{{" + k + "}}", fn())
    left = re.findall(r"\{\{[A-Z_:]+[^}]*\}\}", tpl)
    if left:
        raise SystemExit(f"unfilled placeholders: {sorted(set(left))[:10]}")
    if "\u2014" in tpl:
        raise SystemExit("em dash found in output; remove it from the template or tokens")
    pathlib.Path(a.out).write_text(tpl)
    print(f"wrote {a.out} ({len(tpl):,} bytes)")


if __name__ == "__main__":
    main()
