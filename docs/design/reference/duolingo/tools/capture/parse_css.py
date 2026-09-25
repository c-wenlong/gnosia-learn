#!/usr/bin/env python3
"""
Parse every minified CSS chunk under ./css/ into design-token statistics.

Stdlib-only hand parser (no tinycss2 available in this environment). Handles
nested @media / @supports blocks, @font-face, @keyframes, strings, and
url(...)/calc(...) parens that might otherwise confuse a naive brace scanner.

Writes ./css-stats.json and ./css-stats.md. Never touches anything outside
this directory.
"""
import json
import os
import re
import sys
from collections import defaultdict, OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
CSS_DIR = os.path.join(HERE, "css")
JS_DIR = os.path.join(HERE, "js")
OUT_JSON = os.path.join(HERE, "css-stats.json")
OUT_MD = os.path.join(HERE, "css-stats.md")

MAX_EXAMPLES = 5
MAX_FILES = 3

# ---------------------------------------------------------------------------
# Generic recursive-descent-ish block parser
# ---------------------------------------------------------------------------
# Grammar we actually need to handle, structurally identical whether we are
# at stylesheet top level or inside a rule body:
#   block-content := (prelude ('{' block-content '}' | ';'))*
# We track paren depth and quotes while scanning for the terminators '{', ';'
# and '}' so that url(...) / calc(...) / "string;with;semicolons" don't
# trip the scanner.


def parse_block(s, i, n):
    """Parse block-content starting at s[i]. Returns (items, next_index).

    Each item is a tuple (prelude, sub_items_or_None, kind) where kind is
    'block' (prelude was followed by { sub_items }) or 'simple' (prelude was
    terminated by ';' or the enclosing '}').
    """
    items = []
    while i < n:
        c = s[i]
        if c in " \t\n\r":
            i += 1
            continue
        if c == "}":
            return items, i + 1
        if c == "/" and s[i : i + 2] == "/*":
            end = s.find("*/", i + 2)
            i = end + 2 if end != -1 else n
            continue
        j = i
        paren_depth = 0
        quote = None
        while j < n:
            cj = s[j]
            if quote:
                if cj == "\\":
                    j += 2
                    continue
                if cj == quote:
                    quote = None
                j += 1
                continue
            if cj in ("'", '"'):
                quote = cj
                j += 1
                continue
            if cj == "(":
                paren_depth += 1
                j += 1
                continue
            if cj == ")":
                if paren_depth > 0:
                    paren_depth -= 1
                j += 1
                continue
            if cj == "/" and s[j : j + 2] == "/*":
                end = s.find("*/", j + 2)
                j = end + 2 if end != -1 else n
                continue
            if paren_depth == 0 and cj in ("{", ";", "}"):
                break
            j += 1
        prelude = s[i:j].strip()
        if j >= n:
            if prelude:
                items.append((prelude, None, "simple"))
            i = j
            break
        term = s[j]
        if term == "{":
            sub_items, after = parse_block(s, j + 1, n)
            items.append((prelude, sub_items, "block"))
            i = after
        elif term == ";":
            if prelude:
                items.append((prelude, None, "simple"))
            i = j + 1
        elif term == "}":
            if prelude:
                items.append((prelude, None, "simple"))
            return items, j + 1
    return items, i


def split_top_level_commas(s):
    """Split a selector list / value list on top-level commas (paren/quote aware)."""
    parts = []
    buf = []
    depth = 0
    quote = None
    i = 0
    n = len(s)
    while i < n:
        c = s[i]
        if quote:
            buf.append(c)
            if c == "\\":
                i += 1
                if i < n:
                    buf.append(s[i])
            elif c == quote:
                quote = None
            i += 1
            continue
        if c in ("'", '"'):
            quote = c
            buf.append(c)
            i += 1
            continue
        if c == "(":
            depth += 1
            buf.append(c)
            i += 1
            continue
        if c == ")":
            depth = max(0, depth - 1)
            buf.append(c)
            i += 1
            continue
        if c == "," and depth == 0:
            parts.append("".join(buf).strip())
            buf = []
            i += 1
            continue
        buf.append(c)
        i += 1
    if buf:
        parts.append("".join(buf).strip())
    return [p for p in parts if p]


