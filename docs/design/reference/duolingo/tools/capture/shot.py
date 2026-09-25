#!/usr/bin/env python3
"""shot.py NAME INNER_W INNER_H : capture the Duolingo Chrome window, crop to the viewport."""
import subprocess,sys,os,re
from PIL import Image
D=os.path.dirname(os.path.abspath(__file__))
import json
name=sys.argv[1]
if len(sys.argv)>3: w,h=int(sys.argv[2]),int(sys.argv[3])
else:
    m=json.load(open(f'{D}/dumps/{name}.json'))['meta']; w,h=m['w'],m['h']
out=subprocess.run([f'{D}/winid'],capture_output=True,text=True).stdout
wid=None
for m in re.finditer(r'^(\d+) (.*?) \{',out,re.M):
    if 'Duolingo' in m.group(2) or 'duolingo' in m.group(2).lower(): wid=m.group(1)
if wid: open(f'{D}/.wid','w').write(wid)
else: wid=open(f'{D}/.wid').read().strip()
raw=f'{D}/_raw.png'
subprocess.run(['screencapture','-x','-o','-l'+wid,raw],check=True)
im=Image.open(raw); W,H=im.size; s=2
box=(W-w*s,H-h*s,W,H)
im.crop(box).save(f'{D}/out/screenshots/{name}.png')
p=im.crop(box); p.thumbnail((900,900)); p.save(f'{D}/_preview.png')
print(name, im.size, box)
