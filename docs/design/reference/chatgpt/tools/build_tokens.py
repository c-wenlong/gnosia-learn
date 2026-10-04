#!/usr/bin/env python3
"""Build tokens.json (W3C DTCG, Tokens Studio multi-set layout) from the raw captures.

Sources, read from chatgpt.com on 2026-10-04:
  raw/css-vars.json          every custom property ChatGPT's stylesheets declare, by sheet, selector
                             and enclosing condition, plus `computed`: the value each root-level name
                             takes on <html> in dark and light, under every accent (tools/capture/vars.mjs)
  raw/component-tokens.json  values that are not variables: measured on the real elements, each with
                             the measurement it came from ("source")

ChatGPT declares its palette on `html, .light, .dark .light` (light) and `.dark` (dark), in several
blocks spread over cascade layers, and most names are var() chains into a primitive scale. So the
value of every themed token is the one the browser computed on <html> (`computed.dark` and
`computed.light`), and a token is written as an alias only when one of the name's own declarations is
a var() of another token that computes to the same value in that theme. That keeps every value true
to the cascade and keeps the chains readable.

Sets:
  core   theme-independent: the primitive colour scales (`--gray-*`, `--blue-*`, ...), font families
         and weights, Tailwind's type scale and ChatGPT's named type styles as composite typography,
         spacing, radii, shadows, blur, containers, breakpoints, durations and easings, the layout
         variables (`--sidebar-width`, `--sidebar-rail-width`, `--header-height`, ...) and the measured
         component values.
  light, dark
         the semantic palette grouped by role (bg, text, icon, border, interactive, surface, theme,
         accent, chart, misc, component) and `chatTheme`, the accent palette: one group per
         `data-chat-theme` value (default, blue, green, yellow, purple, pink, orange, black, which
         Settings calls White), each with the user bubble, submit button, secondary button, selection,
         chart and accent pill colours.

A value DTCG cannot carry (a linear() spring, an em letter spacing, an rgb triplet, a percentage) is
listed under `$extensions.notTokenised` of its set with its name and value. Display-p3 variants, the
high-contrast override and the coarse-pointer sizes are kept in a token's `$extensions`. Every token
carries `$extensions.source`. Deterministic: same inputs, same bytes; refuses an alias that points at
nothing and a dimension that is not one px or rem length.
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent.parent
RAW = HERE / "raw"
V = json.loads((RAW / "css-vars.json").read_text())
SPEC = json.loads((RAW / "component-tokens.json").read_text())
COMP = V["computed"]
DARK, LIGHT = COMP["dark"], COMP["light"]
P3 = COMP.get("p3", {"dark": {}, "light": {}})
ACCENTS = ["default", "blue", "green", "yellow", "purple", "pink", "orange", "black"]
ACCENT_LABEL = {"default": "Default", "blue": "Blue", "green": "Green", "yellow": "Yellow", "purple": "Purple", "pink": "Pink", "orange": "Orange", "black": "White"}

rules = [r for r in V["rules"] if "selector" in r]
ROOTISH = re.compile(r'^(:root|html|\.dark|\.light|\[data-chat-theme|\[data-ds-colored|body\[data-type-stack)')
SKIP_CTX = re.compile(r"display-p3|prefers-reduced-transparency|prefers-contrast|pointer: coarse|@keyframes|color-mix|oklch")


def where(r):
    ctx = " ".join(r["context"])
    return f"{r['selector']}{' in ' + ctx if ctx else ''}, {r['file']}"


# Every declaration of a name on a root-level selector, in source order.
DECL = {}
for i, r in enumerate(rules):
    if not ROOTISH.match(r["selector"]) or r.get("family") != "chatgpt":
        continue
    for k, v in r["properties"].items():
        DECL.setdefault(k, []).append({"value": v, "rule": r, "order": i})


# ---------------------------------------------------------------- value parsing

def norm_color(v):
    """#rgb/#rgba/#rrggbb/#rrggbbaa or a CSS colour keyword -> #rrggbb or rgba(r, g, b, a)."""
    v = v.strip().lower()
    named = {"transparent": "rgba(0, 0, 0, 0)", "silver": "#c0c0c0", "white": "#ffffff", "black": "#000000", "red": "#ff0000"}
    if v in named:
        return named[v]
    m = re.fullmatch(r"#([0-9a-f]{3,8})", v)
    if not m or len(m.group(1)) not in (3, 4, 6, 8):
        raise ValueError("not a colour: " + v)
    h = m.group(1)
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    if len(h) == 8:
        a = round(int(h[6:8], 16) / 255, 3)
        if a != 1:
            return "rgba(%d, %d, %d, %s)" % (r, g, b, "%g" % a)
    return "#%02x%02x%02x" % (r, g, b)


