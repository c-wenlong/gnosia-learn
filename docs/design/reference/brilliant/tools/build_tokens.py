#!/usr/bin/env python3
"""Build tokens.json (W3C DTCG, Tokens Studio multi-set layout) from the raw captures.

Sources, all read from brilliant.org on 2026-09-25:
  raw/css-vars-public.json  every Panda custom property on :root (light) and under [data-theme="dark"]
  raw/text-styles.tsv       every Panda textStyle rule in the main stylesheet
  raw/measurements.md       computed styles per component (signed-in app and public pages)
Every token carries $extensions.source: "css-var <name>", "css <rule>", "computed <where>" or "estimated ...".
"""
import csv, json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent.parent
RAW = HERE / "raw"
V = json.loads((RAW / "css-vars-public.json").read_text())
ROOT, DARK = V["root"], {**V["root"], **V["dark"]}
P = "--panda-"


def tok(value, type_, source, desc=None):
    t = {"$value": value, "$type": type_, "$extensions": {"source": source}}
    if desc:
        t["$description"] = desc
    return t


def hexfull(v):
    v = v.strip()
    m = re.fullmatch(r"#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])?", v)
    if m:
        return "#" + "".join(c * 2 for c in m.groups() if c)
    return v.lower() if v.startswith("#") else v


# ---------- palette (theme independent primitives) ----------
HUES = ["gray", "blue", "red", "green", "yellow", "orange", "pink", "purple", "pear", "papaya", "mint", "teal", "cyan", "oat"]
ALPHAS = {"white-alpha": "whiteAlpha", "black-alpha": "blackAlpha"}
palette = {}
for k, v in ROOT.items():
    m = re.fullmatch(r"--panda-colors-([a-z]+(?:-alpha)?)-(\d+)", k)
    if not m or (m.group(1) not in HUES and m.group(1) not in ALPHAS):
        continue
    fam = ALPHAS.get(m.group(1), m.group(1))
    palette.setdefault(fam, {})[m.group(2)] = tok(hexfull(v), "color", f"css-var {k}")
for fam in palette:
    palette[fam] = dict(sorted(palette[fam].items(), key=lambda kv: int(kv[0])))
for name in ("white", "black", "dark-gray", "dark-gray-alpha"):
    palette[name] = tok(hexfull(ROOT[P + "colors-" + name]), "color", f"css-var {P}colors-{name}",
                        "bg.elevated in dark" if name == "dark-gray" else None)

REF = {}  # "--panda-colors-blue-500" -> "{palette.blue.500}"
for fam, steps in palette.items():
    if isinstance(steps, dict) and "$value" not in steps:
        rawfam = {"whiteAlpha": "white-alpha", "blackAlpha": "black-alpha"}.get(fam, fam)
        for s in steps:
            REF[f"--panda-colors-{rawfam}-{s}"] = "{palette.%s.%s}" % (fam, s)
    else:
        REF[f"--panda-colors-{fam}"] = "{palette.%s}" % fam


def resolve(v, env, depth=0):
    for _ in range(12):
        m = re.search(r"var\((--[\w.-]+)(?:,\s*([^()]*))?\)", v)
        if not m:
            break
        v = v[:m.start()] + env.get(m.group(1), m.group(2) or "") + v[m.end():]
    return v


def color_value(raw, env):
    """Alias to the palette when the declared value is exactly one palette variable, else the resolved literal."""
    m = re.fullmatch(r"var\((--panda-colors-[\w-]+)\)", raw.strip())
    if m and m.group(1) in REF:
        return REF[m.group(1)]
    return hexfull(resolve(raw, env))


# ---------- core ----------
core = {"palette": palette}

