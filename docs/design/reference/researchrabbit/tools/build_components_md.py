#!/usr/bin/env python3
"""Build components.md for the ResearchRabbit design reference.

Reads raw/components-computed.json (every component and state, measured by
tools/capture/measure.mjs), raw/css-vars.json (the :root custom properties and the per-component CSS
rules), components/crops/, screenshots/ and icons/INDEX.tsv, and writes components.md next to them.
Every value is a cell of the measurement file, condensed: a colour is hex followed by the :root custom
property with the same value, a state row shows only what differs from the row it belongs to, and a
state with the same values as its base is named in the base row's label.

Deterministic: re-running it on the same inputs reproduces components.md byte for byte.
Run from anywhere: python3 tools/build_components_md.py
"""
import csv
import json
import os
import re
from collections import Counter, OrderedDict, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
J = json.load(open("raw/components-computed.json"))
C = J["components"]
PG = J["pages"]
V = json.load(open("raw/css-vars.json"))

# --------------------------------------------------------------------------- colours and tokens


def norm_hex(h):
    h = h.lower()
    if len(h) == 4:
        h = "#" + "".join(c * 2 for c in h[1:])
    return h


ROOTV = V["root"]
BY_COLOR = {}
for name, val in ROOTV.items():
    m = re.fullmatch(r"var\((--[\w-]+)\)", val.strip())
    if m:
        val = ROOTV.get(m.group(1), val)
    if re.fullmatch(r"#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}", val.strip()) and not name.endswith("-dark"):
        BY_COLOR.setdefault(norm_hex(val.strip()), []).append(name)
for k in BY_COLOR:
    BY_COLOR[k].sort(key=lambda n: (len(n), n))


def to_hex(r, g, b):
    return "#%02x%02x%02x" % (int(round(float(r))), int(round(float(g))), int(round(float(b))))


def colour(c, tokens=True):
    """rgb()/rgba() inside any string -> '#hex `--token`' or 'rgba(...)'."""
    def one(m):
        r, g, b = m.group(1), m.group(2), m.group(3)
        a = m.group(4)
        if a is not None and float(a) == 0:
            return "transparent"
        if a is not None and float(a) != 1:
            return "rgba(%d, %d, %d, %g)" % (round(float(r)), round(float(g)), round(float(b)), round(float(a), 3))
        h = to_hex(r, g, b)
        tok = BY_COLOR.get(h) if tokens else None
        return f"{h} `{tok[0]}`" if tok else h
    return re.sub(r"rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)", one, c)


def num(x):
    return re.sub(r"(\d+\.\d\d)\d+", r"\1", str(x))


def px(v):
    return num(str(v).replace("px", ""))


def sides(t, r, b, l):
    if t == r == b == l:
        return t
    if t == b and r == l:
        return f"{t} {r}"
    return f"{t} {r} {b} {l}"


def fam(f):
    return f.split(",")[0].replace('"', "")


def font(fz, lh, fw, f, style="normal"):
    lh = "normal" if lh == "normal" else px(lh)
    return f"{fam(f)} {px(fz)}/{lh} {fw}" + (" italic" if style == "italic" else "")


def shadow_layers(s):
    """Both 'rgba(..) 0px 2px 3px 0px, ...' and '0px 2px 3px #a9b3c64d,...' -> comparable tuples."""
    out = []
    parts = re.split(r",(?![^(]*\))", s)
    for p in parts:
        p = p.strip()
        if not p or p == "none":
            continue
        col = re.search(r"rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}", p)
        c = col.group(0) if col else "rgb(0,0,0)"
        rest = p.replace(c, "")
        nums = [float(x) for x in re.findall(r"-?[\d.]+(?=px)", rest)]
        nums = (nums + [0, 0, 0, 0])[:4]
        if c.startswith("#"):
            h = c[1:]
            if len(h) in (3, 4):
                h = "".join(ch * 2 for ch in h)
            r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
            a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        else:
            m = re.findall(r"[\d.]+", c)
            r, g, b = (float(x) for x in m[:3])
            a = float(m[3]) if len(m) > 3 else 1.0
        out.append((tuple(nums), round(r), round(g), round(b), round(a, 2)))
    return out


SHADOW_TOK = {}
for name, val in ROOTV.items():
    if name.startswith("--shadow-") and not name.endswith("-dark"):
        SHADOW_TOK[tuple(map(lambda t: (tuple(t[0][:3]),) + t[1:], shadow_layers(val)))] = name


def shadow_token(s):
    key = tuple((tuple(t[0][:3]),) + t[1:] for t in shadow_layers(s))
    # the computed form has the spread as a 4th number; the root vars have none
    key2 = tuple((tuple(t[0][:3]),) + (t[1], t[2], t[3], t[4]) for t in shadow_layers(s))
    return SHADOW_TOK.get(key) or SHADOW_TOK.get(key2)


def shadow_text(s):
    if not s or s == "none":
        return None
    tok = shadow_token(s)
    layers = []
    for p in re.split(r",(?![^(]*\))", s):
        p = p.strip()
        col = re.search(r"rgba?\([^)]*\)", p)
        c = colour(col.group(0), tokens=False) if col else ""
        rest = (p.replace(col.group(0), "") if col else p).strip()
        layers.append(f"{c} {rest}".strip())
    return ", ".join(layers) + (f" (`{tok}`)" if tok else "")


# --------------------------------------------------------------------------- properties of one state