def is_color(v):
    try:
        norm_color(v)
        return True
    except ValueError:
        return False


def mix_with_transparent(v):
    """color-mix(in oklab, <hex> p%, transparent) is that colour at alpha p (transparent is
    premultiplied away), so it has an exact sRGB value."""
    m = re.fullmatch(r"color-mix\(in \w+, (#[0-9a-fA-F]{3,8}) ([\d.]+)%, transparent\)", v.strip())
    if not m:
        return None
    base = norm_color(m.group(1))
    if base.startswith("rgba"):
        return None
    r, g, b = (int(base[i:i + 2], 16) for i in (1, 3, 5))
    return "rgba(%d, %d, %d, %s)" % (r, g, b, "%g" % (float(m.group(2)) / 100))


def dim(v, rem=16):
    """A px or rem length, or calc(N * .25rem) / calc(.25rem * N), as one px or rem string."""
    v = v.strip()
    m = re.fullmatch(r"(-?\d*\.?\d+)(px|rem)", v)
    if m:
        return ("%g" % float(m.group(1))) + m.group(2)
    if v == "0":
        return "0px"
    m = re.fullmatch(r"calc\((\d*\.?\d+) \* (\d*\.?\d+)rem\)|calc\((\d*\.?\d+)rem \* (\d*\.?\d+)\)", v)
    if m:
        a, b = [float(x) for x in m.groups() if x is not None]
        return ("%g" % (a * b * rem)) + "px"
    return None


def split_top(s):
    out, depth, cur = [], 0, ""
    for ch in s:
        depth += ch == "("
        depth -= ch == ")"
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return [x.strip() for x in out]


def shadow(v):
    layers = []
    for part in split_top(v):
        bits = part.split()
        inset = bits[:1] == ["inset"]
        bits = bits[1:] if inset else bits
        if not bits or not is_color(bits[-1]):
            return None
        nums = bits[:-1]
        if not 2 <= len(nums) <= 4 or any(dim(n) is None for n in nums):
            return None
        nums += ["0"] * (4 - len(nums))
        layers.append({"offsetX": dim(nums[0]), "offsetY": dim(nums[1]), "blur": dim(nums[2]), "spread": dim(nums[3]), "color": norm_color(bits[-1]), "inset": inset})
    return layers


def duration(v):
    m = re.fullmatch(r"(\d*\.?\d+)(ms|s)", v.strip())
    if not m:
        return None
    ms = float(m.group(1)) * (1000 if m.group(2) == "s" else 1)
    return ("%g" % round(ms, 2)) + "ms"


def bezier(v):
    m = re.fullmatch(r"cubic-bezier\(([^)]*)\)", v.strip())
    return [float(x) for x in m.group(1).split(",")] if m else None


def literal(v):
    """(type, value) for a literal DTCG can carry, else None."""
    v = v.strip()
    if is_color(v):
        return "color", norm_color(v)
    mix = mix_with_transparent(v)
    if mix:
        return "color", mix
    if v.startswith(("0 ", "inset")) and "#" in v or re.match(r"-?\d", v) and "#" in v:
        s = shadow(v)
        if s:
            return "shadow", s
    d = dim(v)
    if d:
        return "dimension", d
    return None


# ---------------------------------------------------------------- core

NOT = {"core": [], "light": [], "dark": []}
core = {}
INDEX = {}  # css name -> (set, path)


def put(tree, path, tok, setname, name=None):
    node = tree
    keys = path.split(".")
    for k in keys[:-1]:
        node = node.setdefault(k, {})
    node[keys[-1]] = tok
    if name:
        INDEX[(setname, name)] = path


