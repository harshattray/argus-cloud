#!/usr/bin/env python3
import html
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET


PANGO_WEIGHT = {
    '100': 'Thin', '200': 'Ultralight', '300': 'Light', '400': 'Regular',
    'normal': 'Regular', '500': 'Medium', '600': 'Semibold', '700': 'Bold',
    'bold': 'Bold', '800': 'Ultrabold', '900': 'Heavy',
}


def attrs(s):
    return {name: (double or single) for name, double, single in re.findall(r'([\w:-]+)=(?:"([^"]*)"|\'([^\']*)\')', s)}


def pango_paths(text, font, letter_spacing=0):
    markup = html.escape(text)
    if letter_spacing:
        markup = f'<span letter_spacing="{int(round(letter_spacing * 1024))}">{markup}</span>'
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / 'glyphs.svg'
        cmd = ['pango-view', '--no-display', '--pixels', '--markup', '--font', font,
               '--text', markup, '--output', str(out)]
        env = os.environ.copy()
        # Derived from this file's location, not hard-coded to one checkout.
        # The config is optional: it only exists to add `.font-cache/` (the
        # brand faces that are not installed system-wide) to fontconfig's
        # search path, and the system faces resolve without it.
        fontconfig = Path(__file__).resolve().parent.parent / '.font-cache' / 'fonts.conf'
        if fontconfig.exists():
            env['FONTCONFIG_FILE'] = str(fontconfig)
        subprocess.run(cmd, check=True, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        root = ET.parse(out).getroot()
        path_by_id = {}
        for p in root.iter('{http://www.w3.org/2000/svg}path'):
            parent = next((e for e in root.iter() if p in list(e)), None)
            if parent is not None and parent.attrib.get('id'):
                path_by_id[parent.attrib['id']] = p.attrib['d']
        uses = []
        for u in root.iter('{http://www.w3.org/2000/svg}use'):
            href = u.attrib.get('{http://www.w3.org/1999/xlink}href', u.attrib.get('href', ''))
            uses.append((path_by_id[href.lstrip('#')], float(u.attrib.get('x', 0)), float(u.attrib.get('y', 0))))
        baseline = uses[0][2] if uses else 0
        first_x = uses[0][1] if uses else 0
        natural_width = max(1.0, float(root.attrib.get('width', '1')) - first_x - 10.0)
        return [(d, x - first_x, y - baseline) for d, x, y in uses], natural_width


def replace_texts(svg):
    pattern = re.compile(r'<text\b([^>]*)>(.*?)</text>', re.S)

    def repl(m):
        a = attrs(m.group(1))
        text = re.sub(r'<[^>]+>', '', m.group(2))
        x = float(a.get('x', 0))
        y = float(a.get('y', 0))
        size = float(a.get('font-size', 16))
        family = a.get('font-family', 'sans-serif').split(',')[0].strip(" '\"")
        if family == '-apple-system':
            family = '.SF NS'
        elif family in ('ui-monospace', 'SFMono-Regular'):
            family = '.SF NS Mono'
        # Pango parses a font description as words, not CSS: a numeric weight is
        # not a token it knows, so ".SF NS 700 40px" silently outlines at
        # Regular and the traced glyph comes out lighter than the browser draws
        # it. Translate to the style names Pango does recognise.
        weight = PANGO_WEIGHT.get(str(a.get('font-weight', '400')), 'Regular')
        ls = float(str(a.get('letter-spacing', 0)).replace('px', ''))
        font = f'{family} {weight} {size}px'
        glyphs, natural_width = pango_paths(text, font, ls)
        # The Normascope SVGs place the salmon fill on the parent <g>, not
        # directly on the <text> node. That inherited color is the intended
        # default when a text node has no explicit fill.
        fill = a.get('fill', '#a8736e')
        opacity = a.get('fill-opacity')
        anchor = a.get('text-anchor', 'start')
        # Pango's measured width is represented by the final glyph extent; use
        # textLength when supplied so the outlined word keeps the original fit.
        sx = 1.0
        if a.get('textLength'):
            sx = float(a['textLength']) / natural_width
        # For centered text, use the original textLength when present.
        if anchor == 'middle':
            target = float(a.get('textLength', natural_width))
            x -= target / 2
        parts = []
        for d, gx, gy in glyphs:
            parts.append(f'<path d="{html.escape(d, quote=True)}" transform="translate({x:.4f},{y:.4f}) scale({sx:.8f},1) translate({gx:.4f},{gy:.4f})" fill="{html.escape(fill, quote=True)}"' + (f' fill-opacity="{opacity}"' if opacity else '') + '/>')
        return '<g aria-label="' + html.escape(text, quote=True) + '">' + ''.join(parts) + '</g>'

    return pattern.sub(repl, svg)


def main():
    if len(sys.argv) != 3:
        raise SystemExit('usage: outline_svg_text.py input.svg output.svg')
    src, dst = map(Path, sys.argv[1:])
    svg = src.read_text()
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(replace_texts(svg))


if __name__ == '__main__':
    main()