def props(v):
    s = v["style"]
    o = OrderedDict()
    o["size"] = f"{px(v['rect']['w'])} x {px(v['rect']['h'])}"
    pad = sides(s["paddingTop"], s["paddingRight"], s["paddingBottom"], s["paddingLeft"])
    if pad != "0px":
        o["padding"] = pad
    if s["display"] in ("flex", "inline-flex", "grid") and s["gap"] not in ("normal", "0px"):
        o["gap"] = s["gap"]
    bds = []
    for d in ("Top", "Right", "Bottom", "Left"):
        if float(s[f"border{d}Width"].replace("px", "")) > 0 and s[f"border{d}Style"] != "none":
            bds.append(f"{s[f'border{d}Width']} {s[f'border{d}Style']} {colour(s[f'border{d}Color'])}")
        else:
            bds.append("none")
    if any(b != "none" for b in bds):
        o["border"] = bds[0] if len(set(bds)) == 1 else "; ".join(f"{'TRBL'[i]}: {b}" for i, b in enumerate(bds) if b != "none")
    rad = sides(s["borderTopLeftRadius"], s["borderTopRightRadius"], s["borderBottomRightRadius"], s["borderBottomLeftRadius"])
    if rad != "0px":
        o["radius"] = rad
    o["background"] = colour(s["backgroundColor"])
    if s["backgroundImage"] != "none":
        img = re.sub(r'url\("data:[^)]*\)', "an image (data URI)", s["backgroundImage"])
        o["image"] = colour(img)[:200]
    if s["boxShadow"] != "none":
        o["shadow"] = shadow_text(s["boxShadow"])
    if s["outlineStyle"] != "none" and float(s["outlineWidth"].replace("px", "")) > 0:
        o["outline"] = f"{s['outlineWidth']} {s['outlineStyle']} {colour(s['outlineColor'])}, offset {s['outlineOffset']}"
    t = v.get("textStyle")
    if t:
        o["text"] = f"{font(t['fontSize'], t['lineHeight'], t['fontWeight'], t['fontFamily'], t.get('fontStyle', 'normal'))}, {colour(t['color'])}"
        if t.get("textDecorationLine") not in (None, "none"):
            o["text"] += f", {t['textDecorationLine']}"
    else:
        o["text"] = f"{font(s['fontSize'], s['lineHeight'], s['fontWeight'], s['fontFamily'], s.get('fontStyle', 'normal'))}, {colour(s['color'])}"
        if s["textDecorationLine"] != "none":
            o["text"] += f", {s['textDecorationLine']}"
    if s["opacity"] != "1":
        o["opacity"] = s["opacity"]
    if s["transform"] not in ("none", "matrix(1, 0, 0, 1, 0, 0)"):
        o["transform"] = s["transform"]
    if s["cursor"] not in ("auto", "default"):
        o["cursor"] = s["cursor"]
    if s["transitionDuration"] not in ("0s", ""):
        pr = [x.strip() for x in s["transitionProperty"].split(",")]
        du = [x.strip() for x in s["transitionDuration"].split(",")]
        tf = re.findall(r"cubic-bezier\([^)]*\)|steps\([^)]*\)|[a-z-]+", s["transitionTimingFunction"])
        parts = [f"{p} {du[i % len(du)]} {tf[i % len(tf)] if tf else ''}".strip() for i, p in enumerate(pr) if du[i % len(du)] != "0s"]
        if parts:
            o["transition"] = ", ".join(parts)
    if v.get("icon") and 0 < v["icon"]["w"] < 120:
        ic = v["icon"]
        o["icon"] = f"{px(ic['w'])} x {px(ic['h'])}, {colour(ic['stroke'] if ic['fill'] == 'none' and ic['stroke'] != 'none' else ic['color'])}"
    if v.get("placeholder"):
        o["placeholder"] = colour(v["placeholder"]["color"])
    return o


ORDER = ["size", "padding", "gap", "border", "radius", "background", "image", "shadow", "outline", "text", "opacity", "transform", "cursor", "transition", "icon", "placeholder"]


def fmt(d):
    return "; ".join(f"{k} {d[k]}" for k in ORDER if k in d).replace("|", "/")


def diff(p, base):
    d = {k: p[k] for k in ORDER if k in p and p.get(k) != base.get(k)}
    for k in ORDER:
        if k in base and k not in p:
            d[k] = "none"
    return d


def groups_of_states(c):
    """[(base_label, base_value, [(variant_label, value)])] from the states in file order.

    A base state is read at rest; a hover or focus-visible state belongs to the base it was read
    with (same label with the suffix removed)."""
    bases = OrderedDict()
    variants = []
    for lab, v in c["states"].items():
        if "style" not in v:
            continue
        via = v.get("via", "")
        if via == "mouse hover":
            variants.append((lab[: -len("hover")].rstrip("-") or "default", "hover", v))
        elif via.startswith("keyboard"):
            variants.append((lab[: -len("focus-visible")].rstrip("-") or "default", "focus-visible", v))
        else:
            bases[lab] = v
    out = []
    for lab, v in bases.items():
        out.append((lab, v, [(kind, vv) for b, kind, vv in variants if b == lab or (b == "default" and lab == "default")]))
    return out


# --------------------------------------------------------------------------- parts (the `extra` blobs)


