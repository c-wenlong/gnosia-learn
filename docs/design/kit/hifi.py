#!/usr/bin/env python3
"""Hi-fi kit for the gnosia redesign, rendered into OpenPencil via its MCP.

Usage: hifi.py [--theme light|dark] [--variables] [slug ...]
Draws every screen in both themes onto the "Hi-fi v1" page of the open
gnosia document, exports each as docs/design/hifi/<slug>-<theme>.svg
and saves the .fig. A full run (no slugs) also rewrites the token set
into the document as two OpenPencil variable collections (one per theme);
--variables forces that on a partial run.

Set OPENPENCIL_DOC to the tab id (see `op.py call list_documents '{}'`)
when more than one document is open.

The values come from the three captured references under
docs/design/reference/: Brilliant for the base palette, type, cards and the
3D pill button; NotebookLM for the workspace shell and chat; Duolingo for
the path node, streak calendar, target bar, feedback footer and stat tiles.
DESIGN.md's "Hi-fi tokens" section says which value came from where.
"""
import json, os, sys

SP = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(SP, "..", "..", ".."))
OUT = os.path.join(REPO, "docs/design/hifi")
PAGE = "Hi-fi v1"
DOC = os.environ.get("OPENPENCIL_DOC")
src = open(os.path.join(SP, "op.py")).read().replace("main()\n", "")
ns = {"__file__": os.path.join(SP, "op.py")}; exec(src, ns)
SID = ns["session"]()

def call(name, args):
    if DOC: args = {**args, "document_id": DOC}
    r, _ = ns["post"]({"jsonrpc": "2.0", "id": 9, "method": "tools/call",
                       "params": {"name": name, "arguments": args}}, SID)
    res = r.get("result", r)
    txt = "".join(c.get("text", "") for c in res.get("content", []))
    try: return json.loads(txt)
    except Exception: return {"raw": txt}

# ---------- tokens ----------
# Each entry: light value, dark value, source. Sources name the reference
# token; "derived" means a value we made from a reference one.
TOKENS = {
    "page":        ("#F8F8F8", "#141414", "brilliant bg.secondary / bg.primary"),
    "surface":     ("#FFFFFF", "#1E1E1E", "brilliant bg.primary / bg.elevated"),
    "surface2":    ("#F3F3F3", "#292929", "derived: one step off surface"),
    "tint":        ("#EEF1FF", "#232A4A", "derived from accent, after notebooklm surface.selected"),
    "border":      ("#E5E5E5", "#4C4C4C", "brilliant border.solid"),
    "hair":        ("#EBEBEB", "#333333", "derived hairline"),
    "text":        ("#000000", "#FFFFFF", "brilliant text.primary"),
    "text2":       ("#666666", "#A3A3A3", "brilliant text.secondary, alpha flattened"),
    "text3":       ("#999999", "#7A7A7A", "brilliant text.tertiary, alpha flattened"),
    "accent":      ("#456DFF", "#456DFF", "brilliant bg.blue-primary"),
    "accent_text": ("#294BC6", "#7491FF", "brilliant text.blue-primary"),
    "ok":          ("#29CC57", "#29CC57", "brilliant bg.green-primary"),
    "ok_lip":      ("#15B441", "#15B441", "brilliant green.600"),
    "ok_text":     ("#009B2B", "#5ED981", "brilliant text.green-primary"),
    "ok_tint":     ("#E6F8EC", "#17331F", "derived tint of ok"),
    "warn":        ("#F7C325", "#F9D25C", "brilliant bg.warning-primary"),
    "warn_lip":    ("#B78900", "#B78900", "brilliant yellow.700"),
    "warn_text":   ("#B78900", "#F9D25C", "brilliant text.warning-primary"),
    "warn_tint":   ("#FFF5D6", "#33300F", "derived tint of warn"),
    "danger":      ("#C43939", "#FF8585", "brilliant text.danger-primary"),
    "streak":      ("#FF9600", "#FFAB33", "duolingo fox"),
    "btn_face":    ("#111111", "#E5E5E5", "brilliant button3d primary-face"),
    "btn_lip":     ("#000000", "#B3B3B3", "brilliant shadowColor.cta-default"),
    "btn_text":    ("#FFFFFF", "#000000", "brilliant button3d primary label"),
    "m_hi":        ("#456DFF", "#7491FF", "mastered: accent"),
    "m_mid":       ("#A9B9FF", "#3A4A8F", "learning: derived light accent"),
    "m_lo":        ("#E5E5E5", "#4C4C4C", "untouched: border"),
    "lip_shade":   ("#D4D4D4", "#0F0F0F", "derived: path-node lip, after duolingo black@20%"),
}
UI = "Figtree"      # brilliant: CoFo Brilliant, Figtree is the reference's own fallback
DISPLAY = "Georgia" # brilliant: CoFo Robert, Georgia is the reference's own fallback

class Theme(dict):
    def __getattr__(self, k): return self[k]

def theme(name):
    i = 0 if name == "light" else 1
    return Theme({k: v[i] for k, v in TOKENS.items()}, name=name)

# ---------- JSX builders ----------
def attrs(**kw):
    out = []
    for k, v in kw.items():
        if v is None: continue
        if isinstance(v, bool):
            if v: out.append(k)
        elif isinstance(v, (int, float)): out.append(f"{k}={{{v}}}")
        else: out.append(f'{k}="{v}"')
    return " ".join(out)

def F(*children, name=None, flex="col", w=None, h=None, gap=None, p=None, px=None, py=None, bg=None, stroke=None,
      strokeWidth=None, rounded=None, justify=None, items=None, grow=None, opacity=None, overflow=None):
    a = attrs(name=name, flex=flex, w=w, h=h, gap=gap, p=p, px=px, py=py, bg=bg, stroke=stroke, strokeWidth=strokeWidth,
              rounded=rounded, justify=justify, items=items, grow=grow, opacity=opacity, overflow=overflow)
    return f"<Frame {a}>" + "".join(children) + "</Frame>"

def esc(s): return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def T(text, size=14, color=None, weight=None, w=None, align=None, grow=None, font=None, lh=None, ls=None):
    a = attrs(size=size, color=color, weight=weight, w=w, textAlign=align, font=font or UI, lineHeight=lh, letterSpacing=ls)
    node = f"<Text {a}>{esc(text)}</Text>"
    if grow: return F(node, flex="row", grow=grow, items="center")
    return node

def R(w, h, bg, rounded=4, stroke=None):
    return f"<Rectangle {attrs(w=w, h=h, bg=bg, rounded=rounded, stroke=stroke)} />"

def Dot(d, bg, stroke=None, strokeWidth=None):
    return f"<Ellipse {attrs(w=d, h=d, bg=bg, stroke=stroke, strokeWidth=strokeWidth)} />"

def Spacer(): return F(grow=1)

