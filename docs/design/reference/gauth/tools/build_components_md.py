#!/usr/bin/env python3
"""Build components.md for the Gauth design reference.

Reads raw/components-computed.json (every component and state, measured), raw/layout.json,
tokens.json, screenshots/ and icons/INDEX.tsv, and writes components.md next to them. Every value
is a cell of the measurement file, condensed: colours are hex followed by the palette token whose
value matches, the font family is named once per value, and a state row shows only what differs
from the first state. Adapted from the Coursera kit's builder, which read markdown; this one reads
the JSON directly.

Deterministic: re-running it on the same inputs reproduces components.md byte for byte.
Run from anywhere: python3 tools/build_components_md.py
"""
import json, os, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
J = json.load(open("raw/components-computed.json"))
C = J["components"]
LAYOUT = json.load(open("raw/layout.json"))
T = json.load(open("tokens.json"))

# --------------------------------------------------------------------------- colours and tokens


def flat(node, prefix=""):
    for k, v in node.items():
        if k.startswith("$"):
            continue
        if isinstance(v, dict) and "$value" in v:
            yield prefix + k, v
        elif isinstance(v, dict):
            yield from flat(v, prefix + k + ".")


BY_COLOR = {}
for n, t in flat(T["core"]["palette"]):
    if t["$type"] == "color":
        BY_COLOR.setdefault(t["$value"], n)


def norm(r, g, b, a=None):
    if a is None or float(a) == 1:
        return "#%02x%02x%02x" % (int(r), int(g), int(b))
    return "rgba(%d, %d, %d, %g)" % (int(r), int(g), int(b), float(a))


def colour(c, tokens=True):
    """rgb()/rgba()/color(srgb) -> '#hex `token`' or 'rgba(...)'."""
    def label(v):
        if v == "rgba(0, 0, 0, 0)":
            return "transparent"
        tok = BY_COLOR.get(v) if tokens else None
        return f"{v} `{tok}`" if tok else v

    c = re.sub(r"color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: / ([\d.]+))?\)",
               lambda m: label(norm(*(round(float(x) * 255) for x in m.group(1, 2, 3)), m.group(4))), c)
    return re.sub(r"rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)", lambda m: label(norm(*m.group(1, 2, 3), m.group(4))), c)


def sides(t, r, b, l):
    if t == r == b == l:
        return t
    if t == b and r == l:
        return f"{t} {r}"
    return f"{t} {r} {b} {l}"


def fam(f):
    return f.split(",")[0].replace('"', "")


def num(x):
    x = str(x)
    return re.sub(r"(\d+\.\d\d)\d+", r"\1", x)


def font(fz, lh, fw, f):
    lh = lh.replace("px", "") if lh != "normal" else "normal"
    return f"{fam(f)} {num(fz.replace('px', ''))}/{num(lh)} {fw}"