def part(name, b, origin=None):
    r = b["rect"]
    bits = [f"{px(r['w'])} x {px(r['h'])}"]
    if origin is not None:
        bits.append(f"at {px(round(r['x'] - origin[0], 1))}, {px(round(r['y'] - origin[1], 1))}")
    f = b.get("font", "")
    m = re.match(r"(\d+) ([\d.]+)px/([\d.a-z]+) (.*)", f)
    if m and b.get("text") is not None or (m and b.get("tag") in ("p", "h1", "h2", "h3", "h4", "h5", "span", "label", "a", "button", "input")):
        lh = "normal" if m.group(3) == "normal" else px(m.group(3))
        bits.append(f"{m.group(4)} {px(m.group(2))}/{lh} {m.group(1)}{' italic' if b.get('fontStyle') == 'italic' else ''}, {colour(b['color'])}")
    for k, lab in (("bg", "background"), ("radius", "radius"), ("padding", "padding"), ("margin", "margin"), ("gap", "gap"), ("border", "border"), ("boxShadow", "shadow")):
        if b.get(k) and b[k] not in ("0px", "normal"):
            val = colour(b[k]) if k in ("bg", "border") else (shadow_text(b[k]) if k == "boxShadow" else b[k])
            bits.append(f"{lab} {val}")
    if b.get("bgImage"):
        bits.append("image " + colour(b["bgImage"])[:110])
    if b.get("opacity"):
        bits.append(f"opacity {b['opacity']}")
    if b.get("text"):
        bits.append(f"text \"{b['text'][:30]}\"")
    return f"{name}: " + "; ".join(bits).replace("|", "/")


def kids_lines(name, v):
    cont = v["container"]
    origin = (cont["rect"]["x"], cont["rect"]["y"])
    out = [f"{name}: {part('container', cont).split(': ', 1)[1]}"]
    for ch in v["children"][:10]:
        nm = (ch.get("text") or ch.get("label") or ch["tag"])[:24]
        out.append("  child " + part(nm, ch, origin))
    return out


def parts_lines(extra):
    out = []
    if not extra:
        return out
    if "children" in extra and "container" in extra:
        return kids_lines("container", extra)
    for k, v in extra.items():
        if isinstance(v, dict) and "rect" in v:
            out.append(part(k, v))
        elif isinstance(v, dict) and "children" in v:
            out.extend(kids_lines(k, v))
        elif isinstance(v, list):
            for i, it in enumerate(v):
                if isinstance(it, dict) and "rect" in it:
                    out.append(part(f"{k} {i + 1}", it))
    return out


# --------------------------------------------------------------------------- text blocks

PAGE_NAME = {
    "sp": "search split view", "sp-hover-input": "search split view (hovering a search input node)",
    "sp-hover-result": "search split view (hovering a result node)", "sp-hover-list-card": "search split view (hovering a list card)",
    "sp-hover-legend-inputs": "search split view (hovering the Search inputs legend chip)", "sp-hover-legend-results": "search split view (hovering the Results legend chip)",
    "sp-inspect": "search split view (a node inspected)", "sm": "search map view", "sm-zoom": "search map view (zoomed in)",
    "sm-inspect": "search map view (a node inspected)", "sm-x": "search map view (layout settings, X Axis)", "sm-y": "search map view (layout settings, Y Axis)",
    "sm-size": "search map view (layout settings, Size)", "sm-adv": "search map view (layout settings, Advanced)", "sm-filter": "search map view (filter popover open)",
    "sl": "search list view", "lm": "library map view", "lm-hover": "library map view (hover)", "lm-moved": "library map view (positions moved)",
    "lm-reset": "library map view (reset menu open)", "ll": "library list view", "home": "home page",
}

GROUP_INTRO = {
    "Shell and navigation": "The frame shared by every signed-in page: a pastel gradient ground, a 64px top bar that paints nothing, a half-white main card with a solid white header strip, and a 390px right panel. Search pages add a translucent grey session bar under the top bar.",
    "Search header": "The row at the top of the main card: the \"Similar articles to 9 Articles\" summary capsule at the left, then the filter button and the three-way view toggle at the right.",
    "Graph": "The graph area. Everything drawn on the canvas (nodes, edges, labels, the hover title box) is a bitmap in the snapshots; this group measures the DOM around it: the legend, the axis captions, the toolbar, the Positions moved pill and the legend tooltip. The canvas crops are the only record of node drawing, so read node colours and sizes from graph.md and raw/graph-code-notes.md.",
    "Article list": "The 400px column of result cards in the split view, and the same cards at full width in the list view and in the library.",
    "Next Search panel": "The right panel when nothing is selected: a header, a dismissible tip, an empty state, and the black Search Settings drawer.",
    "Article detail panel": "The right panel when an article is selected, from the graph or from the list. It reuses the black drawer as \"Dive deeper on this article\".",
    "Layout settings": "The right panel the graph toolbar opens: four tabs for how the map is laid out (X Axis, Y Axis, Size, Advanced).",
    "Library": "The Library page: a sidebar of lists and collections, a collection header, a selection bar, and the same list, split and map views as search.",
    "Home": "The home page: a hero with a search field, then three white cards (recent articles, collections, getting started).",
}

SHOTS = [
    ("search-split", "Search, split view. The list of result cards beside the graph, Next Search at the right. Default, a search input node hovered, a result node hovered, a list card hovered (it stays tinted), the two legend chips hovered, and a node inspected.", "/search/<id>/0"),
    ("search-map", "Search, map view. The graph fills the main card. Default, zoomed in, a node inspected, the four layout settings tabs, and the filter popover.", "/search/<id>/0"),
    ("search-list", "Search, list view. The result cards at full width.", "/search/<id>/0"),
    ("library-map", "Library, map view of one collection. Default, hovering, after a node was dragged (Positions moved), and the Reset menu open.", "/library/<id>"),
    ("library-list", "Library, list view of one collection, with the sidebar and the collection header.", "/library/<id>"),
    ("home", "Home. Hero with the search field, recent articles, collections and guides.", "/"),
]

