#!/usr/bin/env python3
"""Build components.md for the ChatGPT design reference.

Reads raw/components-computed.json (every component and state, measured in both themes),
raw/layout.json, tokens.json, screenshots/ and icons/INDEX.tsv, and writes components.md next to
them. Every value is a cell of the measurement file, condensed: colours are hex followed by the token
in the matching theme's set whose value is the same, the font family is named once per value, and a
state row shows only what differs from the first state. Dark states come first (the pages were
captured dark); the light reading of the same state follows as `light`, `light-hover` and so on.
Adapted from the Manus kit's builder.

Deterministic: re-running it on the same inputs reproduces components.md byte for byte.
Run from anywhere: python3 tools/build_components_md.py
"""
import collections, json, os, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
J = json.load(open("raw/components-computed.json"))
C = J["components"]
META = J["_meta"]
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


BY_COLOR = {"dark": {}, "light": {}}


def resolved(theme, v, depth=0):
    while isinstance(v, str) and v.startswith("{") and depth < 12:
        node = T[theme]
        for k in v[1:-1].split("."):
            node = node.get(k) if isinstance(node, dict) else None
        if node is None:
            node = T["core"]
            for k in v[1:-1].split("."):
                node = node.get(k) if isinstance(node, dict) else None
        v, depth = (node or {}).get("$value"), depth + 1
    return v


for theme in ("dark", "light"):
    for n, t in flat(T[theme]):
        if t["$type"] == "color" and not n.startswith("chatTheme.") or n.startswith("chatTheme.blue."):
            v = resolved(theme, t["$value"])
            if not isinstance(v, str) or v.startswith("{"):
                continue
            # computed styles round alpha to two places (#ffffff0a reads back as rgba(255, 255, 255, 0.04))
            key = re.sub(r"(\d+\.\d+)\)", lambda m: f"{round(float(m.group(1)), 2):g})", v)
            BY_COLOR[theme].setdefault(key, []).append(n)

# Which token a colour is named after depends on what it paints: a fill prefers the interactive and
# surface names, a border the border names, text the text names. The captured accent is blue.
PREFER = {
    "bg": ["interactive.bg-secondary-hover", "interactive.bg-secondary-selected", "surface.surface-hover", "bg.", "surface.", "component.", "interactive.bg-", "theme.", "accent.", "chatTheme.blue.", "border.", "text.", "icon."],
    "border": ["border.", "interactive.border-", "interactive.focus-ring", "surface.", "bg.", "text."],
    "text": ["text.", "icon.", "interactive.label-", "theme.", "accent.", "chatTheme.blue.", "surface.", "bg."],
    "icon": ["icon.", "text.", "interactive.icon-", "theme.", "accent."],
}


def pick(names, role):
    order = PREFER.get(role, PREFER["bg"])
    def rank(n):
        for i, pre in enumerate(order):
            if n == pre or (pre.endswith((".", "-")) and n.startswith(pre)):
                return (i, len(n), n)
        return (len(order), len(n), n)
    return sorted(names, key=rank)[0]

THEME = ["dark"]  # the theme the colour() helper looks tokens up in; set per state


def norm(r, g, b, a=None):
    if a is None or float(a) == 1:
        return "#%02x%02x%02x" % (int(r), int(g), int(b))
    return "rgba(%d, %d, %d, %g)" % (int(r), int(g), int(b), round(float(a), 2))


def _gam(x):
    return 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055


def _clamp255(v):
    return round(min(1, max(0, v)) * 255)


