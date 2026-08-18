#!/usr/bin/env python3
"""Render the raster favicons from `web/app/icon.svg`.

**Why rasters exist at all when an SVG icon is already served.** Google's
search-result favicon is fetched by its own crawler, and that pipeline reaches
for `/favicon.ico` and `apple-touch-icon` before it will settle for anything
else. Serving only `app/icon.svg` — which Next emits at a cache-busted
`/icon.svg?<hash>` — left `https://www.normascope.com/favicon.ico` returning a
404 HTML page, and the result listing showed the generic globe. These two files
are what that crawler actually looks for.

**Why the glyph is outlined first.** The tile is the letter `n` set in
`-apple-system`. That resolves to SF Pro in a browser on a Mac and to whatever
a Linux rasteriser happens to have anywhere else, so rendering the `<text>`
directly would bake in a fallback face. `outline_svg_text.py` traces the real
glyph to a path, and the raster is made from that.

Run after any change to `web/app/icon.svg`:

    python3 scripts/build-favicons.py

Needs `rsvg-convert` (brew install librsvg), `pango-view` (brew install pango)
and Pillow. Outputs are committed; this is not part of the build.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'web' / 'app' / 'icon.svg'
ICO = ROOT / 'web' / 'app' / 'favicon.ico'
APPLE = ROOT / 'web' / 'app' / 'apple-icon.png'

# Google asks for a square that is a multiple of 48px, so 48 is the entry that
# matters to search; 16 and 32 are what a browser tab actually draws. Rendering
# each from the vector beats resampling one big frame down.
ICO_SIZES = (16, 32, 48)

# The size iOS asks for. It applies its own rounded mask on top, which is why
# the transparent corners of the tile get filled below rather than left alone —
# unfilled, they render black behind Apple's smaller corner radius.
APPLE_SIZE = 180

TILE = '#a8736e'


def largest_frame_first(ico: Path) -> None:
    """Reorder the ICO's directory so the 48px entry is listed first.

    Pillow writes the entries smallest-first, and Next reads only the first one
    to fill in `sizes` on the `<link>` — so a file that really carries 16, 32
    and 48 was being advertised as `sizes="16x16"`, telling a client wanting a
    48px icon that this file has nothing for it. The directory is a 6-byte
    header then one 16-byte entry per frame, each holding its own offset into
    the file, so shuffling the entries needs no image data to move.
    """
    blob = bytearray(ico.read_bytes())
    count = int.from_bytes(blob[4:6], 'little')
    start, end = 6, 6 + count * 16
    entries = [blob[i:i + 16] for i in range(start, end, 16)]
    # Width is byte 0, where 0 encodes 256.
    entries.sort(key=lambda e: e[0] or 256, reverse=True)
    blob[start:end] = b''.join(entries)
    ico.write_bytes(blob)


def render(svg: Path, size: int, out: Path) -> Image.Image:
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), str(svg), '-o', str(out)],
                   check=True)
    return Image.open(out).convert('RGBA')


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        outlined = tmp / 'tile.svg'
        subprocess.run([sys.executable, str(ROOT / 'scripts' / 'outline_svg_text.py'),
                        str(SOURCE), str(outlined)], check=True)

        frames = [render(outlined, size, tmp / f'{size}.png') for size in ICO_SIZES]
        largest = frames[-1]
        largest.save(ICO, format='ICO', sizes=[(s, s) for s in ICO_SIZES],
                     append_images=frames[:-1])
        largest_frame_first(ICO)

        apple = render(outlined, APPLE_SIZE, tmp / 'apple.png')
        flattened = Image.new('RGB', apple.size, TILE)
        flattened.paste(apple, mask=apple.split()[3])
        flattened.save(APPLE, format='PNG', optimize=True)

    print(f'{ICO.relative_to(ROOT)}  {ICO.stat().st_size} bytes  {ICO_SIZES}')
    print(f'{APPLE.relative_to(ROOT)}  {APPLE.stat().st_size} bytes  {APPLE_SIZE}px')


if __name__ == '__main__':
    main()
