#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Prints the CHANGELOG.md section of one version, for the GitHub release.

    python3 tools/release_notes.py 1.1
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

if len(sys.argv) != 2:
    sys.exit('usage: tools/release_notes.py VERSION')
version = sys.argv[1]

changelog = (ROOT / 'CHANGELOG.md').read_text()
section = re.search(rf'^## \[{re.escape(version)}\][^\n]*\n(.*?)(?=^## |\Z)', changelog, re.M | re.S)
if not section:
    sys.exit(f'{version} is not in CHANGELOG.md')
print(section.group(1).strip())