def oklab_rgb(L, a, b):
    l, m, s = ((L + 0.3963377774 * a + 0.2158037573 * b) ** 3, (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, (L - 0.0894841775 * a - 1.291485548 * b) ** 3)
    return [_clamp255(_gam(v)) for v in (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)]


def lab_rgb(L, a, b):
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200
    e, k = 216 / 24389, 24389 / 27
    finv = lambda t: t ** 3 if t ** 3 > e else (116 * t - 16) / k
    X, Y, Z = finv(fx) * 0.3457 / 0.3585, (fy ** 3 if L > k * e else L / k), finv(fz) * (1 - 0.3457 - 0.3585) / 0.3585
    x = 0.955473421488075 * X - 0.02309845494876471 * Y + 0.06325924320057072 * Z
    y = -0.0283697093338637 * X + 1.0099953980813041 * Y + 0.021041441191917323 * Z
    z = 0.012314014864481998 * X - 0.020507649298898964 * Y + 1.330365926242124 * Z
    return [_clamp255(_gam(v)) for v in (3.2409699419 * x - 1.5373831776 * y - 0.4986107603 * z, -0.9692436363 * x + 1.8759675015 * y + 0.0415550574 * z, 0.0556300797 * x - 0.2039769589 * y + 1.0569715142 * z)]


def unlab(c):
    """Tailwind 4 writes opacity modifiers as color-mix, which Chromium computes as lab() or oklab();
    both go back to rgb() here so they read like every other colour."""
    def f(m):
        L = float(m.group(2).rstrip("%")) * (0.01 if m.group(2).endswith("%") else 1)
        r, g, b = (oklab_rgb if m.group(1) else lab_rgb)(L, float(m.group(3)), float(m.group(4)))
        return f"rgba({r}, {g}, {b}, {m.group(5)})" if m.group(5) else f"rgb({r}, {g}, {b})"
    return re.sub(r"(ok)?lab\(([-\d.e]+%?) ([-\d.e]+) ([-\d.e]+)(?: / ([\d.]+))?\)", f, c)


def full(r):
    """rounded-full is calc(infinity * 1px), which computes to 33554400px."""
    return re.sub(r"[\d.e+]+px", lambda m: "full" if float(m.group(0)[:-2]) >= 10000 else m.group(0), r)


def colour(c, tokens=True, role="bg"):
    """rgb()/rgba()/color(srgb)/lab()/oklab() -> '#hex `token`' or 'rgba(...)'."""
    def label(v):
        if re.fullmatch(r"rgba\(\d+, \d+, \d+, 0\)", v):
            return "transparent"
        names = BY_COLOR[THEME[0]].get(v) if tokens else None
        return f"{v} `{pick(names, role)}`" if names else v

    c = unlab(c)
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
    first = f.split(",")[0].replace('"', "").strip()
    return {"-apple-system-body": "System", "-apple-system": "System", "ui-sans-serif": "System", "ui-monospace": "Mono", "OpenAI Sans": "OpenAI Sans"}.get(first, first)


def num(x):
    return re.sub(r"(\d+\.\d\d)\d+", r"\1", str(x))


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
            bds.append(f"{s[f'border{d}Width']} {s[f'border{d}Style']} {colour(s[f'border{d}Color'], role='border')}")
        else:
            bds.append("none")
    if any(b != "none" for b in bds):
        o["border"] = bds[0] if len(set(bds)) == 1 else "; ".join(f"{'TRBL'[i]}: {b}" for i, b in enumerate(bds) if b != "none")
    rad = full(sides(s["borderTopLeftRadius"], s["borderTopRightRadius"], s["borderBottomRightRadius"], s["borderBottomLeftRadius"]))
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
    if s.get("backdropFilter", "none") != "none":
        o["backdrop"] = s["backdropFilter"]
    if s["outlineStyle"] != "none" and float(s["outlineWidth"].replace("px", "")) > 0:
        o["outline"] = f"{s['outlineWidth']} {s['outlineStyle']} {colour(s['outlineColor'], role='border')}, offset {s['outlineOffset']}"
    t = v.get("textStyle")
    if t:
        o["text"] = f"{font(t['fontSize'], t['lineHeight'], t['fontWeight'], t['fontFamily'])}, {colour(t['color'], role='text')}"
    elif v.get("text"):
        o["text"] = f"{font(s['fontSize'], s['lineHeight'], s['fontWeight'], s['fontFamily'])}, {colour(s['color'], role='text')}"
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
            o["transition"] = ", ".join(parts) if len(parts) < 4 else f"{parts[0].split(' ')[0]} and {len(parts) - 1} more {' '.join(parts[0].split(' ')[1:])}"
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
    ic = v.get("icon")
    if ic and ic.get("w", 0) > 0 and ic["w"] < 120:
        o["icon"] = f"{num(ic['w'])} x {num(ic['h'])}, {colour(ic.get('color') or ic.get('stroke') or ic.get('fill'), role='icon')}"
    if v.get("placeholder"):
        o["placeholder"] = colour(v["placeholder"]["color"], role="text")
    return o


ORDER = ["size", "padding", "border", "radius", "background", "image", "shadow", "backdrop", "outline", "text", "transition", "transform", "opacity", "icon", "placeholder"]


def state_rows(c):
    """Dark states first, then light. Each theme has its own base row (the first state of that
    theme), later rows of the same theme list only what changed."""
    rows = []
    for theme in ("dark", "light"):
        states = [s for s, v in c["states"].items() if "style" in v and v.get("theme") == theme]
        if not states:
            continue
        THEME[0] = theme
        base = props(c["states"][states[0]])
        trows = [(states[0], base)]
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
            if trows[-1][0] != states[0] and trows[-1][1] == diff:
                trows[-1] = (trows[-1][0] + ", " + st, diff)
            else:
                trows.append((st, diff))
        if same:
            trows[0] = (f"{states[0]} (same: {', '.join(same)})", base)
        rows += trows
    return rows


def fmt(d):
    return "; ".join(f"{k} {d[k]}" for k in ORDER if k in d).replace("|", "/")


def child_layers(c):
    st = next((s for s in c["states"].values() if "style" in s and s.get("theme") == "dark"), None)
    if not st or not st.get("paint"):
        return None
    s = st["style"]
    if s["backgroundColor"] != "rgba(0, 0, 0, 0)" or s["boxShadow"] != "none" or s["borderTopWidth"] != "0px" or s["backgroundImage"] != "none":
        return None
    THEME[0] = "dark"
    out = []
    for p in st["paint"][:3]:
        bits = [re.sub(r"\..*$", "", p["node"]) if "::" not in p["node"] else p["node"].split(".")[0], p["size"].replace(".0x", "x").replace(".0", "")]
        if p.get("bg"):
            bits.append("background " + colour(p["bg"]))
        if p.get("border"):
            bits.append("border " + colour(p["border"].split(" | ")[0][2:], role="border"))
        if p.get("radius"):
            bits.append("radius " + full(p["radius"]))
        if p.get("shadow"):
            bits.append("shadow " + colour(p["shadow"]))
        out.append(" ".join(bits))
    return "; ".join(out).replace("|", "/")


# --------------------------------------------------------------------------- page and group text

GROUP_INTRO = {
    "Sidebar": "The 260px sidebar every page shares (`#stage-slideover-sidebar`): a 52px header with the wordmark, search and close, the nav rows (New chat, Images, Library, Scheduled, Plugins, Codex, More), then three collapsible sections, Pinned, Projects and Chats, and the account row with its Upgrade pill pinned at the bottom. Every row is a `.__menu-item`, 36 tall with radius 10, whose fills come from inline `--menu-item-*` variables. Closing it leaves the 52px tiny rail.",
    "Top bar": "The 52px page header: on the home and a project, the Chat / Work segmented toggle in the middle and Upgrade and the temporary-chat button at the end; in a thread, Upgrade, Share and the conversation options.",
    "Home": "The new-chat page: one heading centred over the composer, then three suggestion rows.",
    "Composer": "The composer shared by the home, a thread, a project and Images: a 768 wide pill (radius 28) with the + button, the ProseMirror field, the Think chip, dictation and the voice button, which becomes send once there is text. On a phone it takes two rows.",
    "Thread": "A conversation: the user bubble in the accent colour, the \"Worked for\" disclosure, the assistant's markdown (paragraphs, headings, strong, tables, citation pills), widgets, and the actions under a turn.",
    "Menus": "The popovers: the composer's + menu, the chat row menu, the user menu, the accent listbox and the phone's model menu. All are `.popover` on #353535 in dark (white in light), radius 20 (16 for the listbox), with 36 tall `.__menu-item` rows.",
    "Search": "The search dialog the sidebar's search button opens: an input row and recent chats.",
    "Settings": "The settings dialog: a close button, a search field and a left nav of tabs, then the General pane of rows with select buttons and a toggle.",
    "Library": "The file library: a title with filter, grid and list buttons, search and the New button, pill tabs, then a list of files with a type tile or thumbnail and the last activity.",
    "Images": "The Images page: a title, the composer, Trending and Templates tabs, and tall template cards.",
    "Plugins": "The plugin gallery: a title and subtitle, search and an add button, then sections of two-column plugin rows.",
    "Project": "A project page: the icon and title, Share and details, the composer, Chats and Sources tabs, and the project's chats with a preview line and date.",
    "Mobile": "The same app at 390 wide: the header with the menu button and model switcher, the two-row composer, the drawer and the user bubble.",
}

PAGE_DESC = [
    ("home", "Home. The heading, composer and suggestion rows. Captured at rest, with the + menu, a chat row's menu, the user menu and the search dialog open, with a line typed in the composer, and with the sidebar collapsed.", "/"),
    ("thread", "A thread (a conversation about hikes, the owner's own). Captured at the table answer, at the user turn with the \"Worked for\" disclosure and the map widget, and at the bottom.", "/c/<id>"),
    ("library", "Library, list view, Suggested tab.", "/library"),
    ("images", "Images, Trending tab.", "/images"),
    ("plugins", "Plugins.", "/plugins"),
    ("project", "A project page (Research), Chats tab.", "/g/<project>/project"),
    ("settings", "Settings dialog, General pane, at rest and with the accent colour listbox open.", "/#settings"),
]
MOBILE_DESC = [
    ("mobile-home", "Home at 390, and the drawer.", "/"),
    ("mobile-thread", "The thread at 390, and the model menu.", "/c/<id>"),
]


L = []


def W(s=""):
    L.append(s)


shots = sorted(p.name for p in Path("screenshots").glob("*.png"))


def links(prefix):
    out = []
    for f in shots:
        m = re.fullmatch(re.escape(prefix) + r"-(dark|light)-(.+)\.png", f)
        if m:
            out.append(f"[{m.group(2)} ({m.group(1)})](screenshots/{f})")
        elif re.fullmatch(re.escape(prefix) + r"-(dark|light)\.png", f):
            out.append(f"[default ({f.split('-')[-1][:-4]})](screenshots/{f})")
    return ", ".join(out)


n_crops = len(list(Path("components/crops").glob("*.png")))
n_states = sum(len(c["states"]) for c in C.values())
icons = [r.split("\t") for r in open("icons/INDEX.tsv").read().strip().split("\n")[1:]]

n_crops = len(list(Path("components/crops").glob("*.png")))
n_states = sum(len(c["states"]) for c in C.values())
icons = [r.split("\t") for r in open("icons/INDEX.tsv").read().strip().split("\n") if not r.startswith("#")][1:]

W("# ChatGPT components")
W()
W(f"The discovery list of every page and state captured, then one entry per component with crops of the real product, the shared values, the icon index and the Gaps. Captured from chatgpt.com on {META['read']}, signed in to the owner's account (Free plan, dark theme, blue accent), as static copies of each page state rendered in headless Chromium at 1440 x 900 (the Mobile group at 390 x 844), with computed styles read from the rendered copy in both themes. Nothing was sent, created or deleted in the account; the only changes were opening menus and closing them, typing a line into the composer and deleting it, and collapsing the sidebar and reopening it.")
W()
W(f"The full per-state readings are in [raw/measurements.md](raw/measurements.md), with the machine-readable copy in [raw/components-computed.json](raw/components-computed.json) ({len(C)} components, {n_states} states). The page layouts are described in [raw/pages.md](raw/pages.md).")
W()
W("How to read an entry:")
W()
W("- A colour is its value followed by the token in [tokens.json](tokens.json) whose value in that theme is the same, when there is one. Text is written family size/line-height weight, then its colour, for example `System 14/20 400, #ffffff`, and is read from the first text node inside the component. System is the `-apple-system-body` stack.")
W("- Dark states come first (every page was captured dark), then the same states read in light. Each theme's first row lists every value; later rows of that theme list only what changes. A state with the same values as its theme's first is named in that label, for example \"default (same: focus-visible)\". When the root paints nothing, \"Child layers\" names the first nodes inside it that do.")
W(f"- Crops are images of the component from the rendered copy, in [components/crops/](components/crops) ({n_crops} files, named `{{component}}-{{state}}.png`, at 2x). Screenshots are in [screenshots/](screenshots).")
W()
W("## Discovery list")
W()
W("Screenshots are named `{page}-{theme}-{state}.png`. Desktop shots are 1440 x 900 at 2x; `-full` shots are whole pages at 2x, kept for the home, Library and Plugins; mobile shots are `mobile-{page}-{theme}-{state}.png`, 390 x 844 at 2x. Every state exists in both themes.")
W()
W("| Surface | URL | Screenshots |")
W("|---|---|---|")
for p, desc, url in PAGE_DESC + MOBILE_DESC:
    W(f"| {desc} | `{url}` | {links(p)} |")
W()
W("### Overlays and transient states")
W()
W("| State | Where | How it was reached | Captured |")
W("|---|---|---|---|")
OVER = [
    ("Composer + menu", "home", "the composer's + button", "[home-dark-plus-menu](screenshots/home-dark-plus-menu.png), [plus-menu](#plus-menu)"),
    ("Composer with text", "home", "a line typed, then deleted", "[home-dark-composer-typed](screenshots/home-dark-composer-typed.png), [send-button](#send-button)"),
    ("Chat row menu", "home", "the options button on a hovered history row", "[home-dark-chat-menu](screenshots/home-dark-chat-menu.png), [chat-menu](#chat-menu)"),
    ("User menu", "home", "the account row", "[home-dark-user-menu](screenshots/home-dark-user-menu.png), [user-menu](#user-menu)"),
    ("Search dialog", "home", "the sidebar's search button", "[home-dark-search](screenshots/home-dark-search.png), [search-dialog](#search-dialog)"),
    ("Collapsed sidebar", "home", "the close-sidebar button, then reopened", "[home-dark-sidebar-collapsed](screenshots/home-dark-sidebar-collapsed.png), [sidebar-rail](#sidebar-rail)"),
    ("Settings dialog", "home", "Settings in the user menu; closed with Escape", "[settings-dark-general](screenshots/settings-dark-general.png), [settings-dialog](#settings-dialog)"),
    ("Accent colour listbox", "settings", "the Accent color select; closed with Escape, nothing chosen", "[settings-dark-accent-menu](screenshots/settings-dark-accent-menu.png), [accent-menu](#accent-menu)"),
    ("Phone drawer", "home at 390", "the menu button", "[mobile-home-dark-drawer](screenshots/mobile-home-dark-drawer.png), [m-drawer](#m-drawer)"),
    ("Phone model menu", "thread at 390", "the model switcher", "[mobile-thread-dark-model-menu](screenshots/mobile-thread-dark-model-menu.png), [model-menu](#model-menu)"),
]
for row in OVER:
    W("| " + " | ".join(row) + " |")
W()


# --------------------------------------------------------------------------- shared values

W("## Shared values")
W()
W("Values that apply across entries, tallied from the measurement file.")
W()
radii = collections.Counter()
trans = collections.Counter()
hover_dark = collections.Counter()
hover_light = collections.Counter()
focus = {"dark": collections.Counter(), "light": collections.Counter()}
focus_n = {"dark": 0, "light": 0}
for cid, c in C.items():
    for sname, s in c["states"].items():
        if "style" not in s:
            continue
        st = s["style"]
        r = full(st["borderTopLeftRadius"])
        if r != "0px" and s["rect"]["w"] > 4:
            radii[r] += 1
        if st["transitionDuration"] not in ("0s", ""):
            # the first duration and the first timing function; a cubic-bezier() carries commas of its own
            tf = re.findall(r"cubic-bezier\([^)]*\)|steps\([^)]*\)|[a-z-]+", st["transitionTimingFunction"])
            trans[f"{st['transitionDuration'].split(',')[0].strip()} {tf[0] if tf else st['transitionTimingFunction']}"] += 1
        if sname.endswith("focus-visible"):
            th = s["theme"]
            focus_n[th] += 1
            if st["outlineStyle"] != "none" and float(st["outlineWidth"].replace("px", "")) > 0:
                THEME[0] = th
                focus[th][f"{st['outlineWidth']} {st['outlineStyle']} {colour(st['outlineColor'], role='border')} offset {st['outlineOffset']}"] += 1
            else:
                focus[th]["no ring on the element"] += 1
for cid, c in C.items():
    for th, base, hov, ctr in (("dark", "default", "hover", hover_dark), ("light", "light", "light-hover", hover_light)):
        a, b = c["states"].get(base), c["states"].get(hov)
        if not a or not b or "style" not in a or "style" not in b:
            continue
        THEME[0] = th
        if a["style"]["backgroundColor"] != b["style"]["backgroundColor"]:
            ctr[f"{colour(a['style']['backgroundColor'])} to {colour(b['style']['backgroundColor'])}"] += 1
        elif a["style"]["color"] != b["style"]["color"]:
            ctr[f"text {colour(a['style']['color'], role='text')} to {colour(b['style']['color'], role='text')}"] += 1
        elif a["style"]["opacity"] != b["style"]["opacity"]:
            ctr[f"opacity {a['style']['opacity']} to {b['style']['opacity']}"] += 1
        else:
            ctr["no change on the element"] += 1


def top(ctr, n):
    return ", ".join(f"{k} ({v})" for k, v in ctr.most_common(n))


W(f"**Radius.** {top(radii, 10)}. Rows and settings tabs are 10, controls (icon buttons, Share, the header Upgrade, select buttons) 8, menu items 12, popovers 20, dialogs and the accent listbox 16, the composer 28 (26 on a phone), the user bubble 22. Pills, round buttons, the mode toggle, tabs, search fields and the toggle track are fully round (`rounded-full`, read as `full`).")
W()
W(f"**Hover.** ChatGPT hovers with a translucent fill. Dark: {top(hover_dark, 6)}. Light: {top(hover_light, 6)}. The row fill is `interactive.bg-secondary-hover` (white at 10% in dark, black at 5% in light) and the current page or chat rests on `interactive.bg-secondary-selected`, the same value, so a current row does not change on hover. Icon buttons in the sidebar use `surface.surface-hover` (white at 15%, black at 7%). Menu items show no hover here: Radix highlights them with `data-highlighted`, which its script sets, so only the captured highlighted row is filled.")
W()
W(f"**Focus.** Of {focus_n['dark']} elements given a real keyboard focus in dark: {top(focus['dark'], 6)}. In light: {top(focus['light'], 6)}. With scripts gone the `keyboard-focused:` rings ChatGPT draws do not switch on, so most focused states show the browser's own outline (`auto`, the platform blue), and a few controls show their own ring: the settings toggle a 2px gap and a 4px ring in `interactive.border-focus`, the project tabs a 3px ring in the text colour, the settings tabs a 1px outline offset 2.")
W()
W(f"**Motion.** {top(trans, 6)}. Nearly every transition is Tailwind's `transition-colors` at 150 ms on cubic-bezier(0.4, 0, 0.2, 1) (`duration.default`, `easing.default`); larger moves (the sidebar, popovers, page transitions) use the spring curves listed under the core set's notTokenised, at 667 ms and up. The code block's full-screen view cross-fades at 220 ms ease-out.")
W()
W("**Layout grid.** The sidebar is 260 wide (the rail 52), the page header 52 tall, and the composer and thread share one 768 wide centred column (x 466 at 1440 with the sidebar open). Images, Plugins and the project page sit in an 800 wide `max-w-app-content` box with 16 padding; the Library uses a wider 1092 column. On a phone the sidebar is a 260 wide drawer over the page and the column is 358 wide at x 16. The numbers per page are in [raw/pages.md](raw/pages.md).")
W()
W("**Accent.** The account's accent (blue) paints only the user bubble (`chatTheme.blue.user-msg-bg`, #173e76 dark, #e8f3fe light), the voice and send button (`chatTheme.blue.submit-btn-bg`), the Work segment, the header Upgrade, the toggle and selection. Everything else is grey, which is why the eight accents in [tokens.json](tokens.json) differ only in the `chatTheme` group.")
W()


# --------------------------------------------------------------------------- components

W("## Components")
W()
groups = collections.OrderedDict()
for cid, c in C.items():
    groups.setdefault(c["group"], []).append(cid)
for g, ids in groups.items():
    W(f"### {g}")
    W()
    if g in GROUP_INTRO:
        W(GROUP_INTRO[g])
        W()
    for cid in ids:
        c = C[cid]
        W(f"#### {c['title']}")
        W()
        W(f"<a id=\"{cid}\"></a>`{cid}`, on {', '.join(c.get('pages') or [c['page']])}. {c.get('desc', '')}".rstrip())
        W()
        crops = []
        for sname in ("default", "hover", "light", "light-hover", "active", "selected", "checked", "open", "typed", "focus-visible"):
            s = c["states"].get(sname)
            if s and s.get("crop") and Path(s["crop"]).exists():
                crops.append(f'<img src="{s["crop"]}" alt="{c["title"]}, {sname}" height="{min(120, max(24, round(s["rect"]["h"])))}"> ')
        if crops:
            W("".join(crops))
            W()
        rows = state_rows(c)
        if rows:
            W("| State | Values |")
            W("|---|---|")
            for name, d in rows:
                W(f"| {name} | {fmt(d)} |")
            W()
        cl = child_layers(c)
        if cl:
            W(f"Child layers: {cl}")
            W()
        vars_ = next((s.get("vars") for s in c["states"].values() if s.get("vars")), None)
        if vars_:
            W("Tokens named in its classes: " + ", ".join(f"`{k}`" for k in sorted(vars_)) + ".")
            W()

# --------------------------------------------------------------------------- icons

# --------------------------------------------------------------------------- icons

W("## Icon index")
W()
W(f"{len(icons)} icons were lifted from the sprite symbols inlined in the page copies into [icons/](icons), named by their sprite id; the ones whose id is a content hash are named from the label of the control they sit in, with the hash kept. [icons/INDEX.tsv](icons/INDEX.tsv) lists each file's sprite id, viewBox, the sizes it was drawn at, how often and where. ChatGPT draws them through `<use href=\"sprites-core-*.svg#name\">` at 20px (`icon`), 16px (`icon-sm`) or 12px, filled in currentColor. A few glyphs are inline SVG rather than sprite symbols (the Think chip's brain, the mode toggle's sparkle, the composer's voice wave) and are not in the folder. The icons are OpenAI's property, kept for reference only.")
W()
W("| Icon | Sizes | Where it was used |")
W("|---|---|---|")
for r in icons:
    W(f"| `{r[0].replace('.svg', '')}` | {r[3]} | {(r[6] if len(r) > 6 and r[6] else '-')[:60].replace('|', '/')} |")
W()

# --------------------------------------------------------------------------- gaps

W("## Gaps")
W()
W("- The copies were taken in the built-in browser pane while it was hidden, so no animation frame ran: entrance animations froze where they started. Modal backdrops render undimmed (the settings dialog's blur is there, its dim is not), the phone drawer's slide-in transform was set to its end state by hand before the copy, and the collapsed sidebar kept its 260 wide container (its width is driven by script frames) with the 52 wide rail drawn inside it, so the main column did not move.")
W("- The thread is a virtualised list. Only the last turns were rendered (turns 1 to 5 of the conversation are empty placeholders), so there is no shot of the top of a thread and no first-turn spacing.")
W("- The map widget in the thread is an iframe, kept as a same-size dark box; its frame is real, its contents are not. Lazy template thumbnails on Images were never requested, so only the first card has its picture.")
W("- No code block appeared in any of the account's threads. Its look in the style guide comes from the code-block CSS only (`--code-block-surface`, the fade timings), not from a measured element.")
W("- Hover and focus on the 390 wide copies were not measured (a phone has neither). Radix menu items highlight through script, so their hover is not measured either; the + menu's highlighted row is the captured state.")
W("- The light theme was read by removing every `dark` class from the copies (ChatGPT also puts `dark` on each message's markdown body), not by changing the account's appearance. Every colour is a var() of the two palette blocks, so the readings match what Light shows, but anything ChatGPT swaps per theme through script would not have swapped. The accent was only ever blue in the copies; the other seven come from the CSS, read with `data-chat-theme` set on the probe page.")
W("- Not captured: a streaming answer, voice mode, the Work mode, Codex, Scheduled, the Library's grid view and folders, the image editor, a plugin's detail page, the share dialog, and the Account, Billing and Data controls settings panes, since each either sends something, spends quota or shows account details.")
W()

open("components.md", "w").write("\n".join(L) + "\n")
print(f"components.md: {len(C)} components, {n_states} states, {n_crops} crops, {len(L)} lines")

