"""Convert raw window captures to sRGB and store them as 256-colour PNGs.

usage: python3 tools/capture/srgb.py RAW_DIR SRGB_DIR

Each capture is converted with its own embedded ICC profile (Display P3 on the laptop panel, the
monitor's profile on an external display). SRGB_DIR gets full-colour copies for crops.py; screenshots/
gets the 256-colour versions that are committed.
"""
from PIL import Image, ImageCms
import io, sys, pathlib
REF = pathlib.Path(__file__).resolve().parent.parent.parent
RAW, MID = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
OUT = REF / 'screenshots'
MID.mkdir(parents=True, exist_ok=True)
srgb = ImageCms.createProfile('sRGB')
n = 0
for f in sorted(RAW.glob('*.png')):
    im = Image.open(f); p = im.info.get('icc_profile'); im = im.convert('RGB')
    if p:
        im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(p)), srgb, outputMode='RGB')
    im.save(MID / f.name)
    im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(OUT / f.name, optimize=True)
    n += 1
print(n, 'screenshots ->', OUT)