OVER = [
    ("Legend tooltip", "search split view", "pointer over a legend chip when the snapshot was taken", "[search-split-light-hover-legend-inputs](screenshots/search-split-light-hover-legend-inputs.png), [search-split-light-hover-legend-results](screenshots/search-split-light-hover-legend-results.png), [graph-tooltip](#legend-tooltip)"),
    ("Node hover title", "search split view", "pointer over a node; the white title box is drawn on the canvas, so it is only in the crop", "[search-split-light-hover-result](screenshots/search-split-light-hover-result.png), [search-split-light-hover-input](screenshots/search-split-light-hover-input.png)"),
    ("Tinted list card", "search split view", "pointer over a card when the snapshot was taken; its node is highlighted in the graph", "[search-split-light-hover-list-card](screenshots/search-split-light-hover-list-card.png), [result card](#result-card)"),
    ("Article detail panel", "search split and map views", "a node clicked", "[search-split-light-inspect-node](screenshots/search-split-light-inspect-node.png), [search-map-light-inspect-node](screenshots/search-map-light-inspect-node.png), [article detail panel](#article-detail-panel)"),
    ("Layout settings, four tabs", "search map view", "the settings button in the graph toolbar, then each tab", "[x-axis](screenshots/search-map-light-settings-x-axis.png), [y-axis](screenshots/search-map-light-settings-y-axis.png), [size](screenshots/search-map-light-settings-size.png), [advanced](screenshots/search-map-light-settings-advanced.png), [layout settings panel](#layout-settings-panel)"),
    ("Filter popover", "search map view", "the filter button", "[search-map-light-filter-popover](screenshots/search-map-light-filter-popover.png), [filter popover](#filter-popover)"),
    ("Positions moved and Reset menu", "library map view", "a node dragged, then the pill pressed", "[library-map-light-positions-moved](screenshots/library-map-light-positions-moved.png), [library-map-light-positions-reset-menu](screenshots/library-map-light-positions-reset-menu.png), [positions moved pill](#positions-moved-pill)"),
    ("Zoomed graph", "search map view", "scroll or zoom button; the canvas is redrawn at a larger scale", "[search-map-light-zoomed-in](screenshots/search-map-light-zoomed-in.png)"),
]

SHAPES = ["main-card", "side-panel", "list-card", "search-summary", "view-toggle", "filter-popover", "graph-tooltip", "tip-banner", "drawer", "inspector", "layout-option", "layout-select", "positions-moved", "reset-menu", "library-sidebar", "collection-header", "home-section", "home-guide-card"]

L = []


def W(s=""):
    L.append(s)


def slug(title):
    return re.sub(r"[^a-z0-9 -]", "", title.lower()).replace(" ", "-")


shots = sorted(p.name for p in Path("screenshots").glob("*.png"))


def links(prefix):
    out = []
    for f in shots:
        m = re.fullmatch(re.escape(prefix) + r"-light-(.+)\.png", f)
        if m:
            out.append(f"[{m.group(1)}](screenshots/{f})")
    return ", ".join(out)


crop_files = sorted(p.name for p in Path("components/crops").glob("*.png"))
n_states = sum(len(c["states"]) for c in C.values())
icons = [r for r in csv.reader(open("icons/INDEX.tsv"), delimiter="\t")][1:]

# ------------------------------------------------ head
W("# ResearchRabbit components")
W()
W(f"The discovery list of every page and view captured, then one entry per component with crops of the real product, the icon index and the Gaps. Read on {J['_meta']['read']} from static, redacted snapshots of signed-in pages on app.researchrabbit.ai, rendered in headless Chromium at 1440 x 900 (2x), with computed styles read from the rendered page. The workspace name in the snapshots is redacted to \"My workspace\". Nothing was created, sent or changed.")
W()
W(f"The machine-readable copy is [raw/components-computed.json](raw/components-computed.json) ({len(C)} components, {n_states} states). Custom properties and per-component CSS rules are in [raw/css-vars.json](raw/css-vars.json); how the graph engine draws is in [raw/graph-code-notes.md](raw/graph-code-notes.md).")
W()
W("How to read an entry:")
W()
W("- A component is found by its styled-components display name (`GraphControls__StyledButton`), so `generateVariantComponent__default`, which many unrelated buttons share, is found by text or position instead. The entry's heading is the product's name for the part, and the key in backticks is the key in the JSON.")
W("- A colour is its value followed by the :root custom property with the same value (`--grey-primary`), when there is one. Text is written family size/line-height weight, then its colour, for example `Plus Jakarta Sans 14/21 400, #000000 `--primary``, and is read from the first text node inside the component.")
W("- The state table has one row per element or snapshot state read at rest. A hover or focus-visible row lists only what changes from the row above it; a state with the same values is named in the row's label, for example \"default (same: hover)\". Hover is a real mouse hover and focus-visible a real keyboard focus; where a snapshot state could not be reached it says so.")
W("- \"Parts\" lists the pieces inside the component, with sizes and offsets measured from the component's corner.")
W(f"- Crops are images of the component read from the rendered snapshot, in [components/crops/](components/crops) ({len(crop_files)} files, named `{{component}}-{{state}}.png`, at 2x, 256 colours). A crop wider than 1600px was halved. A state that paints the same pixels as its default has no file of its own. Screenshots are in [screenshots/](screenshots).")
W()

# ------------------------------------------------ discovery list
W("## Discovery list")
W()
W("Screenshots are named `{page}-light-{state}.png` (the captured theme is light; no dark theme was reached). They are 1440 x 900 at 2x, 256 colours. The graph canvas in every one of them is a bitmap, frozen exactly as captured.")
W()
W("| Surface | URL | Screenshots |")
W("|---|---|---|")
for p, desc, url in SHOTS:
    W(f"| {desc} | `{url}` | {links(p)} |")
