#!/usr/bin/env python3
"""Lo-fi kit for the self-learn redesign, rendered into OpenPencil via its MCP.

Usage: lofi.py [slug ...]   (no args = all screens)
Renders each screen frame, exports SVG to docs/design/lofi/<slug>.svg and saves the .fig.
Render PNGs to look at with svg2png.mjs.
"""
import json, os, sys

SP = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(SP, "..", "..", ".."))
OUT = os.path.join(REPO, "docs/design/lofi")
src = open(os.path.join(SP, "op.py")).read().replace("main()\n", "")
ns = {"__file__": os.path.join(SP, "op.py")}; exec(src, ns)
SID = ns["session"]()

def call(name, args):
    r, _ = ns["post"]({"jsonrpc": "2.0", "id": 9, "method": "tools/call",
                       "params": {"name": name, "arguments": args}}, SID)
    res = r.get("result", r)
    txt = "".join(c.get("text", "") for c in res.get("content", []))
    try: return json.loads(txt)
    except Exception: return {"raw": txt}

# ---------- palette (lo-fi greyscale + one accent) ----------
CANVAS = "#FFFFFF"; PANEL = "#F5F5F5"; BOX = "#E6E6E6"; BOX2 = "#D6D6D6"
LINE = "#C9C9C9"; INK = "#1F1F1F"; MUTED = "#7C7C7C"; ACCENT = "#2F6BE6"
PRIMARY = "#222222"; M_HI = "#3D3D3D"; M_MID = "#9A9A9A"; M_LO = "#FFFFFF"

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

def F(*children, name=None, flex="col", w=None, h=None, gap=None, p=None, px=None, py=None,
      bg=None, stroke=None, strokeWidth=None, rounded=None, justify=None, items=None, grow=None, opacity=None, overflow=None):
    a = attrs(name=name, flex=flex, w=w, h=h, gap=gap, p=p, px=px, py=py, bg=bg, stroke=stroke,
              strokeWidth=strokeWidth, rounded=rounded, justify=justify, items=items, grow=grow, opacity=opacity, overflow=overflow)
    return f"<Frame {a}>" + "".join(children) + "</Frame>"

def T(text, size=13, color=INK, weight=None, w=None, align=None, grow=None):
    a = attrs(size=size, color=color, weight=weight, w=w, textAlign=align)
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    node = f"<Text {a}>{text}</Text>"
    if grow: return F(node, flex="row", grow=grow, items="center")
    return node

def R(w, h, bg=BOX, rounded=4, stroke=None):
    return f"<Rectangle {attrs(w=w, h=h, bg=bg, rounded=rounded, stroke=stroke)} />"

def Dot(d=10, bg=BOX2, stroke=None):
    return f"<Ellipse {attrs(w=d, h=d, bg=bg, stroke=stroke)} />"

def Spacer(): return F(grow=1)
def HR(): return R("fill", 1, bg=LINE, rounded=0)

# ---------- components ----------
def Btn(label, primary=False, w=None, small=False):
    bg = PRIMARY if primary else CANVAS
    col = "#FFFFFF" if primary else INK
    return F(T(label, size=12 if small else 13, color=col, weight="medium"),
             flex="row", w=w, h=30 if small else 36, px=14, justify="center", items="center",
             bg=bg, stroke=None if primary else LINE, rounded=8)

def Chip(label, active=False):
    return F(T(label, size=11, color="#FFFFFF" if active else INK), flex="row", h=24, px=10,
             items="center", bg=PRIMARY if active else PANEL, stroke=None if active else LINE, rounded=12)

def Pill(label):
    return F(T(label, size=12, color=INK, weight="medium"), flex="row", h=28, px=12, items="center",
             bg=PANEL, stroke=LINE, rounded=14)

def Card(*children, title=None, w="fill", h=None, grow=None, gap=10, p=16, action=None):
    if grow and w == "fill": w = None
    head = []
    if title:
        head.append(F(T(title, size=14, weight="semibold"), Spacer(),
                      T(action, size=12, color=ACCENT) if action else "",
                      flex="row", w="fill", items="center"))
    return F(*head, *children, flex="col", w=w, h=h, grow=grow, gap=gap, p=p, bg=CANVAS, stroke=LINE, rounded=10)

def Placeholder(label, w="fill", h=120, bg=PANEL):
    lines = [T(l.strip(), size=12, color=MUTED) for l in label.split("|")]
    return F(*lines, flex="col", w=w, h=h, gap=4, justify="center", items="center",
             bg=bg, stroke=LINE, rounded=8)

def Bar(pct, w="fill", h=6, fg=M_HI):
    return F(R(f"{int(pct)}%" if isinstance(pct, (int, float)) else pct, h, bg=fg, rounded=3),
             flex="row", w=w, h=h, bg=BOX, rounded=3)

def BarFixed(px_fill, px_total=200, h=6, fg=M_HI):
    return F(R(px_fill, h, bg=fg, rounded=3), flex="row", w=px_total, h=h, bg=BOX, rounded=3)

