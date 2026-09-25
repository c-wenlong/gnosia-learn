#!/bin/bash
# usage: shot.sh <name> <innerWidth> <innerHeight>  -> saves cropped viewport PNG into the worktree screenshots dir
SP=${SP:?set SP to a scratch dir holding the compiled window lister at $SP/cap/wins}
OUT=${OUT:-$(cd "$(dirname "$0")/../../screenshots" && pwd)}
WID=$($SP/cap/wins | awk '/Brilliant|brilliant/{print $1; exit}')
[ -z "$WID" ] && WID=$($SP/cap/wins | awk '{print $1; exit}')
BOUNDS=$($SP/cap/wins | awk -v w=$WID '$1==w{print $(NF-2), $(NF-1)}')
screencapture -x -o -l$WID $SP/cap/raw.png
python3 - "$SP/cap/raw.png" "$OUT/$1.png" $2 $3 $BOUNDS <<'PY'
import sys; from PIL import Image
src,dst,iw,ih,ww,wh=sys.argv[1],sys.argv[2],*map(float,sys.argv[3:7])
im=Image.open(src); s=im.size[0]/ww
l=(ww-iw)*s; t=60*s  # Chrome toolbar is 60px; the debugging infobar below it is skipped by colour
rgb=im.convert('RGB'); x=int(im.size[0]*0.9)
near=lambda p:all(abs(a-b)<=6 for a,b in zip(p,(53,60,76)))
t=int(t)
while t<im.size[1]//3 and near(rgb.getpixel((x,t))): t+=1
im.crop((round(l),round(t),im.size[0],im.size[1])).save(dst); print(dst, im.crop((round(l),round(t),im.size[0],im.size[1])).size)
PY
