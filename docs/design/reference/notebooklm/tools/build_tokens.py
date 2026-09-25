#!/usr/bin/env python3
"""Build tokens.json (W3C DTCG, Tokens Studio multi-set layout) from the raw captures.

Sources: raw/nlm-tokens.tsv and raw/mat-sys-colors.tsv (CSS custom properties read with
getComputedStyle on notebook.google.com, 2026-09-25) plus the values in raw/measurements.md.
Every token carries $extensions.source: "css-var <name>", "computed <selector>" or "estimated".
"""
import csv, json, pathlib

HERE = pathlib.Path(__file__).resolve().parent.parent
RAW = HERE / "raw"

def read_tsv(name):
    rows = []
    with open(RAW / name) as f:
        for line in f:
            if line.startswith("#") or line.startswith("name\t") or not line.strip():
                continue
            n, l, d = line.rstrip("\n").split("\t")
            rows.append((n, l, l if d == "=" else d))
    return rows

def hexfull(v):
    v = v.strip()
    if v.startswith("#") and len(v) == 4:
        return "#" + "".join(c * 2 for c in v[1:])
    return v

def tok(value, type_, source, desc=None):
    t = {"$value": value, "$type": type_, "$extensions": {"source": source}}
    if desc:
        t["$description"] = desc
    return t

nlm = {n: (hexfull(l), hexfull(d)) for n, l, d in read_tsv("nlm-tokens.tsv")}
sys_ = {n: (hexfull(l), hexfull(d)) for n, l, d in read_tsv("mat-sys-colors.tsv")}

# ---------- core (theme-independent primitives) ----------
core = {"palette": {"grey": {}, "blue": {}, "green": {}, "red": {}, "brand": {}}}
for n, (l, _) in nlm.items():
    for fam in ("grey", "blue", "green", "red"):
        p = f"nlm-{fam}-"
        if n.startswith(p) and n[len(p):].isdigit():
            core["palette"][fam][n[len(p):]] = tok(l, "color", f"css-var --{n}")
for k in ("black", "white", "green", "blue", "dark-blue"):
    l, _ = nlm[f"nlm-brand-{k}"]
    core["palette"]["brand"][k] = tok(l, "color", f"css-var --nlm-brand-{k}")
core["palette"]["icon"] = {k: tok(nlm[f"nlm-icons-{k}"][0], "color", f"css-var --nlm-icons-{k}")
                           for k in ("blue", "yellow", "red", "pink", "green", "youtube")}
core["palette"]["gradient-stop"] = {
    "green": tok("#3cff52", "color", "computed .highlight (add-sources title gradient)"),
    "periwinkle": tok("#7182ff", "color", "computed .highlight (add-sources title gradient)"),
}

core["fontFamily"] = {
    "display": tok("Google Sans", "fontFamily", "css-var --mat-sys-display-*-font; loaded fonts.gstatic.com/s/googlesans/v62",
                   "Headlines, titles, panel headers. Only weight 400 is loaded."),
    "text": tok("Google Sans Text", "fontFamily", "css-var --mat-sys-body-*-font; loaded 400/500",
                "Body, labels, buttons, table cells. 600/700 are synthesised from the variable font."),
    "code": tok("Google Sans Code", "fontFamily", "@font-face Google Sans Code 400-700; computed code.code"),
    "icon": tok("Google Symbols", "fontFamily", "loaded fonts.gstatic.com/s/googlesymbols/v462 (variable wght 100-700)"),
    "math": tok("KaTeX_Main", "fontFamily", "@font-face KaTeX_* from www.gstatic.com/external_hosted/katex"),
}
core["fontWeight"] = {
    "regular": tok(400, "fontWeight", "css-var --mat-sys-*-weight"),
    "medium": tok(500, "fontWeight", "css-var --mat-sys-label-*-weight"),
    "semibold": tok(600, "fontWeight", "computed chat <b>"),
    "bold": tok(700, "fontWeight", "css-var --mat-sys-label-large-weight-prominent; computed span.highlighted"),
}

