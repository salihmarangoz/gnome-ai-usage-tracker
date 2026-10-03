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
- Settings:
  - Per service: top bar and menu, top bar only, menu only, or off.
  - Display: show usage (bars fill up) or remaining (bars empty).
  - Show Icon. The icon is a stock gauge from the icon theme, or a question
    mark if the theme has none.
  - Refresh interval per service: Claude 5 to 120 minutes, Codex 1 to 120,
    10 by default.
  - About section with version, links and license.
- Written in TypeScript; the zip contains the compiled JavaScript.