core["fontFamily"] = {
    "brilliant": tok("CoFo Brilliant", "fontFamily", "css-var --panda-fonts-brilliant; @font-face cofo-brilliant-{regular,medium,bold,italic}.woff2",
                     "All UI text: body, headings, buttons, nav. Weights 400/500/700 + italics. Proprietary (Contrast Foundry)."),
    "robert": tok("CoFo Robert", "fontFamily", "css-var --panda-fonts-robert; @font-face cofo-robert-medium(.italic).woff2",
                  "Serif display face, weight 500 only: onboarding promos, paywall and marketing headlines (display.* styles). Fallback Georgia."),
    "semiMono": tok("CoFo Semi Mono", "fontFamily", "css-var --panda-fonts-semi-mono; computed <custom-interactive> tiles",
                    "Inside lesson interactives (tiles, numbers). 400/500/700."),
    "code": tok("Source Code Pro", "fontFamily", "css-var --panda-fonts-code", "Code interactives and code blocks. 400/500/700 + italics."),
    "math": tok("KaTeX_Main", "fontFamily", "css-var --panda-fonts-math; @font-face KaTeX_* (size-adjust 93%)", "Rendered maths."),
    "legacy": tok("Soleil", "fontFamily", "@font-face Soleil 400/600/700 in the shared stylesheet", "Legacy Django pages (404, /account/settings/). Not used by the current app."),
}
core["fontWeight"] = {
    "regular": tok(400, "fontWeight", "css textStyle body.*"),
    "medium": tok(500, "fontWeight", "css textStyle ui.actions.*, display.*"),
    "semibold": tok(600, "fontWeight", "computed home 'Hey, <name>! How can I help?'", "Synthesised: no 600 face is loaded for CoFo Brilliant."),
    "bold": tok(700, "fontWeight", "css textStyle heading.*"),
}
core["letterSpacing"] = {k: tok(ROOT[P + "letter-spacings-" + k], "dimension", f"css-var {P}letter-spacings-{k}")
                         for k in ("tighter", "tight", "normal", "wide", "wider", "widest")}
core["letterSpacing"]["caps"] = tok("0.48px", "dimension", "css textStyle ui.actions.sm, .panda-badge", "12px caps labels and badges (= wider .04em)")

USED = {
    "display.2xl": "Onboarding promo headline ('Save 30% on Tutor')",
    "display.5xl": "Pricing hero headline",
    "heading.4xl": "Keys popover count",
    "heading.3xl": "Streak popover count",
    "heading.xl": "Page titles (Learning Paths, Login); learning-path title at lg; stat values at lg",
    "heading.lg": "Section titles, course hero title, settings section titles, stat values",
    "heading.md": "Modal titles, section headings, popover titles, chart titles at lg",
    "heading.sm": "Tooltip title, chart title below lg",
    "heading.xs": "'Explore' pill button",
    "body.lg": "Home welcome (bold), promo subtitles, Koji prompt heading (600)",
    "body.base": "Default body, prompts, inputs, menu items, lesson rows",
    "body.sm": "Meta text, segmented control, stat labels, chart axis labels",
    "body.xs": "Delta pills (+1)",
    "ui.actions.lg": "Onboarding question titles, landing CTAs",
    "ui.actions.base": "All buttons (button3d, flat button), choice-card labels",
    "ui.actions.sm": "Uppercase eyebrows, badges, 'START HERE', 'OR' divider",
    "ui.nav.default": "Header nav tabs, settings menu",
    "ui.nav.selected": "Selected nav item, segmented control segments",
    "ui.interactives.semiMono.base": "Interactive tiles (rendered 16/16 500 in lessons)",
}
core["typography"] = {}
with open(RAW / "text-styles.tsv") as f:
    rows = [r for r in csv.reader((l for l in f if not l.startswith("#")), delimiter="\t")][1:]
for name, fam, size, weight, lh, ls, tt in rows:
    lh_out = lh if lh.endswith("px") else f"{round(float(lh) * 100, 1):g}%"
    ls_out = ls if ls.endswith("px") else f"{ls}px"
    v = {"fontFamily": "{fontFamily.%s}" % {"semi-mono": "semiMono"}.get(fam, fam), "fontSize": size, "fontWeight": int(weight),
         "lineHeight": lh_out, "letterSpacing": ls_out}
    if tt:
        v["textCase"] = tt
    node = core["typography"]
    parts = name.split(".")
    for p in parts[:-1]:
        node = node.setdefault(p, {})
    node[parts[-1]] = tok(v, "typography", f"css .panda-textStyle_{name}", USED.get(name))

