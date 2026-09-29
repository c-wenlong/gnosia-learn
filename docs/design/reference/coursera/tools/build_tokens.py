#!/usr/bin/env python3
"""Build tokens.json (W3C DTCG, Tokens Studio multi-set layout) from the raw captures.

Sources, all read from coursera.org on 2026-09-29:
  raw/css-vars.json          every --cds-* custom property, by selector and media condition
                             (decls), computed at 390/768/1024/1440 wide (resolvedByWidth), and
                             every colour variable painted in the light and the forced dark scheme
                             (colorProbe)
  raw/component-tokens.json  component values picked from the measurements, each with its source
Every token carries $extensions.source: "css-var <name>", "computed <where>" or "measured <where>".

CDS writes each colour as light-dark(<light>, <dark>). The palette ramps flip in the dark scheme
(blue.800 paints as blue.300 does in light), so core.palette holds each ramp's light values and
the light and dark sets alias the step each semantic role paints in that scheme.
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent.parent
RAW = HERE / "raw"
V = json.loads((RAW / "css-vars.json").read_text())
ROOT = V["root"]
BY_W = V["resolvedByWidth"]
PROBE = V["colorProbe"]
COMP = json.loads((RAW / "component-tokens.json").read_text()) if (RAW / "component-tokens.json").exists() else {}
C = "--cds-"


def tok(value, type_, source, desc=None):
    t = {"$value": value, "$type": type_, "$extensions": {"source": source}}
    if desc:
        t["$description"] = desc
    return t


def rgb_to_css(s):
    """rgb(0, 86, 210) -> #0056d2; rgba(15, 17, 20, 0.5) -> rgba(15, 17, 20, 0.5)."""
    m = re.fullmatch(r"rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)", s.strip())
    if not m:
        return s
    r, g, b, a = m.groups()
    if a is None or float(a) == 1:
        return "#%02x%02x%02x" % (int(r), int(g), int(b))
    return "rgba(%s, %s, %s, %s)" % (r, g, b, a)


def num_key(k):
    return int(k.replace("minus", "-")) if re.fullmatch(r"(minus)?\d+", k) else 0


# ---------- palette: the light side of each ramp ----------
HUES = ["blue", "grey", "purple", "pink", "red", "green", "yellow"]
palette, BY_HEX = {}, {}
for hue in HUES:
    steps = {}
    for k in ROOT:
        m = re.fullmatch(rf"--cds-color-{hue}-(\d+)", k)
        if m:
            steps[m.group(1)] = rgb_to_css(PROBE["light"][k])
    palette[hue] = {s: tok(v, "color", f"css-var {C}color-{hue}-{s} (light side)")
                    for s, v in sorted(steps.items(), key=lambda kv: int(kv[0]))}
    for s, v in steps.items():
        BY_HEX.setdefault(v, "{palette.%s.%s}" % (hue, s))
palette["white"] = tok("#ffffff", "color", f"css-var {C}color-white-0 (light side)")
palette["black"] = tok("#000000", "color", f"css-var {C}color-white-0 (dark side)")
BY_HEX.setdefault("#ffffff", "{palette.white}")
BY_HEX.setdefault("#000000", "{palette.black}")
for kind in ("darken", "lighten"):
    steps = {}
    for k in ROOT:
        m = re.fullmatch(rf"--cds-color-{kind}-(\d+)", k)
        if m:
            steps[m.group(1)] = rgb_to_css(PROBE["light"][k])
    palette[kind] = {s: tok(v, "color", f"css-var {C}color-{kind}-{s} (light side)",
                            "Ink at an opacity; the dark side swaps ink and paper" if s == "500" else None)
                     for s, v in sorted(steps.items(), key=lambda kv: int(kv[0]))}
    for s, v in steps.items():
        BY_HEX.setdefault(v, "{palette.%s.%s}" % (kind, s))


def color_for(name, scheme):
    """Alias to a palette step when the painted value is one, else the literal."""
    v = rgb_to_css(PROBE[scheme][name])
    return BY_HEX.get(v, v)


