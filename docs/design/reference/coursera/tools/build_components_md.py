#!/usr/bin/env python3
"""Build components.md for the Coursera design reference.

Reads raw/pages.md, raw/measurements.md (public pages), raw/measurements-signed-in.md
(learner pages), screenshots/ and icons/INDEX.tsv, and writes components.md next to them.
Every value in the output is a cell of one of the two measurement files, condensed:
the palette name after the semantic token is dropped, the font family is stated once,
and a state column shows only what differs from the first state.

Run from anywhere: python3 tools/build_components_md.py
"""
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

# --------------------------------------------------------------------------- parsing


def split_row(line):
    cells, cur, tick = [], '', False
    s = line.strip()
    if s.startswith('|'):
        s = s[1:]
    if s.endswith('|'):
        s = s[:-1]
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == '\\' and i + 1 < len(s) and s[i + 1] == '|':
            cur += '/'
            i += 2
            continue
        if ch == '`':
            tick = not tick
        if ch == '|' and not tick:
            cells.append(cur.strip())
            cur = ''
        else:
            cur += ch
        i += 1
    cells.append(cur.strip())
    return cells


def parse_table(lines, i):
    rows = []
    while i < len(lines) and lines[i].startswith('|'):
        rows.append(split_row(lines[i]))
        i += 1
    return rows[0], rows[2:], i


def parse_public():
    L = open('raw/measurements.md').read().split('\n')
    ents, group, i, started = [], None, 0, False
    while i < len(L):
        l = L[i]
        if l.startswith('## Components'):
            started = True
        if started and l.startswith('### '):
            group = l[4:].strip()
        if started and l.startswith('#### '):
            e = {'src': 'p', 'id': l[5:].strip(), 'group': group, 'desc': '', 'page': '',
                 'sel': '', 'states': [], 'crops': {}, 'table': None}
            j = i + 1
            while j < len(L) and not L[j].startswith('#'):
                t = L[j]
                if not e['desc'] and t.strip() and not t.startswith(('Page:', 'Crops:', '|', '-')):
                    e['desc'] = t.strip()
                m = re.match(r'Page: (.+?)\. Selector: `(.*?)`\. States: (.*)\.$', t)
                if m:
                    e['page'] = m.group(1).split(' ')[0]
                    e['sel'] = m.group(2)
                    e['states'] = [s.strip() for s in m.group(3).split(',')]
                m = re.match(r'- Painted in `([^`]+)`: (.*)$', t)
                if m:
                    e.setdefault('painted', {})[m.group(1)] = m.group(2)
                m = re.match(r'Crops: (.*)$', t)
                if m:
                    for f in re.findall(r'`([^`]+\.png)`', m.group(1)):
                        e['crops'][f] = 'components/crops/' + f
                if t.startswith('| Property'):
                    hdr, body, j2 = parse_table(L, j)
                    e['table'] = (hdr, body)
                    j = j2
                    continue
                j += 1
            # crop file per state: {id}-{state}.png
            cm = {}
            for st in e['states']:
                f = f"{e['id']}-{st}.png"
                if f in e['crops']:
                    cm[st] = e['crops'][f]
            e['crop_by_state'] = cm
            ents.append(e)
            i = j
            continue
        i += 1
    return ents


SI_SECTIONS = {'Page shells and grid', 'Top bar', 'Course sidebar', 'Module page', 'Right rail',
               'Grades', 'Course info', 'Item outline panel', 'Video item', 'Transcript',
               'Reading item', 'Assignment item', 'My Learning'}


def parse_si():
    L = open('raw/measurements-signed-in.md').read().split('\n')
    ents, section, i = [], None, 0
    while i < len(L):
        l = L[i]
        if l.startswith('## '):
            section = l[3:].strip()
        if l.startswith('### ') and section in SI_SECTIONS:
            e = {'src': 's', 'id': None, 'title': l[4:].strip(), 'section': section, 'desc': '',
                 'states': [], 'crop_by_state': {}, 'table': None, 'pages': []}
            j = i + 1
            while j < len(L) and not L[j].startswith('#'):
                t = L[j]
                m = re.match(r'Key `([^`]+)`', t)
                if m:
                    e['id'] = m.group(1)
                    e['pages'] = list(dict.fromkeys(re.findall(r' on ([a-z0-9-]+)', t)))
                elif not e['desc'] and t.strip() and not t.startswith(('|', '-', 'How:')) and e['id'] is None:
                    e['desc'] = t.strip()
                if t.startswith('| Property'):
                    hdr, body, j2 = parse_table(L, j)
                    e['table'] = (hdr, body)
                    j = j2
                    continue
                j += 1
            if e['id']:
                e['states'] = e['table'][0][1:]
                for r in e['table'][1]:
                    if r[0] == 'Crop':
                        for st, c in zip(e['states'], r[1:]):
                            m = re.search(r'\(\.\./components/crops/signed-in/([^)]+)\)', c)
                            if m:
                                e['crop_by_state'][st] = 'components/crops/signed-in/' + m.group(1)
                ents.append(e)
            i = j
            continue
        i += 1
    return ents


import json
SIJSON = json.load(open('raw/components-signed-in.json'))['components']
PUB = parse_public()
SI = parse_si()
LOOK = {('p', e['id']): e for e in PUB}
LOOK.update({('s', e['id']): e for e in SI})

# --------------------------------------------------------------------------- cell text

NONCOLOR = ('spacing-', 'border-radius-', 'typography-', 'elevation-', 'letter-spacing-', 'font-', 'size-')


def tok(name):
    if name.startswith(NONCOLOR):
        return '`--cds-%s`' % name
    return '`--cds-color-%s`' % name


PALETTE = re.compile(r'[a-z]+-\d+')


def pick_first(names):
    """Semantic token to name for a value: never a palette name if a semantic one exists, skip
    emphasis-* aliases when another exists, and prefer a hover or pressed name."""
    sem = [n for n in names if not PALETTE.fullmatch(n)] or names
    cands = [n for n in sem if not n.startswith('emphasis-')] or sem
    for n in cands:
        if 'pressed' in n or 'hover' in n:
            return n
    return cands[0]


def run_pick(m):
    toks = re.findall(r'`--cds-([^`]+)`', m.group(0))
    names = [t[len('color-'):] if t.startswith('color-') else t for t in toks]
    best = pick_first(names)
    for t, n in zip(toks, names):
        if n == best:
            return '`--cds-%s`' % t
    return '`--cds-%s`' % toks[0]