core["spacing"] = {}
for k, v in ROOT.items():
    if k.startswith(P + "spacing-"):
        core["spacing"][k[len(P + "spacing-"):]] = tok(v, "dimension", f"css-var {k}")
core["spacing"] = dict(sorted(core["spacing"].items(), key=lambda kv: float(kv[0])))

core["size"] = {
    "appBar": tok(ROOT[P + "sizes-app-bar"], "dimension", f"css-var {P}sizes-app-bar", "Header height (+1px border = 65)"),
    "container-sm": tok(ROOT[P + "sizes-container-sm"], "dimension", f"css-var {P}sizes-container-sm", "Content width below lg"),
    "container-lg": tok(ROOT[P + "sizes-container-lg"], "dimension", f"css-var {P}sizes-container-lg", "Content width at lg+"),
    "nux-header": tok(ROOT[P + "sizes-nux-header-height"], "dimension", f"css-var {P}sizes-nux-header-height"),
    "prose": tok(ROOT[P + "sizes-prose"], "dimension", f"css-var {P}sizes-prose"),
    "lesson-column": tok("540px", "dimension", "css --content-scroll-shadow-width min(100%, 540px + 40px)", "Lesson prompt and interactive column"),
    "lesson-frame-radius-inset": tok("34px", "dimension", "computed lesson frame x at 1384 viewport"),
    "home-column": tok("1000px", "dimension", "computed /home at 1384 viewport"),
    "home-card-height": tok("clamp(320px, 50dvh, 500px)", "other", "css --home-card-height (plus banner height)"),
    "settings-menu": tok("280px", "dimension", "computed settings side menu"),
    "settings-form": tok("592px", "dimension", "computed settings form column"),
    "modal-max": tok("448px", "dimension", "css modal-content max-w 448px"),
    "menu-width": tok("280px", "dimension", "computed dropdown-menu-content"),
    "tooltip-max": tok("280px", "dimension", "computed tooltip-content max-w"),
    "button-height": tok("48px", "dimension", "computed button3d, flat button, ghost button"),
    "button-height-pill": tok("52px", "dimension", "computed hue-shift button, iridescent CTA"),
    "button3d-lift": tok("4px", "dimension", "css --button3d-shadow-y / --button3d-translate-y default 4px"),
    "input-height": tok("52px", "dimension", "computed form-input"),
    "icon-button": tok("48px", "dimension", "computed lesson close / glass button"),
    "icon-button-sm": tok("44px", "dimension", "computed settings play, favourite star"),
    "icon-button-xs": tok("32px", "dimension", "computed chat send, streak bolt"),
    "switch-width": tok("48px", "dimension", "computed switch"),
    "switch-height": tok("32px", "dimension", "computed switch"),
    "switch-thumb": tok("24px", "dimension", "computed switch-thumb (w 6)"),
    "progress-default": tok(ROOT[P + "sizes-2"], "dimension", "css .panda-progress--size_default (sizes.2)"),
    "progress-sm": tok(ROOT[P + "sizes-1"], "dimension", "css .panda-progress--size_sm (sizes.1)"),
    "progress-lg": tok(ROOT[P + "sizes-3"], "dimension", "css .panda-progress--size_lg (sizes.3), lesson top bar"),
    "menu-item": tok("48px", "dimension", "computed dropdown-menu-item"),
    "nav-item": tok("40px", "dimension", "computed settings menu item"),
    "segment": tok("32px", "dimension", "computed segment (h 8)"),
    "choice-card-height": tok("228px", "dimension", "computed onboarding choice card"),
    "course-tile": tok("176px", "dimension", "computed course tile at 2xl (152 base, 208 sm, 217.6 lg)"),
    "path-tile": tok("176px", "dimension", "computed learning-path course tile artwork"),
    "koji-dock": tok("84px", "dimension", "computed lesson Koji mascot"),
    "icon-sm": tok("16px", "dimension", "computed nav and meta icons"),
    "icon-md": tok("20px", "dimension", "computed header stat icons (estimated from screenshot)"),
    "icon-lg": tok("24px", "dimension", "computed lesson top bar and rail icons"),
    "badge-height": tok("21.2px", "dimension", "computed .panda-badge (12/13.2 + 4px padding)"),
}
core["breakpoint"] = {k: tok(ROOT[P + "breakpoints-" + k], "dimension", f"css-var {P}breakpoints-{k}")
                      for k in ("xs", "sm", "md", "lg", "xl", "2xl")}
