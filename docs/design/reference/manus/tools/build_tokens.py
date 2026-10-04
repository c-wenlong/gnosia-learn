#!/usr/bin/env python3
"""Build tokens.json (W3C DTCG, Tokens Studio multi-set layout) from the raw captures.

Sources, read from manus.im/app on 2026-10-04:
  raw/css-vars.json          every custom property Manus's stylesheets declare, by file, selector and
                             enclosing condition (tools/capture/vars.mjs)
  raw/component-tokens.json  values that are not variables: measured on the real elements, each with
                             the measurement it came from ("source")

Manus declares its palette twice in one stylesheet, `:root` (light) and `.dark` (dark), and every
component colour is a var() of one of them. Those two blocks become the `light` and `dark` sets,
grouped by the role each name carries (text, background, border, icon, fill, function, button, tab,
shadow, accent, activity-indicator, illustration, game, misc). A name declared on `:root` and not on
`.dark` keeps its light value in dark, as the browser does. The seven accent palettes
(`.accent-custom[data-accent-color=...]`, light and dark pairs) are the `accent` group of each set.

`core` holds what does not change with the theme: the type scale (`--ui-font-size-*`,
`--ui-line-height-*`) as sizes, line heights and composite type styles; the density scale
(`--ui-density-*`, with the compact value Manus sets under `data-interface-density="compact"` in
`$extensions.compact`); font families; radii; durations and easings; and the measured layout.

A value the DTCG types cannot carry (a multi-layer background, a radial gradient, an env()) stays in
raw/css-vars.json and is listed under `$extensions.notTokenised` of the set, by name, so nothing is
silently dropped. Every token carries `$extensions.source`. Deterministic: same inputs, same bytes.
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent.parent
RAW = HERE / "raw"
V = json.loads((RAW / "css-vars.json").read_text())
SPEC = json.loads((RAW / "component-tokens.json").read_text())
THEME_SHEET = "2sop6smnvcrfi.css"
UI_SHEET = "03d0vrppv2y1v.css"

rules = [r for r in V["rules"] if "selector" in r]


def block(selector, file=None, context=()):
    out = {}
    for r in rules:
        if r["selector"] == selector and (file is None or r["file"] == file) and tuple(r["context"]) == tuple(context):
            out.update(r["properties"])
    return out


LIGHT = block(":root", THEME_SHEET)
DARK = block(".dark", THEME_SHEET)
UI = block(":root", UI_SHEET)
COMPACT = block('html.is-desktop[data-interface-density="compact"]', UI_SHEET)
STANDARD = block('html.is-desktop[data-interface-density="standard"]', UI_SHEET)

ACCENTS = {}
for r in rules:
    m = re.fullmatch(r'(\.dark)?\.accent-custom\[data-accent-color="(\w+)"\]', r["selector"])
    if m and r["file"] == THEME_SHEET:
        ACCENTS.setdefault(m.group(2), {})["dark" if m.group(1) else "light"] = r["properties"]
ACCENT_ROLES = block(".accent-custom", THEME_SHEET)


# ---------- value parsing ----------

def norm_color(v):
    """#rgb/#rgba/#rrggbb/#rrggbbaa -> #rrggbb or rgba(r, g, b, a)."""
    v = v.strip().lower()
    m = re.fullmatch(r"#([0-9a-f]{3,8})", v)
    if not m:
        raise ValueError("not a colour: " + v)
    h = m.group(1)
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    if len(h) == 8:
        a = round(int(h[6:8], 16) / 255, 3)
        if a != 1:
            return "rgba(%d, %d, %d, %s)" % (r, g, b, ("%g" % a))
    return "#%02x%02x%02x" % (r, g, b)


VAR = re.compile(r"var\(--([A-Za-z0-9-]+)\)")


def alias_of(name, sets):
    """{group.token} for a variable name, looked up in the given set trees."""
    for s in sets:
        path = s.get("_index", {}).get(name)
        if path:
            return "{" + path + "}"
    raise KeyError(f"alias to --{name}, which is not a token")


def parse_gradient(v):
    """linear-gradient(<angle>, <stop> <pos>, ...) with hex or var() stops -> (angle, stops)."""
    m = re.fullmatch(r"linear-gradient\((.*)\)", v.strip())
    if not m:
        return None
    parts = split_top(m.group(1))
    angle = "180deg"
    if re.fullmatch(r"-?[\d.]+deg", parts[0].strip()):
        angle = parts.pop(0).strip()
    stops = []
    for i, p in enumerate(parts):
        bits = p.strip().split()
        if len(bits) == 1:
            bits.append("%g%%" % (100 * i / max(1, len(parts) - 1)))
        col, pos = bits[0], bits[1]
        if not pos.endswith("%"):
            return None
        stops.append({"color": col, "position": round(float(pos[:-1]) / 100, 4)})
    return angle, stops