AT_BLOCK_NESTED = {"@media", "@supports", "@document", "@-moz-document"}
AT_BLOCK_DECLARATIONS = {"@font-face", "@page", "@counter-style"}
AT_BLOCK_KEYFRAMES = {"@keyframes", "@-webkit-keyframes", "@-moz-keyframes"}


def split_at_rule(prelude):
    """Split '@media (min-width:700px)' into ('@media', '(min-width:700px)')."""
    m = re.match(r"^(@[a-zA-Z-]+)\s*(.*)$", prelude, re.DOTALL)
    if not m:
        return prelude, ""
    return m.group(1).lower(), m.group(2).strip()


def items_to_declarations(items):
    """Flatten 'simple' items shaped like prop:value into (prop, value) pairs."""
    decls = []
    for prelude, sub, kind in items:
        if kind != "simple" or not prelude:
            continue
        if ":" not in prelude:
            continue
        prop, _, value = prelude.partition(":")
        decls.append((prop.strip(), value.strip()))
    return decls


# ---------------------------------------------------------------------------
# Stat accumulator helpers
# ---------------------------------------------------------------------------
def new_bucket():
    return {"count": 0, "example_selectors": [], "files": []}


def record(bucket_dict, key, selector, file_):
    b = bucket_dict.setdefault(key, new_bucket())
    b["count"] += 1
    if selector is not None and len(b["example_selectors"]) < MAX_EXAMPLES:
        if selector not in b["example_selectors"]:
            b["example_selectors"].append(selector)
    if file_ is not None and len(b["files"]) < MAX_FILES:
        if file_ not in b["files"]:
            b["files"].append(file_)


# ---------------------------------------------------------------------------
# Result containers
# ---------------------------------------------------------------------------
root_vars = {}  # prop_name -> {count, example_selectors, files, values:[{selector,theme,value,file}]}
media_queries = {}  # raw condition -> {count, example_selectors, files}
border_radius = {}
border_width = {}
box_shadow = {}
filter_values = {}
backdrop_filter_values = {}
opacity_values = {}
transition_values = {}
transition_duration = {}
transition_timing_function = {}
animation_values = {}
animation_duration = {}
animation_timing_function = {}
keyframes = {}  # name -> {"occurrences": [{file, body}], "count": n}
font_family = {}
font_size = {}
font_weight = {}
line_height = {}
letter_spacing = {}
text_transform = {}
font_feature_settings = {}
font_variant_values = {}
font_face_rules = []  # list of dicts
padding_values = {}
margin_values = {}
gap_values = {}
row_gap_values = {}
column_gap_values = {}
length_histogram = {}  # individual length tokens split out of padding/margin/gap
width_px = {}
max_width_px = {}
min_width_px = {}
height_px = {}
min_height_px = {}
z_index_values = {}
literal_colors = {}  # literal hex/rgb/rgba not via var(--color-)
color_var_usage = {}  # --color-name -> {count, example_selectors, files, alpha_patterns:{pattern:count}}

COMPONENT_MARKERS = [
    "_web-ui",
    "--web-ui_button",
    "--web-ui_card",
    "--web-ui_list",
    "--web-ui_popover",
    "--web-ui_progress-bar",
    "--web-ui_topbar",
    "--web-ui_navbar",
    "--web-ui_tabbed-topbar",
    "--web-ui_date-picker",
    "--__internal__",
]
component_rules = {m: [] for m in COMPONENT_MARKERS}
button_bg_rules = []  # rules that set --web-ui_button-background-color or --__internal__background-color

THEME_RE = re.compile(r"html\[data-duo-theme=([a-zA-Z0-9_-]+)\]")
ROOTISH_RE = re.compile(r"^(:root|html)\b")

HEX_COLOR_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
RGB_LITERAL_RE = re.compile(r"\brgba?\([^)]*\)")
COLOR_VAR_RE = re.compile(r"var\(\s*(--color-[a-zA-Z0-9_-]+)\s*\)")
COLOR_VAR_WRAP_RE = re.compile(
    r"rgba?\(\s*var\(\s*(--color-[a-zA-Z0-9_-]+)\s*\)\s*(?:[,/]\s*[^)]+)?\)"
)

