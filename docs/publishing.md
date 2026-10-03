# Publishing to extensions.gnome.org

## Steps

1. `make release VERSION=x.y` sets `version-name` in `metadata.json`, turns
   the Unreleased section of `CHANGELOG.md` into a dated release and runs
   the linter, which must report `clean`. (EGO also numbers every upload
   itself; that number is separate.)
2. Commit and tag the release (`git tag vx.y`).
3. Test on the GNOME versions listed in `shell-version`.
4. Upload `dist/ai-usage-tracker@salihmarangoz.github.io.shell-extension.zip`
   at <https://extensions.gnome.org/upload/>.
5. On the extension page, set the screenshot to `docs/screenshot.png`.
6. Wait for the review email. Reviewers may ask questions about the code; you
   must be able to explain every line (see AI policy below).

## License

MIT is accepted. The guidelines require a license compatible with
`GPL-2.0-or-later`; MIT is. By uploading you agree that GNOME may distribute
the extension under GPL-compatible terms.

## Review guideline checklist

Source: <https://gjs.guide/extensions/review-guidelines/review-guidelines.html>

| Rule | Status |
| --- | --- |
| Nothing created before `enable()` | Only `Gio._promisify` at module level (standard pattern from gjs.guide) |
| Objects destroyed, signals disconnected, sources removed in `disable()` | Indicator destroyed; `connectObject(..., this)` auto-disconnects; both timeouts removed; requests cancelled; `Soup.Session.abort()` |
| No deprecated modules (`Lang`, `Mainloop`, `ByteArray`) | ✓ |
| No GTK/Adw in shell, no St/Clutter in prefs | ✓ |
| Readable, not minified; TypeScript transpiled to well-formatted JavaScript | `tsc` output (ES2022) from `src/*.ts`; sources linked via `url` |
| No excessive logging | No logging at all |
| No binaries, no subprocesses | ✓ |
| No telemetry | ✓ Only requests to the services that issued the tokens |
| `metadata.json`: uuid format, no `version`, no unused `session-modes`/`donations` | ✓ |
| `shell-version`: only released versions | 46 – 50 (shexli rejects > 50) |
| Schema id/path under `org.gnome.shell.extensions`, XML in zip, file named `<id>.gschema.xml` | ✓ No compiled schemas in the zip |
| No unnecessary files, no build scripts, no `.po` | Zip has only the runtime files + LICENSE |
| No trademarked logos | ✓ No custom artwork; stock theme icon only; service names only describe what is tracked |
| Preferences follow GNOME HIG | libadwaita rows |

## AI policy

The guidelines say:

> Extensions must not be AI-generated. While it is **not** prohibited to use
> AI as a learning aid or a development tool (i.e. code completions),
> extension developers should be able to justify and explain the code they
> submit, within reason. Submissions with large amounts of unnecessary code,
> inconsistent code style, imaginary API usage, comments serving as LLM
> prompts, or other indications of AI-generated output will be rejected.

This project discloses AI assistance in the README. Before every upload the
maintainer must read and understand all code in the zip, and keep it free of
the patterns listed above. Rejection is possible regardless.