W()
W("### Overlays and transient states")
W()
W("| State | Where | How it was reached | Captured |")
W("|---|---|---|---|")
for r in OVER:
    W("| " + " | ".join(r) + " |")
W()

# ------------------------------------------------ shared values
W("## Shared values")
W()
W("Values that apply across entries, from the measurement file. Counts are components whose first state has the value.")
W()

first_state = {}
for k, c in C.items():
    for lab, v in c["states"].items():
        if "style" in v:
            first_state[k] = v
            break

# fonts
fonts = V.get("fonts", [])
fam_count = Counter()
for k, v in first_state.items():
    t = v.get("textStyle")
    fam_count[fam(t["fontFamily"]) if t else fam(v["style"]["fontFamily"])] += 1
unused_fonts = [f.replace('+', ' ') for f in fonts if f.replace('+', ' ') not in fam_count]
W(f"**Type.** Two faces are loaded from Google Fonts: {', '.join(f.replace('+', ' ') for f in fonts)}. First-state text is set in {', '.join(f'{n} ({c} components)' for n, c in sorted(fam_count.items(), key=lambda kv: (-kv[1], kv[0])))}." + (f" No measured component renders in {', '.join(unused_fonts)}, which is requested in a light weight only." if unused_fonts else ""))
W()
tcount = defaultdict(list)
for k, v in first_state.items():
    t = v.get("textStyle")
    s = v["style"]
    key = (fam(t["fontFamily"]), px(t["fontSize"]), px(t["lineHeight"]) if t["lineHeight"] != "normal" else "normal", t["fontWeight"], t.get("fontStyle", "normal")) if t else (fam(s["fontFamily"]), px(s["fontSize"]), px(s["lineHeight"]) if s["lineHeight"] != "normal" else "normal", s["fontWeight"], s.get("fontStyle", "normal"))
    tcount[key].append(k)
W("| Type | Components using it |")
W("|---|---|")
for key, ks in sorted(tcount.items(), key=lambda kv: (-len(kv[1]), kv[0])):
    if len(ks) < 2:
        continue
    W(f"| {key[0]} {key[1]}/{key[2]} {key[3]}{' italic' if key[4] == 'italic' else ''} | {len(ks)}: {', '.join('`' + x + '`' for x in sorted(ks)[:6])}{' and more' if len(ks) > 6 else ''} |")
W()

# radii
rad = defaultdict(list)
for k, v in first_state.items():
    s = v["style"]
    r = sides(s["borderTopLeftRadius"], s["borderTopRightRadius"], s["borderBottomRightRadius"], s["borderBottomLeftRadius"])
    if r != "0px":
        rad[r].append((k, v["rect"]["h"]))
W("**Radii.**")
W()
W("| Radius | Count | Components |")
W("|---|---|---|")


def rkey(r):
    try:
        return -float(r.split()[0].replace("px", ""))
    except ValueError:
        return 0


for r, ks in sorted(rad.items(), key=lambda kv: (rkey(kv[0]), kv[0])):
    W(f"| {r} | {len(ks)} | {', '.join('`' + x[0] + '`' for x in sorted(ks)[:7])}{' and more' if len(ks) > 7 else ''} |")
W()
pills = sorted(k for k, v in first_state.items() if float(v["style"]["borderTopLeftRadius"].replace("px", "") or 0) >= v["rect"]["h"] / 2 and v["rect"]["h"] >= 20 and v["style"]["borderTopLeftRadius"] == v["style"]["borderBottomRightRadius"])
r48 = sum(1 for k in pills if first_state[k]["style"]["borderTopLeftRadius"] == "48px")
W(f"**Pill shape.** A component is a pill when its radius is at least half its height. {len(pills)} are: {', '.join('`' + k + '`' for k in pills)}. {r48} of them use `48px` whatever their height ({min(first_state[k]['rect']['h'] for k in pills if first_state[k]['style']['borderTopLeftRadius'] == '48px')} to {max(first_state[k]['rect']['h'] for k in pills if first_state[k]['style']['borderTopLeftRadius'] == '48px')}px), so `48px` reads as fully round. Cards, panels and menus use `6px` to `16px`; the drawer's top corners are `32px`.")
W()

# shadows
sh = defaultdict(list)
for k, c in C.items():
    for lab, v in c["states"].items():
        if "style" not in v:
            continue
        s = v["style"]["boxShadow"]
        if s != "none":
            sh[shadow_text(s)].append(k)
used_tok = {shadow_token(s_) for s_ in sh if s_} - {None}
W("**Shadows.** Every box shadow read on a component, with the :root token it equals where there is one. " + ("The :root shadow tokens (" + ", ".join(f"`{n}`" for n in sorted(set(SHADOW_TOK.values()))) + ") are not used by any measured component, so cards and panels are flat; the shadows below are focus-like rings and the popover, tooltip and menu drop shadows." if not used_tok else ""))
W()
W("| Shadow | Where |")
W("|---|---|")
for s, ks in sorted(sh.items(), key=lambda kv: (-len(set(kv[1])), kv[0])):
    ks = sorted(set(ks))
    W(f"| {s} | {', '.join('`' + x + '`' for x in ks[:8])}{' and more' if len(ks) > 8 else ''} |")
if not sh:
    W("| none | |")
W()

# colours
cc = Counter()
cwhere = defaultdict(set)
for k, v in first_state.items():
    s = v["style"]
    for prop in ("backgroundColor", "color"):
        c = colour(s[prop])
        if c != "transparent":
            cc[(prop, c)] += 1
            cwhere[(prop, c)].add(k)