core["breakpoint"]["lg"]["$description"] = "Main desktop switch: header nav, lesson panel border, two-column layouts"

RADIUS_USE = {
    "sm": "Tooltip arrow, variable chips in tiles", "base": "Bar chart bars (top corners)", "xs": "Icon buttons, ghost buttons",
    "md": "Inputs, dropdown menu, popovers, settings nav items, header menu trigger", "lg": "Badges, tooltips, stat boxes, settings menu, tile tray",
    "xl": "Choice cards, setting rows", "2xl": "Modals, stat and chart cards, course tiles, course hero card, level header shadow",
    "3xl": "Figure card, gamification card, ask-Koji pill", "full": "Pills, switches, segmented controls, progress bars, avatars",
}
core["radius"] = {k: tok(ROOT[P + "radii-" + k], "dimension", f"css-var {P}radii-{k}", RADIUS_USE.get(k))
                  for k in ("none", "sm", "base", "xs", "md", "lg", "xl", "2xl", "3xl", "full")}
core["radius"].update({
    "lesson-frame": tok("24px", "dimension", "computed lesson panel lg:bdr 24px"),
    "home-card": tok("24px", "dimension", "computed recommended card bdr 24px"),
    "path-artwork": tok("36px", "dimension", "computed learning-path tile artwork"),
    "footer-card": tok("40px", "dimension", "computed course fixed footer card"),
    "button": tok("54px", "dimension", "computed flat buttons, stat pills, glass buttons"),
    "button3d": tok("56px", "dimension", "css button3d bdr calc(56px / --button3d-x-scale) / 56px (face 60px)"),
    "chat-bubble": tok("16px 16px 16px 4px", "other", "computed tutor message bubble"),
    "tile": tok("5px", "dimension", "computed interactive tile"),
})
core["borderWidth"] = {
    "hairline": tok("0.5px", "dimension", "computed chat bubbles, glass buttons, chat input"),
    "thin": tok("1px", "dimension", "computed header bottom, settings rows, popover email box, strength chip"),
    "default": tok("2px", "dimension", "computed cards, inputs, buttons (transparent), stat pills", "Brilliant's standard border weight"),
    "focus-ring": tok("3px", "dimension", "css shadows.elevation.outline 0 0 0 3px; switch ring 3px"),
}


def parse_shadow(s):
    layers = []
    for part in re.split(r",(?![^(]*\))", s):
        part = part.strip()
        inset = part.startswith("inset")
        nums = re.findall(r"-?[\d.]+(?:px)?", re.sub(r"(#[0-9a-fA-F]+|rgba?\([^)]*\)|var\([^)]*\))", "", part))
        col = re.search(r"(#[0-9a-fA-F]+|rgba?\([^)]*\)|var\([^)]*\))", part)
        nums = [n if n.endswith("px") else n + "px" for n in nums] + ["0px"] * 4
        c = col.group(1) if col else "#000000"
        if c.startswith("var("):
            name = c[4:-1]
            sm = SEMANTIC.fullmatch(name)
            c = ("{shadowColor.%s}" % name[len("--panda-colors-elevation-shadow-"):] if "elevation-shadow" in name
                 else "{%s.%s}" % sm.groups() if sm else REF.get(name, c))
        layers.append({"offsetX": nums[0], "offsetY": nums[1], "blur": nums[2], "spread": nums[3], "color": hexfull(c),
                       "type": "innerShadow" if inset else "dropShadow"})
    return layers