def props(v):
    s = v["style"]
    o = {}
    o["size"] = f"{num(v['rect']['w'])} x {num(v['rect']['h'])}"
    pad = sides(s["paddingTop"], s["paddingRight"], s["paddingBottom"], s["paddingLeft"])
    if pad != "0px":
        o["padding"] = pad
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
        sh = colour(s["boxShadow"], tokens=False)
        layers = [x.strip() for x in re.split(r",(?![^(]*\))", sh)]
        layers = [x for x in layers if not x.startswith("transparent")]
        if layers:
            o["shadow"] = ", ".join(layers)
    if s["outlineStyle"] != "none" and float(s["outlineWidth"].replace("px", "")) > 0:
        o["outline"] = f"{s['outlineWidth']} {s['outlineStyle']} {colour(s['outlineColor'])}, offset {s['outlineOffset']}"
    t = v.get("textStyle")
    if t:
        o["text"] = f"{font(t['fontSize'], t['lineHeight'], t['fontWeight'], t['fontFamily'])}, {colour(t['color'])}"
    else:
        o["text"] = f"{font(s['fontSize'], s['lineHeight'], s['fontWeight'], s['fontFamily'])}, {colour(s['color'])}"
    if s["transitionDuration"] not in ("0s", ""):
        props_ = [x.strip() for x in s["transitionProperty"].split(",")]
        durs = [x.strip() for x in s["transitionDuration"].split(",")]
        tf = re.findall(r"cubic-bezier\([^)]*\)|steps\([^)]*\)|[a-z-]+", s["transitionTimingFunction"])
        parts = []
        for i, p in enumerate(props_):
            d = durs[i % len(durs)]
            if d == "0s":
                continue
            parts.append(f"{p} {d} {tf[i % len(tf)] if tf else ''}".strip())
        if parts:
            o["transition"] = ", ".join(parts)
    if s["transform"] not in ("none", "matrix(1, 0, 0, 1, 0, 0)"):
        m = re.fullmatch(r"matrix\(([\d.]+), 0, 0, ([\d.]+), (-?[\d.]+), (-?[\d.]+)\)", s["transform"])
        if m and m.group(1) == m.group(2) and m.group(3) == m.group(4) == "0":
            o["transform"] = f"scale({m.group(1)})"
        elif m and m.group(1) == m.group(2) == "1":
            o["transform"] = f"translate({m.group(3)}px, {m.group(4)}px)"
        else:
            o["transform"] = s["transform"]
    if s["opacity"] != "1":
        o["opacity"] = s["opacity"]
    if v.get("icon") and v["icon"]["w"] > 0 and v["icon"]["w"] < 120:
        o["icon"] = f"{num(v['icon']['w'])} x {num(v['icon']['h'])}, {colour(v['icon']['color'])}"
    if v.get("placeholder"):
        o["placeholder"] = colour(v["placeholder"]["color"])
    return o


ORDER = ["size", "padding", "border", "radius", "background", "image", "shadow", "outline", "text", "transition", "transform", "opacity", "icon", "placeholder"]


def state_rows(c):
    states = [s for s in c["states"] if "style" in c["states"][s]]
    if not states:
        return [], states
    base = props(c["states"][states[0]])
    rows = [(states[0], base)]
    same = []
    for st in states[1:]:
        p = props(c["states"][st])
        diff = {k: p[k] for k in ORDER if k in p and p.get(k) != base.get(k)}
        for k in ORDER:
            if k in base and k not in p:
                diff[k] = "none"
        if not diff:
            same.append(st)
            continue
        if rows[-1][0] != states[0] and rows[-1][1] == diff:
            rows[-1] = (rows[-1][0] + ", " + st, diff)
        else:
            rows.append((st, diff))
    if same:
        rows[0] = (f"{states[0]} (same: {', '.join(same)})", base)
    return rows, states


def fmt(d):
    return "; ".join(f"{k} {d[k]}" for k in ORDER if k in d).replace("|", "/")


def child_layers(c):
    st = next((s for s in c["states"].values() if "style" in s), None)
    if not st or not st.get("paint"):
        return None
    s = st["style"]
    if s["backgroundColor"] != "rgba(0, 0, 0, 0)" or s["boxShadow"] != "none" or s["borderTopWidth"] != "0px" or s["backgroundImage"] != "none":
        return None
    out = []
    for p in st["paint"][:3]:
        bits = [re.sub(r"\..*$", "", p["node"]) if "::" not in p["node"] else p["node"].split(".")[0], p["size"].replace(".0x", "x").replace(".0", "")]
        if p.get("bg"):
            bits.append("background " + colour(p["bg"]))
        if p.get("bgImage"):
            bits.append("image " + colour(p["bgImage"])[:90])
        if p.get("border"):
            bits.append("border " + colour(p["border"].split(" | ")[0][2:]))
        if p.get("radius"):
            bits.append("radius " + p["radius"])
        if p.get("shadow"):
            bits.append("shadow " + colour(p["shadow"]))
        out.append(" ".join(bits))
    return "; ".join(out).replace("|", "/")


# --------------------------------------------------------------------------- page and group text

PAGE_NAME = {"home": "Homework home", "science": "Academy (Science Labs)", "math": "Academy (Math Curriculum)", "history": "Academy (History Signature)",
             "my": "Academy (My Course)", "unit": "unit", "lesson-science": "science lesson", "lesson-math": "math lesson",
             "lesson-history": "history lesson", "atlas": "Atlas", "story": "Atlas story", "news": "Insights"}