def Row(*children, gap=10, w="fill", h=None, grow=None, items="center", justify=None, p=None, px=None, py=None, bg=None, stroke=None, rounded=None):
    return F(*children, flex="row", w=w, h=h, grow=grow, gap=gap, items=items, justify=justify, p=p, px=px, py=py, bg=bg, stroke=stroke, rounded=rounded)

def Col(*children, gap=10, w="fill", h=None, grow=None, vgrow=None, p=None, px=None, py=None, bg=None, stroke=None, rounded=None, items=None, justify=None):
    if grow and w == "fill": w = None
    if vgrow: grow = 1
    return F(*children, flex="col", w=w, h=h, grow=grow, gap=gap, p=p, px=px, py=py, bg=bg, stroke=stroke, rounded=rounded, items=items, justify=justify)

def Mastery(level):
    """level: 'mastered' | 'learning' | 'untouched' -> node dot"""
    if level == "mastered": return Dot(14, M_HI)
    if level == "learning": return Dot(14, M_MID)
    return Dot(14, M_LO, stroke=M_MID)

def Label(text): return T(text, size=11, color=MUTED)

# ---------- shells ----------
NAV = ["Today", "Courses", "Learn", "Library", "Review"]

def TopBar(active):
    items = []
    for n in NAV:
        if n == active:
            items.append(F(T(n, size=13, weight="semibold"), R(28, 2, bg=INK, rounded=1), flex="col", gap=6, items="center"))
        else:
            items.append(F(T(n, size=13, color=MUTED), R(28, 2, bg=CANVAS, rounded=1), flex="col", gap=6, items="center"))
    return F(T("self-learn", size=15, weight="bold"),
             F(*items, flex="row", gap=28, items="end"),
             Spacer(),
             Pill("Streak 14"), Pill("Target 1 / 2"), Dot(30, BOX2),
             flex="row", w="fill", h=56, px=28, gap=32, items="center", bg=CANVAS, stroke=LINE)

def Screen(slug, title, body, active, w=1440, h=900, bar=True):
    """A desktop screen: a fixed 1440x900 frame; content past the bottom is clipped, as a scrolling page would be."""
    return F(TopBar(active) if bar else "", body, name=f"{slug}", flex="col", w=w, h=h, bg=PANEL, stroke="#9A9A9A", overflow="hidden")

def Phone(slug, title, body, active):
    tabs = [F(Dot(18, INK if n == active else BOX2), T(n, size=9, color=INK if n == active else MUTED), flex="col", gap=3, items="center", grow=1) for n in NAV]
    return F(F(T(title, size=16, weight="semibold"), Spacer(), Pill("14"), flex="row", w="fill", h=52, px=16, items="center", bg=CANVAS, stroke=LINE),
             body,
             F(*tabs, flex="row", w="fill", h=64, px=8, items="center", bg=CANVAS, stroke=LINE),
             name=slug, flex="col", w=390, h=844, bg=PANEL, stroke="#9A9A9A", overflow="hidden")

# ---------- screens ----------
def s_today():
    left = Col(
        Card(Row(Col(Label("NEXT ON YOUR PATH  ·  CP4281 · Module 2"),
                     T("Barycentric coordinates", size=20, weight="semibold"),
                     Row(Mastery("learning"), T("Learning · p(L) 0.42 · last seen 3 days ago", size=12, color=MUTED)),
                     gap=6, grow=1),
                 Col(Btn("Continue teaching", primary=True), Btn("Open workspace"), gap=8, w=180)),
             title="Next up"),
        Card(*[Row(Mastery(m), T(c, size=13, grow=1), Label(d), Label(k))
               for c, m, d, k in [("Dot product", "mastered", "due today", "recall"),
                                  ("Cross product", "learning", "due today", "check · 2"),
                                  ("Homogeneous coordinates", "learning", "overdue 1d", "recall"),
                                  ("Model-view matrix", "mastered", "due today", "recall"),
                                  ("Perspective divide", "learning", "due today", "check · 1")]],
             Row(Btn("Start review · 12 due", primary=True), Btn("Snooze to tomorrow"), Spacer(), Label("Est. 9 min")),
             title="Reviews due", action="See all"),
        Card(*[Row(Label(t), Dot(8, M_MID), T(e, size=12, grow=1), Label(x))
               for t, e, x in [("Yesterday", "Teach · Cross product · 5 of 6 right", "p(L) 0.31 to 0.55"),
                               ("Yesterday", "Review · 9 cards · 2 again", "next due Fri"),
                               ("Mon", "Probe · Homogeneous coordinates · 2 of 4", "p(L) 0.20 to 0.28"),
                               ("Mon", "Watched · Dot product explainer (4:12)", "")]],
             title="Recent activity", action="Full history"),
        gap=16, grow=1)
    right = Col(
        Card(Row(F(T("1 / 2", size=28, weight="semibold"), flex="col", w=92, h=92, justify="center", items="center", bg=PANEL, stroke=INK, strokeWidth=4, rounded=46),
                 Col(T("Today's target", size=13, weight="medium"), Label("One concept + due reviews"), Label("Set by you · edit"), gap=4)),
             Row(Dot(10, M_HI), T("Reviews cleared", size=12, grow=1), Label("done")),
             Row(Dot(10, M_LO, stroke=M_MID), T("One concept taught", size=12, grow=1), Label("open")),
             title="Target"),
        Card(Row(T("14", size=32, weight="semibold"), Col(T("day streak", size=13), Label("1 free miss left this week"), gap=2)),
             Row(*[F(T(d, size=9, color=MUTED), Dot(22, M_HI if i < 6 else (M_LO if i == 6 else BOX)), flex="col", gap=4, items="center") for i, d in enumerate(["M", "T", "W", "T", "F", "S", "S"])], gap=10),
             Label("Reminders state facts, never guilt"),
             title="Streak", action="Calendar"),
        Card(*[Col(Row(T(c, size=13, grow=1), Label(p)), Bar(f"{w}%" if False else w, h=6), gap=6)
               for c, p, w in [("CP4281 Computer Graphics", "8 of 20 topics", 40), ("CS3216 Software Engineering", "3 of 17 topics", 18)]],
             Btn("All courses", small=True),
             title="Courses in progress"),
        gap=16, w=380)
    return Screen("01-today", "Today", Row(left, right, gap=20, w="fill", grow=1, items="start", p=24), "Today")