# shadows are theme dependent through their colours, so they live in the theme sets (see below)
core["blur"] = {
    "glass": tok("20px", "dimension", "computed glass-button backdrop-filter blur(20px) saturate(1.8)"),
    "ask-pill": tok("24px", "dimension", "computed home ask-Koji pill focused backdrop-filter blur(24px)"),
    "glass-frost": tok("18.36px", "dimension", "css --glass-frost-blur 18.36px (saturate 1.408)"),
}
core["zIndex"] = {k[len(P + "z-index-"):]: tok(int(v) if v.lstrip("-").isdigit() else v, "number", f"css-var {k}")
                  for k, v in ROOT.items() if k.startswith(P + "z-index-")}
core["duration"] = {
    "instant": tok("100ms", "duration", "css transition .1s (button3d press, nav underline, menu trigger)"),
    "fast": tok("150ms", "duration", "css transition .15s (switch, segmented control, popover, menu, modal, tooltip)"),
    "normal": tok("200ms", "duration", "css transition .2s (progress width, bubble colours, fade-in)"),
    "slow": tok("300ms", "duration", "css transition .3s (lesson panel border, opacity)"),
    "slower": tok("450ms", "duration", "css animation shakeX .45s (wrong answer)"),
    "slowest": tok("500ms", "duration", "css transition .5s, trainer spring"),
    "spring": tok("833ms", "duration", "css --spring-smooth-time .833s (chat panel open, lesson transitions)"),
    "glow": tok("1000ms", "duration", "css animation borderGlow 1s ease-out (correct answer)"),
    "spinner": tok("600ms", "duration", "css animation spin 600ms linear infinite"),
    "skeleton": tok("800ms", "duration", "css animation skeletonPulse .8s linear infinite alternate"),
}
core["easing"] = {
    "standard": tok([0.4, 0, 0.2, 1], "cubicBezier", "css cubic-bezier(.4,0,.2,1) (Panda default)"),
    "ease-out": tok([0, 0, 0.58, 1], "cubicBezier", "css ease-out (button3d, popover, bubbles)"),
    "ease-in-out": tok([0.42, 0, 0.58, 1], "cubicBezier", "css ease-in-out (menus, modals, tooltips)"),
    "spring-smooth": tok([0.2, 1.1, 0.36, 1], "cubicBezier", "css --spring-smooth fallback cubic-bezier(.2,1.1,.36,1)",
                         "Overshooting spring. Browsers with linear() get the linear(...) curve in easing-spring-smooth-linear."),
    "spring-trainer": tok([0.2, 0.8, 0.25, 1], "cubicBezier", "css --trainer-spring-smooth-time fallback"),
    "out-expo": tok([0.16, 1, 0.3, 1], "cubicBezier", "css height/width/transform .3s cubic-bezier(.16,1,.3,1)"),
    "out-quint": tok([0.22, 1, 0.36, 1], "cubicBezier", "css transform .4s cubic-bezier(.22,1,.36,1)"),
    "back-out": tok([0.34, 1.56, 0.64, 1], "cubicBezier", "css transform .4s cubic-bezier(.34,1.56,.64,1)"),
    "decelerate": tok([0, 0, 0.2, 1], "cubicBezier", "css opacity .2s cubic-bezier(0,0,.2,1)"),
}
core["easing-linear"] = {
    "spring-smooth": tok("linear(0, .007, .026, .059 4.5%, .106 6.3%, .209 9.5%, .558 19.3%, .658, .742, .812, .87, .918, .957, .986 41.6%, 1.007 45.3%, 1.021 49.4%, 1.027 54% 60.9%, 1.007 83.2%, 1)",
                         "other", "css --spring-smooth (@supports linear())"),
    "spring-trainer": tok("linear(0, .005, .02 1.7%, .079 3.8%, .478 13.1%, .58, .665 18.6%, .741, .804 24.6%, .855 27.9%, .897 31.5%, .93 35.4%, .955 39.8%, .973 44.9%, .986 50.9%, .993 57.7%, .997 66.5%, 1)",
                          "other", "css --trainer-spring-smooth-time (@supports linear())"),
}
core["opacity"] = {
    "disabled-button3d": tok(0.85, "number", "computed button3d[data-disabled] opacity .85"),
    "hover-flat-button": tok(0.78, "number", "css button hover opacity .78"),
    "hover-premium": tok(0.85, "number", "css iridescent button3d hover opacity .85"),
    "chat-history": tok(0.5, "number", "css older lesson messages opacity .5"),
    "ask-pill-idle": tok(0.65, "number", "computed home ask-Koji pill"),
}