PX_VALUE_RE = re.compile(r"^-?\d*\.?\d+px$")
MEDIA_BP_RE = re.compile(r"(min-width|max-width)\s*:\s*(-?\d*\.?\d+)px")


def is_root_like_selector(sel):
    sel = sel.strip()
    if ROOTISH_RE.match(sel):
        return True
    if "html[data-duo-theme=" in sel:
        return True
    return False


def theme_of_selector(sel):
    m = THEME_RE.search(sel)
    return m.group(1) if m else ("light" if sel.strip() in (":root", "html") else None)


def split_lengths(value):
    """Split a shorthand value (padding/margin/gap) into individual length
    tokens on top-level whitespace, respecting calc()/var() parens."""
    tokens = []
    buf = []
    depth = 0
    for c in value:
        if c == "(":
            depth += 1
            buf.append(c)
        elif c == ")":
            depth = max(0, depth - 1)
            buf.append(c)
        elif c.isspace() and depth == 0:
            if buf:
                tokens.append("".join(buf))
                buf = []
        else:
            buf.append(c)
    if buf:
        tokens.append("".join(buf))
    return tokens


BORDER_WIDTH_LEAD_RE = re.compile(
    r"^(-?\d*\.?\d+(?:px|em|rem|%)|thin|medium|thick)\b"
)


def maybe_border_width_from_shorthand(value):
    """Given a `border`/`border-top` etc shorthand value like '2px solid
    rgb(var(--color-swan))', pull the leading width token if present."""
    v = value.strip()
    m = BORDER_WIDTH_LEAD_RE.match(v)
    if m:
        return m.group(1)
    return None