def s_courses():
    cards = []
    for t, s, p, n in [("CP4281 Computer Graphics", "8 modules · 20 topics", 40, "Next: Barycentric coordinates"),
                       ("CS3216 Software Engineering", "6 modules · 17 topics", 18, "Next: Requirements elicitation"),
                       ("Coding agent harness architectures", "4 modules · 11 topics", 0, "Not started"),
                       ("Linear algebra refresher", "5 modules · 14 topics", 100, "Completed · 3 due for review"),
                       ("Probability for ML", "7 modules · 22 topics", 0, "Not started"),
                       ("Rendering pipelines", "6 modules · 15 topics", 0, "Not started")]:
        cards.append(Card(Placeholder("cover", h=90), T(t, size=15, weight="semibold"), Label(s), Bar(p if p else 0),
                          Row(T(n, size=12, color=MUTED, grow=1), Btn("Open", small=True)), w=420, gap=10))
    grid = Col(Row(*cards[:3], gap=16, w="fill", items="start"), Row(*cards[3:], gap=16, w="fill", items="start"), gap=16)
    body = Col(Row(T("Courses", size=22, weight="semibold"), Spacer(), F(T("Search courses", size=12, color=MUTED), flex="row", w=260, h=34, px=12, items="center", bg=CANVAS, stroke=LINE, rounded=8), Btn("Import syllabus")),
               Row(Chip("All", True), Chip("In progress"), Chip("Graphics"), Chip("Software"), Chip("Maths"), Chip("Agents"), gap=8),
               grid, gap=16, p=24)
    return Screen("02-courses", "Courses", body, "Courses")

def s_course_path():
    def node(title, level, active=False, last=False):
        dot = F(Mastery(level) if not active else Dot(14, ACCENT), flex="col", w=44, h=44, justify="center", items="center",
                bg=CANVAS, stroke=ACCENT if active else LINE, strokeWidth=3 if active else 1, rounded=22)
        text = Col(T(title, size=14, weight="semibold" if active else None),
                   Label({"mastered": "Mastered · p(L) 0.91", "learning": "Learning · p(L) 0.42", "untouched": "Not started"}[level]), gap=2, grow=1)
        right = Btn("Continue", primary=True, small=True) if active else ""
        return Col(Row(dot, text, right, gap=14), "" if last else F(R(2, 22, bg=LINE, rounded=1), flex="col", w=44, items="center"), gap=0)
    def unit(name, sub, nodes):
        return Col(Row(Col(T(name, size=16, weight="semibold"), Label(sub), gap=2, grow=1), Btn("Guidebook · concept note", small=True), Btn("Assets · 3", small=True), gap=8),
                   Col(*nodes, gap=0, px=8), gap=14, p=18, bg=CANVAS, stroke=LINE, rounded=12)
    path = Col(
        unit("Module 1 · Graphics foundations refresher", "4 of 4 mastered", [node("Vectors and spaces", "mastered"), node("Dot product", "mastered"), node("Cross product", "learning"), node("Homogeneous coordinates", "learning", last=True)]),
        unit("Module 2 · Transformations", "1 of 5", [node("Model-view matrix", "mastered"), node("Barycentric coordinates", "learning", active=True), node("Perspective divide", "untouched"), node("Viewport mapping", "untouched", last=True)]),
        unit("Module 3 · Rasterisation", "locked until Module 2", [node("Scan conversion", "untouched"), node("Z-buffer", "untouched", last=True)]),
        gap=16)
    rail = Col(Card(T("CP4281 Computer Graphics", size=16, weight="semibold"), Label("8 modules · 20 topics · 40% mastered"), Bar(40), Row(Btn("Continue", primary=True), Btn("Reset")), gap=8),
               Card(*[Row(T(m, size=12, grow=1), BarFixed(px, 110, fg=M_HI), Label(l)) for m, px, l in [("M1 Foundations", 110, "4/4"), ("M2 Transforms", 22, "1/5"), ("M3 Raster", 0, "0/2"), ("M4 Shading", 0, "0/4"), ("M5 Texturing", 0, "0/3")]],
                    title="Modules"),
               Card(Row(Placeholder("video", w=72, h=48), Col(T("Barycentric interpolation", size=12), Label("video · 4:12"), gap=2)),
                    Row(Placeholder("diagram", w=72, h=48), Col(T("Triangle areas", size=12), Label("diagram"), gap=2)),
                    Row(Placeholder("note", w=72, h=48), Col(T("Barycentric coordinates", size=12), Label("concept note"), gap=2)),
                    title="Assets for this module", action="Library"),
               gap=16, w=360)
    return Screen("03-course-path", "Course path", Row(Col(path, w="fill", grow=1), rail, gap=20, w="fill", grow=1, items="start", p=24), "Courses")

