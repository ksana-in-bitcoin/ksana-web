#!/usr/bin/env python3
"""
Heading font subset: keeps only the Han characters and punctuation that appear in the Simplified Chinese UI (plus the full Latin-1 range,
for English and Spanish headings) and compresses Noto Serif SC SemiBold into two small WOFF2 files: its Latin letters and general
punctuation (`ksana-serif-latin.woff2`, about 16 KiB) and its Han characters with the CJK punctuation (`ksana-serif-han.woff2`, about
105 KiB). base.css gives each file its code points, so a browser downloads the Han file only for a heading with Han text in it: an
English page, and the wordmark in every language, take the Latin file alone. Headings in Traditional Chinese, Japanese and Korean use
their own system fonts (the Han glyph shapes differ, see tokens.css).

Why: Song (serif) headings are part of the design (docs/WEB_DESIGN.md), but most phones and Linux systems have no Song typeface,
and the whole of Noto Serif SC is too big (about 15 MB per weight). The UI copy is fixed, about 600 Han characters, and the two files are about 120 KB together.
Characters in dynamic content that the subset does not cover fall back glyph by glyph to the system Song font, without affecting the display.

The character list is not written to the repository (it would only repeat the Simplified Chinese copy); the script prints how many
characters each file holds.

Usage (re-run after adding Han characters to the UI copy):
  python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli
  curl -o /tmp/NotoSerifSC-SemiBold.ttf "$(curl -s 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600' | sed -n 's/.*url(\\(.*\\.ttf\\)).*/\\1/p')"
  /tmp/fontenv/bin/python scripts/subset-font.py /tmp/NotoSerifSC-SemiBold.ttf

The font is released under the SIL Open Font License 1.1; the license is in src/assets/fonts/OFL.txt.
"""

import pathlib
import sys

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'assets' / 'fonts'
# The Han file starts here; below it are the Latin letters and the general punctuation (base.css splits the two faces the same way)
HAN_FROM = 0x3000


def wanted(ch: str) -> bool:
    o = ord(ch)
    return (
        0x3000 <= o <= 0x303F  # CJK punctuation
        or 0x3400 <= o <= 0x9FFF  # Han characters
        or 0xFF00 <= o <= 0xFFEF  # full-width punctuation
        or 0x2010 <= o <= 0x2027  # dashes, ellipsis, quotation marks
        or o in (0x00B7, 0x00D7, 0x2192, 0x2190, 0x2032)
    )


def source_files():
    """Sources of the Simplified Chinese text: the message directories of the other languages do not count (their Han glyph shapes differ and they do not use this font)"""
    i18n = ROOT / 'src' / 'i18n'
    for path in [*ROOT.glob('src/**/*.ts'), *ROOT.glob('src/**/*.tsx'), *ROOT.glob('src/**/*.css'), ROOT / 'index.html', ROOT / 'scripts' / 'inline-artifact.mjs']:
        rel = path.relative_to(i18n).parts if path.is_relative_to(i18n) else None
        if rel and len(rel) > 1 and rel[0] != 'zh-CN':
            continue
        yield path


def save(text: str, target: pathlib.Path) -> pathlib.Path:
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['kern', 'locl', 'vert', 'vrt2', 'palt', 'halt']
    options.name_IDs = ['*']
    options.notdef_outline = True
    font = subset.load_font(sys.argv[1], options)
    sub = subset.Subsetter(options)
    sub.populate(text=text)
    sub.subset(font)
    subset.save_font(font, str(target), options)
    return target


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    # ASCII and Latin-1 (English and Spanish headings), plus the Han characters and punctuation used by the Simplified Chinese UI
    chars = set(chr(c) for c in range(0x20, 0x7F)) | set(chr(c) for c in range(0xA1, 0x100)) | set('€‘’“”–—…')
    for path in source_files():
        chars.update(ch for ch in path.read_text(encoding='utf8') if wanted(ch))
    OUT.mkdir(parents=True, exist_ok=True)
    latin = ''.join(sorted(ch for ch in chars if ord(ch) < HAN_FROM))
    han = ''.join(sorted(ch for ch in chars if ord(ch) >= HAN_FROM))
    for text, name in ((latin, 'ksana-serif-latin.woff2'), (han, 'ksana-serif-han.woff2')):
        target = save(text, OUT / name)
        print(f'{target.relative_to(ROOT)}: {len(text)} characters, {target.stat().st_size / 1024:.0f} KiB')
    # the single file of earlier versions
    (OUT / 'ksana-serif.woff2').unlink(missing_ok=True)


if __name__ == '__main__':
    main()