def cond(c):
    """Condense one measurement cell."""
    c = c.replace('—', ':').replace('|', '/')
    # public: runs of backticked tokens -> first token
    c = re.sub(r'(`--cds-[^`]+`)(?:(?:, | / )`--cds-[^`]+`)+', run_pick, c)
    c = c.replace('(no elevation token)', '(no token)')
    # signed-in: (a, b, c) token lists
    def paren(m):
        inner = m.group(1)
        if inner in ('no token',):
            return '(no token)'
        names = [n.strip() for n in inner.split(',')]
        if all(re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', n) for n in names) and any('-' in n for n in names):
            return tok(pick_first(names))
        return m.group(0)
    c = re.sub(r'\(([a-z0-9]+(?:-[a-z0-9]+)*(?:, [a-z0-9]+(?:-[a-z0-9]+)*)*|no token)\)', paren, c)
    c = c.replace('Source Sans Pro ', '')
    c = re.sub(r'(\d+(?:\.\d+)?)px/(\d+(?:\.\d+)?)px', r'\1/\2', c)
    c = re.sub(r'^(\d{3}) (\d+(?:\.\d+)?/\d+(?:\.\d+)?)', r'\2 \1', c)
    c = c.replace('×', ' x ')
    c = re.sub(r'\s+x\s+', ' x ', c)
    c = re.sub(r' \(no token\)', ', no token', c)
    c = re.sub(r'^transparent, no token', 'transparent', c)
    c = re.sub(r'(?<![,(]) no token', ', no token', c)
    c = re.sub(r' = (`--cds-[^`]+`)', r', matches \1', c)
    tk = re.findall(r'`--cds-[^`]+`', c)
    if len(tk) > 1 and (len(set(tk)) == 1 or all(('--cds-spacing-' in t or '--cds-border-radius' in t) for t in tk)):
        c = re.sub(r' ?`--cds-[^`]+`', '', c) + ' (' + ', '.join(dict.fromkeys(tk)) + ')'
    c = re.sub(r'\s+', ' ', c).strip()
    return c


def tn_clean(c):
    """Text node cells: 'span.cds-x: 16/24 400 ...' -> 'span 16/24 400 ...'."""
    m = re.match(r'([a-z0-9]+)(?:\.[^:\s]+)*: (.*)$', c)
    if m:
        return m.group(1) + ' ' + m.group(2)
    return c


PROP_ORDER = ['Size', 'Padding', 'Gap', 'Border', 'Radius', 'Background', 'Box shadow', 'Outline',
              'Font', 'Colour', 'Text decoration', 'Transition', 'Transform', 'Opacity', 'Icon',
              'Placeholder']
PROP_ALIAS = {'Size (w x h)': 'Size', 'Size (w×h)': 'Size'}
SAME = ('same', '=', '')
NOISE_OUTLINE = re.compile(r'^(none|1px solid transparent offset 2px)$')


def fix_transition(e, state, c):
    """A few signed-in Transition cells were cut at a comma in the markdown; rebuild them from the JSON."""
    if c in SAME or c.count('(') == c.count(')'):
        return c
    st = SIJSON[e['id']]['states'].get(state, {}).get('style', {})
    props = [x.strip() for x in st.get('transitionProperty', '').split(',')]
    durs = [x.strip() for x in st.get('transitionDuration', '').split(',')]
    tf = re.findall(r'cubic-bezier\([^)]*\)|[a-z-]+', st.get('transitionTimingFunction', ''))
    out = []
    for i, pr in enumerate(props):
        out.append('%s %s %s' % (pr, durs[i % len(durs)], tf[i % len(tf)] if tf else ''))
    return ' + '.join(x.strip() for x in out)


def rows_of(e):
    """Return {prop: [cell per state]} after condensing, in canonical props, with Font+ls merged."""
    out = {}
    if not e['table']:
        return out
    ls = None
    for r in e['table'][1]:
        p = PROP_ALIAS.get(r[0], r[0])
        cells = (r[1:] + [''] * len(e['states']))[:len(e['states'])]
        if p == 'Transition' and e['src'] == 's':
            cells = [fix_transition(e, st, c) for st, c in zip(e['states'], cells)]
        if p == 'Letter spacing':
            ls = cells
            continue
        if p in PROP_ORDER or p in ('Text node font', 'Text node colour', 'Margin'):
            out[p] = cells
    if ls and 'Font' in out:
        merged = []
        for f, l in zip(out['Font'], ls):
            if l in SAME or l == 'normal' or f in SAME:
                merged.append(f)
            else:
                merged.append('%s, ls %s' % (f, l))
        out['Font'] = merged
    return out


def diff_table(e):
    """Resolve every state's values (a cell that repeats the first column is filled from it),
    pick the base state (default if present, else the first), and return what differs."""
    rows = rows_of(e)
    states = e['states']
    n = len(states)
    b = states.index('default') if 'default' in states else 0
    res = {}
    for p in PROP_ORDER:
        if p not in rows:
            continue
        cells = rows[p]
        first = cond(cells[0]) if cells[0] not in SAME else ''
        vals = []
        for i, c in enumerate(cells):
            if c in SAME:
                vals.append(first)
            else:
                vals.append(cond(c))
        if p == 'Outline' and all(NOISE_OUTLINE.match(v) or v == '' for v in vals):
            continue
        if not any(vals):
            continue
        res[p] = vals
    return states, res, b


def esc(c):
    return c.replace('|', '/')


LABEL = {'Size': 'size', 'Padding': 'padding', 'Gap': 'gap', 'Border': 'border', 'Radius': 'radius',
         'Background': 'background', 'Box shadow': 'shadow', 'Outline': 'outline', 'Font': 'font',
         'Colour': 'colour', 'Text decoration': 'decoration', 'Transition': 'transition',
         'Transform': 'transform', 'Opacity': 'opacity', 'Icon': 'icon', 'Placeholder': 'placeholder'}


def render_state_rows(e):
    """Return (rows, single): rows is a list of (label, values); the base state lists everything,
    later states list only what differs from it, and states with identical changes are merged."""
    states, res, b = diff_table(e)
    if not res:
        return [], False
    order = [b] + [i for i in range(len(states)) if i != b]
    if states[0] != states[b] and False:
        pass
    base_vals = '; '.join('%s %s' % (LABEL[p], res[p][b]) for p in PROP_ORDER if p in res and res[p][b])
    out = []  # (labels list, text)
    for i in order[1:]:
        ch = '; '.join('%s %s' % (LABEL[p], res[p][i]) for p in PROP_ORDER
                       if p in res and res[p][i] and res[p][i] != res[p][b])
        if not ch:
            out.append(([states[i]], None))
        else:
            if out and out[-1][1] == ch:
                out[-1][0].append(states[i])
            else:
                out.append(([states[i]], ch))
    same = [l[0] for l, t in out if t is None]
    rows = [(states[b] + (' (same: %s)' % ', '.join(same) if same else ''), base_vals)]
    for labs, t in out:
        if t is not None:
            rows.append((', '.join(labs), t))
    return rows, len(states) == 1


def part_values(e):
    rows = rows_of(e)
    def first(p):
        c = rows.get(p)
        if not c:
            return None
        v = c[0]
        return cond(v) if v not in SAME and v != '' else None
    bits = []
    for p in ['Size', 'Padding', 'Gap', 'Border', 'Radius', 'Background', 'Box shadow']:
        v = first(p)
        if v and not (p == 'Background' and v == 'transparent') and not (p == 'Radius' and v == '0px') \
                and not (p == 'Padding' and v == '0'):
            bits.append('%s %s' % (p.lower() if p != 'Size' else 'size', v))
    tn = rows.get('Text node font')
    tc = rows.get('Text node colour')
    font = first('Font')
    if tn and tn[0] not in SAME:
        t = cond(tn_clean(tn[0]))
        t = re.sub(r', ls normal$', '', t)
        col = cond(tc[0]) if tc and tc[0] not in SAME else None
        bits.append('text %s%s' % (t, (', ' + col) if col else ''))
    elif font:
        bits.append('font %s' % font)
        c = first('Colour')
        if c:
            bits.append('colour %s' % c)
    if tn and tn[0] not in SAME and first('Colour') and False:
        pass
    ic = first('Icon')
    if ic:
        bits.append('icon %s' % ic)
    for p in ['Text decoration', 'Transform', 'Opacity', 'Transition', 'Outline', 'Placeholder']:
        v = first(p)
        if v and not NOISE_OUTLINE.match(v) and v != 'none':
            bits.append('%s %s' % (p.lower(), v))
    return '; '.join(bits) if bits else 'see raw'


def painted_line(e):
    """For a wrapper that paints nothing itself, list the first layers its children paint."""
    rows = rows_of(e)
    def base(p):
        c = rows.get(p)
        return cond(c[0]) if c and c[0] not in SAME else ''
    if base('Border') or base('Box shadow'):
        return None
    if base('Background') not in ('', 'transparent'):
        return None
    if base('Radius') not in ('', '0px'):
        return None
    raw = None
    if e['src'] == 'p':
        pd = e.get('painted') or {}
        raw = pd.get(e['states'][0]) or (list(pd.values())[0] if pd else None)
    else:
        for r in e['table'][1]:
            if r[0] == 'Painted layers' and r[1] not in SAME:
                raw = r[1]
    if not raw:
        return None
    layers = [l.strip() for l in raw.split('; ') if l.strip() and not l.strip().startswith('ancestor')]
    outl = []
    for l in layers[:3]:
        l = re.sub(r'^([a-z0-9]+)(?:[.:#][^\s,]*)*', r'\1', l)
        l = cond(l)
        l = re.sub(r'\.0(?=[x ,;]|$)', '', l)
        outl.append(l.replace(' r ', ' radius ').replace(' bg ', ' background ').replace('shadow rgb', 'shadow rgb'))
    return '; '.join(outl) if outl else None


# --------------------------------------------------------------------------- crops

STATE_PRIORITY = ['default', 'collapsed', 'selected', 'current', 'hover', 'focus-visible',
                  'focus-visible-cds', 'pressed', 'expanded', 'opened', 'checked', 'disabled']


def crops_for(e, limit=12):
    cm = e['crop_by_state']
    out = []
    for st in e['states']:
        if st in cm and os.path.exists(cm[st]):
            out.append((st, cm[st]))
    if len(out) > limit:
        pri = []
        for want in STATE_PRIORITY:
            for st, p in out:
                if st == want or st.startswith(want + '-'):
                    if (st, p) not in pri:
                        pri.append((st, p))
        for x in out:
            if x not in pri:
                pri.append(x)
        out = pri[:limit]
    return out


def img(alt, path):
    return '![%s](%s)' % (alt, path)


# --------------------------------------------------------------------------- config

def P(i):
    return ('p', i)


def S(i):
    return ('s', i)


SNAP = {  # label -> (screenshot names, plain-English view)
    'course-module-1': 'course home, module 1 (in progress)',
    'course-module-2': 'course home, module 2 (not started)',
    'course-module-1-objectives': 'course home, module 1 with objectives shown',
    'course-grades': 'grades',
    'course-info': 'course info',
    'item-video': 'video item',
    'item-video-transcript': 'video item, transcript open',
    'item-reading': 'reading item',
    'item-assignment': 'assignment item (submitted)',
    'my-learning': 'My Learning, In Progress',
    'my-learning-completed': 'My Learning, Completed',
}

GROUPS = []


def G(name, intro, entries):
    GROUPS.append((name, intro, entries))


E_ = lambda title, key, parts=(), **kw: dict(title=title, key=key, parts=list(parts), **kw)

G('Shell and navigation',
  'The public header (a 40px audience strip over a 65px nav), the Explore mega menu, the signed-in top bars and the page shells that hold each learner page. The public header is `position: sticky; top: 0` at z-index 3000 and 105px tall. Signed-in course pages drop the header rule and sit on the grey ground `#f2f5fa` (`--cds-color-neutral-background-primary-weak`), with white cards on top.',
  [
      E_('Global header', P('header-container'), [P('header-top-bar'), P('header-main-bar'), P('header-logo')]),
      E_('Audience link', P('header-audience-link')),
      E_('Explore menu button', P('button-ghost-nav')),
      E_('Degrees link', P('header-degrees-link')),
      E_('Global search field', P('search-input'), [P('search-input-outline'), P('search-input-field')]),
      E_('Search submit button', P('icon-button-search')),
      E_('Search clear button', P('search-clear-button')),
      E_('Search autocomplete', P('search-autocomplete')),
      E_('Autocomplete option', P('search-autocomplete-option')),
      E_('AI coach button', P('icon-button-ghost')),
      E_('Explore mega menu', P('mega-menu'), [P('mega-menu-heading'), P('mega-menu-divider')]),
      E_('Mega menu link', P('mega-menu-link')),
      E_('Mega menu view all link', P('mega-menu-view-all')),
      E_('Page shell: course home', S('shell-course-home')),
      E_('Page shell: grades', S('shell-course-grades')),
      E_('Page shell: course info', S('shell-course-info')),
      E_('Page shell: video item', S('shell-item-video')),
      E_('Page shell: video item with transcript', S('shell-item-video-transcript')),
      E_('Page shell: reading item', S('shell-item-reading')),
      E_('Page shell: assignment item', S('shell-item-assignment')),
      E_('Page shell: My Learning', S('shell-my-learning')),
      E_('Course top bar', S('topbar-course'), [S('topbar-program-badge'), S('topbar-item')]),
      E_('App switcher button', S('topbar-switcher')),
      E_('Top bar logo link', S('topbar-logo')),
      E_('Course search input', S('topbar-course-search-input')),
      E_('Course search button', S('topbar-course-search-button')),
      E_('Top bar icon button', S('topbar-icon-button'), [S('topbar-ai-button')]),
      E_('Avatar menu button', S('topbar-avatar')),
      E_('My Learning top bar', S('topbar-ml')),
      E_('Explore button (My Learning)', S('topbar-ml-explore')),
      E_('Nav link (My Learning)', S('topbar-ml-nav-link')),
      E_('Catalog search (My Learning)', S('topbar-ml-search')),
      E_('Round search button', S('topbar-ml-search-button')),
      E_('Career goal link (top bar)', S('topbar-ml-career-goal')),
  ])

G('Buttons and links',
  'Buttons are 8px radius (`--cds-border-radius-100`), medium 36px and large 48px, with no transition on any public-page state. The signed-in variants (Resume, Go to next item, Get started, Add to LinkedIn) are the same primary button and are listed with the page that uses them: [Resume button (course home)](#resume-button-course-home), [Next item button](#next-item-button), [Reading next button (large)](#reading-next-button-large), [Resume button (My Learning)](#resume-button-my-learning), [Add to LinkedIn (primary)](#add-to-linkedin-primary).',
  [
      E_('Primary button', P('button-primary'), [P('button-primary-dialog')]),
      E_('Block primary button', P('button-primary-block')),
      E_('Enroll button', P('button-enroll'), [P('button-enroll-compact')]),
      E_('Secondary button', P('button-secondary'), [P('button-disabled-secondary')]),
      E_('Ghost button', P('button-ghost'), [P('button-ghost-enabled'), P('button-disabled-ghost')]),
      E_('Ghost inline button', P('button-ghost-inline')),
      E_('Ghost bold button', P('button-ghost-bold')),
      E_('Ghost secondary button', P('button-ghost-secondary')),
      E_('Ghost text button', P('button-ghost-text')),
      E_('Text toggle', P('button-text-toggle')),
      E_('Show more button', P('button-show-more')),
      E_('Show more container button', P('show-more-container-button')),
      E_('Show more list button', P('show-more-list-button')),
      E_('Course row toggle', P('spec-course-toggle')),
      E_('Close icon button', P('icon-button-close'), [P('icon-button-dialog-close')]),
      E_('Help toggle', P('contextual-help-button')),
      E_('Breadcrumbs', P('breadcrumbs')),
      E_('Breadcrumb link', P('breadcrumb-link')),
      E_('Breadcrumb home icon', P('breadcrumb-home')),
      E_('Inline link', P('link-inline')),
      E_('Standalone link', P('link-standalone')),
      E_('Instructor name link', P('instructor-name')),
      E_('View more reviews link', P('link-view-more')),
      E_('Course title link', P('spec-course-title-link')),
  ])

G('Inputs and filters',
  'Search results filter through a sticky bar of pill dropdowns that open a checkbox popover, plus a Filter and sort side sheet (in Feedback and overlays). The filter pills are not CDS components and fall back to the browser focus outline. Sort is a radio group in the sheet, not a dropdown.',
  [
      E_('Results heading', P('search-results-heading')),
      E_('Suggestion chip', P('chip-suggestion'), [P('chip-suggestion-label')]),
      E_('Filter bar', P('filter-bar'), [P('filter-bar-divider')]),
      E_('Filter and sort button', P('filter-and-sort-button')),
      E_('Filter dropdown', P('filter-dropdown')),
      E_('AI suggestion pill', P('filter-ai-pill')),
      E_('Filter popover', P('filter-popover'), [P('filter-popover-heading'), P('filter-popover-footer')]),
      E_('Checkbox row', P('checkbox'), [P('checkbox-count'), P('checkbox-label')]),
      E_('Checkbox glyph', P('checkbox-box')),
      E_('Radio', P('radio')),
      E_('Filter accordion', P('filter-accordion')),
      E_('Filter accordion header', P('filter-accordion-header')),
      E_('Select', P('select'), [P('select-menu')]),
      E_('Select option', P('select-option')),
  ])

G('Cards',
  'The product card is the one repeating card on public pages: four per row at 1440, three at 1024, two at 768, one at 390. Right rail cards are documented under Course home, the program card under My Learning. The table compares the card shapes side by side (default state values).',
  [
      E_('Product card', P('product-card'),
         [P('product-card-click-area'), P('product-card-image-container'), P('product-card-image'),
          P('product-card-content'), P('product-card-partner-logo'), P('product-card-partner-name'),
          P('product-card-title'), P('product-card-skills'), P('product-card-skills-label'),
          P('product-card-metadata'), P('product-card-footer')]),
      E_('Product card title link', P('product-card-title-link')),
      E_('Product card, list variant', P('product-card-list'), [P('product-card-list-image'), P('product-card-list-title')]),
      E_('Pill', P('pill')),
  ])

G('Course landing',
  'The course page top to bottom: hero band with a floating stats card, in-page tabs, About (what you will learn, skills, details), Outcomes, Modules with the instructor rail, Recommendations, Testimonials, Reviews, FAQ. The hero and stats card are shared with specializations and professional certificates. A 146px sticky nav replaces the tabs once they scroll away.',
  [
      E_('Course hero', P('course-hero'),
         [P('spec-hero'), P('course-hero-background'), P('course-hero-art'), P('hero-partner-logo'),
          P('hero-partner-divider'), P('hero-title'), P('hero-part-of'), P('hero-instructors'),
          P('hero-avatar'), P('hero-enrolled-count')]),
      E_('Stats card', P('stats-card'), [P('stats-card-value'), P('stats-card-sub'), P('stats-card-rating'), P('stats-card-star')]),
      E_('Stats card link', P('stats-card-link')),
      E_('Tab bar', P('tab-bar')),
      E_('Tab', P('tab')),
      E_('Sticky nav', P('sticky-nav'), [P('sticky-nav-title'), P('sticky-nav-rule')]),
      E_("What you'll learn", P('learn-checklist'), [P('section-heading'), P('section-heading-small'), P('learn-checklist-item')]),
      E_('Skill chip', P('skill-chip')),
      E_('Details to know', P('details-to-know'), [P('details-tile')]),
      E_('Outcomes section', P('outcomes-section'), [P('heading-lg'), P('outcomes-image'), P('bullet-list')]),
      E_('Module list', P('module-list'), [P('modules-heading')]),
      E_('Module accordion', P('module-accordion'),
         [P('module-title'), P('module-meta'), P('module-details-label'), P('module-chevron')]),
      E_('Module accordion header', P('module-accordion-header')),
      E_('Module panel', P('module-panel'), [P('module-h4'), P('module-included'), P('module-item-list')]),
      E_('Course list item', P('spec-course-accordion')),
      E_('Credits callout', P('credits-callout')),
      E_('Instructor card', P('instructor-card'), [P('instructor-avatar'), P('instructor-card-spec')]),
      E_('Recommendation chip', P('chip'), [P('chip-home')]),
      E_('Testimonial card', P('testimonial-card'), [P('testimonials-home')]),
      E_('Ratings summary', P('ratings-summary')),
      E_('Review card', P('review-card')),
      E_('FAQ accordion', P('faq-accordion'), [P('faq-question'), P('faq-chevron'), P('faq-panel')]),
      E_('FAQ accordion header', P('faq-accordion-header')),
      E_('More questions card', P('more-questions')),
      E_('Promo band', P('promo-band')),
  ])

G('Course home',
  'Signed-in course home at 1440: a 64px header on the grey ground, then three white cards with 16px gutters: sidebar 300 (x 16), main 716 (x 332), right rail 360 (x 1064). Grades and Course info drop the rail and the main card grows to 1092. The body is a fixed 100vh layout and each card scrolls inside it.',
  [
      E_('Course sidebar card', S('sidebar-card'), [S('sidebar-partner'), S('sidebar-course-title')]),
      E_('Course Material heading', S('sidebar-course-material')),
      E_('Sidebar module row', S('sidebar-module-row'), [S('sidebar-progress-circle')]),
      E_('Sidebar nav link', S('sidebar-nav-link')),
      E_('Module title and meta', S('module-title'), [S('module-meta-row'), S('module-description')]),
      E_('Learning objectives toggle', S('module-objectives-toggle'), [S('module-objectives-list')]),
      E_('Lesson group header', S('lesson-header'), [S('lesson-divider')]),
      E_('Item row', S('item-row')),
      E_('Resume button (course home)', S('item-resume-button')),
      E_('Item status icons', S('item-status-icon')),
      E_('Weekly goal card', S('rail-goal-card'), [S('rail-day-circle')]),
      E_('Edit goal link', S('rail-goal-edit')),
      E_('Timeline card', S('rail-timeline-card'), [S('rail-timeline-callout'), S('rail-timeline-line')]),
      E_('Deadline link', S('rail-deadline-link')),
      E_('Grades table', S('grades-table'), [S('grades-title'), S('grades-header-row')]),
      E_('Grades row', S('grades-row')),
      E_('Grade item link', S('grades-item-link')),
      E_('Course info header', S('info-title'), [S('info-about')]),
      E_('Show more button (course info)', S('info-show-more')),
      E_('Course info instructor', S('info-instructor')),
      E_('Instructor name link (course info)', S('info-instructor-link')),
      E_('Details box', S('info-details')),
      E_('Syllabus module card', S('info-syllabus-module')),
      E_('View in catalog button', S('info-catalog-button')),
  ])

G('Item pages',
  'Video, reading and assignment pages share an outline card on the left (360 at x 16) and an item card from x 392: 944 wide on a video (plus an 88px tool strip), 1032 on a reading or assignment. With the transcript open the item is 700.5 wide, then a 10px drag separator, a 233.5 transcript pane and the 88px strip.',
  [
      E_('Item outline panel', S('outline-panel'), [S('outline-goal-card'), S('outline-lesson-heading'), S('outline-divider')]),
      E_('Outline course link', S('outline-course-link')),
      E_('Outline collapse button', S('outline-close')),
      E_('Outline goal header', S('outline-goal-header')),
      E_('Outline module header', S('outline-module-header')),
      E_('Outline item row', S('outline-item')),
      E_('Video player frame', S('video-player'), [S('video-title')]),
      E_('Play button', S('video-play-button')),
      E_('Save note button', S('video-save-note')),
      E_('AI panel', S('ai-panel')),
      E_('AI panel header', S('ai-panel-header')),
      E_('AI suggestion chip', S('ai-chip')),
      E_('Feedback icon button', S('item-feedback-icon')),
      E_('Next item button', S('next-item-button')),
      E_('Item footer bar', S('item-footer')),
      E_('Tool strip', S('tool-strip')),
      E_('Tool strip button', S('tool-strip-button')),
      E_('Tool pane separator', S('tool-panel-separator')),
      E_('Transcript panel', S('transcript-panel')),
      E_('Transcript close button', S('transcript-close')),
      E_('Transcript language select', S('transcript-language')),
      E_('Transcript timestamp', S('transcript-timestamp')),
      E_('Transcript phrase', S('transcript-phrase')),
      E_('Reading body', S('reading-body'), [S('reading-title'), S('reading-completed')]),
      E_('Reading audio player', S('reading-audio-player')),
      E_('Reading link', S('reading-link')),
      E_('Reading next button (large)', S('reading-next-button')),
      E_('Feedback row', S('reading-feedback-row')),
      E_('Feedback text button', S('item-feedback-text-button')),
      E_('Assignment cover', S('assignment-cover'), [S('assignment-type'), S('assignment-title')]),
      E_('Assignment primary button', S('assignment-primary')),
      E_('Assignment AI button', S('assignment-ai-button')),
      E_('Assignment result banner', S('assignment-result-banner')),
      E_('Assignment secondary button', S('assignment-secondary-button')),
      E_('Assignment expectations card', S('assignment-expect-card')),
      E_('Report an issue button', S('assignment-report')),
  ])

G('My Learning',
  'A white page under a 65px sticky header with a 1px `#c1cbdb` rule (`--cds-color-neutral-stroke-primary-weak`). The content container is 1376 wide (32px margins), split two thirds and one third: left column 917.3, right 458.7, each with 16px inner padding, so cards are 885.3 and 426.7 wide. Cards carry a 1px edge, radius 16 and padding 24, 24 apart.',
  [
      E_('Greeting', S('ml-greeting')),
      E_('Career goal link (greeting)', S('ml-career-goal-link')),
      E_('Edit goal button', S('ml-edit-goal')),
      E_('Tab bar (My Learning)', S('ml-tabs')),
      E_('Tab (My Learning)', S('ml-tab')),
      E_('Program card', S('ml-program-card'), [S('ml-program-header')]),
      E_('Program course row', S('ml-course-row')),
      E_('Course title link (My Learning)', S('ml-course-title-link')),
      E_('Progress bar', S('ml-progress-bar')),
      E_('Next item card', S('ml-next-item-card')),
      E_('Resume button (My Learning)', S('ml-resume-button')),
      E_('Overflow button', S('ml-overflow-button')),
      E_('Standalone course card', S('ml-course-card')),
      E_('Calendar', S('ml-calendar'), [S('ml-calendar-day')]),
      E_('Calendar nav button', S('ml-calendar-nav')),
      E_('Certificates card', S('ml-certificates-card')),
      E_('Add to LinkedIn (ghost)', S('ml-cert-linkedin')),
      E_('View certificate link', S('ml-cert-view')),
      E_('Completed course card', S('mlc-course-card')),
      E_('Add to LinkedIn (primary)', S('mlc-linkedin-button')),
      E_('View certificate button (legacy)', S('mlc-view-certificate')),
      E_('Purchase certificate button', S('mlc-purchase')),
  ])

G('Feedback and overlays',
  'Tooltips, the help dialog, the Filter and sort side sheet, and the badges and tags. The (i) next to "Recommended experience" opens a modal dialog, not a hover tooltip. Overlays that appear elsewhere in this file: [Explore mega menu](#explore-mega-menu), [Filter popover](#filter-popover), [Select](#select).',
  [
      E_('Tooltip', P('tooltip'), [P('tooltip-icon')]),
      E_('Help dialog', P('help-dialog')),
      E_('Filter and sort side sheet', P('filter-sheet'), [P('filter-sheet-footer')]),
      E_('Badges and tags', P('tag-free-trial'), desc='Status tags: the public product card tags (Free trial, Top AI program, category, skill) and the due tags on learner pages. The first measurement is the Free trial tag (cds-tag-status, secondary, highlight1).',
         parts=
         [P('tag-top-ai'), P('tag-category'), P('tag-skill'), S('item-due-tag'), S('lesson-header-tag'), S('rail-due-tag')]),
      E_('Top Instructor badge', P('badge-top-instructor'),
         desc='"Top Instructor" badge in the hero: light blue fill, dark blue text.'),
  ])

G('Footer',
  'Full width, about 1745px tall on course pages: column headings, then Coursera, Community and More with app store badges, social icons and the copyright line.',
  [
      E_('Footer', P('footer'), [P('footer-heading'), P('footer-copyright')]),
      E_('Footer link', P('footer-link')),
      E_('Footer social icon', P('footer-social-icon')),
  ])


NOTES = {
    'Enroll button': 'The label is 16/24 600 over a 12.8/16 600 "Starts <date>" line, both white, with padding 11px 80px 13px. The compact sticky-nav copy is 180x60 with 32px side padding.',
    'Secondary button': 'The 1px edge is an inset box shadow in the label colour; the CSS border is 0.',
    'Product card': 'Four per row at 1440 with a 12px gutter. Tags are 20px tall and 14/18 600: Free trial is `#0d2f60` on `#f0f6ff`, Top AI program is `#2c0b65` on `#e8d6ff`.',
    'Course hero': 'The tint is a full-bleed 2880x524 layer at `rgba(0,86,210,.05)` (sampled `#f2f6fd` on white, no token) with a 566x465 decorative Coursera C in `#e3eeff` and `#6d7c99`. Partner logos are 36px tall, split by a 2x32 `#a7b4c9` rule.',
    'Stats card': 'It overlaps the bottom of the hero with `margin-top: -76px`. Cells are split by 1px `#e9eef7` left borders; values are 20/24 600 and sub-lines 14/20 `#48546e`.',
    'Top Instructor badge': 'The fill and radius sit on a wrapper: 16/20 600 `#0d2f60` on `#cfe2ff`, radius 4, padding 1px 5px.',
    'Module list': 'Module headers are full-width 76px ghost buttons (hover `#f0f6ff`); items are split by 2px `#e9eef7` rules.',
    'FAQ accordion': 'Items are split by 1px `#e9eef7` rules, with a leading 24px chevron that rotates in 150ms ease-in-out.',
    'Progress bar': 'The values below are for the fill. The track is `#f2f5fa` with a 1px `#f2f5fa` border, 8px tall, radius 8, 425.7 wide under the course title (12px above it); the fill is `#6f29e5`.',
    'Item row': 'The status icon is 20px (completed is a green check, `#197d12`), the title is 400 16/24 and the meta line 400 14/20 `#48546e` (`--cds-color-neutral-primary-weak`), for example "Video \u2022 5 min". Rows are 2px apart (62px pitch). There is no :active rule, so pressed looks like hover. The current item keeps the tint at rest, its title goes to 600, and a Resume button sits at the right end.',
    'Sidebar module row': 'A 16px ring (1px `#8495b0`) sits in a 20px box before the label, which is 400 14/20. Module rows are 268x36 and 2px apart; the selected row is 268x40 and its label steps up to 600 16/24.',
    'Tab (My Learning)': 'Tabs are 48px tall, padding 12/0 and 24px apart, label 400 16/24 `#404b5e`. The selected tab is 600 16/24 `#0d0f12` with 0.16px tracking over a 4px `#0d0f12` indicator (radius 2 2 0 0) on a full-width 1px `#c1cbdb` rule. Hover darkens the label to `#232b3a` and draws a 4px `#c1cbdb` bar with the same radius.',
    'Outline item row': 'Each row is a 344px-wide wrapper with radius 8 inside a full-width link; the current row gets the `#f0f6ff` tint and its title steps from 400 14/20 to 600 16/24.',
    'Resume button (course home)': 'The medium primary button is 36px tall with 600 14/20 and 0.14px tracking; the large variant (reading, assignment) is 48px tall, padding 12/24, 600 16/24 with 0.16px tracking. No transition.',
}

# card comparison table (default state values)
CARD_KEYS = [
    ('Product card', P('product-card')), ('Product card, list variant', P('product-card-list')),
    ('Stats card', P('stats-card')), ('Module list', P('module-list')), ('Review card', P('review-card')),
    ('Testimonial card', P('testimonial-card')), ('Instructor card', P('instructor-card')),
    ('Filter popover', P('filter-popover')),
    ('Course sidebar card', S('sidebar-card')), ('Weekly goal card', S('rail-goal-card')),
    ('Timeline card', S('rail-timeline-card')), ('Details box', S('info-details')),
    ('Syllabus module card', S('info-syllabus-module')), ('Assignment expectations card', S('assignment-expect-card')),
    ('Program card', S('ml-program-card')), ('Standalone course card', S('ml-course-card')),
    ('Calendar', S('ml-calendar')), ('Certificates card', S('ml-certificates-card')),
    ('Completed course card', S('mlc-course-card')),
]

# --------------------------------------------------------------------------- check coverage

used = {}
for gname, _, ents in GROUPS:
    for en in ents:
        for k in [en['key']] + en['parts']:
            if k in used:
                sys.exit('duplicate use of %s' % (k,))
            if k not in LOOK:
                sys.exit('unknown id %s' % (k,))
            used[k] = en['title']
missing = [k for k in LOOK if k not in used]
if missing:
    sys.exit('not covered: %s' % missing)
titles = [en['title'] for _, _, ents in GROUPS for en in ents]
if len(titles) != len(set(titles)):
    sys.exit('duplicate title')

# --------------------------------------------------------------------------- render

L = []
W = L.append


def slug(h):
    s = h.strip().lower()
    s = re.sub(r'[^\w\- ]', '', s)
    return s.replace(' ', '-')


def clean_desc(s):
    s = s.replace('—', ':')
    return s


def shots():
    d = {}
    for f in sorted(os.listdir('screenshots')):
        if not f.endswith('.png'):
            continue
        n = f[:-4]
        m = re.match(r'^(.*?)-(light|dark)-(.*)$', n)
        page, theme, state = m.groups()
        d.setdefault(page, {}).setdefault(theme, []).append(state)
    return d


SHOTS = shots()


def shot_links(page, theme):
    states = SHOTS.get(page, {}).get(theme, [])
    out = []
    for s in states:
        if s.endswith('-full') and s[:-5] in states:
            continue
        link = '[%s](screenshots/%s-%s-%s.png)' % (s, page, theme, s)
        if (s + '-full') in states:
            link += ' ([full](screenshots/%s-%s-%s-full.png))' % (page, theme, s)
        out.append(link)
    return ', '.join(out) if out else '-'


def count_shots():
    return sum(len(v) for t in SHOTS.values() for v in t.values())


W('# Coursera components')
W('')
W('The discovery list of every page and view captured, then one inventory entry per component with crops of the real product, the icon summary and the Gaps. Public pages were captured on 2026-09-29, signed out, in headless Chromium at 1440x900 (mobile 390x844) with computed styles read from the running page. The learner pages (course home, grades, course info, video, reading, assignment, My Learning) were captured the same day from 11 static DOM snapshots of a signed-in session with the learner\'s name replaced, and measured in headless Chromium at 1440x900. On the public pages nothing was signed into, enrolled in or submitted.')
W('')
W('The full per-state readings are in [raw/measurements.md](raw/measurements.md) (public) and [raw/measurements-signed-in.md](raw/measurements-signed-in.md) (learner pages), with machine-readable copies in [raw/components-computed.json](raw/components-computed.json) and [raw/components-signed-in.json](raw/components-signed-in.json). The page layouts are described in [raw/pages.md](raw/pages.md).')
W('')
W('How to read an entry:')
W('')
W('- Values are condensed from those files. A colour is the hex followed by the `--cds-*` token whose light value matches it (the semantic name, not the palette name); "no token" means nothing in the dump matches. Fonts are Source Sans Pro unless a value names another family, and are written size/line-height weight, for example `16/24 400`.')
W('- The state table has one row per state that differs. The first row lists every value; later rows list only what changes from it. A state with the same values as the first row is named in its label, for example "default (same: pressed)".')
W('- Entries that name several measured parts (a card and its logo, title and metadata) list each part as a row with its default values. "Measured as" gives the id in the raw files.')
W('- Crops are images of the component read from the live page: public crops are in [components/crops/](components/crops), learner-page crops in [components/crops/signed-in/](components/crops/signed-in). Screenshots are in [screenshots/](screenshots).')
W('')

# ------------------------------------------------ discovery list
W('## Discovery list')
W('')
W('Screenshots are named `{page}-{theme}-{state}.png`. Desktop shots are 2880x1800 (1440x900 at 2x); the `-full` shots are stored at 1x (1440 wide). Mobile shots are `mobile-{page}-{theme}-{state}.png`, 780 wide (390 at 2x). The state names below link to the file. L is light, D is dark.')
W('')
W('### Public pages (signed out)')
W('')
W('| Surface | URL | Captured | Light | Dark |')
W('|---|---|---|---|---|')
pubpages = [
    ('Home', 'home', '/', 'Hero carousel, three "New and popular" rails, gradient career bands, categories, FAQ, footer. Mega menu open state captured.'),
    ('Search results', 'search', '/search?query=machine%20learning', 'Suggestion chips, filter bar, 4-column product card grid. Filter dropdown, applied chip, filtered results and card hover captured.'),
    ('Browse category', 'browse', '/browse/data-science', 'Breadcrumb, stats, "Most popular" cards, sticky 304px filter sidebar, 3-column grid, FAQ.'),
    ('Course landing', 'course', '/learn/machine-learning', 'Hero, stats card, tabs, About, Outcomes, Modules with rail, Recommendations, Testimonials, Reviews, FAQ. All six tab positions, module expand and details, instructors, offered by, sticky nav and the AI panel captured.'),
    ('Second course', 'course2', '/learn/learning-how-to-learn', 'Same frame as the first course, no Outcomes tab, four modules, an "AI Graded" disclaimer.'),
    ('Specialization', 'specialization', '/specializations/machine-learning-introduction', 'Same hero and stats card; the course list replaces Modules; Course details opens a panel.'),
    ('Professional certificate', 'certificate', '/professional-certificates/google-data-analytics', 'Adds a dismissible promo banner and nine course rows.'),
]
for name, page, url, note in pubpages:
    nfull = 'desktop'
    W('| %s. %s | `%s` | desktop | %s | %s |' % (name, note, url, shot_links(page, 'light'), shot_links(page, 'dark')))
W('')
W('Mobile pages (390x844): header 65px with hamburger, wordmark and search icon; a 92px bar fixed to the bottom holds Enroll for free on course-like pages; the stat card becomes a stacked list; weeks and courses open a full-height sheet instead of expanding in place.')
W('')
W('| Surface | Light |')
W('|---|---|')
for name, page in [('Home', 'mobile-home'), ('Search results', 'mobile-search'), ('Course landing', 'mobile-course'), ('Specialization', 'mobile-specialization')]:
    W('| %s | %s |' % (name, shot_links(page, 'light')))
W('')
W('### Signed-in learner pages (light only, 1440x900)')
W('')
W('Course `machine-learning-duke` and the learner\'s My Learning page. The `Read on` label is the id the measurement file uses for that view.')
W('')
W('| View | URL | Read on | Screenshot |')
W('|---|---|---|---|')
si_views = [
    ('Course home, module 1 (in progress)', '/learn/machine-learning-duke/home/module/1', 'course-module-1', 'learn-home', 'module-in-progress'),
    ('Course home, module 2 (not started)', '/learn/machine-learning-duke/home/module/2', 'course-module-2', 'learn-home', 'module-not-started'),
    ('Course home, learning objectives shown', '/learn/machine-learning-duke/home/module/1', 'course-module-1-objectives', 'learn-home', 'objectives-expanded'),
    ('Grades', '/learn/machine-learning-duke/home/assignments', 'course-grades', 'learn-grades', 'default'),
    ('Course info', '/learn/machine-learning-duke/home/info', 'course-info', 'learn-info', 'default'),
    ('Video item', '/learn/machine-learning-duke/lecture/e8OsW/why-machine-learning-is-exciting', 'item-video', 'learn-video', 'default'),
    ('Video item, transcript open', '/learn/machine-learning-duke/lecture/ZEQi1/what-is-machine-learning', 'item-video-transcript', 'learn-video', 'transcript-open'),
    ('Reading item', '/learn/machine-learning-duke/supplement/Ixyzp/math-for-data-science', 'item-reading', 'learn-reading', 'default'),
    ('Assignment item (submitted)', '/learn/machine-learning-duke/assignment-submission/wJmSz/intro-to-machine-learning', 'item-assignment', 'learn-assignment', 'submitted'),
    ('My Learning, In Progress', '/my-learning?myLearningTab=IN_PROGRESS', 'my-learning', 'my-learning', 'default'),
    ('My Learning, Completed', '/my-learning?myLearningTab=COMPLETED', 'my-learning-completed', 'my-learning', 'completed'),
]
for name, url, label, page, state in si_views:
    f = 'screenshots/%s-light-%s.png' % (page, state)
    ff = 'screenshots/%s-light-%s-full.png' % (page, state)
    assert os.path.exists(f) and os.path.exists(ff), f
    W('| %s | `%s` | `%s` | [view](%s), [full](%s) |' % (name, url, label, f, ff))
W('')
W('### Overlays and transient states')
W('')
W('| Overlay or state | Where | Captured |')
W('|---|---|---|')
ov = [
    ('Explore mega menu', 'home, Explore button', 'L screenshot `home-light-explore-menu`; entry [Explore mega menu](#explore-mega-menu)', 'screenshots/home-light-explore-menu.png'),
    ('Filter dropdown popover', 'search, Topic and other pills', 'L and D screenshots; entry [Filter popover](#filter-popover)', 'screenshots/search-light-filter-dropdown.png'),
    ('Filter and sort side sheet', 'search, Filter & Sort', 'crop and measurements only; entry [Filter and sort side sheet](#filter-and-sort-side-sheet)', None),
    ('Applied filter chip, filtered results', 'search', 'L and D screenshots', 'screenshots/search-light-chip-applied.png'),
    ('Card hover', 'search', 'L and D screenshots; shadow and overlay label', 'screenshots/search-light-card-hover.png'),
    ('AI panel', 'course, specialization, certificate (desktop)', 'L and D screenshots; the panel opens by default and squeezes the page to 1024px', 'screenshots/course-light-ai-panel.png'),
    ('Sticky course nav', 'course, after the hero scrolls away', 'L and D screenshots; entry [Sticky nav](#sticky-nav)', 'screenshots/course-light-sticky.png'),
    ('Module expanded, module details', 'course Modules', 'L and D screenshots; entries [Module accordion](#module-accordion) and [Module panel](#module-panel)', 'screenshots/course-light-module-expanded.png'),
    ('Instructors and offered by rail', 'course Modules', 'L and D screenshots', 'screenshots/course-light-instructors.png'),
    ('Help dialog and tooltips', 'course, (i) and hover on icons', 'crops and measurements only; entries [Help dialog](#help-dialog) and [Tooltip](#tooltip)', None),
    ('Select menu', 'course reviews, course filter', 'crops and measurements only; entry [Select](#select)', None),
    ('Transcript pane', 'video item', 'L screenshot `learn-video-light-transcript-open`', 'screenshots/learn-video-light-transcript-open.png'),
    ('Learning objectives shown', 'course home', 'L screenshot `learn-home-light-objectives-expanded`', 'screenshots/learn-home-light-objectives-expanded.png'),
    ('Submitted assignment banner', 'assignment item', 'L screenshot `learn-assignment-light-submitted`', 'screenshots/learn-assignment-light-submitted.png'),
    ('Mobile sheet for a week or course', 'mobile course and specialization', 'L screenshots `mobile-course-light-modules-expanded`, `mobile-specialization-light-courses-expanded`', 'screenshots/mobile-course-light-modules-expanded.png'),
    ('Empty and error states', '-', 'none captured; see Gaps', None),
]
for a, b, c, f in ov:
    if f:
        assert os.path.exists(f), f
    W('| %s | %s | %s |' % (a, b, c))
W('')
W('Total: %d screenshots, %d components measured on public pages and %d on learner pages.' % (count_shots(), len(PUB), len(SI)))
W('')

# ------------------------------------------------ shared values
W('## Shared values')
W('')
W('Values that apply across entries, from the measurement files.')
W('')
W('**Focus ring.** CDS controls draw two 1px rings outside the element on an `::after` inset -2px with the control\'s own radius: `0 0 0 1px #804ee4, 0 0 0 2px #f0f6ff` (`--cds-color-interactive-stroke-primary-focus`, then `--cds-color-interactive-stroke-primary-focus-invert`), plus a transparent 1px outline for forced colours. Links put the same box shadow on the `<a>` with a 4px radius. The checkbox adds a 2px white gap first. In-page tabs use `outline: 1px solid #0056d2; outline-offset: -1px`. Learner-page list links (item rows, sidebar rows) use a 2px solid `#804ee4` outline at offset -3. The search filter pills are not CDS and take the browser default outline. On the learner pages CDS adds its focus class from JavaScript, so the `focus-visible-cds` state in those entries is emulated from the page\'s own rules.')
W('')
W('**Motion.** The CDS buttons measured on the public pages have `transition: none` in every state; the transitions that were measured are below, and the pressed state of the learner-page AI buttons and the legacy View certificate button carry their own (see those entries).')
W('')
W('| Duration | Easing | Property | Where |')
W('|---|---|---|---|')
W('| 0.15s | `cubic-bezier(0.4, 0, 0.2, 1)` | background-color | checkbox glyph |')
W('| 0.15s | `ease-in-out` | transform | FAQ chevron |')
W('| 0.2s | `ease-in-out` | transform | header container |')
W('| 0.3s | `cubic-bezier(0, 0, 0.5, 1)` | all | pill, product card, list product card |')
W('')
W('**Layout grid.** Read on the course page and the search grid at each width.')
W('')
m = re.search(r'^## Layout grid\n.*?(\| Viewport.*?)\n\n', open('raw/measurements.md').read(), re.S | re.M)
grid = m.group(1).split('\n')
for r in grid:
    W(r)
W('')
W('**Card shapes.** Default-state values; the entries hold the states.')
W('')
W('| Card | Size | Border | Radius | Background | Box shadow | Padding |')
W('|---|---|---|---|---|---|---|')
for label, k in CARD_KEYS:
    e = LOOK[k]
    rows = rows_of(e)

    def g(p):
        c = rows.get(p)
        if not c or c[0] in SAME:
            return '-'
        return esc(cond(c[0]))
    W('| [%s](#%s) | %s | %s | %s | %s | %s | %s |' % (label, slug(label), g('Size'), g('Border'), g('Radius'), g('Background'), g('Box shadow'), g('Padding')))
W('')

# ------------------------------------------------ component entries
W('## Components')
W('')
n_entries = 0
n_crops = 0
crop_links = []


def render_entry(en):
    global n_entries, n_crops
    e = LOOK[en['key']]
    n_entries += 1
    W('#### %s' % en['title'])
    desc = en.get('desc') or clean_desc(e['desc'])
    if not desc.endswith(('.', '"', ')')):
        desc += '.'
    if e['src'] == 'p':
        meas = 'Measured as `%s` on the %s page.' % (e['id'], {'spec': 'specialization'}.get(e['page'], e['page']))
    else:
        pg = ', '.join(SNAP.get(p, p) for p in e['pages']) or 'learner pages'
        meas = 'Measured as `%s` on %s.' % (e['id'], pg)
    note = NOTES.get(en['title'], '')
    W(' '.join(x for x in (desc, meas, note) if x))
    W('')
    rows, single = render_state_rows(e)
    if single and rows:
        W('**Values.** %s.' % esc(rows[0][1]))
        W('')
    elif rows:
        W('| State | Values (later rows list only what changes from the first row) |')
        W('|---|---|')
        for lab, vals in rows:
            W('| %s | %s |' % (lab, esc(vals)))
        W('')
    pl = painted_line(e)
    if pl:
        W('Child layers that carry the look: %s.' % esc(pl))
        W('')
    # parts
    if en['parts']:
        W('| Part | Values (default) |')
        W('|---|---|')
        for pk in en['parts']:
            pe = LOOK[pk]
            extra = ''
            if len(pe['states']) > 1:
                extra = '; states measured: %s' % ', '.join(pe['states'])
            W('| `%s` | %s%s |' % (pe['id'], esc(part_values(pe)), extra))
        W('')
    # crops
    imgs = []
    for st, path in crops_for(e):
        imgs.append(img('%s %s' % (en['title'], st), path))
        crop_links.append(path)
    for pk in en['parts']:
        pe = LOOK[pk]
        cs = crops_for(pe, limit=1)
        if cs:
            st, path = cs[0]
            imgs.append(img('%s (%s) %s' % (en['title'], pe['id'], st), path))
            crop_links.append(path)
    if imgs:
        W(' '.join(imgs))
    else:
        W('No crop was saved for this entry; the values are from the computed styles.')
    W('')


for gname, intro, ents in GROUPS:
    W('### %s' % gname)
    W('')
    W(intro)
    W('')
    for en in ents:
        render_entry(en)

# ------------------------------------------------ icons
W('## Icons')
W('')
rows = [r.rstrip('\n').split('\t') for r in open('icons/INDEX.tsv').read().strip().split('\n')]
hdr, rows = rows[0], rows[1:]
W('%d SVGs were extracted from the public pages into [icons/](icons), with the source table in [icons/INDEX.tsv](icons/INDEX.tsv). The view box column is each SVG\'s own coordinate space and every one is a fill icon. The SVGs are Coursera\'s property, exported for reference use only.' % len(rows))
W('')
W('| Icon | Rendered sizes | View box | Seen on | Text next to it |')
W('|---|---|---|---|---|')
cat = [r for r in rows if r[0].startswith('category-')]
other = [r for r in rows if not r[0].startswith('category-')]


def label(r):
    t = r[8].replace('\u200b', '').strip()
    if t in ('', 'div', 'span', 'a') or t.startswith('div ') or t.startswith('span '):
        return '-'
    chunks = [c.strip() for c in t.split(' / ')]
    out = chunks[0]
    if len(out) > 42:
        out = out[:42].rsplit(' ', 1)[0]
    elif len(chunks) > 1 and len(out) + len(chunks[1]) < 40:
        out = out + ' / ' + chunks[1]
    return esc(out)


for r in other:
    assert os.path.exists('icons/' + r[0])
    W('| [%s](icons/%s) | %s | %s | %s | %s |' % (r[0], r[0], r[3], r[4] or '-', r[6], label(r)))
if cat:
    files = ', '.join('[%s](icons/%s)' % (r[0][len('category-'):-4], r[0]) for r in cat)
    W('| category-* (%d) | %s | %s | %s | category pills: %s |' % (len(cat), cat[0][3], cat[0][4], cat[0][6], files))
W('')

# ------------------------------------------------ gaps
W('## Gaps')
W('')
W('### Public pages')
W('')
W('- **Left filter panel:** none exists on the search page. Filters are pill dropdowns (Topic, Duration, Learning Product, Language, Level, AI topic pills) plus the Filter and sort sheet, and sort is the "Sort by" radio group (Best Match, Newest) in that sheet, not a dropdown.')
W('- **Pill hover:** the home page partner pills sit in a horizontal carousel that Playwright reports as outside the viewport, so only default and focus-visible were read.')
W('- **Select option focus-visible:** after ArrowDown in the open select no option carried focus, so that state is missing. Selected and hover are measured.')
W('- **Tab bar overflow chevron:** not reported visible at 1440, so it has no entry. Its two gradient fades are in the `tab-bar` paint list.')
W('- **Help (i):** opens a modal dialog, not a hover tooltip. Both are measured (`help-dialog`, `tooltip`, `tooltip-icon`).')
W('- **Disabled primary button:** none appeared. Disabled ghost and disabled secondary were measured in the filter popover and sheet.')
W('- **Not measured on purpose:** the AI coach panel contents, the cookie banner (OneTrust is in the DOM but showed nothing in a fresh context, so nothing was declined), sign-in and enrolment flows.')
W('- **Footer link lists:** the link lists under the footer headings did not render in the headless captures, so the footer screenshots show headings over empty space. The footer link entry was measured on the home page.')
W('- **Empty and error states, toasts:** none appeared on any captured page.')
W('')
W('### Signed-in pages')
W('')
W('The learner pages were measured from static snapshots with scripts stripped, so anything that needs JavaScript is missing:')
W('')
W('- every menu: app switcher, help, language, notifications, avatar, the Explore mega menu on signed-in pages, and the course overflow menu')
W('- the Coursera AI chat panel')
W('- opening or closing any accordion or disclosure: only the states captured are measured (Course Material open and closed, objectives shown and hidden, outline modules open and closed)')
W('- "Show more" expansions, the language select list, calendar month paging, tooltips, the Save note dialog')
W('- video playback: the player is a poster frame, the control bar\'s show and hide is scripted, and the transcript highlight does not move')
W('- CDS keyboard focus rings are emulated (`focus-visible-cds`), because CDS adds its focus class from JavaScript')
W('- the reading in the snapshot has no subheadings, lists, code or tables; their styles come from a probe block the script inserted into the reading viewer, marked as such in [raw/measurements-signed-in.md](raw/measurements-signed-in.md)')
W('')
W('### Themes')
W('')
W('- **Dark is a forced flip, not a shipped theme.** Coursera has no dark setting and ignores `prefers-color-scheme` (a dark-scheme context still loads with `data-color-theme="light"`). Setting `data-color-theme="dark"` and `color-scheme: dark` on the root after load re-renders every page, because each colour token is a `light-dark()` pair. Learners are never offered it.')
W('- **Dark quirks:** partner logos and some art keep their light look (logos gain a white pill), the audience strip is black in both themes, and the tab bar overflow fade stays light.')
W('- **Dark screenshots** exist only for the search and course pages. No component was measured in dark, and the signed-in pages are light only.')
W('')
W('### Screenshots')
W('')
W('- Full-page shots (`-full`) are stored at 1x (1440 wide); the viewport shots are 2x.')
W('- Page heights move by a few hundred pixels between loads because carousels, promo banners and lazy images differ.')
W('- The AI panel opens by default on desktop course, specialization and certificate pages and pushes the content into 1024px. Component measurements were taken with it closed; the `ai-panel` screenshots show it.')
W('- In full-page mobile shots the fixed bottom CTA bar shows up mid-page where the tile boundary fell; ignore it.')
W('- Learner shots are rendered from redacted DOM snapshots, not from the live app, and the learner\'s name is replaced by "Learner".')
W('')
W('### Content left out')
W('')
W('- **Discussion forums, messages and notes** were not captured: they hold other people\'s posts or the learner\'s own notes.')
W('- **Mobile:** the learner pages were captured at desktop width only, and the public mobile pages have screenshots but no component measurements; their layout facts are in [raw/pages.md](raw/pages.md).')
W('- **Learner-page icons:** the SVG set was extracted from the public pages only, so an icon that appears only on a learner page has a crop but no SVG file in [icons/](icons).')
W('- **Sign-in and enrolment flows** were not entered, and nothing was submitted; the assignment page was captured in its submitted state only.')
W('')

txt = '\n'.join(L) + '\n'
txt = txt.replace('—', ':')
open('components.md', 'w').write(txt)

# ------------------------------------------------ verify links
bad = []
alllinks = re.findall(r'\]\(([^)#\s]+)(?:#[^)]*)?\)', txt)
for p in alllinks:
    if p.startswith('http'):
        continue
    if not os.path.exists(p):
        bad.append(p)
crop_count = len(re.findall(r'!\[[^\]]*\]\(components/crops/', txt))
print('lines', len(txt.splitlines()), 'entries', n_entries, 'crop images', crop_count, 'bad links', bad[:10], len(bad))

# anchor check
heads = set(slug(h) for h in re.findall(r'^#{2,4} (.+)$', txt, re.M))
badanch = [a for a in re.findall(r'\]\(#([^)]+)\)', txt) if a not in heads]
print('bad anchors', badanch)