def s_workspace():
    header = Row(Col(Label("CP4281 · Module 2 · Transformations"), T("Barycentric coordinates", size=20, weight="semibold"), gap=2, grow=1),
                 Row(Mastery("learning"), T("p(L) 0.42 · Learning", size=12, color=MUTED), gap=6),
                 Btn("Teach me · focus mode", primary=True), Btn("Review now"), gap=12, px=24, py=14, bg=CANVAS, stroke=LINE)
    left = Col(Row(T("Note & sources", size=13, weight="semibold", grow=1), Label("collapse")),
               Col(T("Summary", size=12, weight="medium"), T("Weights that express a point inside a", size=12), T("triangle as a mix of its three vertices.", size=12), gap=4),
               Col(T("Prerequisites", size=12, weight="medium"), Row(Mastery("mastered"), T("Dot product", size=12)), Row(Mastery("mastered"), T("Vectors and spaces", size=12)), Row(Mastery("learning"), T("Cross product", size=12)), gap=6),
               Col(T("Leads to", size=12, weight="medium"), Row(Mastery("untouched"), T("Perspective-correct interpolation", size=12)), Row(Mastery("untouched"), T("Scan conversion", size=12)), gap=6),
               Col(T("Sources", size=12, weight="medium"), Row(Dot(8, BOX2), T("Lecture 4 slides (PDF)", size=12)), Row(Dot(8, BOX2), T("Scratchapixel: rasterisation", size=12)), Row(Dot(8, BOX2), T("Your note · 2 saved answers", size=12)), Btn("Add source", small=True), gap=6),
               Col(T("Backlinks", size=12, weight="medium"), T("Referenced by 3 notes", size=12, color=MUTED), gap=4),
               gap=18, w=300, h="fill", p=18, bg=CANVAS, stroke=LINE)
    def msg(who, lines, cite=None, save=False):
        body = Col(*[T(l, size=13) for l in lines], gap=3)
        tail = Row(*( [Chip(cite)] if cite else [] ), Spacer(), *( [T("Save to note", size=11, color=ACCENT), T("Why?", size=11, color=ACCENT)] if save else [] ))
        return Col(Label(who), body, tail, gap=6, p=14, bg=PANEL if who == "Tutor" else CANVAS, stroke=LINE, rounded=10)
    centre = Col(Row(T("Tutor", size=13, weight="semibold", grow=1), Label("Learning guide · concise")),
                 Col(msg("Tutor", ["Before we go on: a point P inside triangle ABC.", "If the weights are (0.5, 0.5, 0), where is P?"], cite="[1] Lecture 4, slide 12"),
                     msg("You", ["Halfway along edge AB."]),
                     msg("Tutor", ["Right. Zero weight on C means P sits on the edge", "opposite C. That counts as a correct probe.", "p(L) moved 0.42 to 0.55."], cite="[2] Scratchapixel §3", save=True),
                     gap=10, vgrow=1),
                 Row(Chip("Why do weights sum to 1?"), Chip("Show me the area proof"), Chip("Give me a check"), gap=8),
                 Row(F(T("Ask about this concept", size=13, color=MUTED), flex="row", grow=1, h=42, px=14, items="center", bg=CANVAS, stroke=LINE, rounded=10), Btn("Send", primary=True), gap=8),
                 gap=14, w=820, h="fill", p=18)
    right = Col(Row(T("Studio", size=13, weight="semibold", grow=1), Label("collapse")),
                Card(Row(T("0.55", size=24, weight="semibold"), Col(T("mastery p(L)", size=12), Label("5 observations · 4 correct"), gap=2)),
                     Row(*[R(6, h, bg=M_HI, rounded=1) for h in [8, 10, 14, 12, 18, 22]], gap=4, items="end"),
                     Label("Next review Fri · interval 4d · ease 2.5"), gap=8, p=12),
                Card(T("Checks · 3", size=12, weight="medium"), Row(Dot(8, M_HI), T("Weights sum to one", size=12)), Row(Dot(8, M_HI), T("Point on an edge", size=12)), Row(Dot(8, M_LO, stroke=M_MID), T("Area ratio derivation", size=12)), Btn("Quiz me", small=True), gap=6, p=12),
                Card(T("Assets", size=12, weight="medium"), Placeholder("video · Barycentric interpolation · 4:12", h=70), Placeholder("diagram · Triangle areas", h=70), Btn("Generate flashcards", small=True), gap=8, p=12),
                Card(T("Neighbourhood", size=12, weight="medium"), Placeholder("graph: this concept, | 3 prereqs, 2 dependants, | mastery-coloured", h=110), Btn("Open full course graph", small=True), gap=8, p=12),
                gap=12, w=320, h="fill", p=14, bg=CANVAS, stroke=LINE)
    return Screen("04-concept-workspace", "Concept workspace", Col(header, Row(left, centre, right, gap=0, w="fill", grow=1, items="start"), gap=0, vgrow=1), "Learn")