def ts(family, size, lh, weight, tracking, src, desc=None):
    return tok({"fontFamily": "{fontFamily.%s}" % family, "fontSize": f"{size}px", "lineHeight": f"{lh}px",
                "fontWeight": weight, "letterSpacing": tracking}, "typography", src, desc)

S = "css-var --mat-sys-"
core["typography"] = {
    "display-large": ts("display", 57, 64, 400, "0px", S + "display-large", "Declared, not seen on any captured screen"),
    "display-medium": ts("display", 45, 52, 400, "0px", S + "display-medium", "Declared, not seen on any captured screen"),
    "display-small": ts("display", 36, 44, 400, "0px", S + "display-small", "Declared, not seen on any captured screen"),
    "headline-large": ts("display", 32, 40, 400, "0px", S + "headline-large"),
    "headline-medium": ts("display", 28, 36, 400, "0px", S + "headline-medium"),
    "headline-small": ts("display", 24, 32, 400, "0px", S + "headline-small", "Page titles ('My notebooks'), grid card titles, dialog h1"),
    "title-large": ts("display", 22, 28, 400, "0px", S + "title-large", "Notebook title (rendered 22/36), source title, note title"),
    "title-medium": ts("text", 16, 24, 500, "0px", S + "title-medium", "Dialog titles (rendered 16/32)"),
    "title-small": ts("text", 14, 20, 500, "0px", S + "title-small", "Artifact titles, section labels"),
    "body-large": ts("text", 16, 24, 400, "0px", S + "body-large", "Chat messages, inputs, citation popover"),
    "body-medium": ts("text", 14, 20, 400, "0px", S + "body-medium", "Table cells, source rows (24 lh), helper text"),
    "body-small": ts("text", 12, 16, 400, "0.096px", S + "body-small", "Tooltips, captions, disclaimer (20 lh)"),
    "label-large": ts("text", 14, 20, 500, "0px", S + "label-large", "Buttons, menu items, chips"),
    "label-medium": ts("text", 12, 16, 500, "0.096px", S + "label-medium", "Studio tile labels, promo text"),
    "label-small": ts("text", 11, 16, 500, "0.096px", S + "label-small", "Citation markers, 'New!' badge"),
    "panel-header": ts("display", 16, 52, 400, "0px", "computed h2.panel-header-content", "Sources / Chat / Studio headers"),
    "code-inline": ts("code", 14, 24, 500, "0px", "computed code.code"),
}

core["radius"] = {
    "none": tok("0px", "dimension", S + "corner-none"),
    "xs": tok("4px", "dimension", S + "corner-extra-small", "Tooltip, text field, select panel"),
    "sm": tok("8px", "dimension", S + "corner-small", "Menus, source rows, promo banner, citation popover, pro badge"),
    "md": tok("12px", "dimension", S + "corner-medium", "Notebook cards, studio tiles"),
    "lg": tok("16px", "dimension", S + "corner-large", "Panels, dialogs, toasts, query box, drop zone, view toggle"),
    "chat-bubble": tok("20px", "dimension", "computed .from-user-message-card-content", "User bubble: 20 20 0 20"),
    "chip": tok("24px", "dimension", "computed mat-button-toggle", "Section toggles and choice chips"),
    "xl": tok("28px", "dimension", S + "corner-extra-large"),
    "button": tok("96px", "dimension", "css-var --mat-button-*-container-shape 6rem", "All pill buttons"),
    "full": tok("9999px", "dimension", S + "corner-full", "Icon buttons, avatars, citation markers"),
}
core["borderWidth"] = {
    "hairline": tok("1px", "dimension", "computed borders (stroke-default, outline-variant)"),
    "focus-field": tok("2px", "dimension", "computed .mdc-text-field--focused outline"),
    "dashed-dropzone": tok("2px", "dimension", "computed drop zone (dashed)"),
    "checkbox": tok("2px", "dimension", "computed .mdc-checkbox__background"),
    "focus-ring": tok("3px", "dimension", "css .mat-focus-indicator::before --mat-focus-indicator-border-width"),
}