def split_top(s):
    out, depth, cur = [], 0, ""
    for ch in s:
        if ch == "(":
            depth += 1
        if ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return out


def parse_shadow(v):
    layers = []
    for part in split_top(v):
        bits = part.strip().split()
        inset = False
        if bits and bits[0] == "inset":
            inset = True
            bits = bits[1:]
        col = bits[-1]
        nums = bits[:-1]
        if len(nums) < 2 or len(nums) > 4 or not re.fullmatch(r"#[0-9a-f]{3,8}", col):
            return None
        nums += ["0"] * (4 - len(nums))
        layers.append({"offsetX": px(nums[0]), "offsetY": px(nums[1]), "blur": px(nums[2]), "spread": px(nums[3]), "color": norm_color(col), "inset": inset})
    return layers


def px(n):
    n = n.strip()
    if re.fullmatch(r"-?\d*\.?\d+", n):
        return ("%g" % float(n)) + "px"
    if re.fullmatch(r"-?\d*\.?\d+px", n):
        return ("%g" % float(n[:-2])) + "px"
    raise ValueError("not a px length: " + n)


# ---------- the themed sets ----------

GROUPS = [
    ("activity-indicator-", "activity-indicator"), ("illustration-", "illustration"), ("Button-", "button"),
    ("shadows-", "shadow"), ("shadow-", "shadow"), ("background-game-", "game"), ("border-game-", "game"),
    ("game-", "game"), ("text-game-", "game"), ("accent-", "accent"), ("text-", "text"), ("theme-text-", "text"),
    ("background-", "background"), ("border-", "border"), ("icon-", "icon"), ("function-", "function"),
    ("fill-", "fill"), ("tab-", "tab"), ("gradual-", "gradient"), ("gradient-", "gradient"), ("overlay-", "overlay"),
    ("ansi-", "ansi"), ("brand-", "brand"), ("invitation-", "background"),
]


def group_of(name):
    if name.startswith("theme-text-"):
        return "text", "theme-" + name[len("theme-text-"):]
    if name == "invitation-background":
        return "background", "invitation"
    if name == "logo-color":
        return "text", "logo"
    for prefix, g in GROUPS:
        if name.startswith(prefix):
            # game and illustration names keep their whole name, since the prefix is part of the meaning
            return g, name[len(prefix):]
    return "misc", name


def themed_set(decls, theme, fallback=None):
    """Turn one palette block into a token tree. Aliases resolve inside the same set; a name only
    the light block declares is copied into dark with the light value."""
    merged = {k[2:]: v for k, v in (fallback or {}).items()}
    merged.update({k[2:]: v for k, v in decls.items()})
    decls = {k[2:]: v for k, v in decls.items()}
    tree = {"_index": {}}
    not_tokenised = []
    pending = []
    for name, raw in merged.items():
        g, leaf_name = group_of(name)
        where = "dark" if name in decls and theme == "dark" else "light"
        src = f"css-var --{name} ({'.dark' if where == 'dark' else ':root'}, {THEME_SHEET})"
        if theme == "dark" and name not in decls:
            src += "; not redeclared for dark, so the light value applies"
        pending.append((name, g, leaf_name, raw, src))
    # first pass: literal values, so aliases can resolve in the second
    for name, g, leaf_name, raw, src in pending:
        tok = literal(raw, src)
        if tok is None:
            continue
        tree.setdefault(g, {})[leaf_name] = tok
        tree["_index"][name] = f"{g}.{leaf_name}"
    for name, g, leaf_name, raw, src in pending:
        if name in tree["_index"]:
            continue
        tok = with_aliases(raw, src, [tree])
        if tok is None:
            not_tokenised.append({"name": "--" + name, "value": raw})
            continue
        tree.setdefault(g, {})[leaf_name] = tok
        tree["_index"][name] = f"{g}.{leaf_name}"
    return tree, not_tokenised