def focus_shell(step_label, *content, right_extra=None):
    return Col(F(R("43%", 3, bg=INK, rounded=0), flex="row", w="fill", h=3, bg=BOX, rounded=0),
               Row(Label(step_label), Spacer(), T("Exit to workspace", size=12, color=MUTED), px=24, py=10),
               Col(*content, gap=22, w=720),
               gap=0, vgrow=1, items="center")

def s_session():
    content = [T("Barycentric coordinates · Teach", size=22, weight="semibold"),
               Col(T("Any point inside a triangle can be written as a weighted mix of", size=15), T("its corners. The weights are the barycentric coordinates, and", size=15), T("they always add up to one.", size=15), gap=4),
               Placeholder("interactive diagram | drag P inside ABC, weights update live", h=220),
               Col(T("If P sits exactly at vertex A, what are its weights?", size=15, weight="medium"),
                   *[Row(Dot(18, M_LO, stroke=M_MID), T(o, size=14), gap=12, p=12, bg=CANVAS, stroke=LINE, rounded=8)
                     for o in ["(1, 0, 0)", "(0, 1, 0)", "(1/3, 1/3, 1/3)", "(0.5, 0.5, 0)"]], gap=8),
               Row(Btn("I don't know"), Spacer(), Btn("Check", primary=True, w=140))]
    return Screen("05-session-focus", "Session focus mode", focus_shell("Step 3 of 7 · Teach · Barycentric coordinates", *content), "Learn", bar=False)

def s_session_feedback():
    opts = []
    for o, state in [("(1, 0, 0)", "correct"), ("(0, 1, 0)", None), ("(1/3, 1/3, 1/3)", "picked"), ("(0.5, 0.5, 0)", None)]:
        stroke = INK if state else LINE
        lab = T(o, size=14, grow=1)
        tag = Label("correct answer") if state == "correct" else (Label("your answer") if state == "picked" else "")
        opts.append(Row(Dot(18, INK if state == "picked" else M_LO, stroke=INK if state else M_MID), lab, tag, gap=12, p=12, bg=CANVAS, stroke=stroke, rounded=8))
    content = [T("Barycentric coordinates · Teach", size=22, weight="semibold"),
               Placeholder("interactive diagram (unchanged)", h=160),
               Col(T("If P sits exactly at vertex A, what are its weights?", size=15, weight="medium"), *opts, gap=8),
               Col(Row(T("Not quite.", size=15, weight="semibold"), T("Equal weights put P at the centroid, not a corner.", size=13, color=MUTED)),
                   Row(Label("p(L) 0.55 to 0.49"), Label("· this becomes a review card"), gap=6),
                   gap=6, p=14, w="fill", bg=PANEL, stroke=LINE, rounded=10),
               Row(Btn("Why?"), Btn("Ask the tutor"), Spacer(), Btn("Continue", primary=True, w=140))]
    return Screen("06-session-feedback", "Session feedback state", focus_shell("Step 3 of 7 · Teach · Barycentric coordinates", *content), "Learn", bar=False)

def s_session_close():
    def stat(n, l): return Col(T(n, size=28, weight="semibold"), Label(l), gap=2, items="center", grow=1, p=14, bg=CANVAS, stroke=LINE, rounded=10)
    content = [Col(T("Session closed", size=24, weight="semibold"), Label("Barycentric coordinates · 14 min · Probe, Teach, Close"), gap=4, items="center"),
               Row(stat("6 / 8", "questions right"), stat("+0.13", "mastery moved"), stat("2", "review cards added"), stat("1 / 2", "today's target"), gap=12),
               Card(Row(T("Barycentric coordinates", size=13, grow=1), BarFixed(84, 200, fg=M_MID), Label("0.42"), BarFixed(110, 200, fg=M_HI), Label("0.55")),
                    Row(T("Cross product (prerequisite)", size=13, grow=1), BarFixed(62, 200, fg=M_MID), Label("0.31"), BarFixed(70, 200, fg=M_HI), Label("0.35")),
                    title="What moved"),
               Card(Row(Dot(8, BOX2), T("Area ratio derivation", size=13, grow=1), Label("review in 10 min, then 1 day")),
                    Row(Dot(8, BOX2), T("Point at a vertex", size=13, grow=1), Label("review in 1 day")),
                    title="Scheduled"),
               Row(Btn("Back to Today"), Spacer(), Btn("Keep going · Perspective divide", primary=True))]
    return Screen("07-session-close", "Session close screen", focus_shell("Step 7 of 7 · Close", *content), "Learn", bar=False)