W("**Colours in use.** Background and text colours of the first state of each component, most used first.")
W()
W("| Use | Colour | Components |")
W("|---|---|---|")
for (prop, c), n in sorted(cc.items(), key=lambda kv: (-kv[1], kv[0]))[:28]:
    W(f"| {'background' if prop == 'backgroundColor' else 'text'} | {c} | {n} |")
W()

# motion
mot = defaultdict(lambda: (set(), set()))


def dur_ms(d):
    d = d.strip()
    return float(d[:-2]) if d.endswith("ms") else float(d[:-1]) * 1000


for k, c in C.items():
    for v in c["states"].values():
        if "style" not in v:
            continue
        s = v["style"]
        if s["transitionDuration"] in ("0s", ""):
            continue
        pr = [x.strip() for x in s["transitionProperty"].split(",")]
        du = [x.strip() for x in s["transitionDuration"].split(",")]
        tf = re.findall(r"cubic-bezier\([^)]*\)|steps\([^)]*\)|[a-z-]+", s["transitionTimingFunction"])
        for i, p in enumerate(pr):
            d = du[i % len(du)]
            if d == "0s":
                continue
            key = (f"{int(round(dur_ms(d)))}ms", tf[i % len(tf)] if tf else "ease")
            mot[key][0].add(p)
            mot[key][1].add(f"`{k}`")
for name, rules in V["components"].items():
    for r in rules:
        for m in re.finditer(r"transition\s*:\s*([^;}]+)", r):
            for part_ in re.split(r",(?![^(]*\))", m.group(1)):
                bits = part_.replace("!important", "").split()
                if len(bits) >= 2 and re.fullmatch(r"[\d.]+m?s", bits[1]) and dur_ms(bits[1]) < 5000:
                    key = (f"{int(round(dur_ms(bits[1])))}ms", bits[2] if len(bits) > 2 else "ease")
                    mot[key][0].add(bits[0])
                    mot[key][1].add(name)
W("**Motion.** Transitions in the page's CSS (every styled component's rules, in [raw/css-vars.json](raw/css-vars.json)) and on the measured elements. The CSS defines no transition on a hover or focus colour except the scrollbar thumb; the rest are opacity, transform and width changes on panels, the drawer and overlays.")
W()
W("| Duration | Easing | Property | Where |")
W("|---|---|---|---|")
for (d, e), (ps, ks) in sorted(mot.items(), key=lambda kv: (dur_ms(kv[0][0]), kv[0][1])):
    ks = sorted(ks)
    W(f"| {d} | `{e}` | {', '.join(sorted(ps))} | {', '.join(ks[:6])}{' and more' if len(ks) > 6 else ''} |")
if not mot:
    W("| none found | | | |")
W()

# focus
ring, same_f, changed_f, nofocus = defaultdict(list), [], [], []
for k, c in C.items():
    for bl, bv, vs in groups_of_states(c):
        for kind, v in vs:
            if kind != "focus-visible":
                continue
            if not (v.get("focus") or {}).get("matches"):
                nofocus.append(k)
                continue
            s_ = v["style"]
            if s_["outlineStyle"] != "none" and float(s_["outlineWidth"].replace("px", "")) > 0:
                ring[f"{s_['outlineWidth']} {s_['outlineStyle']} {colour(s_['outlineColor'])}, offset {s_['outlineOffset']}"].append(k)
            elif diff(props(v), props(bv)):
                changed_f.append(k)
            else:
                same_f.append(k)
n_ring = len({k for ks in ring.values() for k in ks})
focus_txt = f"**Focus.** Real keyboard focus was given to every component that could take it. {n_ring} draw an outline ring, in {len(ring)} styles: " + "; ".join(
    f"{r} on {', '.join('`' + k + '`' for k in sorted(set(ks))[:5])}{' and more' if len(set(ks)) > 5 else ''}" for r, ks in sorted(ring.items(), key=lambda kv: (-len(set(kv[1])), kv[0]))) + ". "
if changed_f:
    focus_txt += f"{len(set(changed_f))} change something other than an outline: {', '.join('`' + k + '`' for k in sorted(set(changed_f))[:8])}. "
if same_f:
    focus_txt += f"{len(set(same_f))} show no change in computed style, so a keyboard user sees nothing: {', '.join('`' + k + '`' for k in sorted(set(same_f))[:12])}. "
if nofocus:
    focus_txt += f"{len(set(nofocus))} could not take focus (a div, or disabled): {', '.join('`' + k + '`' for k in sorted(set(nofocus)))}."
W(focus_txt.strip())
W()

# hover
hv = Counter()
hv_bg = Counter()
for k, c in C.items():
    for bl, bv, vs in groups_of_states(c):
        for kind, v in vs:
            if kind == "hover" and v.get("hovered") is not False:
                d = diff(props(v), props(bv))
                hv["changes" if d else "same"] += 1
                if "background" in d:
                    hv_bg[(props(bv)["background"], d["background"])] += 1
W(f"**Hover.** {hv['changes']} hovered states differ from their rest state in computed style and {hv['same']} do not (they change something drawn on the canvas, or nothing). Background changes on hover, most common first:")
W()
W("| From | To | Count |")
W("|---|---|---|")
for (a_, b_), n in sorted(hv_bg.items(), key=lambda kv: (-kv[1], kv[0]))[:12]:
    W(f"| {a_} | {b_} | {n} |")
W()