def Row(*ch, gap=10, w="fill", h=None, grow=None, items="center", justify=None, p=None, px=None, py=None, bg=None, stroke=None, strokeWidth=None, rounded=None, overflow=None):
    return F(*ch, flex="row", w=w, h=h, grow=grow, gap=gap, items=items, justify=justify, p=p, px=px, py=py, bg=bg, stroke=stroke, strokeWidth=strokeWidth, rounded=rounded, overflow=overflow)

def Col(*ch, gap=10, w="fill", h=None, grow=None, vgrow=None, p=None, px=None, py=None, bg=None, stroke=None, strokeWidth=None, rounded=None, items=None, justify=None, overflow=None):
    if grow and w == "fill": w = None
    if vgrow: grow = 1
    return F(*ch, flex="col", w=w, h=h, grow=grow, gap=gap, p=p, px=px, py=py, bg=bg, stroke=stroke, strokeWidth=strokeWidth, rounded=rounded, items=items, justify=justify, overflow=overflow)

def wrap(text, width, size):
    """Break text into lines that fit `width` px at `size` (Figtree averages ~0.52em per glyph)."""
    per = max(8, int(width / (size * 0.52)))
    words, lines, cur = text.split(), [], ""
    for wd in words:
        if cur and len(cur) + 1 + len(wd) > per: lines.append(cur); cur = wd
        else: cur = (cur + " " + wd).strip()
    if cur: lines.append(cur)
    return lines

def P(text, width, size=15, color=None, lh=None, weight=None, font=None):
    return Col(*[T(l, size=size, color=color, lh=lh, weight=weight, font=font) for l in wrap(text, width, size)], gap=2, w=None)

# ---------- components (themed) ----------
def Eyebrow(t, text):
    return T(text.upper(), size=11, weight="bold", color=t.text3, ls=0.6)

def HR(t): return R("fill", 1, t.hair, rounded=0)

def Btn(t, label, kind="primary", small=False, w=None):
    """kind: primary (3D pill), secondary (outline pill), ghost (text), ok, warn, accent."""
    h = 36 if small else 44
    size = 13 if small else 15
    rad = h // 2
    if kind == "ghost":
        return F(T(label, size=size, weight="semibold", color=t.accent_text), flex="row", h=h, px=8, items="center")
    if kind == "secondary":
        return F(T(label, size=size, weight="semibold", color=t.text), flex="row", w=w, h=h, px=18 if small else 22,
                 justify="center", items="center", bg=t.surface, stroke=t.border, strokeWidth=2, rounded=rad)
    face, lip, col = {"primary": (t.btn_face, t.btn_lip, t.btn_text), "ok": (t.ok, t.ok_lip, "#FFFFFF" if t.name == "light" else "#0B2E14"),
                      "warn": (t.warn, t.warn_lip, "#5C4400"), "accent": (t.accent, "#2E4FD1", "#FFFFFF")}[kind]
    inner = F(T(label, size=size, weight="semibold", color=col), flex="row", w="fill" if w else None, h=h, px=18 if small else 24,
              justify="center", items="center", bg=face, rounded=rad)
    return F(inner, flex="col", w=w, h=h + 4, bg=lip, rounded=rad + 2, items="start")