def s_review():
    def rate(l, iv, dark=False):
        return Col(T(l, size=14, weight="medium"), Label(iv), gap=4, items="center", grow=1, p=14, bg=CANVAS, stroke=LINE, rounded=10)
    content = [Row(Label("Review · 3 of 12 · CP4281 mostly"), Spacer(), Label("Est. 7 min left")),
               Col(Label("RECALL · Cross product"), T("What does the magnitude of a × b equal?", size=20, weight="semibold"), gap=6, p=24, w="fill", bg=CANVAS, stroke=LINE, rounded=12),
               Col(Label("ANSWER"), T("The area of the parallelogram spanned by a and b,", size=15), T("which is |a||b| sin θ.", size=15),
                   Row(Chip("[1] Lecture 3, slide 8"), T("Why?", size=11, color=ACCENT), T("Open concept", size=11, color=ACCENT), gap=10),
                   gap=6, p=24, w="fill", bg=PANEL, stroke=LINE, rounded=12),
               Col(Label("How well did you recall it?"), Row(rate("Again", "10 min"), rate("Hard", "1 day"), rate("Good", "4 days"), rate("Easy", "9 days"), gap=10), gap=8),
               Row(Label("Keys 1 to 4 · space reveals"), Spacer(), Label("ease 2.5 · 4 reps · last seen 4 days ago"))]
    return Screen("08-review", "Review session", focus_shell("Review · 3 of 12", *content), "Review", bar=False)

def s_learn_index():
    rows = [("Barycentric coordinates", "learning", 55, "Fri", "3 days", "CP4281 M2"),
            ("Cross product", "learning", 35, "today", "yesterday", "CP4281 M1"),
            ("Dot product", "mastered", 91, "today", "6 days", "CP4281 M1"),
            ("Homogeneous coordinates", "learning", 28, "overdue", "5 days", "CP4281 M1"),
            ("Model-view matrix", "mastered", 88, "Mon", "2 days", "CP4281 M2"),
            ("Requirements elicitation", "learning", 40, "Tue", "8 days", "CS3216 M1"),
            ("Perspective divide", "untouched", 0, "", "never", "CP4281 M2"),
            ("Tool-use loop", "untouched", 0, "", "never", "Agents M1")]
    def cell(node, w): return F(node, flex="row", w=w, items="center")
    table = Col(Row(cell(Label("CONCEPT"), 290), cell(Label("MASTERY"), 210), cell(Label("DUE"), 90), cell(Label("LAST SEEN"), 110), cell(Label("COURSE"), 120), gap=8, px=14, py=6),
                HR(),
                *[Col(Row(cell(Row(Mastery(m), T(c, size=13), gap=10, w=None), 290), cell(Row(BarFixed(int(p * 1.6), 160, fg=M_HI if m == "mastered" else M_MID), Label(f"{p/100:.2f}" if p else "–"), gap=8, w=None), 210), cell(Label(d or "–"), 90), cell(Label(ls), 110), cell(Label(co), 120), gap=8, px=14, py=10), HR(), gap=0)
                  for c, m, p, d, ls, co in rows], gap=0, w="fill", bg=CANVAS, stroke=LINE, rounded=10)
    body = Col(Row(T("Learn", size=22, weight="semibold"), Label("32 concepts · 9 mastered · 14 learning · 9 untouched"), Spacer(),
                   F(T("Search concepts", size=12, color=MUTED), flex="row", w=260, h=34, px=12, items="center", bg=CANVAS, stroke=LINE, rounded=8), Btn("Add concept")),
               Row(Chip("All", True), Chip("Due"), Chip("Learning"), Chip("Mastered"), Chip("Untouched"), Chip("Leeches"), Spacer(), Chip("Table", True), Chip("Graph"), gap=8),
               Row(Col(table, w=992), Card(Placeholder("neighbourhood graph of the | selected concept, mastery-coloured | toggle: full course", h=300), Btn("Open in workspace", small=True), w=380, title="Graph"), gap=20, items="start"),
               gap=16, p=24)
    return Screen("09-learn-index", "Learn index", body, "Learn")

