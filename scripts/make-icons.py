#!/usr/bin/env python3
"""Generate placeholder PWA icons.

Produces a stylized 'A' on a dark background at the sizes iOS and the manifest
need. Replace src/icons/*.png with real artwork when you have it.
"""
from PIL import Image, ImageDraw, ImageFont
import os, sys

OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'icons')
os.makedirs(OUT, exist_ok=True)

BG = (16, 16, 21, 255)
FG = (255, 200, 70, 255)

SIZES = [
    ('icon-180.png',  180, False),  # apple-touch-icon
    ('icon-192.png',  192, False),
    ('icon-512.png',  512, False),
    ('icon-mask.png', 512, True),   # maskable: pad safe-zone (~80%)
]

def render(path, size, maskable):
    img = Image.new('RGBA', (size, size), BG)
    draw = ImageDraw.Draw(img)
    # Tile-ish backdrop hint
    pad = int(size * 0.12)
    if maskable:
        pad = int(size * 0.20)
    # Letter
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', int(size*0.62 if not maskable else size*0.5))
    except Exception:
        font = ImageFont.load_default()
    text = 'A'
    bbox = draw.textbbox((0,0), text, font=font)
    tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
    draw.text(((size-tw)/2 - bbox[0], (size-th)/2 - bbox[1] - int(size*0.02)), text, fill=FG, font=font)
    # Faux tetromino accents
    block = max(2, size // 16)
    for (x, y) in [(pad, pad), (size-pad-block, pad), (pad, size-pad-block), (size-pad-block, size-pad-block)]:
        draw.rectangle([x, y, x+block, y+block], fill=FG)
    img.save(os.path.join(OUT, path), 'PNG', optimize=True)
    print(f'  wrote {path} ({size}x{size}{" maskable" if maskable else ""})')

for name, size, maskable in SIZES:
    render(name, size, maskable)
