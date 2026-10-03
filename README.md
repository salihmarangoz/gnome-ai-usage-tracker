# AI Usage Tracker

A GNOME Shell extension that shows how much of your **Claude Code** and
**Codex** plan limits you have used, right in the top bar.

![Menu screenshot](docs/screenshot.png)

- Top bar shows the most used limit of each service, e.g. `Claude 16%  Codex 0%`
- The menu shows every limit window (5-hour, weekly) with a bar and the time
  it resets. Claude bars are orange, Codex bars blue; they turn yellow at 70%
  and red at 90% used
- Settings:
  - for each service: top bar and menu, top bar only, menu only, or off
  - show usage (bars fill up) or what is remaining (bars empty)
  - show or hide the icon (a stock gauge icon from your icon theme)
  - refresh interval per service: Claude 5 to 120 minutes, Codex 1 to 120
    (default 10)
  - About: version, changelog and links

Supports GNOME Shell 46 – 50.

## Requirements

You need to be signed in with a subscription in the command line tools:

| Service     | Sign in with                 | File the extension reads       |
| ----------- | ---------------------------- | ------------------------------ |
| Claude Code | `claude` → `/login`          | `~/.claude/.credentials.json`  |
| Codex       | `codex login` (with ChatGPT) | `~/.codex/auth.json`           |

`CLAUDE_CONFIG_DIR` and `CODEX_HOME` are respected if they are set in the
environment of GNOME Shell.

API key logins have no plan limits, so there is nothing to show for them.

## Installation

### From extensions.gnome.org

Not available. I have decided not to upload this extension to
[extensions.gnome.org](https://extensions.gnome.org). Its
[review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
say:

> Extensions must not be AI-generated. While it is **not** prohibited to use
> AI as a learning aid or a development tool (i.e. code completions),
> extension developers should be able to justify and explain the code they
> submit, within reason.

Most of this extension was written by an AI coding assistant (see
[AI Disclosure](#ai-disclosure)), so it does not belong there. It is only
distributed from this repository.

### From source

Needs Node.js and npm (the extension is written in TypeScript).

```sh
git clone https://github.com/salihmarangoz/gnome-ai-usage-tracker.git
cd gnome-ai-usage-tracker
make install
```

Then restart GNOME Shell (on X11 press <kbd>Alt</kbd>+<kbd>F2</kbd>, type `r`,
press <kbd>Enter</kbd>; on Wayland log out and back in) and enable it:

```sh
gnome-extensions enable ai-usage-tracker@salihmarangoz.github.io
```

## Privacy

- The extension reads the OAuth access token that the CLI already stored on
  your computer and sends it **only** to the service that issued it:
  `api.anthropic.com` for Claude Code and `chatgpt.com` for Codex.
- Tokens are never written, refreshed or stored anywhere else. If a token has
  expired, run the CLI once and it will refresh it.
- No other network requests, no telemetry.

To report a security problem, see [SECURITY.md](SECURITY.md).

The usage endpoints are the ones the official apps use. They are not a public
API and may change without notice, which would break the extension until it is
updated.

## Troubleshooting

| Message in the menu      | What to do                                              |
| ------------------------ | ------------------------------------------------------- |
| Not signed in            | Sign in with the CLI (see Requirements)                 |
| Login expired, run the CLI once to refresh it | Start `claude` or `codex` once         |
| Too many requests, try again in a few minutes | Claude throttles this endpoint; wait or raise the refresh interval |
| Request failed (HTTP …)  | The service is down or changed its API; try again later |

Logs: `journalctl -f -o cat /usr/bin/gnome-shell`

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Changes are listed in
[CHANGELOG.md](CHANGELOG.md).

## AI Disclosure

This extension was written with substantial help from an AI coding assistant.
[Claude Code](https://claude.com/claude-code) (Anthropic, model Claude Opus 5.5)
generated most of the code, the documentation and this README from the
maintainer's instructions. The maintainer reviews and tests every change and
is responsible for everything that is released. Because of this, the extension
is not published on extensions.gnome.org (see [Installation](#installation)).

## License

[MIT](LICENSE)

Claude and Claude Code are trademarks of Anthropic. Codex and ChatGPT are
trademarks of OpenAI. This project is not affiliated with or endorsed by
either company.