def sh(layers, src, desc=None):
    return tok([{"offsetX": f"{x}px", "offsetY": f"{y}px", "blur": f"{b}px", "spread": f"{s}px", "color": c, "type": "dropShadow"}
                for x, y, b, s, c in layers], "shadow", src, desc)
core["shadow"] = {
    "level1": sh([(0, 2, 1, -1, "rgba(0,0,0,0.2)"), (0, 1, 1, 0, "rgba(0,0,0,0.14)"), (0, 1, 3, 0, "rgba(0,0,0,0.12)")], S + "level1"),
    "menu": sh([(0, 3, 1, -2, "rgba(0,0,0,0.2)"), (0, 2, 2, 0, "rgba(0,0,0,0.14)"), (0, 1, 5, 0, "rgba(0,0,0,0.12)")],
               "computed .mat-mdc-menu-panel / .mat-mdc-select-panel", "Menus and select panels"),
    "level2": sh([(0, 3, 3, -2, "rgba(0,0,0,0.2)"), (0, 3, 4, 0, "rgba(0,0,0,0.14)"), (0, 1, 8, 0, "rgba(0,0,0,0.12)")], S + "level2"),
    "level3": sh([(0, 3, 5, -1, "rgba(0,0,0,0.2)"), (0, 6, 10, 0, "rgba(0,0,0,0.14)"), (0, 1, 18, 0, "rgba(0,0,0,0.12)")], S + "level3", "Toast"),
    "level4": sh([(0, 5, 5, -3, "rgba(0,0,0,0.2)"), (0, 8, 10, 1, "rgba(0,0,0,0.14)"), (0, 3, 14, 2, "rgba(0,0,0,0.12)")], S + "level4"),
    "level5": sh([(0, 7, 8, -4, "rgba(0,0,0,0.2)"), (0, 12, 17, 2, "rgba(0,0,0,0.14)"), (0, 5, 22, 4, "rgba(0,0,0,0.12)")], S + "level5"),
    "popover": sh([(0, 1, 2, 0, "rgba(60,64,67,0.3)"), (0, 1, 3, 1, "rgba(60,64,67,0.15)")], "computed citation popover", "Citation popover"),
}
core["blur"] = {
    "panel-glass": tok("14px", "dimension", "css backdrop-filter: blur(0.875rem)"),
    "glow": tok("81.1px", "dimension", "css filter: blur(81.1003px) (add-sources header glow)"),
}
core["spacing"] = {str(v): tok(f"{v}px", "dimension", "computed paddings/gaps across components") for v in (2, 4, 6, 8, 12, 16, 20, 24, 32, 48)}
core["size"] = {
    "header-height": tok("64px", "dimension", "computed page-header / notebook-header"),
    "header-height-mobile": tok("96px", "dimension", "computed notebook-header at 406px"),
    "panel-gutter": tok("16px", "dimension", "computed section x positions"),
    "panel-header-height": tok("48px", "dimension", "computed .panel-header"),
    "panel-side-width": tok("289.8px", "dimension", "computed section.source-panel / studio-panel at 1200px viewport"),
    "panel-studio-expanded": tok("450px", "dimension", "computed studio-panel with artifact open"),
    "table-header-row": tok("56px", "dimension", "computed th.mat-mdc-header-cell"),
    "table-row": tok("52px", "dimension", "computed tr.mat-mdc-row"),
    "menu-item": tok("48px", "dimension", "computed .mat-mdc-menu-item"),
    "list-option": tok("48px", "dimension", "computed mat-list-option"),
    "source-row": tok("32px", "dimension", "computed .single-source-container (CSS says 3rem/3.25rem; rendered 32)"),
    "artifact-row": tok("64px", "dimension", "computed .artifact-item-button"),
    "studio-tile": tok("56px", "dimension", "computed .create-artifact-button-container"),
    "button": tok("40px", "dimension", "css-var --mat-button-*-container-height 2.5rem"),
    "button-small": tok("32px", "dimension", "computed .button-small, header buttons"),
    "icon-button": tok("40px", "dimension", "computed mat-icon-button (dialog close, search)"),
    "icon-button-small": tok("32px", "dimension", "computed row/card action buttons"),
    "text-field": tok("56px", "dimension", "computed .mat-mdc-text-field-wrapper"),
    "notebook-card-width": tok("320px", "dimension", "computed mat-card.project-button-card (max 20rem)"),
    "notebook-card-height": tok("224px", "dimension", "computed (14rem)"),
    "chat-max-width": tok("700px", "dimension", "css .to-user-message-card-content max-inline-size"),
    "content-max-width": tok("1068px", "dimension", "computed project-table at 1200px viewport (page padding 60)"),
    "icon-xs": tok("16px", "dimension", "computed studio tile icon"),
    "icon-sm": tok("18px", "dimension", "computed button leading icon"),
    "icon-md": tok("20px", "dimension", "computed card more icon"),
    "icon-lg": tok("24px", "dimension", "computed menu/header icons"),
    "citation": tok("22px", "dimension", "css .citation-marker 1.375rem"),
    "checkbox": tok("18px", "dimension", "computed .mdc-checkbox__background"),
    "avatar": tok("32px", "dimension", "computed avatar img"),
}
core["breakpoint"] = {
    "mobile-max": tok("599.98px", "dimension", "@media (max-width: 599.98px), 28 rules"),
    "tablet-max": tok("959.98px", "dimension", "@media (min-width: 600px) and (max-width: 959.98px)"),
    "desktop-min": tok("1024px", "dimension", "@media (min-width: 1024px)"),
    "wide": tok("1280px", "dimension", "@media (max-width: 1280px)"),
    "xs-max": tok("359.98px", "dimension", "@media (max-width: 359.98px)"),
}
core["duration"] = {k: tok(v, "duration", "css transitions/animations") for k, v in {
    "instant": "45ms", "fast": "90ms", "short": "150ms", "short2": "200ms", "medium": "250ms", "medium2": "280ms",
    "medium3": "300ms", "long": "400ms", "long2": "500ms", "spinner": "1333ms", "shimmer": "1400ms"}.items()}