def first_decl(name):
    d = DECL.get(name) or []
    for x in d:
        if not SKIP_CTX.search(" ".join(x["rule"]["context"])):
            return x
    return d[0] if d else None


def src_of(name, note=""):
    d = first_decl(name)
    s = f"css-var {name} ({where(d['rule'])})" if d else f"css-var {name}"
    return s + (f"; {note}" if note else "")


PRIM = re.compile(r"^--(gray|blue|green|orange|pink|purple|yellow|red)-(\d+|a\d+)$")
for name in sorted(DARK, key=lambda n: (re.sub(r"\d+", "", n), int(re.search(r"(\d+)$", n).group(1)) if re.search(r"\d+$", n) else 0)):
    m = PRIM.match(name)
    if m or name in ("--white", "--black", "--brand-purple"):
        if not is_color(DARK[name]):
            continue
        path = f"color.{m.group(1)}.{m.group(2)}" if m else f"color.{name[2:]}"
        put(core, path, {"$value": norm_color(DARK[name]), "$type": "color", "$extensions": {"source": src_of(name)}}, "core", name)
core["color"]["$description"] = ("ChatGPT's primitive scales. Grey runs 0 to 1000 in 25s and 50s; each hue runs 25 to 1000 with two alpha steps (`a50`, `a75`) used for soft fills. "
                                 "The semantic palette in the light and dark sets aliases into these.")

SANS = DARK["--font-sans"]
core["fontFamily"] = {
    "sans": {"$value": SANS.replace('"', "'"), "$type": "fontFamily", "$extensions": {"source": src_of("--font-sans", "the stack every UI element computes (body has no data-type-stack); -apple-system-body is SF Pro on Apple platforms")}},
    "mono": {"$value": DARK["--font-mono"].replace('"', "'"), "$type": "fontFamily", "$extensions": {"source": src_of("--font-mono")}},
    "wordmark": {"$value": "'OpenAI Sans', 'OpenAI Sans Variable Scripts', sans-serif", "$type": "fontFamily", "$extensions": {"source": ".header-wordmark and .font-oai in s-8ff6f3e831; OpenAI Sans is OpenAI's own face (cdn.openai.com/common/fonts/openai-sans/v4), used for the sidebar wordmark only"}},
    "openai-sans-stack": {"$value": "'OpenAI Sans', 'OpenAI Sans Variable Scripts', '-apple-system-body', ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Helvetica, 'Apple Color Emoji', Arial, sans-serif, 'Segoe UI Emoji', 'Segoe UI Symbol'", "$type": "fontFamily", "$extensions": {"source": "body[data-type-stack=\"openaisans\"] { --font-sans } in s-8ff6f3e831; declared, not active on the captured account"}},
}
core["fontWeight"] = {name[len("--font-weight-"):]: {"$value": int(DARK[name]), "$type": "fontWeight", "$extensions": {"source": src_of(name)}}
                      for name in sorted(DARK, key=lambda n: DARK[n]) if name.startswith("--font-weight-")}

# Tailwind's size scale: --text-<step> with a unitless line-height ratio.
core["fontSize"], core["lineHeight"] = {}, {}
for step in ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"]:
    size = dim(DARK[f"--text-{step}"])
    ratio_raw = DARK[f"--text-{step}--line-height"]
    m = re.fullmatch(r"calc\(([\d.]+) / ([\d.]+)\)", ratio_raw)
    ratio = float(m.group(1)) / float(m.group(2)) if m else float(ratio_raw)
    core["fontSize"][step] = {"$value": size, "$type": "dimension", "$extensions": {"source": src_of(f"--text-{step}")}}
    lh = round(float(size[:-3]) * ratio, 4)
    core["lineHeight"][step] = {"$value": ("%g" % lh) + "rem", "$type": "dimension", "$extensions": {"source": src_of(f"--text-{step}--line-height", f"{ratio_raw} times the size")}}