def literal(raw, src):
    v = raw.strip()
    if v == "transparent":
        return {"$value": "rgba(0, 0, 0, 0)", "$type": "color", "$extensions": {"source": src + "; declared as `transparent`"}}
    if re.fullmatch(r"#[0-9a-fA-F]{3,8}", v):
        return {"$value": norm_color(v), "$type": "color", "$extensions": {"source": src}}
    if re.fullmatch(r"-?\d*\.?\d+px", v):
        return {"$value": px(v), "$type": "dimension", "$extensions": {"source": src}}
    if v.startswith("inset") or re.match(r"-?\d", v) and "#" in v:
        layers = parse_shadow(v)
        if layers:
            return {"$value": layers, "$type": "shadow", "$extensions": {"source": src}}
    if v.startswith("linear-gradient(") and "var(" not in v and v.count("linear-gradient(") == 1:
        g = parse_gradient(v)
        if g:
            angle, stops = g
            return {"$value": [{"color": norm_color(s["color"]), "position": s["position"]} for s in stops], "$type": "gradient", "$extensions": {"source": src, "angle": angle}}
    return None


def with_aliases(raw, src, sets):
    v = raw.strip()
    m = re.fullmatch(r"var\(--([A-Za-z0-9-]+)\)", v)
    if m:
        try:
            return {"$value": alias_of(m.group(1), sets), "$type": type_of_alias(m.group(1), sets), "$extensions": {"source": src}}
        except KeyError:
            return None
    if v.startswith("linear-gradient(") and v.count("linear-gradient(") == 1:
        g = parse_gradient(v)
        if g:
            angle, stops = g
            out = []
            for s in stops:
                c = s["color"]
                mm = re.fullmatch(r"var\(--([A-Za-z0-9-]+)\)", c)
                try:
                    c = alias_of(mm.group(1), sets) if mm else norm_color(c)
                except (KeyError, ValueError):
                    return None
                out.append({"color": c, "position": s["position"]})
            return {"$value": out, "$type": "gradient", "$extensions": {"source": src, "angle": angle}}
    return None


def type_of_alias(name, sets):
    for s in sets:
        path = s.get("_index", {}).get(name)
        if path:
            node = s
            for k in path.split("."):
                node = node[k]
            return node["$type"]
    raise KeyError(name)


light, light_skipped = themed_set(LIGHT, "light")
dark, dark_skipped = themed_set(DARK, "dark", fallback=LIGHT)

# accent palettes: light values in light, dark values (falling back to light) in dark
for colour, pair in sorted(ACCENTS.items()):
    for theme, tree in (("light", light), ("dark", dark)):
        vals = dict(pair.get("light", {}))
        if theme == "dark":
            vals.update(pair.get("dark", {}))
        for name, raw in vals.items():
            sel = f'{".dark" if theme == "dark" and name in pair.get("dark", {}) else ""}.accent-custom[data-accent-color="{colour}"]'
            tree.setdefault("accent", {}).setdefault(colour, {})[name[len("--accent-"):]] = {
                "$value": norm_color(raw), "$type": "color", "$extensions": {"source": f"css-var {name} ({sel}, {THEME_SHEET})"}}
# which roles an accent takes over
light.setdefault("accent", {})["_roles"] = None
for tree in (light, dark):
    tree["accent"].pop("_roles", None)
    tree["accent"]["$description"] = ("With `.accent-custom` on <html>, " + ", ".join(f"{k} becomes {v}" for k, v in ACCENT_ROLES.items()) +
                                      "; the default (no class) is the blue the text.blue, icon.blue, border.blue and fill.blue tokens hold.")

for tree in (light, dark):
    tree.pop("_index")

# ---------- core ----------