def s_library():
    def asset(kind, title, meta, concept):
        return Card(Placeholder(kind, h=110), Row(Chip(kind), Label(meta)), T(title, size=13, weight="medium"), Row(Mastery("learning"), Label(concept)), w=300, gap=8, p=12)
    grid = Col(Row(asset("video", "Barycentric interpolation", "4:12 · manim", "Barycentric coordinates"), asset("diagram", "Triangle areas", "svg · tldraw", "Barycentric coordinates"), asset("note", "Cross product", "concept note", "Cross product"), asset("session", "Teach · Cross product", "yesterday", "Cross product"), gap=16, items="start"),
               Row(asset("video", "Dot product explainer", "3:40 · manim", "Dot product"), asset("diagram", "Projection onto a line", "svg", "Dot product"), asset("link", "Scratchapixel: rasterisation", "external", "Scan conversion"), asset("video", "Model-view walkthrough", "6:02", "Model-view matrix"), gap=16, items="start"), gap=16)
    body = Col(Row(T("Library", size=22, weight="semibold"), Label("208 assets"), Spacer(), F(T("Search titles, transcripts, notes", size=12, color=MUTED), flex="row", w=320, h=34, px=12, items="center", bg=CANVAS, stroke=LINE, rounded=8)),
               Row(Chip("All kinds", True), Chip("Video"), Chip("Diagram"), Chip("Note"), Chip("Session"), Chip("Link"), F(w=16), Chip("CP4281", True), Chip("CS3216"), Chip("Agents"), Spacer(), Label("Sort: newest"), gap=8),
               grid, gap=16, p=24)
    return Screen("10-library", "Library", body, "Library")

def s_library_asset():
    main = Col(Placeholder("video player · 4:12", h=400), Row(Label("Chapters"), Chip("Intro 0:00"), Chip("Weights 0:48"), Chip("Areas 2:10"), Chip("Edge cases 3:30"), gap=8),
               Card(T("Transcript", size=13, weight="semibold"), *[T(l, size=13, color=MUTED) for l in ["0:00 A point inside a triangle can be described by three numbers.", "0:48 Each weight is the area of the opposite sub-triangle over the whole.", "2:10 That is why they sum to one."]], gap=6), gap=14, grow=1)
    rail = Col(Card(Label("VIDEO · manim · rendered 2026-09-12"), T("Barycentric interpolation", size=18, weight="semibold"), Row(Btn("Mark watched", primary=True), Btn("Add to note")), gap=8),
               Card(Row(Mastery("learning"), T("Barycentric coordinates", size=13, grow=1), Label("0.55")), Row(Mastery("mastered"), T("Dot product", size=13, grow=1), Label("0.91")), Btn("Open workspace", small=True), title="Explains"),
               Card(Row(Placeholder("diagram", w=64, h=44), T("Triangle areas", size=12)), Row(Placeholder("note", w=64, h=44), T("Barycentric coordinates", size=12)), title="Related"),
               Card(Label("source scene.py · narration.json · mirror ok"), title="Derived from"), gap=16, w=380)
    return Screen("11-library-asset", "Library asset", Row(main, rail, gap=20, w="fill", grow=1, items="start", p=24), "Library")

def s_settings():
    def field(l, v, note=None):
        return Row(Col(T(l, size=13, weight="medium"), Label(note) if note else "", gap=2, w=320), F(T(v, size=13), flex="row", w=260, h=34, px=12, items="center", bg=CANVAS, stroke=LINE, rounded=8), gap=16)
    body = Col(T("Settings", size=22, weight="semibold"),
               Card(field("Daily target", "One concept + due reviews", "You set it. The app never raises it."), field("Streak leeway", "1 free miss per week"), field("Reminders", "Facts only · 9:00"), title="Habit"),
               Card(field("Theme", "System"), field("Tutor style", "Learning guide · concise"), field("Motion", "Respect system reduced motion"), title="Appearance and tutor"),
               Card(field("BKT priors", "pL0 0.2 · pT 0.1 · pG 0.2 · pS 0.1", "Advanced. Changes future observations only."), field("Model providers", "Order: 3 free tiers"), Row(Btn("Export learner data"), Btn("Reset progress")), title="Model"),
               gap=16, w=900, p=24)
    return Screen("12-settings", "Settings", body, "Today")

def p_today():
    body = Col(Card(Label("NEXT UP · CP4281 M2"), T("Barycentric coordinates", size=17, weight="semibold"), Row(Mastery("learning"), Label("p(L) 0.42")), Btn("Continue", primary=True), gap=8, p=14),
               Row(Card(T("1 / 2", size=22, weight="semibold"), Label("target"), gap=2, p=12), Card(T("14", size=22, weight="semibold"), Label("streak · 1 miss left"), gap=2, p=12), gap=10),
               Card(*[Row(Mastery(m), T(c, size=13, grow=1), Label(d)) for c, m, d in [("Dot product", "mastered", "today"), ("Cross product", "learning", "today"), ("Homogeneous coords", "learning", "1d late")]], Btn("Start review · 12", primary=True), title="Reviews due", gap=8, p=14),
               Card(Row(Label("Yesterday"), T("Teach · Cross product · 5/6", size=12)), Row(Label("Mon"), T("Review · 9 cards", size=12)), title="Recent", gap=8, p=14),
               gap=12, p=14, vgrow=1)
    return Phone("13-phone-today", "Today", body, "Today")

