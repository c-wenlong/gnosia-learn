# convert every capture to sRGB using its embedded ICC profile (Display P3 or the external monitor's)
from PIL import Image, ImageCms; import io, glob, os
D='wt/docs/design/reference/brilliant/screenshots/'
srgb=ImageCms.createProfile('sRGB')
for f in sorted(glob.glob(D+'*.png')):
    im=Image.open(f); p=im.info.get('icc_profile'); im=im.convert('RGB')
    if p: im=ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(p)), srgb, outputMode='RGB')
    im.save('cap/srgb_'+os.path.basename(f))
print('ok')