# ChatGPT's named type styles: --text-<style> with --line-height, --font-weight, --letter-spacing.
STYLE_NAMES = sorted({re.sub(r"--(line-height|font-weight|letter-spacing|optical-size)$", "", n)[len("--text-"):]
                      for n in DARK if n.startswith("--text-") and re.search(r"--(line-height|font-weight)$", n)} - {"xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"})
core["typography"] = {}
for st in STYLE_NAMES:
    size = dim(DARK.get(f"--text-{st}", ""))
    lh = dim(DARK.get(f"--text-{st}--line-height", ""))
    fw = DARK.get(f"--text-{st}--font-weight", "")
    ls = DARK.get(f"--text-{st}--letter-spacing", "0rem")
    if not (size and lh and fw.isdigit()):
        continue
    core["typography"][st] = {"$value": {"fontFamily": "{fontFamily.sans}", "fontSize": size, "lineHeight": lh, "fontWeight": int(fw), "letterSpacing": dim(ls) or "0px"},
                              "$type": "typography", "$extensions": {"source": src_of(f"--text-{st}", "with its --line-height, --font-weight and --letter-spacing"), "opticalSize": DARK.get(f"--text-{st}--optical-size") or None}}
    if core["typography"][st]["$extensions"]["opticalSize"] is None:
        del core["typography"][st]["$extensions"]["opticalSize"]
core["typography"]["$description"] = ("ChatGPT's named text styles (Tailwind 4 `text-<style>` utilities). The thread body is 16/26 (body-regular reads 16/26 as well); the sidebar and menus are 14/20; "
                                      "headings in the thread are 18/28 600. Every style uses fontFamily.sans; the optical size in $extensions is the `--optical-size` the style declares.")

for name in sorted(n for n in DARK if n.startswith("--tracking-")):
    NOT["core"].append({"name": name, "value": DARK[name], "why": "em letter spacing; DTCG dimensions are px or rem"})
core["lineHeightRatio"] = {name[len("--leading-"):]: {"$value": float(DARK[name]), "$type": "number", "$extensions": {"source": src_of(name)}}
                           for name in sorted(DARK, key=lambda n: DARK[n]) if name.startswith("--leading-")}
core["spacing"] = {"unit": {"$value": dim(DARK["--spacing"]), "$type": "dimension", "$extensions": {"source": src_of("--spacing", "Tailwind 4's spacing unit; every p-N, gap-N, h-N is N times this")}}}
core["radius"] = {}
for name in sorted((n for n in DARK if n.startswith("--radius-")), key=lambda n: float(dim(DARK[n])[:-3])):
    core["radius"][name[len("--radius-"):]] = {"$value": dim(DARK[name]), "$type": "dimension", "$extensions": {"source": src_of(name)}}
core["shadow"] = {}
for name in sorted(n for n in DARK if n.startswith(("--shadow-", "--drop-shadow-"))):
    s = shadow(DARK[name])
    key = name[2:].replace("shadow-", "", 1) if name.startswith("--shadow-") else name[2:]
    if s:
        core["shadow"][key] = {"$value": s, "$type": "shadow", "$extensions": {"source": src_of(name) + ("; a filter: drop-shadow() value, written as a shadow with no spread" if "drop" in name else "")}}
core["blur"] = {name[len("--blur-"):]: {"$value": dim(DARK[name]), "$type": "dimension", "$extensions": {"source": src_of(name)}}
                for name in sorted((n for n in DARK if n.startswith("--blur-")), key=lambda n: float(dim(DARK[n])[:-2]))}
core["container"] = {name[len("--container-"):]: {"$value": dim(DARK[name]), "$type": "dimension", "$extensions": {"source": src_of(name)}}
                     for name in sorted((n for n in DARK if n.startswith("--container-")), key=lambda n: float(dim(DARK[n])[:-3]))}
core["breakpoint"] = {name[len("--breakpoint-"):]: {"$value": dim(DARK[name]), "$type": "dimension", "$extensions": {"source": src_of(name, "Tailwind's sm (40rem) and lg (64rem) keep their defaults")}}
                      for name in sorted((n for n in DARK if n.startswith("--breakpoint-")), key=lambda n: float(dim(DARK[n])[:-3]))}