def process_declaration(prop, value, selector, media_stack, file_):
    prop_l = prop.lower()
    value_s = value.strip()
    if not value_s:
        return

    # --- root / component custom properties -------------------------------
    if prop.startswith("--"):
        is_text_or_webui = prop_l.startswith("--web-ui_") or prop_l.startswith(
            "--text-"
        )
        if is_root_like_selector(selector) or is_text_or_webui:
            b = root_vars.setdefault(
                prop, {"count": 0, "example_selectors": [], "files": [], "values": []}
            )
            b["count"] += 1
            if selector not in b["example_selectors"] and len(
                b["example_selectors"]
            ) < MAX_EXAMPLES:
                b["example_selectors"].append(selector)
            if file_ not in b["files"] and len(b["files"]) < MAX_FILES:
                b["files"].append(file_)
            if len(b["values"]) < 30:
                b["values"].append(
                    {
                        "selector": selector,
                        "theme": theme_of_selector(selector),
                        "value": value_s,
                        "file": file_,
                    }
                )

    # --- component-level marker collection --------------------------------
    haystack = selector + "{" + prop + ":" + value_s + "}"
    for marker in COMPONENT_MARKERS:
        if marker in selector or marker in prop:
            component_rules[marker].append(
                    {
                        "selector": selector,
                        "property": prop,
                        "value": value_s,
                        "file": file_,
                    }
                )

    if prop in ("--web-ui_button-background-color", "--__internal__background-color"):
        button_bg_rules.append(
            {"selector": selector, "property": prop, "value": value_s, "file": file_}
        )

    # --- border-radius ------------------------------------------------------
    if prop_l == "border-radius" or re.match(
        r"^border-(top|bottom)-(left|right)-radius$", prop_l
    ) or prop_l in ("border-top-radius", "border-bottom-radius"):
        record(border_radius, value_s, selector, file_)

    # --- border-width / shorthand width extraction --------------------------
    if prop_l == "border-width" or re.match(
        r"^border-(top|bottom|left|right)-width$", prop_l
    ):
        record(border_width, value_s, selector, file_)
    elif prop_l in (
        "border",
        "border-top",
        "border-bottom",
        "border-left",
        "border-right",
    ):
        w = maybe_border_width_from_shorthand(value_s)
        if w:
            record(border_width, w, selector, file_)

    # --- box-shadow -----------------------------------------------------------
    if prop_l == "box-shadow":
        record(box_shadow, value_s, selector, file_)

    # --- filter / backdrop-filter ---------------------------------------------
    if prop_l == "filter":
        record(filter_values, value_s, selector, file_)
    if prop_l == "backdrop-filter":
        record(backdrop_filter_values, value_s, selector, file_)

    # --- opacity ---------------------------------------------------------------
    if prop_l == "opacity":
        record(opacity_values, value_s, selector, file_)

    # --- transition / animation --------------------------------------------
    if prop_l == "transition":
        record(transition_values, value_s, selector, file_)
    if prop_l == "transition-duration":
        record(transition_duration, value_s, selector, file_)
    if prop_l == "transition-timing-function":
        record(transition_timing_function, value_s, selector, file_)
    if prop_l == "animation":
        record(animation_values, value_s, selector, file_)
    if prop_l == "animation-duration":
        record(animation_duration, value_s, selector, file_)
    if prop_l == "animation-timing-function":
        record(animation_timing_function, value_s, selector, file_)

    # --- typography ----------------------------------------------------------
    if prop_l == "font-family":
        record(font_family, value_s, selector, file_)
    if prop_l == "font-size":
        record(font_size, value_s, selector, file_)
    if prop_l == "font-weight":
        record(font_weight, value_s, selector, file_)
    if prop_l == "line-height":
        record(line_height, value_s, selector, file_)
    if prop_l == "letter-spacing":
        record(letter_spacing, value_s, selector, file_)
    if prop_l == "text-transform":
        record(text_transform, value_s, selector, file_)
    if prop_l == "font-feature-settings":
        record(font_feature_settings, value_s, selector, file_)
    if prop_l in ("font-variant", "font-variant-numeric", "font-variant-ligatures"):
        record(font_variant_values, f"{prop_l}:{value_s}", selector, file_)

    # --- spacing ---------------------------------------------------------------
    if prop_l == "padding":
        record(padding_values, value_s, selector, file_)
        for tok in split_lengths(value_s):
            length_histogram[tok] = length_histogram.get(tok, 0) + 1
    if prop_l == "margin":
        record(margin_values, value_s, selector, file_)
        for tok in split_lengths(value_s):
            length_histogram[tok] = length_histogram.get(tok, 0) + 1
    if prop_l == "gap":
        record(gap_values, value_s, selector, file_)
        for tok in split_lengths(value_s):
            length_histogram[tok] = length_histogram.get(tok, 0) + 1
    if prop_l == "row-gap":
        record(row_gap_values, value_s, selector, file_)
        length_histogram[value_s] = length_histogram.get(value_s, 0) + 1
    if prop_l == "column-gap":
        record(column_gap_values, value_s, selector, file_)
        length_histogram[value_s] = length_histogram.get(value_s, 0) + 1

    if prop_l == "width" and PX_VALUE_RE.match(value_s):
        record(width_px, value_s, selector, file_)
    if prop_l == "max-width" and PX_VALUE_RE.match(value_s):
        record(max_width_px, value_s, selector, file_)
    if prop_l == "min-width" and PX_VALUE_RE.match(value_s):
        record(min_width_px, value_s, selector, file_)
    if prop_l == "height" and PX_VALUE_RE.match(value_s):
        record(height_px, value_s, selector, file_)
    if prop_l == "min-height" and PX_VALUE_RE.match(value_s):
        record(min_height_px, value_s, selector, file_)
    if prop_l == "z-index":
        record(z_index_values, value_s, selector, file_)

    # --- colours -----------------------------------------------------------
    if "var(--color-" in value_s:
        for m in COLOR_VAR_WRAP_RE.finditer(value_s):
            varname = m.group(1)
            whole = m.group(0)
            b = color_var_usage.setdefault(
                varname,
                {
                    "count": 0,
                    "example_selectors": [],
                    "files": [],
                    "alpha_patterns": {},
                },
            )
            b["count"] += 1
            if selector not in b["example_selectors"] and len(
                b["example_selectors"]
            ) < MAX_EXAMPLES:
                b["example_selectors"].append(selector)
            if file_ not in b["files"] and len(b["files"]) < MAX_FILES:
                b["files"].append(file_)
            b["alpha_patterns"][whole] = b["alpha_patterns"].get(whole, 0) + 1
        # also count bare var(--color-x) refs not wrapped in rgb()/rgba() (rare)
        for m in COLOR_VAR_RE.finditer(value_s):
            if COLOR_VAR_WRAP_RE.search(value_s):
                continue
            varname = m.group(1)
            b = color_var_usage.setdefault(
                varname,
                {
                    "count": 0,
                    "example_selectors": [],
                    "files": [],
                    "alpha_patterns": {},
                },
            )
            b["count"] += 1
            b["alpha_patterns"][value_s] = b["alpha_patterns"].get(value_s, 0) + 1
    else:
        # literal hex / rgb / rgba colours (not going through a --color- var)
        for m in HEX_COLOR_RE.finditer(value_s):
            record(literal_colors, m.group(0), selector, file_)
        for m in RGB_LITERAL_RE.finditer(value_s):
            record(literal_colors, m.group(0), selector, file_)


