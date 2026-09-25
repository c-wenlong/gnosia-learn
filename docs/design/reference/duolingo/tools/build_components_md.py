import json,re,os,pathlib
os.chdir(pathlib.Path(__file__).resolve().parent.parent)
core=json.load(open('components/core.json')); prod=json.load(open('components/product.json'))
coremd=open('components/core.md').read(); prodmd=open('components/product.md').read()
disc=open('raw/discovery.md').read(); icons=open('icons.md').read(); tnotes=open('tokens-notes.md').read()
def slug(h):
    s=h.strip().lower(); s=re.sub(r'[^\w\- ]','',s); return s.replace(' ','-')
def heading_for(md,name,level):
    hs=[m.group(1).strip() for m in re.finditer(r'^'+'#'*level+r' (.+)$',md,re.M)]
    if name in hs: return name
    for h in hs:
        if h.startswith(name.split(' (')[0][:20]): return h
    return None
def crops(c):
    cr=c.get('crops') or []
    if isinstance(cr,dict):
        out=[]; [out.extend(v if isinstance(v,list) else [v]) for v in cr.values()]; cr=out
    pick={}
    for p in cr:
        th='dark' if '-dark' in p else 'light' if '-light' in p else 'x'
        pick.setdefault(th,p)
    return [pick[t] for t in ('light','dark') if t in pick]
def first_anatomy(c):
    a=c.get('anatomy') or []
    if isinstance(a,str): return a[:160]
    return '; '.join(str(x) for x in a[:3])[:220]
L=[]
L.append('# Duolingo: component reference\n')
L.append('Captured from www.duolingo.com on 2026-09-25, signed in (free account, Japanese course), in both themes. Every measurement is a computed style read from the running app, or a CSS rule from its own stylesheets where a state could not be held live; each spec row names its source. Token names refer to [tokens.json](tokens.json); the rendered versions are in [style-guide.html](style-guide.html).\n')
L.append('This file is the inventory: the discovery list, one entry per component with its crops, and the Gaps. The full specs (anatomy, measurement tables, state tables with sources, tokens per theme) are in [components/core.md](components/core.md) (generic components) and [components/product.md](components/product.md) (Duolingo-specific components), with machine-readable copies in `components/*.json`.\n')
L.append('Screenshots are named `{page}-{theme}-{state}.png` and are 2x. Desktop captures are 1200x797 CSS px (early dark captures) or 1384x797 (later dark lesson captures and all light captures, after the browser sidebar collapsed); mobile captures are 570px wide, inside Duolingo\'s `max-width: 699px` layout. The viewport edges carry a faint orange glow and some shots show an orange-outlined pointer: both come from the browser automation, not from Duolingo.\n')
L.append(disc.strip()+'\n')
L.append('## Core components\n')
L.append('Generic building blocks. Full specs: [components/core.md](components/core.md).\n')
# button variants table verbatim
m=re.search(r'^## Button variants \(colour table\)\n(.*?)(?=^## )',coremd,re.M|re.S)
if m:
    L.append('### Button variants\n')
    L.append(m.group(1).replace('](crops/','](components/crops/').strip()+'\n')
for c in core['components']:
    h=heading_for(coremd,c['name'],2) or c['name']
    L.append(f"### {c['name']}\n")
    L.append(f"{first_anatomy(c)}. [Full spec](components/core.md#{slug(h)})\n")
    imgs=crops(c)
    if imgs: L.append(' '.join(f"![{c['id']} {('dark' if '-dark' in p else 'light')}](components/{p})" for p in imgs)+'\n')
L.append('## Product-specific components\n')
L.append('Components distinctive to Duolingo. Full specs: [components/product.md](components/product.md).\n')
group=None
for c in prod['components']:
    if c.get('group')!=group:
        group=c.get('group'); L.append(f'### {group}\n')
    h=heading_for(prodmd,c['name'],3) or c['name']
    L.append(f"#### {c['name']}\n")
    where=c.get('where') or ''
    L.append(f"{first_anatomy(c)}. Where: {str(where)[:160]}. [Full spec](components/product.md#{slug(h)})\n")
    imgs=crops(c)
    if imgs: L.append(' '.join(f"![{c['id']} {('dark' if '-dark' in p else 'light')}](components/{p})" for p in imgs)+'\n')
# icons summary
im=re.search(r'^## Summary\n(.*?)(?=^## )',icons,re.M|re.S)
L.append('## Icons\n')
L.append((im.group(1).strip() if im else '')+'\n')
L.append('The per-icon table (file, source, where used, rendered size, fill or stroke, colours) is in [icons.md](icons.md). The SVGs in [icons/](icons) are Duolingo\'s property, exported for reference use only.\n')
# gaps
L.append('## Gaps\n')
L.append('### Capture\n')
L.append('''- **Log-in and sign-up flow:** not captured. Opening it needs a logged-out session, and the only logged-out browser available could not save screenshots or reach the local capture sink. The landing page has computed values only ([raw/landing-light-values.json](raw/landing-light-values.json)).
- **Toasts:** none appeared in any flow. The one transient confirmation is the inline "Copy link" to "Copied" label swap in the invite modal.
- **Out-of-hearts screen:** not captured, because reaching it would have spent the account's last heart.
- **Light lesson complete:** the screen was covered by a video ad before it could be captured. The dark version is complete, and the light colours follow from the same rules.
- **Light incorrect-answer bar:** not captured, to keep the last heart. It is derived from the CSS rules plus the light palette and marked `derived, not captured` in the spec.
- **Native select menu:** the open state is drawn by the OS, not the DOM.
- **Mobile:** the viewport was 570px (Chrome's minimum window width with the tab sidebar), not a phone width. The 360 to 375px rules come from `@media` rules only. Mobile popovers, menus, modals and sheets were not captured.
- **Tablet range 700 to 1159px:** the compact 88px icon-only sidebar was never on screen, so it comes from CSS only.
- **Screenshot vs dump mismatches:** some dark lesson and leaderboard screenshots were retaken during a second lesson while their dumps come from the first, and `leaderboard-dark-mobile` differs too. The component crops from those were offset and checked by eye. See `SHOT_MISMATCH` in the product spec.
- **Pressed / active states:** a static dump cannot hold a mouse press, so every pressed value comes from CSS `:active` rules.
- **Personal data:** the email field in the four `settings-profile-*` screenshots is blurred. Other users' names and avatars appear in leaderboard, profile and search captures as they did on screen.
''')
tg=re.search(r'^## Gaps\n(.*)',tnotes,re.M|re.S)
L.append('### Tokens\n'); L.append((tg.group(1).strip() if tg else '')+'\n')
L.append('### Core components\n')
for g in core.get('gaps',[]): L.append(f'- {g}')
L.append('')
L.append('### Product-specific components\n')
for g in prod.get('gaps',[]):
    L.append(f"- {g if isinstance(g,str) else (g.get('component','')+': '+g.get('gap',str(g)))}")
L.append('')
ig=re.search(r'^## Gaps\n(.*)',icons,re.M|re.S)
L.append('### Icons\n'); L.append((ig.group(1).strip() if ig else '')+'\n')
txt='\n'.join(L).replace('—','-')
open('components.md','w').write(txt)
print(len(txt.splitlines()),'lines', len(txt)//1024,'KB')
