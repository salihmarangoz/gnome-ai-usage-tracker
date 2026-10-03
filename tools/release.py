#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Starts a release: sets the version and dates the changelog.

The version shown to users is `version-name` in metadata.json.

    python3 tools/release.py 1.1
"""

import datetime
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

if len(sys.argv) != 2:
    sys.exit('usage: tools/release.py VERSION')
version = sys.argv[1]

changelog_path = ROOT / 'CHANGELOG.md'
changelog = changelog_path.read_text()
if f'## [{version}]' in changelog:
    sys.exit(f'{version} is already in CHANGELOG.md')
heading = f'## [Unreleased]\n\n## [{version}] - {datetime.date.today()}'
changelog_path.write_text(changelog.replace('## [Unreleased]', heading, 1))

metadata_path = ROOT / 'metadata.json'
metadata = json.loads(metadata_path.read_text())
metadata['version-name'] = version
metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + '\n')

print(f'Version {version}. Check CHANGELOG.md, then commit, tag v{version} and push.')
