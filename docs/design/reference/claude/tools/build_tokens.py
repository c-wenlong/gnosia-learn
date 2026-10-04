#!/usr/bin/env python3
"""Build tokens.json (W3C DTCG, Tokens Studio multi-set layout) from the raw captures.

Sources, read from claude.ai on 2026-10-04:
  raw/css-vars.json          every custom property Claude's stylesheets declare, by selector and
                             enclosing condition, plus `resolved`: each name as the browser resolves
                             it on a light, a dark and a compact root (tools/capture/vars.mjs)
  raw/component-tokens.json  values that are not one variable: measured on the real elements, each
                             with the measurement it came from ("source")

Claude's design system ("cds") layers three things. Nine 35-step colour ramps (gray, red, orange,
yellow, green, aqua, blue, violet, magenta) and the `--cds-role-*` names over them are declared once
on `:where(:root, :host)`; they become the `core` set's `color` group. The semantic names (surface,
text, fill, bg, border, on, alpha, neutral, chart, shadow, the controls' colours) are declared on
`.cds-root` for light and again under `data-mode="dark"`; they become the `light` and `dark` sets.
The older palette the app's Tailwind classes still read (`--bg-000`, `--text-100`, `--border-300`,
...), HSL triplets under `[data-color-version="v2"][data-theme="claude"]`, is the `legacy` group of
each set, and the sidebar frame's own names (`--df-*`) the `frame` group.

A token is an alias (`{color.gray.850}`) when its winning declaration in that theme is a plain
`var(--x)` and --x is a token whose resolved value is the same; otherwise it is the resolved value.
Sizes are the comfortable density the account uses, with the compact value (the default when no
data-density is set) in `$extensions.compact`. A value DTCG cannot carry (a `linear()` spring, a
percentage, a colour that depends on currentColor) is listed under the set's
`$extensions.notTokenised`. Every token carries `$extensions.source`. The builder refuses an alias
that points at nothing and a dimension that is not one px or rem length. Deterministic: same
inputs, same bytes.
"""
import json, math, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent.parent
RAW = HERE / "raw"
V = json.loads((RAW / "css-vars.json").read_text())
SPEC = json.loads((RAW / "component-tokens.json").read_text())
RES = V["resolved"]
RULES = [r for r in V["cds"] + V["app"] if r.get("selector")]

HUES = ["gray", "red", "orange", "yellow", "green", "aqua", "blue", "violet", "magenta"]
ROOT = ":where(:root, :host)"
DARK_SEL = '[data-mode="dark"] .cds-root:not([data-mode="light"]):not([data-mode="system"]), .cds-root[data-mode="dark"]'
LIGHT_BLOCKS = [((), ROOT), ((), ":root"), ((), ".cds-root"), ((), '.cds-root[data-density="comfortable"]'),
                ((), ":where(:root, :host, .cds-root[data-mode], [data-mode] .cds-root:not([data-mode]))"),
                ((), '[data-color-version="v2"][data-theme="claude"], [data-color-version="v2"][data-theme="claude"][data-mode="light"]'),
                ((), ".dframe-root"), ((), ".dframe-sidebar"), ((), ".dframe-root .dframe-sidebar, .dframe-root .dframe-card")]
DARK_BLOCKS = LIGHT_BLOCKS + [((), '[data-mode="dark"]'), ((), DARK_SEL),
                              ((), ':where([data-mode="dark"] .cds-root:not([data-mode="light"]):not([data-mode="system"]), .cds-root[data-mode="dark"], .cds-dark-scope[data-mode="dark"])'),
                              ((), '[data-color-version="v2"][data-theme="claude"][data-mode="dark"]'),
                              ((), '[data-mode="dark"] .dframe-root'), ((), '[data-mode="dark"] .dframe-root .dframe-sidebar, [data-mode="dark"] .dframe-root .dframe-card'),
                              ((), '[data-mode="dark"] .dframe-root .dframe-sidebar'), ((), '[data-mode="dark"] .dframe-root[data-variant="web"] .dframe-sidebar')]