# layout
W("**Layout regions.** The page's main regions at 1440 x 900, from the DOM ([raw/components-computed.json](raw/components-computed.json), `pages`). Pages with the same region are listed together.")
W()
W("| Region | x | y | width | height | Background | Radius | Pages |")
W("|---|---|---|---|---|---|---|---|")
reg = OrderedDict()
for pk, pv in PG.items():
    for rn, r in pv.get("regions", {}).items():
        key = (rn, px(r["x"]), px(r["y"]), px(r["w"]), px(r["h"]), colour(r["bg"]) if r.get("bg") else "-", r.get("radius", "-"))
        reg.setdefault(key, []).append(pk)
for key, pks in sorted(reg.items(), key=lambda kv: (kv[0][0], kv[1][0])):
    W(f"| {' | '.join(key)} | {', '.join(pks) if len(pks) <= 4 else f'{pks[0]} and {len(pks) - 1} more'} |")
W()

# shapes
W("**Surface shapes.** Values from the first state of each; the entries hold the others.")
W()
W("| Surface | Size | Border | Radius | Background | Shadow | Padding |")
W("|---|---|---|---|---|---|---|")
for k in SHAPES:
    if k not in C or k not in first_state:
        continue
    st = first_state[k]
    p = props(st)
    if (p["background"] == "transparent" or "radius" not in p) and st.get("paint"):
        p0 = next((x for x in st["paint"] if x.get("bg") and x.get("radius")), st["paint"][0])
        p = dict(p, border=colour(p0["border"].split(" | ")[0][2:]) if p0.get("border") else "-", radius=p0.get("radius", "-"), background=colour(p0.get("bg", "")) or "-", shadow=shadow_text(p0.get("shadow", "")) or "none")
    W(f"| [{C[k]['name']}](#{slug(C[k]['name'])}) | {p['size']} | {p.get('border', '-')} | {p.get('radius', '-')} | {p.get('background', '-')} | {p.get('shadow', 'none')} | {p.get('padding', '0')} |")
W()

# ------------------------------------------------ entries
W("## Components")
group_order = list(GROUP_INTRO)
for k, c in C.items():
    if c["group"] not in group_order:
        group_order.append(c["group"])
