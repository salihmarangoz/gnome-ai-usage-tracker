# Changelog

All notable changes to this extension. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Versions are the `version-name` in `metadata.json`, shown under Settings →
About. extensions.gnome.org also gives every upload its own number (1, 2, 3, …).
Add changes under **Unreleased** as you make them; `make release VERSION=x.y`
turns that section into a dated release.

## [Unreleased]

### Added

- Top bar indicator with the Claude Code and Codex plan limits (5-hour and
  weekly windows), using the logins of the command line tools.
- Menu with a usage bar and reset time for every limit. Claude bars are
  orange, Codex bars blue; bars turn yellow at 70% and red at 90% used.
- Settings in three tabs (Services, Appearance, About):
  - Per service: top bar and menu, top bar only, menu only, or disabled.
  - Per service display: usage (bars fill up) or remaining (bars empty).
  - Per service top bar limits: 5-hour, weekly, or both (`19%/18%`).
  - Per service bar colour.
  - Top bar: service names, usage text and small bars (one per limit, the
    5-hour limit on top) can each be turned on or off; bar length and
    thickness sliders.
  - Always Show App Icon, off by default. The icon (a stock gauge from the
    icon theme, or a question mark if the theme has none) also appears
    whenever the top bar has nothing else to show.
  - Refresh interval per service: Claude 5 to 120 minutes, Codex 1 to 120,
    10 by default.
  - About section with version, links and license.
- Written in TypeScript; the zip contains the compiled JavaScript.
- GitHub releases with a ready-to-install zip.