GROUP_INTRO = {
    "Shell and navigation": "The app shell shared by Homework, Academy and Insights: a fixed 220px sidebar and a 60px top bar over the content. The sidebar is white with a cool grey current item on Homework and Insights, and takes the warm `#faf9f5` ground with a beige current item on Academy. Atlas and the lesson players have shells of their own (their groups below).",
    "Homework home": "The question-first home page: a serif hero over a lilac gradient, the question field, an upload panel and subject chips, then marketing sections. Nothing was ever sent or uploaded.",
    "Academy catalogue": "The course catalogue: the Playfair title and Create Course, four category tabs, then course sections of card grids. Science Labs and History Signature use cover cards with a progress track; Math Curriculum uses unit cards with an 80px cover tile.",
    "Unit page": "A math course's page: a back link, a tinted course banner, the unit rail at the left and the topic path at the right, with a floating Start panel.",
    "Lesson player: science canvas": "The science player is built in Astryx, a separate design system (`astryx-*` classes, StyleX variables, the \"stone\" theme): a narrated canvas that pans by itself, a section rail, transport controls and a docked Ask Tutor bar. Its focus ring is the only blue one on the site.",
    "Lesson player: math": "The math player puts a tutor column at the left and the slide in a white frame at the right, on the warm ground.",
    "Lesson player: history": "The history player is immersive: chapter pills at the top, the scene in the middle, a play disc and a caption line.",
    "Atlas": "Atlas has its own shell (a 56px header and a 230px drawer), a prompt box, recommendation chips and a grid of story cards. A story opens as a video preview, then a story page.",
    "Insights": "The news and blog list in the app shell.",
    "Dialogs and overlays": "The promo dialog every page opens with, the Create a Course dialog, the science player's audio dialog, the math player's audio gate and the Atlas story preview. The promo's overlay is `rgba(15, 17, 20, 0.45)`.",
    "Mobile (390 wide)": "A few components as a phone draws them, at 390 x 844 with an iPhone user agent.",
}

SHOTS = [
    ("home", "Homework home. Serif hero, question field, upload panel, subject chips, then the Atlas, AI solution and live tutor bands, comments and the footer. The promo dialog, the field focused and the folded sidebar captured.", "/"),
    ("academy-science", "Academy, Science Labs. Title, Create Course, tabs, course sections of lesson cards.", "/course/science"),
    ("academy-math", "Academy, Math Curriculum. Unit cards, six per course, and Show more expanded (the toolbar sticks with Create Course in it).", "/course/math"),
    ("academy-history", "Academy, History Signature. Illustrated lesson cards.", "/course/history"),
    ("academy-my", "Academy, My Course. The signed-out empty state, and the Create a Course dialog.", "/course/my"),
    ("unit", "Unit page (Algebra 1). Banner, unit rail, topic path, Start panel; scrolled down the path; Unit 2 chosen in the rail.", "/course/math/algebra-1?unit=real-numbers-and-sets"),
    ("lesson-science", "Science lesson. The audio dialog, the first chapter, Settings open, Ask Tutor opened, a figure with its callout and list, and a quiz.", "/course/science/how-things-work-1/learn"),
    ("lesson-math", "Math lesson. The audio gate, the playing slide with the tutor column, the chapters panel.", "/course/math/algebra-1/fundamentals-of-set-theory/learn"),
    ("lesson-history", "History lesson. The opening scene, the chapter panel.", "/course/history/crossing-the-ocean-wall/learn"),
    ("atlas", "Atlas. Landing, prompt box, chips, Popular Stories, FAQ; a story card's video preview; the Apollo 11 story page, and its Video Settings popover.", "/atlas"),
    ("news", "Insights. Breadcrumb, News and Blog tabs, featured article, article rows.", "/news"),
]
MOBILE = [
    ("mobile-home", "Homework home at 390: the promo dialog, the hero, the full page with the app banner.", "/"),
    ("mobile-academy", "Academy at 390: Math Curriculum (Science Labs is not offered on a phone).", "/course/math"),
    ("mobile-unit", "Unit page at 390, and scrolled down the path.", "/course/math/algebra-1?unit=real-numbers-and-sets"),
    ("mobile-lesson-math", "Math lesson at 390: the audio gate and the slide.", "/course/math/algebra-1/fundamentals-of-set-theory/learn"),
    ("mobile-atlas", "Atlas at 390, and a story page (Artemis II).", "/atlas"),
]