def p_review():
    def rate(l, iv): return Col(T(l, size=13, weight="medium"), Label(iv), gap=2, items="center", grow=1, py=12, bg=CANVAS, stroke=LINE, rounded=10)
    body = Col(F(R("25%", 3, bg=INK, rounded=0), flex="row", w="fill", h=3, bg=BOX, rounded=0),
               Row(Label("3 of 12"), Spacer(), Label("Exit"), px=14, py=8),
               Col(Label("RECALL · Cross product"), T("What does the magnitude", size=17, weight="semibold"), T("of a × b equal?", size=17, weight="semibold"), gap=4, p=16, w="fill", bg=CANVAS, stroke=LINE, rounded=12),
               Col(Label("ANSWER"), T("Area of the parallelogram", size=14), T("spanned by a and b: |a||b| sin θ.", size=14), Row(Chip("[1] L3 s8"), T("Why?", size=11, color=ACCENT)), gap=4, p=16, w="fill", bg=PANEL, stroke=LINE, rounded=12),
               Spacer(),
               Row(rate("Again", "10m"), rate("Hard", "1d"), rate("Good", "4d"), rate("Easy", "9d"), gap=6),
               gap=12, p=14, vgrow=1)
    return Phone("14-phone-review", "Review", body, "Review")

def p_session():
    body = Col(F(R("43%", 3, bg=INK, rounded=0), flex="row", w="fill", h=3, bg=BOX, rounded=0),
               Row(Label("Step 3 of 7 · Teach"), Spacer(), Label("Exit"), px=14, py=8),
               Col(T("Barycentric coordinates", size=17, weight="semibold"), T("Any point inside a triangle is a", size=14), T("weighted mix of its corners.", size=14), gap=4),
               Placeholder("interactive diagram", h=180),
               Col(T("P at vertex A: weights?", size=14, weight="medium"), *[Row(Dot(16, M_LO, stroke=M_MID), T(o, size=13), gap=10, p=10, bg=CANVAS, stroke=LINE, rounded=8) for o in ["(1, 0, 0)", "(0, 1, 0)", "(1/3, 1/3, 1/3)", "(0.5, 0.5, 0)"]], gap=6),
               Spacer(), Row(Btn("Don't know", small=True), Spacer(), Btn("Check", primary=True)),
               gap=12, p=14, vgrow=1)
    return Phone("15-phone-session", "Session", body, "Learn")

SCREENS = [s_today, s_courses, s_course_path, s_workspace, s_session, s_session_feedback, s_session_close,
           s_review, s_learn_index, s_library, s_library_asset, s_settings, p_today, p_review, p_session]

def slug_of(fn): return fn().split('name="', 1)[1].split('"', 1)[0]

def main():
    os.makedirs(OUT, exist_ok=True)
    want = set(sys.argv[1:]); failures = []
    tree = call("get_page_tree", {})
    existing = {}
    def walk(n):
        if isinstance(n, dict):
            if "name" in n and "id" in n: existing.setdefault(n["name"], n["id"])
            for c in n.get("children", []) or []: walk(c)
        elif isinstance(n, list):
            for c in n: walk(c)
    walk(tree.get("children") or tree.get("tree") or tree)
    for i, fn in enumerate(SCREENS):
        jsx = fn(); slug = jsx.split('name="', 1)[1].split('"', 1)[0]
        if want and slug not in want and str(i + 1) not in want: continue
        phone = slug.split("-", 1)[1].startswith("phone")
        col = i % 4; row = i // 4
        x = col * 1600; y = row * 1100
        if slug in existing:
            call("delete_node", {"id": existing[slug]})
        res = call("render", {"x": x, "y": y, "jsx": jsx})
        if "id" not in res:
            failures.append(f"{slug}: render failed: {json.dumps(res)[:300]}"); print(failures[-1]); continue
        warn = res.get("warnings") or []
        exported = call("export_svg", {"ids": [res["id"]]})
        svg = exported.get("svg") or ""
        if not svg.startswith("<?xml") or "<svg" not in svg:
            failures.append(f"{slug}: export failed, existing SVG left alone: {json.dumps(exported)[:300]}"); print(failures[-1]); continue
        path = os.path.join(OUT, f"{slug}.svg"); open(path, "w").write(svg)
        print(f"{slug}: id={res['id']} svg={len(svg)}B warnings={len(warn)}", ("; ".join(warn[:3]) if warn else ""))
    saved = call("save_file", {"path": os.path.join(REPO, "docs/design/self-learn-lofi.fig")})
    if not saved.get("saved"):
        failures.append(f"save_file failed: {json.dumps(saved)[:300]}")
    print("saved:", bool(saved.get("saved")))
    if failures:
        print(f"{len(failures)} failure(s):"); [print("  " + f) for f in failures]
        sys.exit(1)

if __name__ == "__main__":
    main()
