#!/usr/bin/env python3
"""Read the custom properties and every styled-component's rules out of the archived snapshots.

usage: python3 tools/capture/vars.py

Reads $RR_SNAPSHOTS/*.html.gz (default ~/.self-learn/researchrabbit-snapshots) and writes
raw/css-vars.json: the :root custom properties in declaration order, the font families the
pages load, and, for each styled-component, its display name (the `File__Name` part of the
`File__Name-sc-hash` class the DOM carries) mapped to the CSS rules of its generated class.
"""
import collections, gzip, json, os, pathlib, re

REF = pathlib.Path(__file__).resolve().parent.parent.parent
ARCH = pathlib.Path(os.environ.get('RR_SNAPSHOTS', '~/.self-learn/researchrabbit-snapshots')).expanduser()

root_vars, fonts, components = {}, set(), collections.defaultdict(set)
pages = sorted(ARCH.glob('*.html.gz'))
for f in pages:
    html = gzip.open(f, 'rt').read()
    css = '\n'.join(re.findall(r'<style[^>]*>(.*?)</style>', html, re.S))
    for block in re.findall(r'(?m)^:root \{([^}]*)\}', css):
        for name, value in re.findall(r'(--[\w-]+):\s*([^;]+);', block):
            root_vars.setdefault(name, value.strip())
    fonts.update(m.strip(' "\'') for m in re.findall(r'family=([^:&"]+)', html))
    rules = collections.defaultdict(list)
    for sel, body in re.findall(r'(?m)^([^{}@\n][^{}\n]*)\{([^{}]*)\}', css):
        for cls in re.findall(r'\.([A-Za-z][\w-]*)', sel):
            rules[cls].append(f'{sel.strip()} {{ {body.strip()} }}')
    for cls_attr in re.findall(r'class="([^"]*__[^"]*)"', html):
        names = cls_attr.split()
        for i, n in enumerate(names):
            m = re.match(r'([A-Z]\w*__\w+)-sc-[\w]+-\d+$', n)
            if m and i + 1 < len(names):
                gen = names[i + 1]
                if '__' not in gen:
                    for r in rules.get(gen, []):
                        components[m.group(1)].add(r.replace('.' + gen, '&'))

out = {
    'source': 'app.researchrabbit.ai, signed in, read from the DOM and CSSOM on 2026-10-04',
    'pages': [p.name.removesuffix('.html.gz') for p in pages],
    'root': root_vars,
    'fonts': sorted(fonts),
    'components': {k: sorted(v) for k, v in sorted(components.items())},
}
(REF / 'raw').mkdir(exist_ok=True)
(REF / 'raw' / 'css-vars.json').write_text(json.dumps(out, indent=1) + '\n')
print(len(root_vars), 'vars,', len(components), 'components, fonts', sorted(fonts))