core["duration"] = {"default": {"$value": duration(DARK["--default-transition-duration"]), "$type": "duration", "$extensions": {"source": src_of("--default-transition-duration", "every `transition-*` utility; hover fills on rows and buttons")}}}
for name in sorted(n for n in DARK if n.endswith("-duration") and n.startswith(("--spring-", "--easing-", "--cot-"))):
    core["duration"][name[2:-len("-duration")]] = {"$value": duration(DARK[name]), "$type": "duration", "$extensions": {"source": src_of(name)}}
core["easing"] = {"default": {"$value": bezier(DARK["--default-transition-timing-function"]), "$type": "cubicBezier", "$extensions": {"source": src_of("--default-transition-timing-function")}}}
for name in ("--ease-in", "--ease-out", "--ease-in-out"):
    core["easing"][name[2:]] = {"$value": bezier(DARK[name]), "$type": "cubicBezier", "$extensions": {"source": src_of(name)}}
for name in sorted(n for n in DARK if n.startswith(("--spring-", "--easing-")) and not n.endswith("-duration")):
    NOT["core"].append({"name": name, "value": DARK[name][:200] + ("…" if len(DARK[name]) > 200 else ""), "why": "a linear() spring curve; DTCG easing is cubic-bezier only"})
for name in sorted(n for n in DARK if n.startswith("--animate-") or n in ("--aspect-video", "--user-chat-width", "--stage-scroll-gutter", "--icon-surface", "--surface-error")):
    NOT["core"].append({"name": name, "value": DARK[name], "why": "an animation shorthand, ratio, percentage or keyword"})

LAYOUT = {
    "--sidebar-width": "sidebar-width", "--sidebar-rail-width": "sidebar-rail-width", "--header-height": "header-height",
    "--sidebar-section-margin-top": "sidebar-section-margin-top", "--sidebar-section-first-margin-top": "sidebar-section-first-margin-top",
    "--sidebar-expanded-section-margin-bottom": "sidebar-expanded-section-margin-bottom", "--sidebar-collapsed-section-margin-bottom": "sidebar-collapsed-section-margin-bottom",
    "--menu-item-height": "menu-item-height", "--tap-padding-pointer": "tap-padding-pointer", "--tap-padding-mobile": "tap-padding-mobile",
}
core["layout"] = {}
COARSE = {}
for r in rules:
    if "pointer: coarse" in " ".join(r["context"]) and r["selector"] == ":root":
        COARSE.update(r["properties"])
for name, key in LAYOUT.items():
    tok = {"$value": dim(DARK[name]), "$type": "dimension", "$extensions": {"source": src_of(name, f"declared as {first_decl(name)['value']}" if first_decl(name) and first_decl(name)["value"] != DARK[name] else "")}}
    if name in COARSE:
        tok["$extensions"]["coarsePointer"] = dim(COARSE[name])
    core["layout"][key] = tok
for name, default in (("--composer-bar_width", "768px"), ("--composer-bar_height", "52px"), ("--composer-footer_height", "32px")):
    pass
core["layout"]["composer-bar-safe-margins"] = {"$value": "20px", "$type": "dimension", "$extensions": {"source": "css-var --composer-bar_safe-margins (.masked-content, s-8ff6f3e831)"}}
core["layout"]["scrollbar-width"] = {"$value": "10px", "$type": "dimension", "$extensions": {"source": "css-var --scrollbar-width (.mask-scrollbars, s-8ff6f3e831)"}}
core["layout"]["thread-flyout-width-xl"] = {"$value": "500px", "$type": "dimension", "$extensions": {"source": "css-var --stage-thread-flyout-preset-width (.stage-thread-flyout-preset-responsive in @media (min-width: 80rem))"}}
core["layout"]["thread-flyout-width-2xl"] = {"$value": "700px", "$type": "dimension", "$extensions": {"source": "css-var --stage-thread-flyout-preset-width (.stage-thread-flyout-preset-responsive in @media (min-width: 96rem))"}}
core["layout"]["$description"] = ("The shell's sizes. The sidebar is 260 wide and collapses to the 52 wide tiny rail (56 on a coarse pointer); the page header is 52 tall (56 coarse). "
                                  "`--composer-bar_width` (768) and `--composer-bar_height` (52) are the composer's defaults; the measured column and component sizes follow.")