def declared(theme):
    """The last declaration of each name across the theme's blocks, in stylesheet order (the
    cascade, for blocks of equal weight)."""
    blocks = set(LIGHT_BLOCKS if theme == "light" else DARK_BLOCKS)
    out = {}
    for r in RULES:
        if (tuple(r["context"]), r["selector"]) in blocks:
            for k, v in r["properties"].items():
                out[k] = (v, r["selector"])
    return out


DECL = {"light": declared("light"), "dark": declared("dark")}

# ---------------------------------------------------------------- value helpers


def px(v):
    m = re.fullmatch(r"(-?\d*\.?\d+(?:e[-+]?\d+)?)px", str(v).strip())
    if not m:
        raise ValueError("not a px length: %r" % v)
    f = float(m.group(1))
    if abs(f) > 1e6:
        f = 9999
    return ("%g" % round(f, 3)) + "px"


def lin(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def oklab_rgb(L, a, b):
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
           -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]
    return [round(min(1, max(0, lin(x))) * 255) for x in rgb]


def fmt_color(rgb, a):
    a = round(float(a), 3)
    if a >= 1:
        return "#%02x%02x%02x" % tuple(rgb)
    return "rgba(%d, %d, %d, %s)" % (rgb[0], rgb[1], rgb[2], "%g" % a)


def color(c):
    """Any colour string the browser computes -> '#rrggbb' or 'rgba(r, g, b, a)'."""
    c = c.strip()
    m = re.fullmatch(r"#([0-9a-fA-F]{6})", c)
    if m:
        return c.lower()
    m = re.fullmatch(r"rgba\((\d+), (\d+), (\d+), ([\d.]+)\)", c)
    if m:
        return fmt_color([int(m.group(i)) for i in (1, 2, 3)], m.group(4))
    m = re.fullmatch(r"rgb\((\d+), (\d+), (\d+)\)", c)
    if m:
        return fmt_color([int(m.group(i)) for i in (1, 2, 3)], 1)
    m = re.fullmatch(r"color\(srgb ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)(?: / ([\d.]+))?\)", c)
    if m:
        return fmt_color([round(min(1, max(0, float(m.group(i)))) * 255) for i in (1, 2, 3)], m.group(4) or 1)
    m = re.fullmatch(r"oklab\(([-\d.e]+) ([-\d.e]+) ([-\d.e]+)(?: / ([\d.]+))?\)", c)
    if m:
        return fmt_color(oklab_rgb(float(m.group(1)), float(m.group(2)), float(m.group(3))), m.group(4) or 1)
    m = re.fullmatch(r"rgba\((\d+), (\d+), (\d+), (0)\)", c)
    raise ValueError("colour not understood: " + c)


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
    return [x.strip() for x in out if x.strip()]


COLOR_RE = r"(#[0-9a-fA-F]{3,8}|(?:rgba?|color|oklab|oklch)\([^)]*\))"


def shadow(v):
    """A computed (or measured) box-shadow -> DTCG shadow layers; None if it cannot be read."""
    layers = []
    for part in split_top(v):
        inset = " inset" in " " + part or part.startswith("inset")
        part = re.sub(r"\binset\b", "", part).strip()
        m = re.search(COLOR_RE, part)
        if not m:
            return None
        col = color(m.group(1)) if not m.group(1).startswith("#") else color(norm_hex(m.group(1)))
        nums = (part[:m.start()] + " " + part[m.end():]).split()
        if not 2 <= len(nums) <= 4:
            return None
        nums = [n if n.endswith("px") else n + "px" for n in nums] + ["0px"] * (4 - len(nums))
        if col == "rgba(0, 0, 0, 0)" and all(float(n[:-2]) == 0 for n in nums):
            continue
        layers.append({"color": col, "offsetX": px(nums[0]), "offsetY": px(nums[1]), "blur": px(nums[2]), "spread": px(nums[3]), "inset": inset})
    return layers


def norm_hex(h):
    h = h[1:]
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h)
    rgb = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return fmt_color(rgb, int(h[6:8], 16) / 255 if len(h) == 8 else 1)


