# Writes docs/icon-180.png, icon-192.png, icon-512.png — a pixel "T" over a sea gradient.
#   python3 tools/icons.py
import os, struct, zlib

ROOT = os.path.join(os.path.dirname(__file__), '..', 'docs')
GRID = 16
TOP, BOTTOM = (29, 85, 128), (5, 10, 20)
PINK, CYAN, WHITE = (255, 93, 143), (77, 227, 255), (255, 255, 255)

def glyph(x, y):
    return (3 <= y <= 4 and 3 <= x <= 12) or (5 <= y <= 12 and 7 <= x <= 8)

def cell(x, y):
    if glyph(x, y): return WHITE
    if glyph(x + 1, y): return PINK   # pink shadow to the left
    if glyph(x - 1, y): return CYAN   # cyan shadow to the right
    t = y / (GRID - 1)
    return tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM))

def png(size, path):
    rows = []
    for py in range(size):
        y = py * GRID // size
        row = bytearray([0])
        for px in range(size):
            row += bytes(cell(px * GRID // size, y))
        rows.append(bytes(row))
    raw = zlib.compress(b''.join(rows), 9)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', raw) + chunk(b'IEND', b'')
    with open(path, 'wb') as f: f.write(data)

os.makedirs(ROOT, exist_ok=True)
for s in (180, 192, 512):
    png(s, os.path.join(ROOT, f'icon-{s}.png'))
print('icons written')