# ---------------------------------------------------------------- measured values (component-tokens.json)

def build(node):
    if isinstance(node, dict) and "type" in node and "value" in node:
        ty, val = node["type"], node["value"]
        if ty == "dimension" and isinstance(val, (int, float)):
            val = ("%g" % val) + "px"
        if ty == "color":
            val = norm_color(val) if str(val).startswith("#") else val
        t = {"$value": val, "$type": ty, "$extensions": {"source": node["source"]}}
        if node.get("description"):
            t["$description"] = node["description"]
        return t
    return {k: build(v) for k, v in node.items() if not k.startswith("_")}


for k, v in build(SPEC.get("core", {})).items():
    core[k] = {**core.get(k, {}), **v}


# ---------------------------------------------------------------- the themed sets

def group_of(name):
    n = name[2:]
    rules_ = [
        (r"^bg-", "bg", lambda s: s[3:]), (r"^border-", "border", lambda s: s[7:]), (r"^text-", "text", lambda s: s[5:]),
        (r"^icon-", "icon", lambda s: s[5:]), (r"^accent-", "accent", lambda s: s[7:]),
        (r"^theme-(blue|green|yellow|pink|orange|purple)-", "theme", lambda s: s[6:].replace("-", ".", 1)),
        (r"^interactive-", "interactive", lambda s: s[12:]),
        (r"^(main-surface|sidebar-|message-surface|composer-|component-|surface-hover|keyboard-open-mask)", "surface", lambda s: s),
        (r"^color-chart-", "chart", lambda s: s[12:]),
    ]
    for pat, g, leaf in rules_:
        if re.match(pat, n):
            return g, leaf(n)
    return "misc", n


THEMED_SKIP = re.compile(r"^--(tw-|lightningcss-|is-|snc-|menu-item-|silk|swiper|font-|text-.*--|radius-|shadow-|drop-shadow-|blur-|container-|breakpoint-|spring-|easing-|ease-|animate-|tracking-|leading-|spacing|default-|"
                         r"(default|blue|green|yellow|purple|pink|orange|black)-theme-|theme-(user|submit|chart|secondary|attribution|entity|accent)|gray-|white|black|brand-purple|"
                         r"(blue|green|orange|pink|purple|yellow|red)-(\d+|a\d+)$|sidebar-width|sidebar-rail-width|sidebar-section|sidebar-expanded|sidebar-collapsed|header-height|mkt-|tap-|safe-area|cqh-|cqw-|stage-|user-chat|start|end|to-end|cot-|aspect)")
