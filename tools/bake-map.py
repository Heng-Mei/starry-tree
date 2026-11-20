# Bakes assets/starry-map.png from a public-domain scan of The Starry Night.
# uv run --with pillow --with numpy --with scipy python tools/bake-map.py starry.jpg
# Source: https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg (1280px thumb)
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as nd

GW, GH = 128, 101

src = Image.open(sys.argv[1]).convert('RGB').resize((1280, 1013), Image.LANCZOS)
im = np.asarray(src).astype(np.float32) / 255
H, W, _ = im.shape
r, g, b = im[..., 0], im[..., 1], im[..., 2]
lum = 0.299 * r + 0.587 * g + 0.114 * b
yy, xx = np.mgrid[0:H, 0:W]

# cypress: dark, not blue, left half; closed so sky gaps between flames go too
cyp = (lum < 0.27) & (b < g * 1.5 + 0.05) & (xx < 640) & (yy > 40)
cyp = nd.binary_opening(cyp, iterations=2)
cyp = nd.binary_closing(cyp, iterations=6)
lab, n = nd.label(cyp)
sizes = nd.sum(cyp, lab, range(1, n + 1))
cyp = np.isin(lab, 1 + np.flatnonzero(sizes > 4000))
cyp = nd.binary_dilation(cyp, iterations=8)

# structure tensor -> stroke direction (perpendicular to the gradient)
gx = nd.gaussian_filter(lum, 1.5, order=(0, 1))
gy = nd.gaussian_filter(lum, 1.5, order=(1, 0))
J = [nd.gaussian_filter(v, 5) for v in (gx * gx, gy * gy, gx * gy)]


def cells(a):
    return a[: GH * 10, : GW * 10].reshape(GH, 10, GW, 10, *a.shape[2:]).mean((1, 3))


valid = ~cyp
vc = cells(valid.astype(np.float32))
# the scan shows bare canvas along the edges; inpaint those cells too
vc[:, :2] = vc[:, -2:] = vc[:1] = vc[-1:] = 0


def fill(a):
    # normalized-convolution inpainting of cells covered by the cypress
    a = a.copy()
    w = (vc > 0.5).astype(np.float32)
    a = a * (w[..., None] if a.ndim == 3 else w)
    acc, wacc = a.copy(), w.copy()
    out = a.copy()
    known = w > 0
    for s in (1, 2, 4, 8, 16):
        num = nd.gaussian_filter(acc, (s, s, 0) if a.ndim == 3 else s)
        den = nd.gaussian_filter(wacc, s)
        est = num / np.maximum(den, 1e-6)[..., None] if a.ndim == 3 else num / np.maximum(den, 1e-6)
        m = (~known) & (den > 0.02)
        out[m] = est[m]
        known |= m
    return out


# broken colour: per cell, mean of the lighter and darker halves of its pixels
lc = lum[: GH * 10, : GW * 10].reshape(GH, 10, GW, 10).transpose(0, 2, 1, 3).reshape(GH, GW, 100)
pc = im[: GH * 10, : GW * 10].reshape(GH, 10, GW, 10, 3).transpose(0, 2, 1, 3, 4).reshape(GH, GW, 100, 3)
med = np.median(lc, axis=2, keepdims=True)
hi = (lc >= med)[..., None]
light = (pc * hi).sum(2) / np.maximum(hi.sum(2), 1)
dark = (pc * ~hi).sum(2) / np.maximum((~hi).sum(2), 1)
light, dark = fill(light), fill(dark)

Jc = [fill(cells(v * valid)) / np.maximum(fill(vc), 1e-3) for v in J]
jxx, jyy, jxy = Jc
theta = 0.5 * np.arctan2(2 * jxy, jxx - jyy) + np.pi / 2  # image coords, y down
ang = np.mod(-theta, np.pi)  # painting coords, y up
l1 = 0.5 * (jxx + jyy + np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2))
l2 = 0.5 * (jxx + jyy - np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2))
coh = ((l1 - l2) / np.maximum(l1 + l2, 1e-9)) ** 0.5

# horizon: hills top in image px, sampled left to right
HX = [0, 120, 300, 470, 560, 640, 760, 900, 1040, 1120, 1180, 1280]
HY = [700, 735, 745, 735, 690, 650, 640, 640, 590, 545, 520, 520]
cy_px = (np.arange(GH) + 0.5) * 10
cx_px = (np.arange(GW) + 0.5) * 10
horizon = np.interp(cx_px, HX, HY)
ground = cy_px[:, None] > horizon[None, :]
village = ground & (cy_px[:, None] > 790) & (cx_px[None, :] > 440)
mean_l = cells(lum[..., None])[..., 0]
swirl = (~ground) & (mean_l > 0.46)
region = np.where(ground, np.where(village, 5, 4), np.where(swirl, 1, 0)).astype(np.uint8)
region[cells(cyp.astype(np.float32)[..., None])[..., 0] > 0.5] += 8  # behind the tree

# four stacked sections: light, dark, stroke direction as doubled angle (filters linearly) + coherence, region id * 16
out = np.zeros((GH * 4, GW, 3), np.uint8)
out[:GH] = np.clip(light * 255 + 0.5, 0, 255)
out[GH:2 * GH] = np.clip(dark * 255 + 0.5, 0, 255)
out[2 * GH:3 * GH, :, 0] = np.clip((np.cos(2 * ang) * 0.5 + 0.5) * 255 + 0.5, 0, 255)
out[2 * GH:3 * GH, :, 1] = np.clip((np.sin(2 * ang) * 0.5 + 0.5) * 255 + 0.5, 0, 255)
out[2 * GH:3 * GH, :, 2] = np.clip(coh * 255, 0, 255)
out[3 * GH:] = (region * 16)[..., None]
Image.fromarray(out).save('assets/starry-map.png', optimize=True)

# yellow spots: stars in the sky, windows in the village
yel = (r > 0.55) & (g > 0.5) & (b < 0.42)
for name, m in (('sky', yel & (yy < 640)), ('village', yel & (yy > 760) & (xx > 440))):
    lab, n = nd.label(nd.binary_opening(m))
    for i, sl in enumerate(nd.find_objects(lab), 1):
        area = (lab[sl] == i).sum()
        if area < (40 if name == 'sky' else 12):
            continue
        cyx = nd.center_of_mass(lab == i)
        print(name, round(cyx[1]), round(cyx[0]), area)