core = {}
SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI Variable Display', 'Segoe UI', Helvetica, 'Apple Color Emoji', Arial, sans-serif, 'Segoe UI Emoji', 'Segoe UI Symbol'"
core["fontFamily"] = {
    "sans": {"$value": SANS, "$type": "fontFamily", "$extensions": {"source": f"body font-family and .font-serif's first declaration in {UI_SHEET}; Manus has no web font for UI text, it is the system face"}},
    "serif": {"$value": "LibreBaskerville, Georgia, Cambria, ui-serif, 'Times New Roman', Times, serif", "$type": "fontFamily", "$extensions": {"source": f".font-serif in {UI_SHEET} (the last of three declarations wins); LibreBaskerville is self-hosted at 400 and 700; the CJK locales swap in Noto Serif SC/TC/JP through --font-noto-serif-*"}},
    "mono": {"$value": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", "$type": "fontFamily", "$extensions": {"source": f".font-mono in {UI_SHEET}"}},
    "math": {"$value": "KaTeX_Main, 'Times New Roman', serif", "$type": "fontFamily", "$extensions": {"source": "KaTeX's own faces, 44 @font-face rules"}},
}
core["fontWeight"] = {k: {"$value": v, "$type": "fontWeight", "$extensions": {"source": f".font-{k} in {UI_SHEET}"}} for k, v in (("regular", 400), ("medium", 500), ("semibold", 600), ("bold", 700))}

steps = ["xs", "label", "sm", "body-sm", "base", "title-base", "lg", "title-lg", "xl", "headline-sm", "2xl", "headline-base", "headline-lg", "3xl"]
core["fontSize"], core["lineHeight"], core["typography"] = {}, {}, {}
for s in steps:
    fs, lh = UI[f"--ui-font-size-{s}"], UI[f"--ui-line-height-{s}"]
    core["fontSize"][s] = {"$value": px(fs), "$type": "dimension", "$extensions": {"source": f"css-var --ui-font-size-{s} (:root, {UI_SHEET})"}}
    core["lineHeight"][s] = {"$value": px(lh), "$type": "dimension", "$extensions": {"source": f"css-var --ui-line-height-{s} (:root, {UI_SHEET})"}}
    weight = "medium" if s.startswith(("title", "headline")) else "regular"
    core["typography"][s] = {"$value": {"fontFamily": "{fontFamily.sans}", "fontSize": "{fontSize.%s}" % s, "lineHeight": "{lineHeight.%s}" % s, "fontWeight": "{fontWeight.%s}" % weight, "letterSpacing": "0px"},
                             "$type": "typography", "$extensions": {"source": f"--ui-font-size-{s} with --ui-line-height-{s}; the weight is the one the measured elements of that size carry"}}
core["typography"]["$description"] = ("The scale pairs a `*-xs/sm/base/lg/xl/2xl/3xl` step for body text with `label`, `body-sm` (14/22, used for chat and the composer on desktop: `.chat-message-body, .chat-input-editor` set --ui-font-size-base to it), "
                                      "`title-base`, `title-lg` and `headline-sm/base/lg` steps with tighter leading. Serif display text (the home's 'What can I do for you?', the wordmark, the share banner's title, the document previewer's title) uses fontFamily.serif at these sizes.")

dens = {}
for name, raw in UI.items():
    if not name.startswith("--ui-density-"):
        continue
    key = name[len("--ui-density-"):]
    ty = "number" if key == "nav-icon-scale" else "dimension"
    val = float(raw) if ty == "number" else px(raw)
    tok = {"$value": val, "$type": ty, "$extensions": {"source": f"css-var {name} (:root, {UI_SHEET})"}}
    if name in COMPACT:
        tok["$extensions"]["compact"] = float(COMPACT[name]) if ty == "number" else px(COMPACT[name])
    if name in STANDARD:
        tok["$extensions"]["standardDesktop"] = float(STANDARD[name]) if ty == "number" else px(STANDARD[name])
    dens[key] = tok
dens["$description"] = ("Manus's density scale: row heights, radii, paddings and gaps the sidebar, menus, composer and chat read through var(). The desktop app offers Standard and Compact (`html.is-desktop[data-interface-density]`); "
                        "`compact` and `standardDesktop` in $extensions are those overrides, the web default is the $value.")
core["density"] = dens
core["radius"] = {
    "row": {"$value": "{density.row-radius}", "$type": "dimension", "$extensions": {"source": "--ui-density-row-radius; nav tabs, list rows, menu items"}},
    "small": {"$value": "{density.small-radius}", "$type": "dimension", "$extensions": {"source": "--ui-density-small-radius; icon buttons, chips, the segmented control"}},
    "card": {"$value": "{density.card-radius}", "$type": "dimension", "$extensions": {"source": "--ui-density-card-radius; cards, dialogs, deliverable cards"}},
    "composer": {"$value": "{density.composer-radius}", "$type": "dimension", "$extensions": {"source": "--ui-density-composer-radius; the task composer"}},
}
core["size"] = {
    "row": {"$value": "{density.row-height}", "$type": "dimension", "$extensions": {"source": "--ui-density-row-height"}},
    "row-small": {"$value": "{density.small-row-height}", "$type": "dimension", "$extensions": {"source": "--ui-density-small-row-height"}},
    "control-large": {"$value": "{density.large-control-height}", "$type": "dimension", "$extensions": {"source": "--ui-density-large-control-height"}},
    "nav-icon-box": {"$value": "{density.nav-icon-box-size}", "$type": "dimension", "$extensions": {"source": "--ui-density-nav-icon-box-size"}},
}
core["duration"] = {
    "resize": {"$value": "300ms", "$type": "duration", "$extensions": {"source": "css-var --resize-dur (.t-resize, 3tlx9g3u00e4v.css); the sidebar's width transition is duration-200 on <nav>"}},
    "sidebar": {"$value": "200ms", "$type": "duration", "$extensions": {"source": "duration-200 on <nav> (transition-[width,transform])"}},
    "page-fade": {"$value": "150ms", "$type": "duration", "$extensions": {"source": "css-var --page-fade-dur (.connector-detail-page)"}},
    "theme": {"$value": "500ms", "$type": "duration", "$extensions": {"source": "transition-colors duration-500 on the task page's main column"}},
    "streamer": {"$value": "260ms", "$type": "duration", "$extensions": {"source": "css-var --ppt-streamer-move-ms (.ppt-streamer-overlay)"}},
}
core["easing"] = {
    "resize": {"$value": [0.22, 1, 0.36, 1], "$type": "cubicBezier", "$extensions": {"source": "css-var --resize-ease (.t-resize)"}},
    "standard": {"$value": [0.4, 0, 0.2, 1], "$type": "cubicBezier", "$extensions": {"source": "Tailwind's ease-in-out, used by the window-controls padding transition and every `transition-*` utility"}},
    "streamer": {"$value": [0.22, 0.61, 0.36, 1], "$type": "cubicBezier", "$extensions": {"source": "css-var --ppt-streamer-ease"}},
}
core["breakpoint"] = {k: {"$value": v, "$type": "dimension", "$extensions": {"source": "Tailwind's screens as used in the utilities (sm:, md:, lg:, xl:)"}} for k, v in (("sm", "640px"), ("md", "768px"), ("lg", "1024px"), ("xl", "1280px"))}


def build(node, path=""):
    if isinstance(node, dict) and "type" in node and "value" in node:
        ty, val = node["type"], node["value"]
        if ty == "dimension" and isinstance(val, (int, float)):
            val = ("%g" % val) + "px"
        if ty == "color":
            val = norm_color(val) if not str(val).startswith("{") else val
        t = {"$value": val, "$type": ty, "$extensions": {"source": node["source"]}}
        if node.get("description"):
            t["$description"] = node["description"]
        return t
    return {k: build(v, f"{path}.{k}" if path else k) for k, v in node.items() if not k.startswith("_")}


for k, v in build(SPEC.get("core", {})).items():
    core[k] = {**core.get(k, {}), **v} if isinstance(core.get(k), dict) else v
for setname, tree in (("light", light), ("dark", dark)):
    for k, v in build(SPEC.get(setname, {})).items():
        tree[k] = {**tree.get(k, {}), **v} if isinstance(tree.get(k), dict) else v

light["$extensions"] = {"notTokenised": light_skipped}
dark["$extensions"] = {"notTokenised": dark_skipped}


# every alias must point at a token that exists in core or the same set
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


CORE_NAMES = {n for n, _ in tokens_of(core)}
for setname, tree in (("core", core), ("light", light), ("dark", dark)):
    names = CORE_NAMES | {n for n, _ in tokens_of(tree)}
    for n, t in tokens_of(tree):
        for a in aliases(t["$value"]):
            if a not in names:
                raise KeyError(f"{setname}.{n}: alias {{{a}}} points at nothing")

tokens = {
    "core": core, "light": light, "dark": dark,
    "$themes": [
        {"id": "light", "name": "Light", "selectedTokenSets": {"core": "source", "light": "enabled"}, "$description": "Manus's `:root` palette; Settings > General > Theme: Light"},
        {"id": "dark", "name": "Dark", "selectedTokenSets": {"core": "source", "dark": "enabled"}, "$description": "Manus's `.dark` palette; Settings > General > Theme: Dark, or Auto on a dark system (the state every page was captured in)"},
    ],
    "$metadata": {"tokenSetOrder": ["core", "light", "dark"]},
}
(HERE / "tokens.json").write_text(json.dumps(tokens, indent=2, ensure_ascii=False) + "\n")


def count(d):
    return sum(count(v) for k, v in d.items() if not k.startswith("$")) if isinstance(d, dict) and "$value" not in d else 1


print({k: count(v) for k, v in tokens.items() if k in ("core", "light", "dark")}, "not tokenised:", len(light_skipped), len(dark_skipped))
