import json, sys, re, os
src, outdir = sys.argv[1], sys.argv[2]
raw = open(src).read()
try:
    arr = json.loads(raw); text = ''.join(x.get('text', '') for x in arr)
except Exception:
    text = raw
text = json.JSONDecoder().raw_decode(text)[0] if text.startswith(chr(34)) else text
m = re.search(r'SNAPSTART(.*?)SNAPMETA(.*)SNAPEND', text, re.S)
meta = json.loads(m.group(1)); html = m.group(2)
leaks = [w for w in ['Kai Chen', 'chenwenlong', 'Wenlong', 'National University of Singapore', 'Uplift Mentorship', 'uplift-mentorship'] if w.lower() in html.lower()]
leaks += re.findall(r'\bKai\b', html)
if leaks: sys.exit(f'LEAK {leaks}')
os.makedirs(outdir, exist_ok=True)
open(f"{outdir}/{meta['label']}.html", 'w').write(html)
json.dump(meta, open(f"{outdir}/{meta['label']}.json", 'w'), indent=1)
print(meta['label'], len(html), meta)