core = {"palette": palette}

# ---------- type ----------
core["fontFamily"] = {
    "source-sans-pro": tok(ROOT[C + "font-family-source-sans-pro"], "fontFamily", f"css-var {C}font-family-source-sans-pro",
                           "Every UI string. Served as Source Sans 3 under the family name Source Sans Pro"),
    "boutros-coursera": tok(ROOT[C + "font-family-boutros-coursera"], "fontFamily", f"css-var {C}font-family-boutros-coursera",
                            "Arabic script"),
}
core["fontWeight"] = {k.split("-")[-1]: tok(int(v), "fontWeights", f"css-var {k}")
                      for k, v in ROOT.items() if re.fullmatch(r"--cds-font-weight-\d+", k)}
core["fontSize"] = {k.split("-")[-1]: tok(v, "fontSizes", f"css-var {k}")
                    for k, v in sorted(ROOT.items(), key=lambda kv: num_key(kv[0].split("-")[-1]))
                    if re.fullmatch(r"--cds-font-size-\d+", k)}
core["lineHeight"] = {k.split("-")[-1]: tok(v, "lineHeights", f"css-var {k}")
                      for k, v in sorted(ROOT.items(), key=lambda kv: num_key(kv[0].split("-")[-1]))
                      if re.fullmatch(r"--cds-line-height-\d+", k)}
core["letterSpacing"] = {k.split("-")[-1]: tok(v, "letterSpacing", f"css-var {k}")
                         for k, v in ROOT.items() if re.fullmatch(r"--cds-letter-spacing-(minus)?\d+", k)}


def parse_font(s):
    m = re.fullmatch(r"(\d+)\s+([\d.]+rem)/([\d.]+rem)\s+(.+)", s.strip())
    return m.groups() if m else None


FAMILY_REF = {ROOT[C + "font-family-source-sans-pro"]: "{fontFamily.source-sans-pro}"}
LS = {  # the legacy styles carry a letter-spacing variable of their own
    "display1": "display1", "display2": "display2", "title1": "title1", "title2": "title2",
    "title3": "title3", "title4": "title4", "body1": "body1", "body2": "body2",
}
typography = {}
names = sorted({k[len(C + "typography-"):] for k in ROOT if k.startswith(C + "typography-")})
for n in names:
    base = n.split("-")[0].replace("-strong", "")
    key = next((v for k, v in LS.items() if n == k or n.startswith(k + "-")), None)
    ls_var = f"{C}letter-spacing-{key}" if key else None
    ls = BY_W["1440"].get(ls_var, "0em") if ls_var else "0em"
    if n.endswith("-sm") or n.endswith("-xs") or "-sm-" in n or "-xs-" in n or "-lg" in n:
        continue  # breakpoint variants are folded into $extensions.responsive below
    widths = {}
    for w in ("1440", "1024", "768", "390"):
        p = parse_font(BY_W[w][C + "typography-" + n])
        if p:
            widths[w] = p
    if "1440" not in widths:
        continue
    wt, size, lh, fam = widths["1440"]
    t = tok({"fontFamily": FAMILY_REF.get(fam, fam), "fontWeight": int(wt), "fontSize": size, "lineHeight": lh, "letterSpacing": ls},
            "typography", f"css-var {C}typography-{n} (computed at 1440)")
    resp = {}
    for w, label in (("768", "below 1024"), ("390", "below 600")):
        if w in widths and widths[w][1:3] != widths["1440"][1:3]:
            resp[label] = {"fontSize": widths[w][1], "lineHeight": widths[w][2], "fontWeight": int(widths[w][0])}
    if resp:
        t["$extensions"]["responsive"] = resp
    typography[n] = t
core["typography"] = typography

# ---------- space, shape, breakpoints ----------
core["spacing"] = {k.split("-")[-1]: tok(v, "spacing", f"css-var {k}")
                   for k, v in sorted(ROOT.items(), key=lambda kv: num_key(kv[0].split("-")[-1]))
                   if re.fullmatch(r"--cds-spacing-\d+", k)}