L = []


def W(s=""):
    L.append(s)


shots = sorted(p.name for p in Path("screenshots").glob("*.png"))


def links(prefix):
    out = []
    for f in shots:
        m = re.fullmatch(re.escape(prefix) + r"-light-(.+)\.png", f)
        if m:
            out.append(f"[{m.group(1)}](screenshots/{f})")
    return ", ".join(out)


n_crops = len(list(Path("components/crops").glob("*.png")))
n_states = sum(len(c["states"]) for c in C.values())
icons = [r.split("\t") for r in open("icons/INDEX.tsv").read().strip().split("\n")[1:]]

W("# Gauth components")
W()
W(f"The discovery list of every page and view captured, then one entry per component with crops of the real product, the icon index and the Gaps. Captured from www.gauth.com on {J['_meta']['read']}, signed out, in headless Chromium at 1440 x 900 (the Mobile group at 390 x 844), with computed styles read from the running page. Nothing was signed into, created, sent or uploaded.")
W()
W(f"The full per-state readings are in [raw/measurements.md](raw/measurements.md), with the machine-readable copy in [raw/components-computed.json](raw/components-computed.json) ({len(C)} components, {n_states} states). The page layouts are described in [raw/pages.md](raw/pages.md).")
W()
W("How to read an entry:")
W()
W("- A colour is its value followed by the palette token in [tokens.json](tokens.json) with the same value, when there is one. Text is written family size/line-height weight, then its colour, for example `SF Pro 14/21 500, #21252e`, and is read from the first text node inside the component.")
W("- The state table has one row per state that differs. The first row lists every value; later rows list only what changes. A state with the same values as the first is named in its label, for example \"default (same: focus-visible)\". When the root paints nothing, \"Child layers\" names the first nodes inside it that do.")
W(f"- Crops are images of the component read from the live page, in [components/crops/](components/crops) ({n_crops} files, named `{{component}}-{{state}}.png`, at 2x). Screenshots are in [screenshots/](screenshots).")
W()
W("## Discovery list")
W()
W("Screenshots are named `{page}-light-{state}.png` (Gauth has one theme). Desktop shots are 1440 x 900 at 1x; `-full` shots are whole pages at 1x; mobile shots are `mobile-{page}-light-{state}.png`, 780 wide (390 at 2x).")
W()
W("| Surface | URL | Screenshots |")
W("|---|---|---|")
for p, desc, url in SHOTS + MOBILE:
    W(f"| {desc} | `{url}` | {links(p)} |")
W()
W("### Overlays and transient states")
W()
W("| State | Where | How it was reached | Captured |")
W("|---|---|---|---|")
OVER = [
    ("Promo dialog (\"Introducing Gauth Academy\")", "every page, on load", "at rest; then dismissed with its own close button for every other capture", "[home-light-promo](screenshots/home-light-promo.png), [promo-dialog](#promo-dialog)"),
    ("Create a Course dialog", "Academy", "Create Course pressed (opens the dialog); a prompt typed and deleted, no suggestion pressed", "[academy-my-light-create-dialog](screenshots/academy-my-light-create-dialog.png), [create-a-course-dialog](#create-a-course-dialog)"),
    ("Enable audio dialog", "science lesson", "on load; Not now pressed, Enable audio never pressed", "[lesson-science-light-audio-dialog](screenshots/lesson-science-light-audio-dialog.png)"),
    ("Audio gate", "math lesson", "on load; Continue pressed to start playback", "[lesson-math-light-audio-gate](screenshots/lesson-math-light-audio-gate.png)"),
    ("Settings popover", "science lesson", "the lesson's Settings button", "[lesson-science-light-settings](screenshots/lesson-science-light-settings.png)"),
    ("Ask Tutor, opened", "science lesson", "clicked into the bar; sample text typed and deleted, nothing sent", "[lesson-science-light-ask-tutor](screenshots/lesson-science-light-ask-tutor.png)"),
    ("Quiz", "science lesson", "reached by letting the lesson play about three minutes; no option chosen", "[lesson-science-light-quiz](screenshots/lesson-science-light-quiz.png)"),
    ("Chapters panel", "math and history lessons", "the chapters button", "[lesson-math-light-chapters](screenshots/lesson-math-light-chapters.png), [lesson-history-light-chapters](screenshots/lesson-history-light-chapters.png)"),
    ("Show more", "Math Curriculum", "the Show 14 more button", "[academy-math-light-show-more](screenshots/academy-math-light-show-more.png)"),
    ("Folded sidebar", "Homework home", "the sidebar's collapse button", "[home-light-sidebar-folded](screenshots/home-light-sidebar-folded.png)"),
    ("Story preview", "Atlas", "a story card pressed (opens a video preview)", "[atlas-light-story-preview](screenshots/atlas-light-story-preview.png)"),
    ("Story page", "Atlas", "Explore in the preview (opens the published story)", "[atlas-light-story](screenshots/atlas-light-story.png), [mobile-atlas-light-story](screenshots/mobile-atlas-light-story.png)"),
    ("Video Settings popover", "Atlas story", "hovering Generate Video; nothing in it pressed", "[atlas-light-story-video-settings](screenshots/atlas-light-story-video-settings.png)"),
]
for r in OVER:
    W("| " + " | ".join(r) + " |")