def Chip(t, label, active=False, small=False):
    h = 28 if small else 34
    return F(T(label, size=12 if small else 13, weight="medium", color="#FFFFFF" if active else t.text), flex="row", h=h, px=10 if small else 14,
             items="center", bg=t.accent if active else t.surface, stroke=None if active else t.border, strokeWidth=None if active else 1, rounded=h // 2)

def Cite(t, n, label):
    return F(F(T(str(n), size=11, weight="bold", color=t.text2), flex="row", w=20, h=20, justify="center", items="center", bg=t.surface2, rounded=10),
             T(label, size=12, color=t.text2), flex="row", h=26, px=4, gap=6, items="center", bg=t.surface, stroke=t.border, strokeWidth=1, rounded=13)

def Pill(t, label, dot=None):
    return F(Dot(10, dot) if dot else "", T(label, size=13, weight="semibold", color=t.text), flex="row", h=36, px=14, gap=8, items="center",
             bg=t.surface, stroke=t.border, strokeWidth=2, rounded=18)

def Card(t, *children, title=None, action=None, w="fill", h=None, grow=None, gap=12, p=20, bg=None, tight=False):
    if grow and w == "fill": w = None
    head = []
    if title:
        head.append(Row(T(title, size=16, weight="bold", color=t.text, grow=1), T(action, size=13, weight="medium", color=t.accent_text) if action else ""))
    return F(*head, *children, flex="col", w=w, h=h, grow=grow, gap=gap, p=14 if tight else p, bg=bg or t.surface, stroke=t.border, strokeWidth=2, rounded=20)

def Panel(t, *children, w=None, h="fill", grow=None, p=16, gap=12):
    """NotebookLM panel: surface, radius 16, no border."""
    return F(*children, flex="col", w=w, h=h, grow=grow, gap=gap, p=p, bg=t.surface, rounded=16)

def Placeholder(t, label, w="fill", h=120):
    lines = [T(l.strip(), size=12, color=t.text3) for l in label.split("|")]
    return F(*lines, flex="col", w=w, h=h, gap=4, justify="center", items="center", bg=t.surface2, rounded=12)

def Bar(t, pct, w="fill", h=8, fg=None):
    return F(R(f"{int(pct)}%", h, fg or t.accent, rounded=h // 2), flex="row", w=w, h=h, bg=t.border, rounded=h // 2)

def BarFixed(t, fill_px, total=200, h=8, fg=None):
    return F(R(fill_px, h, fg or t.accent, rounded=h // 2), flex="row", w=total, h=h, bg=t.border, rounded=h // 2)

def TargetBar(t, label, pct, w="fill"):
    """Duolingo goal bar: 20px track, label centred, drawn once here over the track."""
    return Row(F(R(f"{int(pct)}%", 20, t.accent, rounded=10), flex="row", grow=1, h=20, bg=t.border, rounded=10),
               T(label, size=13, weight="bold", color=t.text), gap=12, w=w)

def Mastery(t, level, d=14):
    if level == "mastered": return Dot(d, t.m_hi)
    if level == "learning": return Dot(d, t.m_mid, stroke=t.m_hi, strokeWidth=2)
    return Dot(d, t.surface, stroke=t.m_lo, strokeWidth=2)

def MasteryLabel(t, level, pl=None):
    txt = {"mastered": "Mastered", "learning": "Learning", "untouched": "Not started"}[level]
    return T(f"{txt} · p(L) {pl}" if pl else txt, size=12, color=t.text2)

def Input(t, placeholder, w="fill", h=44, pill=False):
    return F(T(placeholder, size=14, color=t.text3), flex="row", w=w, h=h, px=14, items="center", bg=t.surface, stroke=t.border, strokeWidth=2, rounded=h // 2 if pill else 8)

def Option(t, label, state=None, key=None):
    """Choice row: default, selected, correct, wrong (duolingo colours mapped onto brilliant tokens)."""
    bg, stroke, col = t.surface, t.border, t.text
    tag = ""
    if state == "selected": bg, stroke = t.tint, t.accent
    if state == "correct": bg, stroke, col = t.ok_tint, t.ok_text, t.ok_text; tag = T("correct answer", size=12, weight="medium", color=t.ok_text)
    if state == "wrong": bg, stroke, col = t.warn_tint, t.warn_text, t.warn_text; tag = T("your answer", size=12, weight="medium", color=t.warn_text)
    keybox = F(T(key, size=12, weight="bold", color=t.text3), flex="row", w=26, h=26, justify="center", items="center", stroke=t.border, strokeWidth=2, rounded=6) if key else ""
    return Row(keybox, T(label, size=15, weight="medium", color=col, grow=1), tag, gap=12, h=56, px=14, bg=bg, stroke=stroke, strokeWidth=2, rounded=12)

def Feedback(t, ok, title, detail, note, continue_label):
    """Duolingo footer: tinted bar, icon circle, title, ghost Why, coloured 3D continue."""
    tint, col = (t.ok_tint, t.ok_text) if ok else (t.warn_tint, t.warn_text)
    icon = F(T("✓" if ok else "!", size=20, weight="bold", color="#FFFFFF"), flex="row", w=44, h=44, justify="center", items="center", bg=t.ok if ok else t.warn, rounded=22)
    return Row(icon, Col(T(title, size=18, weight="bold", color=col), T(detail, size=13, color=col), T(note, size=12, color=t.text2), gap=3, grow=1),
               Btn(t, "Why?", "ghost"), Btn(t, "Ask the tutor", "ghost"), Btn(t, continue_label, "ok" if ok else "warn"),
               gap=16, p=18, bg=tint, rounded=16)

def StatTile(t, value, label, colour):
    """Duolingo lesson-complete card: coloured frame, uppercase strip, value box."""
    strip = F(T(label.upper(), size=11, weight="bold", color=t.btn_text, ls=0.5), flex="row", w="fill", h=26, justify="center", items="center")
    box = F(T(value, size=26, weight="bold", color=t.text), flex="row", w="fill", h=64, justify="center", items="center", bg=t.surface, rounded=13)
    return F(strip, box, flex="col", grow=1, gap=0, p=3, bg=colour, rounded=16)

def Rating(t, label, interval):
    return Col(T(label, size=15, weight="bold", color=t.text), T(interval, size=12, color=t.text3), gap=4, items="center", grow=1, py=14, bg=t.surface, stroke=t.border, strokeWidth=2, rounded=16)

def PathNode(t, level, active=False):
    fill = {"mastered": t.m_hi, "learning": t.m_mid, "untouched": t.m_lo}[level]
    face = F(Dot(14, "#FFFFFF" if level != "untouched" else t.text3), flex="row", w=56, h=56, justify="center", items="center", bg=fill, rounded=28)
    node = F(face, flex="col", w=56, h=62, bg=t.lip_shade if level == "untouched" else ("#2E4FD1" if level == "mastered" else "#7E93E6"), rounded=28, items="start")
    if active:
        return F(node, flex="row", w=72, h=78, justify="center", items="center", stroke=t.accent, strokeWidth=3, rounded=39)
    return F(node, flex="row", w=72, h=78, justify="center", items="center")

def StreakDay(t, label, state):
    """state: done | today | future | missed"""
    if state == "done": disc = F(T("✓", size=13, weight="bold", color="#FFFFFF"), flex="row", w=34, h=34, justify="center", items="center", bg=t.streak, rounded=17)
    elif state == "today": disc = F(Dot(10, t.streak), flex="row", w=34, h=34, justify="center", items="center", stroke=t.streak, strokeWidth=2, rounded=17)
    else: disc = F(flex="row", w=34, h=34, bg=t.border, rounded=17)
    return F(T(label, size=11, weight="bold", color=t.streak if state == "today" else t.text3), disc, flex="col", gap=6, items="center")

# ---------- shells ----------
NAV = ["Today", "Courses", "Learn", "Library", "Review"]

def TopBar(t, active):
    items = []
    for n in NAV:
        on = n == active
        items.append(F(T(n, size=15, weight="semibold" if on else "medium", color=t.text if on else t.text2),
                       R(28, 2, t.text if on else t.surface, rounded=1), flex="col", gap=8, items="center"))
    return F(T("gnosia", size=20, weight="bold", color=t.text, font=DISPLAY),
             F(*items, flex="row", gap=28, items="end"), Spacer(),
             Pill(t, "14 day streak", dot=t.streak), Pill(t, "Target 1 / 2", dot=t.accent), Dot(34, t.border),
             flex="row", w="fill", h=64, px=28, gap=32, items="center", bg=t.surface, stroke=t.hair)

def Screen(t, slug, body, active, w=1440, h=900, bar=True):
    return F(TopBar(t, active) if bar else "", body, name=f"H{slug}-{t.name}", flex="col", w=w, h=h, bg=t.page, overflow="hidden")

def Phone(t, slug, title, body, active):
    tabs = [F(Dot(20, t.text if n == active else t.border), T(n, size=10, weight="semibold", color=t.text if n == active else t.text3), flex="col", gap=4, items="center", grow=1) for n in NAV]
    return F(F(T(title, size=20, weight="bold", color=t.text, font=DISPLAY), Spacer(), Pill(t, "14", dot=t.streak), flex="row", w="fill", h=56, px=16, items="center", bg=t.surface, stroke=t.hair),
             body,
             F(*tabs, flex="row", w="fill", h=68, px=8, items="center", bg=t.surface, stroke=t.hair),
             name=f"H{slug}-{t.name}", flex="col", w=390, h=844, bg=t.page, overflow="hidden")

# ---------- screens ----------
REVIEWS = [("Dot product", "mastered", "due today", "recall"), ("Cross product", "learning", "due today", "check · 2"),
           ("Homogeneous coordinates", "learning", "overdue 1d", "recall"), ("Model-view matrix", "mastered", "due today", "recall"),
           ("Perspective divide", "learning", "due today", "check · 1")]

def s_today(t):
    left = Col(
        Card(t, Row(Col(Eyebrow(t, "Next on your path · CP4281 · Module 2"),
                        T("Barycentric coordinates", size=26, weight="bold", color=t.text, font=DISPLAY),
                        Row(Mastery(t, "learning"), MasteryLabel(t, "learning", "0.42"), T("· last seen 3 days ago", size=12, color=t.text2), gap=8, w=None),
                        gap=8, grow=1),
                    Col(Btn(t, "Continue teaching", w=190), Btn(t, "Open workspace", "secondary", w=190), gap=10, w=190))),
        Card(t, *[Row(Mastery(t, m), T(c, size=14, color=t.text, grow=1), T(d, size=12, color=t.text2), T(k, size=12, color=t.text3), gap=12) for c, m, d, k in REVIEWS],
             Row(Btn(t, "Start review · 12 due"), Btn(t, "Snooze to tomorrow", "secondary"), Spacer(), T("Est. 9 min", size=12, color=t.text3)),
             title="Reviews due", action="See all"),
        Card(t, *[Row(T(d, size=12, color=t.text3, w=70), Dot(8, t.m_mid), T(e, size=13, color=t.text, grow=1), T(x, size=12, color=t.text2))
                  for d, e, x in [("Yesterday", "Teach · Cross product · 5 of 6 right", "p(L) 0.31 to 0.55"), ("Yesterday", "Review · 9 cards · 2 again", "next due Fri"),
                                  ("Mon", "Probe · Homogeneous coordinates · 2 of 4", "p(L) 0.20 to 0.28"), ("Mon", "Watched · Dot product explainer (4:12)", "")]],
             title="Recent activity", action="Full history"),
        gap=16, grow=1)
    right = Col(
        Card(t, Row(Col(T("Today's target", size=16, weight="bold", color=t.text), T("One concept + due reviews", size=13, color=t.text2), T("Set by you · edit", size=12, color=t.accent_text), gap=4, grow=1)),
             TargetBar(t, "1 / 2", 50),
             Row(Dot(10, t.ok), T("Reviews cleared", size=13, color=t.text, grow=1), T("done", size=12, color=t.text3)),
             Row(Dot(10, t.surface, stroke=t.m_lo, strokeWidth=2), T("One concept taught", size=13, color=t.text, grow=1), T("open", size=12, color=t.text3))),
        Card(t, Row(T("14", size=36, weight="bold", color=t.streak, font=DISPLAY), Col(T("day streak", size=15, weight="semibold", color=t.text), T("1 free miss left this week", size=12, color=t.text2), gap=2)),
             Row(*[StreakDay(t, d, s) for d, s in [("M", "done"), ("T", "done"), ("W", "done"), ("T", "done"), ("F", "done"), ("S", "today"), ("S", "future")]], gap=12),
             T("Reminders state facts, never guilt", size=12, color=t.text3), title="Streak", action="Calendar"),
        Card(t, *[Col(Row(T(c, size=14, weight="medium", color=t.text, grow=1), T(p, size=12, color=t.text2)), Bar(t, w), gap=8)
                  for c, p, w in [("CP4281 Computer Graphics", "8 of 20 topics", 40), ("CS3216 Software Engineering", "3 of 17 topics", 18)]],
             Btn(t, "All courses", "secondary", small=True), title="Courses in progress"),
        gap=16, w=380)
    return Screen(t, "01-today", Row(left, right, gap=20, w="fill", grow=1, items="start", p=24), "Today")

def s_courses(t):
    def card(title, sub, pct, nxt):
        return Card(t, Placeholder(t, "cover", h=96), T(title, size=16, weight="bold", color=t.text), T(sub, size=12, color=t.text2), Bar(t, pct),
                    Row(T(nxt, size=12, color=t.text2, grow=1), Btn(t, "Open", "secondary", small=True)), w=420, gap=10)
    cards = [card("CP4281 Computer Graphics", "8 modules · 20 topics", 40, "Next: Barycentric coordinates"), card("CS3216 Software Engineering", "6 modules · 17 topics", 18, "Next: Requirements elicitation"),
             card("Coding agent harness architectures", "4 modules · 11 topics", 0, "Not started"), card("Linear algebra refresher", "5 modules · 14 topics", 100, "Completed · 3 due for review"),
             card("Probability for ML", "7 modules · 22 topics", 0, "Not started"), card("Rendering pipelines", "6 modules · 15 topics", 0, "Not started")]
    body = Col(Row(T("Courses", size=28, weight="bold", color=t.text, font=DISPLAY), Spacer(), Input(t, "Search courses", w=280, pill=True), Btn(t, "Import syllabus", "secondary")),
               Row(Chip(t, "All", True), Chip(t, "In progress"), Chip(t, "Graphics"), Chip(t, "Software"), Chip(t, "Maths"), Chip(t, "Agents"), gap=8),
               Row(*cards[:3], gap=16, items="start"), Row(*cards[3:], gap=16, items="start"), gap=16, p=24)
    return Screen(t, "02-courses", body, "Courses")

def s_course_path(t):
    def node(title, level, pl, active=False, last=False):
        right = Btn(t, "Continue", small=True) if active else ""
        return Col(Row(PathNode(t, level, active), Col(T(title, size=15, weight="bold" if active else "medium", color=t.text), MasteryLabel(t, level, pl), gap=2, grow=1), right, gap=16),
                   "" if last else F(R(3, 18, t.border, rounded=2), flex="col", w=72, items="center"), gap=0)
    def unit(n, name, sub, nodes, tint=True):
        head = Row(Col(Eyebrow(t, f"Module {n}"), T(name, size=20, weight="bold", color=t.text), T(sub, size=12, color=t.text2), gap=3, grow=1),
                   Btn(t, "Guidebook", "secondary", small=True), Chip(t, "Assets · 3"), gap=10, p=16, bg=t.tint if tint else t.surface2, rounded=16)
        return Col(head, Col(*nodes, gap=0, px=8), gap=14, p=16, bg=t.surface, stroke=t.border, strokeWidth=2, rounded=20)
    path = Col(unit(1, "Graphics foundations refresher", "4 of 4 mastered", [node("Vectors and spaces", "mastered", "0.91"), node("Dot product", "mastered", "0.91"), node("Cross product", "learning", "0.42"), node("Homogeneous coordinates", "learning", "0.42", last=True)]),
               unit(2, "Transformations", "1 of 5", [node("Model-view matrix", "mastered", "0.91"), node("Barycentric coordinates", "learning", "0.42", active=True), node("Perspective divide", "untouched", None), node("Viewport mapping", "untouched", None, last=True)]),
               unit(3, "Rasterisation", "locked until Module 2", [node("Scan conversion", "untouched", None), node("Z-buffer", "untouched", None, last=True)], tint=False), gap=16)
    rail = Col(Card(t, T("CP4281 Computer Graphics", size=18, weight="bold", color=t.text, font=DISPLAY), T("8 modules · 20 topics · 40% mastered", size=12, color=t.text2), Bar(t, 40), Row(Btn(t, "Continue"), Btn(t, "Reset", "secondary")), gap=10),
               Card(t, *[Row(T(m, size=13, color=t.text, grow=1), BarFixed(t, px, 110, h=6), T(l, size=12, color=t.text3)) for m, px, l in [("M1 Foundations", 110, "4/4"), ("M2 Transforms", 22, "1/5"), ("M3 Raster", 0, "0/2"), ("M4 Shading", 0, "0/4"), ("M5 Texturing", 0, "0/3")]], title="Modules"),
               Card(t, *[Row(Placeholder(t, k, w=72, h=48), Col(T(n, size=13, weight="medium", color=t.text), T(m, size=12, color=t.text2), gap=2)) for k, n, m in [("video", "Barycentric interpolation", "video · 4:12"), ("diagram", "Triangle areas", "diagram"), ("note", "Barycentric coordinates", "concept note")]], title="Assets for this module", action="Library"),
               gap=16, w=360)
    return Screen(t, "03-course-path", Row(Col(path, w=992), rail, gap=20, w="fill", grow=1, items="start", p=24), "Courses")

def s_workspace(t):
    header = Row(Col(Eyebrow(t, "CP4281 · Module 2 · Transformations"), T("Barycentric coordinates", size=26, weight="bold", color=t.text, font=DISPLAY), gap=4, grow=1),
                 Row(Mastery(t, "learning"), MasteryLabel(t, "learning", "0.42"), gap=8, w=None), Btn(t, "Teach me · focus mode"), Btn(t, "Review now", "secondary"), gap=14, px=24, py=16)
    def sec(title, *rows): return Col(T(title, size=13, weight="bold", color=t.text), *rows, gap=8)
    def item(level, text): return Row(Mastery(t, level, 12), T(text, size=13, color=t.text), gap=8)
    left = Panel(t, Row(T("Note & sources", size=15, weight="bold", color=t.text, grow=1), T("collapse", size=12, color=t.text3), h=32),
                 HR(t),
                 sec("Summary", P("Weights that express a point inside a triangle as a mix of its three vertices.", 250, 13, t.text2)),
                 sec("Prerequisites", item("mastered", "Dot product"), item("mastered", "Vectors and spaces"), item("learning", "Cross product")),
                 sec("Leads to", item("untouched", "Perspective-correct interpolation"), item("untouched", "Scan conversion")),
                 sec("Sources", Row(Dot(8, t.danger), T("Lecture 4 slides (PDF)", size=13, color=t.text), gap=8), Row(Dot(8, t.accent), T("Scratchapixel: rasterisation", size=13, color=t.text), gap=8),
                     Row(Dot(8, t.ok), T("Your note · 2 saved answers", size=13, color=t.text), gap=8), Btn(t, "Add source", "secondary", small=True)),
                 sec("Backlinks", T("Referenced by 3 notes", size=13, color=t.text2)), w=290, gap=16)
    def tutor(lines, cite, actions=False):
        return Col(Eyebrow(t, "Tutor"), P(" ".join(lines), 520, 15, t.text, lh=24),
                   Row(Cite(t, *cite), Spacer(), *( [Btn(t, "Save to note", "ghost", small=True), Btn(t, "Why?", "ghost", small=True)] if actions else [] ), gap=8), gap=8, px=6)
    def user(text): return Row(Spacer(), F(T(text, size=15, color=t.text), flex="row", px=16, py=12, bg=t.tint, rounded=20), gap=0)
    centre = Panel(t, Row(T("Tutor", size=15, weight="bold", color=t.text, grow=1), T("Learning guide · concise", size=12, color=t.text3), h=32), HR(t),
                   Col(tutor(["Before we go on: a point P inside triangle ABC.", "If the weights are (0.5, 0.5, 0), where is P?"], (1, "Lecture 4, slide 12")),
                       user("Halfway along edge AB."),
                       tutor(["Right. Zero weight on C means P sits on the edge opposite C. That counts as a correct probe.", "p(L) moved 0.42 to 0.55."], (2, "Scratchapixel §3"), actions=True),
                       gap=16, vgrow=1),
                   Row(Chip(t, "Why do weights sum to 1?"), Chip(t, "Show me the area proof"), Chip(t, "Give me a check"), gap=8),
                   Row(F(T("Ask about this concept", size=15, color=t.text3), flex="row", grow=1, h=52, px=16, items="center", bg=t.surface, stroke=t.border, strokeWidth=2, rounded=16), Btn(t, "Send"), gap=10),
                   w=776, gap=14)
    right = Panel(t, Row(T("Studio", size=15, weight="bold", color=t.text, grow=1), T("collapse", size=12, color=t.text3), h=32), HR(t),
                  Card(t, Row(T("0.55", size=30, weight="bold", color=t.accent_text, font=DISPLAY), Col(T("mastery p(L)", size=13, weight="medium", color=t.text), T("5 observations · 4 correct", size=12, color=t.text2), gap=2)),
                       Row(*[R(8, h, t.accent, rounded=2) for h in [8, 10, 14, 12, 18, 22]], gap=4, items="end"), T("Next review Fri · interval 4d · ease 2.5", size=12, color=t.text3), tight=True, gap=8),
                  Card(t, T("Checks · 3", size=13, weight="bold", color=t.text), Row(Dot(8, t.ok), T("Weights sum to one", size=13, color=t.text), gap=8), Row(Dot(8, t.ok), T("Point on an edge", size=13, color=t.text), gap=8),
                       Row(Dot(8, t.surface, stroke=t.m_lo, strokeWidth=2), T("Area ratio derivation", size=13, color=t.text), gap=8), Btn(t, "Quiz me", "secondary", small=True), tight=True, gap=6),
                  Card(t, T("Assets", size=13, weight="bold", color=t.text), Placeholder(t, "video · Barycentric interpolation · 4:12", h=44), Placeholder(t, "diagram · Triangle areas", h=44), Btn(t, "Generate flashcards", "secondary", small=True), tight=True, gap=6),
                  Card(t, T("Neighbourhood", size=13, weight="bold", color=t.text), Placeholder(t, "graph: this concept, | 3 prereqs, 2 dependants, | mastery-coloured", h=68), Btn(t, "Open full course graph", "secondary", small=True), tight=True, gap=6),
                  w=310, gap=10)
    body = Col(header, Row(left, centre, right, gap=16, w="fill", grow=1, items="start", px=16, py=0), F(h=16), gap=0, vgrow=1)
    return Screen(t, "04-concept-workspace", body, "Learn")

def focus_shell(t, pct, step_label, *content):
    return Col(F(R(f"{pct}%", 12, t.accent, rounded=6), flex="row", w="fill", h=12, bg=t.border, rounded=0),
               Row(T(step_label, size=12, weight="medium", color=t.text2), Spacer(), T("Exit to workspace", size=12, weight="medium", color=t.text2), px=24, py=12),
               Col(*content, gap=22, w=720), gap=0, vgrow=1, items="center")

def s_session(t):
    content = [T("Barycentric coordinates · Teach", size=28, weight="bold", color=t.text, font=DISPLAY),
               P("Any point inside a triangle can be written as a weighted mix of its corners. The weights are the barycentric coordinates, and they always add up to one.", 700, 17, t.text, lh=27),
               Placeholder(t, "interactive diagram | drag P inside ABC, weights update live", h=220),
               Col(T("If P sits exactly at vertex A, what are its weights?", size=16, weight="semibold", color=t.text),
                   *[Option(t, o, key=str(i + 1)) for i, o in enumerate(["(1, 0, 0)", "(0, 1, 0)", "(1/3, 1/3, 1/3)", "(0.5, 0.5, 0)"])], gap=8),
               Row(Btn(t, "I don't know", "secondary"), Spacer(), Btn(t, "Check", w=160))]
    return Screen(t, "05-session-focus", focus_shell(t, 43, "Step 3 of 7 · Teach · Barycentric coordinates", *content), "Learn", bar=False)

def s_session_feedback(t):
    opts = [Option(t, "(1, 0, 0)", "correct", "1"), Option(t, "(0, 1, 0)", None, "2"), Option(t, "(1/3, 1/3, 1/3)", "wrong", "3"), Option(t, "(0.5, 0.5, 0)", None, "4")]
    content = [T("Barycentric coordinates · Teach", size=28, weight="bold", color=t.text, font=DISPLAY),
               Placeholder(t, "interactive diagram (unchanged)", h=150),
               Col(T("If P sits exactly at vertex A, what are its weights?", size=16, weight="semibold", color=t.text), *opts, gap=8),
               Feedback(t, False, "Not quite", "Equal weights put P at the centroid, not a corner.", "p(L) 0.55 to 0.49 · this becomes a review card", "Continue")]
    return Screen(t, "06-session-feedback", focus_shell(t, 43, "Step 3 of 7 · Teach · Barycentric coordinates", *content), "Learn", bar=False)

def s_session_close(t):
    content = [Col(T("Session closed", size=32, weight="bold", color=t.text, font=DISPLAY), T("Barycentric coordinates · 14 min · Probe, Teach, Close", size=13, color=t.text2), gap=6, items="center"),
               Row(StatTile(t, "6 / 8", "right", t.ok_text), StatTile(t, "+0.13", "mastery", t.accent), StatTile(t, "2", "review cards", "#8B5CF6"), StatTile(t, "1 / 2", "target", t.streak), gap=14),
               Card(t, Row(T("Barycentric coordinates", size=14, color=t.text, grow=1), BarFixed(t, 84, 200, fg=t.m_mid), T("0.42", size=12, color=t.text2), BarFixed(t, 110, 200), T("0.55", size=12, weight="bold", color=t.text)),
                    Row(T("Cross product (prerequisite)", size=14, color=t.text, grow=1), BarFixed(t, 62, 200, fg=t.m_mid), T("0.31", size=12, color=t.text2), BarFixed(t, 70, 200), T("0.35", size=12, weight="bold", color=t.text)), title="What moved"),
               Card(t, Row(Dot(8, t.m_mid), T("Area ratio derivation", size=14, color=t.text, grow=1), T("review in 10 min, then 1 day", size=12, color=t.text2)),
                    Row(Dot(8, t.m_mid), T("Point at a vertex", size=14, color=t.text, grow=1), T("review in 1 day", size=12, color=t.text2)), title="Scheduled"),
               Row(Btn(t, "Back to Today", "secondary"), Spacer(), Btn(t, "Keep going · Perspective divide"))]
    return Screen(t, "07-session-close", focus_shell(t, 100, "Step 7 of 7 · Close", *content), "Learn", bar=False)

def s_review(t):
    content = [Row(T("Review · 3 of 12 · CP4281 mostly", size=12, weight="medium", color=t.text2), Spacer(), T("Est. 7 min left", size=12, color=t.text3)),
               Col(Eyebrow(t, "Recall · Cross product"), T("What does the magnitude of a × b equal?", size=24, weight="bold", color=t.text, font=DISPLAY), gap=8, p=24, w="fill", bg=t.surface, stroke=t.border, strokeWidth=2, rounded=20),
               Col(Eyebrow(t, "Answer"), P("The area of the parallelogram spanned by a and b, which is |a||b| sin θ.", 640, 17, t.text, lh=26),
                   Row(Cite(t, 1, "Lecture 3, slide 8"), Btn(t, "Why?", "ghost", small=True), Btn(t, "Open concept", "ghost", small=True), gap=8), gap=10, p=24, w="fill", bg=t.tint, rounded=20),
               Col(T("How well did you recall it?", size=13, weight="medium", color=t.text2), Row(Rating(t, "Again", "10 min"), Rating(t, "Hard", "1 day"), Rating(t, "Good", "4 days"), Rating(t, "Easy", "9 days"), gap=12), gap=10),
               Row(T("Keys 1 to 4 · space reveals", size=12, color=t.text3), Spacer(), T("ease 2.5 · 4 reps · last seen 4 days ago", size=12, color=t.text3))]
    return Screen(t, "08-review", focus_shell(t, 25, "Review · 3 of 12", *content), "Review", bar=False)

def s_learn_index(t):
    rows = [("Barycentric coordinates", "learning", 55, "Fri", "3 days", "CP4281 M2"), ("Cross product", "learning", 35, "today", "yesterday", "CP4281 M1"),
            ("Dot product", "mastered", 91, "today", "6 days", "CP4281 M1"), ("Homogeneous coordinates", "learning", 28, "overdue", "5 days", "CP4281 M1"),
            ("Model-view matrix", "mastered", 88, "Mon", "2 days", "CP4281 M2"), ("Requirements elicitation", "learning", 40, "Tue", "8 days", "CS3216 M1"),
            ("Perspective divide", "untouched", 0, "", "never", "CP4281 M2"), ("Tool-use loop", "untouched", 0, "", "never", "Agents M1")]
    def cell(node, w): return F(node, flex="row", w=w, items="center")
    table = Col(Row(cell(Eyebrow(t, "Concept"), 290), cell(Eyebrow(t, "Mastery"), 210), cell(Eyebrow(t, "Due"), 90), cell(Eyebrow(t, "Last seen"), 110), cell(Eyebrow(t, "Course"), 120), gap=8, px=16, py=10),
                HR(t),
                *[Col(Row(cell(Row(Mastery(t, m), T(c, size=14, color=t.text), gap=10, w=None), 290),
                          cell(Row(BarFixed(t, int(p * 1.6), 160, h=6, fg=t.m_hi if m == "mastered" else t.m_mid), T(f"{p/100:.2f}" if p else "–", size=12, color=t.text2), gap=8, w=None), 210),
                          cell(T(d or "–", size=12, color=t.danger if d == "overdue" else t.text2), 90), cell(T(ls, size=12, color=t.text2), 110), cell(T(co, size=12, color=t.text2), 120), gap=8, px=16, py=12), HR(t), gap=0)
                  for c, m, p, d, ls, co in rows], gap=0, w="fill", bg=t.surface, stroke=t.border, strokeWidth=2, rounded=20, overflow="hidden")
    body = Col(Row(T("Learn", size=28, weight="bold", color=t.text, font=DISPLAY), T("32 concepts · 9 mastered · 14 learning · 9 untouched", size=12, color=t.text2), Spacer(), Input(t, "Search concepts", w=280, pill=True), Btn(t, "Add concept", "secondary")),
               Row(Chip(t, "All", True), Chip(t, "Due"), Chip(t, "Learning"), Chip(t, "Mastered"), Chip(t, "Untouched"), Chip(t, "Leeches"), Spacer(), Chip(t, "Table", True), Chip(t, "Graph"), gap=8),
               Row(Col(table, w=992), Card(t, Placeholder(t, "neighbourhood graph of the | selected concept, mastery-coloured | toggle: full course", h=300), Btn(t, "Open in workspace", "secondary", small=True), w=380, title="Graph"), gap=20, items="start"),
               gap=16, p=24)
    return Screen(t, "09-learn-index", body, "Learn")

def s_library(t):
    def asset(kind, title, meta, concept, level):
        return Card(t, Placeholder(t, kind, h=110), Row(Chip(t, kind, small=True), T(meta, size=12, color=t.text2)), T(title, size=14, weight="semibold", color=t.text), Row(Mastery(t, level, 12), T(concept, size=12, color=t.text2), gap=8), w=300, gap=8, tight=True)
    grid = Col(Row(asset("video", "Barycentric interpolation", "4:12 · manim", "Barycentric coordinates", "learning"), asset("diagram", "Triangle areas", "svg · tldraw", "Barycentric coordinates", "learning"), asset("note", "Cross product", "concept note", "Cross product", "learning"), asset("session", "Teach · Cross product", "yesterday", "Cross product", "learning"), gap=16, items="start"),
               Row(asset("video", "Dot product explainer", "3:40 · manim", "Dot product", "mastered"), asset("diagram", "Projection onto a line", "svg", "Dot product", "mastered"), asset("link", "Scratchapixel: rasterisation", "external", "Scan conversion", "untouched"), asset("video", "Model-view walkthrough", "6:02", "Model-view matrix", "mastered"), gap=16, items="start"), gap=16)
    body = Col(Row(T("Library", size=28, weight="bold", color=t.text, font=DISPLAY), T("208 assets", size=12, color=t.text2), Spacer(), Input(t, "Search titles, transcripts, notes", w=340, pill=True)),
               Row(Chip(t, "All kinds", True), Chip(t, "Video"), Chip(t, "Diagram"), Chip(t, "Note"), Chip(t, "Session"), Chip(t, "Link"), F(w=16), Chip(t, "CP4281", True), Chip(t, "CS3216"), Chip(t, "Agents"), Spacer(), T("Sort: newest", size=12, color=t.text2), gap=8),
               grid, gap=16, p=24)
    return Screen(t, "10-library", body, "Library")

def s_library_asset(t):
    main = Col(Placeholder(t, "video player · 4:12", h=400), Row(T("Chapters", size=12, color=t.text3), Chip(t, "Intro 0:00", small=True), Chip(t, "Weights 0:48", small=True), Chip(t, "Areas 2:10", small=True), Chip(t, "Edge cases 3:30", small=True), gap=8),
               Card(t, T("Transcript", size=16, weight="bold", color=t.text), *[T(l, size=14, color=t.text2, lh=22) for l in ["0:00 A point inside a triangle can be described by three numbers.", "0:48 Each weight is the area of the opposite sub-triangle over the whole.", "2:10 That is why they sum to one."]], gap=6), gap=14, grow=1)
    rail = Col(Card(t, Eyebrow(t, "Video · manim · rendered 2026-09-12"), T("Barycentric interpolation", size=22, weight="bold", color=t.text, font=DISPLAY), Row(Btn(t, "Mark watched"), Btn(t, "Add to note", "secondary")), gap=10),
               Card(t, Row(Mastery(t, "learning"), T("Barycentric coordinates", size=14, color=t.text, grow=1), T("0.55", size=12, color=t.text2)), Row(Mastery(t, "mastered"), T("Dot product", size=14, color=t.text, grow=1), T("0.91", size=12, color=t.text2)), Btn(t, "Open workspace", "secondary", small=True), title="Explains"),
               Card(t, Row(Placeholder(t, "diagram", w=64, h=44), T("Triangle areas", size=13, color=t.text)), Row(Placeholder(t, "note", w=64, h=44), T("Barycentric coordinates", size=13, color=t.text)), title="Related"),
               Card(t, T("source scene.py · narration.json · mirror ok", size=12, color=t.text2), title="Derived from"), gap=16, w=380)
    return Screen(t, "11-library-asset", Row(main, rail, gap=20, w="fill", grow=1, items="start", p=24), "Library")

def s_settings(t):
    def field(l, v, note=None):
        return Row(Col(T(l, size=14, weight="medium", color=t.text), T(note, size=12, color=t.text2) if note else "", gap=2, w=320), F(T(v, size=14, color=t.text), flex="row", w=300, h=44, px=14, items="center", bg=t.surface, stroke=t.border, strokeWidth=2, rounded=8), gap=16)
    body = Col(T("Settings", size=28, weight="bold", color=t.text, font=DISPLAY),
               Card(t, field("Daily target", "One concept + due reviews", "You set it. The app never raises it."), field("Streak leeway", "1 free miss per week"), field("Reminders", "Facts only · 9:00"), title="Habit"),
               Card(t, field("Theme", "System"), field("Tutor style", "Learning guide · concise"), field("Motion", "Respect system reduced motion"), title="Appearance and tutor"),
               Card(t, field("BKT priors", "pL0 0.2 · pT 0.1 · pG 0.2 · pS 0.1", "Advanced. Changes future observations only."), field("Model providers", "Order: 3 free tiers"), Row(Btn(t, "Export learner data", "secondary"), Btn(t, "Reset progress", "secondary")), title="Model"),
               gap=16, w=900, p=24)
    return Screen(t, "12-settings", body, "Today")

def p_today(t):
    body = Col(Card(t, Eyebrow(t, "Next up · CP4281 M2"), T("Barycentric coordinates", size=20, weight="bold", color=t.text, font=DISPLAY), Row(Mastery(t, "learning"), MasteryLabel(t, "learning", "0.42"), gap=8), Btn(t, "Continue", w="fill"), gap=8, tight=True),
               Row(Card(t, T("1 / 2", size=24, weight="bold", color=t.text, font=DISPLAY), T("target", size=12, color=t.text2), gap=2, tight=True), Card(t, T("14", size=24, weight="bold", color=t.streak, font=DISPLAY), T("streak · 1 miss left", size=12, color=t.text2), gap=2, tight=True), gap=10),
               Card(t, *[Row(Mastery(t, m), T(c, size=14, color=t.text, grow=1), T(d, size=12, color=t.text2)) for c, m, d in [("Dot product", "mastered", "today"), ("Cross product", "learning", "today"), ("Homogeneous coords", "learning", "1d late")]], Btn(t, "Start review · 12", w="fill"), title="Reviews due", gap=8, tight=True),
               Card(t, Row(T("Yesterday", size=12, color=t.text3, w=64), T("Teach · Cross product · 5/6", size=13, color=t.text)), Row(T("Mon", size=12, color=t.text3, w=64), T("Review · 9 cards", size=13, color=t.text)), title="Recent", gap=8, tight=True),
               gap=12, p=14, vgrow=1)
    return Phone(t, "13-phone-today", "Today", body, "Today")

def p_review(t):
    def rate(l, iv): return Col(T(l, size=14, weight="bold", color=t.text), T(iv, size=11, color=t.text3), gap=2, items="center", grow=1, py=12, bg=t.surface, stroke=t.border, strokeWidth=2, rounded=14)
    body = Col(F(R("25%", 8, t.accent, rounded=4), flex="row", w="fill", h=8, bg=t.border, rounded=0),
               Row(T("3 of 12", size=12, weight="medium", color=t.text2), Spacer(), T("Exit", size=12, weight="medium", color=t.text2), px=14, py=8),
               Col(Eyebrow(t, "Recall · Cross product"), T("What does the magnitude", size=20, weight="bold", color=t.text, font=DISPLAY), T("of a × b equal?", size=20, weight="bold", color=t.text, font=DISPLAY), gap=4, p=16, w="fill", bg=t.surface, stroke=t.border, strokeWidth=2, rounded=16),
               Col(Eyebrow(t, "Answer"), T("Area of the parallelogram", size=15, color=t.text), T("spanned by a and b: |a||b| sin θ.", size=15, color=t.text), Row(Cite(t, 1, "L3 s8"), Btn(t, "Why?", "ghost", small=True), gap=8), gap=4, p=16, w="fill", bg=t.tint, rounded=16),
               Spacer(), Row(rate("Again", "10m"), rate("Hard", "1d"), rate("Good", "4d"), rate("Easy", "9d"), gap=6), gap=12, p=14, vgrow=1)
    return Phone(t, "14-phone-review", "Review", body, "Review")

def p_session(t):
    body = Col(F(R("43%", 8, t.accent, rounded=4), flex="row", w="fill", h=8, bg=t.border, rounded=0),
               Row(T("Step 3 of 7 · Teach", size=12, weight="medium", color=t.text2), Spacer(), T("Exit", size=12, weight="medium", color=t.text2), px=14, py=8),
               Col(T("Barycentric coordinates", size=20, weight="bold", color=t.text, font=DISPLAY), P("Any point inside a triangle is a weighted mix of its corners.", 350, 15, t.text, lh=22), gap=6),
               Placeholder(t, "interactive diagram", h=170),
               Col(T("P at vertex A: weights?", size=15, weight="semibold", color=t.text), *[Row(Dot(16, t.surface, stroke=t.border, strokeWidth=2), T(o, size=14, color=t.text), gap=10, h=44, px=12, bg=t.surface, stroke=t.border, strokeWidth=2, rounded=10) for o in ["(1, 0, 0)", "(0, 1, 0)", "(1/3, 1/3, 1/3)", "(0.5, 0.5, 0)"]], gap=6),
               Spacer(), Row(Btn(t, "Don't know", "secondary", small=True), Spacer(), Btn(t, "Check")), gap=12, p=14, vgrow=1)
    return Phone(t, "15-phone-session", "Session", body, "Learn")

SCREENS = [s_today, s_courses, s_course_path, s_workspace, s_session, s_session_feedback, s_session_close, s_review, s_learn_index, s_library, s_library_asset, s_settings, p_today, p_review, p_session]

def delete(node_id):
    return call("delete_node", {"id": node_id}).get("deleted") == node_id

def write_variables():
    """Two collections, one per theme, so the file documents the token set."""
    existing = {c["name"]: c["id"] for c in call("list_collections", {}).get("collections", [])}
    for th in ("light", "dark"):
        name = f"gnosia {th}"
        if name in existing: call("delete_collection", {"id": existing[name]})
        cid = call("create_collection", {"name": name})["id"]
        for k, v in TOKENS.items():
            call("create_variable", {"name": k, "type": "COLOR", "collection_id": cid, "value": v[0 if th == "light" else 1]})
        print(f"variables: {name} ({len(TOKENS)})")

def main():
    os.makedirs(OUT, exist_ok=True)
    args = sys.argv[1:]
    themes = ["light", "dark"]
    if "--theme" in args:
        i = args.index("--theme"); themes = [args[i + 1]]; del args[i:i + 2]
    do_vars = "--variables" in args
    if do_vars: args.remove("--variables")
    want = set(args); failures = []
    if not want: do_vars = True  # a full run keeps the token collections in step with the screens
    pages = {p["name"]: p["id"] for p in call("list_pages", {}).get("pages", [])}
    if PAGE not in pages: pages[PAGE] = call("create_page", {"name": PAGE})["id"]
    call("switch_page", {"page": PAGE})
    existing = {}
    for n in call("find_nodes", {"type": "FRAME", "name": "H"}).get("nodes", []):
        if n.get("name", "").startswith("H") and n["name"][1:3].isdigit(): existing.setdefault(n["name"], []).append(n["id"])
    for ti, th in enumerate(themes):
        t = theme(th)
        for i, fn in enumerate(SCREENS):
            jsx = fn(t); slug = jsx.split('name="', 1)[1].split('"', 1)[0]
            if want and not any(slug[1:].startswith(w) or slug[1:3] == w.zfill(2) for w in want): continue
            col = i % 4; row = i // 4
            x = col * 1600; y = (0 if th == "light" else 5000) + row * 1100
            res = call("render", {"x": x, "y": y, "jsx": jsx})
            if "id" not in res:
                failures.append(f"{slug}: render failed, old frame kept: {json.dumps(res)[:300]}"); print(failures[-1]); continue
            warn = res.get("warnings") or []
            exported = call("export_svg", {"ids": [res["id"]]}); svg = exported.get("svg") or ""
            if not svg.startswith("<?xml") or "<svg" not in svg:
                failures.append(f"{slug}: export failed, old frame and SVG kept: {json.dumps(exported)[:300]}"); print(failures[-1])
                if not delete(res["id"]): failures.append(f"{slug}: could not delete the half-rendered frame {res['id']}")
                continue
            for old in existing.get(slug, []):
                if not delete(old): failures.append(f"{slug}: could not delete the previous frame {old}; the document now holds a duplicate")
            svg = svg.replace('font-family="Figtree"', 'font-family="Figtree, Nunito, system-ui, sans-serif"').replace('font-family="Georgia"', 'font-family="Georgia, serif"')
            open(os.path.join(OUT, f"{slug[1:]}.svg"), "w").write(svg)
            print(f"{slug}: id={res['id']} svg={len(svg)}B warnings={len(warn)}", ("; ".join(warn[:3]) if warn else ""))
    if do_vars: write_variables()
    saved = call("save_file", {"path": os.path.join(REPO, "docs/design/gnosia-lofi.fig")})
    if not saved.get("saved"): failures.append(f"save_file failed: {json.dumps(saved)[:300]}")
    print("saved:", bool(saved.get("saved")))
    if failures:
        print(f"{len(failures)} failure(s):"); [print("  " + f) for f in failures]; sys.exit(1)

if __name__ == "__main__":
    main()