def ms(v):
    m = re.fullmatch(r"([\d.]+)(m?s)", v.strip())
    if not m:
        raise ValueError(v)
    n = float(m.group(1)) * (1 if m.group(2) == "ms" else 1000)
    return ("%g" % round(n, 3)) + "ms"


def bezier(v):
    m = re.fullmatch(r"cubic-bezier\(([^)]*)\)", v.strip())
    if m:
        return [float("%g" % float(x)) for x in m.group(1).split(",")]
    return {"linear": [0, 0, 1, 1], "ease": [0.25, 0.1, 0.25, 1], "ease-in": [0.42, 0, 1, 1], "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1]}.get(v.strip())


def rem_px(v):
    """calc(N rem * var(--cds-rem-scale,1)) or N rem -> px string at rem-scale 1."""
    m = re.fullmatch(r"calc\(([\d.]+)rem \* var\(--cds-rem-scale,\s*1\)\)", v.strip()) or re.fullmatch(r"([\d.]+)rem", v.strip())
    if not m:
        return None
    return px("%gpx" % (float(m.group(1)) * 16))


def tok(value, ty, source, **ext):
    t = {"$value": value, "$type": ty, "$extensions": {"source": source}}
    t["$extensions"].update(ext)
    return t


def put(tree, path, t):
    node = tree
    for k in path[:-1]:
        node = node.setdefault(k, {})
    node[path[-1]] = t


def get(tree, path):
    node = tree
    for k in path.split("."):
        if not isinstance(node, dict) or k not in node:
            return None
        node = node[k]
    return node


def src(name, theme):
    d = DECL[theme].get(name)
    where = "(%s)" % d[1][:110] if d else "(resolved on the root; declared outside the main theme blocks)"
    return "css-var %s %s" % (name, where)


# ---------------------------------------------------------------- core

core = {}
core_index = {}  # css name -> token path
for hue in HUES:
    for name, r in sorted(RES["light"].items(), key=lambda kv: int(kv[0].rsplit("-", 1)[1]) if re.fullmatch(r"--cds-%s-\d+" % hue, kv[0]) else 0):
        if re.fullmatch(r"--cds-%s-\d+" % hue, name):
            step = name.rsplit("-", 1)[1]
            put(core, ["color", hue, step], tok(color(r["value"]), "color", "css-var %s (%s)" % (name, ROOT)))
            core_index[name] = "color.%s.%s" % (hue, step)
for name in ["--cds-clay", "--cds-clay-emphasized", "--cds-heather", "--cds-plum", "--cds-cactus", "--cds-mineral", "--cds-black"]:
    put(core, ["color", "brand", name[6:]], tok(color(RES["light"][name]["value"]), "color", src(name, "light") + "; the same in both themes"))
    core_index[name] = "color.brand." + name[6:]
core["color"]["brand"]["$description"] = "Claude's brand pigments: clay is the orange of the asterisk mark and the send button (--cds-fill-brand is clay-emphasized, its hover clay); heather, plum, cactus and mineral tint pictograms."


def alias_or_literal(name, theme, value, index_sets):
    """{path} when the declaration is a plain var() of a token with the same resolved value."""
    d = DECL[theme].get(name)
    if d:
        m = re.fullmatch(r"var\((--[\w-]+)\)", d[0].strip())
        if m:
            target = m.group(1)
            for idx in index_sets:
                if target in idx:
                    tr = RES[theme].get(target)
                    if tr and tr.get("value") == RES[theme][name].get("value"):
                        return "{" + idx[target] + "}"
    return value


for name in sorted(RES["light"]):
    if name.startswith("--cds-role-") and RES["light"][name]["kind"] == "color":
        leaf = name[len("--cds-role-"):]
        role, _, step = leaf.partition("-")
        assert RES["dark"][name]["value"] == RES["light"][name]["value"], name
        val = alias_or_literal(name, "light", color(RES["light"][name]["value"]), [core_index])
        put(core, ["color", "role", role, step or "base"], tok(val, "color", src(name, "light")))
        core_index[name] = "color.role.%s.%s" % (role, step or "base")
core["color"]["role"]["$description"] = "The role scales the semantic names read: accent is blue, danger red, success green, warning yellow, pro violet, plus the tooltip pair. `fill` is the solid used for buttons, `on` the text on it."

# font families: the cds roles, then the chat font options
FONT_NAMES = [("sans", "--cds-font-sans", "UI text: Anthropic Sans (`anthropic-sans`, self-hosted) then the system stack"),
              ("sans-display", "--cds-font-sans-display", "display sans; the same face as sans in this build"),
              ("serif", "--cds-font-voice", "Anthropic Serif (`anthropic-serif`): the wordmark, the greeting, page titles and, by default, Claude's replies"),
              ("mono", "--cds-font-mono", "Anthropic Mono (`anthropic-mono`): code blocks and code spans"),
              ("system", "--cds-font-system", "the platform's own face, used when Settings > Appearance > Chat font is System"),
              ("chat-response", "--font-claude-response", "the chat font role Claude's replies are set in (.font-claude-response); Anthropic Serif by default"),
              ("chat-user", "--font-user-message", "the role user messages are set in; the UI sans"),
              ("dyslexia", "--font-dyslexia", "the Dyslexic friendly chat font option (OpenDyslexic)"),
              ("hyperlegible", "--font-atkinson-hyperlegible", "Atkinson Hyperlegible Next, a further readability option")]
for key, name, why in FONT_NAMES:
    r = RES["light"].get(name)
    if r and r["kind"] == "fontFamily":
        put(core, ["fontFamily", key], tok(r["value"], "fontFamily", src(name, "light") + "; " + why))
core["fontFamily"]["$description"] = ("Anthropic Sans, Serif and Mono are proprietary faces served from assets-proxy.anthropic.com; the stacks fall back to the system sans, Georgia and ui-monospace. "
                                      "Settings > Appearance > Chat font switches the reply face between Anthropic Serif (default), the system face and Dyslexic friendly; html[data-font] is `anthropic` or `system`.")

wght_dark = {k: RES["dark"].get("--cds-font-wght-" + k, {}).get("raw", "") for k in ("regular", "medium", "semibold", "bold")}
for k in ("regular", "medium", "semibold", "bold"):
    name = "--cds-font-weight-" + k
    put(core, ["fontWeight", k], tok(int(RES["light"][name]["value"]), "fontWeight", src(name, "light"), darkVariationAxis=wght_dark[k]))
core["fontWeight"]["$description"] = "Claude's semibold is 580 and its bold 600. In dark mode the variable faces are drawn lighter: each weight also sets font-variation-settings to the `wght` value in $extensions.darkVariationAxis (360, 460, 540, 560)."

ROLES = ["caption", "footnote", "code", "body", "prose", "heading", "title"]
for role in ROLES:
    for kind, prefix in (("fontSize", "--cds-font-size-"), ("lineHeight", "--cds-leading-")):
        name = prefix + role
        r = RES["light"][name]
        ext = {}
        if name in RES["compact"]:
            ext["compact"] = px(RES["compact"][name]["value"])
        put(core, [kind, role], tok(px(r["value"]), "dimension", src(name, "light") + " at comfortable density", **ext))
for key, size, lh in (("display", "display-size", "display-line-height"), ("page-title", "page-title-size", "page-title-line-height"), ("chat", "chat-size", "chat-line-height")):
    put(core, ["fontSize", key], tok("{typeMeasured.%s}" % size, "dimension", "measured, see typeMeasured.%s" % size))
    put(core, ["lineHeight", key], tok("{typeMeasured.%s}" % lh, "dimension", "measured, see typeMeasured.%s" % lh))
core["fontSize"]["$description"] = "The cds type roles at comfortable density (the account's setting); $extensions.compact is the size when data-density is compact or unset. display, page-title and chat are measured on the greeting, the page h1 and Claude's replies."

core["typography"] = {}
combos = sorted({m.groups() for r in RULES for m in [re.fullmatch(r"\.text-(caption|footnote|code|body|heading|title)-(regular|medium|semibold|bold)", r["selector"])] if m},
                key=lambda x: (ROLES.index(x[0]), ["regular", "medium", "semibold", "bold"].index(x[1])))
for role, weight in combos:
    fam = "{fontFamily.mono}" if role == "code" else "{fontFamily.sans}"
    core["typography"]["%s-%s" % (role, weight)] = tok({"fontFamily": fam, "fontSize": "{fontSize.%s}" % role, "lineHeight": "{lineHeight.%s}" % role, "fontWeight": "{fontWeight.%s}" % weight, "letterSpacing": "0px"},
                                                       "typography", "utility class .text-%s-%s (font-size var(--cds-font-size-%s), line-height var(--cds-leading-%s), font-weight var(--cds-font-weight-%s))" % (role, weight, role, role, weight))
core["typography"]["display"] = tok({"fontFamily": "{fontFamily.serif}", "fontSize": "{fontSize.display}", "lineHeight": "{lineHeight.display}", "fontWeight": 300, "letterSpacing": "0px"}, "typography",
                                    "measured: the home greeting (.font-display: Anthropic Serif, weight 300 with the opsz 48 axis)")
core["typography"]["page-title"] = tok({"fontFamily": "{fontFamily.serif}", "fontSize": "{fontSize.page-title}", "lineHeight": "{lineHeight.page-title}", "fontWeight": "{fontWeight.medium}", "letterSpacing": "0px"}, "typography",
                                       "measured: PageHeader h1 (font-voice font-medium)")
core["typography"]["chat"] = tok({"fontFamily": "{fontFamily.chat-response}", "fontSize": "{fontSize.chat}", "lineHeight": "{lineHeight.chat}", "fontWeight": "{fontWeight.regular}", "letterSpacing": "0px"}, "typography",
                                 "measured: an assistant paragraph (.font-claude-response-body)")
core["typography"]["user-message"] = tok({"fontFamily": "{fontFamily.chat-user}", "fontSize": "{fontSize.heading}", "lineHeight": "{lineHeight.heading}", "fontWeight": "{fontWeight.regular}", "letterSpacing": "0px"}, "typography",
                                         "measured: a user message paragraph (text-heading font-normal)")

# density: every --cds-* dimension on the root that is not a type size
dens, not_core = {}, []
for name in sorted(RES["light"]):
    r = RES["light"][name]
    if not name.startswith("--cds-") or r["kind"] != "dimension" or name.startswith(("--cds-font-size-", "--cds-leading-")):
        continue
    if re.fullmatch(r"--cds-(%s)-\d+" % "|".join(HUES), name):
        continue
    ext = {}
    if name in RES["compact"]:
        ext["compact"] = px(RES["compact"][name]["value"])
    dens[name[6:]] = tok(px(r["value"]), "dimension", src(name, "light") + " at comfortable density", **ext)
dens["$description"] = ("The cds size scale (radius, control heights, icon, pad-*, gap-*, avatar-*, checkbox, switch, panel, page header, rings) at comfortable density, "
                        "the account's setting; $extensions.compact is the value when data-density is compact or unset. Every value is a rem multiple times --cds-rem-scale (1).")
core["density"] = dens

# the control size steps ([data-step] / [data-size]) as declared
steps = {}
for r in RULES:
    m = re.fullmatch(r'\.cds-root \[data-step="(\d)"\]', r["selector"])
    if m and not r["context"]:
        for k, v in r["properties"].items():
            p = rem_px(v)
            if p:
                steps.setdefault("step-" + m.group(1), {})[k[6:]] = tok(p, "dimension", "css-var %s (%s)" % (k, r["selector"]))
steps["$description"] = "A control's size steps, set with data-step 1 to 5 (data-size xs, sm, lg map onto them): step-2 is the compact density, step-4 the comfortable one."
core["controlStep"] = steps

core["duration"], core["easing"], core["zIndex"], core["opacity"] = {}, {}, {}, {}
not_core = []
for name in sorted(RES["light"]):
    r = RES["light"][name]
    if not name.startswith(("--cds-", "--df-")):
        continue
    short = name[6:] if name.startswith("--cds-") else "frame-" + name[5:]
    if r["kind"] == "duration" and re.match(r"--(cds|df)-dur-", name):
        core["duration"][short.replace("dur-", "")] = tok(ms(r["value"]), "duration", src(name, "light"))
    elif r["kind"] == "easing" and re.match(r"--(cds|df)-(ease|btn-spring)", name):
        b = bezier(r["value"])
        if b:
            core["easing"][short.replace("ease-", "")] = tok(b, "cubicBezier", src(name, "light"))
        else:
            not_core.append({"name": name, "value": r["value"], "why": "a linear() spring, which DTCG's cubicBezier cannot carry"})
    elif r["kind"] == "number" and name.startswith("--cds-z-"):
        core["zIndex"][name[8:]] = tok(r["value"], "number", src(name, "light"))
    elif r["kind"] == "number" and name.startswith("--cds-opacity-"):
        core["opacity"][name[14:]] = tok(r["value"], "number", src(name, "light"))
core["duration"]["$description"] = "fast 60 ms (button press), snap 120 ms (most UI), base 200 ms, sheet 300 ms, slow 450 ms; the sidebar frame has its own fast and slow."

# the sidebar frame's sizes (--df-*), resolved inside .dframe-sidebar[data-variant=web]
frame = {}
for name in sorted(RES["light"]):
    r = RES["light"][name]
    if name.startswith("--df-") and r["kind"] == "dimension" and not r.get("note"):
        ext = {}
        if name in RES["compact"]:
            ext["compact"] = px(RES["compact"][name]["value"])
        frame[name[5:]] = tok(px(r["value"]), "dimension", "css-var %s, resolved inside aside.dframe-sidebar[data-variant=web][data-density=comfortable]" % name, **ext)
frame["$description"] = "The sidebar frame's own geometry (row height, font, icon, slots, the 288 width, the 48 header) at the comfortable web density; $extensions.compact is the default without it."
core["frame"] = frame

# Tailwind's theme, wired to cds where Claude rewired it
tw = {}
for name in sorted(RES["light"]):
    r = RES["light"][name]
    if re.fullmatch(r"--(spacing|container-\w+|radius-\w+|blur-\w+)", name) and r["kind"] == "dimension":
        tw[name[2:]] = tok(px(r["value"]), "dimension", "css-var %s (Tailwind v4 theme layer)" % name)
tw["$description"] = "The Tailwind v4 theme the utility classes read: a 4px spacing unit, the container widths (max-w-2xl is the 672 home composer, the transcript is 48rem) and the radius scale."
core["tailwind"] = tw

# ---------------------------------------------------------------- themed sets

GROUPS = [
    (r"--cds-(surface-.*|page-bg)$", "surface", lambda n: n[6:].replace("surface-", "") if n != "--cds-page-bg" else "page"),
    (r"--cds-.*git.*", "git", lambda n: n[6:]),
    (r"--cds-(bg-editor|editor|border-editor).*", "editor", lambda n: n[6:]),
    (r"--cds-text-.*", "text", lambda n: n[11:]),
    (r"--cds-fill-.*", "fill", lambda n: n[11:]),
    (r"--cds-bg-.*", "bg", lambda n: n[9:]),
    (r"--cds-border.*", "border", lambda n: n[13:] or "default"),
    (r"--cds-on-.*", "on", lambda n: n[9:]),
    (r"--cds-oncolor-.*", "on", lambda n: "color-" + n[14:]),
    (r"--cds-alpha-.*", "alpha", lambda n: n[12:]),
    (r"--cds-neutral-.*", "neutral", lambda n: n[14:]),
    (r"--cds-chart-.*", "chart", lambda n: n[12:]),
    (r"--cds-(shadow|focus-shadow|panel-shadow|ring-color).*", "shadow", lambda n: n[6:].replace("shadow-", "").replace("-shadow", "")),
    (r"--cds-pictogram.*", "pictogram", lambda n: n[16:]),
    (r"--cds-(backdrop)$", "surface", lambda n: "backdrop"),
    (r"--cds-.*", "control", lambda n: n[6:]),
    (r"--df-.*", "frame", lambda n: n[5:]),
    (r"--(accent|bg|brand|border|danger|oncolor|pictogram|success|text|warning|always)-[\w-]+", "legacy", lambda n: n[2:]),
]


def group_of(name):
    if re.fullmatch(r"--cds-(%s)-\d+" % "|".join(HUES), name) or name.startswith(("--cds-role-", "--cds-hsl-")) or name in core_index:
        return None
    for pat, g, leaf in GROUPS:
        if re.fullmatch(pat, name):
            return g, leaf(name)
    return None


def themed(theme):
    tree, index, skipped = {}, {}, []
    pending = []
    for name in sorted(RES[theme]):
        r = RES[theme][name]
        g = group_of(name)
        if not g:
            continue
        if r["kind"] not in ("color", "shadow"):
            if r["kind"] == "other" and (name.startswith(("--cds-", "--df-"))):
                why = r.get("note") or ("the dark variable-font weight axis; carried as fontWeight.*.$extensions.darkVariationAxis" if "wght" in name else "not a colour, shadow or length")
                skipped.append({"name": name, "value": r["raw"], "why": why})
            continue
        if r["raw"] == "none":
            continue
        pending.append((name, g, r))
    for name, (g, leaf), r in pending:
        index[name] = "%s.%s" % (g, leaf)
    for name, (g, leaf), r in pending:
        s = src(name, theme)
        if r.get("hslTriplet"):
            s += "; an HSL triplet, read as hsl()"
        if r["kind"] == "color":
            val = alias_or_literal(name, theme, color(r["value"]), [index, core_index])
            put(tree, [g, leaf], tok(val, "color", s))
        else:
            layers = shadow(r["value"])
            if layers is None:
                skipped.append({"name": name, "value": r["raw"], "why": "shadow not readable"})
                continue
            if not layers:
                continue
            put(tree, [g, leaf], tok(layers, "shadow", s))
    return tree, skipped


light, light_skipped = themed("light")
dark, dark_skipped = themed("dark")

DESC = {
    "surface": "Grounds: 0 is the page under everything, 1 the app's own ground (the dframe sets --cds-page-bg to it), 2 raised panels, 3 the composer, menus and popovers; backdrop dims behind dialogs.",
    "text": "primary, secondary, muted (placeholder, meta), disabled; then accent, danger, success, warning, pro and the tint-* inks.",
    "fill": "Solid and translucent fills: primary (the dark/light button), ghost-hover and ghost-selected (every row and icon button), control, field, brand (the clay send button).",
    "bg": "Tinted backgrounds for chips, banners and the user message bubble (bg.user-message).",
    "border": "default is --cds-alpha-2, a 10% wash of the text colour; strong 20%. Rings are drawn with box-shadow, not border.",
    "alpha": "The neutral-900 ink at 0, 5, 10, 20, 35, 50, 60, 70, 85 and 95%: near-black in light, white in dark.",
    "neutral": "The gray ramp in reading order: neutral-0 is the ground side and neutral-900 the ink side, so the scale flips in dark.",
    "frame": "The sidebar frame (--df-*): the sidebar ground (web-sidebar-bg), row hover and selected fills, and the frame's own gray steps z0 to z6.",
    "legacy": "The older palette from before cds (`--bg-000` ... `--text-500`, `--accent-*`, `--border-*`), still read by Tailwind classes such as bg-bg-000/50 and border-border-400 (the code block).",
    "control": "Colours owned by single controls: switch track and knob, slider, segmented control track and thumb, skeleton, tooltip, shortcut caps, button-on-content.",
}
for tree in (light, dark):
    for g, d in DESC.items():
        if g in tree:
            tree[g]["$description"] = d


# ---------------------------------------------------------------- measured values


def build(node):
    if isinstance(node, dict) and "type" in node and "value" in node:
        ty, val = node["type"], node["value"]
        if ty == "dimension":
            val = px(("%g" % val) + "px") if isinstance(val, (int, float)) else val
        elif ty == "color":
            val = color(val) if not str(val).startswith("#") else color(norm_hex(val))
        elif ty == "shadow":
            val = shadow(val)
        return tok(val, ty, node["source"])
    return {k: build(v) for k, v in node.items() if not k.startswith("_")}


for k, v in build(SPEC.get("core", {})).items():
    core[k] = {**core.get(k, {}), **v}
for setname, tree in (("light", light), ("dark", dark)):
    for k, v in build(SPEC.get(setname, {})).items():
        tree[k] = {**tree.get(k, {}), **v}

light["$extensions"] = {"notTokenised": light_skipped}
dark["$extensions"] = {"notTokenised": dark_skipped}
core["$extensions"] = {"notTokenised": not_core + [
    {"name": "--new-page-greeting-font-size", "value": "clamp(1.875rem, 1.2rem + 2vw, 2.375rem)", "why": "a fluid size; typeMeasured.display-size is its value at 1440 wide"},
    {"name": "--cds-message-bubble-measure", "value": "85%", "why": "a percentage of the transcript column"},
    {"name": "--cds-hsl-*", "value": "64 names", "why": "HSL-triplet copies of the gray ramp for hsl(var()) use; the ramp itself is color.gray"},
]}

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


CORE_TOK = dict(tokens_of(core))
for setname, tree in (("core", core), ("light", light), ("dark", dark)):
    names = dict(CORE_TOK)
    names.update(dict(tokens_of(tree)))
    for n, t in tokens_of(tree):
        for a in aliases(t["$value"]):
            if a not in names:
                raise KeyError(f"{setname}.{n}: alias {{{a}}} points at nothing")
            if t["$type"] in ("color", "dimension") and names[a]["$type"] != t["$type"]:
                raise TypeError(f"{setname}.{n}: alias {{{a}}} is a {names[a]['$type']}")
        if t["$type"] == "dimension" and not aliases(t["$value"]):
            if not re.fullmatch(r"-?\d*\.?\d+(px|rem)", t["$value"]):
                raise ValueError(f"{setname}.{n}: dimension {t['$value']!r} is not one px or rem length")
        if t["$type"] == "color" and not aliases(t["$value"]):
            if not re.fullmatch(r"#[0-9a-f]{6}|rgba\(\d+, \d+, \d+, [\d.]+\)", t["$value"]):
                raise ValueError(f"{setname}.{n}: colour {t['$value']!r}")
        if t["$type"] == "shadow":
            for layer in t["$value"]:
                for k in ("offsetX", "offsetY", "blur", "spread"):
                    if not re.fullmatch(r"-?\d*\.?\d+px", layer[k]):
                        raise ValueError(f"{setname}.{n}: shadow {k} {layer[k]!r}")

tokens = {
    "core": core, "light": light, "dark": dark,
    "$themes": [
        {"id": "light", "name": "Light", "selectedTokenSets": {"core": "source", "light": "enabled"}, "$description": "data-mode=\"light\" on <html> and every .cds-root; Settings > General > Appearance > Theme: Light, or System on a light OS"},
        {"id": "dark", "name": "Dark", "selectedTokenSets": {"core": "source", "dark": "enabled"}, "$description": "data-mode=\"dark\"; Theme: Dark, or System with prefers-color-scheme: dark (the state every page was captured in)"},
    ],
    "$metadata": {"tokenSetOrder": ["core", "light", "dark"]},
}
(HERE / "tokens.json").write_text(json.dumps(tokens, indent=2, ensure_ascii=False) + "\n")


def count(d):
    return sum(count(v) for k, v in d.items() if not k.startswith("$")) if isinstance(d, dict) and "$value" not in d else 1


print({k: count(v) for k, v in tokens.items() if k in ("core", "light", "dark")}, "not tokenised:", len(core["$extensions"]["notTokenised"]), len(light_skipped), len(dark_skipped))