W()

# ------------------------------------------------ shared values
W("## Shared values")
W()
W("Values that apply across entries, from the measurement files.")
W()
foc = []
for k, c in C.items():
    st = c["states"].get("focus-visible")
    if not st or "style" not in st:
        continue
    s = st["style"]
    ring = s["outlineStyle"] != "none" and float(s["outlineWidth"].replace("px", "")) > 0
    foc.append((k, f"{s['outlineWidth']} {s['outlineStyle']} {colour(s['outlineColor'])}, offset {s['outlineOffset']}" if ring else None))
with_ring = [f"`{k}` ({r})" for k, r in foc if r]
without = [f"`{k}`" for k, r in foc if not r]
W(f"**Focus.** {len(foc)} components were given a real keyboard focus. {len(with_ring)} draw a ring: {', '.join(with_ring)}. The other {len(without)} draw none, so a keyboard user sees no change: {', '.join(without)}. The Upgrade and Sign in buttons in the top bar are a `div` and a `span` and cannot take focus at all.")
W()
W("**Pressed.** Gauth's primary buttons shrink when pressed instead of changing colour much: Create, Start, Create Course and the Astryx buttons scale to 0.98, the math player's round buttons to 0.94, the promo button to 0.99. Cards deepen their shadow on hover and keep it when pressed.")
W()
W("**Motion.** Transitions measured on the components, by duration.")
W()
W("| Duration | Easing | Property | Where |")
W("|---|---|---|---|")
mot = {}
for k, c in C.items():
    for st in c["states"].values():
        if "style" not in st:
            continue
        s = st["style"]
        if s["transitionDuration"] in ("0s", ""):
            continue
        props_ = [x.strip() for x in s["transitionProperty"].split(",")]
        durs = [x.strip() for x in s["transitionDuration"].split(",")]
        tfs = re.findall(r"cubic-bezier\([^)]*\)|[a-z-]+", s["transitionTimingFunction"])
        for i, p in enumerate(props_):
            d = durs[i % len(durs)]
            if d == "0s":
                continue
            key = (d, tfs[i % len(tfs)] if tfs else "")
            ent = mot.setdefault(key, (set(), set()))
            ent[0].add(p)
            ent[1].add(k)
        break


def dur_ms(d):
    return float(d[:-1]) * 1000 if d.endswith("s") and not d.endswith("ms") else float(d[:-2])


for (d, e), (ps, ks) in sorted(mot.items(), key=lambda kv: (dur_ms(kv[0][0]), kv[0][1])):
    W(f"| {d} | `{e}` | {', '.join(sorted(ps))} | {', '.join(sorted(ks)[:8])}{' and more' if len(ks) > 8 else ''} |")
W()
W("**Layout grid.** Read on each page at each width ([raw/layout.json](raw/layout.json)).")
W()
W("| Page | 1440 | 1920 | 1024 | 390 |")
W("|---|---|---|---|---|")