core["easing"] = {
    "standard": tok([0.4, 0, 0.2, 1], "cubicBezier", "css (34 uses)"),
    "decelerate": tok([0, 0, 0.2, 1], "cubicBezier", "css (checkbox on, dialog enter)"),
    "accelerate-sharp": tok([0.4, 0, 0.6, 1], "cubicBezier", "css (checkbox off)"),
    "emphasized-decelerate": tok([0.05, 0.7, 0.1, 1], "cubicBezier", "css"),
    "backdrop": tok([0.25, 0.8, 0.25, 1], "cubicBezier", "computed .cdk-overlay-backdrop"),
    "search-expand": tok([0.2, 0, 0, 1], "cubicBezier", "css .notebook-search-input-lumi"),
}
core["opacity"] = {
    "hover": tok(0.08, "number", S + "hover-state-layer-opacity"),
    "focus": tok(0.12, "number", S + "focus-state-layer-opacity"),
    "pressed": tok(0.12, "number", S + "pressed-state-layer-opacity"),
    "dragged": tok(0.16, "number", S + "dragged-state-layer-opacity"),
    "disabled-container": tok(0.12, "number", "computed disabled button bg rgba(31,31,31,.12)"),
    "disabled-content": tok(0.38, "number", "computed disabled select text rgba(31,31,31,.38)"),
}

