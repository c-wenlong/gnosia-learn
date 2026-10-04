#!/usr/bin/env python3
"""Render style-guide.html from tokens.json + tools/style-guide.template.html.

Every token becomes a CSS custom property on :root, named by its path with dots as dashes
(graph.node.halo-gap -> --graph-node-halo-gap), and an alias {palette.ugc.amber} becomes
var(--palette-ugc-amber). The page's chrome and its live graph demo read only those properties,
so the guide cannot drift from the token file. ResearchRabbit paints one theme, so the page is
light only. Adapted from the Gauth kit's builder.

The template carries two kinds of placeholder:
  /*CORE*/ /*LIGHT*/     CSS custom property blocks
  /*TOKENS*/null         a compact copy of the token tree, for the tables

Python 3 standard library only. Deterministic: same inputs, byte-identical output.
Run tools/build_tokens.py first when the raw inputs change.
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent.parent
T = json.loads((HERE / "tokens.json").read_text())
GENERIC = {"serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-monospace"}


def flat(node, prefix=""):
    for k, v in node.items():
        if k.startswith("$"):
            continue
        if isinstance(v, dict) and "$value" in v:
            yield prefix + k, v
        elif isinstance(v, dict):
            yield from flat(v, prefix + k + ".")


def cssname(path):
    return "--" + re.sub(r"[^a-zA-Z0-9-]", "-", path.replace(".", "-"))


def alias(v):
    return re.sub(r"\{([^{}]+)\}", lambda m: f"var({cssname(m.group(1))})", str(v))


def family(v):
    if isinstance(v, str):
        return alias(v)
    return ", ".join(f if f in GENERIC else f'"{f}"' for f in v)


def num(v):
    return json.dumps(v)


def css_val(t):
    v, ty = t["$value"], t["$type"]
    if isinstance(v, str) and v.startswith("{"):
        return alias(v)
    if ty == "cubicBezier":
        return "cubic-bezier(%s)" % ", ".join(num(x) for x in v)
    if ty == "shadow":
        return ", ".join(("inset " if s.get("inset") else "") + f'{s["offsetX"]} {s["offsetY"]} {s["blur"]} {s["spread"]} {alias(s["color"])}' for s in v)
    if ty == "typography":
        return f'{alias(v["fontWeight"])} {alias(v["fontSize"])}/{num(v["lineHeight"])} {family(v["fontFamily"])}'
    if ty == "fontFamily":
        return family(v)
    if ty in ("number", "fontWeight"):
        return num(v)
    return str(v)


def block(setname):
    return "\n".join(f"  {cssname(n)}: {css_val(t)};" for n, t in flat(T[setname]))


def slim(node):
    if isinstance(node, dict) and "$value" in node:
        out = {"v": node["$value"], "t": node["$type"], "s": node["$extensions"]["source"], "d": node.get("$description", "")}
        extra = {k: v for k, v in node["$extensions"].items() if k != "source"}
        if extra:
            out["x"] = extra
        return out
    return {k: slim(v) for k, v in node.items() if not k.startswith("$")}


data = json.dumps({k: slim(T[k]) for k in ("core", "light")}, ensure_ascii=False, separators=(",", ":"))
tpl = (HERE / "tools" / "style-guide.template.html").read_text()
for ph in ("/*CORE*/", "/*LIGHT*/", "/*TOKENS*/null"):
    if tpl.count(ph) != 1:
        raise ValueError(f"template must hold {ph} exactly once")
html = tpl.replace("/*CORE*/", block("core")).replace("/*LIGHT*/", block("light")).replace("/*TOKENS*/null", data)

# every var(--x) the page's own code uses, and every token the demo reads, must exist. The token
# data block is left out (its sources quote the app's own var(--1) and so on), and so are names
# built at run time in a template literal (they end in "-" here).
code = tpl.replace("/*CORE*/", block("core")).replace("/*LIGHT*/", block("light"))
declared = set(re.findall(r"(--[a-zA-Z0-9-]+)\s*:", code))
used = {m for m in re.findall(r"var\((--[a-zA-Z0-9-]+)", code) if not m.endswith("-")}
used |= {"--" + m for m in re.findall(r"\b(?:tok|num|curve)\('([a-zA-Z0-9-]+)'\)", code)}  # the demo's token reads
missing = sorted(used - declared)
if missing:
    raise KeyError("the page uses undeclared custom properties: " + ", ".join(missing))

(HERE / "style-guide.html").write_text(html)
print("style-guide.html:", len(html.encode()), "bytes;", len(list(flat(T["core"]))), "core +", len(list(flat(T["light"]))), "light tokens")