def grid_of(key):
    v = LAYOUT.get(key)
    if not v:
        return "-"
    g = v["grids"][0] if v["grids"] else None
    cols = re.sub(r"(\d+\.\d)\d*px", r"\1", g["cols"]).replace("px", "") if g else ""
    main = f"content x {v['main']['x']}, {v['main']['w']} wide" if v["main"]["w"] else "content full width"
    return f"{main}; grid {cols} gap {g['colGap']}" if g else main


for page in ["home", "academy-science", "academy-math", "unit", "lesson-math", "atlas"]:
    W(f"| {page} | " + " | ".join(grid_of(f"{page}@{w}") for w in (1440, 1920, 1024, 390)) + " |")
W()
W("**Card shapes.** Default-state values; the entries hold the states.")
W()
W("| Card | Size | Border | Radius | Background | Shadow | Padding |")
W("|---|---|---|---|---|---|---|")
for k in ["lesson-card", "unit-card", "story-card", "feature-card", "solution-option", "create-suggestion", "quiz-card", "quiz-option", "learning-panel", "settings-popover", "chapters-panel", "video-settings", "view-rail", "m-unit-card"]:
    c = C.get(k)
    if not c:
        continue
    st = next(iter(c["states"].values()))
    if "style" not in st:
        continue
    p = props(st)
    if ("radius" not in p or p["background"] == "transparent") and st.get("paint"):
        p0 = next((x for x in st["paint"] if x.get("bg") and x.get("radius")), st["paint"][0])
        p = dict(p, border=colour(p0["border"].split(" | ")[0][2:]) if p0.get("border") else "-", radius=p0.get("radius", "-"), background=colour(p0.get("bg", "")) or "-", shadow=colour(p0.get("shadow", ""), tokens=False) or "none")
    W(f"| [{c['title']}](#{re.sub(r'[^a-z0-9 -]', '', c['title'].lower()).replace(' ', '-')}) | {p['size']} | {p.get('border', '-')} | {p.get('radius', '-')} | {p.get('background', '-')} | {p.get('shadow', 'none')} | {p.get('padding', '0')} |")
W()

# ------------------------------------------------ entries
W("## Components")
groups = [g for g in GROUP_INTRO if any(c["group"] == g for c in C.values())]
for c in C.values():
    if c["group"] not in groups:
        groups.append(c["group"])
for g in groups:
    W()
    W(f"### {g}")
    W()
    W(GROUP_INTRO.get(g, ""))
    for k, c in C.items():
        if c["group"] != g:
            continue
        W()
        W(f"#### {c['title']}")
        desc = (c.get("desc") or "").strip()
        if desc and not desc.endswith((".", ")", '"')):
            desc += "."
        where = PAGE_NAME.get(c["page"], c["page"])
        W(f"{desc + ' ' if desc else ''}Read as `{k}` on the {where} page{' at 390 wide' if g.startswith('Mobile') else ''}.")
        W()
        if c.get("missing"):
            W("Not on the page when it was captured.")
            continue
        rows, states = state_rows(c)
        if len(states) == 1 and rows:
            W(f"**Values ({states[0]}).** {fmt(rows[0][1])}.")
            W()
        elif rows:
            W("| State | Values (later rows list only what changes from the first row) |")
            W("|---|---|")
            for lab, d in rows:
                W(f"| {lab} | {fmt(d)} |")
            W()
        cl = child_layers(c)
        if cl:
            W(f"Child layers that carry the look: {cl}.")
            W()
        imgs = [f"![{c['title']} {st}](components/crops/{os.path.basename(c['states'][st]['crop'])})" for st in states if c["states"][st].get("crop")]
        W(" ".join(imgs) if imgs else "No crop was saved for this entry (a whole page or a hidden element); the values are from the computed styles.")