# ---------- themes ----------
def theme(i):
    t = {}
    def c(path, value, src, desc=None):
        node = t
        for p in path[:-1]:
            node = node.setdefault(p, {})
        node[path[-1]] = tok(value, "color", src, desc)
    N = lambda n: (nlm[n][i], f"css-var --{n}")
    M = lambda n: (sys_[n][i], f"css-var --mat-sys-{n}")
    # backgrounds
    c(["bg", "page"], *N("nlm-fills-surface-page"), "Notebook workspace background")
    c(["bg", "page-grey"], *N("nlm-fills-surface-page-grey"))
    c(["bg", "landing"], *N("nlm-fills-surface-landing"), "Home page background and header")
    c(["bg", "scrim"], *N("nlm-fills-scrim"), "Dialog backdrop (computed .32 in both themes)")
    # surfaces
    c(["surface", "panel"], *N("nlm-fills-surface-panel"), "Sources/Chat/Studio panels, menus")
    c(["surface", "card"], *N("nlm-fills-surface-card"))
    c(["surface", "panel-70"], *N("nlm-fills-surface-panel-transparent-70"))
    c(["surface", "panel-80"], *N("nlm-fills-surface-panel-transparent-80"))
    c(["surface", "dialog"], *(("#ffffff", "computed .mat-mdc-dialog-surface (light)") if i == 0 else ("#131314", "computed .mat-mdc-dialog-surface (dark) = --mat-sys-surface")),
      "Dialogs and citation popover. Dark uses the M3 surface, darker than panels.")
    c(["surface", "tint-blue"], *N("nlm-fills-ui-blue-fill"))
    c(["surface", "subtle"], *N("nlm-fills-ui-light-grey-fill"), "Discovery box, drop zone, citation marker, quiz option")
    c(["surface", "muted"], *N("nlm-fills-ui-grey-fill"), "Inline code (light #f2f2f2), skeleton base")
    c(["surface", "selected"], *N("nlm-brand-light-blue"), "Selected toggle, user bubble (light), source hover, create icon circle")
    c(["surface", "caution"], *N("nlm-fills-ui-caution-subtle"))
    c(["surface", "select-panel"], *M("surface-container"))
    c(["surface", "inverse"], *M("inverse-surface"), "Tooltip")
    c(["surface", "toast"], *N("mat-snack-bar-container-color"))
    c(["surface", "flashcard-front"], "#303030" if i == 0 else "#2a2a2a", "estimated from screenshot (iframe)")
    # borders
    c(["border", "default"], *N("nlm-stroke-default"), "Outlined buttons, dividers, panel header rule, field outline")
    c(["border", "strong"], *N("nlm-stroke-focus"), "Chat query box border")
    c(["border", "outline-variant"], *M("outline-variant"), "Table rows, view toggle, sort button (light)")
    c(["border", "outline"], *M("outline"))
    c(["border", "focus-ring"], *N("mat-focus-indicator-border-color"), "Keyboard focus ring (3px)")
    c(["border", "field-focus"], *M("primary"), "Focused text field outline (2px)")
    # text
    c(["text", "title"], *N("nlm-text-titles-and-labels"))
    c(["text", "body"], *N("nlm-text-body-text"))
    c(["text", "secondary"], *N("nlm-text-secondary-text"))
    c(["text", "ghost"], *N("nlm-text-ghost-text"), "Placeholders, hints")
    c(["text", "on-surface"], *M("on-surface"), "Table cells, inputs")
    c(["text", "on-surface-variant"], *M("on-surface-variant"), "Menu icons, field labels")
    c(["text", "warning"], *N("nlm-text-warning"))
    c(["text", "link"], *N("nlm-ctas-text-and-icon"), "Links, 'View source', create-card icon")
    c(["text", "on-accent"], *N("nlm-cta-text-and-icon-primary"))
    c(["text", "on-inverse"], *M("inverse-on-surface"))
    c(["text", "meta"], "#535559" if i == 0 else "#ababab", "css .project-button-subtitle (light); dark estimated = text.secondary")
    # accent
    c(["accent", "primary"], *N("nlm-ctas-buttons-primary"), "Filled buttons, selected chips, primary CTA. Same in both themes.")
    c(["accent", "on-primary"], *N("mat-button-filled-label-text-color"))
    c(["accent", "secondary"], *N("nlm-ctas-buttons-secondary"), "Tonal 'Create new', 'Add note', 'New!' badge")
    c(["accent", "on-secondary"], *N("nlm-text-cta-text-secondary"))
    c(["accent", "m3-primary"], *M("primary"), "Material primary: checkbox, text-field focus, progress bar, mobile tab indicator, Cancel-search link")
    c(["accent", "m3-on-primary"], *M("on-primary"))
    c(["accent", "pill"], *N("nlm-ctas-buttons-pill"))
    # states
    c(["state", "hover-on-surface"], *N("nlm-states-on-primary-hover"))
    c(["state", "focus-on-surface"], *N("nlm-states-on-primary-focus"))
    c(["state", "hover-on-accent"], *N("nlm-states-on-secondary-hover"))
    c(["state", "hover-tertiary"], *N("nlm-states-on-tertiary-hover"))
    c(["state", "menu-hover"], *N("mat-menu-item-hover-state-layer-color"))
    c(["state", "drag-over"], *N("nlm-states-drag-over"))
    c(["state", "tile-edit-hover"], *N("nlm-states-tile-edit-button-hover"))
    c(["state", "disabled-container"], "rgba(31,31,31,0.12)" if i == 0 else "rgba(227,227,227,0.12)", "computed (light); dark estimated by M3 rule on-surface @12%")
    c(["state", "disabled-content"], *N("mat-button-disabled-label-text-color"))
    # status
    for s in ("error", "success", "warning", "info"):
        c(["status", s], *M(s)); c(["status", s + "-container"], *M(s + "-container")); c(["status", "on-" + s + "-container"], *M("on-" + s + "-container"))
    # tiles / data-vis
    for col in ("blue", "green", "yellow", "orange", "pink", "cyan", "grey"):
        c(["tile", col, "bg"], *N(f"nlm-tiles-{col}"))
        c(["tile", col, "fg"], *N(f"nlm-tiles-on-{col}"))
        c(["tile", col, "hover"], *N(f"nlm-tiles-on-{col}-hover"))
    for col in ("purple", "green", "yellow", "orange", "pink", "blue"):
        c(["pastel", col], *N(f"nlm-pastel-{col}"))
    for col in ("blue", "red", "yellow", "green", "orange", "pink", "purple", "cyan", "grey"):
        c(["dataviz", col], *M(col)); c(["dataviz", col + "-container"], *M(col + "-container"))
    mm = "estimated from screenshot (iframe)" if i == 0 else "estimated: not captured in dark; light sample repeated"
    c(["dataviz", "mindmap-root"], "#c3cafc", mm, "≈ palette.blue.90")
    c(["dataviz", "mindmap-node"], "#c2d3eb", mm)
    c(["dataviz", "mindmap-edge"], "#7c8bf3", mm, "≈ palette.blue.70")
    c(["skeleton", "base"], *N("nlm-skeleton-shimmer-base"))
    c(["skeleton", "highlight"], *N("nlm-skeleton-shimmer-highlight"))
    c(["skeleton", "loading-highlight"], *N("nlm-loading-shimmer-highlight"))
    c(["icon", "default"], *N("nlm-icons-default"))
    return t

light, dark = theme(0), theme(1)
gradients = {
    "gradient": {
        "promo": tok("linear-gradient(267.52deg, rgba(60,255,82,0.15) -0.57%, rgba(113,130,255,0.15) 89.06%)", "gradient", "computed studio promo banner"),
        "live-badge": tok(nlm["nlm-gradients-live-updates-badge"][0], "gradient", "css-var --nlm-gradients-live-updates-badge"),
        "headline-text": tok("linear-gradient(270deg, #3cff52, #7182ff)", "gradient", "computed .highlight (background-clip:text)"),
        "cover-scrim": tok("linear-gradient(to bottom, transparent 20.06%, rgba(0,0,0,0.6) 68.33%)", "gradient", "css .cover-image-card"),
    }
}
light.update(gradients); dark.update(json.loads(json.dumps(gradients)))

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
