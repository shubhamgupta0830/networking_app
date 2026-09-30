#!/usr/bin/env python3
"""
Generates the PWA icon set and the iOS splash screens from one vector-ish
definition, so every size stays consistent.

The mark is a QR code's three finder squares plus a pair of opposed arrows —
"scan" and "swap", the two things the app does — in white on a blue gradient.

    python3 scripts/generate_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "public" / "icons"
SPLASH_DIR = ROOT / "public" / "splash"

TOP = (58, 160, 255)
BOTTOM = (10, 82, 212)
WHITE = (255, 255, 255, 255)

SUPERSAMPLE = 4
ICON_SIZES = [48, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512, 1024]
FAVICON_SIZES = [16, 32]

# Apple only shows a launch image when one matches the device exactly.
SPLASH_SIZES = [
    (640, 1136), (750, 1334), (828, 1792), (1125, 2436), (1170, 2532),
    (1179, 2556), (1242, 2688), (1284, 2778), (1290, 2796), (1536, 2048),
    (1620, 2160), (1668, 2224), (1668, 2388), (2048, 2732),
]


def gradient(size, top=TOP, bottom=BOTTOM):
    """Vertical linear gradient as an RGB image."""
    image = Image.new("RGB", (1, size[1]))
    for y in range(size[1]):
        t = y / max(1, size[1] - 1)
        image.putpixel(
            (0, y),
            tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )
    return image.resize(size, Image.BICUBIC)


def finder(draw, x, y, unit, thickness_units=1.0):
    """One QR finder pattern: a ring with a filled centre."""
    outer = unit * 7
    t = unit * thickness_units
    draw.rounded_rectangle(
        [x, y, x + outer, y + outer], radius=unit * 1.6, outline=WHITE, width=round(t)
    )
    inner = unit * 3
    offset = (outer - inner) / 2
    draw.rounded_rectangle(
        [x + offset, y + offset, x + offset + inner, y + offset + inner],
        radius=unit * 0.7,
        fill=WHITE,
    )


def swap_arrows(draw, cx, cy, unit):
    """Two opposed arrows along the diagonal, reading as an exchange."""
    length = unit * 5.2
    bar = unit * 1.05
    head = unit * 2.0
    gap = unit * 1.5

    for direction in (1, -1):
        # Offset the two arrows to opposite sides of the diagonal centre line.
        ox = cx + direction * gap * 0.5
        oy = cy - direction * gap * 0.5
        x0 = ox - direction * length / 2
        x1 = ox + direction * length / 2

        draw.rounded_rectangle(
            [min(x0, x1), oy - bar / 2, max(x0, x1), oy + bar / 2],
            radius=bar / 2,
            fill=WHITE,
        )
        draw.polygon(
            [
                (x1 + direction * head * 0.55, oy),
                (x1 - direction * head * 0.35, oy - head * 0.62),
                (x1 - direction * head * 0.35, oy + head * 0.62),
            ],
            fill=WHITE,
        )


def draw_mark(size, inset_ratio, simple=False):
    """
    Renders the mark on a transparent layer sized `size`, with the artwork
    confined to a square of side `size * (1 - 2 * inset_ratio)`.

    `simple` drops the swap arrows, which turn to mush below about 40px, and
    squares off the layout into four finder patterns instead.
    """
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    inset = size * inset_ratio
    span = size - inset * 2
    # The mark is laid out on a 21-unit grid, like a QR code's smallest version.
    unit = span / 21
    left, top = inset, inset

    thickness = 1.5 if simple else 1.15
    finder(draw, left, top, unit, thickness_units=thickness)
    finder(draw, left + unit * 14, top, unit, thickness_units=thickness)
    finder(draw, left, top + unit * 14, unit, thickness_units=thickness)
    if simple:
        finder(draw, left + unit * 14, top + unit * 14, unit, thickness_units=thickness)
    else:
        swap_arrows(draw, left + unit * 17.5, top + unit * 17.5, unit)

    return layer


def build_icon(size, *, inset_ratio=0.165, rounded=False, simple=False):
    canvas = size * SUPERSAMPLE
    image = gradient((canvas, canvas)).convert("RGBA")
    image.alpha_composite(draw_mark(canvas, inset_ratio, simple=simple))

    if rounded:
        mask = Image.new("L", (canvas, canvas), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, canvas - 1, canvas - 1], radius=canvas * 0.2237, fill=255
        )
        image.putalpha(mask)

    return image.resize((size, size), Image.LANCZOS)


def build_splash(size):
    width, height = size
    image = gradient((width, height)).convert("RGBA")
    mark_size = round(min(width, height) * 0.30)
    mark = draw_mark(mark_size * SUPERSAMPLE, 0.0).resize(
        (mark_size, mark_size), Image.LANCZOS
    )
    image.alpha_composite(
        mark, ((width - mark_size) // 2, (height - mark_size) // 2)
    )
    return image.convert("RGB")


def main():
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    SPLASH_DIR.mkdir(parents=True, exist_ok=True)

    for size in ICON_SIZES:
        build_icon(size).save(ICON_DIR / f"icon-{size}.png")

    for size in FAVICON_SIZES:
        build_icon(size, inset_ratio=0.10, simple=True).save(ICON_DIR / f"icon-{size}.png")

    # Maskable icons get a wider margin so a circular or squircle crop cannot
    # clip the mark.
    build_icon(512, inset_ratio=0.26).save(ICON_DIR / "maskable-512.png")
    build_icon(192, inset_ratio=0.26).save(ICON_DIR / "maskable-192.png")

    # iOS home-screen icons are not masked, so they carry their own corners.
    build_icon(180, rounded=False).save(ICON_DIR / "apple-touch-icon.png")

    build_icon(32, inset_ratio=0.10, simple=True).save(
        ICON_DIR / "favicon.ico", sizes=[(16, 16), (32, 32)]
    )

    for size in SPLASH_SIZES:
        build_splash(size).save(SPLASH_DIR / f"splash-{size[0]}x{size[1]}.png")

    print(f"icons  -> {ICON_DIR.relative_to(ROOT)} ({len(ICON_SIZES) + 6} files)")
    print(f"splash -> {SPLASH_DIR.relative_to(ROOT)} ({len(SPLASH_SIZES)} files)")


if __name__ == "__main__":
    main()