core["spacing"]["base"] = tok(ROOT[C + "base"] + "px", "spacing", f"css-var {C}base", "The 8px grid every step is a multiple or half of")
core["radius"] = {k.split("-")[-1]: tok(v, "borderRadius", f"css-var {k}")
                  for k, v in sorted(ROOT.items(), key=lambda kv: num_key(kv[0].split("-")[-1]))
                  if re.fullmatch(r"--cds-border-radius-(\d+|max)", k)}
core["breakpoint"] = {
    "sm": tok("600px", "dimension", "css @media (max-width: 599.95px)", "Below this the xs type scale applies"),
    "md": tok("1024px", "dimension", "css @media (max-width: 1023.95px)", "Below this the sm type scale applies"),
}
core["textDecoration"] = {"link": tok(ROOT[C + "text-decoration-link"], "textDecoration", f"css-var {C}text-decoration-link")}
for group, vals in COMP.get("core", {}).items():
    core[group] = {k: tok(v["value"], v["type"], v["source"], v.get("description")) for k, v in vals.items()}


# ---------- light and dark ----------
def semantic(scheme):
    out = {}
    for k in ROOT:
        m = re.fullmatch(r"--cds-color-(neutral|interactive|feedback|emphasis|callouts|utility)-(.+)", k)
        if not m:
            continue
        group, rest = m.groups()
        out.setdefault(group, {})[rest] = tok(color_for(k, scheme), "color", f"css-var {k} ({scheme} side)",
                                              "Declared as a literal, not a light-dark() pair" if "light-dark" not in ROOT[k] and not ROOT[k].startswith("var(") else None)
    for g in out:
        out[g] = dict(sorted(out[g].items()))
    shadows = {}
    for lvl in ("level1", "level2", "level3"):
        raw = ROOT[f"{C}elevation-{lvl}"]
        layers = []
        for part in re.split(r",(?=\s*-?\d+px)", raw):
            m = re.match(r"\s*(-?\d+)px\s+(-?\d+)px\s+(\d+)px\s+(\d+)px\s+light-dark\((rgb\([^)]*\)),\s*(rgb\([^)]*\))\)", part)
            if m:
                x, y, blur, spread, lc, dc = m.groups()
                col = lc if scheme == "light" else dc
                cm = re.match(r"rgb\((\d+) (\d+) (\d+) / (\d+)%\)", col)
                color = "rgba(%s, %s, %s, %s)" % (cm.group(1), cm.group(2), cm.group(3), int(cm.group(4)) / 100) if cm else col
                layers.append({"x": f"{x}px", "y": f"{y}px", "blur": f"{blur}px", "spread": f"{spread}px", "color": color, "type": "dropShadow"})
        shadows[lvl] = tok(layers, "boxShadow", f"css-var {C}elevation-{lvl} ({scheme} side)")
    out["elevation"] = shadows
    comp = COMP.get(scheme, {})
    if comp:
        out["component"] = {c: {k: tok(v["value"], v["type"], v["source"], v.get("description")) for k, v in vals.items()}
                            for c, vals in comp.items()}
    return out


tokens = {
    "core": core,
    "light": semantic("light"),
    "dark": semantic("dark"),
    "$themes": [
        {"id": "light", "name": "Light", "selectedTokenSets": {"core": "source", "light": "enabled"}},
        {"id": "dark", "name": "Dark", "selectedTokenSets": {"core": "source", "dark": "enabled"},
         "$description": "Defined by every light-dark() pair in CDS but not offered to learners on the pages captured"},
    ],
    "$metadata": {"tokenSetOrder": ["core", "light", "dark"]},
}
(HERE / "tokens.json").write_text(json.dumps(tokens, indent=2, ensure_ascii=False) + "\n")


def count(d):
    return sum(count(v) for v in d.values()) if isinstance(d, dict) and "$value" not in d else 1


print({k: count(v) for k, v in tokens.items() if k in ("core", "light", "dark")})
