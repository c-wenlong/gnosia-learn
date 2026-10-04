#!/usr/bin/env python3
"""Build tokens.json (W3C DTCG, Tokens Studio multi-set layout) from the raw captures.

Sources, all read from www.gauth.com on 2026-10-04:
  raw/css-vars.json          every custom property the pages declare, by stylesheet, selector and media
                             condition, sorted by owner (gauth, astryx, tux, antd, ...)
  raw/component-tokens.json  the token tree: each leaf either names a Gauth variable ("var") whose
                             value is read from css-vars.json, or carries a measured value and the
                             measurement it came from ("source")
Every token carries $extensions.source: "css-var <name> (<selector>)" or "measured <where>".

Gauth paints one theme. The light set holds the semantic roles and component colours; there is
no dark set (README.md, "How the values were read", says why).

Deterministic: same inputs, byte-identical output. Edit the raw inputs, never tokens.json.
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent.parent
RAW = HERE / "raw"
V = json.loads((RAW / "css-vars.json").read_text())
SPEC = json.loads((RAW / "component-tokens.json").read_text())

# Gauth's own declarations, looked up by name. Where a name is declared under several selectors the
# root-level rule wins, then the lesson page rule, then the first one listed.
PREF = [':root, [data-lesson-style="light"]', ":root", "html:root", ":root, html:root", ".lesson_lessonPage"]
DECL = {}
for d in V["decls"]:
    if d["owner"] != "gauth" or d["media"]:
        continue
    cur = DECL.get(d["name"])
    rank = PREF.index(d["selector"]) if d["selector"] in PREF else len(PREF)
    if cur is None or rank < cur[0]:
        DECL[d["name"]] = (rank, d)


def norm_color(v):
    """#rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsla() -> #rrggbb or rgba(r, g, b, a)."""
    v = v.strip().lower()
    m = re.fullmatch(r"#([0-9a-f]{3,8})", v)
    if m:
        h = m.group(1)
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        if len(h) == 8:
            a = round(int(h[6:8], 16) / 255, 3)
            return "#%02x%02x%02x" % (r, g, b) if a == 1 else "rgba(%d, %d, %d, %s)" % (r, g, b, ("%g" % a))
        return "#%02x%02x%02x" % (r, g, b)
    m = re.fullmatch(r"rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)", v)
    if m:
        r, g, b, a = m.groups()
        if a is None:
            return "#%02x%02x%02x" % (int(r), int(g), int(b))
        a = float(a[:-1]) / 100 if a.endswith("%") else float(a)
        return "#%02x%02x%02x" % (int(r), int(g), int(b)) if a == 1 else "rgba(%s, %s, %s, %g)" % (r, g, b, a)
    m = re.fullmatch(r"hsla?\(\s*0\s*,\s*0%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\)", v)
    if m:
        lvl = round(float(m.group(1)) * 2.55)
        a = float(m.group(2) or 1)
        return "#%02x%02x%02x" % (lvl, lvl, lvl) if a == 1 else "rgba(%d, %d, %d, %g)" % (lvl, lvl, lvl, a)
    raise ValueError("not a colour: " + v)


DIM = re.compile(r"-?\d+(\.\d+)?(px|rem)")


def check(path, ty, val):
    """Refuse a value that is not the DTCG type it claims."""
    if ty == "dimension" and not DIM.fullmatch(str(val)):
        raise ValueError(f"{path}: dimension must be one px or rem length, got {val!r}")
    if ty == "color":
        norm_color(val) if not str(val).startswith("{") else None
    if ty == "shadow":
        for layer in val:
            for k in ("offsetX", "offsetY", "blur", "spread"):
                if not DIM.fullmatch(layer[k]):
                    raise ValueError(f"{path}: shadow {k} {layer[k]!r}")
    if ty == "number" and not isinstance(val, (int, float)):
        raise ValueError(f"{path}: number {val!r}")
    if ty == "fontWeight" and not isinstance(val, int):
        raise ValueError(f"{path}: fontWeight {val!r}")
    if ty == "duration" and not re.fullmatch(r"\d+ms", str(val)):
        raise ValueError(f"{path}: duration {val!r}")
    if ty == "cubicBezier" and not (isinstance(val, list) and len(val) == 4):
        raise ValueError(f"{path}: cubicBezier {val!r}")
    if ty == "gradient":
        for stop in val:
            if not str(stop["color"]).startswith("{"):
                norm_color(stop["color"])
            if not 0 <= stop["position"] <= 1:
                raise ValueError(f"{path}: gradient position {stop['position']!r}")


def leaf(path, spec):
    ty = spec["type"]
    if "var" in spec:
        name = spec["var"]
        if name not in DECL:
            raise KeyError(f"{path}: {name} is not a Gauth variable in raw/css-vars.json")
        d = DECL[name][1]
        val = d["value"]
        src = f"css-var {name} ({d['selector']})"
        if spec.get("source"):
            src += "; " + spec["source"]
    else:
        val = spec["value"]
        src = spec["source"]
    if ty == "color" and not str(val).startswith("{"):
        val = norm_color(val)
    if ty == "fontWeight" and isinstance(val, str) and val.isdigit():
        val = int(val)
    if ty == "dimension" and isinstance(val, str) and re.fullmatch(r"-?\d+(\.\d+)?", val):
        val += "px"
    check(path, ty, val)
    t = {"$value": val, "$type": ty, "$extensions": {"source": src}}
    if spec.get("description"):
        t["$description"] = spec["description"]
    if spec.get("responsive"):
        t["$extensions"]["responsive"] = spec["responsive"]
    if spec.get("angle"):
        t["$extensions"]["angle"] = spec["angle"]
    return t


def build(node, path=""):
    if isinstance(node, dict) and "type" in node and ("value" in node or "var" in node):
        return leaf(path, node)
    return {k: build(v, f"{path}.{k}" if path else k) for k, v in node.items() if not k.startswith("_")}


core = build(SPEC["core"])
light = build(SPEC["light"])


# every alias must point at a token that exists
def tokens_of(tree, prefix=""):
    for k, v in tree.items():
        if isinstance(v, dict) and "$value" in v:
            yield prefix + k, v
        elif isinstance(v, dict):
            yield from tokens_of(v, prefix + k + ".")


NAMES = {n for n, _ in tokens_of(core)} | {n for n, _ in tokens_of(light)}


def aliases(v):
    if isinstance(v, str):
        return re.findall(r"\{([^{}]+)\}", v)
    if isinstance(v, dict):
        return [a for x in v.values() for a in aliases(x)]
    if isinstance(v, list):
        return [a for x in v for a in aliases(x)]
    return []


for n, t in list(tokens_of(core)) + list(tokens_of(light)):
    for a in aliases(t["$value"]):
        if a not in NAMES:
            raise KeyError(f"{n}: alias {{{a}}} points at nothing")

tokens = {
    "core": core,
    "light": light,
    "$themes": [
        {"id": "light", "name": "Light", "selectedTokenSets": {"core": "source", "light": "enabled"},
         "$description": "The only theme Gauth paints; no dark theme is offered on any page captured"},
    ],
    "$metadata": {"tokenSetOrder": ["core", "light"]},
}
(HERE / "tokens.json").write_text(json.dumps(tokens, indent=2, ensure_ascii=False) + "\n")


def count(d):
    return sum(count(v) for v in d.values()) if isinstance(d, dict) and "$value" not in d else 1


print({k: count(v) for k, v in tokens.items() if k in ("core", "light")})
