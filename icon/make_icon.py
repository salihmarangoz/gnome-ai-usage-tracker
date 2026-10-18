#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Draws the folder icon: the Claude Code mascot looking up at two usage
bars, the 5-hour one full (critical red, as in the menu) and the weekly one
part used, with a cartoon anger mark.

    python3 icon/make_icon.py    # writes icon/icon.svg, and icon/icon.png if inkscape exists
    gio set . metadata::custom-icon file://$PWD/icon/icon.png

Only the standard library.
"""

import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
SIZE = 512
CELL = 18                     # px per mascot pixel

TILE = "#11142B"
TRACK = "#3A3F55"
CLAUDE = "#D97757"            # claude-color default
CRITICAL = "#E01B24"          # .ai-usage-bar-fill.critical
ANGER = "#F66151"


def rect(x, y, w, h, color, rx=0):
    return f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" rx="{rx:g}" fill="{color}"/>'


def bar(y, used, color):
    w, h = 336, 32
    x = (SIZE - w) / 2
    return [rect(x, y, w, h, TRACK, h / 2), rect(x, y, w * used, h, color, h / 2)]


def mascot(cx, bottom):
    """The banner mascot on a grid of CELL: 12 x 8 body, arms, four legs.
    The eyes sit at the top of the face, so it looks up."""
    ox, oy = cx - 6 * CELL, bottom - 10 * CELL

    def cells(c, r, w, h, color):
        return rect(ox + c * CELL, oy + r * CELL, w * CELL, h * CELL, color)

    out = [cells(0, 0, 12, 8, CLAUDE), cells(-2, 4, 2, 2, CLAUDE), cells(12, 4, 2, 2, CLAUDE)]
    out += [cells(c, 8, 1, 2, CLAUDE) for c in (1, 3, 8, 10)]
    out += [cells(c, 0.5, 1, 2, TILE) for c in (2, 9)]
    return out


def anger(cx, cy, r, width):
    """Four curved corners, bent towards the centre: the cartoon anger mark,
    turned 30 degrees."""
    out = []
    for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        x0, y0 = cx + sx * r / 4, cy + sy * r
        x1, y1 = cx + sx * r / 4, cy + sy * r / 4
        x2, y2 = cx + sx * r, cy + sy * r / 4
        out.append(f'<path d="M {x0:g} {y0:g} Q {x1:g} {y1:g} {x2:g} {y2:g}" fill="none" '
                   f'stroke="{ANGER}" stroke-width="{width}" stroke-linecap="round"/>')
    return f'<g transform="rotate(30 {cx:g} {cy:g})">{"".join(out)}</g>'


def icon():
    out = [rect(0, 0, SIZE, SIZE, TILE, 112)]
    out += bar(88, 1.0, CRITICAL)
    out += bar(148, 0.45, CLAUDE)
    out += mascot(SIZE / 2, 428)
    # Next to the top right corner of the head, clear of the weekly bar.
    out.append(anger(424, 244, 48, 17))
    return out


def main():
    svg = HERE / "icon.svg"
    body = "\n".join(icon())
    svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" '
                   f'viewBox="0 0 {SIZE} {SIZE}">\n{body}\n</svg>\n')
    print(svg)
    if shutil.which("inkscape"):
        png = HERE / "icon.png"
        subprocess.run(["inkscape", str(svg), "-w", "512", "-h", "512", "-o", str(png)],
                       check=True, capture_output=True)
        print(png)


if __name__ == "__main__":
    main()
