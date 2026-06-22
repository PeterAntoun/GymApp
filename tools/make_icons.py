#!/usr/bin/env python3
"""Generate app icons with no third-party deps (stdlib zlib only).

Draws a rounded dark tile with a blue dumbbell. Run from repo root:
    python3 tools/make_icons.py
"""
import os
import struct
import zlib

BG = (10, 12, 16)        # app background
TILE = (20, 23, 31)      # rounded tile
ACCENT = (108, 124, 246) # dumbbell (blue/violet blend)


def rounded_rect_mask(size, inset, radius):
    """Return a function (x, y) -> bool inside a rounded rect."""
    lo, hi = inset, size - inset
    r = radius

    def inside(x, y):
        if x < lo or x >= hi or y < lo or y >= hi:
            return False
        # corners
        for cx, cy in ((lo + r, lo + r), (hi - r, lo + r),
                       (lo + r, hi - r), (hi - r, hi - r)):
            if ((x < lo + r and y < lo + r and (cx, cy) == (lo + r, lo + r)) or
                (x >= hi - r and y < lo + r and (cx, cy) == (hi - r, lo + r)) or
                (x < lo + r and y >= hi - r and (cx, cy) == (lo + r, hi - r)) or
                (x >= hi - r and y >= hi - r and (cx, cy) == (hi - r, hi - r))):
                if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
                    return False
        return True
    return inside


def make_png(size, path):
    px = [[BG[0], BG[1], BG[2]] for _ in range(size * size)]

    def setpx(x, y, c):
        if 0 <= x < size and 0 <= y < size:
            i = y * size + x
            px[i] = [c[0], c[1], c[2]]

    # rounded tile
    tile_inside = rounded_rect_mask(size, int(size * 0.06), int(size * 0.22))
    for y in range(size):
        for x in range(size):
            if tile_inside(x, y):
                setpx(x, y, TILE)

    # dumbbell geometry (centered)
    cx = cy = size / 2
    bar_h = size * 0.10
    bar_w = size * 0.44
    # bar
    for y in range(int(cy - bar_h / 2), int(cy + bar_h / 2)):
        for x in range(int(cx - bar_w / 2), int(cx + bar_w / 2)):
            setpx(x, y, ACCENT)
    # plates (two each side)
    plate_specs = [
        (bar_w * 0.50, size * 0.30, size * 0.085),   # inner plates
        (bar_w * 0.66, size * 0.40, size * 0.085),   # outer plates
    ]
    for off, ph, pw in plate_specs:
        for sign in (-1, 1):
            px0 = cx + sign * off - pw / 2
            for y in range(int(cy - ph / 2), int(cy + ph / 2)):
                for x in range(int(px0), int(px0 + pw)):
                    setpx(x, y, ACCENT)

    write_png(path, size, size, px)


def write_png(path, w, h, px):
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter type 0
        for x in range(w):
            r, g, b = px[y * w + x]
            raw += bytes((r, g, b))
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        c += struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        return c

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8-bit, truecolor
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", compressed))
        f.write(chunk(b"IEND", b""))


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out, exist_ok=True)
    make_png(192, os.path.join(out, "icon-192.png"))
    make_png(512, os.path.join(out, "icon-512.png"))
    make_png(180, os.path.join(out, "apple-touch-icon.png"))
    print("Icons written to", os.path.abspath(out))