# ---------- themes ----------
SEMANTIC = re.compile(r"--panda-colors-(bg|text|icon|border|status|elevation|special|autoflip)-(.+)")
DESC = {
    "bg-primary": "Page background", "bg-secondary": "Shelves, segmented-control track, settings track", "bg-elevated": "Header, menus, popovers, modals, footer card",
    "bg-tertiary": "Secondary button face, user chat bubble, progress track", "bg-hover": "Menu item highlight, icon-button hover", "bg-disabled": "Disabled button / switch off",
    "bg-inverse-primary": "Primary flat button", "bg-quip": "Tutor chat bubble", "bg-green-primary": "Correct, success, switch on, green button3d",
    "bg-blue-primary": "Blue button3d, bar chart bars", "text-primary": "Default text", "text-secondary": "Secondary text (60%)", "text-tertiary": "Tertiary text (40%)",
    "text-disabled": "Disabled text (20%)", "border-primary": "Default card and input border", "border-secondary": "Separators, locked tiles",
    "border-solid": "Opaque card border (course tiles, home cards)", "border-select": "Selection ring (elevation.outline)", "border-active": "Focused input",
    "special-lesson-feedback-correct": "Correct feedback fill", "special-lesson-feedback-retryable": "Retry feedback fill", "special-overlay-default": "Modal overlay",
}


def theme(env, dark):
    t = {}

    def put(path, token):
        node = t
        for p in path[:-1]:
            node = node.setdefault(p, {})
        node[path[-1]] = token

    for k in ROOT:
        m = SEMANTIC.fullmatch(k)
        if not m:
            continue
        group, rest = m.groups()
        raw = (DARK if dark else ROOT)[k]
        src = f"css-var {k}" + (" ([data-theme=dark])" if dark and k in V["dark"] else "")
        path = ["shadowColor", rest[len("shadow-"):]] if group == "elevation" else [group] + rest.split("-", 1) if group in ("autoflip", "special") else [group, rest]
        put(path, tok(color_value(raw, env), "color", src, DESC.get(f"{group}-{rest}")))
    # gradients (theme dependent ones come from [data-theme=dark])
    for k in ROOT:
        if not k.startswith(P + "gradients-"):
            continue
        raw = (DARK if dark else ROOT)[k]
        name = k[len(P + "gradients-"):]
        put(["gradient", name], tok(resolve(raw, env), "color", f"css-var {k}" + (" ([data-theme=dark])" if dark and k in V["dark"] else ""),
                                    "CSS gradient string (Tokens Studio accepts linear-gradient in colour tokens)"))
    # shadows
    for k in ("base", "md", "outline", "subtle"):
        raw = ROOT[P + "shadows-elevation-" + k]
        put(["shadow", k], tok(parse_shadow(raw), "shadow", f"css-var {P}shadows-elevation-{k}"))
    put(["shadow", "plan-card"], tok(parse_shadow(ROOT[P + "shadows-plan-card-base"]), "shadow", f"css-var {P}shadows-plan-card-base"))
    put(["shadow", "button3d"], tok([{"offsetX": "0px", "offsetY": "4px", "blur": "0px", "spread": "0px", "color": "{shadowColor.cta-default}", "type": "dropShadow"}],
                                    "shadow", "computed button3d-face box-shadow 0 var(--button3d-shadow-y, 4px) 0 0 var(--button3d-shadow-color)",
                                    "Face also translateY(-4px). Colour varies per variant, see component tokens."))
    put(["shadow", "tile3d"], tok([{"offsetX": "0px", "offsetY": "4px", "blur": "0px", "spread": "0px", "color": "{border.solid}", "type": "dropShadow"}],
                                  "shadow", "computed course tile box-shadow 0 4px 0 0 border.solid (translateY -4px)"))
    put(["shadow", "input-focus"], tok([{"offsetX": "0px", "offsetY": "0px", "blur": "0px", "spread": "1px", "color": "{border.active}", "type": "innerShadow"}], "shadow",
                                       "computed form-input:focus inset 0 0 0 1px + 2px border.active"))
    return t