for g in group_order:
    if not any(c["group"] == g for c in C.values()):
        continue
    W()
    W(f"### {g}")
    W()
    W(GROUP_INTRO.get(g, ""))
    for k, c in C.items():
        if c["group"] != g:
            continue
        W()
        W(f"#### {c['name']}")
        desc = (c.get("description") or "").strip()
        if desc and not desc.endswith((".", ")", '"')):
            desc += "."
        pgs = ", ".join(PAGE_NAME.get(p, p) for p in c["pages"][:3]) + (f" and {len(c['pages']) - 3} more" if len(c["pages"]) > 3 else "")
        W(f"{desc + ' ' if desc else ''}Read as `{k}` on the {pgs}.")
        W()
        errs = [lab for lab, v in c["states"].items() if "error" in v]
        gs = groups_of_states(c)
        if not gs:
            W("Not on the page when it was captured.")
            continue
        rows = []
        first_props = None
        notes = []
        for bl, bv, vs in gs:
            bp = props(bv)
            same = []
            vrows = []
            for kind, v in vs:
                if kind == "focus-visible" and not (v.get("focus") or {}).get("matches"):
                    notes.append(f"{bl if bl != 'default' else 'the component'} cannot take keyboard focus")
                    continue
                if kind == "hover" and v.get("hovered") is False:
                    notes.append(f"the pointer did not reach {bl if bl != 'default' else 'the component'} in the snapshot")
                    continue
                d = diff(props(v), bp)
                if not d:
                    same.append(kind)
                else:
                    if vrows and vrows[-1][1] == d:
                        vrows[-1] = (vrows[-1][0] + ", " + kind, d)
                    else:
                        vrows.append((kind, d))
            label = bl + (f" (same: {', '.join(same)})" if same else "")
            if first_props is None:
                rows.append((label, fmt(bp)))
                first_props = bp
            else:
                d0 = diff(bp, first_props)
                if not d0:
                    rows.append((label + " (same as the first row)", "same values"))
                elif len(d0) <= max(1, len(bp) // 2):
                    rows.append((label + " (as the first row, except)", fmt(d0)))
                else:
                    rows.append((label, fmt(bp)))
            for kind, d in vrows:
                rows.append((f"{bl}, {kind}" if bl != "default" else kind, fmt(d)))
        if len(rows) == 1:
            W(f"**Values ({rows[0][0].split(' (')[0]}).** {rows[0][1]}.")
            W()
        else:
            W("| State | Values (a hover or focus-visible row lists only what changes) |")
            W("|---|---|")
            for lab, val in rows:
                W(f"| {lab} | {val} |")
            W()
        for n in sorted(set(notes)):
            W(f"- Not measured: {n}.")
        if notes:
            W()
        # child layers
        st0 = gs[0][1]
        s0 = st0["style"]
        if st0.get("paint") and s0["backgroundColor"] == "rgba(0, 0, 0, 0)" and s0["boxShadow"] == "none" and s0["borderTopWidth"] == "0px" and s0["backgroundImage"] == "none":
            out = []
            for p in st0["paint"][:3]:
                bits = [p["node"].split(".")[0] if "::" not in p["node"] else p["node"].split(".")[0], p["size"].replace(".0x", "x").replace(".0", "")]
                if p.get("bg"):
                    bits.append("background " + colour(p["bg"]))
                if p.get("border"):
                    bits.append("border " + colour(p["border"].split(" | ")[0][2:]))
                if p.get("radius"):
                    bits.append("radius " + p["radius"])
                if p.get("shadow"):
                    bits.append("shadow " + (shadow_text(p["shadow"]) or ""))
                out.append(" ".join(bits))
            W("Child layers that carry the look: " + "; ".join(out).replace("|", "/") + ".")
            W()
        extra = next((v.get("extra") for _, v, _ in gs if v.get("extra")), None)
        pl = parts_lines(extra)
        if pl:
            W("Parts:")
            W()
            for line in pl[:24]:
                W(("  - " + line[2:]) if line.startswith("  ") else f"- {line}")
            W()
        rules = next((v.get("rules") for _, v, _ in gs if v.get("rules")), None)
        if rules:
            W("Authored state rules (from the page's CSS): " + "; ".join(f"`{colour(r, tokens=False)[:150]}`" for r in rules[:3]) + ".")
            W()
        # crops
        seen = []
        for lab, v in c["states"].items():
            cp = v.get("crop")
            if cp and cp not in seen and Path(cp).exists():
                seen.append(cp)
        W(" ".join(f"![{c['name']} {Path(cp).stem[len(k) + 1:]}]({cp})" for cp in seen) if seen else "No crop was saved for this entry (a whole page or a hidden element); the values are from the computed styles.")
        if errs:
            W()
            W(f"Not found on the page: {', '.join(errs)}.")

# ------------------------------------------------ icons
W()
W("## Icons")
W()
W(f"{len(icons)} SVGs: {sum(1 for r in icons if not r[0].startswith('graph-'))} lifted from the snapshots and {sum(1 for r in icons if r[0].startswith('graph-'))} copied as path strings from the graph engine's `graphIconPathMap` (the `graph-*` files, 24 x 24, drawn on the canvas with Path2D). They are in [icons/](icons), named by role, with the source table in [icons/INDEX.tsv](icons/INDEX.tsv). Colour is `currentColor` wherever the icon took its colour from the text, so each recolours from CSS `color`. The big Lottie rabbit and the illustration art are not included. The SVGs are ResearchRabbit's, kept for reference only.")
W()
W("| Icon | Rendered sizes | View box | Style | Seen on | Place |")
W("|---|---|---|---|---|---|")
for r in icons:
    f, name, h, sizes, vb, style, seen, place, label = (r + [""] * 9)[:9]
    pages = [x for x in seen.split("; ") if x]
    seen_txt = f"{len(pages)} pages" if len(pages) > 4 else "; ".join(pages)
    W(f"| ![{name}](icons/{f}) [{name}](icons/{f}) | {sizes} | {vb} | {style} | {seen_txt} | {place.split('; ')[0]} |")
W()

# ------------------------------------------------ gaps
W("## Gaps")
W()
W("### Graph")
W()
W("- **Canvas states are bitmaps.** The graph is drawn on a canvas, and each snapshot holds an image of it. Node fills, rings, edge colours, label placement and the hover title box have no computed style; read them from [raw/graph-code-notes.md](raw/graph-code-notes.md) and measure them off the crops. A node's hit area and the camera are not in the snapshots at all.")
W("- **Drag and box select are only partly captured.** The library snapshots show one state after dragging a node (Positions moved) and the Reset menu. There is no mid-drag frame, no box-select rectangle, no multi-select state and no resize drag.")
W("- **Pan and zoom are one before and after.** Zoomed in is a single snapshot; the zoom steps and the transition between them are not.")
W("- **The author-ring layout** (articles on the map, authors on a ring) was not captured.")
W("- **One screenshot disagrees with a fresh render.** In [library-map-light-positions-reset-menu](screenshots/library-map-light-positions-reset-menu.png) the Positions moved pill is a salmon gradient; rendering the same snapshot file again paints it `#f5c751` (as in library-map-light-positions-moved), and the measurements here use the fresh render. If the live pill turns salmon when its menu is open, that is an animation or a state the snapshot did not keep.")
W()
W("### States")
W()
W("- **Pressed** was not measured. The authored `:active` rules, where the CSS has any, are listed in the entry's state rules.")
W("- **Hover states of the canvas** (a node, an edge) are only in the three hover snapshots; the DOM tooltip is measured, the title box on the canvas is not.")
W("- **Components that did not take focus** (legend chips, the disabled pager and drawer Search button, text tabs that are divs) are named in each entry.")
W("- **Anything script-driven is missing**: the workspace menu, the account menu, the Sort select list, the Collection and Reading List menus, the share dialog, dialogs, toasts and loading spinners, typing in a field, list scrolling and paging, the drawer opening and closing, and every transition between panels. Only the states captured are measured.")
W("- **Disabled and error states** appear only where a snapshot happens to hold one (the greyed selection bar, the pager).")
W()
W("### Themes")
W()
W("Only the light theme was captured. The stylesheets declare dark values (the `--shadow-*-dark` variables and a few others), but no page was captured in dark, so no dark component values exist here.")
W()
W("### Pages and widths")
W()
W("- **One width.** Everything was read at 1440 x 900. There are no tablet or phone layouts.")
W("- **Not captured:** sign-in and onboarding, settings and billing, the share dialog, the import (BibTeX, Zotero) flows, the authors view, the Recently Found, All Articles and Reading List lists with content, the PDF reader, and empty states other than Next Search.")
W()
W("### Screenshots and crops")
W()
W("- Article cards show public papers; the workspace name is redacted. The graph bitmap in each crop is the app's own, so two states of the same search can differ in which nodes are labelled.")
W("- Crops and screenshots are 256-colour PNGs; read exact colours from the tables above or from [raw/css-vars.json](raw/css-vars.json), not from the images.")
W("- Images from the app's own `/assets/` (the home page's illustration and guide thumbnails) are allowed through while measuring so the crops show them; no other request is let through.")

Path("components.md").write_text("\n".join(L) + "\n")
print("components.md:", len(L), "lines,", len(C), "entries,", len(crop_files), "crops,", len(icons), "icons")