def process_font_face(items, file_):
    decls = items_to_declarations(items)
    d = OrderedDict()
    for prop, value in decls:
        d[prop] = value
    font_face_rules.append({"file": file_, "declarations": d})


def serialize_keyframe_body(sub_items):
    parts = []
    for prelude, sub, kind in sub_items:
        if kind != "block":
            continue
        decls = items_to_declarations(sub)
        decl_str = ";".join(f"{p}:{v}" for p, v in decls)
        parts.append(f"{prelude}{{{decl_str}}}")
    return "".join(parts)


def process_keyframes(name, sub_items, file_):
    body = serialize_keyframe_body(sub_items)
    entry = keyframes.setdefault(name, {"count": 0, "occurrences": []})
    entry["count"] += 1
    if len(entry["occurrences"]) < MAX_FILES:
        entry["occurrences"].append({"file": file_, "body": body})


def process_rule(selector_group, items, media_stack, file_):
    decls = items_to_declarations(items)
    selectors = split_top_level_commas(selector_group)
    for sel in selectors:
        for prop, value in decls:
            process_declaration(prop, value, sel, media_stack, file_)


def walk(items, media_stack, file_):
    for prelude, sub, kind in items:
        if kind == "simple":
            continue  # stray top-level statement (e.g. @import ...;) - not needed
        if not prelude.startswith("@"):
            process_rule(prelude, sub, media_stack, file_)
            continue
        at_name, at_prelude = split_at_rule(prelude)
        if at_name in AT_BLOCK_NESTED:
            record(media_queries, at_prelude, None, file_)
            walk(sub, media_stack + [at_prelude], file_)
        elif at_name in AT_BLOCK_DECLARATIONS:
            if at_name == "@font-face":
                process_font_face(sub, file_)
            # @page / @counter-style: not required by spec, skip declarations
        elif at_name in AT_BLOCK_KEYFRAMES:
            name = at_prelude.strip()
            process_keyframes(name, sub, file_)
        else:
            # unknown at-rule with a block; best effort: recurse as nested rules
            walk(sub, media_stack + [prelude], file_)