light, dark = theme(ROOT, False), theme(DARK, True)

# ---------- component colour tokens not expressed as semantic variables ----------
def comp(i):
    L = i == 0
    c = lambda v, s, d=None: tok(v, "color", s, d)
    return {"component": {
        "button3d": {
            "primary-face": c("{palette.black}" if L else "{palette.gray.200}", "computed button3d face (dark rgb(229,229,229)); light = bg.inverse.primary", "Default CTA"),
            "primary-text": c("{palette.white}" if L else "{palette.black}", "computed button3d face text"),
            "primary-lip": c("{shadowColor.cta-default}", "css --button3d-shadow-color var(--panda-colors-elevation-shadow-cta-default)"),
            "secondary-face": c("{bg.tertiary}", "computed 'Why?' / 'Get help' face"),
            "secondary-lip": c("{shadowColor.cta-secondary-fill}", "css elevation-shadow-cta-secondary-fill"),
            "green-face": c("{palette.green.500}", "computed 'Continue' after correct"), "green-lip": c("{palette.green.600}", "css button3d-shadow-color green-600"),
            "blue-face": c("{palette.blue.500}", "computed course 'Start'"), "blue-lip": c("{palette.blue.600}", "css button3d-shadow-color blue-600"),
            "yellow-face": c("{palette.yellow.500}", "computed 'Try again'"), "yellow-text": c("{palette.yellow.900}", "computed 'Try again' text"),
            "yellow-lip": c("{palette.yellow.700}", "css button3d-shadow-color yellow-700"),
            "red-lip": c("{palette.red.600}", "css button3d-shadow-color red-600"), "purple-lip": c("{palette.purple.600}", "css button3d-shadow-color purple-600"),
            "orange-lip": c("{palette.orange.600}", "css button3d-shadow-color orange-600"), "teal-lip": c("{palette.teal.600}", "css button3d-shadow-color teal-600"),
            "pink-lip": c("{palette.pink.600}", "css button3d-shadow-color pink-600"), "pear-lip": c("{palette.pear.600}", "css button3d-shadow-color pear-600"),
            "papaya-lip": c("{palette.papaya.600}", "css button3d-shadow-color papaya-600"), "mint-lip": c("{palette.mint.800}", "css button3d-shadow-color mint-800"),
            "disabled-face": c("{bg.disabled}", "computed disabled face"), "disabled-text": c("{text.disabled}", "computed disabled face text"),
            "premium-text": c("{text.iridescent-primary}", "computed iridescent button text #170b29"),
            "premium-inset": c("#14256349", "computed iridescent button inset 0 -4px 0 rgba(20,37,99,.3)"),
        },
        "lesson": {
            "frame-correct": c("{palette.green.700}", "computed panel border data-evaluation=correct rgb(0,155,43)"),
            "frame-retry": c("{palette.yellow.700}", "computed panel border data-evaluation=incorrect-retry rgb(183,137,0)"),
            "glow-correct": c("{palette.green.400}" if L else "#22c55e", "css --border-glow-color green.400 (dark #22C55E)"),
            "bubble-tutor": c("#172326e0", "computed tutor bubble rgba(23,35,38,.88) in both themes (Koji chat renders dark even in light theme)"),
            "bubble-tutor-border": c("#3e6a74", "computed tutor bubble border rgb(62,106,116) in both themes"),
            "bubble-correct": c("{palette.green.800}", "computed tutor-correct bubble rgb(0,124,35) (dark capture; tutor bubbles render dark in both themes)"),
            "bubble-correct-border": c("{palette.green.700}", "computed tutor-correct border"),
            "bubble-retry": c("{palette.yellow.700}", "computed tutor-incorrect bubble rgb(183,137,0)"),
            "tile-face": c("{palette.white}" if L else "{bg.primary}", "computed interactive tile bg (light #fff, dark #141414)"),
            "tile-edge": c("{palette.gray.300}" if L else "{palette.gray.600}", "computed interactive tile border + 0 1px 0 shadow (light #ccc, dark #808080)"),
            "tile-stack": c("{palette.gray.200}" if L else "{palette.gray.700}", "computed stacked-tile lip 0 3px 0 (light #e5e5e5, dark #666)"),
            "tile-well": c("{palette.blackAlpha.100}" if L else "{palette.whiteAlpha.100}", "computed bank slot under each tile rgba(.05)"),
            "tile-slot": c("{palette.gray.50}" if L else "{palette.gray.900}", "computed empty answer slot bg (light #f8f8f8, dark #383838)"),
            "tile-slot-dash": c("{palette.gray.300}" if L else "{palette.gray.700}", "computed empty slot 2px dashed border (light #ccc, dark #666)"),
            "tile-tray": c("#00000006" if L else "{palette.whiteAlpha.200}", "computed bank tray (light rgba(0,0,0,.024), dark rgba(255,255,255,.1))"),
            "figure-frame": c("{border.primary}" if L else "{palette.whiteAlpha.400}", "computed figure frame 2px (light rgba(0,0,0,.1), dark rgba(255,255,255,.3))"),
            "variable-chip": c("{palette.purple.100}" if L else "{palette.purple.900}", "computed variable letter chip bg (light #f5efff, dark rgb(56,29,102))"),
            "variable-chip-border": c("{palette.purple.200}" if L else "{palette.purple.800}", "computed chip border (light #ebe0ff, dark rgb(90,46,163))"),
            "algebra-bar": c("{palette.pink.400}" if L else "{palette.pink.600}", "computed algebra tile bar border (light #ff90e0, dark #e05fbc)"),
            "unit-tile-from": c("{palette.gray.200}" if L else "{palette.gray.700}", "computed unit tile gradient top"),
            "unit-tile-to": c("{palette.gray.300}" if L else "{palette.gray.600}", "computed unit tile gradient bottom"),
            "graph-series-1": c("{palette.blue.500}", "computed SVG series stroke rgb(69,109,255)"),
            "graph-series-2": c("{palette.teal.500}", "computed SVG series stroke rgb(44,176,161)"),
        },
        "switch": {"on": c("{bg.green-primary}", "computed switch[data-checked]"), "off": c("{bg.disabled}", "computed switch[data-unchecked]"),
                   "thumb": c("{palette.white}", "computed switch-thumb")},
        "chart": {"bar": c("{bg.blue-primary}", "computed /you bar chart bars")},
        "skeleton": {"from": c("#f2f2f2" if L else "#4c4c4c", "css @keyframes skeletonPulse / skeletonPulseDark"),
                     "to": c("#e5e5e5" if L else "#808080", "css @keyframes skeletonPulse / skeletonPulseDark")},
    }}


for i, t in enumerate((light, dark)):
    t.update(comp(i))

out = {
    "core": core,
    "light": light,
    "dark": dark,
    "$themes": [
        {"id": "light", "name": "Light", "selectedTokenSets": {"core": "source", "light": "enabled"}},
        {"id": "dark", "name": "Dark", "selectedTokenSets": {"core": "source", "dark": "enabled"}},
    ],
    "$metadata": {"tokenSetOrder": ["core", "light", "dark"]},
}
(HERE / "tokens.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")


def count(n):
    return 1 if isinstance(n, dict) and "$value" in n else sum(count(v) for k, v in n.items() if isinstance(v, dict)) if isinstance(n, dict) else 0


print("tokens:", {k: count(out[k]) for k in ("core", "light", "dark")})