# ------------------------------------------------ icons
W()
W("## Icons")
W()
W(f"{len(icons)} SVGs were lifted from the pages into [icons/](icons), named by role, with the source table in [icons/INDEX.tsv](icons/INDEX.tsv). Colour is `currentColor` wherever the icon took its colour from the text, so each recolours from CSS `color`. Lesson content (the canvas, slides and formulas) was left out; these are the interface icons. The SVGs are Gauth's property, kept for reference only.")
W()
W("| Icon | Rendered sizes | View box | Style | Seen on | Next to |")
W("|---|---|---|---|---|---|")
for r in icons:
    f, name, h, sizes, vb, style, seen, place, label = (r + [""] * 9)[:9]
    W(f"| [{name}](icons/{f}) | {sizes} | {vb} | {style} | {seen} | {label.replace('|', '/')[:60]} |")
W()

# ------------------------------------------------ gaps
W("## Gaps")
W()
W("### Pages")
W()
W("- **Signed-in pages.** Nothing behind sign-in was captured: a learner's own My Course list, course progress, history, the homework answer page, Atlas topics a learner made, account settings and the subscription checkout. The kit never signs in.")
W("- **Anything that sends or creates.** No homework question was submitted (so the answer and step-by-step pages are missing), no course was generated from Create a Course, no tutor message or voice question was sent, no Atlas story was generated, no file was uploaded, no quiz option was chosen.")
W("- **Study Resources.** `/study-resources/*` redirects to gauthmath.com, which answers a headless browser with Access Denied.")
W("- **The science lesson's Completed screen** (a cover, a laurel \"Completed\" title, Share and View Canvas) was seen while exploring, after a lesson played to its end, but the kit does not wait the several minutes it takes, so there is no crop or measurement.")
W("- **Mobile science lessons.** A phone is redirected from `/course/science` to `/course/math`; Science Labs is not offered on a phone.")
W("- **Other lesson kinds.** Math lessons carry interactive steps (matching, drag, number lines, flashcards, graphs; their CSS is in the stylesheets) that only appear as a lesson plays on; the capture saw the first slides only.")
W()
W("### States")
W()
W("- **Pressed** was forced with DevTools on every control except toggles, so a state a script adds on mousedown (if any) is missing.")
W("- **Hover on the feature cards, the article rows, the Share button and the play disc** changed nothing measurable; their entries read 'same'.")
W("- **The tutor transcript** held only the status line during the 25 seconds of playback the kit waits; transcript text was not captured.")
W("- **Disabled states** were not seen on any public control.")
W()
W("### Themes")
W()
W("Gauth shows one light theme. Its stylesheets do declare dark values: TikTok's TUX theme under `[data-theme=\"dark\"]` and `.twv-container` with `prefers-color-scheme: dark`, the lesson palette under `[data-lesson-style=\"dark\"]`, and Astryx's stone theme as `light-dark()` pairs. None of them is applied on any page captured: no page sets a dark attribute, the science player pins `data-theme=\"light\"`, and every page painted the same under `prefers-color-scheme: dark` (`themeChecks` in [raw/css-vars.json](raw/css-vars.json)). There is no theme switch in the sidebar, the lesson Settings or the footer. The token file therefore ships no dark set, and the dark declarations stay in the raw file for reference.")
W()
W("### Fonts")
W()
W("- **SF Pro** is Apple's system face; Gauth declares an \"SF Pro\" family over `local()` only, so it renders as SF Pro on Apple devices and falls back elsewhere.")
W("- **Satoshi** (the science canvas's \"Canvas Print\" and \"Canvas Heading\") is from Fontshare and is not on Google Fonts; the style guide falls back to the system font.")
W("- **Rubik**, named on small Atlas labels, has no `@font-face` on the page and rendered as a fallback in the capture.")
W()
W("### Screenshots")
W()
W("- Covers, illustrations, videos and story images are Gauth's content and appear only inside screenshots and crops. The lesson canvas and the Atlas story keep moving, so two captures of the same view can differ in what the narration has drawn.")
W("- Screenshots are stored as 256-colour PNGs; read exact colours from the tokens or the raw files.")
W()
W("### Content left out")
W()
W("- Lesson content (slides, canvas drawings, formulas, narration) was not transcribed; only the frames around it were measured.")
W("- No personal data was captured: the pages were read signed out, and the Atlas drawer was empty.")

Path("components.md").write_text("\n".join(L) + "\n")
print("components.md:", len(L), "lines,", len(C), "entries,", n_crops, "crops,", len(icons), "icons")