def main():
    if not os.path.isdir(CSS_DIR):
        print(f"missing css dir: {CSS_DIR}", file=sys.stderr)
        sys.exit(1)

    css_files = sorted(f for f in os.listdir(CSS_DIR) if f.endswith(".css"))
    print(f"Parsing {len(css_files)} CSS files...", file=sys.stderr)

    for fname in css_files:
        path = os.path.join(CSS_DIR, fname)
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        items, _ = parse_block(text, 0, len(text))
        walk(items, [], fname)

    # ---- breakpoints derived from media_queries ---------------------------
    breakpoints = set()
    for cond in media_queries:
        for kind, num in MEDIA_BP_RE.findall(cond):
            try:
                breakpoints.add((kind, float(num) if "." in num else int(num)))
            except ValueError:
                pass
    min_widths = sorted({v for k, v in breakpoints if k == "min-width"})
    max_widths = sorted({v for k, v in breakpoints if k == "max-width"})
    all_widths = sorted({v for k, v in breakpoints})

    # ---- JS bundle search ---------------------------------------------------
    js_results = {
        "feather_or_duolingo_sans": [],
        "type_scale_tokens": {},
    }
    if os.path.isdir(JS_DIR):
        js_files = sorted(f for f in os.listdir(JS_DIR) if f.endswith(".js"))
        font_re = re.compile(r"feather|duolingo-sans", re.IGNORECASE)
        token_names = ["pageTitle", "heading", "body", "caption", "label"]
        token_res = {t: re.compile(re.escape(t)) for t in token_names}

        for fname in js_files:
            path = os.path.join(JS_DIR, fname)
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                text = fh.read()

            for m in font_re.finditer(text):
                if len(js_results["feather_or_duolingo_sans"]) >= 20:
                    break
                start = max(0, m.start() - 150)
                end = min(len(text), m.end() + 150)
                js_results["feather_or_duolingo_sans"].append(
                    {"file": fname, "match": text[start:end][:300]}
                )

            for tname, tre in token_res.items():
                bucket = js_results["type_scale_tokens"].setdefault(tname, [])
                for m in tre.finditer(text):
                    if len(bucket) >= 20:
                        break
                    start = max(0, m.start() - 150)
                    end = min(len(text), m.end() + 150)
                    bucket.append({"file": fname, "match": text[start:end][:300]})

    # ---- assemble final structure -------------------------------------------
    def clean_component_rules():
        out = {}
        for marker, rules in component_rules.items():
            # dedupe identical (selector, property, value, file) tuples, keep order
            seen = set()
            deduped = []
            for r in rules:
                key = (r["selector"], r["property"], r["value"], r["file"])
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(r)
            out[marker] = {"count": len(deduped), "rules": deduped}
        return out

    def dedupe_button_rules():
        seen = set()
        out = []
        for r in button_bg_rules:
            key = (r["selector"], r["property"], r["value"], r["file"])
            if key in seen:
                continue
            seen.add(key)
            out.append(r)
        return out

    result = {
        "root_vars": root_vars,
        "media_queries": {
            "conditions": media_queries,
            "breakpoints": {
                "min_width_px": min_widths,
                "max_width_px": max_widths,
                "all_px": all_widths,
            },
        },
        "border_radius": border_radius,
        "border_width": border_width,
        "box_shadow": box_shadow,
        "filter": filter_values,
        "backdrop_filter": backdrop_filter_values,
        "opacity": opacity_values,
        "transition": transition_values,
        "transition_duration": transition_duration,
        "transition_timing_function": transition_timing_function,
        "animation": animation_values,
        "animation_duration": animation_duration,
        "animation_timing_function": animation_timing_function,
        "keyframes": keyframes,
        "font_family": font_family,
        "font_size": font_size,
        "font_weight": font_weight,
        "line_height": line_height,
        "letter_spacing": letter_spacing,
        "text_transform": text_transform,
        "font_feature_settings": font_feature_settings,
        "font_variant": font_variant_values,
        "font_face_rules": font_face_rules,
        "spacing": {
            "padding": padding_values,
            "margin": margin_values,
            "gap": gap_values,
            "row_gap": row_gap_values,
            "column_gap": column_gap_values,
            "length_histogram": dict(
                sorted(length_histogram.items(), key=lambda kv: -kv[1])
            ),
        },
        "size": {
            "width_px": width_px,
            "max_width_px": max_width_px,
            "min_width_px": min_width_px,
            "height_px": height_px,
            "min_height_px": min_height_px,
        },
        "z_index": z_index_values,
        "colors": {
            "literal": literal_colors,
            "color_var_usage": color_var_usage,
        },
        "components": clean_component_rules(),
        "button_background_rules": dedupe_button_rules(),
        "js_search": js_results,
        "_meta": {
            "css_files_parsed": len(css_files),
            "js_files_parsed": len(
                [f for f in os.listdir(JS_DIR) if f.endswith(".js")]
            )
            if os.path.isdir(JS_DIR)
            else 0,
        },
    }

    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2, sort_keys=False)

    write_markdown_summary(result)
    print(f"Wrote {OUT_JSON}", file=sys.stderr)
    print(f"Wrote {OUT_MD}", file=sys.stderr)