TYPE_STYLE = {f"--text-{s}" for s in STYLE_NAMES} | {f"--text-{s}" for s in ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"]}

HC = {}
for r in rules:
    if r["selector"].startswith('html[data-contrast="high"]') and not r["context"]:
        HC.update(r["properties"])


def decls_for(name, theme):
    """The name's root-level declarations that can apply to <html> in this theme, latest first."""
    out = []
    for d in DECL.get(name, []):
        sel, ctx = d["rule"]["selector"], " ".join(d["rule"]["context"])
        if SKIP_CTX.search(ctx) or sel.startswith("[data-chat-theme") or "data-contrast" in sel or "data-ds-colored" in sel:
            continue
        parts = [p.strip() for p in sel.split(",")]
        dark_only = all(".dark" in p and not p.endswith(".light") for p in parts)
        if theme == "light" and dark_only:
            continue
        out.append(d)
    return sorted(out, key=lambda d: -d["order"])


def alias_for(name, theme, value, setname, seen=()):
    """{path} of a token this name's own declarations point at with the same computed value."""
    table = DARK if theme == "dark" else LIGHT
    for d in decls_for(name, theme):
        m = re.fullmatch(r"var\((--[\w-]+)(?:,[^)]*)?\)", d["value"].strip())
        if not m:
            continue
        tgt = m.group(1)
        if tgt in seen or table.get(tgt, "").strip() != value:
            continue
        for key in ((setname, tgt), ("core", tgt)):
            if key in INDEX:
                return INDEX[key]
        deeper = alias_for(tgt, theme, value, setname, seen + (name,))
        if deeper:
            return deeper
    return None


def themed(theme):
    table = DARK if theme == "dark" else LIGHT
    tree = {}
    todo = []
    for name in sorted(set(DARK) | set(LIGHT)):
        if THEMED_SKIP.match(name) or name in TYPE_STYLE or (name.startswith("--text-") and not is_color(table.get(name, "")) and not table.get(name, "").startswith(("var", "color-mix"))):
            continue
        val = table.get(name, "").strip()
        if not val:
            continue
        lit = literal(val)
        if not lit:
            NOT[theme].append({"name": name, "value": val})
            continue
        g, leaf = group_of(name)
        todo.append((name, g, leaf, lit))
    # literals first so the index is complete, then aliases where the declaration points at a token
    for name, g, leaf, (ty, v) in todo:
        INDEX[(theme, name)] = f"{g}.{leaf}"
    for name, g, leaf, (ty, v) in todo:
        val = table[name].strip()
        al = alias_for(name, theme, val, theme)
        if al == f"{g}.{leaf}":
            al = None
        d = decls_for(name, theme)
        src = f"css-var {name} ({where(d[0]['rule'])})" if d else src_of(name)
        if theme == "dark" and d and not any(".dark" in d_["rule"]["selector"] for d_ in d):
            src += "; not redeclared for dark, so the light value applies"
        tok = {"$value": "{" + al + "}" if al else v, "$type": ty, "$extensions": {"source": src}}
        if P3.get(theme, {}).get(name):
            tok["$extensions"]["displayP3"] = P3[theme][name]
        if theme == "light" and name in HC:
            tok["$extensions"]["highContrast"] = norm_color(HC[name]) if is_color(HC[name]) else HC[name]
        if val.startswith("color-mix"):
            tok["$extensions"]["declaredAs"] = val
        put(tree, f"{g}.{leaf}", tok, theme)
    # the accent palette, one group per data-chat-theme value
    roles = sorted({n[len("--theme-"):] for n in COMP["accents"]["blue"][theme] if re.match(r"--theme-(user|submit|chart|secondary|attribution|entity|accent)", n)})
    chart = sorted(n for n in COMP["accents"]["blue"][theme] if n.startswith("--color-chart-sequential-"))
    for a in ACCENTS:
        vals = COMP["accents"][a][theme]
        for role in roles + [c[2:] for c in chart]:
            css = f"--{role}" if role.startswith("color-chart") else f"--theme-{role}"
            raw = vals[css].strip()
            lit = literal(raw)
            if not lit:
                NOT[theme].append({"name": f"{css} [data-chat-theme={a}]", "value": raw})
                continue
            per = f"--{a}-theme-{role}"
            al = alias_for(per, theme, raw, theme) if per in DECL else None
            if not al and css.startswith("--color-chart"):
                m = re.search(r"var\(--lightningcss-%s,var\((--[\w-]+)\)\)" % theme, next((d["value"] for d in DECL.get(css, []) if f'"{a}"' in d["rule"]["selector"]), ""))
                if m and table.get(m.group(1), "").strip() == raw and ("core", m.group(1)) in INDEX:
                    al = INDEX[("core", m.group(1))]
            sel = next((d["rule"] for d in DECL.get(css, []) if f'"{a}"' in d["rule"]["selector"] or (a == "default" and d["rule"]["selector"].startswith(":root, [data-chat-theme"))), None)
            src = f"css-var {css} under [data-chat-theme=\"{a}\"]" + (f" ({where(sel)})" if sel else "") + (f", which reads {per}" if per in DECL else "")
            tok = {"$value": "{" + al + "}" if al else lit[1], "$type": lit[0], "$extensions": {"source": src}}
            if raw.startswith("color-mix"):
                tok["$extensions"]["declaredAs"] = raw
            put(tree, f"chatTheme.{a}.{role.replace('color-chart-', 'chart-')}", tok, theme)
        tree["chatTheme"][a]["$description"] = f"Settings > General > Accent color: {ACCENT_LABEL[a]} (`data-chat-theme=\"{a}\"` on <html>)."
    tree["chatTheme"]["$description"] = ("The accent colour the account picks in Settings, set as `data-chat-theme` on <html>; every page copy was captured with blue. "
                                         "It paints the user message bubble (`--theme-user-msg-bg` / `-text`, switched on by `data-ds-colored-user-message-bubbles`), the voice and send button "
                                         "(`--theme-submit-btn-*`), text selection, the chart ramp and accent pills. White is `data-chat-theme=\"black\"`, Default is grey bubbles and a black (light) or white (dark) send button.")
    return tree


light = themed("light")
dark = themed("dark")
for setname, tree in (("light", light), ("dark", dark)):
    for k, v in build(SPEC.get(setname, {})).items():
        tree[k] = {**tree.get(k, {}), **v}
    tree["$extensions"] = {"notTokenised": NOT[setname]}
core["$extensions"] = {"notTokenised": NOT["core"]}


# ---------------------------------------------------------------- checks

def tokens_of(tree, prefix=""):
    for k, v in tree.items():
        if k.startswith("$"):
            continue
        if isinstance(v, dict) and "$value" in v:
            yield prefix + k, v
        elif isinstance(v, dict):
            yield from tokens_of(v, prefix + k + ".")


def aliases(v):
    if isinstance(v, str):
        return re.findall(r"\{([^{}]+)\}", v)
    if isinstance(v, dict):
        return [a for x in v.values() for a in aliases(x)]
    if isinstance(v, list):
        return [a for x in v for a in aliases(x)]
    return []


def resolve_type(name, sets):
    for s in sets:
        node = s
        for k in name.split("."):
            node = node.get(k) if isinstance(node, dict) else None
            if node is None:
                break
        if isinstance(node, dict) and "$type" in node:
            return node["$type"]
    return None


DIM = re.compile(r"^-?\d*\.?\d+(px|rem)$")
CORE_NAMES = {n for n, _ in tokens_of(core)}
for setname, tree in (("core", core), ("light", light), ("dark", dark)):
    names = CORE_NAMES | {n for n, _ in tokens_of(tree)}
    for n, t in tokens_of(tree):
        for a in aliases(t["$value"]):
            if a not in names:
                raise KeyError(f"{setname}.{n}: alias {{{a}}} points at nothing")
        if isinstance(t["$value"], str) and t["$value"].startswith("{"):
            ty = resolve_type(t["$value"][1:-1], [tree, core])
            if ty != t["$type"]:
                raise TypeError(f"{setname}.{n}: alias of type {ty}, token says {t['$type']}")
        if t["$type"] == "dimension" and not t["$value"].startswith("{") and not DIM.match(t["$value"]):
            raise ValueError(f"{setname}.{n}: dimension {t['$value']!r} is not one px or rem length")
        if t["$type"] == "typography":
            for k in ("fontSize", "lineHeight", "letterSpacing"):
                if not DIM.match(t["$value"][k]):
                    raise ValueError(f"{setname}.{n}: typography {k} {t['$value'][k]!r}")
        if not t.get("$extensions", {}).get("source"):
            raise ValueError(f"{setname}.{n}: no source")

tokens = {
    "core": core, "light": light, "dark": dark,
    "$themes": [
        {"id": "light", "name": "Light", "selectedTokenSets": {"core": "source", "light": "enabled"}, "$description": "ChatGPT's `html, .light, .dark .light` palette; Settings > General > Appearance: Light"},
        {"id": "dark", "name": "Dark", "selectedTokenSets": {"core": "source", "dark": "enabled"}, "$description": "ChatGPT's `.dark` palette; Appearance: Dark, or System on a dark system (the state every page was captured in)"},
    ],
    "$metadata": {"tokenSetOrder": ["core", "light", "dark"]},
}
(HERE / "tokens.json").write_text(json.dumps(tokens, indent=2, ensure_ascii=False) + "\n")


def count(d):
    return sum(count(v) for k, v in d.items() if not k.startswith("$")) if isinstance(d, dict) and "$value" not in d else 1


print({k: count(v) for k, v in tokens.items() if k in ("core", "light", "dark")}, "not tokenised:", {k: len(v) for k, v in NOT.items()})