def top_n(d, n=15, key=lambda kv: -kv[1]["count"]):
    return sorted(d.items(), key=key)[:n]


def write_markdown_summary(result):
    lines = []
    lines.append("# Duolingo CSS stats summary\n")

    lines.append("## Breakpoints (px)\n")
    bp = result["media_queries"]["breakpoints"]
    lines.append(f"- min-width: {bp['min_width_px']}")
    lines.append(f"- max-width: {bp['max_width_px']}")
    lines.append(f"- all distinct: {bp['all_px']}\n")

    lines.append("## Top @media conditions\n")
    for cond, b in top_n(result["media_queries"]["conditions"], 15):
        lines.append(f"- `{cond}` x{b['count']}")
    lines.append("")

    lines.append("## Top border-radius values\n")
    for val, b in top_n(result["border_radius"], 15):
        lines.append(f"- `{val}` x{b['count']}")
    lines.append("")

    lines.append("## Top border-width values\n")
    for val, b in top_n(result["border_width"], 15):
        lines.append(f"- `{val}` x{b['count']}")
    lines.append("")

    lines.append("## Top box-shadow values\n")
    for val, b in top_n(result["box_shadow"], 10):
        lines.append(f"- `{val}` x{b['count']}")
    lines.append("")

    lines.append("## Opacity values\n")
    for val, b in top_n(result["opacity"], 15):
        lines.append(f"- `{val}` x{b['count']}")
    lines.append("")

    lines.append("## Transition durations\n")
    for val, b in top_n(result["transition_duration"], 15):
        lines.append(f"- `{val}` x{b['count']}")
    lines.append("")

    lines.append("## Transition timing functions\n")
    for val, b in top_n(result["transition_timing_function"], 15):
        lines.append(f"- `{val}` x{b['count']}")
    lines.append("")

    lines.append("## Animation durations\n")
    for val, b in top_n(result["animation_duration"], 15):
        lines.append(f"- `{val}` x{b['count']}")
    lines.append("")

    lines.append("## Keyframes\n")
    for name, entry in sorted(
        result["keyframes"].items(), key=lambda kv: -kv[1]["count"]
    )[:20]:
        lines.append(f"- `{name}` (defined {entry['count']}x)")
    lines.append("")

    lines.append("## Font families\n")
    for val, b in top_n(result["font_family"], 20):
        lines.append(f"- `{val}` x{b['count']}")
    lines.append("")

    lines.append("## --text-* type scale (root_vars)\n")
    text_vars = {
        k: v for k, v in result["root_vars"].items() if k.startswith("--text-")
    }
    for name in sorted(text_vars):
        entry = text_vars[name]
        vals = sorted({v["value"] for v in entry["values"]})
        lines.append(f"- `{name}`: {', '.join(vals)}")
    lines.append("")

    lines.append("## @font-face families\n")
    seen_fam = set()
    for rule in result["font_face_rules"]:
        fam = rule["declarations"].get("font-family", "?")
        if fam in seen_fam:
            continue
        seen_fam.add(fam)
        lines.append(f"- `{fam}`")
    lines.append("")

    lines.append("## Component markers found\n")
    for marker, data in result["components"].items():
        lines.append(f"- `{marker}`: {data['count']} rules")
    lines.append("")

    lines.append("## Button background / internal background rules\n")
    lines.append(f"Total distinct rules: {len(result['button_background_rules'])}")
    lines.append("")

    lines.append("## JS search (feather / duolingo-sans / type-scale tokens)\n")
    lines.append(
        f"- feather/duolingo-sans raw matches found: {len(result['js_search']['feather_or_duolingo_sans'])}"
    )
    for tname, matches in result["js_search"]["type_scale_tokens"].items():
        lines.append(f"- `{tname}` matches found: {len(matches)}")
    lines.append("")

    with open(OUT_MD, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
